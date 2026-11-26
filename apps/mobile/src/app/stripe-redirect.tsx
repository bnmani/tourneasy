import { useEffect } from 'react';
import { router } from 'expo-router';

/**
 * Where a bank page (iDEAL) sends the player back to after paying. Stripe's payment sheet
 * finishes the payment itself (the link is passed on in the root layout); this screen only
 * steps back to where the player was.
 */
export default function StripeRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
