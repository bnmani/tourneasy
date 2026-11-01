/**
 * Sign-up from an invitation link (D101, D102): the page it came from (?next=…) tells which
 * invitation, and so which address the link was sent to. With that address the account counts
 * as confirmed; the sign-up form also fills it in.
 */
import { invitedAddress } from './registration-service';
import { organiserInviteByToken } from './tournament-service';

const PARTNER = /^\/(?:nl|en)\/invites\/([A-Za-z0-9_-]{20,})$/;
const ORGANISER = /^\/(?:nl|en)\/organiser-invites\/([A-Za-z0-9_-]{20,})$/;

export async function invitedEmailFromNext(next: string | null | undefined) {
  const partner = PARTNER.exec(next ?? '')?.[1];
  if (partner) return invitedAddress(partner);
  const organiser = ORGANISER.exec(next ?? '')?.[1];
  if (organiser) return (await organiserInviteByToken(organiser))?.email ?? null;
  return null;
}
