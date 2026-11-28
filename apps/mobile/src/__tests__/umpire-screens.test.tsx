import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import CourtsScreen from '@/app/umpire/courts';
import FinishScreen from '@/app/umpire/finish';
import ScoringScreen from '@/app/umpire/scoring';
import ServeScreen from '@/app/umpire/serve';
import { apiGet, apiPost } from '@/lib/api';
import { LocaleProvider } from '@/lib/i18n';
import { enqueue } from '@/lib/score-queue';
import { UmpireSessionProvider } from '@/lib/umpire-session';
import { ThemeProvider } from '@/theme';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

let mockParams: Record<string, string> = {};
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const get = apiGet as jest.Mock;
const post = apiPost as jest.Mock;
const M = '11111111-1111-4111-8111-111111111111';

const serverState = (over: Record<string, unknown> = {}) => ({
  status: 'IN_PROGRESS',
  version: 1,
  games: [],
  serving: 'A',
  lastSeq: 0,
  ...over,
});

function renderScreen(ui: ReactElement) {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <UmpireSessionProvider initial={{ token: 'sess', umpireId: 'u1', expiresAt: '2099-01-01' }}>
          {ui}
        </UmpireSessionProvider>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  get.mockReset();
  get.mockResolvedValue(serverState());
  post.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.push.mockReset();
  mockParams = {};
});

describe('court picker', () => {
  it("shows only the umpire's visible states", async () => {
    get.mockResolvedValue({
      courts: [
        { id: 'c1', number: 1, name: null, status: 'HELD', holderName: 'Ravi K.', match: null },
        {
          id: 'c2',
          number: 2,
          name: null,
          status: 'HELD_BY_ME',
          holderName: 'Anna K.',
          match: { id: M, status: 'CALLED', round: 1, matchNumber: 12 },
        },
        { id: 'c3', number: 3, name: null, status: 'FREE', holderName: null, match: null },
        {
          id: 'c4',
          number: 4,
          name: null,
          status: 'FREE',
          holderName: null,
          match: { id: 'm4', status: 'CALLED', round: 1, matchNumber: 15 },
        },
      ],
    });
    renderScreen(<CourtsScreen />);
    expect(await screen.findByText('Being scored by Ravi K.')).toBeTruthy();
    expect(screen.getByText('Take over')).toBeTruthy();
    expect(screen.getByText('Your court')).toBeTruthy();
    expect(screen.getAllByText('Waiting for the desk')).toHaveLength(1);
    expect(screen.getByText('Match #15')).toBeTruthy();
    // The courts call sends the session token only as a bearer, nothing in the path.
    expect(get).toHaveBeenCalledWith('/api/v1/umpire/courts', 'sess');
  });
});

describe('serve choice', () => {
  it('is sent before scoring starts', async () => {
    mockParams = { matchId: M, courtNumber: '2', matchNumber: '12' };
    post.mockResolvedValue({ ok: true });
    renderScreen(<ServeScreen />);
    fireEvent.press(screen.getByLabelText('Side B serves first'));
    fireEvent.press(screen.getByText('Start scoring'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      `/api/v1/umpire/matches/${M}/start`,
      { serving: 'B' },
      'sess',
    );
    expect(post.mock.invocationCallOrder[0]!).toBeLessThan(
      mockRouter.replace.mock.invocationCallOrder[0]!,
    );
  });

  it('does not open scoring when the start call fails', async () => {
    mockParams = { matchId: M };
    post.mockRejectedValue(new Error('offline'));
    renderScreen(<ServeScreen />);
    fireEvent.press(screen.getByText('Start scoring'));
    expect(await screen.findByText('Could not start the match. Try again.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('server-driven score', () => {
  const point = { id: 'p1', seq: 1, kind: 'POINT' as const, side: 'A' as const };

  it('shows the server score and replaces it when a reply carries a different one', async () => {
    mockParams = { matchId: M };
    get.mockResolvedValue(serverState({ games: [[3, 2]], lastSeq: 5 }));
    await enqueue(M, { ...point, seq: 6 });
    post.mockResolvedValue({ applied: 1, serving: 'B', games: [[9, 4]], version: 2, lastSeq: 6 });
    renderScreen(<ScoringScreen />);
    await waitFor(() => expect(screen.getAllByText('9').length).toBeGreaterThan(0));
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    expect(screen.queryByText('3')).toBeNull();
  });

  it('a new phone with an empty counter numbers the first tap above the server lastSeq', async () => {
    mockParams = { matchId: M };
    get.mockResolvedValue(serverState({ lastSeq: 7 }));
    post.mockRejectedValue(Object.assign(new Error('x'), { status: null }));
    renderScreen(<ScoringScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Point for side A').props.accessibilityState.disabled).toBe(
        false,
      ),
    );
    fireEvent.press(screen.getByLabelText('Point for side A'));
    await screen.findByText(/1 waiting to sync/);
    const queued = JSON.parse((await AsyncStorage.getItem(`score-queue:${M}`)) as string);
    expect(queued[0].seq).toBe(8);
  });

  it('does not let a tap in before the server state is known', async () => {
    mockParams = { matchId: M };
    get.mockRejectedValue(new Error('offline'));
    renderScreen(<ScoringScreen />);
    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
    expect(screen.getByLabelText('Point for side A').props.accessibilityState.disabled).toBe(true);
  });

  it('the confirm popup shows the server games', async () => {
    mockParams = { matchId: M };
    get.mockResolvedValue(serverState({ games: [[21, 18]] }));
    renderScreen(<FinishScreen />);
    expect(await screen.findByText('21')).toBeTruthy();
    expect(screen.getByText('18')).toBeTruthy();
  });
});

describe('scoring and finishing', () => {
  const point = { id: 'p1', seq: 1, kind: 'POINT' as const, side: 'A' as const };

  it('disables Finish while events are pending and says it is waiting to sync', async () => {
    mockParams = { matchId: M, courtNumber: '2', matchNumber: '12' };
    await enqueue(M, point);
    post.mockRejectedValue(Object.assign(new Error('x'), { status: null }));
    renderScreen(<ScoringScreen />);
    expect(await screen.findByText(/1 waiting to sync/)).toBeTruthy();
    expect(screen.getByLabelText('Finish match').props.accessibilityState.disabled).toBe(true);
  });

  it('enables Finish when nothing is waiting', async () => {
    mockParams = { matchId: M };
    renderScreen(<ScoringScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Finish match').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('a tap is saved with a seq before it is sent', async () => {
    mockParams = { matchId: M };
    post.mockRejectedValue(Object.assign(new Error('x'), { status: null }));
    renderScreen(<ScoringScreen />);
    fireEvent.press(await screen.findByLabelText('Point for side A'));
    expect(await screen.findByText(/1 waiting to sync/)).toBeTruthy();
    expect(await AsyncStorage.getItem(`seq-counter:${M}`)).toBe('1');
  });

  it('shows a rejected tap with a dismiss action', async () => {
    mockParams = { matchId: M };
    await AsyncStorage.setItem(
      `score-queue-rejected:${M}`,
      JSON.stringify([{ event: point, reason: 'matchFinished' }]),
    );
    renderScreen(<ScoringScreen />);
    expect(await screen.findByText(/The desk did not accept 1 tap/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Dismiss'));
    await waitFor(() => expect(screen.queryByText(/The desk did not accept/)).toBeNull(), {
      timeout: 3000,
    });
    expect(await AsyncStorage.getItem(`score-queue-rejected:${M}`)).toBeNull();
  });

  it('a blocked 401 sends the umpire back to sign in', async () => {
    mockParams = { matchId: M };
    await enqueue(M, point);
    const { ApiError } = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
    post.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED'));
    renderScreen(<ScoringScreen />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/umpire/sign-in'));
  });

  it('a permanent 409 keeps the tap and tells the umpire to contact the desk', async () => {
    mockParams = { matchId: M };
    await enqueue(M, point);
    const { ApiError } = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
    post.mockRejectedValue(new ApiError(409, 'RESULT_CONFLICT'));
    renderScreen(<ScoringScreen />);
    expect(await screen.findByText(/cannot be synced, contact the desk/)).toBeTruthy();
    expect(await AsyncStorage.getItem(`score-queue:${M}`)).not.toBeNull();
  });

  it('a corrupt queue is cleared only after the umpire confirms it was noted', async () => {
    mockParams = { matchId: M };
    await AsyncStorage.setItem(`score-queue:${M}`, '{bad');
    renderScreen(<ScoringScreen />);
    expect(await screen.findByText(/1 unreadable record/)).toBeTruthy();
    const clear = screen.getByLabelText('Clear unreadable records');
    expect(clear.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('I have noted it'));
    fireEvent.press(screen.getByLabelText('Clear unreadable records'));
    await waitFor(() => expect(screen.queryByText(/unreadable record/)).toBeNull());
  });

  it('the confirm popup finishes only when the queue is empty', async () => {
    mockParams = { matchId: M };
    await enqueue(M, point);
    post.mockRejectedValue(Object.assign(new Error('x'), { status: null }));
    renderScreen(<FinishScreen />);
    await screen.findByText(/Waiting to sync/);
    expect(screen.getByLabelText('Yes, scores are final').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('the confirm popup sends finish and opens the waiting screen', async () => {
    mockParams = { matchId: M };
    post.mockResolvedValue({ status: 'AWAITING_DESK', games: [[21, 5]] });
    renderScreen(<FinishScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Yes, scores are final').props.accessibilityState.disabled).toBe(
        false,
      ),
    );
    fireEvent.press(screen.getByLabelText('Yes, scores are final'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(`/api/v1/umpire/matches/${M}/finish`, {}, 'sess');
  });
});

describe('match screen serve choice', () => {
  const MatchScreen = require('@/app/umpire/match/[matchId]').default;
  const open = (over: Record<string, unknown>) => {
    mockParams = { matchId: M, courtNumber: '2', matchNumber: '12', status: 'IN_PROGRESS' };
    get.mockResolvedValue(serverState(over));
    renderScreen(<MatchScreen />);
  };

  it('offers the serve choice for an IN_PROGRESS match with no start server and no events', async () => {
    open({ umpireStartServer: null, lastSeq: 0 });
    expect(await screen.findByText('Start match')).toBeTruthy();
    expect(screen.queryByText('Continue scoring')).toBeNull();
  });

  it('skips the serve choice when a start server is stored', async () => {
    open({ umpireStartServer: 'B', lastSeq: 0 });
    expect(await screen.findByText('Continue scoring')).toBeTruthy();
    expect(screen.queryByText('Start match')).toBeNull();
  });

  it('skips the serve choice when the match has events', async () => {
    open({ umpireStartServer: null, lastSeq: 3 });
    expect(await screen.findByText('Continue scoring')).toBeTruthy();
    expect(screen.queryByText('Start match')).toBeNull();
  });
});
