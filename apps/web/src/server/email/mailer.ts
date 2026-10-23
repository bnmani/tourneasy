import { prisma } from '@tourneasy/db';
import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { decryptSecret } from '../lib/secret-box';

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

/**
 * Where email goes:
 * - SMTP settings saved in the admin portal (Admin → E-mail, D58) win;
 * - else EMAIL_TRANSPORT: smtp (SMTP_HOST/SMTP_PORT/…; Mailpit locally), log (print to the
 *   server log) or memory (`outbox`, automated tests). Defaults to smtp when SMTP_HOST is set,
 *   otherwise log. EMAIL_TRANSPORT=memory always wins, so tests never send real email.
 */
type Mode = 'smtp' | 'log' | 'memory';

export const outbox: OutgoingMail[] = [];

/** SiteSetting key of the portal-managed SMTP settings (password encrypted). */
export const EMAIL_SETTINGS_KEY = 'email.smtp';

export type SmtpSecurity = 'tls' | 'starttls' | 'none';

export type StoredEmailSettings = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string | null;
  passwordBox: string | null;
  from: string;
  updatedById: string;
  updatedByName: string;
  updatedAt: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  user: string | null;
  password: string | null;
  from: string;
  source: 'portal' | 'environment';
};

const DEFAULT_FROM = 'Tourneasy <no-reply@tourneasy.app>';
const CACHE_MS = 60_000;
let cached: { config: SmtpConfig | null; transporter: Transporter | null; until: number } | null =
  null;

/** SMTP settings from the portal, else from the environment; null = no SMTP. */
export async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: EMAIL_SETTINGS_KEY } });
  const stored = row?.value as StoredEmailSettings | undefined;
  if (stored?.host) {
    const password = stored.passwordBox ? decryptSecret(stored.passwordBox) : null;
    if (stored.passwordBox && password === null) {
      console.error('[email] stored SMTP password cannot be decrypted (server secret changed?)');
    }
    return { ...stored, password, source: 'portal' };
  }
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    security: port === 465 ? 'tls' : 'starttls',
    user: process.env.SMTP_USER ?? null,
    password: process.env.SMTP_PASSWORD ?? null,
    from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
    source: 'environment',
  };
}

/** Domain of the sender address: "Tourneasy <no-reply@tourneasy.app>" → "tourneasy.app". */
export function senderDomain(from: string): string {
  return from.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? 'tourneasy.app';
}

export function createSmtpTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    // Greet the mail server as the sender's domain, not the web server's own host name
    // (a mismatch counts against the email in spam filters).
    name: senderDomain(config.from),
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
    connectionTimeout: 15_000,
  });
}

/** After the settings change: the next email uses the new settings. */
export function resetMailerCache() {
  cached = null;
}

async function current() {
  if (cached && cached.until > Date.now()) return cached;
  const config = await loadSmtpConfig();
  cached = {
    config,
    transporter: config ? createSmtpTransport(config) : null,
    until: Date.now() + CACHE_MS,
  };
  return cached;
}

async function mode(): Promise<Mode> {
  const configured = process.env.EMAIL_TRANSPORT;
  if (configured === 'memory') return 'memory';
  const { config } = await current();
  if (config?.source === 'portal') return 'smtp';
  if (configured === 'smtp' || configured === 'log') return configured;
  return config ? 'smtp' : 'log';
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  switch (await mode()) {
    case 'memory':
      outbox.push(mail);
      return;
    case 'log':
      console.info(
        '[email:log]',
        JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text }),
      );
      return;
    case 'smtp': {
      const { config, transporter } = await current();
      if (!config || !transporter) throw new Error('SMTP is not configured');
      await transporter.sendMail({
        from: config.from,
        // Message-ID in the sender's domain, matching From and the DKIM signature.
        messageId: `<${randomUUID()}@${senderDomain(config.from)}>`,
        ...mail,
      });
    }
  }
}

/**
 * Account emails must not break the user's action (sign-up, reset request) when the mail
 * server hiccups; failures are logged and the user can ask for the email again.
 */
export async function sendMailSafely(mail: OutgoingMail): Promise<void> {
  try {
    await sendMail(mail);
  } catch (error) {
    console.error('[email] sending failed', { to: mail.to, subject: mail.subject, error });
  }
}

let verifierOverride: ((config: SmtpConfig) => string | null) | undefined;

/** Tests: replace the SMTP login check (return an error message, or null when it works). */
export function setSmtpVerifierForTests(fn: ((config: SmtpConfig) => string | null) | undefined) {
  verifierOverride = fn;
}

/** Connects and logs in to check the settings; returns the server's error, or null when OK. */
export async function verifySmtp(config: SmtpConfig): Promise<string | null> {
  if (verifierOverride) return verifierOverride(config);
  try {
    await createSmtpTransport(config).verify();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.slice(0, 200) : 'error';
  }
}
