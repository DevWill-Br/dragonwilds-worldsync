import { DurableObject } from "cloudflare:workers";
import {
  HttpError,
  assertWorldId,
  isSha256,
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

  async rpc(action) {
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          ok: false,
          status: error.status,
          error: error.code,
          message: error.message
        };
      }
      console.error("WorldCoordinator RPC failure", error);
      return {
        ok: false,
        status: 500,
        error: "INTERNAL_ERROR",
        message: "Coordinator operation failed."
      };
    }
  }

  async ping() {
    return { ok: true, value: { pong: true } };
  }

  async status(worldId) {
    return this.rpc(() => this.handleStatus(worldId));
  }

  async acquire(worldId, input) {
    return this.rpc(() => this.runExclusive(() => this.handleAcquire(worldId, input)));
  }

  async heartbeat(worldId, sessionId) {
    return this.rpc(() => this.runExclusive(() => this.handleHeartbeat(worldId, sessionId)));
  }

  async commit(worldId, input) {
    return this.rpc(() => this.runExclusive(() => this.handleCommit(worldId, input)));
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
    assertWorldId(worldId);
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
    return {
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
    };
  }

  async handleAcquire(worldId, input) {
    const host = normalizeIdentity(input?.host, "host");
    const machineId = normalizeIdentity(input?.machineId, "machineId");
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

    return {
      acquired: true,
      worldId,
      sessionId: session.sessionId,
      baseRevision: session.baseRevision,
      baseSha256: session.baseSha256,
      latest: state.latest
    };
  }

  requireOwnedSession(state, sessionId) {
    if (!state.session) {
      throw new HttpError(409, "NO_ACTIVE_SESSION", "This world has no active session.");
    }
    if (typeof sessionId !== "string" || sessionId !== state.session.sessionId) {
      throw new HttpError(403, "SESSION_MISMATCH", "Session ownership mismatch.");
    }
    return state.session;
  }

  async handleHeartbeat(worldId, sessionId) {
    const state = await this.loadState(worldId);
    const session = this.requireOwnedSession(state, sessionId);
    session.lastHeartbeatUtc = new Date().toISOString();
    state.session = session;
    await this.saveState(state);
    return {
      heartbeat: true,
      sessionId: session.sessionId,
      lastHeartbeatUtc: session.lastHeartbeatUtc
    };
  }

  async handleCommit(worldId, input) {
    const sessionId = input?.sessionId;
    const baseRevision = input?.baseRevision;
    const declaredSha = typeof input?.declaredSha === "string" ? input.declaredSha.toLowerCase() : "";
    const originalFileName = safeSaveFileName(input?.originalFileName || "world.sav");
    const bytes = input?.bytes;

    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
      throw new HttpError(400, "INVALID_BASE_REVISION", "Base revision is invalid.");
    }
    if (!isSha256(declaredSha)) {
      throw new HttpError(400, "INVALID_SHA256", "Declared SHA-256 must be lowercase hexadecimal.");
    }
    if (!(bytes instanceof ArrayBuffer)) {
      throw new HttpError(400, "INVALID_SAVE_BODY", "Save bytes are required.");
    }

    const state = await this.loadState(worldId);
    const session = this.requireOwnedSession(state, sessionId);
    if (session.baseRevision !== baseRevision || state.currentRevision !== baseRevision) {
      throw new HttpError(409, "REVISION_CONFLICT", "The canonical revision changed. Session was retained.");
    }
    const canonicalHash = state.latest?.sha256 ?? null;
    if (session.baseSha256 !== canonicalHash) {
      throw new HttpError(409, "HASH_CONFLICT", "The canonical hash changed. Session was retained.");
    }

    if (bytes.byteLength < 1 || bytes.byteLength > this.maxSaveBytes()) {
      throw new HttpError(413, "SAVE_SIZE_REJECTED", "Save size is outside the configured limit.");
    }
    const actualSha = await sha256Hex(bytes);
    if (actualSha !== declaredSha) {
      throw new HttpError(422, "HASH_MISMATCH", "Uploaded bytes do not match the declared SHA-256.");
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
          throw new HttpError(
            500,
            "IMMUTABLE_OBJECT_CONFLICT",
            "An immutable revision key already exists with different metadata."
          );
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
      return { committed: true, worldId, latest };
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
