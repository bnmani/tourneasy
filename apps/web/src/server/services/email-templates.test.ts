import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '@/server/email/mailer';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { clearEmailTextCache } from '../email/text-overrides';
import { requestPasswordReset } from './auth-service';
import {
  getEmailTemplate,
  previewEmailTemplate,
  resetEmailTemplate,
  saveEmailTemplate,
  sendEmailTemplateTest,
} from './email-template-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(async () => {
  await resetDatabase();
  clearEmailTextCache();
});

async function actorFor(userId: string) {
  return (await actorFromWebToken((await createWebSession(userId, meta, true)).token))!;
}

describe('email template editor (D69)', () => {
  it('changes the texts of real emails per language, checked, logged and resettable', async () => {
    const admin = await createPlayer();
    await prisma.userRole.create({ data: { userId: admin.userId, role: Role.ADMIN } });
    const actor = await actorFor(admin.userId);
    const player = await createPlayer({ email: 'anna@example.test' });

    // Players can't open the editor.
    await expect(
      getEmailTemplate(await actorFor(player.userId), 'resetPassword', 'nl'),
    ).rejects.toMatchObject({ code: 'forbidden' });

    // Unknown placeholders, broken braces and multi-line subjects are refused.
    await expect(
      saveEmailTemplate(actor, 'resetPassword', 'nl', { resetSubject: 'Hoi {tournament}' }, meta),
    ).rejects.toMatchObject({ details: { fields: { resetSubject: 'templatePlaceholder' } } });
    await expect(
      saveEmailTemplate(actor, 'verifyEmail', 'nl', { verifyBody: 'Je nummer: {number' }, meta),
    ).rejects.toMatchObject({ details: { fields: { verifyBody: 'templateSyntax' } } });
    await expect(
      saveEmailTemplate(actor, 'resetPassword', 'nl', { resetSubject: 'Twee\nregels' }, meta),
    ).rejects.toMatchObject({ details: { fields: { resetSubject: 'templateOneLine' } } });

    await saveEmailTemplate(
      actor,
      'resetPassword',
      'nl',
      {
        resetSubject: 'Je nieuwe Tourneasy-wachtwoord',
        resetBody: '',
        resetButton: 'Kies wachtwoord',
      },
      meta,
    );
    const texts = await getEmailTemplate(actor, 'resetPassword', 'nl');
    expect(texts.find((x) => x.key === 'resetSubject')).toMatchObject({ changed: true });
    expect(texts.find((x) => x.key === 'resetBody')).toMatchObject({ changed: false });

    // A real email uses the new text in Dutch; English keeps the default.
    outbox.length = 0;
    await requestPasswordReset({ email: 'anna@example.test' }, meta);
    expect(outbox.at(-1)).toMatchObject({ subject: 'Je nieuwe Tourneasy-wachtwoord' });
    expect(outbox.at(-1)!.html).toContain('Kies wachtwoord');
    // No tournament logo: the Tourneasy mark heads the email.
    expect(outbox.at(-1)!.html).toContain('/email/tourneasy-mark.png');
    const en = await previewEmailTemplate(actor, 'resetPassword', 'en', {});
    expect(en.subject).toBe('Choose a new password');

    // Preview shows a draft without saving it; the test goes to the admin only.
    const draft = await previewEmailTemplate(actor, 'schedule', 'nl', {
      scheduleSubject: 'Speeltijden {tournament}',
    });
    expect(draft.subject).toBe('Speeltijden Utrecht Open');
    expect((await getEmailTemplate(actor, 'schedule', 'nl'))[0]).toMatchObject({ changed: false });
    outbox.length = 0;
    await sendEmailTemplateTest(
      actor,
      'schedule',
      'nl',
      { scheduleSubject: 'Speeltijden {tournament}' },
      meta,
    );
    expect(outbox.map((m) => [m.to, m.subject])).toEqual([
      [admin.email, '[Test] Speeltijden Utrecht Open'],
    ]);

    // A real tournament for the preview: its name, page and dates instead of the example.
    const t = await prisma.tournament.create({
      data: {
        name: 'Almere Open',
        slug: 'almere-open',
        startsOn: new Date('2027-05-08'),
        endsOn: new Date('2027-05-09'),
        registrationOpensAt: new Date('2027-01-01'),
        registrationClosesAt: new Date('2027-04-01'),
        entryDeadline: new Date('2027-04-01'),
        withdrawalDeadline: new Date('2027-04-01'),
      },
    });
    const real = await previewEmailTemplate(actor, 'tournamentReminder', 'nl', {}, undefined, t.id);
    expect(real.subject).toBe('Binnenkort: Almere Open');
    expect(real.text).toContain('/nl/tournaments/almere-open');
    expect(real.text).toContain('8 mei 2027');

    // Saving the default text again (or resetting) brings back the default.
    await resetEmailTemplate(actor, 'resetPassword', 'nl', meta);
    expect(await prisma.emailTextOverride.count()).toBe(0);
    outbox.length = 0;
    await requestPasswordReset({ email: 'anna@example.test' }, meta);
    expect(outbox.at(-1)!.subject).toBe('Nieuw wachtwoord kiezen');

    expect(
      (
        await prisma.auditLog.findMany({
          where: { entityType: 'EmailTemplate' },
          orderBy: { createdAt: 'asc' },
        })
      ).map((l) => [l.action, l.entityId]),
    ).toEqual([
      ['settings.emailTemplate.update', 'resetPassword:nl'],
      ['settings.emailTemplate.test', 'schedule:nl'],
      ['settings.emailTemplate.reset', 'resetPassword:nl'],
    ]);
  });
});
