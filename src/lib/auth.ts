import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

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
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim().toLowerCase();
        const password = credentials?.password;
        if (!username || !password) return null;

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
