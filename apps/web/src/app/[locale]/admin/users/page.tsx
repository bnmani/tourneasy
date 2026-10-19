import { ASSIGNABLE_ROLES } from '@tourneasy/shared/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { changeRoleAction } from '@/server/actions/account-actions';
import { getActor, requireRole } from '@/server/auth/web';
import { listUsers } from '@/server/services/role-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  // Metadata renders alongside the layout's role check: don't reveal admin titles to others.
  if (!(await getActor())?.roles.includes('ADMIN')) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('users'), robots: { index: false } };
}

export default async function AdminUsersPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN', `/${locale}/admin/users`);
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const page = Number(firstParam(query.page) ?? '1') || 1;
  const status = firstParam(query.status);
  const result = await listUsers(actor, { q, page });

  const t = await getTranslations('Admin');
  const tr = await getTranslations('Roles');
  const returnTo = `/${locale}/admin/users${q ? `?${new URLSearchParams({ q })}` : ''}`;
  const pageHref = (p: number) =>
    `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('users')}</h1>
        <p className="mt-1 text-muted-foreground">{t('usersIntro')}</p>
      </header>

      {status === 'granted' && <FormSuccess>{t('granted')}</FormSuccess>}
      {status === 'revoked' && <FormSuccess>{t('revokedRole')}</FormSuccess>}
      {status && !['granted', 'revoked'].includes(status) && (
        <FormError state={{ error: status }} />
      )}

      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row"
        action={`/${locale}/admin/users`}
      >
        <label htmlFor="user-search" className="sr-only">
          {t('search')}
        </label>
        <input
          id="user-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:max-w-sm sm:text-sm"
        />
        <Button type="submit" variant="outline">
          {t('search')}
        </Button>
      </form>

      {result.users.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {result.users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {u.name}
                  {u.id === actor.userId && (
                    <span className="text-sm text-muted-foreground"> ({t('you')})</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {u.email}
                  {u.memberNumber && <> · {u.memberNumber}</>}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground"
                    >
                      {tr(r)}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ASSIGNABLE_ROLES.map((role) => {
                  const has = u.roles.includes(role);
                  return (
                    <form key={role} action={changeRoleAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="role" value={role} />
                      <input type="hidden" name="op" value={has ? 'revoke' : 'grant'} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" size="sm" variant={has ? 'outline' : 'secondary'}>
                        {has ? t('revoke', { role: tr(role) }) : t('grant', { role: tr(role) })}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {result.pages > 1 && (
        <nav
          aria-label={t('pageOf', { page: result.page, pages: result.pages })}
          className="flex items-center gap-3"
        >
          {result.page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page - 1)}>{t('previous')}</Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {t('pageOf', { page: result.page, pages: result.pages })}
          </span>
          {result.page < result.pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(result.page + 1)}>{t('next')}</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
