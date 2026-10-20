/**
 * Minimal Excel (.xlsx) support for admin exports/imports: one sheet, text and number cells.
 * An .xlsx file is a zip of XML parts; fflate handles the zip, the XML is written/read here.
 * Reading supports what Excel, LibreOffice and Google Sheets write for plain tables
 * (shared strings, inline strings, numbers, booleans); formulas are read as their cached value.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_UNZIPPED_BYTES = 20_000_000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/** 0 → "A", 26 → "AA". */
function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** "AB12" → 27. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function cellXml(value: unknown, ref: string, bold: boolean): string {
  const style = bold ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  const text = value === null || value === undefined ? '' : String(value);
  if (text === '') return '';
  // Text cells are never interpreted as formulas, so no formula-injection escaping is needed.
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

/** Builds a single-sheet workbook with a bold, frozen header row and auto-filter. */
export function toXlsx(sheetName: string, header: string[], rows: unknown[][]): Uint8Array {
  const all = [header, ...rows];
  const lastCol = columnName(Math.max(header.length, 1) - 1);
  const widths = header.map((_, c) =>
    Math.min(50, Math.max(8, ...all.map((r) => String(r[c] ?? '').length + 2))),
  );
  const sheetRows = all
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r.map((v, c) => cellXml(v, `${columnName(c)}${i + 1}`, i === 0)).join('')}</row>`,
    )
    .join('');
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${sheetRows}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${all.length}"/>` +
    '</worksheet>';
  const name = escapeXml(sheetName.slice(0, 31));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
        `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${lastCol}$${all.length}</definedName></definedNames>` +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}

/** Zip files start with "PK\x03\x04". */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function textOf(xml: string): string {
  // Concatenate all <t> runs (rich text has several), ignoring phonetic <rPh> runs.
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g))
    out += m[1] ?? '';
  return unescapeXml(out);
}

/**
 * Reads the first worksheet into a grid of strings. Returns null when the bytes are not a
 * readable workbook. Numbers keep their raw value (e.g. date serials stay "34801").
 */
export function readXlsx(bytes: Uint8Array): string[][] | null {
  let files: Record<string, Uint8Array>;
  try {
    let total = 0;
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new Error('too large');
        return (
          f.name === 'xl/workbook.xml' ||
          f.name === 'xl/_rels/workbook.xml.rels' ||
          f.name === 'xl/sharedStrings.xml' ||
          f.name.startsWith('xl/worksheets/sheet')
        );
      },
    });
  } catch {
    return null;
  }

  const sheetPath = firstSheetPath(files);
  const sheetFile = sheetPath ? files[sheetPath] : undefined;
  if (!sheetFile) return null;

  const shared: string[] = [];
  const sst = files['xl/sharedStrings.xml'];
  if (sst)
    for (const m of strFromU8(sst).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));

  const grid: string[][] = [];
  const sheet = strFromU8(sheetFile);
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1]!)?.[1] ?? grid.length + 1);
    const row: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1]!;
      const body = cellMatch[2] ?? '';
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (raw !== undefined) value = unescapeXml(raw);
      while (row.length < col) row.push('');
      row[col] = value;
    }
    while (grid.length < rowNumber - 1) grid.push([]);
    grid[rowNumber - 1] = row;
    if (grid.length > 100_000) return null;
  }
  return grid;
}

function firstSheetPath(files: Record<string, Uint8Array>): string | undefined {
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (workbook && rels) {
    const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(strFromU8(workbook))?.[1];
    if (relId) {
      for (const m of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
        if (new RegExp(`\\bId="${relId}"`).test(m[1]!)) {
          const target = /\bTarget="([^"]+)"/.exec(m[1]!)?.[1];
          if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
        }
      }
    }
  }
  return Object.keys(files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort()[0];
}

/** Excel stores dates as days since 1899-12-30. "34801" → "1995-04-12". */
export function excelSerialToIsoDate(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const serial = Math.floor(Number(value));
  if (serial < 1 || serial > 2_958_465) return value;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}
