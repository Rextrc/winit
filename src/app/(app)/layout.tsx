import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUserId())) redirect("/login");
  return <Shell>{children}</Shell>;
}
