/**
 * Credits for the map data and imagery shown on the public home page. This is the one place to
 * change them; the footer renders this list (no attribution is drawn on top of the maps).
 *
 * LICENSING TO CONFIRM: OpenStreetMap data is under the ODbL, which asks for visible credit
 * near the map. Showing it only in the footer is a choice to confirm with a lawyer.
 */
export interface MapCredit {
  label: string;
  href: string;
}

export const MAP_CREDITS: readonly MapCredit[] = [
  { label: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  { label: 'Protomaps', href: 'https://protomaps.com' },
];

/**
 * Satellite imagery for the home page's "Satellite" view. Null until properly licensed imagery
 * is available; while null, the Plan/Satellite switch is hidden. When set, add its credit to
 * MAP_CREDITS.
 */
export const SATELLITE_SOURCE: null | { tiles: string[]; tileSize: number; maxzoom: number } = null;
