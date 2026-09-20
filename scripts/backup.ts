/**
 * Write a snapshot of the Neon database to a gzipped JSON file.
 *
 *   npm run backup
 *   BACKUP_DIR="/Volumes/4TB ExtremePro/Dropbox/..." npm run backup
 *
 * Defaults to ./backups, which is gitignored. Point BACKUP_DIR at Dropbox or
 * an external drive to get the file off this machine, which is the whole
 * reason this exists.
 *
 * Safe to run any time. It only reads.
 */
import fs from "fs/promises";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import { createRequire } from "module";

// @next/env is CommonJS with no named ESM export, and this has to run before
// anything reads the connection string. Same pattern as scripts/seed.ts.
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());

const { Pool } = await import("pg");
const { dumpDatabase, snapshotSummary } = await import("../lib/db-backup.ts");

const gzip = promisify(zlib.gzip);

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "No database connection string. Copy the Neon block into .env.local first; see README.",
  );
  process.exit(1);
}

const dir = path.resolve(process.env.BACKUP_DIR ?? "backups");

async function main() {
  const pool = new Pool({ connectionString });
  try {
    const snap = await dumpDatabase(pool);
    const { total, counts } = snapshotSummary(snap);

    // Sortable, filename-safe, and readable at a glance in a folder listing.
    const stamp = snap.takenAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const file = path.join(dir, `papago-catalog-${stamp}.json.gz`);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, await gzip(JSON.stringify(snap)));

    const { size } = await fs.stat(file);
    for (const [table, n] of counts) {
      console.log(`  ${table.padEnd(34)} ${String(n).padStart(4)}`);
    }
    console.log(`\n${total} rows across ${counts.length} tables`);
    console.log(`schema: ${snap.migration ?? "none recorded"}`);
    console.log(`\nwrote ${file} (${(size / 1024).toFixed(1)} KB)`);
    if (!process.env.BACKUP_DIR) {
      console.log(
        "\nThis is on the same disk as everything else. Set BACKUP_DIR to put it somewhere that survives this Mac.",
      );
    }
  } finally {
    await pool.end();
  }
}

await main();
