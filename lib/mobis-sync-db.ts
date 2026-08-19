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
      await sql`revoke all on schema private from public`;
      await sql`revoke all on schema private from anon, authenticated`;
      await sql`revoke all on private.mobis_app_state from public`;
      await sql`revoke all on private.mobis_app_state from anon, authenticated`;
    })().catch((error) => {
      globalThis.mobisSyncSchemaReady = undefined;
      throw error;
    });
  }

  await globalThis.mobisSyncSchemaReady;
}

function normalizeRow(row: DatabaseRow | undefined): StoredAppState | null {
  if (!row) return null;

  return {
    payload: row.payload,
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
  const serializedPayload = JSON.stringify(payload);
  const rows = await sql<DatabaseRow[]>`
    insert into private.mobis_app_state (app_id, payload, revision, updated_at)
    values (${appId}, ${serializedPayload}::jsonb, 1, now())
    on conflict (app_id) do update
    set
      payload = excluded.payload,
      revision = private.mobis_app_state.revision + 1,
      updated_at = now()
    returning payload, revision::text, updated_at::text
  `;

  const stored = normalizeRow(rows[0]);
  if (!stored) throw new Error("Cloud state could not be saved.");
  return stored;
}
