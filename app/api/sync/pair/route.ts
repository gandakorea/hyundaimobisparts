import { NextRequest, NextResponse } from "next/server";

import {
  createSyncSession,
  getMobisAppId,
  isValidConnectionCode,
  syncSessionCookieName,
  verifySyncSession,
} from "@/lib/mobis-sync-session";

export const dynamic = "force-dynamic";

function hasMatchingOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const appId = getMobisAppId();
  const connected = verifySyncSession(
    request.cookies.get(syncSessionCookieName)?.value,
    appId,
  );

  return NextResponse.json(
    { connected },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!hasMatchingOrigin(request)) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "연결 코드를 입력해 주세요." }, { status: 400 });
  }

  const code =
    typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
      ? body.code
      : "";

  if (!isValidConnectionCode(code)) {
    return NextResponse.json({ message: "연결 코드가 맞지 않습니다." }, { status: 401 });
  }

  const appId = getMobisAppId();
  const session = createSyncSession(appId);
  const response = NextResponse.json({ connected: true });

  response.cookies.set(syncSessionCookieName, session.token, {
    expires: session.expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!hasMatchingOrigin(request)) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 403 });
  }

  const response = NextResponse.json({ connected: false });
  response.cookies.set(syncSessionCookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
