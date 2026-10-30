/** The shuttle mark, the same as app/icon.svg (kept in code: the build has no source files). */
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#2e4a67"/><g transform="translate(0 1.6)"><g fill="#ffffff"><path d="M11 9.2 L15.2 8.3 L18.1 23 L16.5 23 Z"/><path d="M15.8 8.2 L19.7 7.9 L19.85 23 L18.4 23 Z"/><path d="M20.3 7.9 L24.2 8.2 L21.6 23 L20.15 23 Z"/><path d="M24.8 8.3 L29 9.2 L23.5 23 L21.9 23 Z"/><path d="M16.3 23.7 H23.7 V24.4 A3.7 3.7 0 0 1 16.3 24.4 Z"/></g><path d="M14.3 17 H25.7" stroke="#b8945b" stroke-width="1.9" stroke-linecap="round"/></g></svg>';

/** The shuttle mark as a data URL for <img>. */
export function markDataUrl(): string {
  return `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`;
}
