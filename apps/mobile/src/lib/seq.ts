import { appendTap, type Tap } from '@/lib/tap-log';
import { enqueue, newEventId, type QueuedEvent } from '@/lib/score-queue';
import { nextSeq } from '@/lib/seq-counter';

export { nextSeq, seedSeq } from '@/lib/seq-counter';
export type { Tap } from '@/lib/tap-log';

/**
 * Takes the next seq (saved first), then saves the tap to the offline queue. The tap counts as
 * saved when the queue write resolves. The display log that follows is best effort: if it fails,
 * the tap is still saved and still sent.
 */
export async function recordTap(matchId: string, tap: Tap): Promise<QueuedEvent> {
  const seq = await nextSeq(matchId);
  const id = newEventId();
  const event: QueuedEvent =
    tap.kind === 'POINT' ? { id, seq, kind: 'POINT', side: tap.side } : { id, seq, kind: 'UNDO' };
  await enqueue(matchId, event);
  try {
    await appendTap(matchId, tap);
  } catch {
    // Display only; the tap is already in the durable queue.
  }
  return event;
}
