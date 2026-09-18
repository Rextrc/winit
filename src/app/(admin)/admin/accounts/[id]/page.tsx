import type { Metadata } from "next";
import AccountDetail from "@/components/admin/AccountDetail";
import { staffViewer } from "@/lib/admin/viewer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const account = await prisma.user.findUnique({ where: { id: params.id }, select: { username: true } });
  return { title: account ? `@${account.username}` : "Account" };
}

export default async function AdminAccountPage({ params }: { params: { id: string } }) {
  const me = await staffViewer();
  return <AccountDetail id={params.id} role={me?.role ?? null} viewerId={me?.id ?? null} />;
}
