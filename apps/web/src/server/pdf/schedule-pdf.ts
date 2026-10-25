/**
 * The schedule as a printable PDF (D73): A4 landscape with the tournament's logo (or the
 * Tourneasy mark), one band per day and a table per day — time, court, match number, category,
 * round, players and result. Column headers repeat on every page; the footer carries the link
 * to the live schedule and page numbers. Standard PDF fonts, so text outside Western European
 * characters is simplified (é stays, ł becomes l).
 */
import { formatDate, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { TOURNEASY_MARK_PNG_BASE64 } from './tourneasy-mark';

export type PdfMatch = {
  number: number;
  event: string;
  round: string;
  a: string | null;
  b: string | null;
  startsAt: Date | null;
  court: { number: number; name: string | null } | null;
  status: string;
  sets: { scoreA: number; scoreB: number }[];
};

export type SchedulePdfInput = {
  locale: AppLocale;
  tournament: { name: string; when: string; venue: string | null; url: string };
  logo: { bytes: Uint8Array; mimeType: string } | null;
  matches: PdfMatch[];
  /** Not yet published: printed as a draft. */
  draft: boolean;
  generatedAt: Date;
};

export const PRIMARY = rgb(0x2e / 255, 0x4a / 255, 0x67 / 255);
export const ACCENT = rgb(0xb8 / 255, 0x94 / 255, 0x5b / 255);
export const INK = rgb(0x0f / 255, 0x1e / 255, 0x33 / 255);
export const MUTED = rgb(0.38, 0.42, 0.48);
export const ZEBRA = rgb(0xf6 / 255, 0xf3 / 255, 0xec / 255);
export const LINE = rgb(0.85, 0.85, 0.85);

const PAGE: [number, number] = [841.89, 595.28]; // A4 landscape, points
export const MARGIN = 36;

const TEXTS = {
  nl: {
    title: 'Speelschema',
    draft: 'CONCEPT — nog niet gepubliceerd',
    time: 'Tijd',
    court: 'Baan',
    number: 'Nr.',
    event: 'Onderdeel',
    round: 'Ronde',
    match: 'Wedstrijd',
    result: 'Uitslag',
    vs: 'tegen',
    tbd: 'nog onbekend',
    walkover: 'w.o.',
    generated: 'Stand van',
    note: 'Tijden zijn een verwachting: wees op tijd en meld je bij de wedstrijdtafel. De actuele planning staat online.',
    page: (n: number, total: number) => `Pagina ${n} van ${total}`,
    none: 'Er staan nog geen wedstrijden in de planning.',
  },
  en: {
    title: 'Match schedule',
    draft: 'DRAFT — not yet published',
    time: 'Time',
    court: 'Court',
    number: 'No.',
    event: 'Category',
    round: 'Round',
    match: 'Match',
    result: 'Result',
    vs: 'vs',
    tbd: 'to be decided',
    walkover: 'w/o',
    generated: 'As of',
    note: 'Times are estimates: be on time and report to the match desk. The current schedule is online.',
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    none: 'No matches are scheduled yet.',
  },
} as const;

// WinAnsi (the standard fonts' encoding): Latin-1 plus these.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
/** Text the standard fonts can draw: accents kept where possible, others simplified. */
export function pdfSafe(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (
        (code >= 0x20 && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xff) ||
        WIN_ANSI_EXTRA.has(ch)
      )
        return ch;
      const plain = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      if (plain && [...plain].every((c) => c.codePointAt(0)! <= 0x7e)) return plain;
      return ch === 'ł' ? 'l' : ch === 'Ł' ? 'L' : '?';
    })
    .join('');
}

/** Splits text into lines that fit the width. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** The tournament's logo, or the Tourneasy mark when it has none (or it can't be read). */
export async function embedLogo(
  doc: PDFDocument,
  file: { bytes: Uint8Array; mimeType: string } | null,
): Promise<PDFImage> {
  try {
    if (file)
      return file.mimeType === 'image/png'
        ? await doc.embedPng(file.bytes)
        : await doc.embedJpg(file.bytes);
  } catch {
    // Falls back to the mark below.
  }
  return doc.embedPng(Buffer.from(TOURNEASY_MARK_PNG_BASE64, 'base64'));
}

export async function buildSchedulePdf(input: SchedulePdfInput): Promise<Uint8Array> {
  const t = TEXTS[input.locale];
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${t.title} – ${input.tournament.name}`));
  doc.setAuthor('Tourneasy');
  doc.setCreator('Tourneasy');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await embedLogo(doc, input.logo);

  // Columns: x offset and width.
  const width = PAGE[0] - 2 * MARGIN;
  const cols = {
    time: { x: 0, w: 44 },
    court: { x: 44, w: 42 },
    number: { x: 86, w: 34 },
    event: { x: 120, w: 140 },
    round: { x: 260, w: 104 },
    match: { x: 364, w: width - 364 - 84 },
    result: { x: width - 84, w: 84 },
  };
  const SIZE = 9;
  const LEADING = 11.5;

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

  const header = (first: boolean) => {
    page = doc.addPage(PAGE);
    pages.push(page);
    const top = PAGE[1] - MARGIN;
    if (first) {
      // Logo at most 150 x 56 pt, keeping its proportions.
      const scale = Math.min(150 / logo.width, 56 / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      page.drawImage(logo, { x: MARGIN, y: top - lh, width: lw, height: lh });
      const left = lw + 18;
      text(t.title.toUpperCase(), left, top - 12, { font: bold, size: 10, color: ACCENT });
      text(input.tournament.name, left, top - 34, { font: bold, size: 20, color: PRIMARY });
      text(
        [input.tournament.when, input.tournament.venue].filter(Boolean).join('  ·  '),
        left,
        top - 50,
        { size: 10, color: MUTED },
      );
      const stamp = `${t.generated} ${formatDate(input.generatedAt, input.locale)} ${formatTime(input.generatedAt, input.locale)}`;
      const sw = regular.widthOfTextAtSize(pdfSafe(stamp), 8);
      text(stamp, width - sw, top - 10, { size: 8, color: MUTED });
      if (input.draft) {
        const dw = bold.widthOfTextAtSize(t.draft, 10);
        page.drawRectangle({
          x: MARGIN + width - dw - 16,
          y: top - 38,
          width: dw + 16,
          height: 18,
          color: rgb(0.85, 0.25, 0.2),
        });
        text(t.draft, width - dw - 8, top - 33, { font: bold, size: 10, color: rgb(1, 1, 1) });
      }
      page.drawRectangle({ x: MARGIN, y: top - 66, width, height: 2, color: ACCENT });
      y = top - 84;
    } else {
      text(input.tournament.name, 0, top - 10, { font: bold, size: 10, color: PRIMARY });
      if (input.draft)
        text(t.draft, 260, top - 10, { font: bold, size: 9, color: rgb(0.85, 0.25, 0.2) });
      page.drawRectangle({ x: MARGIN, y: top - 18, width, height: 1, color: ACCENT });
      y = top - 32;
    }
  };

  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width, height: 16, color: rgb(0.93, 0.93, 0.93) });
    for (const [key, col] of Object.entries(cols))
      text(t[key as keyof typeof cols], col.x + 4, y + 1, { font: bold, size: 8, color: MUTED });
    y -= 18;
  };

  const ensure = (needed: number, day?: string) => {
    if (y - needed >= MARGIN + 30) return;
    header(false);
    if (day) dayBand(day, true);
    tableHeader();
  };

  const dayBand = (label: string, continued = false) => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width, height: 20, color: PRIMARY });
    const suffix = input.locale === 'nl' ? 'vervolg' : 'continued';
    text(continued ? `${label} (${suffix})` : label, 6, y, {
      font: bold,
      size: 11,
      color: rgb(1, 1, 1),
    });
    y -= 26;
  };

  header(true);
  const matches = input.matches
    .filter((m) => m.startsAt && m.court)
    .sort(
      (p, q) => p.startsAt!.getTime() - q.startsAt!.getTime() || p.court!.number - q.court!.number,
    );
  if (matches.length === 0) text(t.none, 0, y, { size: 11, color: MUTED });

  let day = '';
  let lastTime = '';
  let row = 0;
  for (const m of matches) {
    const thisDay = formatDate(m.startsAt!, input.locale);
    const label = thisDay.charAt(0).toUpperCase() + thisDay.slice(1);
    if (thisDay !== day) {
      if (day) y -= 8;
      ensure(70);
      dayBand(label);
      tableHeader();
      day = thisDay;
      lastTime = '';
      row = 0;
    }
    const players = `${m.a ?? t.tbd}  ${t.vs}  ${m.b ?? t.tbd}`;
    const result =
      m.status === 'WALKOVER'
        ? t.walkover
        : m.sets.length
          ? m.sets.map((s) => `${s.scoreA}-${s.scoreB}`).join(', ')
          : '';
    const cells = {
      event: wrap(m.event, regular, SIZE, cols.event.w - 8),
      round: wrap(m.round, regular, SIZE, cols.round.w - 8),
      // Players are printed in bold: measure them in bold too.
      match: wrap(players, bold, SIZE, cols.match.w - 10),
      result: wrap(result, regular, SIZE, cols.result.w - 8),
    };
    const lines = Math.max(...Object.values(cells).map((c) => c.length));
    const height = lines * LEADING + 6;
    ensure(height, label);
    const time = formatTime(m.startsAt!, input.locale);
    const newSlot = time !== lastTime;
    if (newSlot && row > 0)
      page.drawRectangle({ x: MARGIN, y: y + LEADING - 1, width, height: 0.6, color: LINE });
    if (row % 2 === 1)
      page.drawRectangle({ x: MARGIN, y: y - height + LEADING, width, height, color: ZEBRA });
    if (newSlot) text(time, cols.time.x + 4, y, { font: bold });
    text(m.court!.name ?? String(m.court!.number), cols.court.x + 4, y);
    text(`#${m.number}`, cols.number.x + 4, y, { color: MUTED });
    for (const key of ['event', 'round', 'match', 'result'] as const)
      cells[key].forEach((line, i) =>
        text(line, cols[key].x + 4, y - i * LEADING, key === 'match' ? { font: bold } : {}),
      );
    y -= height;
    lastTime = time;
    row += 1;
  }

  // Footers once the page count is known.
  pages.forEach((p, i) => {
    page = p;
    const fy = MARGIN - 14;
    page.drawRectangle({ x: MARGIN, y: fy + 12, width, height: 0.6, color: LINE });
    text(t.note, 0, fy, { size: 7.5, color: MUTED });
    const link = input.tournament.url.replace(/^https?:\/\//, '');
    text(link, 0, fy - 10, { size: 7.5, color: PRIMARY });
    const label = t.page(i + 1, pages.length);
    text(label, width - regular.widthOfTextAtSize(label, 8), fy - 10, { size: 8, color: MUTED });
  });

  return doc.save();
}
