/**
 * The check-in list of one tournament day as a printable PDF (D77), for a desk without a
 * screen or as a backup: A4 portrait, players in the order of their first match, a box to tick,
 * the amount still to pay and room to sign off. Same look as the schedule PDF.
 */
import { formatDate, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
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
} from './schedule-pdf';

export type CheckInPdfRow = {
  name: string;
  memberNumber: string;
  club: string | null;
  firstMatch: Date | null;
  matches: number;
  present: boolean;
  /** Formatted amount still to pay, or null. */
  toPay: string | null;
};

export type CheckInPdfInput = {
  locale: AppLocale;
  tournament: { name: string; venue: string | null };
  day: Date;
  logo: { bytes: Uint8Array; mimeType: string } | null;
  rows: CheckInPdfRow[];
  generatedAt: Date;
};

const PAGE: [number, number] = [595.28, 841.89]; // A4 portrait, points

const TEXTS = {
  nl: {
    title: 'Aanmeldlijst',
    check: 'Aanw.',
    time: 'Eerste',
    name: 'Speler',
    number: 'Lidnr.',
    club: 'Club',
    matches: 'Wedstr.',
    pay: 'Te betalen',
    generated: 'Stand van',
    summary: (present: number, total: number) => `${present} van ${total} al aangemeld`,
    note: 'Vink aan wie er is en reken openstaande bedragen af. Verwerk de lijst daarna in Tourneasy.',
    page: (n: number, total: number) => `Pagina ${n} van ${total}`,
    none: 'Er spelen deze dag geen spelers.',
  },
  en: {
    title: 'Check-in list',
    check: 'Here',
    time: 'First',
    name: 'Player',
    number: 'No.',
    club: 'Club',
    matches: 'Matches',
    pay: 'To pay',
    generated: 'As of',
    summary: (present: number, total: number) => `${present} of ${total} already checked in`,
    note: 'Tick who is here and settle open amounts. Then enter the list in Tourneasy.',
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    none: 'No players play on this day.',
  },
} as const;

export async function buildCheckInPdf(input: CheckInPdfInput): Promise<Uint8Array> {
  const t = TEXTS[input.locale];
  const doc = await PDFDocument.create();
  const dayLabel = formatDate(input.day, input.locale);
  doc.setTitle(pdfSafe(`${t.title} – ${input.tournament.name} – ${dayLabel}`));
  doc.setAuthor('Tourneasy');
  doc.setCreator('Tourneasy');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, input.logo);

  const width = PAGE[0] - 2 * MARGIN;
  const cols = {
    check: { x: 0, w: 36 },
    time: { x: 36, w: 40 },
    name: { x: 76, w: 150 },
    number: { x: 226, w: 66 },
    club: { x: 292, w: width - 292 - 46 - 66 },
    matches: { x: width - 112, w: 46 },
    pay: { x: width - 66, w: 66 },
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

  const header = (first: boolean) => {
    page = doc.addPage(PAGE);
    pages.push(page);
    const top = PAGE[1] - MARGIN;
    if (first) {
      const scale = Math.min(120 / logo.width, 48 / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      page.drawImage(logo, { x: MARGIN, y: top - lh, width: lw, height: lh });
      const left = lw + 16;
      text(t.title.toUpperCase(), left, top - 10, { font: bold, size: 10, color: ACCENT });
      text(input.tournament.name, left, top - 30, { font: bold, size: 17, color: PRIMARY });
      const day = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
      text([day, input.tournament.venue].filter(Boolean).join('  ·  '), left, top - 45, {
        size: 10,
        color: MUTED,
      });
      const stamp = `${t.generated} ${formatDate(input.generatedAt, input.locale)} ${formatTime(input.generatedAt, input.locale)}`;
      text(stamp, width - regular.widthOfTextAtSize(pdfSafe(stamp), 8), top - 8, {
        size: 8,
        color: MUTED,
      });
      const present = input.rows.filter((r) => r.present).length;
      const summary = t.summary(present, input.rows.length);
      text(summary, width - regular.widthOfTextAtSize(summary, 9), top - 45, {
        size: 9,
        color: MUTED,
      });
      page.drawRectangle({ x: MARGIN, y: top - 58, width, height: 2, color: ACCENT });
      y = top - 76;
    } else {
      text(`${input.tournament.name} · ${dayLabel}`, 0, top - 10, {
        font: bold,
        size: 10,
        color: PRIMARY,
      });
      page.drawRectangle({ x: MARGIN, y: top - 18, width, height: 1, color: ACCENT });
      y = top - 32;
    }
    tableHeader();
  };

  header(true);
  if (input.rows.length === 0) text(t.none, 0, y, { size: 11, color: MUTED });

  let lastTime = '';
  input.rows.forEach((r, i) => {
    const cells = {
      name: wrap(r.name, bold, SIZE, cols.name.w - 8),
      club: wrap(r.club ?? '', regular, SIZE, cols.club.w - 8),
    };
    const lines = Math.max(cells.name.length, cells.club.length);
    const height = Math.max(lines * LEADING + 8, 22);
    if (y - height < MARGIN + 30) header(false);
    const time = r.firstMatch ? formatTime(r.firstMatch, input.locale) : '–';
    if (time !== lastTime && i > 0)
      page.drawRectangle({ x: MARGIN, y: y + LEADING, width, height: 0.6, color: LINE });
    if (i % 2 === 1)
      page.drawRectangle({ x: MARGIN, y: y - height + LEADING + 2, width, height, color: ZEBRA });
    // A box to tick; already checked in ones get a tick.
    page.drawRectangle({
      x: MARGIN + 8,
      y: y - 3,
      width: 12,
      height: 12,
      borderColor: INK,
      borderWidth: 0.8,
    });
    if (r.present) text('X', 10.5, y - 0.5, { font: bold, size: 10, color: PRIMARY });
    if (time !== lastTime) text(time, cols.time.x + 4, y, { font: bold });
    cells.name.forEach((line, k) => text(line, cols.name.x + 4, y - k * LEADING, { font: bold }));
    text(r.memberNumber, cols.number.x + 4, y, { color: MUTED });
    cells.club.forEach((line, k) => text(line, cols.club.x + 4, y - k * LEADING));
    if (r.matches) text(String(r.matches), cols.matches.x + 4, y);
    if (r.toPay) text(r.toPay, cols.pay.x + 4, y, { font: bold, color: rgb(0.7, 0.2, 0.15) });
    y -= height;
    lastTime = time;
  });

  pages.forEach((p, i) => {
    page = p;
    const fy = MARGIN - 14;
    page.drawRectangle({ x: MARGIN, y: fy + 12, width, height: 0.6, color: LINE });
    text(t.note, 0, fy, { size: 7.5, color: MUTED });
    const label = t.page(i + 1, pages.length);
    text(label, width - regular.widthOfTextAtSize(label, 8), fy - 10, { size: 8, color: MUTED });
  });

  return doc.save();
}
