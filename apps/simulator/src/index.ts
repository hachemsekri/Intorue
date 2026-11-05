/**
 * Intorue device simulator. SAMPLE DATA ONLY.
 *
 * Sends simulated GPS fixes through the same path as real devices:
 *   --target api      (default) POST to the API ingest endpoint, in Traccar's forwarding format,
 *                     so the API's Traccar adapter decodes them exactly like forwarded real data.
 *   --target traccar  send to a running Traccar server (OsmAnd protocol, port 5055), which then
 *                     forwards to the API. Requires Traccar (Docker); not tested in this setup yet.
 *
 * Usage:  corepack pnpm sim [--interval 5] [--only 3,5] [--once] [--history 6] [--target api|traccar]
 *   --history N  first replays the last N hours (timestamps in the past) so trip history
 *                and alerts have data right away, then continues live from that state.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SimVehicle, type SimFix } from './engine';
import { SCENARIOS } from './road-scenarios';

const KMH_TO_KNOTS = 1 / 1.852;

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    intervalS: Number(get('interval') ?? 5),
    only: get('only')?.split(',').map((n) => Number(n.trim()) - 1),
    once: a.includes('--once'),
    historyH: Number(get('history') ?? 0),
    target: (get('target') ?? 'api') as 'api' | 'traccar',
    api: get('api') ?? process.env.SIM_API_URL ?? 'http://localhost:4000',
    traccar: get('traccar') ?? process.env.SIM_TRACCAR_URL ?? 'http://localhost:5055',
  };
}

/** Traccar position-forwarding JSON, as Traccar itself would post it. */
export function toTraccarForward(f: SimFix) {
  return {
    position: {
      latitude: f.lat,
      longitude: f.lon,
      speed: Math.round(f.speedKmh * KMH_TO_KNOTS * 100) / 100,
      course: f.heading,
      valid: true,
      fixTime: f.at.toISOString(),
      attributes: {
        simulated: true,
        ignition: f.ignition,
        motion: f.speedKmh >= 3,
        ...(f.batteryPct !== null ? { batteryLevel: f.batteryPct } : {}),
      },
    },
    device: { uniqueId: f.imei },
  };
}

async function sendApi(api: string, secret: string, fixes: SimFix[]) {
  const res = await fetch(`${api}/api/ingest/traccar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ingest-secret': secret },
    body: JSON.stringify(fixes.map(toTraccarForward)),
  });
  if (!res.ok) throw new Error(`API answered ${res.status} ${await res.text()}`);
  return (await res.json()) as { accepted: number; duplicates: number; unknownDevice: number; rejected: number };
}

async function sendTraccar(base: string, fixes: SimFix[]) {
  for (const f of fixes) {
    const q = new URLSearchParams({
      id: f.imei,
      lat: String(f.lat),
      lon: String(f.lon),
      timestamp: String(Math.floor(f.at.getTime() / 1000)),
      speed: String(f.speedKmh * KMH_TO_KNOTS),
      bearing: String(f.heading),
      ...(f.batteryPct !== null ? { batt: String(f.batteryPct) } : {}),
    });
    const res = await fetch(`${base}/?${q}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Traccar answered ${res.status}`);
  }
}

async function main() {
  for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      break;
    }
  }
  const o = args();
  const secret = process.env.INGEST_SECRET;
  if (o.target === 'api' && !secret) {
    console.error('INGEST_SECRET is not set. Add it to .env (same value as the API).');
    process.exit(1);
  }
  const chosen = o.only ? SCENARIOS.filter((_, i) => o.only!.includes(i)) : SCENARIOS;
  const vehicles = chosen.map((s, i) => new SimVehicle(s, 1000 + i));

  console.log(`[DÉMO] Simulateur Intorue : ${vehicles.length} véhicules simulés, un point toutes les ${o.intervalS} s → ${o.target}`);
  vehicles.forEach((v, i) => console.log(`  ${i + 1}. ${v.scenario.label}  (IMEI ${v.scenario.imei})`));

  if (o.historyH > 0 && o.target === 'api') {
    const end = Date.now();
    const start = end - o.historyH * 3600_000;
    const backlog: SimFix[] = [];
    let first = true;
    for (let t = start; t < end; t += o.intervalS * 1000) {
      for (const v of vehicles) {
        const f = v.step(first ? 0 : o.intervalS, new Date(t));
        if (f) backlog.push(f);
      }
      first = false;
    }
    console.log(`Historique : ${backlog.length} points sur ${o.historyH} h…`);
    let accepted = 0;
    for (let i = 0; i < backlog.length; i += 100) {
      const r = await sendApi(o.api, secret!, backlog.slice(i, i + 100));
      accepted += r.accepted;
      if ((i / 100) % 20 === 0) process.stdout.write(`  ${Math.min(i + 100, backlog.length)}/${backlog.length}
`);
    }
    console.log(`Historique envoyé : ${accepted} points acceptés.          `);
  }

  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\nArrêt du simulateur.');
    process.exit(0);
  });

  let first = o.historyH <= 0;
  while (!stopping) {
    const now = new Date();
    const fixes = vehicles.map((v) => v.step(first ? 0 : o.intervalS, now)).filter((f): f is SimFix => f !== null);
    first = false;
    try {
      if (fixes.length) {
        if (o.target === 'api') {
          const r = await sendApi(o.api, secret!, fixes);
          const time = now.toLocaleTimeString('fr-TN', { timeZone: 'Africa/Tunis', hour12: false });
          console.log(`${time}  envoyés ${fixes.length}  acceptés ${r.accepted}  inconnus ${r.unknownDevice}  rejetés ${r.rejected}`);
          if (r.unknownDevice) console.log('  ⚠ IMEI inconnus : lancez « corepack pnpm db:seed » ou ajoutez les boîtiers dans l’app.');
        } else {
          await sendTraccar(o.traccar, fixes);
        }
      }
    } catch (e) {
      console.error(`Envoi impossible (${(e as Error).message}). Nouvel essai au prochain cycle.`);
    }
    if (o.once) break;
    await new Promise((r) => setTimeout(r, o.intervalS * 1000));
  }
}

if (require.main === module) void main();
