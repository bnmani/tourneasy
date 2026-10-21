/** iCalendar (RFC 5545) export of a tournament as one all-day event spanning its days. */
import type { PublicTournament } from '@tourneasy/shared';

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded with CRLF + space (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const compactDate = (isoDay: string) => isoDay.replace(/-/g, '');

export function tournamentIcs(t: PublicTournament, request: Request): string {
  const origin = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, '');
  const url = `${origin}/nl/tournaments/${t.slug}`;
  // DTEND of an all-day event is exclusive: the day after the last tournament day.
  const end = new Date(`${t.endsOn}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const location = t.venue
    ? `${t.venue.name}, ${t.venue.street} ${t.venue.houseNumber}, ${t.venue.postcode} ${t.venue.city}`
    : '';
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tourneasy//Tournaments//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.slug}@tourneasy.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(t.startsOn)}`,
    `DTEND;VALUE=DATE:${compactDate(end.toISOString().slice(0, 10))}`,
    `SUMMARY:${escapeText(t.name)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    `URL:${url}`,
    `DESCRIPTION:${escapeText(url)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
