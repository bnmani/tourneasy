import { ASSIGNABLE_ROLES } from '@tourneasy/shared/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { Badge, FilterBar, filterInputClass, Pagination } from '@/components/admin/ui';
import { BulkRemove, SelectRow } from '@/components/admin/bulk-remove';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { cn } from '@/lib/utils';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { changeRoleAction, removeUsersAction } from '@/server/actions/account-actions';
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
  const tb = await getTranslations('Admin.usersBulk');
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
      {status === 'removed' && (
        <FormSuccess>
          {tb('removed', { count: Number(firstParam(query.count) ?? '0') })}
        </FormSuccess>
      )}
      {status && !['granted', 'revoked', 'removed'].includes(status) && (
        <FormError state={{ error: status }} />
      )}

      <FilterBar action={`/${locale}/admin/users`}>
        <label htmlFor="user-search" className="sr-only">
          {t('search')}
        </label>
        <input
          id="user-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className={cn(filterInputClass, 'sm:min-w-80')}
        />
        <Button type="submit" variant="outline">
          {t('search')}
        </Button>
      </FilterBar>

      <p className="text-sm text-muted-foreground">{t('total', { count: result.total })}</p>
      {result.users.length > 0 && (
        <BulkRemove
          formId="bulk-remove-users"
          texts="Admin.usersBulk"
          action={removeUsersAction}
          returnTo={returnTo}
        />
      )}
      {result.users.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ScrollRegion label={t('users')} className="rounded-lg border bg-card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="w-10 px-3 py-2">
                  <span className="sr-only">{tb('selectPage')}</span>
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('name')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('email')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('roles')}
                </th>
                {ASSIGNABLE_ROLES.map((role) => (
                  <th key={role} scope="col" className="px-3 py-2">
                    {t('grant', { role: tr(role).toLowerCase() })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.users.map((u) => (
                <tr key={u.id} className="align-middle">
                  <td className="px-3 py-2">
                    <SelectRow
                      formId="bulk-remove-users"
                      texts="Admin.usersBulk"
                      id={u.id}
                      name={u.name}
                      disabled={u.id === actor.userId || u.roles.some((r) => r !== 'PLAYER')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{u.name}</span>
                    {u.id === actor.userId && (
                      <span className="text-muted-foreground"> ({t('you')})</span>
                    )}
                    {u.memberNumber && (
                      <span className="block text-xs text-muted-foreground">{u.memberNumber}</span>
                    )}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r}>{tr(r)}</Badge>
                      ))}
                    </span>
                  </td>
                  {ASSIGNABLE_ROLES.map((role) => {
                    const has = u.roles.includes(role);
                    const label = has
                      ? t('revoke', { role: tr(role).toLowerCase() })
                      : t('grant', { role: tr(role).toLowerCase() });
                    return (
                      <td key={role} className="px-3 py-2">
                        <form action={changeRoleAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="role" value={role} />
                          <input type="hidden" name="op" value={has ? 'revoke' : 'grant'} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <Button
                            type="submit"
                            size="sm"
                            variant={has ? 'outline' : 'secondary'}
                            aria-label={`${label}: ${u.name}`}
                            title={label}
                          >
                            {has ? t('revokeShort') : t('grantShort')}
                          </Button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}

      <Pagination page={result.page} pages={result.pages} href={pageHref} />
    </div>
  );
}
