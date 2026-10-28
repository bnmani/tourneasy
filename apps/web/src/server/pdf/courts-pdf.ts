/**
 * The schedule per court (D79): a page (or more) per court with its matches in order, to hang
 * at the court or give to the umpires. Room to write the score where it isn't known yet. Same
 * look as the schedule PDF.
 */
import { formatDate, formatTime } from '@tourneasy/shared';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  ACCENT,
  embedLogo,
  INK,
  LINE,
  MARGIN,
  MUTED,
  pdfSafe,
  PRIMARY,
  wrap,
  ZEBRA,
  type SchedulePdfInput,
} from './schedule-pdf';

const PAGE: [number, number] = [595.28, 841.89]; // A4 portrait, points

const TEXTS = {
  nl: {
    title: 'Baanschema',
    court: 'Baan',
    draft: 'CONCEPT — nog niet gepubliceerd',
    time: 'Tijd',
    number: 'Nr.',
    event: 'Onderdeel / ronde',
    match: 'Wedstrijd',
    result: 'Uitslag',
    vs: 'tegen',
    tbd: 'nog onbekend',
    walkover: 'w.o.',
    generated: 'Stand van',
    continued: 'vervolg',
    note: 'Tijden zijn een verwachting; volg de oproep van de wedstrijdtafel. Lever uitslagen in bij de wedstrijdtafel.',
    page: (n: number, total: number) => `Pagina ${n} van ${total}`,
    none: 'Er staan nog geen wedstrijden in de planning.',
  },
  en: {
    title: 'Court schedule',
    court: 'Court',
    draft: 'DRAFT — not yet published',
    time: 'Time',
    number: 'No.',
    event: 'Category / round',
    match: 'Match',
    result: 'Result',
    vs: 'vs',
    tbd: 'to be decided',
    walkover: 'w/o',
    generated: 'As of',
    continued: 'continued',
    note: 'Times are estimates; follow the match desk calls. Hand in results at the match desk.',
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    none: 'No matches are scheduled yet.',
  },
} as const;

export async function buildCourtsPdf(input: SchedulePdfInput): Promise<Uint8Array> {
  const t = TEXTS[input.locale];
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${t.title} – ${input.tournament.name}`));
  doc.setAuthor('Tourneasy');
  doc.setCreator('Tourneasy');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, input.logo);

  const width = PAGE[0] - 2 * MARGIN;
  const cols = {
    time: { x: 0, w: 42 },
    number: { x: 42, w: 34 },
    event: { x: 76, w: 140 },
    match: { x: 216, w: width - 216 - 92 },
    result: { x: width - 92, w: 92 },
  };
  const SIZE = 9.5;
  const LEADING = 12;

  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];
  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(pdfSafe(s), {
      x: MARGIN + x,
      y: yy,
      font: opts.font ?? regular,
      size: opts.size ?? SIZE,
      color: opts.color ?? INK,
    });

  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width, height: 16, color: rgb(0.93, 0.93, 0.93) });
    for (const [key, col] of Object.entries(cols))
      text(t[key as keyof typeof cols], col.x + 4, y + 1, { font: bold, size: 8, color: MUTED });
    y -= 20;
  };

  /** A new page for a court: logo, tournament, and the court name large. */
  const courtPage = (court: string, continued: boolean) => {
    page = doc.addPage(PAGE);
    pages.push(page);
    const top = PAGE[1] - MARGIN;
    const scale = Math.min(100 / logo.width, 40 / logo.height);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: top - lh, width: lw, height: lh });
    const left = lw + 14;
    text(t.title.toUpperCase(), left, top - 10, { font: bold, size: 9, color: ACCENT });
    text(input.tournament.name, left, top - 28, { font: bold, size: 14, color: PRIMARY });
    text(
      [input.tournament.when, input.tournament.venue].filter(Boolean).join('  ·  '),
      left,
      top - 41,
      { size: 9, color: MUTED },
    );
    const label = continued ? `${court} (${t.continued})` : court;
    const lwidth = bold.widthOfTextAtSize(pdfSafe(label), 26);
    text(label, width - lwidth, top - 32, { font: bold, size: 26, color: PRIMARY });
    if (input.draft)
      text(t.draft, 0, top - 58, { font: bold, size: 9, color: rgb(0.85, 0.25, 0.2) });
    page.drawRectangle({ x: MARGIN, y: top - 66, width, height: 2, color: ACCENT });
    y = top - 86;
    tableHeader();
  };

  const scheduled = input.matches.filter((m) => m.startsAt && m.court);
  const courts = [...new Map(scheduled.map((m) => [m.court!.number, m.court!])).values()].sort(
    (a, b) => a.number - b.number,
  );
  if (courts.length === 0) {
    courtPage('', false);
    text(t.none, 0, y, { size: 11, color: MUTED });
  }

  for (const court of courts) {
    const name = court.name ?? `${t.court} ${court.number}`;
    courtPage(name, false);
    const matches = scheduled
      .filter((m) => m.court!.number === court.number)
      .sort((p, q) => p.startsAt!.getTime() - q.startsAt!.getTime());
    let lastDay = '';
    matches.forEach((m, i) => {
      const thisDay = formatDate(m.startsAt!, input.locale);
      const players = [`${m.a ?? t.tbd}`, `${t.vs} ${m.b ?? t.tbd}`];
      const match = players.flatMap((p) => wrap(p, bold, SIZE, cols.match.w - 8));
      const event = [
        ...wrap(m.event, regular, SIZE, cols.event.w - 8),
        ...wrap(m.round, regular, 8.5, cols.event.w - 8),
      ];
      const result =
        m.status === 'WALKOVER'
          ? t.walkover
          : m.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(', ');
      const height = Math.max(match.length, event.length, 2) * LEADING + 10;
      const needsDayBand = thisDay !== lastDay;
      if (y - height - (needsDayBand ? 24 : 0) < MARGIN + 30) courtPage(name, true);
      if (needsDayBand) {
        const label = thisDay.charAt(0).toUpperCase() + thisDay.slice(1);
        page.drawRectangle({ x: MARGIN, y: y - 5, width, height: 18, color: PRIMARY });
        text(label, 6, y, { font: bold, size: 10, color: rgb(1, 1, 1) });
        y -= 24;
        lastDay = thisDay;
      }
      if (i % 2 === 1)
        page.drawRectangle({ x: MARGIN, y: y - height + LEADING + 2, width, height, color: ZEBRA });
      text(formatTime(m.startsAt!, input.locale), cols.time.x + 4, y, { font: bold });
      text(`#${m.number}`, cols.number.x + 4, y, { color: MUTED });
      event.forEach((line, k) =>
        text(line, cols.event.x + 4, y - k * LEADING, k === 0 ? {} : { size: 8.5, color: MUTED }),
      );
      match.forEach((line, k) => text(line, cols.match.x + 4, y - k * LEADING, { font: bold }));
      if (result) text(result, cols.result.x + 4, y);
      else
        // A line to write the score on.
        page.drawRectangle({
          x: MARGIN + cols.result.x + 4,
          y: y - LEADING - 2,
          width: cols.result.w - 8,
          height: 0.8,
          color: INK,
        });
      page.drawRectangle({
        x: MARGIN,
        y: y - height + LEADING + 2,
        width,
        height: 0.6,
        color: LINE,
      });
      y -= height;
    });
  }

  pages.forEach((p, i) => {
    page = p;
    const fy = MARGIN - 14;
    page.drawRectangle({ x: MARGIN, y: fy + 12, width, height: 0.6, color: LINE });
    text(t.note, 0, fy, { size: 7.5, color: MUTED });
    const stamp = `${t.generated} ${formatDate(input.generatedAt, input.locale)} ${formatTime(input.generatedAt, input.locale)}`;
    text(stamp, 0, fy - 10, { size: 7.5, color: MUTED });
    const label = t.page(i + 1, pages.length);
    text(label, width - regular.widthOfTextAtSize(label, 8), fy - 10, { size: 8, color: MUTED });
  });

  return doc.save();
}
