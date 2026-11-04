import { bearingDeg, distanceM, lerp, rng, type LatLon } from './geo';
import type { Leg, Scenario } from './scenarios';

export interface SimFix {
  imei: string;
  at: Date;
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number;
  batteryPct: number | null;
  ignition: boolean;
}

/**
 * One simulated vehicle. `step(dtS, now)` advances it and returns the fix the device
 * would send, or null while the device is silent (disconnected, or parked between reports).
 * Pure apart from its own state: no I/O, deterministic for a given seed.
 */
export class SimVehicle {
  private legs: Leg[];
  private legIndex = 0;
  private pos: LatLon;
  private from: LatLon;
  private stopLeftS = 0;
  private speed = 0;
  private heading = 0;
  private elapsedS = 0;
  private sinceReportS = Infinity;
  private battery: number | null;
  private readonly rand: () => number;

  constructor(
    public scenario: Scenario,
    seed = 1,
  ) {
    this.legs = scenario.legs;
    this.pos = scenario.start;
    this.from = scenario.start;
    this.battery = scenario.battery?.startPct ?? null;
    this.rand = rng(seed);
  }

  /** True while the scenario says the device is not transmitting. */
  silent(): boolean {
    const d = this.scenario.disconnect;
    if (!d || this.elapsedS < d.firstAfterS) return false;
    return (this.elapsedS - d.firstAfterS) % d.everyS < d.forS;
  }

  step(dtS: number, now: Date): SimFix | null {
    this.elapsedS += dtS;
    this.sinceReportS += dtS;
    this.move(dtS);
    this.drainBattery(dtS);
    if (this.silent()) return null;

    const parked = this.speed < 1;
    const every = parked ? (this.scenario.parkedReportS ?? 0) : 0;
    if (this.sinceReportS < every) return null;
    this.sinceReportS = 0;

    // A parked GPS still wanders a few metres.
    const jitter = parked ? 0.00002 : 0;
    return {
      imei: this.scenario.imei,
      at: now,
      lat: round6(this.pos[0] + (this.rand() - 0.5) * jitter),
      lon: round6(this.pos[1] + (this.rand() - 0.5) * jitter),
      speedKmh: Math.round(this.speed * 10) / 10,
      heading: Math.round(this.heading) % 360,
      batteryPct: this.battery === null ? null : Math.round(this.battery),
      ignition: !parked || this.stopLeftS <= 0,
    };
  }

  private move(dtS: number) {
    if (this.stopLeftS > 0) {
      this.stopLeftS -= dtS;
      this.speed = 0;
      return;
    }
    let budgetS = dtS;
    while (budgetS > 0) {
      const leg = this.legs[this.legIndex]!;
      if (leg.kmh <= 0) {
        this.arrive(leg);
        this.speed = 0;
        return;
      }
      // Drive near the target speed, with some variation.
      const target = leg.kmh * (0.88 + this.rand() * 0.2);
      this.speed = this.speed + (target - this.speed) * 0.6;
      const remaining = distanceM(this.pos, leg.to);
      const canGo = (this.speed / 3.6) * budgetS;
      this.heading = bearingDeg(this.pos, leg.to);
      if (canGo < remaining) {
        this.pos = lerp(this.pos, leg.to, canGo / remaining);
        return;
      }
      budgetS -= remaining / Math.max(this.speed / 3.6, 0.1);
      this.pos = leg.to;
      this.arrive(leg);
      if (this.stopLeftS > 0) {
        this.speed = 0;
        return;
      }
    }
  }

  private arrive(leg: Leg) {
    this.stopLeftS = leg.stopS ?? 0;
    this.legIndex++;
    if (this.legIndex >= this.legs.length) {
      this.legIndex = 0;
      if (this.scenario.loop === 'reverse') {
        // Drive back: reverse the points, keeping each leg's speed with its segment.
        const points: LatLon[] = [this.scenario.start, ...this.legs.map((l) => l.to)];
        const back: Leg[] = [];
        for (let i = points.length - 1; i > 0; i--) {
          const original = this.legs[i - 1]!;
          back.push({ to: points[i - 1]!, kmh: original.kmh, stopS: i - 1 === 0 ? (this.legs.at(-1)!.stopS ?? 0) : undefined });
        }
        this.from = points.at(-1)!;
        this.legs = back;
        this.scenario = { ...this.scenario, start: this.from };
      } else {
        this.pos = this.scenario.start;
      }
    }
  }

  private drainBattery(dtS: number) {
    const b = this.scenario.battery;
    if (!b || this.battery === null) return;
    if (this.speed > 1) this.battery = Math.max(0, this.battery - (b.drainPctPerMin * dtS) / 60);
    if (this.battery < b.rechargeBelowPct && this.stopLeftS > 0) this.battery = 100; // swapped at a charging spot
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
