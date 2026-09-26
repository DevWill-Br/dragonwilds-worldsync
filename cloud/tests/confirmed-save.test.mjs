import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFinalSave } from '../../src/lifecycle/confirmed-save.mjs';
const old = { success: true, exclusive: true, eventOffset: 10, sha256: 'a', bytes: 20, mtimeUtc: 'old' };
test('finalization accepts the identical explicitly completed save', () => {
  assert.equal(validateFinalSave(old, { ...old }, null), old);
});
test('finalization accepts a later matching success, but rejects unconfirmed changes', () => {
  const next = { ...old, eventOffset: 30, sha256: 'b', mtimeUtc: 'new' };
  assert.equal(validateFinalSave(old, next, next), next);
  assert.throws(() => validateFinalSave(old, next, null), /UNCONFIRMED_SAVE_CHANGE/);
  assert.throws(() => validateFinalSave(old, next, { ...next, eventOffset: 9 }), /UNCONFIRMED_SAVE_CHANGE/);
  assert.throws(() => validateFinalSave(old, { ...old, mtimeUtc: 'unknown-write' }, null), /UNCONFIRMED_SAVE_CHANGE/);
  assert.throws(() => validateFinalSave(old, { ...old, exclusive: false }, old), /UNCONFIRMED_SAVE/);
});
