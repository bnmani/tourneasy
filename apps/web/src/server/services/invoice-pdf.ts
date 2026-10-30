/**
 * The invoice for a paid package (D87): A4, seller and buyer, one line, discount, 21% VAT and
 * the total. Uses the company details the owner enters on the pricing page.
 */
import { formatDate, formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { INK, LINE, MARGIN, MUTED, pdfSafe, PRIMARY } from '../pdf/schedule-pdf';
import { invoiceData, VAT_PERCENT } from './pricing-service';
import type { Actor } from './session-service';

const TEXTS = {
  nl: {
    title: 'Factuur',
    number: 'Factuurnummer',
    date: 'Factuurdatum',
    to: 'Aan',
    description: 'Omschrijving',
    amount: 'Bedrag',
    discount: (p: number) => `Korting ${p}%`,
    net: 'Subtotaal excl. btw',
    vat: (p: number) => `Btw ${p}%`,
    total: 'Totaal',
    paid: (d: string) => `Betaald op ${d}. Dank je wel!`,
    kvk: 'KvK',
    vatNumber: 'Btw-nr.',
    iban: 'IBAN',
    packages: {
      FREE: 'Gratis pakket',
      STANDARD: 'Standaard pakket',
      PRO: 'Pro pakket',
      BUNDLE: 'Bundel (toernooicredits)',
      CLUB: 'Clubabonnement',
    },
  },
  en: {
    title: 'Invoice',
    number: 'Invoice number',
    date: 'Invoice date',
    to: 'To',
    description: 'Description',
    amount: 'Amount',
    discount: (p: number) => `Discount ${p}%`,
    net: 'Subtotal excl. VAT',
    vat: (p: number) => `VAT ${p}%`,
    total: 'Total',
    paid: (d: string) => `Paid on ${d}. Thank you!`,
    kvk: 'CoC',
    vatNumber: 'VAT no.',
    iban: 'IBAN',
    packages: {
      FREE: 'Free package',
      STANDARD: 'Standard package',
      PRO: 'Pro package',
      BUNDLE: 'Bundle (tournament credits)',
      CLUB: 'Club subscription',
    },
  },
} as const;

export async function invoicePdf(actor: Actor, purchaseId: string, locale: AppLocale) {
  const { purchase: p, company } = await invoiceData(actor, purchaseId);
  const t = TEXTS[locale];
  const euro = (c: number) => pdfSafe(formatEuro(c, locale));
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const right = 595.28 - MARGIN;
  let y = 841.89 - MARGIN;
  const text = (s: string, x: number, size = 10, f = font, color = INK) =>
    page.drawText(pdfSafe(s), { x, y, size, font: f, color });
  const textRight = (s: string, size = 10, f = font) =>
    page.drawText(pdfSafe(s), {
      x: right - f.widthOfTextAtSize(pdfSafe(s), size),
      y,
      size,
      font: f,
      color: INK,
    });

  text(t.title, MARGIN, 22, bold, PRIMARY);
  textRight(company.name || 'Tourneasy', 12, bold);
  y -= 16;
  for (const line of [
    ...company.address.split(/\r?\n|,\s*/).filter(Boolean),
    company.email,
    company.kvk && `${t.kvk} ${company.kvk}`,
    company.vatNumber && `${t.vatNumber} ${company.vatNumber}`,
    company.iban && `${t.iban} ${company.iban}`,
  ].filter(Boolean) as string[]) {
    textRight(line, 9);
    y -= 12;
  }

  y -= 20;
  const issued = p.paidAt ?? p.createdAt;
  text(`${t.number}: ${p.invoiceNumber ?? '-'}`, MARGIN);
  y -= 14;
  text(`${t.date}: ${formatDate(issued, locale)}`, MARGIN);
  y -= 24;
  text(t.to, MARGIN, 9, bold, MUTED);
  y -= 14;
  text(p.user.name, MARGIN);
  y -= 13;
  text(p.user.email, MARGIN, 9, font, MUTED);

  y -= 36;
  text(t.description, MARGIN, 9, bold, MUTED);
  textRight(t.amount, 9, bold);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: right, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 16;
  text(
    `${t.packages[p.packageKey]}${p.tournament ? ` - ${p.tournament.name}` : ''}`.slice(0, 90),
    MARGIN,
  );
  textRight(euro(p.priceCents));
  if (p.discountPercent > 0) {
    y -= 16;
    text(t.discount(p.discountPercent), MARGIN, 10, font, MUTED);
    textRight(`- ${euro(p.priceCents - p.netCents)}`);
  }
  y -= 22;
  text(t.net, 330);
  textRight(euro(p.netCents));
  y -= 16;
  text(t.vat(VAT_PERCENT), 330);
  textRight(euro(p.vatCents));
  y -= 8;
  page.drawLine({
    start: { x: 330, y },
    end: { x: right, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 16;
  text(t.total, 330, 11, bold);
  textRight(euro(p.totalCents), 11, bold);

  if (p.paidAt) {
    y -= 40;
    text(t.paid(formatDate(p.paidAt, locale)), MARGIN, 10, font, MUTED);
  }

  return {
    bytes: await doc.save(),
    filename: `${p.invoiceNumber ?? 'invoice'}.pdf`,
  };
}
