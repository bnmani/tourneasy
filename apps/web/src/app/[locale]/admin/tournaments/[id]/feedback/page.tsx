import { redirect } from 'next/navigation';

/** Feedback is reviewed in the one inbox for all tournaments (see /admin/feedback). */
export default async function TournamentFeedbackRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect(`/${locale}/admin/feedback?tournament=${encodeURIComponent(id)}`);
}
