import { render, screen } from '@testing-library/react-native';

import SplashScreen from '@/app/index';
import { SessionProvider } from '@/lib/session';
import { ThemeProvider } from '@/theme';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

describe('SplashScreen', () => {
  it('shows the tagline under the logo', () => {
    render(
      <ThemeProvider>
        <SessionProvider>
          <SplashScreen />
        </SessionProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText('Tournament Made Easy')).toBeTruthy();
  });
});
