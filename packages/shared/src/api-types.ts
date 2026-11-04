import type { AccountKind, DeviceStatus, Locale, PlateFormat, Role, VehicleType } from './enums';
import type { Permission } from './permissions';

/** Response shapes shared by API, web and mobile. Dates are ISO strings in UTC. */

export interface MembershipDto {
  orgId: string;
  orgName: string;
  orgKind: AccountKind;
  role: Role;
  permissions: readonly Permission[];
}

export interface MeDto {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  memberships: MembershipDto[];
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface OrgDto {
  id: string;
  name: string;
  kind: AccountKind;
  timezone: string;
  locationRetentionDays: number;
  createdAt: string;
}

export interface MemberDto {
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: string;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

export interface VehicleDto {
  id: string;
  type: VehicleType;
  name: string;
  make: string | null;
  model: string | null;
  color: string | null;
  plate: string;
  plateFormat: PlateFormat;
  speedLimitKmh: number | null;
  archivedAt: string | null;
  createdAt: string;
  device: { id: string; imei: string; status: DeviceStatus; lastSeenAt: string | null } | null;
}

export interface DeviceDto {
  id: string;
  imei: string;
  label: string | null;
  model: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  batteryPct: number | null;
  archivedAt: string | null;
  createdAt: string;
  vehicle: { id: string; name: string; plate: string; type: VehicleType } | null;
}

export interface AuditEntryDto {
  id: string;
  action: string;
  actor: { id: string; name: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  at: string;
}

export interface ApiErrorDto {
  statusCode: number;
  error: string;
  /** Machine-readable code, translated by clients (e.g. "imei.already_registered"). */
  code: string;
  issues?: { path: string; code: string }[];
}
