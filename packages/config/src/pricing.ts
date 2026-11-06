/**
 * Prices: the one place to change them. The web page shows these values and the API recalculates
 * every quote from them, so a total sent by a browser is never trusted.
 */
export const VEHICLE_KINDS = ['car', 'moto', 'trot'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];
export type VehicleCounts = Record<VehicleKind, number>;

export const PRICING = {
  currency: 'DT',
  /** Tracker, SIM, installation and first year, per vehicle. */
  items: {
    car: { price: 280, fleetPrice: 260 },
    moto: { price: 80, fleetPrice: 70 },
    trot: { price: 80, fleetPrice: 70 },
  },
  /** Fleet prices apply with strictly more vehicles than this in one request. */
  fleetAbove: 10,
  /** From this many vehicles, tell people how many more they need for fleet prices. */
  hintFrom: 6,
  subscriptionFirstYear: 0,
  subscriptionPerYearAfter: 20,
  maxPerKind: 99,
} as const satisfies {
  currency: string;
  items: Record<VehicleKind, { price: number; fleetPrice: number }>;
  fleetAbove: number;
  hintFrom: number;
  subscriptionFirstYear: number;
  subscriptionPerYearAfter: number;
  maxPerKind: number;
};

export const EMPTY_COUNTS: VehicleCounts = { car: 0, moto: 0, trot: 0 };

export interface Quote {
  vehicles: number;
  /** More than `fleetAbove` vehicles: fleet prices apply. */
  fleet: boolean;
  /** Price per vehicle kind in this quote. */
  unit: Record<VehicleKind, number>;
  fullTotal: number;
  total: number;
  saved: number;
  /** Vehicles still needed for fleet prices, once close enough to mention it; otherwise null. */
  toFleet: number | null;
}

export function quoteFor(counts: VehicleCounts): Quote {
  const vehicles = VEHICLE_KINDS.reduce((n, k) => n + counts[k], 0);
  const fleet = vehicles > PRICING.fleetAbove;
  const unit = Object.fromEntries(VEHICLE_KINDS.map((k) => [k, fleet ? PRICING.items[k].fleetPrice : PRICING.items[k].price])) as Record<VehicleKind, number>;
  const fullTotal = VEHICLE_KINDS.reduce((sum, k) => sum + counts[k] * PRICING.items[k].price, 0);
  const total = VEHICLE_KINDS.reduce((sum, k) => sum + counts[k] * unit[k], 0);
  const toFleet = !fleet && vehicles >= PRICING.hintFrom ? PRICING.fleetAbove + 1 - vehicles : null;
  return { vehicles, fleet, unit, fullTotal, total, saved: fullTotal - total, toFleet };
}

/** Lowest price, for "Dès 80 DT". */
export const lowestPrice = Math.min(...VEHICLE_KINDS.map((k) => PRICING.items[k].price));

/** "Moins de 0,80 DT par jour": the price over a year, rounded up to the next 0.05 DT. */
export const perDayUnder = (price: number) => Math.ceil((price / 365) * 20) / 20;

/** Values for the price placeholders used in page texts ({car}, {fleetCar}, {from}…). */
export function priceVars(): Record<string, number> {
  const { car, moto } = PRICING.items;
  return {
    from: lowestPrice,
    car: car.price,
    moto: moto.price,
    fleetCar: car.fleetPrice,
    fleetMoto: moto.fleetPrice,
    offCar: car.price - car.fleetPrice,
    offMoto: moto.price - moto.fleetPrice,
    perYear: PRICING.subscriptionPerYearAfter,
    firstYear: PRICING.subscriptionFirstYear,
    fleetAbove: PRICING.fleetAbove,
  };
}
