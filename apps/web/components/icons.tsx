import type { VehicleType } from '@winou/shared';

/** Line icons (24 px grid, stroke = currentColor). Decorative: always paired with a text label. */
const PATHS = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  trips: 'M6 19a2 2 0 1 0 0-.01zM18 5a2 2 0 1 0 0-.01zM8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  alerts: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  car: 'M5 16h14l-1.5-6a2 2 0 0 0-2-1.5h-7a2 2 0 0 0-2 1.5zM7 19v-3M17 19v-3',
  motorcycle: 'M5 17a3 3 0 1 0 0-.01zM19 17a3 3 0 1 0 0-.01zM5 17l5-7h4l5 7M13 6h3',
  scooter: 'M7 19a2 2 0 1 0 0-.01zM18 19a2 2 0 1 0 0-.01zM9 19h7L13 5h-3',
  device: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 17h4M9 7h6',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .8 3 2.8 3 6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  plus: 'M12 5v14M5 12h14',
  signout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  check: 'M5 12l5 5 9-10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
  unarchive: 'M4 5h16v4H4zM6 9v10h12V9M12 17v-5M9.5 14l2.5-2.5 2.5 2.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flex: 'none' }}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export const vehicleIcon = (t: VehicleType): IconName => t;

/** Half-filled circle, the theme switch icon from the design. */
export function ThemeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  );
}
