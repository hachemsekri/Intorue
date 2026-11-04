/**
 * Drizzle table definitions used for typed queries.
 * The source of truth for DDL (constraints, RLS, indexes) is src/migrations/*.sql.
 */
import { bigint, boolean, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  locale: text('locale').$type<'fr' | 'ar' | 'en'>().notNull(),
  passwordChangedAt: ts('password_changed_at').notNull().defaultNow(),
  disabledAt: ts('disabled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: text('kind').$type<'personal' | 'business'>().notNull(),
  timezone: text('timezone').notNull(),
  locationRetentionDays: integer('location_retention_days').notNull(),
  isDemo: boolean('is_demo').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: text('role').$type<'owner' | 'manager' | 'viewer'>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  email: text('email').notNull(),
  role: text('role').$type<'owner' | 'manager' | 'viewer'>().notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: uuid('invited_by'),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  replacedBy: uuid('replaced_by'),
  userAgent: text('user_agent'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const consents = pgTable('consents', {
  userId: uuid('user_id').notNull(),
  documentKey: text('document_key').notNull(),
  version: text('version').notNull(),
  acceptedAt: ts('accepted_at').notNull().defaultNow(),
});

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  type: text('type').$type<'car' | 'motorcycle' | 'scooter'>().notNull(),
  name: text('name').notNull(),
  make: text('make'),
  model: text('model'),
  color: text('color'),
  plate: text('plate').notNull(),
  plateFormat: text('plate_format').$type<'tn_standard' | 'tn_rs' | 'other'>().notNull(),
  speedLimitKmh: integer('speed_limit_kmh'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  imei: text('imei').notNull(),
  label: text('label'),
  model: text('model'),
  protocol: text('protocol'),
  gatewayRef: text('gateway_ref'),
  lastSeenAt: ts('last_seen_at'),
  batteryPct: smallint('battery_pct'),
  archivedAt: ts('archived_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const deviceAssignments = pgTable('device_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  deviceId: uuid('device_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
  createdBy: uuid('created_by'),
});

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orgId: uuid('org_id'),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ip: text('ip'),
  at: ts('at').notNull().defaultNow(),
});
