import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** "Speler X toegevoegd (TE…)" after creating a player, with a quick way to add the next one. */
export async function PlayerAddedNotice({
  name,
  number,
  showAddAnother,
}: {
  name?: string;
  number?: string;
  showAddAnother: boolean;
}) {
  if (!name || !number) return null;
  const t = await getTranslations('Admin.players');
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-secondary px-4 py-3 text-sm text-secondary-foreground"
    >
      <span>{t('playerAdded', { name, number })}</span>
      {showAddAnother && (
        <Button asChild size="sm">
          <Link href="/admin/players/new">{t('addAnother')}</Link>
        </Button>
      )}
    </div>
  );
}
