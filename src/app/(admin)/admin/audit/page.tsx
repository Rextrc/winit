import AuditPanel from "@/components/admin/AuditPanel";

export const dynamic = "force-dynamic";

export default function AdminAuditPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Audit log</h1>
      <p className="mb-6 text-sm text-slate-400">
        Append-only. Nothing in the app updates or deletes an entry, so the record of what staff did
        outlives the account it was done to.
      </p>
      <AuditPanel />
    </>
  );
}
