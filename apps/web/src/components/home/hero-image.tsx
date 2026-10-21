/**
 * Hero picture: neon line-art jump smash (Vecteezy, see D50). Its own dark background is blended
 * away with `lighten` and the edges fade out with a radial mask, so it melts into every theme's
 * hero colour. Decorative; the credit line is required by the Vecteezy free licence.
 */
export function HeroImage({ credit, creditLabel }: { credit: string; creditLabel: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static decorative file; no optimiser needed */}
      <img
        src="/images/hero-smash.jpg"
        alt=""
        aria-hidden="true"
        width={980}
        height={980}
        decoding="async"
        fetchPriority="high"
        className="pointer-events-none absolute top-[56%] right-[-6%] h-[112%] w-auto max-w-none -translate-y-1/2 [mask-image:radial-gradient(closest-side,#000_62%,transparent)] mix-blend-lighten select-none max-md:right-1/2 max-md:h-[90%] max-md:translate-x-1/2 max-md:opacity-80"
      />
      <a
        href="https://www.vecteezy.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={creditLabel}
        className="absolute top-3 right-4 z-10 text-[10px] text-hero-muted underline-offset-2 opacity-70 hover:underline"
      >
        {credit}
      </a>
    </>
  );
}
