/** ============================================================
 * ذخیره‌سازی احراز هویت (Passkey) — رابط + پیاده‌سازی Neon
 *
 *  • از نشست فقط هش SHA-256 توکن ذخیره می‌شود (خود توکن فقط در کوکی HttpOnly است).
 *  • challengeها یک‌بارمصرف‌اند (DELETE … RETURNING) و ۵ دقیقه اعتبار دارند.
 *  • کد اتصال دستگاه جدید فقط به‌صورت هش و یک‌بارمصرف ذخیره می‌شود.
 *  • هیچ کلید خصوصی‌ای وجود ندارد: سرور فقط کلید عمومی passkey را نگه می‌دارد.
 * ============================================================ */
import type { NeonQueryFunction } from '@neondatabase/serverless';

export interface StoredCredential {
  id: string;
  userId: string;
  /** کلید عمومی COSE به base64url */
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface StoredChallenge {
  id: string;
  challenge: string;
  purpose: 'setup' | 'add' | 'pair' | 'login' | 'stepup';
  userId: string | null;
  expiresAt: number;
  meta: Record<string, unknown>;
}

export interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  credentialId: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  /** آخرین تأیید Face ID/Touch ID (برای عملیات حساس) */
  stepUpAt: number;
  userAgent: string;
  ip: string;
  label: string;
}

export interface StoredEvent {
  userId: string;
  at: number;
  kind: string;
  ip: string;
  userAgent: string;
  detail: Record<string, unknown>;
}

export interface AuthStore {
  listCredentials(userId: string): Promise<StoredCredential[]>;
  getCredential(id: string): Promise<StoredCredential | null>;
  addCredential(c: StoredCredential): Promise<void>;
  touchCredential(id: string, counter: number, at: number): Promise<void>;
  renameCredential(userId: string, id: string, label: string): Promise<boolean>;
  deleteCredential(userId: string, id: string): Promise<boolean>;

  putChallenge(c: StoredChallenge): Promise<void>;
  /** خواندن و حذف هم‌زمان (یک‌بارمصرف) */
  takeChallenge(id: string): Promise<StoredChallenge | null>;

  createSession(s: StoredSession): Promise<void>;
  getSessionByTokenHash(hash: string): Promise<StoredSession | null>;
  touchSession(id: string, lastSeenAt: number, expiresAt: number): Promise<void>;
  markStepUp(id: string, at: number): Promise<void>;
  listSessions(userId: string): Promise<StoredSession[]>;
  revokeSession(userId: string, id: string, at: number): Promise<boolean>;
  revokeOtherSessions(userId: string, exceptId: string, at: number): Promise<number>;
  /** با حذف passkey، نشست‌هایی که با آن ساخته شده‌اند هم باطل می‌شوند */
  revokeSessionsByCredential(userId: string, credentialId: string, at: number): Promise<number>;

  putPairCode(p: { codeHash: string; userId: string; expiresAt: number; createdBySession: string }): Promise<void>;
  takePairCode(codeHash: string, now: number): Promise<{ userId: string } | null>;

  addEvent(e: StoredEvent): Promise<void>;
  listEvents(userId: string, limit: number): Promise<StoredEvent[]>;
  countRecentFailures(ip: string, since: number): Promise<number>;
}

/* ---------------- Neon ---------------- */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const jsonOf = <T,>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

function credFromRow(r: Row): StoredCredential {
  return {
    id: String(r.id),
    userId: String(r.userId),
    publicKey: String(r.publicKey),
    counter: Number(r.counter),
    transports: jsonOf<string[]>(r.transports, []),
    deviceType: String(r.deviceType ?? ''),
    backedUp: !!r.backedUp,
    label: String(r.label ?? ''),
    createdAt: Number(r.createdAt),
    lastUsedAt: num(r.lastUsedAt)
  };
}

function sessFromRow(r: Row): StoredSession {
  return {
    id: String(r.id),
    tokenHash: String(r.tokenHash),
    userId: String(r.userId),
    credentialId: r.credentialId === null ? null : String(r.credentialId),
    createdAt: Number(r.createdAt),
    lastSeenAt: Number(r.lastSeenAt),
    expiresAt: Number(r.expiresAt),
    revokedAt: num(r.revokedAt),
    stepUpAt: Number(r.stepUpAt ?? 0),
    userAgent: String(r.userAgent ?? ''),
    ip: String(r.ip ?? ''),
    label: String(r.label ?? '')
  };
}

export function neonAuthStore(sql: NeonQueryFunction<false, false>): AuthStore {
  return {
    async listCredentials(userId) {
      const rows = (await sql`SELECT * FROM "authCredentials" WHERE "userId" = ${userId} ORDER BY "createdAt"`) as Row[];
      return rows.map(credFromRow);
    },
    async getCredential(id) {
      const rows = (await sql`SELECT * FROM "authCredentials" WHERE id = ${id}`) as Row[];
      return rows[0] ? credFromRow(rows[0]) : null;
    },
    async addCredential(c) {
      await sql`INSERT INTO "authCredentials" (id, "userId", "publicKey", counter, transports, "deviceType", "backedUp", label, "createdAt", "lastUsedAt")
        VALUES (${c.id}, ${c.userId}, ${c.publicKey}, ${c.counter}, ${JSON.stringify(c.transports)}::jsonb, ${c.deviceType}, ${c.backedUp}, ${c.label}, ${c.createdAt}, ${c.lastUsedAt})`;
    },
    async touchCredential(id, counter, at) {
      await sql`UPDATE "authCredentials" SET counter = ${counter}, "lastUsedAt" = ${at} WHERE id = ${id}`;
    },
    async renameCredential(userId, id, label) {
      const rows = (await sql`UPDATE "authCredentials" SET label = ${label} WHERE id = ${id} AND "userId" = ${userId} RETURNING id`) as Row[];
      return rows.length > 0;
    },
    async deleteCredential(userId, id) {
      const rows = (await sql`DELETE FROM "authCredentials" WHERE id = ${id} AND "userId" = ${userId} RETURNING id`) as Row[];
      return rows.length > 0;
    },
    async putChallenge(c) {
      // پاک‌سازی challengeهای منقضی در همان مسیر (بدون cron)
      await sql`DELETE FROM "authChallenges" WHERE "expiresAt" < ${Date.now()}`;
      await sql`INSERT INTO "authChallenges" (id, challenge, purpose, "userId", "expiresAt", meta)
        VALUES (${c.id}, ${c.challenge}, ${c.purpose}, ${c.userId}, ${c.expiresAt}, ${JSON.stringify(c.meta)}::jsonb)`;
    },
    async takeChallenge(id) {
      const rows = (await sql`DELETE FROM "authChallenges" WHERE id = ${id} RETURNING *`) as Row[];
      const r = rows[0];
      if (!r) return null;
      return {
        id: String(r.id),
        challenge: String(r.challenge),
        purpose: String(r.purpose) as StoredChallenge['purpose'],
        userId: r.userId === null ? null : String(r.userId),
        expiresAt: Number(r.expiresAt),
        meta: jsonOf(r.meta, {})
      };
    },
    async createSession(s) {
      await sql`INSERT INTO "authSessions" (id, "tokenHash", "userId", "credentialId", "createdAt", "lastSeenAt", "expiresAt", "revokedAt", "stepUpAt", "userAgent", ip, label)
        VALUES (${s.id}, ${s.tokenHash}, ${s.userId}, ${s.credentialId}, ${s.createdAt}, ${s.lastSeenAt}, ${s.expiresAt}, ${s.revokedAt}, ${s.stepUpAt}, ${s.userAgent}, ${s.ip}, ${s.label})`;
    },
    async getSessionByTokenHash(hash) {
      const rows = (await sql`SELECT * FROM "authSessions" WHERE "tokenHash" = ${hash}`) as Row[];
      return rows[0] ? sessFromRow(rows[0]) : null;
    },
    async touchSession(id, lastSeenAt, expiresAt) {
      await sql`UPDATE "authSessions" SET "lastSeenAt" = ${lastSeenAt}, "expiresAt" = ${expiresAt} WHERE id = ${id} AND "revokedAt" IS NULL`;
    },
    async markStepUp(id, at) {
      await sql`UPDATE "authSessions" SET "stepUpAt" = ${at}, "lastSeenAt" = ${at} WHERE id = ${id} AND "revokedAt" IS NULL`;
    },
    async listSessions(userId) {
      const rows = (await sql`SELECT * FROM "authSessions" WHERE "userId" = ${userId} ORDER BY "lastSeenAt" DESC LIMIT 200`) as Row[];
      return rows.map(sessFromRow);
    },
    async revokeSession(userId, id, at) {
      const rows = (await sql`UPDATE "authSessions" SET "revokedAt" = ${at} WHERE id = ${id} AND "userId" = ${userId} AND "revokedAt" IS NULL RETURNING id`) as Row[];
      return rows.length > 0;
    },
    async revokeOtherSessions(userId, exceptId, at) {
      const rows = (await sql`UPDATE "authSessions" SET "revokedAt" = ${at} WHERE "userId" = ${userId} AND id <> ${exceptId} AND "revokedAt" IS NULL RETURNING id`) as Row[];
      return rows.length;
    },
    async revokeSessionsByCredential(userId, credentialId, at) {
      const rows = (await sql`UPDATE "authSessions" SET "revokedAt" = ${at} WHERE "userId" = ${userId} AND "credentialId" = ${credentialId} AND "revokedAt" IS NULL RETURNING id`) as Row[];
      return rows.length;
    },
    async putPairCode(p) {
      await sql`DELETE FROM "authPairCodes" WHERE "expiresAt" < ${Date.now()}`;
      await sql`INSERT INTO "authPairCodes" ("codeHash", "userId", "expiresAt", "createdBySession", "usedAt")
        VALUES (${p.codeHash}, ${p.userId}, ${p.expiresAt}, ${p.createdBySession}, NULL)`;
    },
    async takePairCode(codeHash, now) {
      const rows = (await sql`UPDATE "authPairCodes" SET "usedAt" = ${now}
        WHERE "codeHash" = ${codeHash} AND "usedAt" IS NULL AND "expiresAt" > ${now} RETURNING "userId"`) as Row[];
      return rows[0] ? { userId: String(rows[0].userId) } : null;
    },
    async addEvent(e) {
      await sql`INSERT INTO "authEvents" ("userId", at, kind, ip, "userAgent", detail)
        VALUES (${e.userId}, ${e.at}, ${e.kind}, ${e.ip}, ${e.userAgent}, ${JSON.stringify(e.detail)}::jsonb)`;
    },
    async listEvents(userId, limit) {
      const rows = (await sql`SELECT * FROM "authEvents" WHERE "userId" = ${userId} ORDER BY at DESC LIMIT ${limit}`) as Row[];
      return rows.map((r) => ({
        userId: String(r.userId),
        at: Number(r.at),
        kind: String(r.kind),
        ip: String(r.ip ?? ''),
        userAgent: String(r.userAgent ?? ''),
        detail: jsonOf(r.detail, {})
      }));
    },
    async countRecentFailures(ip, since) {
      const rows = (await sql`SELECT COUNT(*)::int AS n FROM "authEvents" WHERE ip = ${ip} AND at >= ${since} AND kind LIKE '%_failed'`) as Row[];
      return Number(rows[0]?.n ?? 0);
    }
  };
}

/* ---------------- حافظه (فقط تست) ---------------- */

export function memoryAuthStore(): AuthStore & { _dump(): unknown } {
  const creds = new Map<string, StoredCredential>();
  const chals = new Map<string, StoredChallenge>();
  const sessions = new Map<string, StoredSession>();
  const pairs = new Map<string, { userId: string; expiresAt: number; usedAt: number | null }>();
  const events: StoredEvent[] = [];
  return {
    _dump: () => ({ creds: [...creds.values()], sessions: [...sessions.values()], events }),
    async listCredentials(u) {
      return [...creds.values()].filter((c) => c.userId === u);
    },
    async getCredential(id) {
      return creds.get(id) ?? null;
    },
    async addCredential(c) {
      creds.set(c.id, { ...c });
    },
    async touchCredential(id, counter, at) {
      const c = creds.get(id);
      if (c) creds.set(id, { ...c, counter, lastUsedAt: at });
    },
    async renameCredential(u, id, label) {
      const c = creds.get(id);
      if (!c || c.userId !== u) return false;
      creds.set(id, { ...c, label });
      return true;
    },
    async deleteCredential(u, id) {
      const c = creds.get(id);
      if (!c || c.userId !== u) return false;
      creds.delete(id);
      return true;
    },
    async putChallenge(c) {
      chals.set(c.id, c);
    },
    async takeChallenge(id) {
      const c = chals.get(id) ?? null;
      chals.delete(id);
      return c;
    },
    async createSession(s) {
      sessions.set(s.id, { ...s });
    },
    async getSessionByTokenHash(h) {
      return [...sessions.values()].find((s) => s.tokenHash === h) ?? null;
    },
    async touchSession(id, lastSeenAt, expiresAt) {
      const s = sessions.get(id);
      if (s && !s.revokedAt) sessions.set(id, { ...s, lastSeenAt, expiresAt });
    },
    async markStepUp(id, at) {
      const s = sessions.get(id);
      if (s && !s.revokedAt) sessions.set(id, { ...s, stepUpAt: at, lastSeenAt: at });
    },
    async listSessions(u) {
      return [...sessions.values()].filter((s) => s.userId === u).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    },
    async revokeSession(u, id, at) {
      const s = sessions.get(id);
      if (!s || s.userId !== u || s.revokedAt) return false;
      sessions.set(id, { ...s, revokedAt: at });
      return true;
    },
    async revokeOtherSessions(u, except, at) {
      let n = 0;
      for (const s of sessions.values()) {
        if (s.userId === u && s.id !== except && !s.revokedAt) {
          sessions.set(s.id, { ...s, revokedAt: at });
          n++;
        }
      }
      return n;
    },
    async revokeSessionsByCredential(u, cid, at) {
      let n = 0;
      for (const s of sessions.values()) {
        if (s.userId === u && s.credentialId === cid && !s.revokedAt) {
          sessions.set(s.id, { ...s, revokedAt: at });
          n++;
        }
      }
      return n;
    },
    async putPairCode(p) {
      pairs.set(p.codeHash, { userId: p.userId, expiresAt: p.expiresAt, usedAt: null });
    },
    async takePairCode(h, now) {
      const p = pairs.get(h);
      if (!p || p.usedAt || p.expiresAt <= now) return null;
      p.usedAt = now;
      return { userId: p.userId };
    },
    async addEvent(e) {
      events.push(e);
    },
    async listEvents(u, limit) {
      return events.filter((e) => e.userId === u).sort((a, b) => b.at - a.at).slice(0, limit);
    },
    async countRecentFailures(ip, since) {
      return events.filter((e) => e.ip === ip && e.at >= since && e.kind.endsWith('_failed')).length;
    }
  };
}
