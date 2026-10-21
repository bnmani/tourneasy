/**
 * Fonts for the site themes, self-hosted by next/font (no requests to Google at runtime, so the
 * CSP stays 'self'). Each font only exposes a CSS variable; globals.css picks the heading and
 * body font per theme, and browsers only download the files a theme actually uses.
 */
import { Fraunces, Inter, Montserrat, Nunito, Space_Grotesk } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const fontVariables = [inter, fraunces, spaceGrotesk, nunito, montserrat]
  .map((f) => f.variable)
  .join(' ');
