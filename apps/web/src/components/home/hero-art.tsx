/**
 * Hero artwork: a jump-smash player drawn as a pop-art neon sign: two offset coloured outlines
 * (cyan and coral) plus a thin line in the theme accent around a body filled with the hero colour,
 * on a halftone glow with motion lines. Original artwork (inspired by line-art sports posters);
 * all colours follow the theme. Decorative, so hidden from screen readers.
 */
const BODY = [
  'M268 186 C 290 168, 318 164, 336 178 C 338 220, 330 262, 322 300 C 316 318, 306 330, 296 336 C 284 334, 272 330, 266 322 C 262 280, 258 230, 268 186Z',
  'M295 110a23 27 0 1 0 46 0a23 27 0 1 0 -46 0Z',
  'M298.3 129.5L286.4 166.9L309.6 173.1L317.7 134.5Z',
  'M266 184a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z',
  'M309 178a15 15 0 1 0 30 0a15 15 0 1 0 -30 0Z',
  'M288.7 172.9L230.9 141.9L221.1 158.1L275.3 195.1Z',
  'M216.5 150a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0 -19 0Z',
  'M235.5 150.8L238.5 76.5L225.5 75.5L216.5 149.2Z',
  'M223.5 76a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0Z',
  'M329.8 190.5L390.1 153.5L381.9 138.5L318.2 169.5Z',
  'M377.5 146a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0Z',
  'M393.2 150.5L425.1 95.2L414.9 88.8L378.8 141.5Z',
  'M412.5 92a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0Z',
  'M268 328a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z',
  'M288 326a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z',
  'M262 312 C 290 322, 318 318, 336 308 L 348 352 C 330 362, 312 362, 300 356 C 288 364, 268 366, 252 358Z',
  'M293.7 346.5L363.9 397.5L380.1 378.5L318.3 317.5Z',
  'M359.5 388a12.5 12.5 0 1 0 25 0a12.5 12.5 0 1 0 -25 0Z',
  'M359.9 385L345.2 468.3L358.8 471.7L384.1 391Z',
  'M344.5 470a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0Z',
  'M348 479.2L392.7 488.8L395.3 479.2L352 464.8Z',
  'M267.6 331.1L249.9 422.8L274.1 429.2L304.4 340.9Z',
  'M249.5 426a12.5 12.5 0 1 0 25 0a12.5 12.5 0 1 0 -25 0Z',
  'M251.8 418.8L208.3 490L219.7 498L272.2 433.2Z',
  'M206.5 494a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0 -15 0Z',
  'M207.7 502.2L235.2 518.1L240.8 509.9L216.3 489.8Z',
];
const RACKET_SHAFT = 'M234.9 75.5L224 21.6L220 22.4L229.1 76.5Z';

const POP_CYAN = '#4cc9f0';
const POP_CORAL = '#f25f5c';

/** Phones show a crop centred on the player; wider screens the full composition. */
export function HeroArt({
  variant = 'wide',
  className,
}: {
  variant?: 'wide' | 'phone';
  className?: string;
}) {
  const p = `hero-${variant}`;
  return (
    <svg
      viewBox={variant === 'phone' ? '760 40 600 600' : '0 0 1440 640'}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none absolute inset-0 size-full ${className ?? ''}`}
    >
      <defs>
        <filter id={`${p}-outline-wide`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology operator="dilate" radius="5" />
        </filter>
        <filter id={`${p}-outline-thin`} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology operator="dilate" radius="2.2" />
        </filter>
        <pattern id={`${p}-dots`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="2.4" fill="var(--hero-highlight)" />
        </pattern>
        <radialGradient id={`${p}-dots-fade`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${p}-dots-mask`}>
          <circle cx="1060" cy="300" r="300" fill={`url(#${p}-dots-fade)`} />
        </mask>
        <symbol id={`${p}-player`} viewBox="0 0 600 600" overflow="visible">
          {BODY.map((d) => (
            <path key={d} d={d} fill="currentColor" />
          ))}
          <path d={RACKET_SHAFT} fill="currentColor" />
          <ellipse
            cx="214"
            cy="-16"
            rx="26"
            ry="38"
            transform="rotate(-12 214 -16)"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
          />
        </symbol>
      </defs>

      <rect
        width="1440"
        height="640"
        fill={`url(#${p}-dots)`}
        mask={`url(#${p}-dots-mask)`}
        opacity="0.35"
      />
      <g strokeLinecap="round" fill="none">
        <path d="M760 560 L1300 40" stroke={POP_CORAL} strokeWidth="10" opacity="0.45" />
        <path d="M800 600 L1360 70" stroke={POP_CYAN} strokeWidth="4" opacity="0.5" />
        <path d="M700 520 L1180 60" stroke="var(--hero-highlight)" strokeWidth="3" opacity="0.6" />
      </g>

      <g transform="translate(810 112) scale(0.72)">
        <use
          href={`#${p}-player`}
          width="600"
          height="600"
          color={POP_CYAN}
          filter={`url(#${p}-outline-wide)`}
          transform="translate(-9 -5)"
        />
        <use
          href={`#${p}-player`}
          width="600"
          height="600"
          color={POP_CORAL}
          filter={`url(#${p}-outline-wide)`}
          transform="translate(9 5)"
        />
        <use
          href={`#${p}-player`}
          width="600"
          height="600"
          color="var(--hero-highlight)"
          filter={`url(#${p}-outline-thin)`}
        />
        <use href={`#${p}-player`} width="600" height="600" color="var(--hero)" />
      </g>

      {/* The shuttle leaving the racket, with speed lines. */}
      <g stroke="var(--hero-foreground)" strokeLinecap="round" opacity="0.7">
        <path d="M1180 95 L1232 135" strokeWidth="3" />
        <path d="M1168 115 L1214 151" strokeWidth="2" />
      </g>
      <g transform="translate(1250 150) rotate(140)" fill="var(--hero-foreground)">
        <path d="M-14 -34 L14 -34 L7 2 L-7 2 Z" />
        <circle cx="0" cy="9" r="8" />
      </g>
    </svg>
  );
}
