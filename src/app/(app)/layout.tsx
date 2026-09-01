import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

/**
 * The lobby, category pages and every game are open to anyone: browsing the
 * casino — reading a paytable, watching a wheel spin — needs no account.
 * Placing an actual bet still does, gated where the bet itself happens
 * (GameFrame's panel overlay and the docked bet slip), and every API route
 * separately enforces it server-side via requireUser regardless of what the
 * client shows. Account-only pages (life, rewards, history, settings) gate
 * themselves individually since they have nothing to show without a session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
