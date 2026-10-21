/**
 * Hero artwork: a doubles court in perspective with a mixed-doubles pair in attack formation,
 * drawn as shadow figures (pictogram style, no faces) — the man jump-smashing at the back, the
 * woman ready at the net. All colours come from the theme tokens. Decorative: the section
 * heading carries the meaning, so the SVG is hidden from screen readers.
 */
type Limb = [points: string, width: number];

const MAN: Limb[] = [
  ['0,0 -8,-50 -20,-95', 30],
  ['-16,-88 -56,-118 -44,-168', 15],
  ['-14,-86 26,-110 54,-148', 14],
  ['2,0 42,38 22,92', 19],
  ['22,92 40,96', 12],
  ['-4,2 -30,62 -58,108', 19],
  ['-58,108 -44,116', 12],
  ['-44,-168 -64,-222', 4],
];

const WOMAN: Limb[] = [
  ['0,0 10,-42 20,-80', 26],
  ['18,-72 48,-90 64,-120', 12],
  ['14,-70 -16,-52 -42,-64', 11],
  ['8,8 50,32 60,80', 16],
  ['60,80 78,82', 10],
  ['-6,8 -44,44 -92,70', 16],
  ['-92,70 -104,66', 10],
  ['64,-120 78,-160', 3.5],
];

function Limbs({ limbs }: { limbs: Limb[] }) {
  return limbs.map(([points, width]) => (
    <polyline key={points} points={points} strokeWidth={width} fill="none" />
  ));
}

export function HeroArt() {
  return (
    <svg
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <radialGradient id="hero-glow" cx="72%" cy="42%" r="42%">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--hero)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="hero-court-mask">
          <rect width="1440" height="640" fill="url(#hero-fade)" />
        </mask>
      </defs>
      <rect width="1440" height="640" fill="url(#hero-glow)" />

      {/* Doubles court seen from behind the baseline; lines converge towards the far end. */}
      <g
        fill="none"
        stroke="var(--hero-foreground)"
        strokeWidth="2.5"
        opacity="0.16"
        mask="url(#hero-court-mask)"
      >
        <path d="M560 140 L1340 140 L1560 700 L340 700 Z" />
        <path d="M598 140 L398 700 M1302 140 L1502 700" />
        <path d="M950 140 L950 300 M950 470 L950 700" />
        <path d="M520 260 L1380 260 M470 380 L1430 380 M410 520 L1490 520 M372 620 L1528 620" />
        <path d="M455 410 L1445 410" strokeWidth="5" />
        <path d="M455 410 L455 340 M1445 410 L1445 340 M455 345 L1445 345" strokeWidth="3" />
      </g>

      {/* Shuttle leaving the smash, with speed lines. */}
      <g stroke="var(--hero-highlight)" strokeLinecap="round" fill="none" opacity="0.75">
        <path d="M1092 196 L1196 252" strokeWidth="3" />
        <path d="M1104 214 L1182 256" strokeWidth="2" opacity="0.6" />
        <path d="M1100 182 L1176 222" strokeWidth="2" opacity="0.6" />
      </g>
      <g transform="translate(1222 262) rotate(-61) scale(1.1)" fill="var(--hero-highlight)">
        <path d="M-14 -34 L14 -34 L7 2 L-7 2 Z" />
        <circle cx="0" cy="8" r="8" />
      </g>

      <g fill="var(--silhouette)" opacity="0.45">
        <ellipse cx="1140" cy="612" rx="78" ry="9" />
        <ellipse cx="752" cy="480" rx="72" ry="7" />
      </g>

      <g
        fill="var(--silhouette)"
        stroke="var(--silhouette)"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter: 'drop-shadow(0 0 14px color-mix(in srgb, var(--brand) 55%, transparent))',
        }}
      >
        <g transform="translate(1150 455) scale(1.1)">
          <Limbs limbs={MAN} />
          <circle cx="-34" cy="-135" r="17" stroke="none" />
          <ellipse
            cx="-72"
            cy="-246"
            rx="13"
            ry="21"
            transform="rotate(-20 -72 -246)"
            fill="none"
            strokeWidth="4"
          />
        </g>
        <g transform="translate(762 405) scale(.85)">
          <path d="M-14 -6 L16 -8 L26 20 L-22 20 Z" stroke="none" />
          <Limbs limbs={WOMAN} />
          <path d="M23 -120 Q6 -118 2 -100" fill="none" strokeWidth="7" />
          <circle cx="33" cy="-113" r="14" stroke="none" />
          <ellipse
            cx="84"
            cy="-180"
            rx="11"
            ry="18"
            transform="rotate(18 84 -180)"
            fill="none"
            strokeWidth="3.5"
          />
        </g>
      </g>
    </svg>
  );
}
