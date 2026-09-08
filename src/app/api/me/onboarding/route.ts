import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finishing or skipping the first-run explainer.
 *
 * This only ever stamps a timestamp. It grants nothing — the sign-up grant is
 * written by the sign-up route and is the only credit a new account receives —
 * so there is no path from here into the ledger at all.
 */
const schema = z.object({ outcome: z.enum(["completed", "skipped"]) });

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request.");

  // Idempotent: a second call from another tab must not move the timestamp.
  if (!user.onboardedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { onboardedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, outcome: parsed.data.outcome });
}
