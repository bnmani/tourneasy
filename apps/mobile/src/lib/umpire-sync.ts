import type { BlockedInfo } from '@/lib/score-queue';

/**
 * What to do when a tap could not be sent:
 * - `signIn`: the session is no longer valid (401); the tap stays saved.
 * - `contactDesk`: the server refused it for good (409 or another 4xx); the tap stays saved.
 * - `retry`: offline or a server error; the flush runs again when the connection returns.
 */
export type BlockedAction = 'signIn' | 'contactDesk' | 'retry';

export function blockedAction(blocked: BlockedInfo): BlockedAction {
  const { status } = blocked;
  if (status === 401) return 'signIn';
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return 'contactDesk';
  }
  return 'retry';
}
