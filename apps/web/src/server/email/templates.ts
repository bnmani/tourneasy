/**
 * Transactional emails in the recipient's language. Texts live in packages/shared
 * (Email.*). Plain, inline-styled HTML for broad client support; React Email templates
 * replace these in Phase 7.
 */
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { createTranslator } from 'next-intl';
import type { OutgoingMail } from './mailer';

type Template =
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

function layout(paragraphs: string[], button?: { label: string; url: string }, footer?: string) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join('');
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#2e4a67;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(button.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#0f1e33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#2e4a67">Tourneasy</p>
${body}${cta}
${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#4a5568">${escapeHtml(footer)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

export function renderEmail(to: string, locale: AppLocale, template: Template): OutgoingMail {
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
  return { to, subject, text, html: layout(paragraphs, button, footer) };
}
