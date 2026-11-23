import { describe, expect, it } from 'vitest';
import { markDataUrl } from './brand-mark';

describe('share image mark', () => {
  it('is an SVG data URL for emails and share images', () => {
    const svg = Buffer.from(markDataUrl().split(',')[1]!, 'base64').toString();
    expect(markDataUrl().startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(svg).toContain('viewBox="0 0 40 40"');
  });
});
