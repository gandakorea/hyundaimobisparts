import { NextRequest, NextResponse } from "next/server";

import { readAppState, writeAppState } from "@/lib/mobis-sync-db";
import {
  getMobisAppId,
  syncSessionCookieName,
  verifySyncSession,
} from "@/lib/mobis-sync-session";

export const dynamic = "force-dynamic";

const maxPayloadBytes = 2 * 1024 * 1024;

function isAuthorized(request: NextRequest, appId: string) {
  return verifySyncSession(request.cookies.get(syncSessionCookieName)?.value, appId);
}

function hasMatchingOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const appId = getMobisAppId();
  if (!isAuthorized(request, appId)) {
    return noStoreJson({ connected: false }, { status: 401 });
  }

  const stored = await readAppState(appId);
  return noStoreJson({
    connected: true,
    revision: stored?.revision ?? 0,
    state: stored?.payload ?? null,
    updatedAt: stored?.updatedAt ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const appId = getMobisAppId();
  if (!isAuthorized(request, appId)) {
    return noStoreJson({ connected: false }, { status: 401 });
  }
  if (!hasMatchingOrigin(request)) {
    return noStoreJson({ message: "잘못된 요청입니다." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxPayloadBytes) {
    return noStoreJson({ message: "저장할 내용이 너무 큽니다." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ message: "저장 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return noStoreJson({ message: "저장 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > maxPayloadBytes) {
    return noStoreJson({ message: "저장할 내용이 너무 큽니다." }, { status: 413 });
  }

  const stored = await writeAppState(appId, payload);
  return noStoreJson({
    connected: true,
    revision: stored.revision,
    updatedAt: stored.updatedAt,
  });
}
