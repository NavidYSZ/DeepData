import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, SESSION_VERSION } = getEnv();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: "openid email profile" } }
    })
  ],
  session: {
    strategy: "jwt"
  },
  secret: NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token }) {
      // invalidate older JWTs when SESSION_VERSION is bumped
      const currentVersion = SESSION_VERSION ?? "1";
      if (token.sessionVersion && token.sessionVersion !== currentVersion) {
        return {}; // clears token, forces re-login
      }
      token.sessionVersion = currentVersion;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
