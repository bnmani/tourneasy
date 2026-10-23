import { prisma, Role } from '@tourneasy/db';
import { PLAYER_CSV_COLUMNS, toCsv } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { importPlayersCsv } from './player-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

const row = (first: string, last: string, email: string, gender = 'MALE', fed = '') => {
  const values: Record<string, string> = {
    firstName: first,
    lastNamePrefix: '',
    lastName: last,
    email,
    phone: '0612345678',
    dateOfBirth: '1990-05-01',
    gender,
    club: '',
    federationId: fed,
    preferredEvents: 'HE',
  };
  return PLAYER_CSV_COLUMNS.map((c) => values[c] ?? '');
};

describe('player import (D60)', () => {
  it('keeps family members who share one email as separate players, and says so', async () => {
    const actor = await admin();
    const csv = toCsv(
      [...PLAYER_CSV_COLUMNS],
      [
        row('Rajesh', 'Kumar', 'family@example.test'),
        row('Priya', 'Kumar', 'family@example.test', 'FEMALE'),
        row('Daan', 'Jansen', 'daan@example.test'),
      ],
    );
    const first = await importPlayersCsv(actor, csv, meta);
    expect(first).toMatchObject({ created: 3, updated: 0, skipped: 0 });
    expect(first.rows[1]).toMatchObject({
      line: 3,
      name: 'Priya Kumar',
      outcome: 'created',
      note: 'sharedEmail',
    });
    expect(first.rows[1]!.sharedWith).toContain('Rajesh');

    // Importing the same file again updates the same three players, no duplicates.
    const again = await importPlayersCsv(actor, csv, meta);
    expect(again).toMatchObject({ created: 0, updated: 3, skipped: 0 });
    expect(again.rows.map((r) => r.note)).toEqual([
      'matchedEmailAndName',
      'matchedEmailAndName',
      'matchedEmailAndName',
    ]);
    expect(await prisma.playerProfile.count({ where: { lastName: 'Kumar' } })).toBe(2);
  });

  it('matches by federation ID even when the name is written differently', async () => {
    const actor = await admin();
    await importPlayersCsv(
      actor,
      toCsv([...PLAYER_CSV_COLUMNS], [row('Jose', 'Garcia', 'j@example.test', 'MALE', '123456')]),
      meta,
    );
    const res = await importPlayersCsv(
      actor,
      toCsv(
        [...PLAYER_CSV_COLUMNS],
        [row('José', 'García', 'other@example.test', 'MALE', '123456')],
      ),
      meta,
    );
    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect(res.rows[0]).toMatchObject({ outcome: 'updated', note: 'matchedFederationId' });
  });
});
