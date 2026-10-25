/**
 * Which texts make up which email (D69), for the template editor: the editable keys under
 * `Email.*` per email, and example data for the preview and test send. Keys shared by several
 * emails (e.g. the "My entries" button) change in all of them.
 */
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Template } from './templates';

export const EMAIL_TEMPLATE_KINDS = [
  'common',
  'verifyEmail',
  'resetPassword',
  'accountInvite',
  'passwordChanged',
  'roleChanged',
  'entryConfirmed',
  'partnerInvite',
  'inviteAccepted',
  'inviteDeclined',
  'waitlistPromoted',
  'entryWithdrawn',
  'paymentReceipt',
  'refund',
  'schedule',
  'tournamentReminder',
  'deadlineReminder',
  'results',
  'news',
  'settingsTest',
] as const;
export type EmailTemplateKind = (typeof EMAIL_TEMPLATE_KINDS)[number];

export const EMAIL_TEMPLATE_KEYS: Record<EmailTemplateKind, readonly string[]> = {
  common: ['greeting', 'greetingAnon', 'footer', 'unsubscribe', 'preferences'],
  verifyEmail: ['verifySubject', 'verifyBody', 'verifyButton'],
  resetPassword: ['resetSubject', 'resetBody', 'ignore', 'resetButton'],
  accountInvite: [
    'accountInviteSubject',
    'accountInviteBody',
    'accountInviteIgnore',
    'accountInviteButton',
    'accountInviteFooter',
  ],
  passwordChanged: ['passwordChangedSubject', 'passwordChangedBody'],
  roleChanged: ['roleChangedSubject', 'roleGranted', 'roleRevoked'],
  entryConfirmed: ['entrySubject', 'entryIntro', 'entryPayNow', 'entryPay', 'entryButton'],
  partnerInvite: ['inviteSubject', 'inviteBody', 'inviteButton'],
  inviteAccepted: ['inviteAcceptedSubject', 'inviteAcceptedBody', 'entryButton'],
  inviteDeclined: ['inviteDeclinedSubject', 'inviteDeclinedBody', 'entryButton'],
  waitlistPromoted: ['promotedSubject', 'promotedBody', 'entryButton'],
  entryWithdrawn: ['withdrawnSubject', 'withdrawnBody', 'withdrawnByPartnerBody'],
  paymentReceipt: ['receiptSubject', 'receiptIntro', 'receiptTotal', 'receiptOrder', 'entryButton'],
  refund: [
    'refundSubject',
    'refundRequested',
    'refundProcessed',
    'refundRejected',
    'receiptOrder',
    'entryButton',
  ],
  schedule: [
    'scheduleSubject',
    'scheduleBody',
    'scheduleChangedSubject',
    'scheduleChangedBody',
    'scheduleNote',
    'scheduleButton',
  ],
  tournamentReminder: [
    'reminderSubject',
    'reminderBody',
    'reminderVenue',
    'reminderFirstMatch',
    'reminderCheckIn',
    'scheduleButton',
  ],
  deadlineReminder: ['deadlineSubject', 'deadlineBody', 'entryButton'],
  results: ['resultsSubject', 'resultsBody', 'resultsMatches', 'resultsThanks', 'resultsButton'],
  news: ['newsButton'],
  settingsTest: [
    'settingsTestSubject',
    'settingsTestBody',
    'settingsTestNote',
    'settingsTestButton',
  ],
};

export const isEmailTemplateKind = (v: string): v is EmailTemplateKind =>
  (EMAIL_TEMPLATE_KINDS as readonly string[]).includes(v);

/** Other emails that use the same text. */
export function sharedWith(kind: EmailTemplateKind, key: string): EmailTemplateKind[] {
  return EMAIL_TEMPLATE_KINDS.filter((k) => k !== kind && EMAIL_TEMPLATE_KEYS[k].includes(key));
}

/** Example data for the preview and the test send. */
export function sampleTemplate(kind: EmailTemplateKind, locale: AppLocale, url: string): Template {
  const nl = locale === 'nl';
  const name = 'Sanne';
  const tournament = 'Utrecht Open';
  const event = nl ? 'Damesdubbel · Senioren · B' : "Women's doubles · Seniors · B";
  switch (kind) {
    case 'common':
    case 'settingsTest':
      return { kind: 'settingsTest', name, url };
    case 'verifyEmail':
      return { kind, name, memberNumber: 'TE100123', url };
    case 'resetPassword':
      return { kind, name, url };
    case 'accountInvite':
      return { kind, name, memberNumber: 'TE100123', url };
    case 'passwordChanged':
      return { kind, name };
    case 'roleChanged':
      return { kind, name, role: nl ? 'organisator' : 'organiser', granted: true };
    case 'entryConfirmed':
      return {
        kind,
        name,
        tournament,
        lines: [nl ? `${event}: bevestigd` : `${event}: confirmed`],
        url,
        payWithinMinutes: 30,
      };
    case 'partnerInvite':
      return { kind, name, from: 'Emma Mulder', tournament, event, url };
    case 'inviteAccepted':
    case 'inviteDeclined':
      return { kind, name, partner: 'Emma Mulder', tournament, event, url };
    case 'waitlistPromoted':
      return { kind, name, tournament, event, url };
    case 'entryWithdrawn':
      return { kind, name, tournament, event, byPartner: false };
    case 'paymentReceipt':
      return {
        kind,
        name,
        tournament,
        orderNumber: 'TO-2026-0042',
        lines: [`${event}: € 12,50`],
        total: '€ 12,50',
        method: 'IDEAL',
        url,
      };
    case 'refund':
      return {
        kind,
        state: 'processed',
        name,
        tournament,
        amount: '€ 12,50',
        orderNumber: 'TO-2026-0042',
        url,
      };
    case 'schedule':
      return {
        kind,
        name,
        tournament,
        changed: false,
        matches: [
          `${nl ? 'za 13 mrt' : 'Sat 13 Mar'} 10:30 · ${nl ? 'baan' : 'court'} 3 · ${event} · ${nl ? 'Poule A · ronde 1' : 'Group A · round 1'} · ${nl ? 'tegen' : 'vs'} Bos / Visser`,
        ],
        url,
      };
    case 'tournamentReminder':
      return {
        kind,
        name,
        tournament,
        when: nl ? 'za 13 en zo 14 maart 2027' : 'Sat 13 and Sun 14 March 2027',
        venue: 'Sporthal De Shuttle, Sportlaan 1, Utrecht',
        firstMatch: `${nl ? 'za 13 mrt' : 'Sat 13 Mar'} 10:30 · ${nl ? 'baan' : 'court'} 3`,
        url,
      };
    case 'deadlineReminder':
      return {
        kind,
        name,
        tournament,
        deadline: nl ? '27 feb 2027 23:59' : '27 Feb 2027 23:59',
        items: [nl ? `${event}: nog te betalen` : `${event}: still to pay`],
        url,
      };
    case 'results':
      return {
        kind,
        name,
        tournament,
        placings: [nl ? `${event}: 2e plaats` : `${event}: 2nd place`],
        matches: [`${event}: ${nl ? 'gewonnen tegen' : 'won vs'} Bos / Visser (21-15, 21-18)`],
        url,
      };
    case 'news':
      return {
        kind,
        name,
        tournament,
        title: nl ? 'Parkeren' : 'Parking',
        body: nl ? 'Parkeer bij de achteringang.' : 'Please park at the back entrance.',
        url,
      };
  }
}
