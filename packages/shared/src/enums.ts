export const ROLES = ['owner', 'manager', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_KINDS = ['personal', 'business'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const VEHICLE_TYPES = ['car', 'motorcycle', 'scooter'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const PLATE_FORMATS = ['tn_standard', 'tn_rs', 'other'] as const;
export type PlateFormat = (typeof PLATE_FORMATS)[number];

/** Connection status of a GPS device, derived from its last report time. */
export const DEVICE_STATUSES = ['online', 'offline', 'never'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const LOCALES = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const DEFAULT_TIMEZONE = 'Africa/Tunis';

export const RETENTION_DAYS = { min: 7, max: 365, default: 90 } as const;

/** A device is "offline" when it has not reported for this many minutes. */
export const DEFAULT_OFFLINE_AFTER_MINUTES = 10;
