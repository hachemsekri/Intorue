import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { LiveSocketHandler, type LiveTickets } from './live.socket';
import type { EventBus } from './event-bus';

/** A database whose queries fail or succeed on demand, like a dropped connection. */
function fakeDb(state: { fail: boolean; member: boolean }) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => {
      if (state.fail) throw new Error('read ECONNRESET');
      return state.member ? [{ role: 'owner', disabledAt: null }] : [];
    },
  };
  return { system: { select: () => chain } };
}

function fakeSocket() {
  const s = new EventEmitter() as EventEmitter & { OPEN: number; readyState: number; sent: string[]; send(m: string): void; close: ReturnType<typeof vi.fn> };
  s.OPEN = 1;
  s.readyState = 1;
  s.sent = [];
  s.send = (m) => s.sent.push(m);
  s.close = vi.fn();
  return s;
}

function setup(state: { fail: boolean; member: boolean }) {
  const tickets = { redeem: async () => ({ userId: 'u1', orgId: 'o1' }) } as unknown as LiveTickets;
  const bus = { subscribe: () => () => {} } as unknown as EventBus;
  const env = { WEB_URL: 'http://localhost:3000', CORS_ORIGINS: '' };
  const handler = new LiveSocketHandler(tickets, bus, fakeDb(state) as never, env as never);
  const socket = fakeSocket();
  handler.handle(socket as never, { headers: {} } as never);
  return socket;
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('live socket and database hiccups', () => {
  it('refuses the socket (fail closed) when the first permission check cannot run', async () => {
    const socket = setup({ fail: true, member: true });
    socket.emit('message', JSON.stringify({ type: 'auth', ticket: 't' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.close).toHaveBeenCalled();
    expect(socket.sent.join()).not.toContain('hello');
    socket.emit('close');
  });

  it('survives a failed recheck, stays open, and still disconnects on a later refusal', async () => {
    vi.useFakeTimers();
    try {
      const state = { fail: false, member: true };
      const socket = setup(state);
      socket.emit('message', JSON.stringify({ type: 'auth', ticket: 't' }));
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(socket.sent.join()).toContain('hello');

      state.fail = true;
      await vi.advanceTimersByTimeAsync(61_000); // recheck fails: no crash, socket stays open
      await flush();
      expect(socket.close).not.toHaveBeenCalled();

      state.fail = false;
      state.member = false;
      await vi.advanceTimersByTimeAsync(61_000); // next recheck says no: disconnected
      await flush();
      expect(socket.close).toHaveBeenCalled();
      socket.emit('close');
    } finally {
      vi.useRealTimers();
    }
  });
});
