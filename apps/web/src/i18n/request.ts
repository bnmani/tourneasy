import { appTimeZone, messages } from '@tourneasy/shared/i18n';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
    timeZone: appTimeZone,
    formats: {
      number: {
        euro: { style: 'currency', currency: 'EUR' },
      },
      dateTime: {
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        short: { day: 'numeric', month: 'short', year: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
      },
    },
  };
});
