import { signedIn } from '@/lib/session';
import type { Localized } from '@/lib/tournaments';

/** One message in my notification list (GET /me/notifications). */
export type InboxItem = {
  id: string;
  type: string;
  title: Localized;
  body: Localized;
  /** Where tapping it goes, e.g. '/tournaments/slug/schedule'. */
  url: string | null;
  createdAt: string;
  read: boolean;
};

export type Inbox = { items: InboxItem[]; unread: number };

export async function fetchInbox(): Promise<Inbox> {
  const body = await signedIn<{ data: Inbox }>('GET', '/me/notifications');
  return body?.data ?? { items: [], unread: 0 };
}

/** Marks these messages read, or all of mine when no ids are given. */
export async function markRead(ids?: string[]): Promise<void> {
  await signedIn('POST', '/me/notifications/read', ids ? { ids } : {});
}
