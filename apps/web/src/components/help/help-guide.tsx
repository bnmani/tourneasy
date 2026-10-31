import type { AppLocale } from '@tourneasy/shared/i18n';
import { Fragment, type ReactNode } from 'react';
import type { HelpBlock, HelpGuide, HelpImage } from '@/content/help';

/** "**Save**" becomes bold: button and menu names in the guide text. */
function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Shot({ image, locale, phone }: { image: HelpImage; locale: AppLocale; phone?: boolean }) {
  return (
    <figure className="min-w-0">
      {/* Plain img: the screenshots are already sized and compressed (public/help). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/help/${locale}/${image.src}.jpg`}
        alt={image.alt}
        width={phone ? 360 : 1600}
        height={phone ? 780 : 1000}
        loading="lazy"
        decoding="async"
        className={`h-auto w-full border bg-card shadow-sm ${phone ? 'rounded-2xl' : 'rounded-lg'}`}
      />
      <figcaption className="mt-2 text-sm text-muted-foreground">{rich(image.caption)}</figcaption>
    </figure>
  );
}

function Block({ block, locale }: { block: HelpBlock; locale: AppLocale }) {
  if ('p' in block) return <p>{rich(block.p)}</p>;
  if ('ul' in block)
    return (
      <ul className="list-disc space-y-1 pl-6 marker:text-primary">
        {block.ul.map((item, i) => (
          <li key={i}>{rich(item)}</li>
        ))}
      </ul>
    );
  if ('ol' in block)
    return (
      <ol className="list-decimal space-y-1 pl-6 marker:font-semibold marker:text-primary">
        {block.ol.map((item, i) => (
          <li key={i}>{rich(item)}</li>
        ))}
      </ol>
    );
  if ('note' in block)
    return (
      <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm">
        {rich(block.note)}
      </p>
    );
  if ('table' in block)
    return (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
              {block.table.head.map((h) => (
                <th key={h} className="px-4 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map(([a, b]) => (
              <tr key={a} className="border-b align-top last:border-0">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{a}</td>
                <td className="px-4 py-2.5">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if ('img' in block) return <Shot image={block.img} locale={locale} />;
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <Shot image={block.pair.desktop} locale={locale} />
      <div className="max-w-56">
        <Shot image={block.pair.phone} locale={locale} phone />
      </div>
    </div>
  );
}

/**
 * One help guide (D92): intro, three facts, a contents list and numbered sections with
 * screenshots. `compact` drops the sticky contents column, for use inside the portal.
 */
export function HelpGuideView({
  guide,
  locale,
  contentsLabel,
  compact = false,
}: {
  guide: HelpGuide;
  locale: AppLocale;
  contentsLabel: string;
  compact?: boolean;
}) {
  const contents = (
    <nav aria-label={contentsLabel} className="text-sm">
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {contentsLabel}
      </p>
      <ol className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
        {guide.sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="flex gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
            >
              <span className="w-5 shrink-0 font-semibold text-primary tabular-nums">{i + 1}</span>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );

  return (
    <div
      className={compact ? 'space-y-8' : 'grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12'}
    >
      {compact ? null : <div className="lg:sticky lg:top-24 lg:self-start">{contents}</div>}
      <div className="min-w-0 space-y-10">
        <div className="space-y-5">
          <p className="max-w-3xl text-lg leading-8">{guide.intro}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {guide.facts.map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-4 text-sm">
                <p className="font-heading text-base font-semibold">{f.title}</p>
                <p className="mt-1 text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
          {compact && contents}
        </div>
        {guide.sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-title`}
            className="scroll-mt-24 space-y-4"
          >
            <h2
              id={`${s.id}-title`}
              className="flex items-baseline gap-3 font-heading text-2xl font-semibold tracking-tight"
            >
              <span className="text-base text-primary tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.title}
            </h2>
            <div className="max-w-3xl space-y-4 leading-7">
              {s.blocks.map((block, j) => (
                <Block key={j} block={block} locale={locale} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
