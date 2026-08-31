import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <p className="font-display text-6xl font-black text-volt">404</p>
        <h1 className="mt-2 text-xl font-black text-white">That table isn&apos;t open.</h1>
        <p className="mt-1 text-sm text-slate-400">The game you were looking for doesn&apos;t exist yet.</p>
        <Link href="/" className="btn-primary mt-5">
          Back to the lobby
        </Link>
      </div>
    </div>
  );
}
