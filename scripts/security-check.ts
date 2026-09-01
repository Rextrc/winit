/**
 * END-TO-END SECURITY CHECK FOR THE STAFF DASHBOARD
 * ---------------------------------------------------------------------------
 * Everything here is asserted over HTTP against a running server, because the
 * claim being tested is about the server: that authorisation is enforced by
 * the API and not by which buttons the dashboard chose to render. The script
 * never imports a route handler and never sets a role through an admin route —
 * roles are written straight to the database, the way the seed script does it.
 *
 *   npm run dev            (in another shell)
 *   npm run security       (BASE=http://localhost:3000 by default)
 *
 * It creates its own throwaway accounts, prefixed `sec_`, and deletes them at
 * the end.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = "correct-horse-battery-staple";
const PREFIX = `sec${Date.now().toString(36).slice(-5)}`;

let passed = 0;
const failures: string[] = [];

/** JSON.stringify that survives the BigInt money columns. */
function show(v: unknown) {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A cookie jar per signed-in identity. next-auth's session lives in cookies. */
type Session = { id: string; username: string; cookies: Map<string, string> };

function cookieHeader(s: Session) {
  return [...s.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorb(s: Session, res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) s.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function call(s: Session | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (s) headers.set("cookie", cookieHeader(s));
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  if (s) absorb(s, res);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* HTML or empty body — status is what we assert on */
  }
  return { status: res.status, json };
}

async function signUpAndIn(name: string): Promise<Session> {
  const username = `${PREFIX}_${name}`;
  const s: Session = { id: "", username, cookies: new Map() };

  const up = await call(s, "/api/signup", {
    method: "POST",
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (up.status !== 200 && up.status !== 201) {
    throw new Error(`signup failed for ${username}: ${up.status} ${JSON.stringify(up.json)}`);
  }

  const csrfRes = await call(s, "/api/auth/csrf");
  const csrfToken = csrfRes.json?.csrfToken as string;
  const form = new URLSearchParams({ csrfToken, username, password: PASSWORD, json: "true" });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(s) });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers,
    body: form,
    redirect: "manual",
  });
  absorb(s, res);

  const me = await call(s, "/api/me");
  if (me.status !== 200) throw new Error(`sign-in failed for ${username}: /api/me ${me.status}`);
  const row = await prisma.user.findUniqueOrThrow({ where: { username } });
  s.id = row.id;
  return s;
}

async function setRole(s: Session, role: string | null) {
  await prisma.user.update({ where: { id: s.id }, data: { adminRole: role } });
}

/** Reconciles every ledger row for one account against its live balance. */
async function reconcile(userId: string) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  let running = 0n;
  for (const [i, r] of rows.entries()) {
    running += r.payoutCents - r.betCents;
    if (r.balanceAfterCents !== running) {
      return { ok: false, rows: rows.length, at: i, expected: running, found: r.balanceAfterCents };
    }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { ok: user.balanceCents === running, rows: rows.length, expected: running, found: user.balanceCents };
}

const ADMIN_READS = [
  "/api/admin/accounts?q=a",
  "/api/admin/analytics",
  "/api/admin/audit",
  "/api/admin/games",
  "/api/admin/flags",
  "/api/admin/promo",
  "/api/admin/announcements",
];

async function main() {
  console.log(`Security check against ${BASE}\n`);

  const health = await call(null, "/api/health");
  if (health.status !== 200) throw new Error(`No server at ${BASE} — start one with \`npm run dev\`.`);

  const player = await signUpAndIn("player");
  const owner = await signUpAndIn("owner");
  const admin = await signUpAndIn("admin");
  const admin2 = await signUpAndIn("admin2");
  const support = await signUpAndIn("support");
  const mod = await signUpAndIn("mod");
  const victim = await signUpAndIn("victim");

  await setRole(owner, "OWNER");
  await setRole(admin, "ADMIN");
  await setRole(admin2, "ADMIN");
  await setRole(support, "SUPPORT");
  await setRole(mod, "MODERATOR");

  // --- 1. anonymous and ordinary players are refused everywhere -----------
  console.log("1. unauthenticated and non-staff callers");
  for (const path of ADMIN_READS) {
    const anon = await call(null, path);
    check(`anon GET ${path} refused`, anon.status === 401 || anon.status === 403, `got ${anon.status}`);
    const plain = await call(player, path);
    check(`player GET ${path} → 403`, plain.status === 403, `got ${plain.status}`);
  }
  const playerGrant = await call(player, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 1_000_000, reason: "helping myself" }),
  });
  check("player cannot grant themselves money", playerGrant.status === 403, `got ${playerGrant.status}`);
  const anonGrant = await call(null, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 1_000_000, reason: "helping myself" }),
  });
  check("anon cannot grant money", anonGrant.status === 401 || anonGrant.status === 403, `got ${anonGrant.status}`);

  // --- 2. capabilities are per-role, not per-dashboard --------------------
  console.log("\n2. capability enforcement per role");
  const supportRead = await call(support, `/api/admin/accounts?q=${PREFIX}`);
  check("SUPPORT can read accounts", supportRead.status === 200, `got ${supportRead.status}`);
  const supportGrant = await call(support, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 5000, reason: "ticket 12" }),
  });
  check("SUPPORT cannot touch the economy", supportGrant.status === 403, `got ${supportGrant.status}`);
  const supportSuspend = await call(support, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", reason: "ticket 12" }),
  });
  check("SUPPORT cannot suspend", supportSuspend.status === 403, `got ${supportSuspend.status}`);

  const modSuspend = await call(mod, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", reason: "abuse report 7" }),
  });
  check("MODERATOR can suspend", modSuspend.status === 200, show(modSuspend.json));
  const modGrant = await call(mod, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 5000, reason: "abuse report 7" }),
  });
  check("MODERATOR cannot touch the economy", modGrant.status === 403, `got ${modGrant.status}`);
  const modConfig = await call(mod, "/api/admin/games", {
    method: "POST",
    body: JSON.stringify({ slug: "coinflip", enabled: false, reason: "testing" }),
  });
  check("MODERATOR cannot configure games", modConfig.status === 403, `got ${modConfig.status}`);

  const adminRole = await call(admin, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "role.set", role: "SUPPORT", reason: "promotion", confirm: true }),
  });
  check("ADMIN cannot hand out roles", adminRole.status === 403, `got ${adminRole.status}`);

  // --- 3. rank rules ------------------------------------------------------
  console.log("\n3. rank rules between staff");
  const peer = await call(admin, `/api/admin/accounts/${admin2.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", reason: "peer conflict" }),
  });
  check("ADMIN cannot suspend another ADMIN", peer.status === 403, `got ${peer.status}`);
  const upward = await call(mod, `/api/admin/accounts/${owner.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", reason: "coup" }),
  });
  check("MODERATOR cannot suspend the OWNER", upward.status === 403, `got ${upward.status}`);
  const downward = await call(owner, `/api/admin/accounts/${mod.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "role.set", role: "SUPPORT", reason: "reassignment", confirm: true }),
  });
  check("OWNER can demote a MODERATOR", downward.status === 200, show(downward.json));
  await setRole(mod, "MODERATOR");

  // --- 4. reason and confirmation -----------------------------------------
  console.log("\n4. reason and confirmation");
  const noReason = await call(owner, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 100, reason: "" }),
  });
  check("a mutation without a reason is rejected", noReason.status === 400, `got ${noReason.status}`);
  const noConfirm = await call(owner, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.set", cents: 0, reason: "zeroing the account" }),
  });
  check("a dangerous action without confirmation is rejected", noConfirm.status === 400, `got ${noConfirm.status}`);

  // --- 5. an admin grant is a ledger row, not a raw balance write ----------
  console.log("\n5. the books still balance after an admin adjustment");
  await call(owner, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "unsuspend", reason: "resolved" }),
  });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
  const grant = await call(owner, `/api/admin/accounts/${victim.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "balance.grant", cents: 250_00, reason: "goodwill credit" }),
  });
  check("OWNER can grant a balance", grant.status === 200, show(grant.json));
  const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
  check("the balance moved by exactly the granted amount", after.balanceCents - before.balanceCents === 25000n,
    `${before.balanceCents} → ${after.balanceCents}`);
  const adminRows = await prisma.transaction.count({ where: { userId: victim.id, kind: "ADMIN" } });
  check("the grant wrote an ADMIN ledger row", adminRows === 1, `found ${adminRows}`);
  const rec = await reconcile(victim.id);
  check(`the running-balance chain reconciles (${rec.rows} rows)`, rec.ok, show(rec));
  const auditRow = await prisma.auditLog.findFirst({
    where: { targetId: victim.id, action: "account.balance.grant" },
    orderBy: { createdAt: "desc" },
  });
  check("the grant is in the audit log with old and new values",
    !!auditRow && auditRow.oldValue !== null && auditRow.newValue !== null && auditRow.reason.length > 0,
    show(auditRow));

  // --- 6. the gates that actually refuse a bet -----------------------------
  console.log("\n6. suspension, maintenance and a disabled game refuse bets");
  const bet = { betCents: 100, side: "heads" };
  const okBet = await call(player, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("a normal player can bet", okBet.status === 200, show(okBet.json));

  await call(owner, `/api/admin/accounts/${player.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "suspend", reason: "security check" }),
  });
  const suspendedBet = await call(player, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("a suspended player cannot bet", suspendedBet.status >= 400, `got ${suspendedBet.status}`);
  await call(owner, `/api/admin/accounts/${player.id}/mutate`, {
    method: "POST",
    body: JSON.stringify({ action: "unsuspend", reason: "security check done" }),
  });

  const disable = await call(owner, "/api/admin/games", {
    method: "POST",
    body: JSON.stringify({ slug: "coinflip", enabled: false, reason: "security check", disabledNote: "closed" }),
  });
  check("OWNER can close a table", disable.status === 200, show(disable.json));
  const closedBet = await call(player, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("a disabled game refuses a bet", closedBet.status >= 400, `got ${closedBet.status}`);
  await call(owner, "/api/admin/games", {
    method: "POST",
    body: JSON.stringify({ slug: "coinflip", enabled: true, reason: "reopening after check", disabledNote: null }),
  });

  const maint = await call(owner, "/api/admin/flags", {
    method: "POST",
    body: JSON.stringify({ key: "site.maintenance", value: "true", reason: "security check", confirm: true }),
  });
  check("OWNER can put the site into maintenance", maint.status === 200, show(maint.json));
  const maintBet = await call(player, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("maintenance mode refuses a player's bet", maintBet.status >= 400, `got ${maintBet.status}`);
  const staffBet = await call(owner, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("staff can still bet during maintenance", staffBet.status === 200, show(staffBet.json));
  await call(owner, "/api/admin/flags", {
    method: "POST",
    body: JSON.stringify({ key: "site.maintenance", value: "false", reason: "check complete", confirm: true }),
  });
  const reopened = await call(player, "/api/games/coinflip", { method: "POST", body: JSON.stringify(bet) });
  check("betting works again once maintenance is lifted", reopened.status === 200, show(reopened.json));

  // --- 7. the books balance for a player who actually played ---------------
  const playerRec = await reconcile(player.id);
  check(`the player's ledger reconciles (${playerRec.rows} rows)`, playerRec.ok, show(playerRec));

  // --- cleanup ------------------------------------------------------------
  const ids = [player, owner, admin, admin2, support, mod, victim].map((s) => s.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
