import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { attachBranchOperations, parseMergeSource, parseRebaseOperations } = require('../electron/branch-operations.cjs');

assert.equal(parseMergeSource("Merge branch 'feature/graph'"), 'feature/graph');
assert.equal(parseMergeSource("Merge remote-tracking branch 'origin/release'"), 'release');
assert.equal(parseMergeSource('Merge pull request #42 from team/risk-panel'), 'risk-panel');

const reflog = [
  ['mergehash', 'HEAD@{0}', "merge feature/graph: Merge made by the 'ort' strategy.", '2026-08-29T10:04:00Z'],
  ['tiphash', 'HEAD@{2}', 'rebase (finish): returning to refs/heads/feature/graph', '2026-08-29T10:03:00Z'],
  ['tiphash', 'HEAD@{3}', 'rebase (pick): Add operation markers', '2026-08-29T10:02:00Z'],
  ['basehash', 'HEAD@{4}', 'rebase (start): checkout main', '2026-08-29T10:01:00Z'],
].map((entry) => entry.join('\x1f')).join('\n');

assert.deepEqual(parseRebaseOperations(reflog), [{
  hash: 'tiphash',
  kind: 'rebase',
  source: 'feature/graph',
  target: 'main',
  evidence: 'local-reflog',
  recordedAt: '2026-08-29T10:03:00Z',
}]);

const commits = [
  { hash: 'mergehash', subject: "Merge branch 'feature/graph'", parents: ['basehash', 'tiphash'], branches: ['main'], refs: ['main'], operations: [] },
  { hash: 'tiphash', subject: 'Add operation markers', parents: ['basehash'], branches: ['main', 'feature/graph'], refs: ['feature/graph'], operations: [] },
];
attachBranchOperations(commits, reflog, 'main');

assert.deepEqual(commits[0].operations[0], {
  kind: 'merge', source: 'feature/graph', target: 'main', evidence: 'commit-parents', parentCount: 2,
});
assert.deepEqual(commits[1].operations[0], {
  kind: 'rebase', source: 'feature/graph', target: 'main', evidence: 'local-reflog', recordedAt: '2026-08-29T10:03:00Z',
});

console.log('分支行为解析测试通过：Merge 结构识别、Rebase reflog 配对、来源与目标分支映射。');
