import AccountSearch from "@/components/admin/AccountSearch";

export const dynamic = "force-dynamic";

export default function AdminAccountsPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Accounts</h1>
      <p className="mb-6 text-sm text-slate-400">
        Search by username, email or account id.
      </p>
      <AccountSearch />
    </>
  );
}
