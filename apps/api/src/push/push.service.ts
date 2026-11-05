import { Inject, Injectable, Logger } from '@nestjs/common';
import { brand } from '@winou/config';
import { messages, interpolate, type SupportedLocale } from '@winou/i18n';
import { can, formatPlate, type AlertDto, type Role } from '@winou/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { CLOCK, DB, type Clock } from '../common/tokens';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'high' | 'normal';
}

/** Delivery channel. "console" logs (development); "expo" uses the Expo Push Service. */
export interface PushSender {
  send(msgs: PushMessage[]): Promise<{ invalidTokens: string[] }>;
}

export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger('Push');
  async send(msgs: PushMessage[]) {
    for (const m of msgs) this.logger.log(`→ ${m.to.slice(0, 18)}… ${m.title} — ${m.body}`);
    return { invalidTokens: [] };
  }
}

export class MemoryPushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(msgs: PushMessage[]) {
    this.sent.push(...msgs);
    return { invalidTokens: msgs.map((m) => m.to).filter((t) => this.invalid.has(t)) };
  }
}

/**
 * Expo Push Service (free; it relays to Apple APNs and Google FCM). Only the alert title,
 * a short text and IDs are sent: no coordinates. Enabled with PUSH_PROVIDER=expo.
 */
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger('Push');
  constructor(private readonly accessToken?: string) {}

  async send(msgs: PushMessage[]) {
    const invalidTokens: string[] = [];
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, priority: m.priority, sound: 'default' }))),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push failed: HTTP ${res.status}`);
        continue;
      }
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((r, j) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') invalidTokens.push(chunk[j]!.to);
      });
    }
    return { invalidTokens };
  }
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;
export const isExpoPushToken = (t: string) => EXPO_TOKEN.test(t);

@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(userId: string, token: string, platform: 'ios' | 'android', locale: string) {
    // A token moves to the newest account that registers it (phone handed over, new sign-in).
    await this.db.system.execute(sql`
      insert into push_tokens (user_id, token, platform, locale, last_seen_at)
      values (${userId}, ${token}, ${platform}, ${locale}, ${this.clock.now().toISOString()})
      on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
        locale = excluded.locale, last_seen_at = excluded.last_seen_at`);
  }

  async unregister(userId: string, token: string) {
    await this.db.system.execute(sql`delete from push_tokens where token = ${token} and user_id = ${userId}`);
  }

  async preferences(userId: string, orgId: string) {
    const res = (await this.db.system.execute(sql`
      select enabled, urgent_only from push_preferences where user_id = ${userId} and org_id = ${orgId}`)) as unknown as {
      rows: { enabled: boolean; urgent_only: boolean }[];
    };
    const r = res.rows[0];
    return { enabled: r?.enabled ?? true, urgentOnly: r?.urgent_only ?? false };
  }

  async setPreferences(userId: string, orgId: string, p: { enabled: boolean; urgentOnly: boolean }) {
    await this.db.system.execute(sql`
      insert into push_preferences (user_id, org_id, enabled, urgent_only, updated_at)
      values (${userId}, ${orgId}, ${p.enabled}, ${p.urgentOnly}, ${this.clock.now().toISOString()})
      on conflict (user_id, org_id) do update set enabled = excluded.enabled, urgent_only = excluded.urgent_only, updated_at = excluded.updated_at`);
    return p;
  }

  /**
   * Notifies current members of the alert's organization who may read alerts and did not opt
   * out. Membership is read at send time, so removed members get nothing.
   */
  async notifyAlert(orgId: string, alert: AlertDto): Promise<number> {
    const res = (await this.db.system.execute(sql`
      select t.token, t.locale, m.role, coalesce(p.enabled, true) as enabled, coalesce(p.urgent_only, false) as urgent_only
      from memberships m
      join users u on u.id = m.user_id and u.disabled_at is null
      join push_tokens t on t.user_id = m.user_id
      left join push_preferences p on p.user_id = m.user_id and p.org_id = m.org_id
      where m.org_id = ${orgId}`)) as unknown as {
      rows: { token: string; locale: SupportedLocale; role: Role; enabled: boolean; urgent_only: boolean }[];
    };
    const targets = res.rows.filter(
      (r) => r.enabled && can(r.role, 'alerts.read') && (!r.urgent_only || alert.severity === 'urgent'),
    );
    if (!targets.length) return 0;
    const msgs = targets.map((r) => ({ to: r.token, ...this.text(alert, r.locale in messages ? r.locale : 'fr'), data: { kind: 'alert', orgId, alertId: alert.id, vehicleId: alert.vehicle.id }, priority: alert.severity === 'urgent' ? ('high' as const) : ('normal' as const) }));
    try {
      const { invalidTokens } = await this.sender.send(msgs);
      if (invalidTokens.length) {
        await this.db.system.execute(sql`delete from push_tokens where token in (${sql.join(invalidTokens.map((x) => sql`${x}`), sql`, `)})`);
      }
    } catch (e) {
      this.logger.warn(`Push sending failed: ${(e as Error).message}`);
    }
    return msgs.length;
  }

  /** Short, translated text. No coordinates or addresses on the lock screen. */
  private text(a: AlertDto, locale: SupportedLocale): { title: string; body: string } {
    const m = messages[locale];
    const d = a.details as Record<string, string | number>;
    const plate = formatPlate(a.vehicle.plate, /TUN/.test(a.vehicle.plate) ? 'tn_standard' : 'other', locale);
    const vars = { plate, speed: d.speedKmh ?? '', limit: d.limitKmh ?? '', zone: d.geofenceName ?? '', time: d.localTime ?? '', pct: d.batteryPct ?? '', since: '' };
    const body = a.type === 'device_offline' ? `${plate} · ${m.alerts.types.device_offline}` : interpolate(m.alerts.desc[a.type], vars);
    return { title: `${brand.name} · ${m.alerts.types[a.type]} · ${a.vehicle.name}`, body };
  }
}
