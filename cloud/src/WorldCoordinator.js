import { DurableObject } from "cloudflare:workers";
import {
  HttpError,
  assertWorldId,
  isSha256,
  jsonResponse,
  normalizeIdentity,
  parsePositiveInt,
  revisionObjectKey,
  safeSaveFileName,
  sessionDisposition
} from "./protocol.js";

const STATE_KEY = "world-state";

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class WorldCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.mutationTail = Promise.resolve();
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const worldId = assertWorldId(request.headers.get("x-world-id") || "");
      if (request.method === "GET" && url.pathname === "/status") {
        return this.handleStatus(worldId);
      }
      if (request.method === "POST" && url.pathname === "/acquire") {
        return this.runExclusive(() => this.handleAcquire(worldId, request));
      }
      if (request.method === "POST" && url.pathname === "/heartbeat") {
        return this.runExclusive(() => this.handleHeartbeat(worldId, request));
      }
      if (request.method === "POST" && url.pathname === "/commit") {
        return this.runExclusive(() => this.handleCommit(worldId, request));
      }
      return jsonResponse({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status);
      }
      console.error("WorldCoordinator failure", error);
      return jsonResponse({ error: "INTERNAL_ERROR", message: "Coordinator operation failed." }, 500);
    }
  }

  async runExclusive(action) {
    const previous = this.mutationTail;
    let release;
    this.mutationTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  newState(worldId) {
    return {
      schemaVersion: 1,
      worldId,
      currentRevision: 0,
      latest: null,
      session: null,
      updatedAtUtc: new Date().toISOString()
    };
  }

  async loadState(worldId) {
    const state = await this.ctx.storage.get(STATE_KEY);
    if (!state) return this.newState(worldId);
    if (state.schemaVersion !== 1 || state.worldId !== worldId) {
      throw new HttpError(500, "STATE_MISMATCH", "Coordinator state does not match this world.");
    }
    return state;
  }

  async saveState(state) {
    state.updatedAtUtc = new Date().toISOString();
    await this.ctx.storage.put(STATE_KEY, state);
  }

  staleSeconds() {
    return parsePositiveInt(this.env.SESSION_STALE_SECONDS, 120, 86400);
  }

  maxSaveBytes() {
    return parsePositiveInt(this.env.MAX_SAVE_BYTES, 32 * 1024 * 1024, 100 * 1024 * 1024);
  }

  async handleStatus(worldId) {
    const state = await this.loadState(worldId);
    const disposition = sessionDisposition(state.session, this.staleSeconds());
    return jsonResponse({
      worldId,
      currentRevision: state.currentRevision,
      latest: state.latest,
      session: state.session
        ? {
            ...state.session,
            stale: disposition.stale,
            ageSeconds: disposition.ageSeconds
          }
        : null,
      availability: disposition.availability,
      updatedAtUtc: state.updatedAtUtc
    });
  }

  async handleAcquire(worldId, request) {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "INVALID_JSON", "A JSON request body is required.");
    });
    const host = normalizeIdentity(body.host, "host");
    const machineId = normalizeIdentity(body.machineId, "machineId");
    const state = await this.loadState(worldId);

    if (state.session) {
      const disposition = sessionDisposition(state.session, this.staleSeconds());
      if (disposition.stale) {
        throw new HttpError(
          409,
          "RECOVERY_REQUIRED",
          "The previous host heartbeat is stale. Explicit recovery is required; ownership was not transferred."
        );
      }
      throw new HttpError(409, "WORLD_BUSY", "Another healthy session already owns this world.");
    }

    const now = new Date().toISOString();
    const session = {
      sessionId: crypto.randomUUID(),
      host,
      machineId,
      status: "hosting",
      baseRevision: state.currentRevision,
      baseSha256: state.latest?.sha256 ?? null,
      startedAtUtc: now,
      lastHeartbeatUtc: now
    };
    state.session = session;
    await this.saveState(state);

    return jsonResponse(
      {
        acquired: true,
        worldId,
        sessionId: session.sessionId,
        baseRevision: session.baseRevision,
        baseSha256: session.baseSha256,
        latest: state.latest
      },
      201
    );
  }

  async requireOwnedSession(state, sessionId) {
    if (!state.session) {
      throw new HttpError(409, "NO_ACTIVE_SESSION", "This world has no active session.");
    }
    if (typeof sessionId !== "string" || sessionId !== state.session.sessionId) {
      throw new HttpError(403, "SESSION_MISMATCH", "Session ownership mismatch.");
    }
    return state.session;
  }

  async handleHeartbeat(worldId, request) {
    const body = await request.json().catch(() => {
      throw new HttpError(400, "INVALID_JSON", "A JSON request body is required.");
    });
    const state = await this.loadState(worldId);
    const session = await this.requireOwnedSession(state, body.sessionId);
    session.lastHeartbeatUtc = new Date().toISOString();
    state.session = session;
    await this.saveState(state);
    return jsonResponse({ ok: true, sessionId: session.sessionId, lastHeartbeatUtc: session.lastHeartbeatUtc });
  }

  async handleCommit(worldId, request) {
    const sessionId = request.headers.get("x-session-id");
    const baseRevision = Number.parseInt(request.headers.get("x-base-revision") || "", 10);
    const declaredSha = (request.headers.get("x-save-sha256") || "").toLowerCase();
    const originalFileName = safeSaveFileName(request.headers.get("x-save-file-name") || "world.sav");

    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
      throw new HttpError(400, "INVALID_BASE_REVISION", "x-base-revision is invalid.");
    }
    if (!isSha256(declaredSha)) {
      throw new HttpError(400, "INVALID_SHA256", "x-save-sha256 must contain a lowercase SHA-256.");
    }

    const state = await this.loadState(worldId);
    const session = await this.requireOwnedSession(state, sessionId);
    if (session.baseRevision !== baseRevision || state.currentRevision !== baseRevision) {
      throw new HttpError(409, "REVISION_CONFLICT", "The canonical revision changed. Session was retained.");
    }
    const canonicalHash = state.latest?.sha256 ?? null;
    if (session.baseSha256 !== canonicalHash) {
      throw new HttpError(409, "HASH_CONFLICT", "The canonical hash changed. Session was retained.");
    }

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength < 1 || bytes.byteLength > this.maxSaveBytes()) {
      throw new HttpError(413, "SAVE_SIZE_REJECTED", "Save size is outside the configured limit.");
    }
    const actualSha = await sha256Hex(bytes);
    if (actualSha !== declaredSha) {
      throw new HttpError(422, "HASH_MISMATCH", "Uploaded bytes do not match x-save-sha256.");
    }

    session.status = "committing";
    session.lastHeartbeatUtc = new Date().toISOString();
    state.session = session;
    await this.saveState(state);

    try {
      const nextRevision = state.currentRevision + 1;
      if (!Number.isSafeInteger(nextRevision)) {
        throw new HttpError(409, "REVISION_LIMIT", "Revision limit reached.");
      }
      const objectKey = revisionObjectKey(worldId, nextRevision, actualSha);
      const existing = await this.env.WORLD_SAVES.head(objectKey);

      if (existing) {
        if (existing.size !== bytes.byteLength || existing.customMetadata?.sha256 !== actualSha) {
          throw new HttpError(500, "IMMUTABLE_OBJECT_CONFLICT", "An immutable revision key already exists with different metadata.");
        }
      } else {
        await this.env.WORLD_SAVES.put(objectKey, bytes, {
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: {
            sha256: actualSha,
            worldId,
            revision: String(nextRevision),
            sessionId: session.sessionId,
            originalFileName
          }
        });
      }

      const verified = await this.env.WORLD_SAVES.head(objectKey);
      if (!verified || verified.size !== bytes.byteLength || verified.customMetadata?.sha256 !== actualSha) {
        throw new HttpError(500, "R2_VERIFY_FAILED", "R2 object verification failed; session was retained.");
      }

      const latest = {
        schemaVersion: 1,
        worldRevision: nextRevision,
        sha256: actualSha,
        bytes: bytes.byteLength,
        objectKey,
        originalFileName,
        committedAtUtc: new Date().toISOString(),
        committedBy: {
          host: session.host,
          machineId: session.machineId,
          sessionId: session.sessionId
        }
      };

      const committedState = {
        ...state,
        currentRevision: nextRevision,
        latest,
        session: null
      };
      await this.saveState(committedState);
      return jsonResponse({ committed: true, worldId, latest }, 201);
    } catch (error) {
      try {
        const retained = await this.loadState(worldId);
        if (retained.session?.sessionId === session.sessionId && retained.currentRevision === state.currentRevision) {
          retained.session.status = "hosting";
          retained.session.lastHeartbeatUtc = new Date().toISOString();
          await this.saveState(retained);
        }
      } catch (recoveryError) {
        console.error("Failed to restore session state after commit failure", recoveryError);
      }
      throw error;
    }
  }
}
