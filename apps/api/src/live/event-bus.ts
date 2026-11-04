import { EventEmitter } from 'node:events';
import type { VehicleLiveDto } from '@winou/shared';

export interface LiveBusEvent {
  orgId: string;
  vehicle: VehicleLiveDto;
}

/**
 * Org-scoped pub/sub for live updates. Subscribers only ever receive events of the org
 * they subscribed to. In-memory for a single API process.
 * TODO(prod): Redis implementation behind this interface when running several API instances.
 */
export interface EventBus {
  publish(e: LiveBusEvent): void;
  subscribe(orgId: string, fn: (e: LiveBusEvent) => void): () => void;
}

export class InMemoryEventBus implements EventBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(e: LiveBusEvent) {
    this.emitter.emit(`org:${e.orgId}`, e);
  }

  subscribe(orgId: string, fn: (e: LiveBusEvent) => void) {
    const ch = `org:${orgId}`;
    this.emitter.on(ch, fn);
    return () => this.emitter.off(ch, fn);
  }
}

export const EVENT_BUS = Symbol('EVENT_BUS');
