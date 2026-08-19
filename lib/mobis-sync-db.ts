import "server-only";

import postgres from "postgres";

type DatabaseRow = {
  payload: unknown;
  revision: string;
  updated_at: string;
};

export type StoredAppState = {
  payload: unknown;
  revision: number;
  updatedAt: string;
};

type SqlClient = ReturnType<typeof postgres>;

declare global {
  var mobisSyncSql: SqlClient | undefined;
  var mobisSyncSchemaReady: Promise<void> | undefined;
}

function getSql() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured.");
  }

  if (!globalThis.mobisSyncSql) {
    globalThis.mobisSyncSql = postgres(connectionString, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 1,
      prepare: false,
    });
  }

  return globalThis.mobisSyncSql;
}

async function ensureSyncSchema() {
  if (!globalThis.mobisSyncSchemaReady) {
    globalThis.mobisSyncSchemaReady = (async () => {
      const sql = getSql();

      await sql`create schema if not exists private`;
      await sql`
        create table if not exists private.mobis_app_state (
          app_id text primary key,
          payload jsonb not null default '{}'::jsonb,
          revision bigint not null default 0,
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists private.mobis_app_state_history (
          id bigint generated always as identity primary key,
          app_id text not null,
          payload jsonb not null,
          revision bigint not null,
          backed_up_at timestamptz not null default now()
        )
      `;
      await sql`revoke all on schema private from public`;
      await sql`revoke all on schema private from anon, authenticated`;
      await sql`revoke all on private.mobis_app_state from public`;
      await sql`revoke all on private.mobis_app_state from anon, authenticated`;
      await sql`revoke all on private.mobis_app_state_history from public`;
      await sql`revoke all on private.mobis_app_state_history from anon, authenticated`;
    })().catch((error) => {
      globalThis.mobisSyncSchemaReady = undefined;
      throw error;
    });
  }

  await globalThis.mobisSyncSchemaReady;
}

function normalizePayload(payload: unknown) {
  let normalized = payload;

  // Earlier releases stored JSON as a JSON string. Unwrap it while those rows are migrated.
  for (let attempt = 0; attempt < 2 && typeof normalized === "string"; attempt += 1) {
    try {
      normalized = JSON.parse(normalized) as unknown;
    } catch {
      break;
    }
  }

  return normalized;
}

function normalizeRow(row: DatabaseRow | undefined): StoredAppState | null {
  if (!row) return null;

  return {
    payload: normalizePayload(row.payload),
    revision: Number(row.revision),
    updatedAt: row.updated_at,
  };
}

export async function readAppState(appId: string) {
  await ensureSyncSchema();
  const sql = getSql();
  const rows = await sql<DatabaseRow[]>`
    select payload, revision::text, updated_at::text
    from private.mobis_app_state
    where app_id = ${appId}
    limit 1
  `;

  return normalizeRow(rows[0]);
}

export async function writeAppState(appId: string, payload: unknown) {
  await ensureSyncSchema();
  const sql = getSql();
  const serializablePayload = JSON.parse(JSON.stringify(payload)) as postgres.JSONValue;
  const rows = await sql.begin(async (transaction) => {
    const currentRows = await transaction<DatabaseRow[]>`
      select payload, revision::text, updated_at::text
      from private.mobis_app_state
      where app_id = ${appId}
      for update
    `;
    const current = currentRows[0];

    if (current) {
      await transaction`
        insert into private.mobis_app_state_history (app_id, payload, revision)
        values (${appId}, ${transaction.json(current.payload as postgres.JSONValue)}, ${current.revision})
      `;
    }

    const storedRows = await transaction<DatabaseRow[]>`
      insert into private.mobis_app_state (app_id, payload, revision, updated_at)
      values (${appId}, ${transaction.json(serializablePayload)}, 1, now())
      on conflict (app_id) do update
      set
        payload = excluded.payload,
        revision = private.mobis_app_state.revision + 1,
        updated_at = now()
      returning payload, revision::text, updated_at::text
    `;

    await transaction`
      delete from private.mobis_app_state_history
      where id in (
        select id
        from private.mobis_app_state_history
        where app_id = ${appId}
        order by id desc
        offset 100
      )
    `;

    return storedRows;
  });

  const stored = normalizeRow(rows[0]);
  if (!stored) throw new Error("Cloud state could not be saved.");
  return stored;
}
