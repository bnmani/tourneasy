import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './env';

describe('parseServerEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseServerEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects a missing DATABASE_URL with a readable message', () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });
});
