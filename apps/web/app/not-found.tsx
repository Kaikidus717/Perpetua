import { BUTTON, BUTTON_PRIMARY, EYEBROW, LEDE, TITLE } from "@/lib/ui";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl space-y-4 py-10">
      <p className={EYEBROW}>404</p>
      <h1 className={TITLE}>Page not found</h1>
      <p className={LEDE}>That page or pool does not exist. Check the address and try again.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className={BUTTON_PRIMARY}>
          Back to vaults
        </Link>
        <Link href="/terminal" className={BUTTON}>
          Price a pool
        </Link>
      </div>
    </div>
  );
}
