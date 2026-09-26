import { HttpError, assertWorldId, jsonResponse, parsePositiveInt } from "./protocol.js";
export { WorldCoordinator } from "./WorldCoordinator.js";

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

async function forward(request, env, worldId, internalPath) {
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.set("x-world-id", worldId);

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const length = Number.parseInt(request.headers.get("content-length") || "0", 10);
    const max = parsePositiveInt(env.MAX_SAVE_BYTES, 32 * 1024 * 1024, 100 * 1024 * 1024);
    if (Number.isFinite(length) && length > max) {
      throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body exceeds the configured save limit.");
    }
    body = await request.arrayBuffer();
    if (body.byteLength > max) {
      throw new HttpError(413, "REQUEST_TOO_LARGE", "Request body exceeds the configured save limit.");
    }
  }

  const internalRequest = new Request("https://worldsync.internal" + internalPath, {
    method: request.method,
    headers,
    body
  });
  return coordinatorStub(env, worldId).fetch(internalRequest);
}

async function downloadLatest(env, worldId) {
  const statusResponse = await coordinatorStub(env, worldId).fetch(
    new Request("https://worldsync.internal/status", {
      method: "GET",
      headers: { "x-world-id": worldId }
    })
  );
  if (!statusResponse.ok) return statusResponse;

  const status = await statusResponse.json();
  if (!status.latest) {
    return jsonResponse({ error: "NO_CANONICAL_REVISION", message: "This world has no published revision yet." }, 404);
  }

  const object = await env.WORLD_SAVES.get(status.latest.objectKey);
  if (!object) {
    return jsonResponse({ error: "REVISION_MISSING", message: "Canonical revision metadata exists but its R2 object is missing." }, 503);
  }
  if (object.size !== status.latest.bytes || object.customMetadata?.sha256 !== status.latest.sha256) {
    return jsonResponse({ error: "REVISION_INTEGRITY_FAILED", message: "R2 metadata does not match the canonical revision." }, 503);
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

      if (request.method === "GET" && route.action === "/status") {
        return forward(request, env, route.worldId, "/status");
      }
      if (request.method === "POST" && route.action === "/acquire") {
        return forward(request, env, route.worldId, "/acquire");
      }
      if (request.method === "POST" && route.action === "/heartbeat") {
        return forward(request, env, route.worldId, "/heartbeat");
      }
      if (request.method === "POST" && route.action === "/commit") {
        return forward(request, env, route.worldId, "/commit");
      }
      if (request.method === "GET" && route.action === "/latest") {
        return downloadLatest(env, route.worldId);
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status, {
          "www-authenticate": error.status === 401 ? "Bearer" : undefined
        });
      }
      console.error("Worker failure", error);
      return jsonResponse({ error: "INTERNAL_ERROR", message: "Request failed." }, 500);
    }
  }
};
