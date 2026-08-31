import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { InsufficientBalanceError } from "@/lib/ledger";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Loads the caller, or returns a 401 response to bail out with. */
export async function requireUser() {
  const id = await currentUserId();
  if (!id) return { user: null as null, response: jsonError("Sign in to play.", 401) };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { user: null as null, response: jsonError("Account not found.", 401) };

  return { user, response: null as null };
}

/** Maps thrown errors onto sensible API responses. */
export function handleError(err: unknown) {
  if (err instanceof InsufficientBalanceError) return jsonError("Not enough balance for that bet.", 409);
  if (err instanceof Error) return jsonError(err.message, 400);
  return jsonError("Something went wrong.", 500);
}
