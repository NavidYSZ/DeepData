import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars for aes-256-gcm");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(text: string) {
  const iv = randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string) {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const key = getKey();
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}
