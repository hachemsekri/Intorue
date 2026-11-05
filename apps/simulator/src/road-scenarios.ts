/**
 * The scenarios as the simulator drives them: the hand-placed waypoints of ./scenarios, replaced
 * by paths along real roads (one-way streets respected, return trips routed on their own) from
 * road-legs.generated.json — built by `node scripts/build-sim-routes.mjs` from our own map tiles.
 * A scenario missing from that file keeps its hand-placed waypoints.
 */
import roads from './road-legs.generated.json';
import type { LatLon } from './geo';
import { SCENARIOS as HAND_PLACED, type Leg, type Scenario } from './scenarios';

interface RoadScenario {
  start: [number, number];
  loop: 'restart';
  legs: { to: [number, number]; kmh: number; stopS?: number }[];
}
const ROADS = (roads as unknown as { scenarios: Record<string, RoadScenario> }).scenarios;

export const SCENARIOS: Scenario[] = HAND_PLACED.map((s) => {
  const r = ROADS[s.imei];
  if (!r) return s;
  return { ...s, start: r.start as LatLon, loop: r.loop, legs: r.legs.map((l): Leg => ({ to: l.to as LatLon, kmh: l.kmh, ...(l.stopS ? { stopS: l.stopS } : {}) })) };
});
