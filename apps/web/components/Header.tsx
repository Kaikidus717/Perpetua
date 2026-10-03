import Link from "next/link";

const LINKS = [
  { href: "/", label: "Explore" },
  { href: "/terminal", label: "Terminal" },
  { href: "/securitize", label: "Securitize" },
  { href: "/launch", label: "Launch" },
  { href: "/kpi", label: "KPI" },
];

export function Header() {
  return (
    <header className="border-b border-edge bg-panel/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Perpetua</span>
          <span className="text-xs text-slate-400">fee-rights exchange</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
