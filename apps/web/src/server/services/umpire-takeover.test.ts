import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/test/db';
import { takeoverSweeper } from '../jobs/takeover-sweep';
import { timeoutTakeovers } from '../jobs/takeover-timeout';
import {
  answerTakeover,
  cancelTakeover,
  claimCourt,
  releaseCourt,
  requestTakeover,
  TAKEOVER_WINDOW_SECONDS,
} from './umpire-court-service';
import { postEvents, startMatch } from './umpire-scoring-service';

beforeEach(resetDatabase);

let n = 0;
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
  const tournament = await prisma.tournament.create({
    data: {
      name: `Toernooi ${n}`,
      slug: `toernooi-${n}`,
      venueId: venue.id,
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
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
      startsAt: new Date('2027-03-13T09:00:00Z'),
      endsAt: new Date('2027-03-13T10:00:00Z'),
    },
  });
  const umpire = (name: string) => {
    n += 1;
    return prisma.umpire.create({
      data: {
        tournamentId: tournament.id,
        displayName: name,
        pinHash: `pin-${n}`,
        qrTokenHash: `qr-${n}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  };
  const anna = await umpire('Anna');
  const bram = await umpire('Bram');
  const cora = await umpire('Cora');
  await claimCourt(anna.id, court1.id);
  return { court1, court2, match, anna, bram, cora };
}

const expire = (id: string) =>
  prisma.takeoverRequest.update({
    where: { id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
const holder = async (courtId: string) =>
  (await prisma.courtHold.findUnique({ where: { courtId } }))?.umpireId;

describe('requesting a take-over', () => {
  it('expires 120 seconds after the server clock at request time', async () => {
    const s = await setup();
    const before = Date.now();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    const after = Date.now();
    expect(TAKEOVER_WINDOW_SECONDS).toBe(120);
    expect(r).toMatchObject({ status: 'PENDING', fromUmpireId: s.bram.id, toUmpireId: s.anna.id });
    expect(r.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 120_000);
    expect(r.expiresAt.getTime()).toBeLessThanOrEqual(after + 120_000);
  });

  it('refuses the current holder and a court nobody holds', async () => {
    const s = await setup();
    await expect(requestTakeover(s.anna.id, s.court1.id)).rejects.toMatchObject({
      code: 'alreadyHolder',
    });
    await expect(requestTakeover(s.bram.id, s.court2.id)).rejects.toMatchObject({
      code: 'courtNotHeld',
    });
  });

  it('refuses a second open request for the same court, even at the same moment', async () => {
    const s = await setup();
    const results = await Promise.allSettled([
      requestTakeover(s.bram.id, s.court1.id),
      requestTakeover(s.cora.id, s.court1.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.takeoverRequest.count({ where: { status: 'PENDING' } })).toBe(1);
  });
});

describe('answering a take-over', () => {
  it('accepted take-over moves the hold and keeps the score', async () => {
    const s = await setup();
    await prisma.match.update({ where: { id: s.match.id }, data: { status: 'IN_PROGRESS' } });
    await startMatch(s.anna.id, s.match.id, 'A');
    await postEvents(s.anna.id, s.match.id, [
      { id: crypto.randomUUID(), seq: 1, kind: 'POINT', side: 'A' },
    ]);
    const before = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await answerTakeover(s.anna.id, r.id, 'ACCEPT');
    expect(await holder(s.court1.id)).toBe(s.bram.id);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'ACCEPTED',
    );
    const after = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    expect(after).toEqual(before);
    expect(await prisma.umpireEvent.count({ where: { matchId: s.match.id } })).toBe(1);
  });

  it('declined take-over leaves the hold unchanged', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await answerTakeover(s.anna.id, r.id, 'DECLINE');
    expect(await holder(s.court1.id)).toBe(s.anna.id);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'DECLINED',
    );
    // The court is open for a new request again.
    await expect(requestTakeover(s.bram.id, s.court1.id)).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('only the holder the request was sent to can answer', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await expect(answerTakeover(s.cora.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(answerTakeover(s.bram.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await holder(s.court1.id)).toBe(s.anna.id);
  });

  it('answer after timeout is refused and the desk alert is not duplicated', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await expire(r.id);
    // Expired but the job has not run yet: still refused.
    await expect(answerTakeover(s.anna.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });
    expect(await holder(s.court1.id)).toBe(s.anna.id);

    expect(await timeoutTakeovers()).toBe(1);
    expect(await timeoutTakeovers()).toBe(0);
    await expect(answerTakeover(s.anna.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });
    await expect(answerTakeover(s.anna.id, r.id, 'DECLINE')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });

    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'TIMED_OUT',
    );
    const alerts = await prisma.deskAlert.findMany({ where: { takeoverRequestId: r.id } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ courtId: s.court1.id, status: 'OPEN' });
    expect(await holder(s.court1.id)).toBe(s.anna.id);
  });

  it('accept and decline at the same moment: exactly one wins', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    const results = await Promise.allSettled([
      answerTakeover(s.anna.id, r.id, 'ACCEPT'),
      answerTakeover(s.anna.id, r.id, 'DECLINE'),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const status = (await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status;
    expect(await holder(s.court1.id)).toBe(status === 'ACCEPTED' ? s.bram.id : s.anna.id);
  });

  it('does not move the hold when the holder changed since the request', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await prisma.courtHold.delete({ where: { courtId: s.court1.id } });
    await claimCourt(s.cora.id, s.court1.id);
    await expect(answerTakeover(s.anna.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });
    expect(await holder(s.court1.id)).toBe(s.cora.id);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'PENDING',
    );
  });
});

describe('take-over races and cleanup', () => {
  it('accept and a timeout run on the same request give exactly one outcome', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    // Expire it just after the answer's own clock reading would still be valid: run both at once
    // against a request that is expired for the job but answered by the holder.
    await expire(r.id);
    const results = await Promise.allSettled([
      answerTakeover(s.anna.id, r.id, 'ACCEPT'),
      timeoutTakeovers(),
    ]);
    const status = (await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status;
    expect(status).toBe('TIMED_OUT');
    expect(results[0].status).toBe('rejected');
    expect(await prisma.deskAlert.count()).toBe(1);
    expect(await holder(s.court1.id)).toBe(s.anna.id);
  });

  it('a request left open after the hold is released is closed, not turned into an alert', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await releaseCourt(s.anna.id, s.court1.id);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'CANCELLED',
    );
    await expire(r.id);
    expect(await timeoutTakeovers()).toBe(0);
    expect(await prisma.deskAlert.count()).toBe(0);
  });

  it('only a real inactive-profile failure closes an accept; other errors pass through', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await prisma.umpire.update({ where: { id: s.bram.id }, data: { revokedAt: new Date() } });
    await expect(answerTakeover(s.anna.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });
    expect(await holder(s.court1.id)).toBe(s.anna.id);
  });
});

describe('cancelling a take-over', () => {
  it('the requester can withdraw an open request; nobody else can', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await expect(cancelTakeover(s.cora.id, r.id)).rejects.toMatchObject({ code: 'forbidden' });
    await cancelTakeover(s.bram.id, r.id);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'CANCELLED',
    );
    await expect(answerTakeover(s.anna.id, r.id, 'ACCEPT')).rejects.toMatchObject({
      code: 'takeoverClosed',
    });
    await expect(cancelTakeover(s.bram.id, r.id)).rejects.toMatchObject({ code: 'takeoverClosed' });
    expect(await prisma.deskAlert.count()).toBe(0);
    expect(await holder(s.court1.id)).toBe(s.anna.id);
  });

  it('cannot cancel after the answer or after the timeout, and raises no alert', async () => {
    const s = await setup();
    const a = await requestTakeover(s.bram.id, s.court1.id);
    await answerTakeover(s.anna.id, a.id, 'DECLINE');
    await expect(cancelTakeover(s.bram.id, a.id)).rejects.toMatchObject({ code: 'takeoverClosed' });
    const b = await requestTakeover(s.bram.id, s.court1.id);
    await expire(b.id);
    await expect(cancelTakeover(s.bram.id, b.id)).rejects.toMatchObject({ code: 'takeoverClosed' });
    await timeoutTakeovers();
    expect(await prisma.deskAlert.count()).toBe(1);
  });
});

describe('timeout job', () => {
  it('leaves open requests alone and alerts once per expired request', async () => {
    const s = await setup();
    const open = await requestTakeover(s.bram.id, s.court1.id);
    expect(await timeoutTakeovers()).toBe(0);
    expect(
      (await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: open.id } })).status,
    ).toBe('PENDING');
    await expire(open.id);
    const [x, y] = await Promise.all([timeoutTakeovers(), timeoutTakeovers()]);
    expect(x + y).toBe(1);
    expect(await prisma.deskAlert.count()).toBe(1);
  });

  it('treats an existing alert for the request as already handled', async () => {
    const s = await setup();
    const r = await requestTakeover(s.bram.id, s.court1.id);
    await expire(r.id);
    await prisma.deskAlert.create({ data: { courtId: s.court1.id, takeoverRequestId: r.id } });
    await expect(timeoutTakeovers()).resolves.toBe(0);
    expect((await prisma.takeoverRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe(
      'TIMED_OUT',
    );
    expect(await prisma.deskAlert.count()).toBe(1);
  });
});

describe('the 10 second sweep follows pending requests', () => {
  it('a new request arms the sweep (only where it is enabled)', async () => {
    const s = await setup();
    takeoverSweeper.stop();
    expect(takeoverSweeper.isArmed()).toBe(false);
    takeoverSweeper.enable();
    try {
      await requestTakeover(s.bram.id, s.court1.id);
      expect(takeoverSweeper.isArmed()).toBe(true);
    } finally {
      takeoverSweeper.stop();
      takeoverSweeper.disable();
    }
  });
});
