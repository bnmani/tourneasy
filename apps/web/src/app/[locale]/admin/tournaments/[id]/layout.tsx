import { formatDayRange } from '@tourneasy/shared';
import { prisma } from '@tourneasy/db';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { TournamentBar } from '@/components/admin/tournament-bar';
import { pageLocale } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { foodAllowed } from '@/server/services/food-service';
import { canManageTournament } from '@/server/services/permissions';
import { managedTournaments } from '@/server/services/tournament-service';

/** Every tournament page in the portal gets the switcher and section tabs. */
export default async function TournamentAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  if (!(await canManageTournament(actor, id))) notFound();
  let tournaments = await managedTournaments(actor);
  // An archived (or very old) tournament isn't in the list: keep the one shown selectable.
  if (!tournaments.some((x) => x.id === id)) {
    const self = await prisma.tournament.findUnique({
      where: { id },
      select: { id: true, name: true, startsOn: true, endsOn: true, status: true },
    });
    if (self) tournaments = [self, ...tournaments];
  }
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <TournamentBar
        current={id}
        food={await foodAllowed(id)}
        tournaments={tournaments.map((x) => ({
          id: x.id,
          name: x.name,
          when: formatDayRange(day(x.startsOn), day(x.endsOn), locale),
        }))}
      />
      {children}
    </div>
  );
}
