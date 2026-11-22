'use client';

import { useTranslations } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';

type FormAction = NonNullable<ComponentProps<'form'>['action']>;

/**
 * Walkover or retirement, collapsed under one heading (desk design, agreed): pick walkover or
 * retirement, pick the winner, then confirm. A walkover records no scores. A retirement keeps the
 * scores typed in the score grid above, so its confirm button submits that grid's form.
 */
export function WalkoverOrRetirement({
  names,
  scoreFormId,
  walkover,
  retire,
}: {
  names: { A: string | null; B: string | null };
  /** The id of the score grid form above, whose scores a retirement keeps. */
  scoreFormId: string;
  walkover: FormAction;
  retire: FormAction;
}) {
  const t = useTranslations('Admin.desk');
  const [mode, setMode] = useState<'walkover' | 'retirement'>('walkover');
  const [winner, setWinner] = useState<'A' | 'B' | null>(null);
  const isWalkover = mode === 'walkover';

  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-primary">{t('other')}</summary>
      <form action={walkover} className="mt-2 space-y-3">
        <div className="flex gap-2">
          {(['walkover', 'retirement'] as const).map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={mode === m ? 'default' : 'outline'}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setWinner(null);
              }}
            >
              {t(m === 'walkover' ? 'walkoverMode' : 'retirementMode')}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground">
          {t(isWalkover ? 'walkoverExplain' : 'retirementExplain')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['A', 'B'] as const).map((side) => (
            <Button
              key={side}
              type="button"
              variant={winner === side ? 'default' : 'outline'}
              aria-pressed={winner === side}
              className="h-auto justify-start py-2 text-left whitespace-normal"
              onClick={() => setWinner(side)}
            >
              {t('winnerLabel', { name: names[side] ?? '' })}
            </Button>
          ))}
        </div>
        {winner && (
          <div className="space-y-2 rounded-md border border-primary p-3">
            <p>
              {t(isWalkover ? 'confirmWalkover' : 'confirmRetirement', {
                name: names[winner] ?? '',
              })}
            </p>
            <div className="flex gap-2">
              {isWalkover ? (
                <Button type="submit" size="sm" name="winner" value={winner}>
                  {t('confirm')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  name="winner"
                  value={winner}
                  form={scoreFormId}
                  formAction={retire}
                >
                  {t('confirm')}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => setWinner(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </details>
  );
}
