import { LEDE, TITLE } from "@/lib/ui";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  /// At most one primary action. Anything else belongs in the page body, next to what it acts on.
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className={TITLE}>{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className={LEDE}>{description}</p> : null}
    </header>
  );
}
