/**
 * Hero picture: a mixed-doubles pair jump-smashing, in neon line art (D50). Its own dark
 * background is blended away with `lighten` and the edges fade out with a radial mask, so it
 * melts into every theme's hero colour. Decorative.
 */
export function HeroImage() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static decorative file; no optimiser needed
    <img
      src="/images/hero-mixed-doubles.jpg"
      alt=""
      aria-hidden="true"
      width={1100}
      height={1100}
      decoding="async"
      fetchPriority="high"
      className="pointer-events-none absolute top-[48%] right-[-4%] h-[116%] w-auto max-w-none -translate-y-1/2 [mask-image:radial-gradient(closest-side,#000_66%,transparent)] mix-blend-lighten select-none max-md:right-1/2 max-md:h-[90%] max-md:translate-x-1/2 max-md:opacity-80"
    />
  );
}
