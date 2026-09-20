/**
 * Restore the Neon database from a snapshot written by scripts/backup.ts.
 *
 *   npm run restore -- backups/papago-catalog-2026-09-20_18-04-11.json.gz
 *   npm run restore -- <file> --yes          # skip the confirmation
 *
 * This REPLACES everything in the target database. It prints what it is about
 * to destroy and what it is about to load, then waits for you to type the
 * word restore, because the one time you run this you will be in a hurry.
 */
import fs from "fs/promises";
import path from "path";
import readline from "readline/promises";
import zlib from "zlib";
import { promisify } from "util";
import { createRequire } from "module";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());

const { Pool } = await import("pg");
const { dumpDatabase, restoreDatabase, snapshotSummary } = await import(
  "../lib/db-backup.ts"
);
const type = await import("../lib/db-backup.ts");
type Snapshot = Awaited<ReturnType<typeof type.dumpDatabase>>;

const gunzip = promisify(zlib.gunzip);

const args = process.argv.slice(2);
const skipPrompt = args.includes("--yes");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Usage: npm run restore -- <snapshot.json.gz> [--yes]");
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("No database connection string. See README.");
  process.exit(1);
}

/** Which database this is about to overwrite, without printing the password. */
function describeTarget(url: string) {
  try {
    const u = new URL(url);
    return `${u.pathname.replace(/^\//, "")} on ${u.hostname}`;
  } catch {
    return "the configured database";
  }
}

async function main() {
  const raw = await fs.readFile(path.resolve(file!));
  const snap: Snapshot = JSON.parse((await gunzip(raw)).toString());
  const incoming = snapshotSummary(snap);

  const pool = new Pool({ connectionString });
  try {
    const current = snapshotSummary(await dumpDatabase(pool));

    console.log(`Target:   ${describeTarget(connectionString!)}`);
    console.log(`Snapshot: ${file}`);
    console.log(`          taken ${snap.takenAt}`);
    console.log(`          schema ${snap.migration ?? "none recorded"}`);
    console.log(
      `\nThis DELETES ${current.total} rows now in the database and loads ${incoming.total} from the snapshot.`,
    );

    if (!skipPrompt) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await rl.question('\nType "restore" to continue: ');
      rl.close();
      if (answer.trim() !== "restore") {
        console.log("Nothing changed.");
        return;
      }
    }

    const tables = await restoreDatabase(pool, snap);
    console.log(`\nRestored ${incoming.total} rows across ${tables.length} tables.`);
    console.log(
      "Admin sessions were not restored, so everyone signs in again. Check /admin and the storefront before calling it done.",
    );
  } finally {
    await pool.end();
  }
}

await main();
