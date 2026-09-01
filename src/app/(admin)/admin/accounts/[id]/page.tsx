import AccountDetail from "@/components/admin/AccountDetail";

export const dynamic = "force-dynamic";

export default function AdminAccountPage({ params }: { params: { id: string } }) {
  return <AccountDetail id={params.id} />;
}
