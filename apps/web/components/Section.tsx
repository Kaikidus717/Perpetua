import type { ReactNode } from "react";

/// Every route composes sections through this, so each heading is the same size and the same
/// distance from its content.
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
