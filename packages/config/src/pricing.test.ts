import { describe, expect, it } from 'vitest';
import { perDayUnder, priceVars, quoteFor } from './pricing';

describe('quoteFor', () => {
  it('uses normal prices', () => {
    expect(quoteFor({ car: 1, moto: 1, trot: 1 })).toMatchObject({ vehicles: 3, fleet: false, total: 440, saved: 0, toFleet: null });
  });

  it('keeps normal prices at exactly 10 vehicles', () => {
    const q = quoteFor({ car: 10, moto: 0, trot: 0 });
    expect(q).toMatchObject({ fleet: false, total: 2800, saved: 0, toFleet: 1 });
    expect(q.unit.car).toBe(280);
  });

  it('applies fleet prices from 11 vehicles, to every vehicle', () => {
    const q = quoteFor({ car: 5, moto: 3, trot: 3 });
    expect(q.fleet).toBe(true);
    expect(q.unit).toEqual({ car: 260, moto: 70, trot: 70 });
    expect(q.fullTotal).toBe(5 * 280 + 6 * 80);
    expect(q.total).toBe(5 * 260 + 6 * 70);
    expect(q.saved).toBe(5 * 20 + 6 * 10);
    expect(q.toFleet).toBeNull();
  });

  it('says how many more are needed only from 6 to 10 vehicles', () => {
    expect(quoteFor({ car: 5, moto: 0, trot: 0 }).toFleet).toBeNull();
    expect(quoteFor({ car: 6, moto: 0, trot: 0 }).toFleet).toBe(5);
    expect(quoteFor({ car: 0, moto: 5, trot: 5 }).toFleet).toBe(1);
  });
});

describe('derived values', () => {
  it('rounds the daily cost up to the next 0.05 DT', () => {
    expect(perDayUnder(280)).toBe(0.8);
    expect(perDayUnder(80)).toBe(0.25);
  });
  it('gives page texts their values', () => {
    expect(priceVars()).toMatchObject({ from: 80, car: 280, fleetCar: 260, fleetMoto: 70, offCar: 20, offMoto: 10, perYear: 20 });
  });
});
