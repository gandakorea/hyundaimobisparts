import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const syncSessionCookieName = "mobis-device-session-v1";
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 365;

export function getMobisAppId() {
  const appId = process.env.MOBIS_APP_ID?.trim() || "myungsung";

  if (!/^[a-z0-9_-]{2,48}$/i.test(appId)) {
    throw new Error("MOBIS_APP_ID is invalid.");
  }

  return appId;
}

function getSessionSecret() {
  const secret = process.env.MOBIS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MOBIS_SESSION_SECRET is not configured.");
  }

  return secret;
}

function normalizeConnectionCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isValidConnectionCode(value: string) {
  const configuredCode = process.env.MOBIS_SYNC_CODE;
  if (!configuredCode) return false;

  return timingSafeEqual(
    hash(normalizeConnectionCode(value)),
    hash(normalizeConnectionCode(configuredCode)),
  );
}

function makeSignature(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSyncSession(appId: string) {
  const expiresAt = Date.now() + sessionLifetimeMs;
  const payload = `${appId}.${expiresAt}`;
  return {
    expiresAt: new Date(expiresAt),
    token: `${payload}.${makeSignature(payload)}`,
  };
}

export function verifySyncSession(token: string | undefined, appId: string) {
  if (!token) return false;

  const [tokenAppId, expiresText, signature, extra] = token.split(".");
  if (!tokenAppId || !expiresText || !signature || extra || tokenAppId !== appId) return false;

  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const expected = makeSignature(`${tokenAppId}.${expiresText}`);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
