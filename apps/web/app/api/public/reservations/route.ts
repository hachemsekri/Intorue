/**
 * "Demander un devis" (home page form) while the API is not deployed.
 * Receives the same request as the API's POST /api/public/reservations, checks it the same way,
 * and sends the details by email through Resend. Takes priority over the /api rewrite.
 * Env (Cloudflare Worker -> Settings -> Variables and Secrets):
 *   RESEND_API_KEY (secret), QUOTE_NOTIFY_TO, QUOTE_FROM (e.g. "Intorue <devis@muycab.host>")
 */
import { PRICING, quoteFor } from '@winou/config';
import { LOCALES, normalizePhone } from '@winou/shared';
import { quoteEmail } from './email';

const MIN_FILL_MS = 3000;
const PER_HOUR = 5;
const hits = new Map<string, number[]>();

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const invalid = (path: string) => json(400, { code: 'validation', issues: [{ path }] });

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > PER_HOUR;
}

function count(v: unknown): number | null {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= PRICING.maxPerKind ? (v as number) : null;
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('x-winou-csrf') !== '1') return json(403, { code: 'forbidden' });

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: 'validation' });
  }

  if (clean(b.website, 200)) return json(400, { code: 'reservation.rejected' });
  if (typeof b.elapsedMs !== 'number' || b.elapsedMs < MIN_FILL_MS) return json(400, { code: 'reservation.too_fast' });

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (limited(ip)) return json(429, { code: 'rate_limited' });

  const phone = typeof b.phone === 'string' ? normalizePhone(b.phone) : null;
  if (!phone) return invalid('phone');

  const name = clean(b.name, 100);
  if (!name || !/\p{L}/u.test(name)) return invalid('name');

  const clientType = b.clientType === 'company' ? 'company' : b.clientType === 'individual' ? 'individual' : null;
  if (!clientType) return invalid('clientType');
  const company = clientType === 'company' ? clean(b.company, 120) : '';
  if (clientType === 'company' && !company) return invalid('company');

  const v = (b.vehicles ?? {}) as Record<string, unknown>;
  const car = count(v.car);
  const moto = count(v.moto);
  const trot = count(v.trot);
  if (car === null || moto === null || trot === null || car + moto + trot < 1) return invalid('vehicles');

  const city = clean(b.city, 80);
  const locale = (LOCALES as readonly string[]).includes(b.locale as string) ? (b.locale as string) : 'fr';
  const quote = quoteFor({ car, moto, trot });

  const key = process.env.RESEND_API_KEY;
  const to = process.env.QUOTE_NOTIFY_TO;
  const from = process.env.QUOTE_FROM;
  if (!key || !to || !from) {
    console.error('[quote] RESEND_API_KEY, QUOTE_NOTIFY_TO or QUOTE_FROM is missing');
    return json(500, { code: 'server' });
  }

  const mail = quoteEmail({ name, phone, clientType, company, city, car, moto, trot, total: quote.total, saved: quote.saved, locale, receivedAt: new Date() });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  }).catch(() => null);

  if (!res || !res.ok) {
    console.error('[quote] email not sent', res?.status, await res?.text().catch(() => ''));
    return json(502, { code: 'server' });
  }
  return json(201, { saved: true, duplicate: false, total: quote.total, saved_dt: quote.saved });
}