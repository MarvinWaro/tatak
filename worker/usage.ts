// Cloudflare usage for the super admin: today's requests and database rows against the free
// plan's daily limits, plus database sizes, for every system on the account (Tatak, NEXA).
// Numbers come from Cloudflare's GraphQL analytics API with a read-only token, cached 5 minutes.
import type { UsageNumbers, UsageReport, UsageSystem } from "../shared/types";
import type { Env } from "./env";

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_SECONDS = 300;
const DAYS = 7;
const DAY_MS = 86_400_000;

interface SystemConfig {
  name: string;
  /** Worker name, as in the Cloudflare dashboard. */
  script: string;
  databaseId: string;
}

const QUERY = `query Usage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workers: workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
        sum { requests }
        dimensions { date scriptName }
      }
      d1: d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
        sum { rowsRead rowsWritten }
        dimensions { date databaseId }
      }
      storage: d1StorageAdaptiveGroups(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
        max { databaseSizeBytes }
        dimensions { date databaseId }
      }
    }
  }
}`;

interface GraphResult {
  data?: {
    viewer?: {
      accounts?: {
        workers: { sum: { requests: number }; dimensions: { date: string; scriptName: string } }[];
        d1: { sum: { rowsRead: number; rowsWritten: number }; dimensions: { date: string; databaseId: string } }[];
        storage: { max: { databaseSizeBytes: number }; dimensions: { date: string; databaseId: string } }[];
      }[];
    };
  };
  errors?: { message: string }[] | null;
}

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const zero = (): UsageNumbers => ({ requests: 0, rowsRead: 0, rowsWritten: 0 });

function readSystems(env: Env): SystemConfig[] {
  try {
    const list = JSON.parse(env.USAGE_SYSTEMS ?? "[]") as SystemConfig[];
    return Array.isArray(list) ? list.filter((s) => s && s.name) : [];
  } catch {
    return [];
  }
}

/** Tatak's own database size, which D1 reports with every query; works without the token. */
async function tatakDatabaseBytes(env: Env): Promise<number | null> {
  const res = await env.DB.prepare("SELECT 1").run();
  return res.meta.size_after ?? null;
}

async function askCloudflare(env: Env, now: number): Promise<GraphResult> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { accountTag: env.CF_ACCOUNT_ID, start: utcDate(now - (DAYS - 1) * DAY_MS), end: utcDate(now) },
    }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Cloudflare refused the token. Check that it has Account Analytics: Read for this account.");
  }
  if (!res.ok) throw new Error(`Cloudflare's analytics didn't answer (HTTP ${res.status}). Try again in a few minutes.`);
  return res.json();
}

/** Turns Cloudflare's rows into the report: today's account totals, each system, and the last 7 days. */
function buildReport(env: Env, graph: GraphResult, now: number, tatakBytes: number | null): UsageReport {
  if (graph.errors?.length) throw new Error(`Cloudflare's analytics said: ${graph.errors[0].message}`);
  const account = graph.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("Cloudflare returned no data for this account. Check CF_ACCOUNT_ID.");

  const today = utcDate(now);
  const days = new Map<string, UsageNumbers>();
  for (let i = DAYS - 1; i >= 0; i--) days.set(utcDate(now - i * DAY_MS), zero());
  const byScript = new Map<string, number>();
  const byDatabase = new Map<string, UsageNumbers>();

  for (const w of account.workers) {
    const day = days.get(w.dimensions.date);
    if (day) day.requests += w.sum.requests;
    if (w.dimensions.date === today) {
      byScript.set(w.dimensions.scriptName, (byScript.get(w.dimensions.scriptName) ?? 0) + w.sum.requests);
    }
  }
  for (const d of account.d1) {
    const day = days.get(d.dimensions.date);
    if (day) {
      day.rowsRead += d.sum.rowsRead;
      day.rowsWritten += d.sum.rowsWritten;
    }
    if (d.dimensions.date === today) {
      const db = byDatabase.get(d.dimensions.databaseId) ?? zero();
      db.rowsRead += d.sum.rowsRead;
      db.rowsWritten += d.sum.rowsWritten;
      byDatabase.set(d.dimensions.databaseId, db);
    }
  }
  // The latest reported size of each database.
  const latestSize = new Map<string, { date: string; bytes: number }>();
  for (const s of account.storage) {
    const prev = latestSize.get(s.dimensions.databaseId);
    if (!prev || s.dimensions.date >= prev.date) {
      latestSize.set(s.dimensions.databaseId, { date: s.dimensions.date, bytes: s.max.databaseSizeBytes });
    }
  }

  const systems: UsageSystem[] = readSystems(env).map((sys) => ({
    name: sys.name,
    requests: byScript.get(sys.script) ?? 0,
    rowsRead: byDatabase.get(sys.databaseId)?.rowsRead ?? 0,
    rowsWritten: byDatabase.get(sys.databaseId)?.rowsWritten ?? 0,
    databaseBytes:
      sys.name.toLowerCase() === "tatak" && tatakBytes !== null ? tatakBytes : (latestSize.get(sys.databaseId)?.bytes ?? null),
  }));

  return {
    configured: true,
    error: null,
    fetchedAt: now,
    resetsAt: Date.parse(`${today}T00:00:00Z`) + DAY_MS,
    today: days.get(today) ?? zero(),
    systems,
    storageBytes: [...latestSize.values()].reduce((sum, s) => sum + s.bytes, 0),
    days: [...days].map(([date, n]) => ({ date, ...n })),
  };
}

/** What the page shows when the token isn't set, or Cloudflare can't be reached: Tatak's size at least. */
function partialReport(env: Env, now: number, tatakBytes: number | null, error: string | null): UsageReport {
  const systems = readSystems(env).map((sys) => ({
    name: sys.name,
    ...zero(),
    databaseBytes: sys.name.toLowerCase() === "tatak" ? tatakBytes : null,
  }));
  return {
    configured: Boolean(env.CF_ANALYTICS_TOKEN && env.CF_ACCOUNT_ID),
    error,
    fetchedAt: now,
    resetsAt: Date.parse(`${utcDate(now)}T00:00:00Z`) + DAY_MS,
    today: zero(),
    systems,
    storageBytes: tatakBytes ?? 0,
    days: [],
  };
}

const CACHE_KEY = "https://usage.cache.tatak.internal/v1";

/** The usage report, from a 5-minute cache when possible so reloading the page costs nothing. */
export async function loadUsage(env: Env, fresh: boolean): Promise<UsageReport> {
  const now = Date.now();
  const tatakBytes = await tatakDatabaseBytes(env);
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return partialReport(env, now, tatakBytes, null);

  const cache = (caches as unknown as { default: Cache }).default;
  if (!fresh) {
    const hit = await cache.match(CACHE_KEY);
    if (hit) return hit.json();
  }
  try {
    const report = buildReport(env, await askCloudflare(env, now), now, tatakBytes);
    await cache.put(
      CACHE_KEY,
      new Response(JSON.stringify(report), { headers: { "cache-control": `max-age=${CACHE_SECONDS}` } }),
    );
    return report;
  } catch (err) {
    return partialReport(env, now, tatakBytes, err instanceof Error ? err.message : "Couldn't load usage.");
  }
}
