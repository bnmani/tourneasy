import { Fragment } from 'react';
import { CONTACT_EMAIL } from '@/lib/site';

/** The contact address in a line becomes a mail link. */
function withMailLink(text: string) {
  return text.split(CONTACT_EMAIL).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">
          {CONTACT_EMAIL}
        </a>
      )}
      {part}
    </Fragment>
  ));
}

/**
 * A legal text from the messages: "## " starts a heading, "- " a list item, every other line
 * is a paragraph.
 */
export function LegalPage({
  title,
  updated,
  body,
}: {
  title: string;
  updated: string;
  body: string;
}) {
  const blocks: ({ kind: 'h2' | 'p'; text: string } | { kind: 'ul'; items: string[] })[] = [];
  for (const line of body.split('\n')) {
    const last = blocks.at(-1);
    if (line.startsWith('- ')) {
      if (last?.kind === 'ul') last.items.push(line.slice(2));
      else blocks.push({ kind: 'ul', items: [line.slice(2)] });
    } else if (line.startsWith('## ')) blocks.push({ kind: 'h2', text: line.slice(3) });
    else if (line.trim()) blocks.push({ kind: 'p', text: line });
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{updated}</p>
      <div className="mt-6 space-y-4 leading-7">
        {blocks.map((block, i) =>
          block.kind === 'h2' ? (
            <h2 key={i} className="pt-4 text-xl font-semibold tracking-tight">
              {block.text}
            </h2>
          ) : block.kind === 'ul' ? (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {block.items.map((item, j) => (
                <li key={j}>{withMailLink(item)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{withMailLink(block.text)}</p>
          ),
        )}
      </div>
    </article>
  );
}
