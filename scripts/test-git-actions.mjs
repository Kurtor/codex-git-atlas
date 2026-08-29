import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { executeGitAction, getWorkspaceStatus } = require('../electron/git-actions.cjs');
const repo = mkdtempSync(join(tmpdir(), 'git-atlas-actions-'));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true }).trim();

try {
  git('init', '-b', 'main');
  git('config', 'user.name', 'Git Atlas Test');
  git('config', 'user.email', 'git-atlas@example.invalid');
  writeFileSync(join(repo, 'README.md'), '# fixture\n');

  let status = await getWorkspaceStatus(repo);
  assert.equal(status.branch, 'main');
  assert.equal(status.untracked, 1);
  assert.equal(status.totalFiles, 1);

  await executeGitAction(repo, 'stage-all');
  status = await getWorkspaceStatus(repo);
  assert.equal(status.staged, 1);

  await executeGitAction(repo, 'unstage-all');
  status = await getWorkspaceStatus(repo);
  assert.equal(status.untracked, 1, '取消初始提交的暂存后必须保留工作区文件');

  await executeGitAction(repo, 'stage-all');
  const commit = await executeGitAction(repo, 'commit', { message: 'Initial fixture' });
  assert.equal(commit.command, 'git commit -m "Initial fixture"');
  assert.equal((await getWorkspaceStatus(repo)).clean, true);

  await executeGitAction(repo, 'create-branch', { branch: 'feature/quick-actions' });
  assert.equal((await getWorkspaceStatus(repo)).branch, 'feature/quick-actions');
  await executeGitAction(repo, 'switch-branch', { branch: 'main' });
  assert.equal((await getWorkspaceStatus(repo)).branch, 'main');

  await assert.rejects(() => executeGitAction(repo, 'push'), /没有上游/);
  await assert.rejects(() => executeGitAction(repo, 'unknown-action'), /不支持/);
  await assert.rejects(() => executeGitAction(repo, 'create-branch', { branch: '../unsafe' }));

  console.log('Git 快捷操作测试通过：状态解析、暂存、取消暂存、提交、新建/切换分支与安全拒绝均正常。');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
