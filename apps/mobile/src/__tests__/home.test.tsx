import { render, screen } from '@testing-library/react-native';

import Start from '@/app/index';
import { useSession } from '@/lib/session';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: T } = require('react-native');
    return <T testID="redirect">{href}</T>;
  },
}));

jest.mock('@/lib/session', () => ({ useSession: jest.fn() }));

describe('Start', () => {
  it('goes to Welcome when signed out', () => {
    jest.mocked(useSession).mockReturnValue({ profile: null } as never);
    render(<Start />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/welcome');
  });

  it('goes to Home when signed in', () => {
    jest.mocked(useSession).mockReturnValue({ profile: { id: 'p1' } } as never);
    render(<Start />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/(app)/(tabs)');
  });
});
