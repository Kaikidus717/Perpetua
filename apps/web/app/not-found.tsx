import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
      <p className="text-slate-400">
        That page, vault or pool does not exist. Vault ids are the on-chain PDA address.
      </p>
      <Link href="/" className="text-sm text-accent">
        ← back to the exchange
      </Link>
    </div>
  );
}
