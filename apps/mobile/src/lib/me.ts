import { signedIn } from '@/lib/session';
import type { Localized } from '@/lib/tournaments';

/** One of my matches in a published schedule (GET /me/matches). */
export type MyMatch = {
  id: string;
  number: number | null;
  status:
    | 'SCHEDULED'
    | 'CALLED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'WALKOVER'
    | 'RETIRED'
    | 'BYE'
    | 'CANCELLED';
  /** Category, already in the account's language, e.g. "Men's singles A". */
  event: string;
  round: string;
  a: string;
  b: string;
  aEntryId: string | null;
  bEntryId: string | null;
  winnerEntryId: string | null;
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
  court: { id: string; number: number; name: string | null } | null;
  startsAt: string | null;
  endsAt: string | null;
  /** 'new' or 'changed' after the schedule was published, else null. */
  changed: 'new' | 'changed' | null;
  tournament: { name: string; slug: string };
};

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
export const fetchEmailPreferences = () => list<EmailPreference>('/me/notification-preferences');

export async function saveEmailPreferences(
  values: Record<string, boolean>,
): Promise<EmailPreference[]> {
  const body = await signedIn<{ data: EmailPreference[] }>(
    'PATCH',
    '/me/notification-preferences',
    values,
  );
  return body?.data ?? [];
}

export async function fetchPlayer(memberNumber: string) {
  return signedIn<{ player: PublicPlayer; isSelf: boolean; following: boolean }>(
    'GET',
    `/players/${encodeURIComponent(memberNumber)}`,
  );
}

export async function setFollowing(memberNumber: string, follow: boolean): Promise<void> {
  await signedIn(follow ? 'PUT' : 'DELETE', `/players/${encodeURIComponent(memberNumber)}/follow`);
}

/** Court as text: its name when it has one, else its number. */
export function courtName(court: MyMatch['court']): string | null {
  if (!court) return null;
  return court.name || String(court.number);
}
