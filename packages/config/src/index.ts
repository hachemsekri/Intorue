/**
 * Brand settings. Change the product name here only; web, mobile, emails and the API read it from this file.
 * "Winou" is a working name ([NOM DE LA MARQUE]).
 */
export const brand = {
  name: 'Winou',
  /** Two-part wordmark, styled like the designs: first part white/navy, second part turquoise. */
  wordmark: ['Win', 'ou'] as const,
  supportEmail: 'support@example.tn', // PLACEHOLDER
  colors: {
    navy: '#0E2A47',
    navyDeep: '#0B2440',
    turquoise: '#14B8A6',
    turquoiseDark: '#0E7C7B',
    background: '#F3F6F9',
    surface: '#FFFFFF',
    text: '#0E2A47',
    textMuted: '#5B6B7F',
    border: '#DDE3EA',
    moving: '#0E8A87',
    stopped: '#3F6EA8',
    offline: '#6B7785',
    attention: '#C2540A',
    attentionBg: '#FDEFE3',
    danger: '#B42318',
  },
} as const;

export type MapProviderId = 'protomaps-local' | 'custom';

export interface MapProviderConfig {
  id: MapProviderId;
  /** MapLibre style URL. */
  styleUrl: string;
  /** Attribution HTML. Must always be shown on the map. */
  attribution: string;
  /** Satellite imagery stays off until a licensed provider is contracted. */
  satellite: { enabled: false } | { enabled: true; styleUrl: string; attribution: string };
}

/**
 * Map provider registry. Selected with NEXT_PUBLIC_MAP_PROVIDER / EXPO_PUBLIC_MAP_PROVIDER.
 * See docs/MAP_SERVICES.md for licences and costs. Wired up in Milestone 2.
 */
export function mapProvider(id: string | undefined, overrides: Partial<MapProviderConfig> = {}): MapProviderConfig {
  const base: MapProviderConfig = {
    id: 'protomaps-local',
    styleUrl: '/map/style.json',
    attribution:
      '<a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    satellite: { enabled: false },
  };
  if (id === 'custom') return { ...base, id: 'custom', ...overrides };
  return { ...base, ...overrides };
}
