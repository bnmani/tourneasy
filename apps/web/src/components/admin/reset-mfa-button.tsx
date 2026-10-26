'use client';

import { Button } from '@/components/ui/button';
import { resetUserMfaAction } from '@/server/actions/mfa-actions';

/** Users page: reset someone's two-step login after they lost phone and codes (D78). */
export function ResetMfaButton({
  userId,
  returnTo,
  label,
  confirm,
}: {
  userId: string;
  returnTo: string;
  label: string;
  confirm: string;
}) {
  return (
    <form
      action={resetUserMfaAction}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button type="submit" size="sm" variant="ghost">
        {label}
      </Button>
    </form>
  );
}
