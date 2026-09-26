import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fixtureBase, noLinks } from '../../src/lifecycle/files.mjs';
const [root, mode] = process.argv.slice(2);
if (!root || !path.resolve(root).startsWith(fixtureBase + path.sep)) throw new Error('FIXTURES_ONLY');
await noLinks(root);
const save = path.join(root, 'saves', 'synthetic.sav');
if (mode === 'fail-start') process.exit(2);
await readFile(save); // Read the installed canonical revision before reporting readiness.
console.log('READY');
const input = createInterface({ input: process.stdin });
input.on('line', async line => {
  if (line !== 'shutdown' || mode === 'refuse-stop') return;
  if (mode === 'missing-save') await unlink(save);
  else if (mode === 'empty-save') await writeFile(save, '');
  else await writeFile(save, Buffer.concat([await readFile(save), Buffer.from('\nsynthetic server saved cleanly')]));
  input.close(); process.exit(0);
});
// Supervisor death exits without a final save; its journal/lock require recovery.
input.on('close', () => process.exit(0));
