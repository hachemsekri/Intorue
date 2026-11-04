/**
 * Demo seed: creates clearly labelled SAMPLE data for local development.
 * Every demo organization name starts with "[DÉMO]" and has is_demo = true.
 * Refuses to run when NODE_ENV=production.
 *
 * Demo accounts (development only):
 *   owner    demo.owner@winou.test     password: DemoWinou2026
 *   manager  demo.manager@winou.test   password: DemoWinou2026
 *   viewer   demo.viewer@winou.test    password: DemoWinou2026
 *   personal demo.perso@winou.test     password: DemoWinou2026
 */
import { imeiWithCheckDigit, parsePlate, type VehicleType } from '@winou/shared';
import { inArray, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/crypto';
import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';
import { migrate } from '../db/migrate';
import { alertRules, auditLog, deviceAssignments, devices, memberships, organizations, users, vehicles } from '../db/schema';

export const DEMO_PASSWORD = 'DemoWinou2026';
const DEMO_EMAILS = [
  'demo.owner@winou.test',
  'demo.manager@winou.test',
  'demo.viewer@winou.test',
  'demo.perso@winou.test',
];

const FLEET: { type: VehicleType; name: string; make: string; model: string; plate: string }[] = [
  { type: 'car', name: 'Renault Clio', make: 'Renault', model: 'Clio', plate: '245 TUN 7812' },
  { type: 'car', name: 'Dacia Logan', make: 'Dacia', model: 'Logan', plate: '198 TUN 3044' },
  { type: 'car', name: 'Hyundai i20', make: 'Hyundai', model: 'i20', plate: '231 TUN 1590' },
  { type: 'car', name: 'Kia Picanto', make: 'Kia', model: 'Picanto', plate: '220 TUN 9087' },
  { type: 'motorcycle', name: 'Moto Yamaha', make: 'Yamaha', model: 'MT-07', plate: '77 TUN 2106' },
  { type: 'scooter', name: 'Trottinette 014', make: 'Xiaomi', model: 'Pro 2', plate: 'TR-014' },
];

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production.');
  const reset = process.argv.includes('--reset');
  const db = await createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });
  await migrate(db);
  const s = db.system;

  const existing = await s.select().from(users).where(inArray(users.email, DEMO_EMAILS));
  if (existing.length && !reset) {
    console.log('Demo data already present. Run with --reset to recreate it.');
    await db.close();
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await s.transaction(async (tx) => {
    if (existing.length) {
      const ids = existing.map((u) => u.id);
      const orgIds = (
        await tx.select({ id: memberships.orgId }).from(memberships).where(inArray(memberships.userId, ids))
      ).map((r) => r.id);
      if (orgIds.length) {
        const demoOrgs = await tx.select({ id: organizations.id }).from(organizations).where(inArray(organizations.id, orgIds));
        const demoIds = demoOrgs.map((o) => o.id);
        await tx.delete(organizations).where(inArray(organizations.id, demoIds));
      }
      await tx.delete(users).where(inArray(users.id, ids));
    }

    const [owner, manager, viewer, perso] = await tx
      .insert(users)
      .values([
        { email: DEMO_EMAILS[0]!, name: 'Démo Propriétaire', passwordHash, locale: 'fr' as const },
        { email: DEMO_EMAILS[1]!, name: 'Démo Gestionnaire', passwordHash, locale: 'fr' as const },
        { email: DEMO_EMAILS[2]!, name: 'Démo Lecteur', passwordHash, locale: 'ar' as const },
        { email: DEMO_EMAILS[3]!, name: 'Démo Particulier', passwordHash, locale: 'fr' as const },
      ])
      .returning();

    const [biz, personal] = await tx
      .insert(organizations)
      .values([
        { name: '[DÉMO] Agence exemple Tunis', kind: 'business' as const, timezone: 'Africa/Tunis', locationRetentionDays: 90, isDemo: true },
        { name: '[DÉMO] Démo Particulier', kind: 'personal' as const, timezone: 'Africa/Tunis', locationRetentionDays: 90, isDemo: true },
      ])
      .returning();

    await tx.insert(memberships).values([
      { orgId: biz!.id, userId: owner!.id, role: 'owner' as const },
      { orgId: biz!.id, userId: manager!.id, role: 'manager' as const },
      { orgId: biz!.id, userId: viewer!.id, role: 'viewer' as const },
      { orgId: personal!.id, userId: perso!.id, role: 'owner' as const },
    ]);

    let n = 1;
    const vehicleIds = new Map<string, string>();
    for (const v of FLEET) {
      const plate = parsePlate(v.plate)!;
      const [veh] = await tx
        .insert(vehicles)
        .values({ orgId: biz!.id, type: v.type, name: v.name, make: v.make, model: v.model, plate: plate.normalized, plateFormat: plate.format })
        .returning();
      vehicleIds.set(v.name, veh!.id);
      // Test IMEIs in a clearly fake range (35 00000 ...), valid Luhn.
      const imei = imeiWithCheckDigit(`350000000000${String(n++).padStart(2, '0')}`);
      const [dev] = await tx
        .insert(devices)
        .values({ orgId: biz!.id, imei, label: `[DÉMO] ${v.name}`, model: 'Simulateur' })
        .returning();
      await tx.insert(deviceAssignments).values({ orgId: biz!.id, deviceId: dev!.id, vehicleId: veh!.id, createdBy: owner!.id });
    }
    // One spare device, not linked yet.
    await tx.insert(devices).values({ orgId: biz!.id, imei: imeiWithCheckDigit('35000000000099'), label: '[DÉMO] Boîtier de rechange', model: 'Simulateur' });

    const [pv] = await tx
      .insert(vehicles)
      .values({ orgId: personal!.id, type: 'car', name: 'Peugeot 208', make: 'Peugeot', model: '208', plate: '201 TUN 5521', plateFormat: 'tn_standard' })
      .returning();
    const [pd] = await tx
      .insert(devices)
      .values({ orgId: personal!.id, imei: imeiWithCheckDigit('35000000000050'), label: '[DÉMO] 208', model: 'Simulateur' })
      .returning();
    await tx.insert(deviceAssignments).values({ orgId: personal!.id, deviceId: pd!.id, vehicleId: pv!.id, createdBy: perso!.id });

    await tx.insert(auditLog).values({ orgId: biz!.id, actorUserId: owner!.id, action: 'org.created', targetType: 'organization', targetId: biz!.id, metadata: { seed: true } });

    // Demo zones (approximate shapes) and alert rules matching the simulator scenarios.
    const circle = async (name: string, lon: number, lat: number, radiusM: number) => {
      const shape = { kind: 'circle', center: [lon, lat], radiusM };
      const res = (await tx.execute(sql`
        insert into geofences (org_id, name, kind, shape, geom)
        values (${biz!.id}, ${name}, 'circle', ${JSON.stringify(shape)}::jsonb,
                ST_Buffer(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radiusM}, 'quad_segs=16'))
        returning id`)) as unknown as { rows: { id: string }[] };
      return res.rows[0]!.id;
    };
    const grandTunis = await circle('Grand Tunis', 10.19, 36.83, 16_000);
    const sidiBou = await circle('Sidi Bou Saïd', 10.3435, 36.8705, 900);
    await circle('Agence (Les Berges du Lac)', 10.2336, 36.8322, 250);
    const id = (name: string) => vehicleIds.get(name)!;
    await tx.insert(alertRules).values([
      { orgId: biz!.id, type: 'speeding', name: 'Excès de vitesse (110 km/h)', enabled: true, severity: 'warning', params: { limitKmh: 110, minDurationS: 15 }, vehicleIds: null, createdBy: owner!.id },
      { orgId: biz!.id, type: 'speeding', name: 'Moto en ville (60 km/h)', enabled: true, severity: 'warning', params: { limitKmh: 60, minDurationS: 10 }, vehicleIds: [id('Moto Yamaha')], createdBy: owner!.id },
      { orgId: biz!.id, type: 'geofence_exit', name: 'Sortie du Grand Tunis', enabled: true, severity: 'warning', params: { geofenceId: grandTunis }, vehicleIds: null, createdBy: owner!.id },
      { orgId: biz!.id, type: 'geofence_exit', name: 'Trottinette hors de Sidi Bou Saïd', enabled: true, severity: 'warning', params: { geofenceId: sidiBou }, vehicleIds: [id('Trottinette 014')], createdBy: owner!.id },
      { orgId: biz!.id, type: 'device_offline', name: 'Boîtier hors ligne (15 min)', enabled: true, severity: 'urgent', params: { afterMinutes: 15 }, vehicleIds: null, createdBy: owner!.id },
      { orgId: biz!.id, type: 'low_battery', name: 'Batterie faible (20 %)', enabled: true, severity: 'warning', params: { thresholdPct: 20 }, vehicleIds: null, createdBy: owner!.id },
      {
        orgId: biz!.id,
        type: 'movement_schedule',
        name: 'Mouvement hors horaires (7h–20h)',
        enabled: true,
        severity: 'urgent',
        params: { windows: [{ days: [1, 2, 3, 4, 5, 6, 7], start: '07:00', end: '20:00' }], minSpeedKmh: 5 },
        vehicleIds: [id('Kia Picanto')],
        createdBy: owner!.id,
      },
    ]);
  });

  console.log('Demo data created ([DÉMO] organizations). Sign in with demo.owner@winou.test (see src/scripts/seed.ts).');
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
