const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { attachBranchOperations } = require('./branch-operations.cjs');
const { executeGitAction, getWorkspaceStatus } = require('./git-actions.cjs');
const { loadCodexEvidence, stopCodexEvidence } = require('./codex-evidence.cjs');

if (process.env.GIT_ATLAS_QA_USER_DATA) app.setPath('userData', path.resolve(process.env.GIT_ATLAS_QA_USER_DATA));

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const COLORS = ['#68a8e8', '#9b8ae7', '#d4a855', '#52ad9c', '#d87575', '#7d91a8', '#b982ad', '#87996d'];
let codexContextCache = { signature: '', expiresAt: 0, value: null };
let codexStateCache = { filePath: '', modifiedAt: -1, value: null };

async function git(cwd, args, timeout = 30000) {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout, maxBuffer: 40 * 1024 * 1024, windowsHide: true });
  return stdout;
}

function parseRefs(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/^HEAD -> /, ''));
}

function buildLanes(commits) {
  const lanes = [];
  commits.forEach((commit) => {
    let lane = lanes.indexOf(commit.hash);
    if (lane < 0) {
      lane = lanes.findIndex((value) => !value);
      if (lane < 0) lane = lanes.length;
    }
    commit.lane = Math.min(lane, 7);
    const parents = commit.parents;
    lanes[lane] = parents[0] || null;
    for (let i = 1; i < parents.length; i += 1) {
      if (!lanes.includes(parents[i])) lanes.splice(lane + i, 0, parents[i]);
    }
    while (lanes.length && !lanes[lanes.length - 1]) lanes.pop();
    commit.color = COLORS[commit.lane % COLORS.length];
  });
  return commits;
}

function parseLog(raw) {
  const records = raw.split('\x1e').map((record) => record.trim()).filter(Boolean);
  const commits = records.map((record) => {
    const lines = record.split(/\r?\n/).filter(Boolean);
    const [hash, shortHash, refsRaw = '', subject = '无标题提交', author = '未知作者', isoDate = '', parentsRaw = ''] = lines.shift().split('\x1f');
    let additions = 0; let deletions = 0; const modules = {};
    for (const line of lines) {
      const [addRaw, delRaw, file] = line.split('\t');
      if (!file) continue;
      const add = Number(addRaw) || 0; const del = Number(delRaw) || 0;
      additions += add; deletions += del;
      const moduleName = file.includes('/') ? file.split('/')[0] : '根目录';
      modules[moduleName] = (modules[moduleName] || 0) + add + del;
    }
    const refs = parseRefs(refsRaw);
    const branch = refs.find((ref) => !ref.startsWith('tag:') && !ref.includes('origin/')) || '';
    const tags = refs.filter((ref) => ref.startsWith('tag:')).map((ref) => ref.replace(/^tag:\s*/, ''));
    return { hash, shortHash, refs, subject, author, isoDate, parents: parentsRaw.split(' ').filter(Boolean), additions, deletions, modules, branch, branches: [], tags, operations: [], lane: 0, color: COLORS[0] };
  });
  return buildLanes(commits);
}

async function attachBranchMembership(root, commits, refs, currentBranch) {
  const localBranches = refs.filter((ref) => ref.type === 'local').map((ref) => ref.short);
  const prioritized = [...new Set([currentBranch, ...localBranches].filter((name) => name && name !== '分离头指针'))].slice(0, 16);
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const queue = [...prioritized];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const branchName = queue.shift();
      if (!branchName) return;
      try {
        const hashes = (await git(root, ['rev-list', '--max-count=500', branchName])).split(/\r?\n/).filter(Boolean);
        hashes.forEach((hash) => { const commit = byHash.get(hash); if (commit) commit.branches.push(branchName) });
      } catch { /* A branch may disappear while the repository is being refreshed. */ }
    }
  });
  await Promise.all(workers);
  commits.forEach((commit) => { commit.branches = [...new Set(commit.branches)] });
  return commits;
}

async function validateRepo(repoPath) {
  const root = (await git(repoPath, ['rev-parse', '--show-toplevel'])).trim();
  const name = path.basename(root);
  const branch = (await git(root, ['branch', '--show-current'])).trim() || '分离头指针';
  const statusRaw = await git(root, ['status', '--porcelain=v1', '-b']);
  const statusLines = statusRaw.split(/\r?\n/).filter(Boolean);
  const ahead = Number(statusLines[0]?.match(/ahead (\d+)/)?.[1] || 0);
  const behind = Number(statusLines[0]?.match(/behind (\d+)/)?.[1] || 0);
  const logRaw = await git(root, ['log', '--all', '--topo-order', '--date=iso-strict', '--max-count=500', '--numstat', '--format=%x1e%H%x1f%h%x1f%D%x1f%s%x1f%an%x1f%aI%x1f%P']);
  const commits = parseLog(logRaw);
  const refRaw = await git(root, ['for-each-ref', '--format=%(refname)\t%(refname:short)\t%(objectname:short)\t%(upstream:trackshort)', 'refs/heads', 'refs/remotes', 'refs/tags']);
  const refs = refRaw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [full, short, hash, track] = line.split('\t');
    return { full, short, hash, track, type: full.startsWith('refs/tags') ? 'tag' : full.startsWith('refs/remotes') ? 'remote' : 'local' };
  });
  await attachBranchMembership(root, commits, refs, branch);
  let headReflog = '';
  try {
    headReflog = await git(root, ['reflog', 'show', 'HEAD', '--date=iso-strict', '--max-count=500', '--format=%H%x1f%gD%x1f%gs%x1f%cI']);
  } catch { /* Reflog may be disabled, unavailable, or expired. Merge detection still works from commit structure. */ }
  attachBranchOperations(commits, headReflog, branch);
  return { path: root, name, branch, ahead, behind, dirtyCount: Math.max(0, statusLines.length - 1), commits, refs };
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { return {}; } }
function writeSettings(patch) { fs.writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), ...patch }, null, 2), 'utf8'); }
function saveLastRepo(repoPath) {
  const settings = readSettings();
  const recentRepos = [repoPath, ...(Array.isArray(settings.recentRepos) ? settings.recentRepos : [])]
    .filter((value) => typeof value === 'string' && value)
    .map((value) => path.normalize(value))
    .filter((value, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 8);
  writeSettings({ lastRepo: path.normalize(repoPath), recentRepos });
}
function readLastRepo() { return readSettings().lastRepo || null; }
function readRecentRepos() {
  const settings = readSettings();
  const paths = Array.isArray(settings.recentRepos) ? settings.recentRepos : settings.lastRepo ? [settings.lastRepo] : [];
  return paths.map((repoPath) => path.normalize(repoPath))
    .filter((repoPath, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === repoPath.toLowerCase()) === index)
    .slice(0, 8).map((repoPath) => ({ path: repoPath, name: path.basename(repoPath), available: fs.existsSync(repoPath) }));
}
function saveFollowCodex(enabled) { writeSettings({ followCodex: Boolean(enabled) }); return Boolean(enabled); }
function readFollowCodex() { return Boolean(readSettings().followCodex); }
function saveCodexEvidenceEnabled(enabled) { writeSettings({ codexEvidenceEnabled: Boolean(enabled) }); return Boolean(enabled); }
function readCodexEvidenceEnabled() { return Boolean(readSettings().codexEvidenceEnabled); }

function normalizeLocalPath(value) {
  if (typeof value !== 'string') return '';
  const decoded = value.match(/^\/[A-Za-z]:\//) ? value.slice(1) : value;
  return path.normalize(decoded);
}

function isRepositoryDirectory(directoryPath) {
  try { return fs.existsSync(path.join(directoryPath, '.git')); } catch { return false; }
}

function browseDirectory(requestedPath) {
  const fallback = readLastRepo() || os.homedir();
  const directoryPath = path.resolve(normalizeLocalPath(requestedPath) || fallback);
  const stat = fs.statSync(directoryPath);
  if (!stat.isDirectory()) throw new Error('该路径不是文件夹');
  const root = path.parse(directoryPath).root;
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git' && entry.name !== 'node_modules')
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    })
    .slice(0, 240)
    .map((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      const type = entry.isDirectory() ? 'directory' : 'file';
      return { path: entryPath, name: entry.name, type, isRepository: type === 'directory' && isRepositoryDirectory(entryPath) };
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
      if (left.isRepository !== right.isRepository) return left.isRepository ? -1 : 1;
      return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    })
    .slice(0, 180);
  return { path: directoryPath, parentPath: directoryPath === root ? null : path.dirname(directoryPath), isRepository: isRepositoryDirectory(directoryPath), entries };
}

function readCodexState() {
  const explicit = process.env.GIT_ATLAS_CODEX_STATE;
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const candidates = explicit
    ? [explicit]
    : [path.join(codexHome, '.codex-global-state.json'), path.join(codexHome, '.codex-global-state.json.bak')];
  for (const candidate of candidates) {
    try {
      const modifiedAt = fs.statSync(candidate).mtimeMs;
      if (codexStateCache.filePath === candidate && codexStateCache.modifiedAt === modifiedAt) return codexStateCache.value;
      const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      codexStateCache = { filePath: candidate, modifiedAt, value };
      return value;
    } catch { /* Codex may be replacing the state file atomically. */ }
  }
  return null;
}

async function gitRoot(candidate) {
  try { return (await git(candidate, ['rev-parse', '--show-toplevel'], 3500)).trim(); } catch { return null; }
}

async function directChildRepositories(rootPath) {
  let entries;
  try { entries = fs.readdirSync(rootPath, { withFileTypes: true }); } catch { return []; }
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && fs.existsSync(path.join(rootPath, entry.name, '.git'))).slice(0, 64);
  const roots = await Promise.all(directories.map((entry) => gitRoot(path.join(rootPath, entry.name))));
  return roots.filter(Boolean);
}

function cacheCodexContext(signature, value) {
  codexContextCache = { signature, expiresAt: Date.now() + 30000, value };
  return value;
}

async function getCodexProjectContext() {
  const observedAt = Date.now();
  const state = readCodexState();
  if (!state) return { status: 'unavailable', observedAt, message: '未找到 Codex 本地项目状态' };

  const selected = state['selected-project'];
  const projects = state['local-projects'] || {};
  const selectedProject = selected?.type === 'local' ? projects[selected.projectId] : null;
  const roots = (selectedProject?.rootPaths?.length ? selectedProject.rootPaths : state['active-workspace-roots'] || [])
    .map(normalizeLocalPath).filter(Boolean);
  const projectName = selectedProject?.name || (roots[0] ? path.basename(roots[0]) : 'Codex 当前项目');
  const base = {
    projectId: selectedProject?.id || selected?.projectId || null,
    projectName,
    projectPath: roots[0] || null,
    source: selectedProject ? 'selected-project' : 'active-workspace-roots',
    observedAt,
  };
  const signature = JSON.stringify([base.projectId, base.projectName, roots]);
  if (codexContextCache.signature === signature && codexContextCache.expiresAt > observedAt && codexContextCache.value) return { ...codexContextCache.value, observedAt };
  if (!roots.length) return cacheCodexContext(signature, { ...base, status: 'unavailable', message: 'Codex 当前没有绑定本地文件夹' });

  const discovered = [];
  for (const rootPath of roots) {
    const root = await gitRoot(rootPath);
    if (root) discovered.push(root);
    else discovered.push(...await directChildRepositories(rootPath));
  }
  const unique = [...new Map(discovered.map((repoPath) => [repoPath.toLowerCase(), repoPath])).values()];
  if (unique.length === 1) return cacheCodexContext(signature, { ...base, status: 'ready', repoPath: unique[0], candidates: unique });
  if (unique.length > 1) return cacheCodexContext(signature, { ...base, status: 'ambiguous', candidates: unique, message: `项目中检测到 ${unique.length} 个 Git 仓库` });
  return cacheCodexContext(signature, { ...base, status: 'not-git', candidates: [], message: '当前 Codex 项目不是 Git 仓库' });
}

function createWindow() {
  if (process.env.GIT_ATLAS_CAPTURE_REPO) writeSettings({ lastRepo: path.resolve(process.env.GIT_ATLAS_CAPTURE_REPO), recentRepos: [path.resolve(process.env.GIT_ATLAS_CAPTURE_REPO)], followCodex: false, codexEvidenceEnabled: process.env.GIT_ATLAS_CAPTURE_AI === '1' });
  if (process.env.GIT_ATLAS_SMOKE) {
    const smokeRepo = process.env.GIT_ATLAS_SMOKE_REPO || null;
    writeSettings({ lastRepo: smokeRepo, recentRepos: smokeRepo ? [smokeRepo] : [], followCodex: false });
  }
  const rendererErrors = [];
  const win = new BrowserWindow({
    width: 1440, height: 1024, minWidth: 1080, minHeight: 680,
    backgroundColor: '#111315', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#090e14', symbolColor: '#9ca3a6', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on('console-message', (_event, detailsOrLevel, legacyMessage) => {
    const level = typeof detailsOrLevel === 'object' ? detailsOrLevel.level : detailsOrLevel;
    const message = typeof detailsOrLevel === 'object' ? detailsOrLevel.message : legacyMessage;
    if (level === 'error' || level === 'warning' || Number(level) >= 2) rendererErrors.push(message);
  });
  win.once('ready-to-show', () => win.show());
  if (isDev) win.loadURL('http://localhost:5173'); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.GIT_ATLAS_CAPTURE) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.GIT_ATLAS_SMOKE) {
        let nativeRepo;
        try {
          const repo = await validateRepo(process.env.GIT_ATLAS_SMOKE_REPO || process.cwd());
          nativeRepo = {
            name: repo.name,
            branch: repo.branch,
            commitCount: repo.commits.length,
            refCount: repo.refs.length,
            operationCounts: {
              merge: repo.commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'merge')).length,
              rebase: repo.commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'rebase')).length,
            },
            hasRealHistory: repo.commits.length > 0,
            searchTerm: repo.commits[0]?.shortHash?.slice(0, 4) || '',
          };
        } catch (error) {
          nativeRepo = { error: error instanceof Error ? error.message : String(error), hasRealHistory: false };
        }
        const codexContext = await getCodexProjectContext();
        const checks = await win.webContents.executeJavaScript(`(async () => {
          try {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const expectedFollowLabel = ${JSON.stringify(codexContext.status === 'ready' ? `已跟随：${codexContext.projectName || ''}` : codexContext.status === 'ambiguous' ? `${codexContext.projectName || ''} 含多个仓库` : codexContext.message || '')};
          const expectedRepoName = ${JSON.stringify(nativeRepo.name || '')};
          const expectedFollowRepoName = ${JSON.stringify(codexContext.status === 'ready' && codexContext.repoPath ? path.basename(codexContext.repoPath) : nativeRepo.name || '')};
          const captureMode = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_MODE || 'history')};
          const captureBranch = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_BRANCH || '')};
          const captureOperation = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_OPERATION || '')};
          const captureRepositoryBrowser = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_BROWSER === '1')};
          const captureGitDock = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_GIT === '1')};
          const expectedOperationCounts = ${JSON.stringify(nativeRepo.operationCounts || { merge: 0, rebase: 0 })};
          const expectedSearchTerm = ${JSON.stringify(nativeRepo.searchTerm || '')};
          const expectedCommitCount = ${JSON.stringify(nativeRepo.commitCount || 0)};
          const result = {};
          const shellbarRect = document.querySelector('.shellbar').getBoundingClientRect();
          const shellbarItems = [...document.querySelectorAll('.shellbar > button, .shellbar > label')];
          result.windowControlsSafeArea = shellbarRect.left >= 0 && shellbarRect.right <= window.innerWidth && shellbarItems.every((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left >= shellbarRect.left && rect.right <= shellbarRect.right;
          });
          const repositoryToggle = document.querySelector('[data-repository-browser-toggle]');
          repositoryToggle?.click(); await wait(180);
          result.integratedRepositoryBrowser = Boolean(document.querySelector('[data-repository-browser]')) && Boolean(document.querySelector('.repository-path input')) && Boolean(document.querySelector('.directory-list')) && document.body.innerText.includes('本机文件');
          document.querySelector('.repository-browser-header > button')?.click(); await wait(80);
          const gitToggle = document.querySelector('.shellbar [data-git-command-toggle]');
          gitToggle?.click(); await wait(220);
          result.gitCommandDock = Boolean(document.querySelector('[data-git-command-dock]')) && document.body.innerText.includes('远端同步') && document.body.innerText.includes('工作区') && document.body.innerText.includes('提交说明');
          document.querySelector('[data-git-action="push"]')?.click(); await wait(40);
          result.gitCommandSafety = document.body.innerText.includes('仅允许快进') && document.body.innerText.includes('不会强推') && !document.querySelector('[data-git-command-dock] textarea');
          result.gitWorkspaceStatus = Boolean(document.querySelector('.git-status-numbers')) && Boolean(document.querySelector('.git-command-branch span')?.textContent);
          document.querySelector('.git-confirm button:last-child')?.click(); await wait(30);
          gitToggle?.click(); await wait(80);
          const search = document.querySelector('.shellbar .global-search input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(search, expectedSearchTerm); search.dispatchEvent(new Event('input', { bubbles: true })); await wait(80);
          result.search = Boolean(expectedSearchTerm) && document.querySelectorAll('.commit-row').length > 0 && document.querySelectorAll('.commit-row').length < expectedCommitCount;
          setter.call(search, ''); search.dispatchEvent(new Event('input', { bubbles: true })); await wait(80);
          document.querySelectorAll('.mode-tabs button')[1].click(); await wait(80);
          result.causalMode = document.querySelectorAll('.mode-tabs button')[1].classList.contains('active') && document.querySelector('.causal-toggle input').checked;
          const initialRows = document.querySelectorAll('.commit-row');
          const topologyBeforeSelection = document.querySelector('.graph-canvas')?.dataset.topologySignature;
          initialRows[Math.min(8, initialRows.length - 1)]?.click(); await wait(80);
          result.selection = initialRows[Math.min(8, initialRows.length - 1)]?.classList.contains('selected') === true;
          result.stableTopology = topologyBeforeSelection === document.querySelector('.graph-canvas')?.dataset.topologySignature && document.querySelectorAll('.commit-row.selected').length === 1;
          result.denseRows = document.querySelectorAll('.commit-row').length > 0;
          result.chineseUi = document.body.innerText.includes('提交演化') && document.body.innerText.includes('用 Codex 分析');
          const densityButtons = document.querySelectorAll('.density-control button');
          densityButtons[0]?.click(); await wait(80);
          result.densityControl = densityButtons[0]?.classList.contains('active') && document.querySelector('.commit-row:not(.selected)')?.style.height === '36px';
          densityButtons[1]?.click(); await wait(80);
          result.activityOverview = document.body.innerText.includes('提交活跃度') && document.querySelectorAll('.activity-chart button:not(:disabled)').length > 0;
          const follow = document.querySelector('.follow-switch input');
          if (follow && !follow.checked) follow.click(); await wait(2200);
          result.followControl = Boolean(follow?.checked) && document.body.innerText.includes('跟随 Codex');
          result.followLoadedRepo = document.body.innerText.includes(expectedFollowLabel) && document.body.innerText.includes(expectedFollowRepoName) && !document.querySelector('.shellbar')?.innerText.includes('演示数据');
          const branchButton = [...document.querySelectorAll('.branch-list button[data-branch]')].find((button) => Number(button.dataset.commitCount) > 1);
          branchButton?.click(); await wait(120);
          result.branchReachability = Boolean(branchButton) && document.querySelectorAll('.commit-row').length === Number(branchButton?.dataset.commitCount) && Number(branchButton?.dataset.commitCount) > 1;
          document.querySelector('.branch-list .branch-item')?.click(); await wait(80);
          if (follow?.checked) follow.click(); await wait(180);
          result.followDisableKeepsRepo = Boolean(follow && !follow.checked) && document.body.innerText.includes('已固定当前仓库') && document.body.innerText.includes(expectedFollowRepoName);
          if (follow && !follow.checked) follow.click(); await wait(240);
          document.querySelectorAll('.mode-tabs button')[0].click(); await wait(80);
          const finalRows = document.querySelectorAll('.commit-row');
          result.moduleComposition = document.body.innerText.includes('模块构成') && [...document.querySelectorAll('.module-footprint')].every((node) => Boolean(node.querySelector('span')?.textContent) && /%/.test(node.querySelector('small')?.textContent || ''));
          finalRows[Math.min(5, finalRows.length - 1)]?.click(); await wait(120);
          document.querySelectorAll('.inspector-actions button')[1]?.click(); await wait(900);
          result.parentComparison = document.body.innerText.includes('已生成对比') && document.querySelectorAll('.changed-files code').length > 0;
          const modeKeys = ['history', 'causal', 'modules', 'risk'];
          const modeSelectors = ['.history-detail', '.causal-detail', '.module-detail', '.risk-detail'];
          const modeResults = {};
          for (let index = 0; index < modeKeys.length; index += 1) {
            document.querySelectorAll('.mode-tabs button')[index]?.click(); await wait(100);
            const workspace = document.querySelector('.mode-workspace');
            const title = workspace?.querySelector('h1');
            modeResults[modeKeys[index]] = workspace?.dataset.mode === modeKeys[index] && Boolean(workspace?.querySelector(modeSelectors[index])) && Number.parseFloat(getComputedStyle(title).fontSize) >= 16;
          }
          result.distinctModes = Object.values(modeResults).every(Boolean);
          document.querySelectorAll('.mode-tabs button')[2]?.click(); await wait(80);
          const allModuleRows = document.querySelectorAll('.commit-row').length;
          const moduleFilter = document.querySelectorAll('.module-detail button')[1]; moduleFilter?.click(); await wait(100);
          result.moduleFiltering = Boolean(moduleFilter?.classList.contains('active')) && document.querySelectorAll('.commit-row').length <= allModuleRows;
          document.querySelectorAll('.module-detail button')[0]?.click(); await wait(60);
          document.querySelectorAll('.mode-tabs button')[3]?.click(); await wait(80);
          result.riskQueue = document.querySelectorAll('.risk-queue button').length > 0 && [...document.querySelectorAll('.commit-row .risk-signal b')].every((node) => Number(node.textContent) >= 45);
          result.explainableRisk = document.querySelectorAll('.risk-factors span').length === 4 && document.body.innerText.includes('范围 0-100');
          document.querySelectorAll('.mode-tabs button')[0]?.click(); await wait(80);
          const mergeRows = document.querySelectorAll('.commit-row[data-operations~="merge"]');
          const rebaseRows = document.querySelectorAll('.commit-row[data-operations~="rebase"]');
          result.branchOperationMarkers = mergeRows.length === expectedOperationCounts.merge && rebaseRows.length === expectedOperationCounts.rebase && document.querySelectorAll('.operation-badge[data-operation]').length === expectedOperationCounts.merge + expectedOperationCounts.rebase;
          const firstOperationRow = mergeRows[0] || rebaseRows[0]; firstOperationRow?.click(); await wait(80);
          result.branchOperationDetails = expectedOperationCounts.merge + expectedOperationCounts.rebase === 0 || Boolean(document.querySelector('.branch-operations [data-operation-detail]'));
          rebaseRows[0]?.click(); await wait(80);
          result.rebaseEvidence = expectedOperationCounts.rebase === 0 || document.querySelector('.branch-operations')?.textContent.includes('reflog');
          const requestedIndex = Math.max(0, modeKeys.indexOf(captureMode));
          document.querySelectorAll('.mode-tabs button')[requestedIndex]?.click(); await wait(100);
          if (captureBranch) document.querySelector('.branch-list button[data-branch="' + CSS.escape(captureBranch) + '"]')?.click();
          if (captureOperation) document.querySelector('.commit-row[data-operations~="' + CSS.escape(captureOperation) + '"]')?.click();
          if (captureRepositoryBrowser && !document.querySelector('[data-repository-browser]')) document.querySelector('[data-repository-browser-toggle]')?.click();
          if (captureGitDock && !document.querySelector('[data-git-command-dock]')) {
            document.querySelector('.shellbar [data-git-command-toggle]')?.click(); await wait(120);
            document.querySelector('[data-git-action="push"]')?.click();
          }
          await wait(120);
          return result;
          } catch (error) {
            return { smokeFailure: { message: error?.message || String(error), stack: error?.stack || '' } };
          }
        })()`);
        fs.writeFileSync(process.env.GIT_ATLAS_SMOKE, JSON.stringify({ nativeRepo, codexContext, checks, rendererErrors }, null, 2));
      }
      if (process.env.GIT_ATLAS_CAPTURE_AI === '1' && !process.env.GIT_ATLAS_SMOKE) {
        await win.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          for (let index = 0; index < 60 && !document.querySelector('.ai-task-rail'); index += 1) await wait(250);
          const mode = ${JSON.stringify(process.env.GIT_ATLAS_CAPTURE_AI_MODE || 'tasks')};
          document.querySelector('[data-ai-mode="' + CSS.escape(mode) + '"]')?.click();
          await wait(300);
        })()`);
      }
      if (process.env.GIT_ATLAS_CAPTURE_WORKSPACE === 'git' && !process.env.GIT_ATLAS_SMOKE) {
        await win.webContents.executeJavaScript(`(async () => { document.querySelector('.workspace-layer-switch .git')?.click(); await new Promise((resolve) => setTimeout(resolve, 500)); })()`);
      }
      const image = await win.capturePage();
      fs.writeFileSync(process.env.GIT_ATLAS_CAPTURE, image.resize({ width: 1440, height: 1024, quality: 'best' }).toPNG());
      app.quit();
    }, 1400));
  }
  return win;
}

ipcMain.handle('repo:choose', async () => {
  const result = await dialog.showOpenDialog({ title: '选择 Git 仓库', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const data = await validateRepo(result.filePaths[0]); saveLastRepo(data.path); return data;
});
ipcMain.handle('repo:load', async (_event, repoPath) => { const data = await validateRepo(repoPath); saveLastRepo(data.path); return data; });
ipcMain.handle('repo:last', () => readLastRepo());
ipcMain.handle('repo:recent', () => readRecentRepos());
ipcMain.handle('repo:browse', (_event, directoryPath) => browseDirectory(directoryPath));
ipcMain.handle('git:status', (_event, repoPath) => getWorkspaceStatus(repoPath));
ipcMain.handle('git:action', (_event, repoPath, action, payload) => executeGitAction(repoPath, action, payload));
ipcMain.handle('codex:context', () => getCodexProjectContext());
ipcMain.handle('codex:evidence-enabled', () => readCodexEvidenceEnabled());
ipcMain.handle('codex:evidence-set-enabled', (_event, enabled) => saveCodexEvidenceEnabled(enabled));
ipcMain.handle('codex:evidence-load', async (_event, repoPath, threadId) => {
  if (!readCodexEvidenceEnabled()) return { status: 'disabled', tasks: [], selectedTask: null, observedAt: Date.now(), message: 'AI 证据读取已关闭' };
  const repository = await gitRoot(repoPath);
  if (!repository) throw new Error('请选择有效的 Git 仓库');
  return loadCodexEvidence(repository, typeof threadId === 'string' ? threadId : undefined);
});
ipcMain.handle('follow:get', () => readFollowCodex());
ipcMain.handle('follow:set', (_event, enabled) => saveFollowCodex(enabled));
ipcMain.handle('commit:details', async (_event, repoPath, hash) => {
  const raw = await git(repoPath, ['show', '--no-renames', '--numstat', '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%P%x1e', hash]);
  const [header, stats = ''] = raw.split('\x1e');
  const [fullHash, shortHash, subject, author, email, isoDate, parents = ''] = header.trim().split('\x1f');
  const files = stats.trim().split(/\r?\n/).filter(Boolean).map((line) => { const [a, d, file] = line.split('\t'); return { file, additions: Number(a) || 0, deletions: Number(d) || 0 } });
  return { fullHash, shortHash, subject, author, email, isoDate, parents: parents.split(' ').filter(Boolean), files };
});
ipcMain.handle('commit:compare-parent', async (_event, repoPath, hash) => {
  const ancestry = (await git(repoPath, ['rev-list', '--parents', '-n', '1', hash])).trim().split(' ');
  const parentHash = ancestry[1] || null;
  const raw = parentHash
    ? await git(repoPath, ['diff', '--no-renames', '--numstat', parentHash, hash])
    : await git(repoPath, ['diff-tree', '--root', '--no-commit-id', '--numstat', '-r', hash]);
  const files = raw.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [a, d, file] = line.split('\t');
    return { file, additions: Number(a) || 0, deletions: Number(d) || 0 };
  });
  return {
    parentHash,
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
});
ipcMain.handle('codex:analyze', async (_event, repoPath, hash) => {
  const prompt = `请以只读方式分析 Git 提交 ${hash}。用中文给出：1. 改动意图；2. 关键文件和模块；3. 潜在回归风险；4. 建议验证的测试。不要修改任何文件。`;
  const { stdout, stderr } = await execFileAsync('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', '-C', repoPath, prompt], { cwd: repoPath, timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return (stdout || stderr).trim();
});
ipcMain.handle('external:open', (_event, target) => shell.openExternal(target));

app.on('before-quit', () => stopCodexEvidence());

app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() });
