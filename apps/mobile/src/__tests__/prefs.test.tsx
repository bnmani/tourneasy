import { Pressable, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { ThemeProvider, useTheme } from '@/theme';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => void store.set(key, value)),
  };
});

function Probe() {
  const { preference, colors, setPreference } = useTheme();
  return (
    <Pressable testID="choose-light" onPress={() => setPreference('light')}>
      <Text testID="theme">{`${preference}:${colors.dark ? 'dark' : 'light'}`}</Text>
    </Pressable>
  );
}

describe('theme preference', () => {
  it('is saved when changed and used again on the next launch', () => {
    const first = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('choose-light'));
    expect(SecureStore.setItem).toHaveBeenCalledWith('pref.theme', 'light');
    first.unmount();

    // A fresh provider stands in for reopening the app.
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').props.children).toBe('light:light');
  });
});
