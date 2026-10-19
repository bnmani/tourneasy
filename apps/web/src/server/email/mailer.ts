import nodemailer, { type Transporter } from 'nodemailer';

export type OutgoingMail = { to: string; subject: string; text: string; html: string };

/**
 * EMAIL_TRANSPORT:
 * - smtp   — send via SMTP_HOST/SMTP_PORT (Mailpit locally, a real provider in production)
 * - log    — print to the server log (test server without SMTP; links appear in runtime logs)
 * - memory — keep in `outbox` (automated tests)
 * Defaults to smtp when SMTP_HOST is set, otherwise log.
 */
type Mode = 'smtp' | 'log' | 'memory';

export const outbox: OutgoingMail[] = [];

let transporter: Transporter | undefined;

function mode(): Mode {
  const configured = process.env.EMAIL_TRANSPORT;
  if (configured === 'smtp' || configured === 'log' || configured === 'memory') return configured;
  return process.env.SMTP_HOST ? 'smtp' : 'log';
}

function smtp(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  switch (mode()) {
    case 'memory':
      outbox.push(mail);
      return;
    case 'log':
      console.info(
        '[email:log]',
        JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text }),
      );
      return;
    case 'smtp':
      await smtp().sendMail({
        from: process.env.EMAIL_FROM ?? 'Tourneasy <no-reply@tourneasy.app>',
        ...mail,
      });
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
