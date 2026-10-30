/**
 * Share images (Open Graph) and the app icon, drawn with next/og: the dark hero colour, the
 * shuttle mark and gold accents, like the site. Text is passed in; no database access here.
 */
import { markDataUrl } from './brand-mark';

export { markDataUrl };

export const OG_SIZE = { width: 1200, height: 630 };

const NAVY = '#0f1e33';
const GOLD = '#b8945b';

export function OgFrame({
  eyebrow,
  title,
  lines,
  mark,
}: {
  eyebrow: string;
  title: string;
  lines: string[];
  mark: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        background: NAVY,
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
        <img src={mark} width={72} height={72} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 36, fontWeight: 700 }}>Tourneasy</span>
          <span style={{ fontSize: 18, letterSpacing: 4, color: GOLD }}>TOURNAMENT MADE EASY</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontSize: 26, color: GOLD, textTransform: 'uppercase', letterSpacing: 3 }}>
          {eyebrow}
        </span>
        <span style={{ fontSize: title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </span>
        {lines.map((l) => (
          <span key={l} style={{ fontSize: 32, color: '#c9d3df' }}>
            {l}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', height: 8, width: 160, background: GOLD, borderRadius: 4 }} />
    </div>
  );
}
