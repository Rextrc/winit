import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { consumeSignupGrant, verifyTurnstile } from "@/lib/turnstile";

declare module "next-auth" {
  interface Session {
    user: { id: string; username: string };
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "WinIt account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Turnstile token", type: "text" },
        signupGrant: { label: "Signup grant", type: "text" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim().toLowerCase();
        const password = credentials?.password;
        if (!username || !password) return null;

        // A fresh signup already proved it's human to verify the account
        // itself; its one-time grant stands in for a second Turnstile round
        // trip on the auto-login that follows. Anything else needs a token.
        const viaSignupGrant = consumeSignupGrant(username, credentials?.signupGrant);
        // Thrown rather than returned so LoginForm can tell "wrong widget
        // token" apart from "wrong password" instead of showing a CAPTCHA
        // failure as a bad-credentials message.
        if (!viaSignupGrant && !(await verifyTurnstile(credentials?.turnstileToken))) {
          throw new Error("captcha_failed");
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        // A soft-deleted or banned account keeps its rows for the audit trail
        // but cannot be signed into. Deliberately the same null as a bad
        // password, so the response does not reveal that the account exists.
        // A suspended account can still sign in — it needs to be able to read
        // the message explaining why it cannot bet.
        if (user.deletedAt || user.bannedAt) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],
  callbacks: {
    // Never bounce a visitor to another host. If NEXTAUTH_URL is ever left
    // pointing at a dev machine, any absolute redirect is reduced to its path
    // so it lands on whatever site the visitor is actually on.
    async redirect({ url }) {
      if (url.startsWith("/")) return url;
      try {
        const u = new URL(url);
        return `${u.pathname}${u.search}${u.hash}` || "/";
      } catch {
        return "/";
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.username = user.name ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: (token.uid as string) ?? "",
        username: (token.username as string) ?? "",
      };
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/** Returns the signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/** Loads the signed-in user row, or null. */
export async function currentUser() {
  const id = await currentUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}
