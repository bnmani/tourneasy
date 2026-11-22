import { render, screen } from '@testing-library/react-native';
import { messages, defaultLocale } from '@tourneasy/shared/i18n';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('shows the site name from the shared translations', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-title')).toHaveTextContent(
      messages[defaultLocale].Metadata.siteName,
    );
  });
});
