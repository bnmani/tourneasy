/**
 * Transactional emails in the recipient's language. Texts live in packages/shared
 * (Email.*). Plain, inline-styled HTML (tables, no external CSS) for broad client support;
 * lines starting with "• " become a list. Optional emails (D62) carry an unsubscribe link and
 * the List-Unsubscribe headers for one-click unsubscribe.
 */
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { createTranslator } from 'next-intl';
import type { OutgoingMail } from './mailer';

/** A tournament's own logo at the top of its emails (D67). */
export type EmailLogo = { url: string; width: number; height: number; alt: string };

export type Template = TemplateBody & { logo?: EmailLogo | null };

type TemplateBody =
  | { kind: 'verifyEmail'; name: string; memberNumber: string; url: string }
  | { kind: 'resetPassword'; name: string; url: string }
  | { kind: 'passwordChanged'; name: string }
  | { kind: 'roleChanged'; name: string; role: string; granted: boolean }
  | {
      kind: 'entryConfirmed';
      name: string;
      tournament: string;
      lines: string[];
      url: string;
      /** Minutes left to pay when online payment is on; otherwise the "payment follows" note. */
      payWithinMinutes?: number;
    }
  | {
      kind: 'partnerInvite';
      name: string;
      from: string;
      tournament: string;
      event: string;
      url: string;
    }
  | {
      kind: 'inviteAccepted' | 'inviteDeclined';
      name: string;
      partner: string;
      tournament: string;
      event: string;
      url: string;
    }
  | { kind: 'waitlistPromoted'; name: string; tournament: string; event: string; url: string }
  | { kind: 'entryWithdrawn'; name: string; tournament: string; event: string; byPartner: boolean }
  | {
      kind: 'paymentReceipt';
      name: string;
      tournament: string;
      orderNumber: string;
      lines: string[];
      total: string;
      method: 'IDEAL' | 'CARD' | 'BANCONTACT' | 'MANUAL' | 'OTHER';
      url: string;
    }
  | { kind: 'settingsTest'; name: string; url: string }
  | {
      kind: 'schedule';
      name: string;
      tournament: string;
      /** First publication, or a change after it. */
      changed: boolean;
      matches: string[];
      url: string;
    }
  | {
      kind: 'tournamentReminder';
      name: string;
      tournament: string;
      when: string;
      venue: string | null;
      firstMatch: string | null;
      url: string;
    }
  | {
      kind: 'deadlineReminder';
      name: string;
      tournament: string;
      deadline: string;
      items: string[];
      url: string;
    }
  | {
      kind: 'results';
      name: string;
      tournament: string;
      placings: string[];
      matches: string[];
      url: string;
    }
  | { kind: 'news'; name: string; tournament: string; title: string; body: string; url: string }
  | {
      kind: 'refund';
      state: 'requested' | 'processed' | 'rejected';
      name: string;
      tournament: string;
      amount: string;
      orderNumber: string;
      url: string;
    };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphHtml(paragraphs: string[]) {
  // Consecutive "• " lines become one list; other lines are paragraphs (line breaks kept).
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length === 0) return;
    out.push(
      `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${list
        .map((l) => `<li style="margin:0 0 6px">${escapeHtml(l)}</li>`)
        .join('')}</ul>`,
    );
    list = [];
  };
  for (const p of paragraphs) {
    if (p.startsWith('• ')) list.push(p.slice(2));
    else {
      flush();
      out.push(
        `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
      );
    }
  }
  flush();
  return out.join('');
}

/** Logo shown 56px high (at most 240px wide), with fixed dimensions for Outlook. */
function logoHtml(logo: EmailLogo) {
  let height = 56;
  let width = Math.round((logo.width / logo.height) * height);
  if (width > 240) {
    height = Math.round((240 / width) * height);
    width = 240;
  }
  return `<p style="margin:0 0 12px"><img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt)}" width="${width}" height="${height}" style="display:block;border:0;outline:none;width:${width}px;height:${height}px"></p>`;
}

function layout(
  paragraphs: string[],
  button?: { label: string; url: string },
  footer?: string,
  links?: { label: string; url: string }[],
  logo?: EmailLogo | null,
) {
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#2e4a67;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(button.url)}</p>`
    : '';
  const footerLinks = (links ?? [])
    .map((l) => `<a href="${escapeHtml(l.url)}" style="color:#4a5568">${escapeHtml(l.label)}</a>`)
    .join(' · ');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#0f1e33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
${logo ? logoHtml(logo) : ''}<p style="margin:0 0 20px;font-size:${logo ? 13 : 20}px;font-weight:700;color:#2e4a67">Tourneasy</p>
${paragraphHtml(paragraphs)}${cta}
${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#4a5568">${escapeHtml(footer)}</p>` : ''}
${footerLinks ? `<p style="margin:8px 0 0;font-size:12px;color:#4a5568">${footerLinks}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

/** Links for optional emails (D62): unsubscribe from this kind, and the preferences page. */
export type EmailOptions = { unsubscribeUrl?: string; preferencesUrl?: string };

export function renderEmail(
  to: string,
  locale: AppLocale,
  template: Template,
  options: EmailOptions = {},
): OutgoingMail {
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
  const greeting = template.name ? t('greeting', { name: template.name }) : t('greetingAnon');
  const footer = t('footer');

  let subject: string;
  let paragraphs: string[];
  let button: { label: string; url: string } | undefined;

  switch (template.kind) {
    case 'verifyEmail':
      subject = t('verifySubject');
      paragraphs = [greeting, t('verifyBody', { number: template.memberNumber })];
      button = { label: t('verifyButton'), url: template.url };
      break;
    case 'resetPassword':
      subject = t('resetSubject');
      paragraphs = [greeting, t('resetBody'), t('ignore')];
      button = { label: t('resetButton'), url: template.url };
      break;
    case 'passwordChanged':
      subject = t('passwordChangedSubject');
      paragraphs = [greeting, t('passwordChangedBody')];
      break;
    case 'roleChanged':
      subject = t('roleChangedSubject');
      paragraphs = [
        greeting,
        template.granted
          ? t('roleGranted', { role: template.role })
          : t('roleRevoked', { role: template.role }),
      ];
      break;
    case 'entryConfirmed':
      subject = t('entrySubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        t('entryIntro', { tournament: template.tournament }),
        ...template.lines.map((line) => `• ${line}`),
        template.payWithinMinutes
          ? t('entryPayNow', { minutes: template.payWithinMinutes })
          : t('entryPay'),
      ];
      button = { label: t('entryButton'), url: template.url };
      break;
    case 'partnerInvite':
      subject = t('inviteSubject', { from: template.from, tournament: template.tournament });
      paragraphs = [
        greeting,
        t('inviteBody', {
          from: template.from,
          event: template.event,
          tournament: template.tournament,
        }),
      ];
      button = { label: t('inviteButton'), url: template.url };
      break;
    case 'inviteAccepted':
    case 'inviteDeclined': {
      const accepted = template.kind === 'inviteAccepted';
      const params = {
        partner: template.partner,
        event: template.event,
        tournament: template.tournament,
      };
      subject = accepted ? t('inviteAcceptedSubject', params) : t('inviteDeclinedSubject', params);
      paragraphs = [
        greeting,
        accepted ? t('inviteAcceptedBody', params) : t('inviteDeclinedBody', params),
      ];
      button = { label: t('entryButton'), url: template.url };
      break;
    }
    case 'waitlistPromoted':
      subject = t('promotedSubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        t('promotedBody', { event: template.event, tournament: template.tournament }),
      ];
      button = { label: t('entryButton'), url: template.url };
      break;
    case 'entryWithdrawn': {
      const params = { event: template.event, tournament: template.tournament };
      subject = t('withdrawnSubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        template.byPartner ? t('withdrawnByPartnerBody', params) : t('withdrawnBody', params),
      ];
      break;
    }
    case 'paymentReceipt': {
      const params = { tournament: template.tournament, orderNumber: template.orderNumber };
      subject = t('receiptSubject', params);
      paragraphs = [
        greeting,
        t('receiptIntro', params),
        ...template.lines.map((line) => `• ${line}`),
        t('receiptTotal', { total: template.total, method: t(`method${template.method}`) }),
        t('receiptOrder', params),
      ];
      button = { label: t('entryButton'), url: template.url };
      break;
    }
    case 'settingsTest':
      subject = t('settingsTestSubject');
      paragraphs = [greeting, t('settingsTestBody'), t('settingsTestNote')];
      button = { label: t('settingsTestButton'), url: template.url };
      break;
    case 'schedule':
      subject = t(template.changed ? 'scheduleChangedSubject' : 'scheduleSubject', {
        tournament: template.tournament,
      });
      paragraphs = [
        greeting,
        t(template.changed ? 'scheduleChangedBody' : 'scheduleBody', {
          tournament: template.tournament,
        }),
        ...template.matches.map((m) => `• ${m}`),
        t('scheduleNote'),
      ];
      button = { label: t('scheduleButton'), url: template.url };
      break;
    case 'tournamentReminder':
      subject = t('reminderSubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        t('reminderBody', { tournament: template.tournament, when: template.when }),
        ...(template.venue ? [`• ${t('reminderVenue', { venue: template.venue })}`] : []),
        ...(template.firstMatch
          ? [`• ${t('reminderFirstMatch', { match: template.firstMatch })}`]
          : []),
        t('reminderCheckIn'),
      ];
      button = { label: t('scheduleButton'), url: template.url };
      break;
    case 'deadlineReminder':
      subject = t('deadlineSubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        t('deadlineBody', { tournament: template.tournament, deadline: template.deadline }),
        ...template.items.map((i) => `• ${i}`),
      ];
      button = { label: t('entryButton'), url: template.url };
      break;
    case 'results':
      subject = t('resultsSubject', { tournament: template.tournament });
      paragraphs = [
        greeting,
        t('resultsBody', { tournament: template.tournament }),
        ...template.placings.map((p) => `• ${p}`),
        ...(template.matches.length ? [t('resultsMatches')] : []),
        ...template.matches.map((m) => `• ${m}`),
        t('resultsThanks'),
      ];
      button = { label: t('resultsButton'), url: template.url };
      break;
    case 'news':
      subject = `${template.title} – ${template.tournament}`;
      paragraphs = [greeting, template.title, template.body];
      button = { label: t('newsButton'), url: template.url };
      break;
    case 'refund': {
      const params = { amount: template.amount, tournament: template.tournament };
      subject = t('refundSubject', {
        orderNumber: template.orderNumber,
        tournament: template.tournament,
      });
      const body = {
        requested: t('refundRequested', params),
        processed: t('refundProcessed', params),
        rejected: t('refundRejected', params),
      }[template.state];
      paragraphs = [greeting, body, t('receiptOrder', { orderNumber: template.orderNumber })];
      button = { label: t('entryButton'), url: template.url };
      break;
    }
  }

  const text = [
    ...paragraphs,
    ...(button ? [`${button.label}: ${button.url}`] : []),
    '',
    footer,
  ].join('\n\n');
  const links = [
    ...(options.unsubscribeUrl ? [{ label: t('unsubscribe'), url: options.unsubscribeUrl }] : []),
    ...(options.preferencesUrl ? [{ label: t('preferences'), url: options.preferencesUrl }] : []),
  ];
  const mail: OutgoingMail = {
    to,
    subject,
    text: links.length ? `${text}\n\n${links.map((l) => `${l.label}: ${l.url}`).join('\n')}` : text,
    html: layout(paragraphs, button, footer, links, template.logo),
  };
  if (options.unsubscribeUrl) {
    // One-click unsubscribe (RFC 8058): mail apps show their own "unsubscribe" button.
    mail.headers = {
      'List-Unsubscribe': `<${options.unsubscribeUrl.replace('/unsubscribe?', '/api/v1/unsubscribe?')}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  return mail;
}
