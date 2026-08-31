import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createMergePreflight, listMergeRefs, parseMergeTree } = require('../electron/merge-preflight.cjs');

const conflicted = parseMergeTree(`0123456789abcdef\nsrc/App.tsx\n\nAuto-merging src/App.tsx\nCONFLICT (content): Merge conflict in src/App.tsx\n`, 1);
assert.equal(conflicted.state, 'conflicts');
assert.deepEqual(conflicted.conflicts, ['src/App.tsx']);

const clean = parseMergeTree('0123456789abcdef\n', 0);
assert.equal(clean.state, 'clean');
assert.deepEqual(clean.conflicts, []);

const refs = await listMergeRefs(process.cwd());
assert.ok(refs.refs.includes(refs.current));
const target = refs.refs.find((ref) => ref !== refs.current) || refs.current;
const result = await createMergePreflight(process.cwd(), refs.current, target);
assert.equal(result.source, refs.current);
assert.equal(result.target, target);
assert.ok(['clean', 'conflicts', 'unavailable'].includes(result.virtualMerge.state));
assert.ok(Number.isInteger(result.ahead));
assert.ok(Number.isInteger(result.behind));
assert.ok(Array.isArray(result.files));
assert.ok(Array.isArray(result.commits));

const fixture = mkdtempSync(join(tmpdir(), 'git-atlas-merge-preflight-'));
const fixtureGit = (...args) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe', windowsHide: true });
try {
  fixtureGit('init', '-b', 'main');
  fixtureGit('config', 'user.name', 'Git Atlas Test');
  fixtureGit('config', 'user.email', 'git-atlas@example.invalid');
  writeFileSync(join(fixture, 'contract.txt'), 'base\n', 'utf8');
  fixtureGit('add', 'contract.txt'); fixtureGit('commit', '-m', 'base contract');
  fixtureGit('checkout', '-b', 'feature/evidence-gate');
  writeFileSync(join(fixture, 'contract.txt'), 'feature decision\n', 'utf8');
  fixtureGit('add', 'contract.txt'); fixtureGit('commit', '-m', 'change contract from feature');
  fixtureGit('checkout', 'main');
  writeFileSync(join(fixture, 'contract.txt'), 'mainline decision\n', 'utf8');
  fixtureGit('add', 'contract.txt'); fixtureGit('commit', '-m', 'change contract from mainline');

  const collision = await createMergePreflight(fixture, 'feature/evidence-gate', 'main');
  assert.equal(collision.relation, 'diverged');
  assert.equal(collision.ahead, 1);
  assert.equal(collision.behind, 1);
  assert.equal(collision.virtualMerge.state, 'conflicts');
  assert.ok(collision.virtualMerge.conflicts.includes('contract.txt'));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log(`merge preflight ok: ${result.source} -> ${result.target}, plus real conflict fixture`);
