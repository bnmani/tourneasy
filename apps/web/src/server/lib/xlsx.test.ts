import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readXlsx, toXlsxBook } from './xlsx';

describe('xlsx workbook (D79)', () => {
  it('writes several sheets with safe, unique names', () => {
    const bytes = toXlsxBook([
      { name: 'Alles', header: ['A'], rows: [[1]] },
      { name: 'za 13 mrt: dag/1', header: ['A'], rows: [[2]] },
      { name: 'Alles', header: ['A'], rows: [[3]] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).filter((f) => f.startsWith('xl/worksheets/'))).toHaveLength(3);
    const workbook = strFromU8(files['xl/workbook.xml']!);
    expect(workbook).toContain('name="Alles"');
    expect(workbook).toContain('name="za 13 mrt  dag 1"');
    expect(workbook).toContain('name="Alles (2)"');
    expect(readXlsx(bytes)).toEqual([['A'], ['1']]);
  });
});
