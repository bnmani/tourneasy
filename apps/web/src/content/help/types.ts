/**
 * The help guides (D92): one guide per kind of account, in each language. Text may use
 * **bold** for button and menu names; images are screenshots in public/help/<locale>/.
 */
export type HelpGuideKey = 'players' | 'organisers' | 'admins';

export type HelpImage = { src: string; alt: string; caption: string };

export type HelpBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string }
  | { table: { head: [string, string]; rows: [string, string][] } }
  | { img: HelpImage }
  /** A desktop screenshot with the same page on a phone next to it. */
  | { pair: { desktop: HelpImage; phone: HelpImage } };

export type HelpSection = { id: string; title: string; blocks: HelpBlock[] };

export type HelpGuide = {
  title: string;
  /** One line for the help index and the page description. */
  summary: string;
  intro: string;
  facts: { title: string; text: string }[];
  sections: HelpSection[];
};
