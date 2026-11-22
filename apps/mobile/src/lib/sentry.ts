import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting. Stays off unless EXPO_PUBLIC_SENTRY_DSN is set, so local
 * development and CI never send events. The DSN comes from the EU-region
 * Sentry project (see apps/mobile/SCOPE.md, section 19).
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

export { Sentry };
