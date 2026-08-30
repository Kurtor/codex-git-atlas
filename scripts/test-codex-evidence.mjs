import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { deriveVerificationDebt, normalizeThread, threadMatch } = require('../electron/codex-evidence.cjs');

const repository = process.platform === 'win32' ? 'E:\\work\\atlas' : '/work/atlas';
assert.equal(threadMatch({ cwd: repository }, repository), 'repository');
assert.equal(threadMatch({ cwd: `${repository}${process.platform === 'win32' ? '\\src' : '/src'}` }, repository), 'repository-child');

const normalized = normalizeThread({
  id: 'thread-1', name: '实现证据视图', preview: '实现证据视图', createdAt: 1, updatedAt: 2, cwd: repository,
  status: { type: 'idle' }, gitInfo: { branch: 'main', sha: 'abc' },
  turns: [{
    id: 'turn-1', status: 'completed', startedAt: 1, completedAt: 2, durationMs: 1000,
    items: [
      { type: 'userMessage', content: [{ type: 'text', text: '增加验证债务', text_elements: [] }] },
      { type: 'reasoning', summary: ['不可显示'], content: ['不可显示'] },
      { type: 'fileChange', id: 'file', status: 'completed', changes: [{ path: `${repository}${process.platform === 'win32' ? '\\src\\App.tsx' : '/src/App.tsx'}`, kind: 'update', diff: 'secret diff' }] },
      { type: 'commandExecution', id: 'cmd', command: 'npm run test', cwd: repository, status: 'completed', exitCode: 0, durationMs: 20 },
      { type: 'agentMessage', id: 'answer', text: '已完成。' },
    ],
  }],
}, repository, 'repository');

assert.equal(normalized.turns[0].goal, '增加验证债务');
assert.equal(normalized.turns[0].files[0].path.replaceAll('\\', '/'), 'src/App.tsx');
assert.equal(normalized.turns[0].validations[0].passed, true);
assert.equal(JSON.stringify(normalized).includes('不可显示'), false);
assert.equal(JSON.stringify(normalized).includes('secret diff'), false);
assert.equal(deriveVerificationDebt(normalized.turns)[0].severity, 'clear');

const missing = deriveVerificationDebt([{ ...normalized.turns[0], validations: [] }]);
assert.equal(missing.some((debt) => debt.id === 'missing-validation'), true);
console.log('Codex evidence normalization tests passed.');
