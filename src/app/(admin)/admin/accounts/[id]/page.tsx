import AccountDetail from "@/components/admin/AccountDetail";
import { staffViewer } from "@/lib/admin/viewer";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage({ params }: { params: { id: string } }) {
  const me = await staffViewer();
  return <AccountDetail id={params.id} role={me?.role ?? null} viewerId={me?.id ?? null} />;
}
