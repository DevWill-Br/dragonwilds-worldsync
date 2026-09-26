export const WORLD_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertWorldId(value) {
  if (typeof value !== "string" || !WORLD_ID_PATTERN.test(value)) {
    throw new HttpError(400, "INVALID_WORLD_ID", "World id must use lowercase letters, digits, dash or underscore.");
  }
  return value;
}

export function normalizeIdentity(value, fieldName) {
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_IDENTITY", fieldName + " is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new HttpError(400, "INVALID_IDENTITY", fieldName + " must be between 1 and 80 characters.");
  }
  return trimmed;
}

export function parsePositiveInt(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

export function isSha256(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function sessionAgeSeconds(session, nowMs = Date.now()) {
  if (!session?.lastHeartbeatUtc) return Number.POSITIVE_INFINITY;
  const heartbeatMs = Date.parse(session.lastHeartbeatUtc);
  if (!Number.isFinite(heartbeatMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - heartbeatMs) / 1000);
}

export function sessionDisposition(session, staleSeconds, nowMs = Date.now()) {
  if (!session) return { availability: "free", stale: false, ageSeconds: 0 };
  const ageSeconds = sessionAgeSeconds(session, nowMs);
  const stale = ageSeconds > staleSeconds;
  if (stale) return { availability: "recovery_required", stale, ageSeconds };
  if (session.status === "committing") return { availability: "committing", stale, ageSeconds };
  return { availability: "busy", stale, ageSeconds };
}

export function revisionObjectKey(worldId, revision, sha256) {
  assertWorldId(worldId);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new HttpError(400, "INVALID_REVISION", "Revision must be a positive integer.");
  }
  if (!isSha256(sha256)) {
    throw new HttpError(400, "INVALID_SHA256", "Invalid SHA-256.");
  }
  return `worlds/${worldId}/revisions/${String(revision).padStart(8, "0")}-${sha256.slice(0, 16)}.sav`;
}

export function safeSaveFileName(value) {
  const candidate = typeof value === "string" && value.length ? value : "world.sav";
  if (!/^[^\\/:*?"<>|\r\n]{1,120}\.sav$/i.test(candidate)) {
    throw new HttpError(400, "INVALID_SAVE_NAME", "Invalid save filename.");
  }
  return candidate;
}

export function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}
