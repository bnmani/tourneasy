/**
 * Minimal RFC 4180 CSV reader/writer. Reads comma- or semicolon-separated files (Dutch
 * Excel uses ";"), with quotes, escaped quotes, CRLF and a UTF-8 BOM.
 */

export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Rows as objects keyed by the (trimmed, lower-cased) header row. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

function escapeCell(value: unknown, delimiter: string): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a BOM and ";" so it opens correctly in Dutch Excel. */
export function toCsv(header: string[], rows: unknown[][], delimiter = ';'): string {
  const lines = [header, ...rows].map((r) =>
    r.map((c) => escapeCell(c, delimiter)).join(delimiter),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
