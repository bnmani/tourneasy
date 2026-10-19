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
  | { kind: 'roleChanged'; name: string; role: string; granted: boolean };

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
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#1f6b45;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(button.url)}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#1d2b24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1f6b45">Tourneasy</p>
${body}${cta}
${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7a72">${escapeHtml(footer)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

export function renderEmail(to: string, locale: AppLocale, template: Template): OutgoingMail {
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Email' });
  const greeting = t('greeting', { name: template.name });
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
  }

  const text = [
    ...paragraphs,
    ...(button ? [`${button.label}: ${button.url}`] : []),
    '',
    footer,
  ].join('\n\n');
  return { to, subject, text, html: layout(paragraphs, button, footer) };
}
