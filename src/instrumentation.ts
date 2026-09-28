export async function register() {
  // Written as one positive check so the edge bundle drops the import entirely.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSettlementLoop } = await import("@/lib/sports/scheduler");
    startSettlementLoop();
  }
}
