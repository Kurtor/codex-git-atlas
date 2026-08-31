const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function defaultGit(cwd, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: options.timeout || 45000,
      maxBuffer: 40 * 1024 * 1024,
      windowsHide: true,
    });
    return { code: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (error) {
    return {
      code: Number.isInteger(error?.code) ? error.code : 1,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || ''),
    };
  }
}

function requireSuccess(result, message) {
  if (result.code !== 0) throw new Error(`${message}${result.stderr.trim() ? `：${result.stderr.trim()}` : ''}`);
  return result.stdout;
}

function parseMergeTree(output, exitCode) {
  const lines = String(output || '').replace(/\r/g, '').split('\n');
  const blank = lines.findIndex((line, index) => index > 0 && !line.trim());
  const pathLines = lines.slice(1, blank > 0 ? blank : 1).map((line) => line.trim()).filter(Boolean);
  const conflicts = new Set(pathLines.filter((line) => !/^CONFLICT\b/i.test(line) && !/^Auto-merging\b/i.test(line)));

  for (const line of lines) {
    const inPath = line.match(/CONFLICT\s+\([^)]*\).*?\s+in\s+(.+)$/i);
    if (inPath?.[1]) conflicts.add(inPath[1].trim());
    const renamePath = line.match(/CONFLICT\s+\([^)]*\):\s+(.+?)\s+(?:renamed|deleted|added|modified)\b/i);
    if (renamePath?.[1] && !renamePath[1].includes(' ')) conflicts.add(renamePath[1].trim());
  }

  const messages = lines.filter((line) => /^(CONFLICT|warning:|error:)/i.test(line.trim())).map((line) => line.trim());
  return {
    state: exitCode === 0 && conflicts.size === 0 ? 'clean' : conflicts.size > 0 || exitCode === 1 ? 'conflicts' : 'unavailable',
    conflicts: [...conflicts],
    messages,
  };
}

function parseNumstat(raw) {
  return String(raw || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    return {
      path: parts.slice(2).pop() || '',
      additions: /^\d+$/.test(parts[0]) ? Number(parts[0]) : 0,
      deletions: /^\d+$/.test(parts[1]) ? Number(parts[1]) : 0,
    };
  }).filter((file) => file.path);
}

function parseNameStatus(raw) {
  return new Map(String(raw || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const status = parts[0] || 'M';
    return [parts.at(-1) || '', status[0]];
  }));
}

function parseCommits(raw) {
  return String(raw || '').split('\x1e').map((record) => record.trim()).filter(Boolean).map((record) => {
    const [hash, shortHash, subject, author, isoDate] = record.split('\x1f');
    return { hash, shortHash, subject, author, isoDate };
  });
}

async function listMergeRefs(repoPath, runGit = defaultGit) {
  const rootResult = await runGit(repoPath, ['rev-parse', '--show-toplevel']);
  const root = path.normalize(requireSuccess(rootResult, '无法识别 Git 仓库').trim());
  const [branchResult, refsResult] = await Promise.all([
    runGit(root, ['branch', '--show-current']),
    runGit(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']),
  ]);
  const current = requireSuccess(branchResult, '无法读取当前分支').trim() || 'HEAD';
  const refs = requireSuccess(refsResult, '无法读取分支').split(/\r?\n/).map((ref) => ref.trim()).filter((ref) => ref && !ref.endsWith('/HEAD'));
  return { root, current, refs: [...new Set([current, ...refs])] };
}

async function createMergePreflight(repoPath, sourceRef, targetRef, runGit = defaultGit) {
  const { root, current, refs } = await listMergeRefs(repoPath, runGit);
  const source = sourceRef || current;
  const target = targetRef;
  if (!refs.includes(source)) throw new Error(`找不到源分支：${source}`);
  if (!target || !refs.includes(target)) throw new Error(`找不到目标分支：${target || '未选择'}`);

  const mergeBaseResult = await runGit(root, ['merge-base', source, target]);
  const mergeBase = requireSuccess(mergeBaseResult, '两个分支没有可用的共同祖先').trim();
  const [countsResult, statusResult, filesResult, namesResult, commitsResult, baseCommitResult, mergeTreeResult] = await Promise.all([
    runGit(root, ['rev-list', '--left-right', '--count', `${target}...${source}`]),
    runGit(root, ['status', '--porcelain=v1', '-z']),
    runGit(root, ['diff', '--no-renames', '--numstat', mergeBase, source]),
    runGit(root, ['diff', '--find-renames', '--name-status', mergeBase, source]),
    runGit(root, ['log', '--max-count=80', '--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%aI', `${target}..${source}`]),
    runGit(root, ['show', '-s', '--format=%H%x1f%h%x1f%s', mergeBase]),
    runGit(root, ['merge-tree', '--write-tree', '--name-only', '--messages', target, source], { timeout: 90000 }),
  ]);

  const [behindRaw = '0', aheadRaw = '0'] = requireSuccess(countsResult, '无法计算分支距离').trim().split(/\s+/);
  const behind = Number(behindRaw) || 0;
  const ahead = Number(aheadRaw) || 0;
  const statuses = parseNameStatus(requireSuccess(namesResult, '无法读取文件状态'));
  const files = parseNumstat(requireSuccess(filesResult, '无法读取分支差异')).map((file) => ({
    ...file,
    status: statuses.get(file.path) || 'M',
    module: file.path.includes('/') ? file.path.split('/')[0] : '根目录',
  }));
  const [baseHash = mergeBase, baseShortHash = mergeBase.slice(0, 7), baseSubject = '共同祖先'] = requireSuccess(baseCommitResult, '无法读取共同祖先').trim().split('\x1f');
  const virtualMerge = parseMergeTree(mergeTreeResult.stdout, mergeTreeResult.code);
  if (mergeTreeResult.code > 1 && virtualMerge.state === 'unavailable') virtualMerge.messages.push(mergeTreeResult.stderr.trim() || '当前 Git 版本无法完成虚拟合并');

  const relation = ahead === 0 && behind === 0 ? 'up-to-date' : ahead > 0 && behind === 0 ? 'ahead' : ahead === 0 && behind > 0 ? 'behind' : 'diverged';
  return {
    source,
    target,
    currentBranch: current,
    mergeBase: { hash: baseHash, shortHash: baseShortHash, subject: baseSubject },
    relation,
    ahead,
    behind,
    workingTreeClean: statusResult.code === 0 && statusResult.stdout.length === 0,
    dirtyCount: statusResult.code === 0 ? statusResult.stdout.split('\0').filter(Boolean).length : 0,
    virtualMerge,
    commits: parseCommits(requireSuccess(commitsResult, '无法读取待合并提交')),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    modules: Object.entries(files.reduce((result, file) => {
      result[file.module] = (result[file.module] || 0) + file.additions + file.deletions;
      return result;
    }, {})).map(([name, churn]) => ({ name, churn })).sort((left, right) => right.churn - left.churn),
    observedAt: Date.now(),
  };
}

module.exports = { createMergePreflight, listMergeRefs, parseMergeTree };
