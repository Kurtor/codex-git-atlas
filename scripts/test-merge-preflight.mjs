import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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

console.log(`merge preflight ok: ${result.source} -> ${result.target}, ${result.ahead} ahead / ${result.behind} behind, ${result.virtualMerge.state}`);
