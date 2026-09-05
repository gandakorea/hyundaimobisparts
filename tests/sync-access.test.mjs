import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTs(path, overrides = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => name === "server-only" ? {} : overrides[name] ?? require(name),
    module,
    module.exports,
  );
  return module.exports;
}

test("sync access stays protected by default; public mode preserves request validation", async () => {
  const keys = ["MOBIS_PUBLIC_SYNC", "MOBIS_APP_ID", "MOBIS_SESSION_SECRET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.MOBIS_APP_ID = "test-orders";
    process.env.MOBIS_SESSION_SECRET = "test-only-session-secret-at-least-32-characters";
    delete process.env.MOBIS_PUBLIC_SYNC;
    const session = loadTs("../lib/mobis-sync-session.ts");
    let reads = 0;
    let writes = 0;
    const stored = { payload: { dailyOrders: { "2026-09-01": { sections: [] } } }, revision: 7, updatedAt: "2026-09-01T00:00:00Z" };
    const routes = loadTs("../app/api/sync/state/route.ts", {
      "@/lib/mobis-sync-session": session,
      "@/lib/mobis-sync-db": {
        readAppState: async (appId) => { assert.equal(appId, "test-orders"); reads++; return stored; },
        writeAppState: async (appId, payload) => { assert.equal(appId, "test-orders"); writes++; return { ...stored, payload }; },
      },
    });
    const pair = loadTs("../app/api/sync/pair/route.ts", { "@/lib/mobis-sync-session": session });
    const { NextRequest } = require("next/server");
    const request = (method = "GET", origin = "http://localhost:3000", body = {}) => new NextRequest("http://localhost:3000/api/sync/state", {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    });

    assert.equal((await routes.GET(request())).status, 401);
    assert.equal((await routes.PUT(request("PUT"))).status, 401);
    assert.equal(reads, 0);
    assert.equal(writes, 0);
    const token = session.createSyncSession("test-orders").token;
    assert.equal(session.canAccessSyncState(token, "test-orders"), true);
    assert.equal(session.canAccessSyncState(token, "other-orders"), false);
    assert.equal(session.canAccessSyncState(`${token}tampered`, "test-orders"), false);
    for (const value of ["false", "TRUE", "1", ""]) {
      process.env.MOBIS_PUBLIC_SYNC = value;
      assert.equal(session.canAccessSyncState(undefined, "test-orders"), false);
    }

    process.env.MOBIS_PUBLIC_SYNC = "true";
    assert.equal((await (await pair.GET(request())).json()).connected, true);
    const response = await routes.GET(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).state, stored.payload);
    assert.equal(reads, 1);
    assert.equal(writes, 0, "reading existing orders must not write them");
    assert.equal((await routes.PUT(request("PUT", "https://unrelated.example"))).status, 403);
    assert.equal((await routes.PUT(request("PUT", undefined, []))).status, 400);
    assert.equal(writes, 0);
    assert.equal((await routes.PUT(request("PUT", undefined, stored.payload))).status, 200);
    assert.equal(writes, 1);

    delete process.env.MOBIS_PUBLIC_SYNC;
    assert.equal((await routes.GET(request())).status, 401, "disabling public mode restores authentication");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
