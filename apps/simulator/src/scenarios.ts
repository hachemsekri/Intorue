/**
 * SAMPLE DATA. Simulated vehicles around Tunis. Coordinates follow the main roads
 * approximately (hand-placed points, not snapped to a road network).
 *
 * Each leg says how fast the vehicle tries to drive to the next point and how long it
 * stops there. Scenarios cover: normal driving, delivery stops, a parked car, speeding,
 * leaving the Tunis area, a device that goes silent, and a scooter whose battery runs low.
 */
import { imeiWithCheckDigit } from '@winou/shared';
import type { LatLon } from './geo';

export interface Leg {
  to: LatLon;
  /** Target speed towards `to`, km/h. */
  kmh: number;
  /** Stop at `to` for this many seconds. */
  stopS?: number;
}

export interface Scenario {
  imei: string;
  label: string;
  start: LatLon;
  legs: Leg[];
  /** Restart from `start` after the last leg (otherwise drive the legs backwards). */
  loop: 'restart' | 'reverse';
  /** Silent periods: every `everyS` seconds the device stops sending for `forS` seconds. */
  disconnect?: { firstAfterS: number; everyS: number; forS: number };
  /** Battery percentage reported by the device (scooters report it). */
  battery?: { startPct: number; drainPctPerMin: number; rechargeBelowPct: number };
  /** Seconds between two reports while parked (trackers report less often when still). */
  parkedReportS?: number;
}

// Points of interest (approximate).
const P = {
  bourguiba: [36.8003, 10.1866],
  babBhar: [36.7992, 10.1803],
  passage: [36.8075, 10.1772],
  lafayette: [36.8117, 10.1813],
  belvedere: [36.8188, 10.1765],
  lacBridge: [36.8052, 10.2003],
  lac1: [36.8322, 10.2336],
  gp9a: [36.8158, 10.2412],
  gp9b: [36.8236, 10.2851],
  goulette: [36.8186, 10.3049],
  kram: [36.8352, 10.3148],
  carthage: [36.8531, 10.3249],
  sidiBou: [36.8696, 10.3412],
  sidiBouCliff: [36.8731, 10.3486],
  marsa: [36.8784, 10.3244],
  marsaPlage: [36.8858, 10.3297],
  ariana: [36.8625, 10.1956],
  menzah6: [36.8463, 10.1802],
  cun: [36.8452, 10.1951],
  charguia: [36.8395, 10.2095],
  benArous: [36.7532, 10.2281],
  a1a: [36.7302, 10.2905],
  a1b: [36.6905, 10.3802],
  grombalia: [36.5992, 10.5003],
  a1c: [36.4991, 10.5612],
  hammametNord: [36.4302, 10.5721],
  hammamet: [36.4005, 10.6151],
  bardo: [36.8091, 10.1342],
  bardoRoad: [36.8052, 10.1551],
  babSaadoun: [36.8071, 10.1652],
} as const satisfies Record<string, LatLon>;

/** Same IMEIs as the demo seed (apps/api/src/scripts/seed.ts). */
const imei = (n: number) => imeiWithCheckDigit(`350000000000${String(n).padStart(2, '0')}`);

export const SCENARIOS: Scenario[] = [
  {
    imei: imei(1),
    label: 'Renault Clio · centre → La Marsa (conduite normale)',
    start: P.bourguiba,
    loop: 'reverse',
    legs: [
      { to: P.lacBridge, kmh: 45 },
      { to: P.gp9a, kmh: 70 },
      { to: P.gp9b, kmh: 80 },
      { to: P.goulette, kmh: 50, stopS: 120 },
      { to: P.kram, kmh: 50 },
      { to: P.carthage, kmh: 50 },
      { to: P.marsa, kmh: 45, stopS: 600 },
    ],
  },
  {
    imei: imei(2),
    label: 'Dacia Logan · livraisons Ariana / Centre Urbain Nord (arrêts)',
    start: P.ariana,
    loop: 'restart',
    legs: [
      { to: P.menzah6, kmh: 40, stopS: 240 },
      { to: P.cun, kmh: 40, stopS: 300 },
      { to: P.charguia, kmh: 45, stopS: 240 },
      { to: P.ariana, kmh: 45, stopS: 180 },
    ],
  },
  {
    imei: imei(3),
    label: 'Hyundai i20 · Tunis → Hammamet par l’A1 (excès de vitesse, sortie de zone)',
    start: P.bourguiba,
    loop: 'reverse',
    legs: [
      { to: P.benArous, kmh: 60 },
      { to: P.a1a, kmh: 105 },
      { to: P.a1b, kmh: 128 }, // above the 110 km/h motorway limit
      { to: P.grombalia, kmh: 125 },
      { to: P.a1c, kmh: 110 },
      { to: P.hammametNord, kmh: 90 },
      { to: P.hammamet, kmh: 45, stopS: 900 },
    ],
  },
  {
    imei: imei(4),
    label: 'Kia Picanto · garée à l’agence (Les Berges du Lac)',
    start: P.lac1,
    loop: 'restart',
    legs: [{ to: P.lac1, kmh: 0, stopS: 3600 }],
    parkedReportS: 60,
  },
  {
    imei: imei(5),
    label: 'Moto Yamaha · coursier Lafayette (vitesse en ville, boîtier coupé par moments)',
    start: P.lafayette,
    loop: 'restart',
    legs: [
      { to: P.passage, kmh: 45, stopS: 90 },
      { to: P.babBhar, kmh: 40, stopS: 120 },
      { to: P.bourguiba, kmh: 35 },
      { to: P.belvedere, kmh: 82 }, // 82 km/h in a 50 zone
      { to: P.lafayette, kmh: 50, stopS: 60 },
    ],
    disconnect: { firstAfterS: 360, everyS: 1800, forS: 720 },
  },
  {
    imei: imei(6),
    label: 'Trottinette 014 · Sidi Bou Saïd → La Marsa (batterie faible, sortie de zone)',
    start: P.sidiBou,
    loop: 'reverse',
    legs: [
      { to: P.sidiBouCliff, kmh: 15, stopS: 300 },
      { to: P.sidiBou, kmh: 18 },
      { to: P.marsa, kmh: 20 },
      { to: P.marsaPlage, kmh: 16, stopS: 600 },
    ],
    battery: { startPct: 24, drainPctPerMin: 0.8, rechargeBelowPct: 8 },
  },
  {
    imei: imei(50),
    label: 'Peugeot 208 (compte particulier) · Bardo → centre',
    start: P.bardo,
    loop: 'reverse',
    legs: [
      { to: P.bardoRoad, kmh: 50 },
      { to: P.babSaadoun, kmh: 40 },
      { to: P.bourguiba, kmh: 30, stopS: 1200 },
    ],
  },
];
