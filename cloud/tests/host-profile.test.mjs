import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateProfile } from '../../tools/host/host.mjs';
test('per-machine profiles require safe endpoint, absolute paths, identity, and no secret fields',()=>{
  const p={profile:'pc-a',worldId:'worldsynctest',cloudUrl:'https://example.com',machineId:'11111111-1111-4111-8111-111111111111',labPath:path.resolve('lab-a'),installPath:path.resolve('install-copy'),wsbPath:path.resolve('wsb.exe'),wsbFile:path.resolve('lab-a/WorldSync.wsb')};
  assert.equal(validateProfile(p),p);
  assert.throws(()=>validateProfile({...p,token:'never-in-json'}),/SECRET_IN_PROFILE/);
  assert.throws(()=>validateProfile({...p,cloudUrl:'http://example.com'}),/HTTPS_REQUIRED/);
  assert.throws(()=>validateProfile({...p,labPath:'relative'}),/INVALID_PROFILE_PATH/);
});
