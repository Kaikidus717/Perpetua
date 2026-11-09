import { H2 } from "@/lib/ui";
import type { ReactNode } from "react";

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="space-y-1">
          <h2 className={H2}>{title}</h2>
          {description ? (
            <p className="max-w-xl text-[12px] leading-5 text-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
