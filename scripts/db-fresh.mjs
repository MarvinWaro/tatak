// Like Laravel's migrate:fresh: drops every table, then runs all migrations again.
// Every shop, card, order and super admin is deleted.
//
//   npm run db:fresh          your local database (the one `npm run dev` uses)
//   npm run db:fresh:remote   the LIVE database (asks you to type the database name first)
//
// Other flags are passed on to Wrangler, e.g. `npm run db:fresh -- --persist-to some/folder`.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DB = "tatak";
const REMOTE = process.argv.includes("--remote");
const TARGET = REMOTE ? "--remote" : "--local";
const EXTRA = process.argv.slice(2).filter((a) => a !== "--remote");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// Wrangler never gets the keyboard: you already confirmed above, and on Windows the earlier
// question keeps hold of the terminal, so a second prompt from Wrangler can't hear you type Y.
// Without a keyboard, Wrangler answers its own "continue?" with yes.
function wrangler(args, { quiet = true } = {}) {
  const res = spawnSync(process.execPath, [WRANGLER, ...args, ...EXTRA], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: quiet ? "pipe" : ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "true" },
  });
  return { ok: res.status === 0, output: `${res.stdout ?? ""}${res.stderr ?? ""}`, stdout: res.stdout ?? "" };
}

/** Runs SQL and returns one array of rows per statement. */
function query(sql) {
  const res = wrangler(["d1", "execute", DB, TARGET, "--command", sql, "--json"]);
  if (!res.ok) fail(`Wrangler couldn't read the database:\n${res.output.trim()}`);
  return JSON.parse(res.stdout).map((r) => r.results ?? []);
}

/** Children first, so no table is dropped while another table still points at it. */
function dropOrder(tables, edges) {
  const order = [];
  const left = new Set(tables);
  while (left.size > 0) {
    const ready = [...left].filter((t) => !edges.some((e) => e.parent === t && e.child !== t && left.has(e.child)));
    // A loop of foreign keys can't happen in our schema; drop the rest anyway rather than hang.
    for (const t of ready.length ? ready : [...left]) {
      order.push(t);
      left.delete(t);
    }
  }
  return order;
}

async function confirm(question, expected) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === expected;
}

console.log(`\nReset the ${REMOTE ? "LIVE" : "local"} Tatak database: drop every table, then run all migrations.`);
console.log("Every shop, card, order and super admin will be deleted.\n");

const ok = REMOTE
  ? await confirm(`This wipes the live site at tatak.trade. Type the database name (${DB}) to continue: `, DB)
  : await confirm("Type yes to continue: ", "yes");
if (!ok) fail("Stopped. Nothing was changed.");

// Live database only: D1 Time Travel can put everything back to this moment (kept 7 days on the free plan).
const startedAt = Math.floor(Date.now() / 1000);

const [tableRows, edgeRows] = query(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';
   SELECT m.name AS child, f."table" AS parent FROM sqlite_master m, pragma_foreign_key_list(m.name) f
   WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%';`,
);
const tables = tableRows.map((r) => r.name);

if (tables.length > 0) {
  const order = dropOrder(tables, edgeRows);
  console.log(`\nDropping ${order.length} tables: ${order.join(", ")}`);
  const drop = wrangler([
    "d1",
    "execute",
    DB,
    TARGET,
    "--command",
    `PRAGMA defer_foreign_keys = on; ${order.map((t) => `DROP TABLE IF EXISTS "${t.replace(/"/g, '""')}";`).join(" ")}`,
  ]);
  if (!drop.ok) fail(`Wrangler couldn't drop the tables:\n${drop.output.trim()}`);
} else {
  console.log("\nThe database is already empty.");
}

console.log("\nRunning all migrations...\n");
const migrate = wrangler(["d1", "migrations", "apply", DB, TARGET], { quiet: false });
if (!migrate.ok) fail("The migrations failed. Fix the error above, then run this again.");

console.log("\nDone. The database is fresh and empty.");
console.log(`Next: create your super admin with npm run superadmin${REMOTE ? ":remote" : ""}, then register a shop.`);
if (REMOTE) {
  console.log("\nChanged your mind? Within 7 days you can bring the old data back with:");
  console.log(`  npx wrangler d1 time-travel restore ${DB} --timestamp=${startedAt}`);
}
