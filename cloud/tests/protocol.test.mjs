import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpError,
  assertWorldId,
  isSha256,
  revisionObjectKey,
  sessionDisposition
} from "../src/protocol.js";

test("world ids are intentionally narrow", () => {
  assert.equal(assertWorldId("worldsynctest"), "worldsynctest");
  assert.equal(assertWorldId("friends_world-2"), "friends_world-2");
  assert.throws(() => assertWorldId("../escape"), HttpError);
  assert.throws(() => assertWorldId("World With Spaces"), HttpError);
});

test("revision keys are immutable and deterministic", () => {
  const sha = "a".repeat(64);
  assert.equal(
    revisionObjectKey("worldsynctest", 12, sha),
    "worlds/worldsynctest/revisions/00000012-aaaaaaaaaaaaaaaa.sav"
  );
});

test("sha validation accepts only lowercase full sha256", () => {
  assert.equal(isSha256("0".repeat(64)), true);
  assert.equal(isSha256("A".repeat(64)), false);
  assert.equal(isSha256("0".repeat(63)), false);
});

test("healthy sessions remain busy", () => {
  const now = Date.parse("2026-09-26T06:00:00.000Z");
  const result = sessionDisposition(
    { status: "hosting", lastHeartbeatUtc: "2026-09-26T05:59:30.000Z" },
    120,
    now
  );
  assert.equal(result.availability, "busy");
  assert.equal(result.stale, false);
});

test("stale sessions require recovery and never become free", () => {
  const now = Date.parse("2026-09-26T06:05:00.000Z");
  const result = sessionDisposition(
    { status: "hosting", lastHeartbeatUtc: "2026-09-26T06:00:00.000Z" },
    120,
    now
  );
  assert.equal(result.availability, "recovery_required");
  assert.equal(result.stale, true);
});

test("committing sessions are visible as committing", () => {
  const now = Date.parse("2026-09-26T06:00:30.000Z");
  const result = sessionDisposition(
    { status: "committing", lastHeartbeatUtc: "2026-09-26T06:00:00.000Z" },
    120,
    now
  );
  assert.equal(result.availability, "committing");
});
