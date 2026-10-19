export function LegalPage({
  title,
  draftNotice,
  body,
}: {
  title: string;
  draftNotice: string;
  body: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-4 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
        {draftNotice}
      </p>
      <div className="mt-6 space-y-4 leading-7">
        {body.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
