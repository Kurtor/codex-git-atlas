const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;
const COLORS = ['#59a8ff', '#a36aff', '#e1ac32', '#4fc1a2', '#ed6d66', '#7791ad', '#ce7bb6', '#8ea565'];

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
    return { hash, shortHash, refs, subject, author, isoDate, parents: parentsRaw.split(' ').filter(Boolean), additions, deletions, modules, branch, tags, lane: 0, color: COLORS[0] };
  });
  return buildLanes(commits);
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
  return { path: root, name, branch, ahead, behind, dirtyCount: Math.max(0, statusLines.length - 1), commits, refs };
}

function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function saveLastRepo(repoPath) { fs.writeFileSync(settingsPath(), JSON.stringify({ lastRepo: repoPath }), 'utf8'); }
function readLastRepo() { try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')).lastRepo || null; } catch { return null; } }

function createWindow() {
  const rendererErrors = [];
  const win = new BrowserWindow({
    width: 1440, height: 1024, minWidth: 1080, minHeight: 680,
    backgroundColor: '#111315', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#111315', symbolColor: '#9ca3a6', height: 40 },
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
            hasRealHistory: repo.commits.length > 0,
          };
        } catch (error) {
          nativeRepo = { error: error instanceof Error ? error.message : String(error), hasRealHistory: false };
        }
        const checks = await win.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const result = {};
          const search = document.querySelector('.history-toolbar input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(search, '因果'); search.dispatchEvent(new Event('input', { bubbles: true })); await wait(80);
          result.search = document.querySelectorAll('.commit-row').length > 0 && document.querySelectorAll('.commit-row').length < 16;
          setter.call(search, ''); search.dispatchEvent(new Event('input', { bubbles: true })); await wait(80);
          document.querySelectorAll('.mode-tabs button')[1].click(); await wait(80);
          result.causalMode = document.querySelectorAll('.mode-tabs button')[1].classList.contains('active') && document.querySelector('.causal-toggle input').checked;
          document.querySelectorAll('.commit-row')[8].click(); await wait(80);
          result.selection = document.querySelectorAll('.commit-row')[8].classList.contains('selected');
          result.denseRows = document.querySelectorAll('.commit-row').length === 16;
          result.chineseUi = document.body.innerText.includes('提交演化') && document.body.innerText.includes('用 Codex 分析');
          document.querySelectorAll('.mode-tabs button')[0].click(); await wait(80);
          document.querySelectorAll('.commit-row')[5].click(); await wait(120);
          return result;
        })()`);
        fs.writeFileSync(process.env.GIT_ATLAS_SMOKE, JSON.stringify({ nativeRepo, checks, rendererErrors }, null, 2));
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
ipcMain.handle('commit:details', async (_event, repoPath, hash) => {
  const raw = await git(repoPath, ['show', '--no-renames', '--numstat', '--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%P%x1e', hash]);
  const [header, stats = ''] = raw.split('\x1e');
  const [fullHash, shortHash, subject, author, email, isoDate, parents = ''] = header.trim().split('\x1f');
  const files = stats.trim().split(/\r?\n/).filter(Boolean).map((line) => { const [a, d, file] = line.split('\t'); return { file, additions: Number(a) || 0, deletions: Number(d) || 0 } });
  return { fullHash, shortHash, subject, author, email, isoDate, parents: parents.split(' ').filter(Boolean), files };
});
ipcMain.handle('codex:analyze', async (_event, repoPath, hash) => {
  const prompt = `请以只读方式分析 Git 提交 ${hash}。用中文给出：1. 改动意图；2. 关键文件和模块；3. 潜在回归风险；4. 建议验证的测试。不要修改任何文件。`;
  const { stdout, stderr } = await execFileAsync('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', '-C', repoPath, prompt], { cwd: repoPath, timeout: 180000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return (stdout || stderr).trim();
});
ipcMain.handle('external:open', (_event, target) => shell.openExternal(target));

app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() });
