import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  /** System context: bypasses RLS. Use only for auth flows, membership checks and jobs. */
  system: Db;
  /**
   * Org context: runs `fn` in a transaction as role winou_app with app.org_id set,
   * so Postgres Row-Level Security restricts every query to that organization.
   */
  tenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Runs a multi-statement SQL script atomically (migrations). */
  execScript(script: string): Promise<void>;
  close(): Promise<void>;
}

export async function createDatabase(url: string): Promise<Database> {
  let db: Db;
  let close: () => Promise<void>;
  let execScript: (script: string) => Promise<void>;

  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const target = url.slice('pglite:'.length);
    let client: InstanceType<typeof PGlite>;
    if (target === 'memory' || target === '') {
      client = new PGlite();
    } else {
      const dir = resolve(target);
      mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
    }
    db = drizzle(client, { schema }) as unknown as Db;
    close = () => client.close();
    execScript = async (script) => {
      try {
        await client.exec(`begin;
${script}
;commit;`);
      } catch (e) {
        await client.exec('rollback').catch(() => {});
        throw e;
      }
    };
  } else {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: url, max: 10 });
    db = drizzle(pool, { schema }) as unknown as Db;
    close = () => pool.end();
    execScript = async (script) => {
      const c = await pool.connect();
      try {
        await c.query(`begin;
${script}
;commit;`);
      } catch (e) {
        await c.query('rollback').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    };
  }

  return {
    system: db,
    tenant: (orgId, fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
        await tx.execute(sql`set local role winou_app`);
        return fn(tx);
      }),
    execScript,
    close,
  };
}

/** Postgres unique-violation check that works for pg and PGlite (and drizzle-wrapped errors). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  for (let e: any = err; e; e = e.cause) {
    if (e.code === '23505') {
      if (!constraint) return true;
      return e.constraint === constraint || String(e.message ?? '').includes(constraint);
    }
  }
  return false;
}
