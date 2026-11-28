import { act, render, screen } from '@testing-library/react-native';

import ScheduleTab from '@/app/(app)/(tabs)/schedule';
import { LocaleProvider } from '@/lib/i18n';
import {
  fetchFollowing,
  fetchMyEntries,
  fetchMyMatches,
  fetchPlayerMatches,
  type MyEntry,
  type MyMatch,
  type PlayerMatch,
} from '@/lib/me';
import { ThemeProvider } from '@/theme';

let mockParams: { view?: string } = {};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), setParams: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock('@/lib/me', () => ({
  fetchMyEntries: jest.fn(),
  fetchMyMatches: jest.fn(),
  fetchFollowing: jest.fn(),
  fetchPlayerMatches: jest.fn(),
}));
jest.mock('@/lib/entries', () => ({
  formatCents: () => '€ 10,00',
  payShares: jest.fn(),
  withdrawEntry: jest.fn(),
}));

const entry: MyEntry = {
  id: 'r1',
  status: 'CONFIRMED',
  waitlistPosition: null,
  tournament: {
    slug: 'app-tournament',
    name: 'App Tournament',
    startsOn: '2026-12-12',
    endsOn: '2026-12-12',
  },
  event: {
    discipline: 'HE',
    name: { nl: '', en: '' },
    ageCategory: null,
    levelClass: null,
  },
  doubles: false,
  paymentStatus: 'PAID',
  partner: null,
  pendingInvite: null,
  lookingForPartner: false,
  past: false,
  participantId: 'p1',
  amountDueCents: null,
  canPay: false,
  canWithdraw: false,
};

function renderSchedule() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <ScheduleTab />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

const playerMatch = (id: string, a: string, b: string): PlayerMatch => ({
  id,
  status: 'SCHEDULED',
  event: 'Men’s doubles',
  round: 'Round 1',
  a,
  b,
  court: null,
  startsAt: '2026-12-05T10:00:00.000Z',
  endsAt: null,
  tournament: { name: 'Almere Rally Masters', slug: 'almere' },
});

const daan = {
  memberNumber: 'TE100001',
  name: 'Daan Jansen',
  club: null,
  preferredDisciplines: [],
  followerCount: 1,
};

beforeEach(() => {
  jest.mocked(fetchMyMatches).mockResolvedValue([]);
  jest.mocked(fetchMyEntries).mockResolvedValue([entry]);
  jest.mocked(fetchFollowing).mockResolvedValue([]);
  jest.mocked(fetchPlayerMatches).mockResolvedValue([]);
});

describe('Schedule tab', () => {
  it('opens on my entries after "See my entries"', async () => {
    mockParams = { view: 'entries' };
    renderSchedule();
    await act(async () => {});
    expect(screen.getByText('App Tournament')).toBeTruthy();
  });

  it('opens on my matches otherwise', async () => {
    mockParams = {};
    renderSchedule();
    await act(async () => {});
    expect(screen.queryByText('App Tournament')).toBeNull();
    expect(screen.getByText('No matches planned yet')).toBeTruthy();
  });
});

describe('My schedule: players I follow', () => {
  it('shows their matches under my own, without matches I play in myself', async () => {
    mockParams = {};
    const mine: MyMatch = {
      ...playerMatch('m1', 'Me', 'Daan Jansen'),
      number: 1,
      aEntryId: null,
      bEntryId: null,
      winnerEntryId: null,
      sets: [],
      changed: null,
    };
    jest.mocked(fetchMyMatches).mockResolvedValue([mine]);
    jest.mocked(fetchFollowing).mockResolvedValue([daan]);
    jest
      .mocked(fetchPlayerMatches)
      .mockResolvedValue([
        playerMatch('m1', 'Me', 'Daan Jansen'),
        playerMatch('m2', 'Daan Jansen', 'Someone Else'),
      ]);
    renderSchedule();
    await act(async () => {});

    expect(screen.getByText('My schedule')).toBeTruthy();
    expect(screen.getByText('My matches')).toBeTruthy();
    expect(screen.getByText('Players I follow')).toBeTruthy();
    expect(screen.getAllByText(/Daan Jansen/)).toHaveLength(2); // m1 once (mine), m2 once
    expect(screen.getByText(/Someone Else/)).toBeTruthy();
  });

  it('has no followed section when I follow nobody', async () => {
    mockParams = {};
    renderSchedule();
    await act(async () => {});
    expect(screen.queryByText('Players I follow')).toBeNull();
    expect(screen.queryByText('My matches')).toBeNull();
  });
});
