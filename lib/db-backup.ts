/**
 * Logical dump and restore for the Neon database.
 *
 * This is the second layer of backup. The first is Neon's own point-in-time
 * restore, which is free, automatic, and the right tool for "someone deleted a
 * floor plan an hour ago." What it cannot survive is the Neon project itself
 * going away: a deleted project, a removed Vercel integration, a lapsed
 * account. That is what a file on disk is for.
 *
 * Deliberately plain SQL over the `pg` driver that the Payload adapter already
 * pulls in, rather than pg_dump. Two reasons: pg_dump is not installed on this
 * machine and is not available inside a Vercel function, and a JSON snapshot
 * of 354 rows is readable, diffable, and restorable anywhere Node runs.
 *
 * Primary keys are preserved. The sequences are reset afterwards so the next
 * insert does not collide with a restored row.
 */
import type { Pool } from "pg";

/**
 * Tables that describe the moment rather than the content. Restoring a live
 * session or a document lock from last Tuesday is at best noise, so they are
 * dumped as empty and skipped on the way back in.
 *
 * `payload_migrations` is NOT here on purpose: it records which schema the
 * data belongs to, and restoring into the wrong schema version is exactly the
 * mistake worth catching.
 */
const TRANSIENT = new Set([
  "payload_locked_documents",
  "payload_locked_documents_rels",
  "payload_preferences",
  "payload_preferences_rels",
  "payload_kv",
  "users_sessions",
]);

export interface Snapshot {
  takenAt: string;
  /** Schema version, so a restore can refuse to load into a different one. */
  migration: string | null;
  /** Insert order, already topologically sorted by foreign key. */
  order: string[];
  tables: Record<string, Record<string, unknown>[]>;
}

async function baseTables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return rows.map((r) => r.table_name).filter((t) => !TRANSIENT.has(t));
}

/**
 * Sort tables so a parent is always inserted before its children. Without
 * this a restore fails on the first foreign key it meets, and the order is not
 * something to hardcode: it changes every time a collection gains a
 * relationship.
 */
async function fkOrder(pool: Pool, tables: string[]): Promise<string[]> {
  const { rows } = await pool.query<{ child: string; parent: string }>(
    `select c.relname as child, p.relname as parent
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_class p on p.oid = con.confrelid
      where con.contype = 'f'`,
  );

  const set = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of rows) {
    // A self reference (products.replaces -> products) is not an ordering
    // problem between tables, and treating it as one would deadlock the sort.
    if (child === parent || !set.has(child) || !set.has(parent)) continue;
    deps.get(child)!.add(parent);
  }

  const out: string[] = [];
  const done = new Set<string>();
  while (out.length < tables.length) {
    const ready = tables.filter(
      (t) => !done.has(t) && [...deps.get(t)!].every((d) => done.has(d)),
    );
    if (ready.length === 0) {
      // A cycle between tables. Fall back to alphabetical and let the restore
      // report the real foreign key error rather than hanging here.
      for (const t of tables) if (!done.has(t)) out.push(t), done.add(t);
      break;
    }
    for (const t of ready) out.push(t), done.add(t);
  }
  return out;
}

export async function dumpDatabase(pool: Pool): Promise<Snapshot> {
  const tables = await baseTables(pool);
  const order = await fkOrder(pool, tables);

  const data: Snapshot["tables"] = {};
  for (const table of order) {
    const { rows } = await pool.query(`select * from "${table}"`);
    data[table] = rows;
  }

  const migration = data.payload_migrations?.at(-1)?.name;

  return {
    takenAt: new Date().toISOString(),
    migration: typeof migration === "string" ? migration : null,
    order,
    tables: data,
  };
}

export function snapshotSummary(snap: Snapshot) {
  const counts = snap.order
    .map((t) => [t, snap.tables[t]?.length ?? 0] as const)
    .filter(([, n]) => n > 0);
  const total = counts.reduce((a, [, n]) => a + n, 0);
  return { total, counts };
}

/**
 * Columns whose foreign key points back at their own table, such as
 * products.replaces_id. Sorting tables cannot help here: the dependency is
 * between rows, and the winch can arrive before the bumper. These columns go
 * in as null and get filled once every row of the table exists.
 */
async function selfRefColumns(pool: Pool): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `select c.relname as table_name, a.attname as column_name
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join unnest(con.conkey) as k(attnum) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      where con.contype = 'f' and con.conrelid = con.confrelid`,
  );
  const map = new Map<string, string[]>();
  for (const { table_name, column_name } of rows) {
    map.set(table_name, [...(map.get(table_name) ?? []), column_name]);
  }
  return map;
}

/**
 * Replace the entire contents of the database with a snapshot.
 *
 * Destructive by definition, and wrapped in one transaction so a failure
 * halfway leaves the database as it was rather than half restored.
 */
export async function restoreDatabase(pool: Pool, snap: Snapshot) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const live = await baseTables(pool);
    const targets = snap.order.filter((t) => live.includes(t));
    const missing = snap.order.filter((t) => !live.includes(t));
    if (missing.length) {
      throw new Error(
        `The snapshot has tables this database does not: ${missing.join(", ")}. ` +
          `Run the app once against this database so Payload creates the schema, then restore again.`,
      );
    }

    // One statement, so the cascade cannot leave an orphan behind and the
    // order of the truncate does not matter.
    await client.query(
      `truncate ${targets.map((t) => `"${t}"`).join(", ")} restart identity cascade`,
    );

    const selfRefs = await selfRefColumns(pool);

    for (const table of targets) {
      const rows = snap.tables[table] ?? [];
      if (rows.length === 0) continue;

      const deferred = selfRefs.get(table) ?? [];
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      for (const row of rows) {
        const values = cols.map((c) => (deferred.includes(c) ? null : row[c]));
        const params = cols.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `insert into "${table}" (${colList}) values (${params})`,
          values,
        );
      }
    }

    // Now that every row exists, put the self references back.
    for (const [table, cols] of selfRefs) {
      if (!targets.includes(table)) continue;
      for (const row of snap.tables[table] ?? []) {
        const set = cols.filter((c) => row[c] != null);
        if (set.length === 0) continue;
        await client.query(
          `update "${table}" set ${set.map((c, i) => `"${c}" = $${i + 1}`).join(", ")} where id = $${set.length + 1}`,
          [...set.map((c) => row[c]), row.id],
        );
      }
    }

    // Rows went in with their original ids, which leaves every identity
    // sequence pointing at 1. The next insert through the admin would collide
    // with a restored row, so walk the sequences forward.
    await client.query(`
      do $$
      declare r record;
      begin
        -- Schema qualified on purpose. Postgres may evaluate a select-list
        -- function before the WHERE that would have excluded the row, so an
        -- unqualified relname resolves against the whole search_path and
        -- blows up on a same-named table in another schema.
        for r in
          select c.relname as table_name, a.attname as column_name,
                 pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) as seq
            from pg_class c
            join pg_attribute a on a.attrelid = c.oid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0
             and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
        loop
          execute format(
            'select setval(%L, coalesce((select max(%I) from %I), 0) + 1, false)',
            r.seq, r.column_name, r.table_name);
        end loop;
      end $$;
    `);

    await client.query("commit");
    return targets;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
