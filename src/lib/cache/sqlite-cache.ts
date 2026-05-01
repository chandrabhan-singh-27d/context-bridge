/**
 * SQLite-backed TTL cache. Survives process restarts. Sits behind the LRU
 * tier in TieredCache; not used directly by tools.
 *
 * Storage: a single table `cache(key TEXT PK, value TEXT, expires_at INTEGER)`
 * where `expires_at` is unix ms (or `Number.MAX_SAFE_INTEGER` for never).
 * Values are opaque strings — callers serialize.
 *
 * Expired rows are filtered on read and lazily pruned. Call `purgeExpired()`
 * to reclaim space; `clear()` wipes everything.
 */

import { Database } from 'bun:sqlite';
import { AppError } from '../errors.ts';
import { type Result, err, ok } from '../result.ts';

export interface SqliteCacheOptions {
  readonly path?: string;
  readonly defaultTtlMs?: number;
  readonly clock?: () => number;
}

export interface SqliteCache {
  get(key: string): string | undefined;
  getRemainingTtl(key: string): number | undefined;
  set(key: string, value: string, ttlMs?: number): void;
  delete(key: string): boolean;
  clear(): void;
  purgeExpired(): number;
  close(): void;
}

const NEVER_EXPIRES = Number.MAX_SAFE_INTEGER;

export function createSqliteCache(opts: SqliteCacheOptions = {}): Result<SqliteCache, AppError> {
  const path = opts.path ?? ':memory:';
  const defaultTtlMs = opts.defaultTtlMs ?? Number.POSITIVE_INFINITY;
  const now = opts.clock ?? Date.now;

  let db: Database;
  try {
    db = new Database(path);
    db.run('PRAGMA journal_mode = WAL;');
    db.run(
      `CREATE TABLE IF NOT EXISTS cache (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         expires_at INTEGER NOT NULL
       );`,
    );
    db.run('CREATE INDEX IF NOT EXISTS cache_expires_idx ON cache(expires_at);');
  } catch (e) {
    return err(AppError.internal(`failed to open sqlite cache at "${path}"`, e));
  }

  const selectStmt = db.query<{ value: string; expires_at: number }, [string]>(
    'SELECT value, expires_at FROM cache WHERE key = ?',
  );
  const upsertStmt = db.query<unknown, [string, string, number]>(
    `INSERT INTO cache(key, value, expires_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
  );
  const deleteStmt = db.query<unknown, [string]>('DELETE FROM cache WHERE key = ?');
  const purgeStmt = db.query<unknown, [number]>('DELETE FROM cache WHERE expires_at <= ?');
  const clearStmt = db.query<unknown, []>('DELETE FROM cache');

  return ok({
    get(key) {
      const row = selectStmt.get(key);
      if (row === null) return undefined;
      if (row.expires_at <= now()) {
        deleteStmt.run(key);
        return undefined;
      }
      return row.value;
    },

    getRemainingTtl(key) {
      const row = selectStmt.get(key);
      if (row === null) return undefined;
      if (row.expires_at === NEVER_EXPIRES) return Number.POSITIVE_INFINITY;
      const remaining = row.expires_at - now();
      if (remaining <= 0) {
        deleteStmt.run(key);
        return undefined;
      }
      return remaining;
    },

    set(key, value, ttlMs = defaultTtlMs) {
      const expiresAt =
        ttlMs === Number.POSITIVE_INFINITY ? NEVER_EXPIRES : now() + Math.floor(ttlMs);
      upsertStmt.run(key, value, expiresAt);
    },

    delete(key) {
      const res = deleteStmt.run(key);
      return res.changes > 0;
    },

    clear() {
      clearStmt.run();
    },

    purgeExpired() {
      const res = purgeStmt.run(now());
      return res.changes;
    },

    close() {
      db.close();
    },
  });
}
