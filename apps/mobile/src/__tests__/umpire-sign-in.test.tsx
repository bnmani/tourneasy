import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SignInScreen from '@/app/umpire/sign-in';
import { apiPost } from '@/lib/api';
import { LocaleProvider } from '@/lib/i18n';
import { UmpireSessionProvider } from '@/lib/umpire-session';
import { ThemeProvider } from '@/theme';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), apiPost: jest.fn() }));
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

const post = apiPost as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  post.mockReset();
  mockRouter.replace.mockReset();
});

function renderSignIn() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <UmpireSessionProvider>
          <SignInScreen />
        </UmpireSessionProvider>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe('umpire sign-in', () => {
  it('keeps Sign in disabled until the PIN has 6 digits', () => {
    renderSignIn();
    expect(screen.getByLabelText('Sign in').props.accessibilityState.disabled).toBe(true);
    for (const key of ['1', '2', '3', '4', '5']) fireEvent.press(screen.getByLabelText(key));
    expect(screen.getByLabelText('Sign in').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByLabelText('6'));
    expect(screen.getByLabelText('Sign in').props.accessibilityState.disabled).toBe(false);
  });

  it('sends the PIN and the device id in the body only, then stores the session', async () => {
    post.mockResolvedValue({ umpireId: 'u1', sessionToken: 'sess-1', expiresAt: '2099-01-01' });
    renderSignIn();
    for (const key of ['1', '2', '3', '4', '5', '6']) fireEvent.press(screen.getByLabelText(key));
    fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/umpire/courts'));
    expect(post).toHaveBeenCalledWith('/api/v1/umpire/sign-in', {
      pin: '123456',
      deviceId: '00000000-0000-4000-8000-000000000001',
    });
    const stored = JSON.parse((await AsyncStorage.getItem('umpire-session')) as string);
    expect(stored.token).toBe('sess-1');
    // The PIN itself is not stored anywhere.
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) expect(await AsyncStorage.getItem(key)).not.toContain('123456');
  });

  it('shows a message when the PIN is not accepted', async () => {
    const { ApiError } = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
    post.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'INVALID_CREDENTIALS'));
    renderSignIn();
    for (const key of ['1', '2', '3', '4', '5', '6']) fireEvent.press(screen.getByLabelText(key));
    fireEvent.press(screen.getByLabelText('Sign in'));
    expect(await screen.findByText('That PIN or QR code was not accepted.')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
