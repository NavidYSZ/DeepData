# Keyword Workspace V1 Preclustering Specification

## 1. Purpose

This document defines the deterministic preclustering algorithm for V1.

Constraints:
- no LLM inference
- no external embedding API
- reproducible output from same input and algo version

Primary objective:
- high-quality preclusters that minimize manual rework

## 1.1 Library Decision (Confirmed)

V1 graph clustering implementation:
- `graphology`
- `graphology-communities-louvain`

Reason:
- stable and battle-tested TS graph primitives
- faster delivery than custom community implementation
- reproducibility can still be enforced by fixed preprocessing order, fixed parameters, and stable tie-break sorting

## 2. Inputs and Outputs

## 2.1 Inputs

Per project:
- canonical keyword list with `kw_raw`
- standardized demand values (`demand_monthly`)
- locale defaults (`de-DE`)

## 2.2 Outputs

For each run:
- `algo_version`
- `preclusters` with:
  - label
  - total_demand
  - cohesion
  - keyword_count
- membership mapping `keyword -> precluster` with score
- review flags for low quality clusters

## 3. Determinism Guarantees

Determinism must be ensured by:
- fixed preprocessing order
- fixed stopword/stemming dictionaries by version
- fixed feature weights
- fixed kNN parameters
- fixed graph community parameters
- fixed seed value
- stable sort tie-breakers

Algorithm version format:
- `lex-charstem-v1`

Any change in preprocessing/token rules/weights/thresholds increments version.

## 4. Preprocessing Pipeline

For each keyword `kw_raw`:

1. Unicode normalize (NFKC)
2. lowercase
3. trim and collapse whitespace
4. punctuation cleanup (keep alphanumeric and internal separators where needed)
5. tokenize by whitespace/hyphen/slash
6. remove German stopwords (versioned list)
7. stem tokens with German stemmer
8. build:
   - `kw_norm` as normalized plain string
   - `kw_sig` as sorted stem signature

Quality rule:
- if normalized string is empty after preprocessing, row is marked invalid and excluded from clustering.

## 5. Feature Construction

Two lexical feature spaces are required.

## 5.1 Char N-gram TF-IDF

- analyzer: character n-grams
- n range: 3..5
- source text: `kw_norm`

Purpose:
- robustness to typos and orthographic variants

## 5.2 Stem Token TF-IDF

- analyzer: token stems
- source text: `kw_sig`

Purpose:
- semantic stem-level proximity

## 5.3 Weighted Similarity Space

Combined similarity score:
- `score = 0.7 * cosine(charSpace) + 0.3 * cosine(stemSpace)`

Default weights are fixed in V1.

## 6. Similarity Graph Construction

## 6.1 kNN

For each keyword node:
- compute top `k=20` nearest neighbors by combined score

## 6.2 Edge Rules

Create undirected edge if:
- neighbor relation exists
- similarity score `>= 0.55`

Edge weight:
- combined similarity score

## 6.3 Scalability Constraints

Avoid full O(n^2) pairwise matrix.

For larger datasets:
- batch and approximate neighbor lookup allowed if deterministic ordering preserved.

## 7. Community Clustering

Method:
- weighted graph community detection via Louvain using `graphology-communities-louvain`
- fixed random seed and resolution parameter in config

Config defaults:
- `seed = 42`
- `resolution = 1.0`

Any config change requires `algo_version` bump.

## 8. Cluster Labeling

For each cluster:
1. collect top 10 members by `demand_monthly`
2. compute medoid candidate by average intra-cluster similarity
3. label = medoid keyword text
4. fallback = highest-demand keyword if medoid calc ties/invalid

## 9. Metrics

## 9.1 Total Demand

`total_demand = sum(demand_monthly of all members)`

## 9.2 Cohesion

`cohesion = average pairwise similarity of members within cluster`

For clusters with size 1:
- cohesion = 1.0 by definition

## 9.3 Review Flags

Flag cluster if:
- `cohesion < 0.35`
- `keyword_count > 150`

Flags are metadata only; they do not block output.

## 10. Rule-based Post-Split

Post-split applies only when review flags trigger.

## 10.1 Modifier-based Splits

Define modifier groups (versioned dictionary):
- informational: `was ist`, `definition`, `bedeutung`, `anleitung`
- commercial: `kosten`, `preis`, `vergleich`, `test`
- transactional/local: `kaufen`, `termin`, `in der nähe`, city terms

If dominant mixed groups exist:
- split into subclusters by modifier group

## 10.2 Geo-based Splits

If keywords contain recognized geo tokens:
- split by city/geo token if split improves cohesion

Split acceptance rule:
- keep split only if weighted average cohesion improves by configured threshold (default +0.08).

## 11. Runtime Targets

Expected runtime targets on typical hardware:
- 5k keywords: <= 30 seconds
- 20k keywords: <= 180 seconds

If target exceeded:
- fallback to deterministic capped-k strategy:
  - reduce neighbor search candidates per token bucket
  - keep same seed and tie-break logic

## 12. Failure and Fallback Strategy

Failure classes:
- input quality failure (no usable keywords)
- process failure (unexpected compute errors)

Fallbacks:
- if clustering fails, persist diagnostic job result and return deterministic error code
- partial write is forbidden: run is atomic at project scope

## 13. Re-run Semantics

Rerun behavior:
- previous precluster run can be archived/replaced by new run
- memberships and metrics always tied to `algo_version` and run timestamp
- UI defaults to newest successful run

## 14. Test Cases

Mandatory algorithm acceptance tests:

1. Determinism
- same dataset + same version -> identical cluster assignments and labels

2. Demand aggregation
- cluster total demand equals exact member sum

3. Label stability
- tie-breaking yields stable label order

4. Cohesion correctness
- known synthetic dataset produces expected cohesion intervals

5. Review flag behavior
- oversize/low-cohesion clusters are flagged

6. Post-split quality
- split only applied when cohesion improvement threshold reached

7. Large dataset fallback
- 20k dataset completes and returns deterministic output

## 15. V2 Extension Hooks (Not Active in V1)

Prepared but unused in V1:
- optional embedding feature channel
- AI suggestion comparison against deterministic baseline
- proposal generation for merge/split actions

These hooks must not alter V1 output unless `algo_version` changes.
