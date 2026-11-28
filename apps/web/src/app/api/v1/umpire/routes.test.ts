import { createHmac } from 'node:crypto';
import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '@/test/db';
import { signInUmpire } from '@/server/services/umpire-service';
import { claimCourt } from '@/server/services/umpire-court-service';
import { POST as signIn } from './sign-in/route';
import { GET as listCourts } from './courts/route';
import { DELETE as release, POST as claim } from './courts/[courtId]/claim/route';
import { POST as start } from './matches/[matchId]/start/route';
import { POST as events } from './matches/[matchId]/events/route';
import { POST as finish } from './matches/[matchId]/finish/route';
import { POST as takeover } from './takeovers/route';
import { POST as answer } from './takeovers/[requestId]/answer/route';

vi.mock('server-only', () => ({}));

beforeEach(resetDatabase);

const hmacForTest = (purpose: string, value: string) =>
  createHmac('sha256', process.env.UMPIRE_TOKEN_SECRET!)
    .update(`${purpose}:${value}`)
    .digest('base64url');

const URL_BASE = 'http://localhost/api/v1/umpire';
let n = 0;
const uuid = () => crypto.randomUUID();

function req(
  path: string,
  init: { method?: string; token?: string; device?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-real-ip': '10.0.0.1',
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.device !== '') headers['x-device-id'] = init.device ?? 'dev-1';
  return new Request(`${URL_BASE}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

async function setup() {
  n += 1;
  const venue = await prisma.venue.create({
    data: {
      name: `Hal ${n}`,
      slug: `hal-${n}`,
      street: 'Sportlaan',
      houseNumber: '1',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 2,
    },
  });
  const today = new Date();
  const tournament = await prisma.tournament.create({
    data: {
      name: `Toernooi ${n}`,
      slug: `toernooi-${n}`,
      venueId: venue.id,
      startsOn: today,
      endsOn: today,
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2026-02-01'),
      entryDeadline: new Date('2026-02-01'),
      withdrawalDeadline: new Date('2026-02-01'),
    },
  });
  const court1 = await prisma.court.create({ data: { venueId: venue.id, number: 1 } });
  const court2 = await prisma.court.create({ data: { venueId: venue.id, number: 2 } });
  const event = await prisma.tournamentEvent.create({
    data: {
      tournamentId: tournament.id,
      discipline: 'DE',
      feeCents: 0,
      bestOf: 1,
      pointsToWin: 3,
      pointsCap: 5,
    },
  });
  const draw = await prisma.draw.create({
    data: { eventId: event.id, type: 'KNOCKOUT', size: 2, status: 'PUBLISHED' },
  });
  const match = await prisma.match.create({
    data: { drawId: draw.id, round: 1, matchNumber: 1, status: 'CALLED' },
  });
  await prisma.courtSlot.create({
    data: {
      tournamentId: tournament.id,
      courtId: court1.id,
      matchId: match.id,
      startsAt: new Date(Date.now() - 600_000),
      endsAt: new Date(Date.now() + 3_000_000),
    },
  });
  async function umpire(name: string, device: string) {
    n += 1;
    const qrToken = `qr-token-${n}-0123456789abcdef`;
    const row = await prisma.umpire.create({
      data: {
        tournamentId: tournament.id,
        displayName: name,
        pinHash: hmacForTest('pin', String(100000 + n)),
        qrTokenHash: hmacForTest('qr', qrToken),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const s = await signInUmpire({ qrToken }, device);
    return { row, token: s.sessionToken, device, pin: String(100000 + n), qrToken };
  }
  const anna = await umpire('Anna', 'dev-anna');
  const bram = await umpire('Bram', 'dev-bram');
  return { court1, court2, match, anna, bram };
}
const as = (u: { token: string; device: string }) => ({ token: u.token, device: u.device });

describe('sign-in', () => {
  it('signs in with a PIN in the body', async () => {
    const s = await setup();
    const res = await signIn(
      req('/sign-in', { body: { pin: s.anna.pin, deviceId: 'dev-anna' } }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('sessionToken');
  });
  it('signs in with a QR token in the body', async () => {
    const s = await setup();
    const res = await signIn(
      req('/sign-in', { body: { qrToken: s.bram.qrToken, deviceId: 'dev-bram' } }),
      undefined,
    );
    expect(res.status).toBe(200);
  });
  it('401 for a wrong PIN, 422 for a bad shape or both credentials', async () => {
    await setup();
    expect(
      (await signIn(req('/sign-in', { body: { pin: '000000', deviceId: 'd' } }), undefined)).status,
    ).toBe(401);
    expect(
      (await signIn(req('/sign-in', { body: { pin: 'abc', deviceId: 'd' } }), undefined)).status,
    ).toBe(422);
    expect(
      (
        await signIn(
          req('/sign-in', { body: { pin: '123456', qrToken: 'x'.repeat(20), deviceId: 'd' } }),
          undefined,
        )
      ).status,
    ).toBe(422);
    expect((await signIn(req('/sign-in', { body: { pin: '123456' } }), undefined)).status).toBe(
      422,
    );
  });
});

describe('session', () => {
  it('401 without a token, with a bad token, with a token in the query string, or the wrong device', async () => {
    const s = await setup();
    expect((await listCourts(req('/courts', { method: 'GET' }), undefined)).status).toBe(401);
    expect(
      (await listCourts(req('/courts', { method: 'GET', token: 'junk.junk' }), undefined)).status,
    ).toBe(401);
    const viaQuery = new Request(`${URL_BASE}/courts?token=${s.anna.token}`, {
      headers: { 'x-device-id': 'dev-anna' },
    });
    expect((await listCourts(viaQuery, undefined)).status).toBe(401);
    expect(
      (
        await listCourts(
          req('/courts', { method: 'GET', token: s.anna.token, device: 'other' }),
          undefined,
        )
      ).status,
    ).toBe(401);
  });
});

describe('courts', () => {
  it('lists courts', async () => {
    const s = await setup();
    const res = await listCourts(req('/courts', { method: 'GET', ...as(s.anna) }), undefined);
    expect(res.status).toBe(200);
    expect((await res.json()).courts).toHaveLength(2);
  });
  it('claims a court; 409 when held by another; 422 for a bad id; release works', async () => {
    const s = await setup();
    const c = (id: string) => ctx({ courtId: id });
    expect((await claim(req('/x', { ...as(s.anna) }), c(s.court1.id))).status).toBe(200);
    const taken = await claim(req('/x', { ...as(s.bram) }), c(s.court1.id));
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.code).toBe('COURT_HELD');
    expect((await claim(req('/x', { ...as(s.bram) }), c('not-a-uuid'))).status).toBe(422);
    expect(
      (await release(req('/x', { method: 'DELETE', ...as(s.anna) }), c(s.court1.id))).status,
    ).toBe(200);
  });
});

describe('matches', () => {
  const m = (id: string) => ctx({ matchId: id });
  const point = (seq: number, side: 'A' | 'B') => ({ id: uuid(), seq, kind: 'POINT', side });

  it('start, events and finish for the holder', async () => {
    const s = await setup();
    await claimCourt(s.anna.row.id, s.court1.id);
    expect(
      (await start(req('/s', { ...as(s.anna), body: { serving: 'A' } }), m(s.match.id))).status,
    ).toBe(200);
    const res = await events(
      req('/e', { ...as(s.anna), body: { events: [point(1, 'A'), point(2, 'A'), point(3, 'A')] } }),
      m(s.match.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      'applied',
      'duplicates',
      'games',
      'serving',
      'version',
    ]);
    expect(body.applied).toBe(3);
    const fin = await finish(req('/f', { ...as(s.anna) }), m(s.match.id));
    expect(fin.status).toBe(200);
    expect((await fin.json()).status).toBe('AWAITING_DESK');
  });
  it('finish before the match is decided is 409', async () => {
    const s = await setup();
    await claimCourt(s.anna.row.id, s.court1.id);
    await start(req('/s', { ...as(s.anna), body: { serving: 'A' } }), m(s.match.id));
    expect((await finish(req('/f', { ...as(s.anna) }), m(s.match.id))).status).toBe(409);
  });
  it('403 or 409 for an umpire who does not hold the court', async () => {
    const s = await setup();
    await claimCourt(s.anna.row.id, s.court1.id);
    const res = await events(
      req('/e', { ...as(s.bram), body: { events: [point(1, 'A')] } }),
      m(s.match.id),
    );
    expect(res.status).toBe(409);
    const free = await setup();
    const none = await start(
      req('/s', { ...as(free.bram), body: { serving: 'A' } }),
      m(free.match.id),
    );
    expect(none.status).toBe(403);
  });
  it('422 for bad ids and bad shapes, before the service', async () => {
    const s = await setup();
    await claimCourt(s.anna.row.id, s.court1.id);
    const a = as(s.anna);
    expect((await start(req('/s', { ...a, body: { serving: 'A' } }), m('nope'))).status).toBe(422);
    expect((await start(req('/s', { ...a, body: { serving: 'C' } }), m(s.match.id))).status).toBe(
      422,
    );
    expect(
      (
        await events(
          req('/e', { ...a, body: { events: [{ id: 'x', seq: 1, kind: 'POINT', side: 'A' }] } }),
          m(s.match.id),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await events(
          req('/e', { ...a, body: { events: [{ id: uuid(), seq: 1, kind: 'POINT' }] } }),
          m(s.match.id),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await events(
          req('/e', { ...a, body: { events: [{ id: uuid(), seq: 1, kind: 'UNDO', side: 'A' }] } }),
          m(s.match.id),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await events(
          req('/e', {
            ...a,
            body: { events: [{ id: uuid(), seq: 1.5, kind: 'POINT', side: 'A' }] },
          }),
          m(s.match.id),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await events(
          req('/e', { ...a, body: { events: [{ id: uuid(), seq: 1, kind: 'WIN', side: 'A' }] } }),
          m(s.match.id),
        )
      ).status,
    ).toBe(422);
    expect((await finish(req('/f', { ...a }), m('nope'))).status).toBe(422);
  });
});

describe('takeovers', () => {
  it('request, answer, and the error cases', async () => {
    const s = await setup();
    await claimCourt(s.anna.row.id, s.court1.id);
    expect(
      (await takeover(req('/t', { ...as(s.bram), body: { courtId: 'nope' } }), undefined)).status,
    ).toBe(422);
    expect(
      (await takeover(req('/t', { ...as(s.anna), body: { courtId: s.court1.id } }), undefined))
        .status,
    ).toBe(409);
    const made = await takeover(
      req('/t', { ...as(s.bram), body: { courtId: s.court1.id } }),
      undefined,
    );
    expect(made.status).toBe(201);
    const { id } = await made.json();
    const a = (u: typeof s.anna, body: unknown, rid = id) =>
      answer(req('/a', { ...as(u), body }), ctx({ requestId: rid }));
    expect((await a(s.anna, { answer: 'MAYBE' })).status).toBe(422);
    expect((await a(s.anna, { answer: 'ACCEPT' }, 'nope')).status).toBe(422);
    expect((await a(s.bram, { answer: 'ACCEPT' })).status).toBe(403);
    expect((await a(s.anna, { answer: 'ACCEPT' })).status).toBe(200);
    expect((await a(s.anna, { answer: 'ACCEPT' })).status).toBe(409);
  });
});

describe('errors', () => {
  it('validation is 422 VALIDATION with details.fields', async () => {
    const s = await setup();
    const res = await claim(req('/x', { ...as(s.anna) }), ctx({ courtId: 'nope' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details.fields).toEqual({ id: 'invalid' });
  });
  it('an unmapped AppError is logged by code and uses its own status', async () => {
    const { umpireError } = await import('@/server/lib/umpire-api');
    const { AppError } = await import('@/server/lib/errors');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = umpireError(new AppError('emailTaken'));
    expect(res.status).toBe(409);
    expect(spy).toHaveBeenCalledWith(
      '[umpire-api] unmapped error code',
      expect.objectContaining({ code: 'emailTaken' }),
    );
    spy.mockRestore();
  });
  it('a 500 carries no internal detail', async () => {
    const { umpireError } = await import('@/server/lib/umpire-api');
    const res = umpireError(new Error('secret db detail postgres://user:pass@host'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret|postgres/);
  });
});
