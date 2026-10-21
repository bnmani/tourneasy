import type { PublicPlayer } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Initials avatar; players have no photos until uploads arrive (D39). */
function Initials({ name }: { name: string }) {
  const parts = name.split(' ').filter(Boolean);
  const initials = `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
    >
      {initials}
    </span>
  );
}

export async function PlayerList({
  players,
  showClub = true,
}: {
  players: PublicPlayer[];
  locale: AppLocale;
  showClub?: boolean;
}) {
  const t = await getTranslations('Players');
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {players.map((p) => (
        <li
          key={p.memberNumber}
          className="relative flex items-center gap-3 p-4 focus-within:bg-muted/50 hover:bg-muted/40"
        >
          <Initials name={p.name} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/players/${p.memberNumber}`}
              className="font-semibold after:absolute after:inset-0 focus-visible:outline-none"
            >
              {p.name}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {p.memberNumber}
              {showClub && <> · {p.club?.name ?? t('noClub')}</>}
            </p>
          </div>
          {p.preferredDisciplines.length > 0 && (
            <span className="hidden text-xs font-semibold text-muted-foreground sm:block">
              {p.preferredDisciplines.join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export { Initials };
