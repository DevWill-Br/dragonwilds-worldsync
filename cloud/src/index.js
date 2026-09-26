import { HttpError, assertWorldId, jsonResponse, parsePositiveInt } from "./protocol.js";
import { WorldCoordinator } from "./WorldCoordinator.js";
export { WorldCoordinator };

async function digestToken(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function tokensEqual(left, right) {
  const [a, b] = await Promise.all([digestToken(left), digestToken(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function requireAuthorization(request, env) {
  const expected = env.WORLDSYNC_API_TOKEN;
  if (typeof expected !== "string" || expected.length < 24) {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Server authentication secret is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    throw new HttpError(401, "UNAUTHORIZED", "Bearer token required.");
  }
  const supplied = header.slice("Bearer ".length);
  if (!(await tokensEqual(expected, supplied))) {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid bearer token.");
  }
}

function parseWorldRoute(pathname) {
  const match = /^\/v1\/worlds\/([^/]+)(\/[^?]*)?$/.exec(pathname);
  if (!match) return null;
  return { worldId: assertWorldId(match[1]), action: match[2] || "/" };
}

function coordinatorStub(env, worldId) {
  const id = env.WORLD_COORDINATOR.idFromName(worldId);
  return env.WORLD_COORDINATOR.get(id);
}

function rpcToResponse(result, successStatus = 200) {
  if (result?.ok === true) {
    return jsonResponse(result.value, successStatus);
  }
  const status = Number.isInteger(result?.status) ? result.status : 500;
  return jsonResponse(
    {
      error: result?.error || "INTERNAL_ERROR",
      message: result?.message || "Coordinator operation failed."
    },
    status
  );
}

async function parseJsonBody(request) {
  return request.json().catch(() => {
    throw new HttpError(400, "INVALID_JSON", "A JSON request body is required.");
  });
}

async function commitViaRpc(request, env, worldId) {
  const sessionId = request.headers.get("x-session-id");
  const baseRevision = Number.parseInt(request.headers.get("x-base-revision") || "", 10);
  const declaredSha = (request.headers.get("x-save-sha256") || "").toLowerCase();
  const originalFileName = request.headers.get("x-save-file-name") || "world.sav";

  const length = Number.parseInt(request.headers.get("content-length") || "0", 10);
  const max = parsePositiveInt(env.MAX_SAVE_BYTES, 32 * 1024 * 1024, 100 * 1024 * 1024);
  if (Number.isFinite(length) && length > max) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body exceeds the configured save limit.");
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > max) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body exceeds the configured save limit.");
  }

  const result = await coordinatorStub(env, worldId).commit(worldId, {
    sessionId,
    baseRevision,
    declaredSha,
    originalFileName,
    bytes
  });
  return rpcToResponse(result, 201);
}

async function downloadLatest(env, worldId) {
  const statusResult = await coordinatorStub(env, worldId).status(worldId);
  if (statusResult?.ok !== true) {
    return rpcToResponse(statusResult);
  }

  const status = statusResult.value;
  if (!status.latest) {
    return jsonResponse(
      { error: "NO_CANONICAL_REVISION", message: "This world has no published revision yet." },
      404
    );
  }

  const object = await env.WORLD_SAVES.get(status.latest.objectKey);
  if (!object) {
    return jsonResponse(
      { error: "REVISION_MISSING", message: "Canonical revision metadata exists but its R2 object is missing." },
      503
    );
  }
  if (object.size !== status.latest.bytes || object.customMetadata?.sha256 !== status.latest.sha256) {
    return jsonResponse(
      { error: "REVISION_INTEGRITY_FAILED", message: "R2 metadata does not match the canonical revision." },
      503
    );
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/octet-stream");
  headers.set("cache-control", "no-store");
  headers.set("content-disposition", `attachment; filename="${status.latest.originalFileName}"`);
  headers.set("x-worldsync-revision", String(status.latest.worldRevision));
  headers.set("x-worldsync-sha256", status.latest.sha256);
  headers.set("x-worldsync-bytes", String(status.latest.bytes));
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true, service: "dragonwilds-worldsync-api" });
      }

      await requireAuthorization(request, env);
      const route = parseWorldRoute(url.pathname);
      if (!route) return jsonResponse({ error: "NOT_FOUND" }, 404);

      const stub = coordinatorStub(env, route.worldId);

      if (request.method === "GET" && route.action === "/debug-ping") {
        return rpcToResponse(await stub.ping());
      }

      if (request.method === "GET" && route.action === "/status") {
        return rpcToResponse(await stub.status(route.worldId));
      }

      if (request.method === "POST" && route.action === "/acquire") {
        const body = await parseJsonBody(request);
        return rpcToResponse(await stub.acquire(route.worldId, body), 201);
      }

      if (request.method === "POST" && route.action === "/heartbeat") {
        const body = await parseJsonBody(request);
        return rpcToResponse(await stub.heartbeat(route.worldId, body.sessionId));
      }

      if (request.method === "POST" && route.action === "/commit") {
        return commitViaRpc(request, env, route.worldId);
      }

      if (request.method === "GET" && route.action === "/latest") {
        return downloadLatest(env, route.worldId);
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        const headers = error.status === 401 ? { "www-authenticate": "Bearer" } : {};
        return jsonResponse({ error: error.code, message: error.message }, error.status, headers);
      }
      console.error("Worker failure", error);
      return jsonResponse({ error: "INTERNAL_ERROR", message: "Request failed." }, 500);
    }
  }
};
