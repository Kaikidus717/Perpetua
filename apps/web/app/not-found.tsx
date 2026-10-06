import { LINK } from "@/lib/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="text-sm leading-6 text-muted">
        That page, vault or pool does not exist. A vault link ends in its on-chain address.
      </p>
      <p className="text-sm">
        <Link href="/" className={LINK}>
          Back to vaults
        </Link>
      </p>
    </div>
  );
}
