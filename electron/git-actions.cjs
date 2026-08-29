const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function git(cwd, args, timeout = 30000) {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return stdout;
}

async function repositoryRoot(repoPath) {
  const normalized = path.normalize(typeof repoPath === 'string' ? repoPath : '');
  if (!normalized) return null;
  try { return (await git(normalized, ['rev-parse', '--show-toplevel'])).trim() || null }
  catch { return null }
}

async function getWorkspaceStatus(repoPath) {
  const root = await repositoryRoot(repoPath);
  if (!root) throw new Error('当前路径不是 Git 仓库');
  const raw = await git(root, ['status', '--porcelain=v1', '-b', '--untracked-files=normal']);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.replace(/^##\s*/, '') || '';
  const [branchPart = '', trackingPart = ''] = header.split('...');
  const rawBranch = branchPart.replace(/^No commits yet on\s+/, '').replace(/^Initial commit on\s+/, '');
  const branch = /^HEAD\s+\(/.test(rawBranch) || !rawBranch ? '分离头指针' : rawBranch;
  const upstream = trackingPart.split(/\s/)[0] || '';
  const ahead = Number(header.match(/ahead\s+(\d+)/)?.[1] || 0);
  const behind = Number(header.match(/behind\s+(\d+)/)?.[1] || 0);
  const allFiles = lines.map((line) => {
    const index = line[0] || ' '; const worktree = line[1] || ' '; const untracked = index === '?' && worktree === '?';
    const rawPath = line.slice(3); const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
    return { path: filePath, index, worktree, untracked, staged: !untracked && index !== ' ', unstaged: untracked || worktree !== ' ' };
  });
  const files = allFiles.slice(0, 180);
  return {
    branch, upstream, ahead, behind, clean: allFiles.length === 0, totalFiles: allFiles.length,
    staged: allFiles.filter((file) => file.staged).length,
    unstaged: allFiles.filter((file) => file.unstaged && !file.untracked).length,
    untracked: allFiles.filter((file) => file.untracked).length,
    files,
  };
}

function displayGitCommand(args) {
  return `git ${args.map((argument) => /\s/.test(argument) ? `"${argument.replaceAll('"', '\\"')}"` : argument).join(' ')}`;
}

async function executeGitAction(repoPath, action, payload = {}) {
  const allowedActions = new Set(['fetch', 'pull', 'push', 'stage-all', 'unstage-all', 'commit', 'switch-branch', 'create-branch']);
  if (!allowedActions.has(action)) throw new Error('不支持的 Git 操作');
  const root = await repositoryRoot(repoPath);
  if (!root) throw new Error('当前路径不是 Git 仓库');
  const status = await getWorkspaceStatus(root);
  let args; let summary; let timeout = 30000;

  if (action === 'fetch') { args = ['fetch', '--prune']; summary = '远端引用已更新'; timeout = 120000 }
  if (action === 'pull') { args = ['pull', '--ff-only']; summary = '当前分支已快进到远端版本'; timeout = 120000 }
  if (action === 'push') {
    if (status.branch === '分离头指针') throw new Error('分离头指针状态不能直接推送');
    if (status.upstream) args = ['push'];
    else {
      const remotes = (await git(root, ['remote'])).split(/\r?\n/).filter(Boolean);
      if (!remotes.includes('origin')) throw new Error('当前分支没有上游，也没有名为 origin 的远端');
      args = ['push', '--set-upstream', 'origin', status.branch];
    }
    summary = status.upstream ? '当前分支已推送' : `已推送并关联 origin/${status.branch}`; timeout = 120000;
  }
  if (action === 'stage-all') { args = ['add', '-A']; summary = '全部工作区更改已暂存' }
  if (action === 'unstage-all') {
    try { await git(root, ['rev-parse', '--verify', 'HEAD']) }
    catch { args = ['rm', '--cached', '-r', '--ignore-unmatch', '.'] }
    args ||= ['reset']; summary = '已取消全部暂存，工作区内容未被丢弃';
  }
  if (action === 'commit') {
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message) throw new Error('提交说明不能为空');
    if (message.length > 200 || /[\r\n]/.test(message)) throw new Error('提交说明应为不超过 200 字的单行文本');
    if (status.staged === 0) throw new Error('没有已暂存的更改');
    args = ['commit', '-m', message]; summary = '已创建本地提交';
  }
  if (action === 'switch-branch' || action === 'create-branch') {
    if (!status.clean) throw new Error('请先提交或处理工作区更改，再切换分支');
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    if (!branch || branch.length > 200 || /[\r\n]/.test(branch)) throw new Error('请输入有效的分支名');
    await git(root, ['check-ref-format', '--branch', branch]);
    if (action === 'switch-branch') {
      const localBranches = (await git(root, ['branch', '--format=%(refname:short)'])).split(/\r?\n/).filter(Boolean);
      if (!localBranches.includes(branch)) throw new Error('只能切换到本地已存在的分支');
      args = ['switch', branch]; summary = `已切换到 ${branch}`;
    } else { args = ['switch', '-c', branch]; summary = `已创建并切换到 ${branch}` }
  }

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: root, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    });
    return { action, command: displayGitCommand(args), summary, output: (stdout || stderr || summary).trim() };
  } catch (error) {
    const detail = [error?.stderr, error?.stdout, error instanceof Error ? error.message : String(error)].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'Git 操作失败');
  }
}

module.exports = { executeGitAction, getWorkspaceStatus };
