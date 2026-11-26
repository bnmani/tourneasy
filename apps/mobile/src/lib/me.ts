import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { apiGet } from '@/lib/api';
import { signedIn } from '@/lib/session';
import { courtName, type ScheduleMatch } from '@/lib/schedule';
import type { Localized } from '@/lib/tournaments';

/** One of my matches in a published schedule (GET /me/matches). */
export type MyMatch = ScheduleMatch & { tournament: { name: string; slug: string } };

/** One of my entries (GET /me/registrations). */
export type MyEntry = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'WAITLISTED';
  waitlistPosition: number | null;
  tournament: { slug: string; name: string; startsOn: string; endsOn: string };
  event: {
    discipline: string;
    /** Two languages, like every organiser-written name. */
    name: Localized;
    ageCategory: { code: string } | null;
    levelClass: { code: string } | null;
  };
  doubles: boolean;
  paymentStatus: string;
  partner: { name: string; memberNumber: string } | null;
  pendingInvite: { to: string } | null;
  lookingForPartner: boolean;
  past: boolean;
  /** My share of this entry, to pay. */
  participantId: string;
  amountDueCents: number | null;
  canPay: boolean;
  canWithdraw: boolean;
};

/** A public player (GET /players, /me/following). */
export type PublicPlayer = {
  memberNumber: string;
  name: string;
  club: { slug: string; name: string } | null;
  preferredDisciplines: string[];
  followerCount: number;
};

/** An optional email kind with on/off (GET /me/notification-preferences). */
export type EmailPreference = { type: string; enabled: boolean };

async function list<T>(path: string): Promise<T[]> {
  const body = await signedIn<{ data: T[] }>('GET', path);
  return body?.data ?? [];
}

export const fetchMyMatches = () => list<MyMatch>('/me/matches');
export const fetchMyEntries = () => list<MyEntry>('/me/registrations');
export const fetchFollowing = () => list<PublicPlayer>('/me/following');

export type Preferences = { email: EmailPreference[]; push: EmailPreference[] };

/** Email and push on/off for my account (GET /me/notification-preferences). */
export async function fetchPreferences(): Promise<Preferences> {
  const body = await signedIn<{ data: EmailPreference[]; push?: EmailPreference[] }>(
    'GET',
    '/me/notification-preferences',
  );
  return { email: body?.data ?? [], push: body?.push ?? [] };
}

/** Saves one switch; email kinds at the top level, push kinds under `push`. */
export async function savePreference(
  channel: 'email' | 'push',
  type: string,
  enabled: boolean,
): Promise<Preferences> {
  const body = await signedIn<{ data: EmailPreference[]; push?: EmailPreference[] }>(
    'PATCH',
    '/me/notification-preferences',
    channel === 'email' ? { [type]: enabled } : { push: { [type]: enabled } },
  );
  return { email: body?.data ?? [], push: body?.push ?? [] };
}

export async function fetchPlayer(memberNumber: string) {
  return signedIn<{ player: PublicPlayer; isSelf: boolean; following: boolean }>(
    'GET',
    `/players/${encodeURIComponent(memberNumber)}`,
  );
}

/** A public player's coming matches (GET /players/{memberNumber}/matches). */
export type PlayerMatch = Pick<
  ScheduleMatch,
  'id' | 'status' | 'event' | 'round' | 'a' | 'b' | 'court' | 'startsAt' | 'endsAt'
> & { tournament: { name: string; slug: string } };

export async function fetchPlayerMatches(
  memberNumber: string,
  locale: string,
): Promise<PlayerMatch[]> {
  const body = await apiGet<{ data: PlayerMatch[] }>(
    `/players/${encodeURIComponent(memberNumber)}/matches`,
    undefined,
    undefined,
    { 'Accept-Language': locale },
  );
  return body.data;
}

export async function setFollowing(memberNumber: string, follow: boolean): Promise<void> {
  await signedIn(follow ? 'PUT' : 'DELETE', `/players/${encodeURIComponent(memberNumber)}/follow`);
}

export { courtName };

/**
 * Downloads all my data (GET /me/export, the same JSON file as on the website) and opens the
 * share sheet, so the player can save it to Files, mail it or AirDrop it.
 */
export async function shareMyData(): Promise<void> {
  const data = await signedIn<unknown>('GET', '/me/export');
  if (!data) throw new Error('Your data could not be downloaded. Try again.');
  const name = `tourneasy-data-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
}
