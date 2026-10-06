/// The one page heading used by every route: same size, same width, same alignment. Keeping it in a
/// component is what makes the pages look like one product instead of five.
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mx-auto max-w-2xl text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
    </header>
  );
}
