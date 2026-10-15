// Creates a Tatak super admin account from the terminal. There is no sign-up page for super admins.
//
//   npm run superadmin          your local database (the one `npm run dev` uses)
//   npm run superadmin:remote   the live database
//
// It asks for a name, email, password and confirmation. If the email is already a super admin,
// it offers to replace that account's name and password (and logs it out everywhere).
import { spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const REMOTE = process.argv.includes("--remote");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const LOGIN_URL = REMOTE ? "https://tatak.trade/super/login" : "http://localhost:5173/super/login";
// Same iteration count and hash format as worker/auth.ts, so the Worker can check these passwords.
const PBKDF2_ITERATIONS = 20_000;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// The email rule matches the Worker's login form (worker/validate.ts), so every account made here can log in.
const nameSchema = z.string().trim().min(1, "Enter a name.").max(60, "Keep the name to 60 characters or fewer.");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(120, "That email is too long.");
const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(200, "That password is too long.");

// When input is piped in (not typed), answer the questions line by line from it.
const piped = process.stdin.isTTY ? null : readFileSync(0, "utf8").split(/\r?\n/);

/** Asks one question. Hidden answers (passwords) are not shown while typing. */
function ask(question, hidden = false) {
  process.stdout.write(question);
  if (piped) {
    const answer = piped.shift();
    if (answer === undefined) fail("The input ended before every question was answered.");
    process.stdout.write(hidden ? "\n" : `${answer}\n`);
    return Promise.resolve(answer);
  }
  return new Promise((resolve) => {
    const { stdin } = process;
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      if (chunk.startsWith("\u001b")) return; // arrow keys and other special keys
      for (const ch of chunk) {
        if (ch === "\u0003") {
          finish(); // Ctrl+C
          process.exit(130);
        }
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (ch === "\b" || ch === "\u007f") {
          if (!value) continue;
          value = [...value].slice(0, -1).join("");
          if (!hidden) process.stdout.write("\b \b");
        } else if (ch >= " ") {
          value += ch;
          if (!hidden) process.stdout.write(ch);
        }
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

/** Asks until the answer passes `schema`, then returns the cleaned-up answer. */
async function askValid(question, schema, hidden = false) {
  for (;;) {
    const parsed = schema.safeParse(await ask(question, hidden));
    if (parsed.success) return parsed.data;
    console.log(`  ${parsed.error.issues[0].message}`);
  }
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function ulid(now = Date.now()) {
  let time = "";
  for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  let random = "";
  for (const b of randomBytes(16)) random += CROCKFORD[b % 32];
  return time + random;
}

/** A SQL string literal. Every value also passed validation above. */
const sqlText = (value) => `'${value.replace(/'/g, "''")}'`;

/** Runs SQL on the local or live D1 database through Wrangler. */
function runSql(sql) {
  const res = spawnSync(
    process.execPath,
    [WRANGLER, "d1", "execute", "tatak", REMOTE ? "--remote" : "--local", "--command", sql, "--json"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return { ok: res.status === 0, output: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

function explainSqlError(output) {
  if (/no such table: super_admins/.test(output)) {
    fail(`The super admin table isn't in this database yet. Run npm run db:migrate:${REMOTE ? "remote" : "local"} first, then try again.`);
  }
  fail(`Wrangler couldn't save the account:\n${output.trim()}`);
}

console.log(`\nCreate a Tatak super admin in the ${REMOTE ? "LIVE" : "local"} database.\n`);
const name = await askValid("Name: ", nameSchema);
const email = await askValid("Email: ", emailSchema);
let password;
for (;;) {
  password = await askValid("Password (at least 12 characters, hidden): ", passwordSchema, true);
  if ((await ask("Confirm password: ", true)) === password) break;
  console.log("  The passwords don't match. Type them again.");
}

if (REMOTE && (await ask(`\nType yes to add ${email} to the LIVE database: `)).trim().toLowerCase() !== "yes") {
  fail("Stopped. Nothing was saved.");
}

const passwordHash = hashPassword(password);
const created = runSql(
  `INSERT INTO super_admins (id, name, email, password_hash, created_at)
   VALUES (${sqlText(ulid())}, ${sqlText(name)}, ${sqlText(email)}, ${sqlText(passwordHash)}, ${Date.now()})`,
);

if (created.ok) {
  console.log(`\nDone. ${name} can log in at ${LOGIN_URL}`);
} else if (/UNIQUE constraint failed: super_admins\.email/.test(created.output)) {
  const answer = await ask(`\n${email} is already a super admin. Replace its name and password? (y/N) `);
  if (answer.trim().toLowerCase() !== "y") fail("Stopped. Nothing was changed.");
  const updated = runSql(
    `UPDATE super_admins SET name = ${sqlText(name)}, password_hash = ${sqlText(passwordHash)},
       failed_logins = 0, locked_until = 0 WHERE email = ${sqlText(email)};
     DELETE FROM super_sessions WHERE super_admin_id = (SELECT id FROM super_admins WHERE email = ${sqlText(email)});`,
  );
  if (!updated.ok) explainSqlError(updated.output);
  console.log(`\nDone. The password changed and old log-ins were ended. Log in at ${LOGIN_URL}`);
} else {
  explainSqlError(created.output);
}
