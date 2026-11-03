/**
 * One colour family per activity status, for every surface that draws one (2026-11-03 full audit, frontend F4).
 *
 * The site, the embed and the OG card drew ACTIVE green and RESUMED blue, while the HEY badge — the surface readers
 * meet on third-party READMEs — drew ACTIVE blue and RESUMED purple, and the Telegram bot drew RESUMED green. Each
 * surface keeps its own lightness and fill (the badge and the embed are drawn on hosts that never load HEY's
 * stylesheet), but the hue a status is drawn in means the same thing everywhere. `status-hue.test.ts` in apps/web reads
 * every surface's colours and holds each to this map.
 *
 * Builder state only: never a market direction (UI rule 13), and never colour alone — the status word is always beside
 * it.
 */
export type StatusHueFamily = 'green' | 'blue' | 'amber' | 'grey';

export const ACTIVITY_STATUS_HUE: Readonly<Record<'SHIPPING' | 'ACTIVE' | 'RESUMED' | 'QUIET' | 'DORMANT' | 'UNKNOWN', StatusHueFamily>> = {
  SHIPPING: 'green',
  ACTIVE: 'green',
  RESUMED: 'blue',
  QUIET: 'amber',
  DORMANT: 'grey',
  UNKNOWN: 'grey',
};

/** The family of a `#rrggbb` colour: grey below a small saturation, else by hue. Undefined for a colour no family names. */
export function statusHueFamilyOf(hex: string): StatusHueFamily | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const value = parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.18) return 'grey';
  let hue = 0;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  if (hue >= 25 && hue < 65) return 'amber';
  if (hue >= 80 && hue < 185) return 'green';
  if (hue >= 200 && hue < 245) return 'blue';
  return undefined;
}
