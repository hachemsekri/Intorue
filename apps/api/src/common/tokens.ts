/** Injection tokens. */
export const DB = Symbol('DB');
export const MAILER = Symbol('MAILER');
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
