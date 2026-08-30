import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CheckCircle, Clock, Code, FileCode, GitCommit as GitCommitIcon,
  Lightning, Robot, ShieldCheck, TerminalWindow, WarningCircle,
} from '@phosphor-icons/react';
import type { CodexEvidence, CodexEvidenceTask, CodexEvidenceTurn, EvidenceSource, GitCommit, RepositoryData } from './types';

export type AiMode = 'tasks' | 'code' | 'handoff' | 'debt';

export const aiModeCopy = {
  tasks: { title: '任务脉络', short: '目标如何变成代码' },
  code: { title: '代码地图', short: 'AI 改变了什么' },
  handoff: { title: '人机交接', short: '哪些需要人判断' },
  debt: { title: '验证债务', short: '哪些结论还没证据' },
} satisfies Record<AiMode, { title: string; short: string }>;

const sourceCopy: Record<EvidenceSource, string> = {
  'git-evidence': 'Git 实证',
  'codex-event': 'Codex 事件',
  'automatic-association': '自动关联',
  'ai-inference': 'AI 推断',
};

function SourceBadge({ source }: { source: EvidenceSource }) {
  return <span className={`evidence-source source-${source}`}>{sourceCopy[source]}</span>;
}

const timeLabel = (timestamp: number | null | undefined) => timestamp ? new Date(timestamp * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间未知';
const durationLabel = (duration: number | null | undefined) => !duration ? '—' : duration < 1000 ? `${duration}ms` : duration < 60000 ? `${(duration / 1000).toFixed(1)}s` : `${Math.round(duration / 60000)}min`;
const statusLabel = (status: string) => ({ completed: '已完成', idle: '已完成', notLoaded: '本地记录', inProgress: '执行中', active: '执行中', failed: '失败', interrupted: '已中断' }[status] || status);

function EmptyEvidence({ enabled, loading, message, onEnable, onRefresh }: { enabled: boolean; loading: boolean; message?: string | null; onEnable: (enabled: boolean) => void; onRefresh: () => void }) {
  return <section className="ai-empty-state">
    <div className="ai-orbit-mark"><Robot weight="duotone" /><i /><b /></div>
    <small>LOCAL · READ ONLY · OPT-IN</small>
    <h1>{enabled ? '还没有关联到这个仓库的 Codex 任务' : '让 Git 历史恢复“为什么”'}</h1>
    <p>{enabled ? message || 'Git Atlas 只会显示工作目录与当前仓库匹配的本机任务。' : '开启后读取本机 Codex 的用户目标、命令、文件变更与验证结果。不会上传仓库，不展示模型内部推理。'}</p>
    <button type="button" onClick={() => enabled ? onRefresh() : onEnable(true)} disabled={loading}>{loading ? '正在读取证据…' : enabled ? '重新扫描当前仓库' : '开启 AI 证据'}</button>
    <div className="ai-privacy-grid"><span><b>读取</b>目标、命令摘要、文件路径、验证状态</span><span><b>忽略</b>reasoning、原始 diff、完整命令输出</span><span><b>频率</b>仅在开启、切换任务或手动刷新时</span></div>
  </section>;
}

function TaskRail({ evidence, selectedTask, selectedTurn, onTask, onTurn, onDisable }: { evidence: CodexEvidence; selectedTask: CodexEvidenceTask; selectedTurn: CodexEvidenceTurn; onTask: (id: string) => void; onTurn: (id: string) => void; onDisable: () => void }) {
  return <aside className="ai-task-rail">
    <header><span><Robot weight="fill" />Codex 任务</span><b>{evidence.tasks.length}</b></header>
    <div className="ai-task-list">{evidence.tasks.map((task) => <button type="button" key={task.id} className={task.id === selectedTask.id ? 'active' : ''} onClick={() => onTask(task.id)}>
      <i className={`task-status ${task.status}`} /><span><strong>{task.title}</strong><small>{task.branch || '未记录分支'} · {timeLabel(task.updatedAt)}</small></span><em>{task.turns.length || '·'}</em>
    </button>)}</div>
    <div className="ai-turn-heading"><span>任务回合</span><small>{selectedTask.turns.length} 个</small></div>
    <div className="ai-turn-list">{selectedTask.turns.map((turn, index) => <button type="button" key={turn.id} className={turn.id === selectedTurn.id ? 'active' : ''} onClick={() => onTurn(turn.id)}>
      <span>{String(index + 1).padStart(2, '0')}</span><i /><strong>{turn.goal}</strong><small>{turn.files.length} 文件 · {turn.validations.length} 验证</small>
    </button>)}</div>
    <footer><span><i />只读连接</span><button type="button" onClick={onDisable} title="停止读取 Codex 任务证据">关闭 AI 证据</button></footer>
  </aside>;
}

function TaskFlow({ turn }: { turn: CodexEvidenceTurn }) {
  const actions = turn.actions.filter((item) => item.type !== 'file-change').slice(-4);
  const validation = turn.validations.at(-1);
  return <div className="evidence-flow">
    <article className="flow-node goal"><header><span>01</span><b>用户目标</b><SourceBadge source="codex-event" /></header><p>{turn.goal}</p><footer>{timeLabel(turn.startedAt)}</footer></article>
    <ArrowRight className="flow-arrow" />
    <article className="flow-node action"><header><span>02</span><b>AI 行动</b><SourceBadge source="codex-event" /></header>{actions.length ? <div className="flow-actions">{actions.map((action) => <span key={action.id}>{action.type === 'command' ? <TerminalWindow /> : <Lightning />}<code>{action.label}</code><i className={action.status} /></span>)}</div> : <p className="flow-empty">没有可见行动记录</p>}<footer>{turn.actions.length} 个可见动作</footer></article>
    <ArrowRight className="flow-arrow" />
    <article className="flow-node code"><header><span>03</span><b>代码证据</b><SourceBadge source="codex-event" /></header><div className="flow-files">{turn.files.slice(0, 5).map((file) => <span key={`${file.path}-${file.kind}`}><FileCode />{file.path}<em>{file.kind}</em></span>)}{!turn.files.length && <p className="flow-empty">本回合没有文件变更</p>}</div><footer>{turn.files.length} 个文件</footer></article>
    <ArrowRight className="flow-arrow" />
    <article className={`flow-node validate ${validation?.passed ? 'passed' : turn.files.length ? 'missing' : ''}`}><header><span>04</span><b>验证结果</b><SourceBadge source={validation ? 'codex-event' : 'automatic-association'} /></header>{validation ? <><div className="validation-result">{validation.passed ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}<span><strong>{validation.passed ? '验证通过' : '验证失败'}</strong><code>{validation.label}</code></span></div><footer>退出码 {validation.exitCode ?? '未知'}</footer></> : <><p className="flow-empty">没有找到与本次改动关联的测试或构建记录</p><footer>需要人工确认</footer></>}</article>
  </div>;
}

function CodeMap({ task, turn }: { task: CodexEvidenceTask; turn: CodexEvidenceTurn }) {
  const modules = useMemo(() => {
    const values = new Map<string, string[]>();
    task.files.forEach((file) => { const name = file.split(/[\\/]/)[0] || '根目录'; values.set(name, [...(values.get(name) || []), file]) });
    return [...values.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [task.files]);
  return <div className="code-map-view">
    <header><span><Code weight="duotone" />任务触达地图</span><p>以 Codex 文件变更为事实边界；当前版本不臆测函数调用关系。</p><SourceBadge source="codex-event" /></header>
    <div className="module-map">{modules.slice(0, 8).map(([module, files], index) => <section key={module} style={{ '--module-index': index } as React.CSSProperties}>
      <div className="module-node"><b>{module}</b><span>{files.length} 文件</span></div><i className="module-link" /><div className="module-files">{files.slice(0, 6).map((file) => <span key={file} className={turn.files.some((entry) => entry.path === file) ? 'current' : ''}><FileCode />{file.split(/[\\/]/).at(-1)}</span>)}{files.length > 6 && <small>+{files.length - 6}</small>}</div>
    </section>)}</div>
    {!modules.length && <div className="ai-inline-empty">这个任务还没有可见的文件变更证据。</div>}
  </div>;
}

function HandoffView({ task, commits }: { task: CodexEvidenceTask; commits: GitCommit[] }) {
  const completed = task.turns.filter((turn) => turn.status === 'completed');
  const unresolved = task.verificationDebt.filter((debt) => debt.severity !== 'clear');
  return <div className="handoff-view">
    <section><header><Robot weight="fill" /><span><b>Codex 已完成</b><small>{completed.length} 个回合</small></span><SourceBadge source="codex-event" /></header><div>{completed.slice(-5).reverse().map((turn) => <article key={turn.id}><CheckCircle /><span><strong>{turn.goal}</strong><small>{turn.files.length} 文件 · {turn.actions.length} 个动作</small></span></article>)}</div></section>
    <section><header><GitCommitIcon weight="fill" /><span><b>Git 已落盘</b><small>{commits.length} 个候选提交</small></span><SourceBadge source="automatic-association" /></header><div>{commits.slice(0, 5).map((commit) => <article key={commit.hash}><i style={{ background: commit.color }} /><span><strong>{commit.subject}</strong><small>{commit.shortHash} · {commit.author}</small></span></article>)}{!commits.length && <p>当前任务时间窗内没有找到提交。</p>}</div></section>
    <section className="review-column"><header><ShieldCheck weight="fill" /><span><b>等待人类判断</b><small>{unresolved.length} 项</small></span><SourceBadge source="automatic-association" /></header><div>{unresolved.slice(0, 5).map((debt) => <article key={debt.id}><WarningCircle /><span><strong>{debt.title}</strong><small>{debt.detail}</small></span></article>)}{!unresolved.length && <p>没有观察到明确债务；这不等于已完成代码审查。</p>}</div></section>
  </div>;
}

function DebtView({ task }: { task: CodexEvidenceTask }) {
  const validations = task.turns.flatMap((turn) => turn.validations.map((validation) => ({ ...validation, turn: turn.goal })));
  const passed = validations.filter((item) => item.passed).length;
  return <div className="debt-view"><header><div><WarningCircle weight="duotone" /><span><b>验证债务清单</b><small>不是“风险分”，每一项都能回到证据</small></span></div><div className="debt-totals"><span><b>{task.verificationDebt.filter((item) => item.severity === 'high').length}</b>阻断</span><span><b>{validations.length}</b>验证</span><span><b>{passed}</b>通过</span></div></header><div className="debt-columns"><section className="debt-list">{task.verificationDebt.map((debt, index) => <article key={debt.id} className={debt.severity}><em>{String(index + 1).padStart(2, '0')}</em><i /><span><strong>{debt.title}</strong><p>{debt.detail}</p></span><SourceBadge source={debt.source} /></article>)}</section><section className="validation-ledger"><header><TerminalWindow /><span><b>验证账本</b><small>最近 {Math.min(8, validations.length)} 条执行证据</small></span><SourceBadge source="codex-event" /></header><div>{validations.slice(-8).reverse().map((item, index) => <article key={`${item.id}-${index}`}><i className={item.passed ? 'passed' : 'failed'} /> <span><code>{item.label}</code><small>{item.turn}</small></span><b>{item.passed ? '通过' : '失败'}</b></article>)}{!validations.length && <p>没有识别到测试、构建、类型检查或 lint 命令。</p>}</div></section></div><footer><ShieldCheck /><span><b>判定边界</b>只检查可观察到的命令、退出状态、文件触达和任务状态；没有证据时会明确写“未知”。</span></footer></div>;
}

function Dossier({ task, turn }: { task: CodexEvidenceTask; turn: CodexEvidenceTurn }) {
  const changed = task.turns.reduce((sum, item) => sum + item.files.length, 0);
  const validationCount = task.turns.reduce((sum, item) => sum + item.validations.length, 0);
  return <aside className="ai-dossier"><header><small>AI 改动档案</small><h2>{task.title}</h2><span className={`task-state ${task.status}`}>{statusLabel(task.status)}</span></header>
    <section className="dossier-metrics"><span><b>{task.turns.length}</b><small>任务回合</small></span><span><b>{task.files.length}</b><small>触达文件</small></span><span><b>{validationCount}</b><small>验证记录</small></span><span><b>{changed}</b><small>文件触达次数</small></span></section>
    <section><label>当前目标 <SourceBadge source="codex-event" /></label><p>{turn.goal}</p></section>
    <section><label>可见结果 <SourceBadge source="codex-event" /></label><p>{turn.outcome || '本回合没有可见的最终回复。'}</p></section>
    <section className="dossier-provenance"><label>关联依据</label><span><b>工作目录</b>{task.match === 'repository' ? '仓库根目录完全匹配' : task.match === 'repository-child' ? '任务位于仓库子目录' : '任务工作区包含当前仓库'}</span><span><b>分支</b>{task.branch || '未记录'}</span><span><b>起点 SHA</b>{task.sha?.slice(0, 10) || '未记录'}</span></section>
    <footer><span><i className="git" />Git 实证</span><span><i className="codex" />Codex 事件</span><span><i className="linked" />自动关联</span></footer>
  </aside>;
}

function GitEvidenceStrip({ task, commits }: { task: CodexEvidenceTask; commits: GitCommit[] }) {
  return <footer className="ai-git-strip"><header><span><GitCommitIcon weight="fill" />Git 证据带</span><SourceBadge source="automatic-association" /><small>任务时间窗 ±10 分钟 · {task.branch || '分支未知'}</small></header><div>{commits.slice(0, 9).map((commit) => <article key={commit.hash}><i style={{ borderColor: commit.color }} /><code>{commit.shortHash}</code><span>{commit.subject}</span>{commit.operations[0] && <em>{commit.operations[0].kind === 'merge' ? 'MERGE' : 'REBASE'}</em>}<time>{new Date(commit.isoDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</time></article>)}{!commits.length && <p>尚未在任务时间窗内找到可关联提交。任务证据仍可独立阅读。</p>}</div></footer>;
}

export default function AiWorkspace({ mode, data, enabled, evidence, loading, onEnable, onRefresh, onTask }: { mode: AiMode; data: RepositoryData; enabled: boolean; evidence: CodexEvidence | null; loading: boolean; onEnable: (enabled: boolean) => void; onRefresh: () => void; onTask: (id: string) => void }) {
  const task = evidence?.selectedTask || null;
  const [selectedTurnId, setSelectedTurnId] = useState('');
  useEffect(() => { if (task?.turns.length) setSelectedTurnId(task.turns.at(-1)!.id) }, [task?.id]);
  const turn = task?.turns.find((item) => item.id === selectedTurnId) || task?.turns.at(-1) || null;
  const associatedCommits = useMemo(() => {
    if (!task) return [];
    const start = task.createdAt * 1000 - 10 * 60 * 1000; const end = task.updatedAt * 1000 + 10 * 60 * 1000;
    return data.commits.filter((commit) => { const time = new Date(commit.isoDate).getTime(); return (time >= start && time <= end) || commit.hash === task.sha }).slice(0, 20);
  }, [task, data.commits]);
  if (!enabled || !task || !turn) return <div className="ai-workspace ai-workspace-empty"><EmptyEvidence enabled={enabled} loading={loading} message={evidence?.message} onEnable={onEnable} onRefresh={onRefresh} /></div>;
  return <div className={`ai-workspace ai-mode-${mode}`}>
    <TaskRail evidence={evidence!} selectedTask={task} selectedTurn={turn} onTask={onTask} onTurn={setSelectedTurnId} onDisable={() => onEnable(false)} />
    <main className="ai-evidence-canvas"><header><div><small>当前阅读单位</small><h1>{mode === 'tasks' ? turn.goal : aiModeCopy[mode].title}</h1></div><span><Clock />{timeLabel(turn.startedAt)} · {durationLabel(turn.durationMs)}</span></header>
      {mode === 'tasks' && <TaskFlow turn={turn} />}
      {mode === 'code' && <CodeMap task={task} turn={turn} />}
      {mode === 'handoff' && <HandoffView task={task} commits={associatedCommits} />}
      {mode === 'debt' && <DebtView task={task} />}
    </main>
    <Dossier task={task} turn={turn} />
    <GitEvidenceStrip task={task} commits={associatedCommits} />
  </div>;
}
