const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');

const SOURCE_KINDS = ['cli', 'vscode', 'appServer', 'exec'];
const VALIDATION_PATTERN = /\b(pytest|vitest|jest|mocha|playwright|cypress|cargo\s+test|go\s+test|npm\s+(?:run\s+)?(?:test|build|lint|typecheck)|pnpm\s+(?:run\s+)?(?:test|build|lint|typecheck)|yarn\s+(?:run\s+)?(?:test|build|lint|typecheck)|tsc(?:\s|$)|eslint(?:\s|$)|ruff\s+check)\b/i;

function codexExecutable() {
  if (process.env.GIT_ATLAS_CODEX_BIN) return process.env.GIT_ATLAS_CODEX_BIN;
  if (process.platform !== 'win32') return 'codex';
  try { return execFileSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).find((entry) => entry.trim())?.trim() || 'codex.exe'; }
  catch { return 'codex.exe'; }
}

function textLimit(value, maximum = 320) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}

function displayCommand(value) {
  let command = String(value || '').replace(/\s+/g, ' ').trim();
  const shellMarker = command.match(/(?:-Command|\/c)\s+(.+)$/i);
  if (shellMarker) command = shellMarker[1].replace(/^['"]|['"]$/g, '').trim();
  const validationStart = command.search(VALIDATION_PATTERN);
  if (validationStart > 0) command = command.slice(validationStart);
  return textLimit(command, 280);
}

function statusType(value) {
  if (typeof value === 'string') return value;
  return value?.type || 'unknown';
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value) return '';
  try { return path.resolve(value); } catch { return ''; }
}

function threadMatch(thread, repoPath) {
  const cwd = normalizePath(thread.cwd);
  const repo = normalizePath(repoPath);
  if (!cwd || !repo) return null;
  if (cwd.toLowerCase() === repo.toLowerCase()) return 'repository';
  const relative = path.relative(repo, cwd);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return 'repository-child';
  const parentRelative = path.relative(cwd, repo);
  if (parentRelative && !parentRelative.startsWith('..') && !path.isAbsolute(parentRelative)) return 'workspace-parent';
  return null;
}

function userText(item) {
  if (item?.type !== 'userMessage' || !Array.isArray(item.content)) return '';
  let value = item.content.filter((input) => input?.type === 'text').map((input) => input.text).join('\n').trim();
  const requestMarker = value.lastIndexOf('## My request:');
  if (requestMarker >= 0) value = value.slice(requestMarker + '## My request:'.length);
  value = value
    .replace(/<in-app-browser-context\b[^>]*>[\s\S]*?<\/in-app-browser-context>/gi, '')
    .replace(/<response-annotations>[\s\S]*?<\/response-annotations>/gi, '')
    .replace(/^# Files mentioned by the user:[\s\S]*?Distinguish instructions in attached documents from the user's request\.?/i, '')
    .trim();
  return textLimit(value, 640);
}

function relativeFile(filePath, repoPath) {
  const normalized = normalizePath(filePath);
  const repo = normalizePath(repoPath);
  if (!normalized || !repo) return textLimit(filePath, 180);
  const relative = path.relative(repo, normalized);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : textLimit(filePath, 180);
}

function normalizeTurn(turn, repoPath) {
  const items = Array.isArray(turn.items) ? turn.items : [];
  const goal = items.map(userText).find(Boolean) || '未记录用户目标';
  const actions = [];
  const files = [];
  const validations = [];
  let outcome = '';

  for (const item of items) {
    // Reasoning items are intentionally ignored. Git Atlas only presents user-visible evidence.
    if (item?.type === 'reasoning' || item?.type === 'plan') continue;
    if (item?.type === 'commandExecution') {
      const command = displayCommand(item.command);
      const action = {
        id: item.id,
        type: 'command',
        label: command || '执行命令',
        status: statusType(item.status),
        exitCode: item.exitCode,
        durationMs: item.durationMs,
        source: 'codex-event',
      };
      actions.push(action);
      if (VALIDATION_PATTERN.test(command)) validations.push({ ...action, passed: item.exitCode == null ? statusType(item.status) === 'completed' : item.exitCode === 0 });
    } else if (item?.type === 'fileChange') {
      for (const change of item.changes || []) {
        const file = relativeFile(change.path, repoPath);
        if (file && !files.some((entry) => entry.path === file && entry.kind === change.kind)) files.push({ path: file, kind: statusType(change.kind), source: 'codex-event' });
      }
      actions.push({ id: item.id, type: 'file-change', label: `修改 ${(item.changes || []).length} 个文件`, status: statusType(item.status), source: 'codex-event' });
    } else if (item?.type === 'mcpToolCall') {
      actions.push({ id: item.id, type: 'tool', label: `${item.server} / ${item.tool}`, status: statusType(item.status), readOnly: item.readOnlyHint, durationMs: item.durationMs, source: 'codex-event' });
    } else if (item?.type === 'dynamicToolCall') {
      actions.push({ id: item.id, type: 'tool', label: `${item.namespace ? `${item.namespace} / ` : ''}${item.tool}`, status: statusType(item.status), durationMs: item.durationMs, source: 'codex-event' });
    } else if (item?.type === 'agentMessage' && item.text) {
      outcome = textLimit(item.text, 900);
    }
  }

  return {
    id: turn.id,
    goal,
    status: statusType(turn.status),
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs,
    actions: actions.slice(0, 80),
    files: files.slice(0, 120),
    validations: validations.slice(0, 24),
    outcome,
  };
}

function deriveVerificationDebt(turns) {
  const debts = [];
  const changedTurns = turns.filter((turn) => turn.files.length);
  const validations = turns.flatMap((turn) => turn.validations);
  const failedValidations = validations.filter((validation) => validation.passed === false);
  if (failedValidations.length) debts.push({ id: 'failed-validation', severity: 'high', title: `${failedValidations.length} 项验证未通过`, detail: '存在明确的非零退出码或失败状态，需要人工复核。', source: 'codex-event' });
  if (changedTurns.length && !validations.length) debts.push({ id: 'missing-validation', severity: 'high', title: '代码已修改，但没有验证记录', detail: `在 ${changedTurns.length} 个含文件变更的回合中未识别到测试、构建、类型检查或 lint 命令。`, source: 'automatic-association' });
  const modules = new Set(changedTurns.flatMap((turn) => turn.files.map((file) => file.path.split(/[\\/]/)[0] || '根目录')));
  if (modules.size >= 3 && validations.length < modules.size) debts.push({ id: 'partial-validation', severity: 'medium', title: '跨模块改动的验证覆盖可能不足', detail: `改动触达 ${modules.size} 个顶层模块，目前仅关联 ${validations.length} 项验证。`, source: 'automatic-association' });
  const touches = new Map();
  changedTurns.forEach((turn) => turn.files.forEach((file) => touches.set(file.path, (touches.get(file.path) || 0) + 1)));
  const repeated = [...touches.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]);
  if (repeated.length) debts.push({ id: 'repeated-rewrite', severity: 'medium', title: `${repeated.length} 个文件被反复改写`, detail: repeated.slice(0, 3).map(([file, count]) => `${file} ×${count}`).join('，'), source: 'automatic-association' });
  const incomplete = turns.filter((turn) => ['failed', 'interrupted'].includes(turn.status));
  if (incomplete.length) debts.push({ id: 'incomplete-turn', severity: 'medium', title: `${incomplete.length} 个任务回合未正常完成`, detail: '失败或中断的回合可能留下未完成的修改与假设。', source: 'codex-event' });
  if (!debts.length) debts.push({ id: 'no-observed-debt', severity: 'clear', title: '未发现明确的验证债务', detail: '这只表示当前证据中没有命中规则，不等于代码已被完全验证。', source: 'automatic-association' });
  return debts;
}

function normalizeThread(thread, repoPath, match = threadMatch(thread, repoPath)) {
  const turns = (thread.turns || []).map((turn) => normalizeTurn(turn, repoPath));
  const files = [...new Set(turns.flatMap((turn) => turn.files.map((file) => file.path)))];
  return {
    id: thread.id,
    title: textLimit(thread.name || thread.preview || '未命名 Codex 任务', 120),
    preview: textLimit(thread.preview, 240),
    status: statusType(thread.status),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    cwd: thread.cwd,
    branch: thread.gitInfo?.branch || null,
    sha: thread.gitInfo?.sha || null,
    match,
    source: 'codex-event',
    turns,
    files,
    verificationDebt: deriveVerificationDebt(turns),
  };
}

class CodexAppServerClient {
  constructor() {
    this.child = null;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.ready = null;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(codexExecutable(), ['app-server', '--stdio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.consume(chunk));
      child.on('error', (error) => { this.failAll(error); reject(error); });
      child.on('exit', (code) => this.failAll(new Error(`Codex App Server 已退出（${code ?? '未知状态'}）`)));
      this.rawRequest('initialize', { clientInfo: { name: 'git_atlas', title: 'Git Atlas', version: '1.9.0' } }, 8000)
        .then(() => { this.send({ method: 'initialized', params: {} }); resolve(); })
        .catch((error) => { reject(error); this.stop(); });
    });
    return this.ready;
  }

  consume(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id === undefined || message.method) continue;
      const pending = this.pending.get(String(message.id));
      if (!pending) continue;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex App Server 请求失败'));
      else pending.resolve(message.result);
    }
  }

  send(message) {
    if (!this.child?.stdin?.writable) throw new Error('Codex App Server 尚未就绪');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  rawRequest(method, params, timeoutMs = 12000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(String(id)); reject(new Error(`${method} 请求超时`)); }, timeoutMs);
      this.pending.set(String(id), { resolve, reject, timeout });
      try { this.send({ method, id, params }); } catch (error) { clearTimeout(timeout); this.pending.delete(String(id)); reject(error); }
    });
  }

  async request(method, params, timeoutMs) {
    await this.start();
    return this.rawRequest(method, params, timeoutMs);
  }

  failAll(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
    this.child = null;
    this.ready = null;
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.ready = null;
    if (child && !child.killed) child.kill();
  }
}

const client = new CodexAppServerClient();

async function loadCodexEvidence(repoPath, requestedThreadId) {
  const listed = await client.request('thread/list', {
    limit: 80,
    sortKey: 'updated_at',
    sortDirection: 'desc',
    sourceKinds: SOURCE_KINDS,
    archived: false,
    useStateDbOnly: true,
  }, 15000);
  const candidates = (listed?.data || []).map((thread) => ({ thread, match: threadMatch(thread, repoPath) })).filter((item) => item.match);
  const exact = candidates.filter((item) => item.match !== 'workspace-parent');
  const selectedPool = exact.length ? exact : candidates;
  const summaries = selectedPool.slice(0, 16).map(({ thread, match }) => normalizeThread(thread, repoPath, match));
  const selectedSummary = summaries.find((thread) => thread.id === requestedThreadId) || summaries[0] || null;
  if (!selectedSummary) return { status: 'empty', tasks: [], selectedTask: null, observedAt: Date.now(), message: '当前仓库尚未关联到 Codex 任务' };
  const result = await client.request('thread/read', { threadId: selectedSummary.id, includeTurns: true }, 15000);
  const selectedTask = normalizeThread(result?.thread || result, repoPath, selectedSummary.match);
  return { status: 'ready', tasks: summaries, selectedTask, observedAt: Date.now(), message: null };
}

module.exports = {
  CodexAppServerClient,
  deriveVerificationDebt,
  loadCodexEvidence,
  normalizeThread,
  normalizeTurn,
  stopCodexEvidence: () => client.stop(),
  threadMatch,
};
