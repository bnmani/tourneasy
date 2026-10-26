/**
 * Email template editor (D69): admins change the subject and texts of each email per language.
 * Only the texts change; layout, logo and the data filled in stay the app's. A text may use
 * the placeholders of its default ({name}, {tournament}, …) and no others; an empty text or
 * the default itself means "use the default". Every save, reset and test send is logged.
 */
import { prisma } from '@tourneasy/db';
import { formatDate, formatDayRange } from '@tourneasy/shared';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { createTranslator } from 'next-intl';
import {
  EMAIL_TEMPLATE_KEYS,
  isEmailTemplateKind,
  sampleTemplate,
  sharedWith,
  type EmailTemplateKind,
} from '../email/catalogue';
import { sendMail } from '../email/mailer';
import { renderEmailWith, type Template } from '../email/templates';
import { clearEmailTextCache, emailTextOverrides } from '../email/text-overrides';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import { enforce } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { emailLogo } from './logo-service';
import { maskOwners, ownerPrivacy } from './admin-service';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

const MAX_TEXT = 2000;
const MAX_SUBJECT = 200;

const defaults = (locale: AppLocale) => messages[locale].Email as Record<string, string>;
export const placeholdersOf = (text: string) => [
  ...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)),
];

function parseTarget(kind: string, locale: string): [EmailTemplateKind, AppLocale] {
  if (!isEmailTemplateKind(kind) || (locale !== 'nl' && locale !== 'en'))
    throw new AppError('notFound');
  return [kind, locale];
}

/** All emails with how many of their texts were changed, per language. */
export async function listEmailTemplates(actor: Actor) {
  assertAdmin(actor);
  const overrides = await prisma.emailTextOverride.findMany({
    select: { locale: true, key: true, updatedAt: true },
  });
  return Object.entries(EMAIL_TEMPLATE_KEYS).map(([kind, keys]) => {
    const mine = overrides.filter((o) => keys.includes(o.key));
    return {
      kind: kind as EmailTemplateKind,
      changed: {
        nl: mine.filter((o) => o.locale === 'nl').length,
        en: mine.filter((o) => o.locale === 'en').length,
      },
      updatedAt: mine.length ? new Date(Math.max(...mine.map((o) => o.updatedAt.getTime()))) : null,
    };
  });
}

/** One email in one language: each text with its default, current value and placeholders. */
export async function getEmailTemplate(actor: Actor, kind: string, locale: string) {
  assertAdmin(actor);
  const [k, l] = parseTarget(kind, locale);
  const overrides = (await emailTextOverrides())[l];
  return EMAIL_TEMPLATE_KEYS[k].map((key) => ({
    key,
    defaultText: defaults(l)[key]!,
    text: overrides[key] ?? defaults(l)[key]!,
    changed: key in overrides,
    placeholders: placeholdersOf(defaults(l)[key]!),
    sharedWith: sharedWith(k, key),
  }));
}

/**
 * Checks a draft: only this email's keys, lengths, the default's placeholders, valid syntax.
 * Returns the texts that differ from the default (to store) and those back to default.
 */
function checkDraft(kind: EmailTemplateKind, locale: AppLocale, input: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  const changed: Record<string, string> = {};
  const unchanged: string[] = [];
  for (const key of EMAIL_TEMPLATE_KEYS[kind]) {
    const raw = input[key];
    const text = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : '';
    const fallback = defaults(locale)[key]!;
    if (!text || text === fallback) {
      unchanged.push(key);
      continue;
    }
    const subject = key.endsWith('Subject');
    if (text.length > (subject ? MAX_SUBJECT : MAX_TEXT)) {
      fields[key] = 'tooLong';
      continue;
    }
    if (subject && text.includes('\n')) {
      fields[key] = 'templateOneLine';
      continue;
    }
    const allowed = placeholdersOf(fallback);
    if (placeholdersOf(text).some((p) => !allowed.includes(p))) {
      fields[key] = 'templatePlaceholder';
      continue;
    }
    // Format once with sample values: catches unbalanced braces and other syntax errors.
    let broken = false;
    createTranslator({
      locale,
      messages: { Email: { [key]: text } },
      namespace: 'Email',
      onError: () => {
        broken = true;
      },
    })(key as never, Object.fromEntries(allowed.map((p) => [p, 'x'])) as never);
    if (broken) {
      fields[key] = 'templateSyntax';
      continue;
    }
    changed[key] = text;
  }
  if (Object.keys(fields).length) throw validationError(fields);
  return { changed, unchanged };
}

/** Saves the texts of one email in one language. */
export async function saveEmailTemplate(
  actor: Actor,
  kind: string,
  locale: string,
  input: Record<string, unknown>,
  meta: RequestMeta,
) {
  assertAdmin(actor);
  const [k, l] = parseTarget(kind, locale);
  const { changed, unchanged } = checkDraft(k, l, input);
  const before = (await emailTextOverrides())[l];
  await prisma.$transaction(async (tx) => {
    for (const [key, text] of Object.entries(changed)) {
      await tx.emailTextOverride.upsert({
        where: { locale_key: { locale: l, key } },
        create: { locale: l, key, text, updatedById: actor.userId },
        update: { text, updatedById: actor.userId },
      });
    }
    await tx.emailTextOverride.deleteMany({ where: { locale: l, key: { in: unchanged } } });
    const diff = EMAIL_TEMPLATE_KEYS[k].filter(
      (key) => (before[key] ?? null) !== (changed[key] ?? null),
    );
    if (diff.length)
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'settings.emailTemplate.update',
        entityType: 'EmailTemplate',
        entityId: `${k}:${l}`,
        before: Object.fromEntries(diff.map((key) => [key, before[key] ?? null])),
        after: Object.fromEntries(diff.map((key) => [key, changed[key] ?? null])),
        meta,
      });
  });
  clearEmailTextCache();
}

/** Back to the default texts for one email in one language. */
export async function resetEmailTemplate(
  actor: Actor,
  kind: string,
  locale: string,
  meta: RequestMeta,
) {
  assertAdmin(actor);
  const [k, l] = parseTarget(kind, locale);
  await prisma.$transaction(async (tx) => {
    const removed = await tx.emailTextOverride.findMany({
      where: { locale: l, key: { in: [...EMAIL_TEMPLATE_KEYS[k]] } },
    });
    await tx.emailTextOverride.deleteMany({
      where: { locale: l, key: { in: [...EMAIL_TEMPLATE_KEYS[k]] } },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.emailTemplate.reset',
      entityType: 'EmailTemplate',
      entityId: `${k}:${l}`,
      before: Object.fromEntries(removed.map((r) => [r.key, r.text])),
      meta,
    });
  });
  clearEmailTextCache();
}

/** The email with example data and the draft texts (not saved). */
export async function previewEmailTemplate(
  actor: Actor,
  kind: string,
  locale: string,
  draft: Record<string, unknown>,
  to = 'voorbeeld@example.test',
  tournamentId?: string | null,
) {
  assertAdmin(actor);
  const [k, l] = parseTarget(kind, locale);
  const { changed, unchanged } = checkDraft(k, l, draft);
  const sample = await withTournament(sampleTemplate(k, l, appUrl(l, '/')), l, tournamentId);
  const saved = { ...(await emailTextOverrides())[l] };
  for (const key of unchanged) delete saved[key];
  const mail = renderEmailWith(
    { ...saved, ...changed },
    to,
    l,
    sample,
    // Show the unsubscribe links where an email can have them.
    k === 'common' || ['tournamentReminder', 'deadlineReminder', 'results', 'news'].includes(k)
      ? {
          unsubscribeUrl: appUrl(l, '/unsubscribe'),
          preferencesUrl: appUrl(l, '/account/notifications'),
        }
      : {},
  );
  return { subject: mail.subject, html: mail.html, text: mail.text };
}

/** Tournaments to preview with (newest first). */
export async function previewTournaments(actor: Actor) {
  assertAdmin(actor);
  return prisma.tournament.findMany({
    where: { deletedAt: null },
    orderBy: { startsOn: 'desc' },
    take: 50,
    select: { id: true, name: true },
  });
}

/**
 * The example data with a real tournament's name, dates, venue, page and logo, so the
 * preview and test show the email as that tournament's players would get it.
 */
async function withTournament(sample: Template, locale: AppLocale, tournamentId?: string | null) {
  if (!tournamentId || !('tournament' in sample)) return sample;
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      startsOn: true,
      endsOn: true,
      venue: { select: { name: true, street: true, houseNumber: true, city: true } },
    },
  });
  if (!t) return sample;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    ...sample,
    tournament: t.name,
    url: appUrl(locale, `/tournaments/${t.slug}`),
    logo: await emailLogo(t.id, t.name),
    ...(sample.kind === 'tournamentReminder'
      ? {
          when: formatDayRange(day(t.startsOn), day(t.endsOn), locale, 'long'),
          venue: t.venue
            ? `${t.venue.name}, ${t.venue.street} ${t.venue.houseNumber}, ${t.venue.city}`
            : null,
          firstMatch: `${formatDate(t.startsOn, locale)} 10:30 · ${locale === 'nl' ? 'baan' : 'court'} 3`,
        }
      : {}),
  } as Template;
}

/** Sends the preview to the admin's own address. */
export async function sendEmailTemplateTest(
  actor: Actor,
  kind: string,
  locale: string,
  draft: Record<string, unknown>,
  meta: RequestMeta,
  tournamentId?: string | null,
) {
  assertAdmin(actor);
  await enforce(`templatetest:user:${actor.userId}`, { limit: 10, windowSeconds: 15 * 60 });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { email: true },
  });
  const preview = await previewEmailTemplate(actor, kind, locale, draft, user.email, tournamentId);
  try {
    await sendMail(
      {
        to: user.email,
        subject: `[Test] ${preview.subject}`,
        text: preview.text,
        html: preview.html,
      },
      { always: true },
    );
  } catch (error) {
    // Show the mail server's reason, as the email settings page does.
    throw new AppError('smtpRejected', {
      reason: error instanceof Error ? error.message.slice(0, 200) : 'error',
    });
  }
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'settings.emailTemplate.test',
    entityType: 'EmailTemplate',
    entityId: `${kind}:${locale}`,
    after: { to: user.email },
    meta,
  });
  return user.email;
}

/** Last changes for the overview page. */
export async function emailTemplateLog(actor: Actor) {
  assertAdmin(actor);
  const privacy = await ownerPrivacy(actor);
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'EmailTemplate' },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      action: true,
      entityId: true,
      createdAt: true,
      actorId: true,
      actor: { select: { name: true } },
    },
  });
  return maskOwners(entries, privacy.owners);
}
