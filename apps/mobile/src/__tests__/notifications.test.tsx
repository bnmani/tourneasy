import { act, fireEvent, render, screen } from '@testing-library/react-native';

import NotificationsScreen from '@/app/(app)/notifications';
import { LocaleProvider } from '@/lib/i18n';
import { fetchInbox, markRead } from '@/lib/notifications';
import { ThemeProvider } from '@/theme';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock('@/lib/notifications', () => ({ fetchInbox: jest.fn(), markRead: jest.fn() }));

const item = (id: string, read: boolean, url: string | null = '/tournaments/open/schedule') => ({
  id,
  type: 'MATCH_SCHEDULED',
  title: { nl: 'Het schema staat online', en: 'The schedule is out' },
  body: { nl: 'Bekijk je wedstrijden.', en: 'See your matches.' },
  url,
  createdAt: '2026-11-27T10:00:00.000Z',
  read,
});

function renderScreen() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <NotificationsScreen />
      </ThemeProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  jest.mocked(markRead).mockReset().mockResolvedValue();
});

describe('NotificationsScreen', () => {
  it('lists my messages, marks them read on the website and opens one on tap', async () => {
    jest
      .mocked(fetchInbox)
      .mockResolvedValue({ items: [item('a', false), item('b', true)], unread: 1 });
    renderScreen();
    await act(async () => {});

    expect(screen.getAllByText('The schedule is out')).toHaveLength(2);
    expect(screen.getByLabelText('New: The schedule is out')).toBeTruthy();
    expect(markRead).toHaveBeenCalledWith();

    fireEvent.press(screen.getByTestId('notification-a'));
    expect(mockPush).toHaveBeenCalledWith('/tournaments/open/schedule');
  });

  it('does not mark anything read when all is read, and says when there is nothing', async () => {
    jest.mocked(fetchInbox).mockResolvedValue({ items: [], unread: 0 });
    renderScreen();
    await act(async () => {});

    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(markRead).not.toHaveBeenCalled();
  });
});
