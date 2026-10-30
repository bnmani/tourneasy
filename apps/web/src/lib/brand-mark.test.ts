import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markDataUrl } from './brand-mark';

describe('share image mark', () => {
  it('matches app/icon.svg', () => {
    const svg = readFileSync(join(__dirname, '../app/icon.svg'), 'utf8').trim();
    expect(Buffer.from(markDataUrl().split(',')[1]!, 'base64').toString()).toBe(svg);
  });
});
