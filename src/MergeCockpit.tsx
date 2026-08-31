import { useEffect, useMemo, useState } from 'react';
import {
  ArrowClockwise, ArrowRight, Brain, Check, CheckCircle, ClipboardText, Code,
  GitBranch, GitCommit, GitMerge, GitPullRequest, ShieldCheck, TerminalWindow,
  Warning, WarningCircle, X,
} from '@phosphor-icons/react';
import type { CodexEvidence, MergePreflight, RepositoryData } from './types';

type GateState = 'pass' | 'warn' | 'block' | 'unknown';
type Gate = { id: string; state: GateState; title: string; detail: string; evidence: string };

const isMainline = (branch: string) => /^(main|master|develop|origin\/(main|master|develop))$/i.test(branch);
const shortNumber = (value: number) => value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);

function chooseSource(data: RepositoryData, preferred?: string) {
  const local = data.refs.filter((ref) => ref.type === 'local').map((ref) => ref.short);
  if (preferred && preferred !== '全部' && local.includes(preferred)) return preferred;
  if (!isMainline(data.branch)) return data.branch;
  return local.find((branch) => !isMainline(branch)) || data.branch;
}

function chooseTarget(data: RepositoryData, source: string) {
  const refs = data.refs.filter((ref) => ref.type !== 'tag').map((ref) => ref.short);
  const localMainline = refs.find((branch) => branch !== source && /^(main|master|develop)$/i.test(branch));
  if (localMainline) return localMainline;
  const remoteMainline = refs.find((branch) => branch !== source && /^origin\/(main|master|develop)$/i.test(branch));
  return remoteMainline || refs.find((branch) => branch !== source) || source;
}

function demoPreflight(data: RepositoryData, source: string, target: string): MergePreflight {
  const commits = data.commits.filter((commit) => commit.branch === source).slice(0, 8);
  const picked = commits.length ? commits : data.commits.slice(0, 4);
  const files = [
    { path: 'src/GraphCanvas.tsx', status: 'M', module: 'src', additions: 118, deletions: 21 },
    { path: 'src/analytics.ts', status: 'M', module: 'src', additions: 63, deletions: 8 },
    { path: 'electron/main.cjs', status: 'M', module: 'electron', additions: 34, deletions: 5 },
    { path: 'scripts/test-branch-operations.mjs', status: 'A', module: 'scripts', additions: 41, deletions: 0 },
    { path: 'README.md', status: 'M', module: '根目录', additions: 17, deletions: 2 },
  ];
  return {
    source, target, currentBranch: data.branch,
    mergeBase: { hash: data.commits[9]?.hash || data.commits.at(-1)?.hash || '', shortHash: data.commits[9]?.shortHash || '2b7e6c1', subject: data.commits[9]?.subject || '共同祖先' },
    relation: 'diverged', ahead: Math.max(3, picked.length), behind: 2,
    workingTreeClean: data.dirtyCount === 0, dirtyCount: data.dirtyCount,
    virtualMerge: { state: 'clean', conflicts: [], messages: [] },
    commits: picked.map(({ hash, shortHash, subject, author, isoDate }) => ({ hash, shortHash, subject, author, isoDate })),
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    modules: [{ name: 'src', churn: 210 }, { name: 'electron', churn: 39 }, { name: 'scripts', churn: 41 }, { name: '根目录', churn: 19 }],
    observedAt: Date.now(),
  };
}

function buildGates(result: MergePreflight, evidence: CodexEvidence | null): Gate[] {
  const task = evidence?.selectedTask;
  const validations = task?.turns.flatMap((turn) => turn.validations) || [];
  const failed = validations.filter((validation) => !validation.passed);
  const unresolvedDebt = task?.verificationDebt.filter((debt) => debt.severity !== 'clear') || [];
  return [
    {
      id: 'merge', state: result.virtualMerge.state === 'clean' ? 'pass' : result.virtualMerge.state === 'conflicts' ? 'block' : 'unknown',
      title: result.virtualMerge.state === 'clean' ? '虚拟合并可完成' : result.virtualMerge.state === 'conflicts' ? `${result.virtualMerge.conflicts.length || 1} 处冲突阻断` : '虚拟合并不可用',
      detail: result.virtualMerge.state === 'clean' ? 'Git 已在内存路径中完成三方合并，不改分支与工作区。' : result.virtualMerge.conflicts.slice(0, 3).join('、') || result.virtualMerge.messages[0] || '需要在实际合并前人工确认。',
      evidence: 'Git merge-tree',
    },
    {
      id: 'distance', state: result.behind === 0 ? 'pass' : result.behind > 5 ? 'block' : 'warn',
      title: result.behind === 0 ? '基线保持最新' : `目标分支领先 ${result.behind} 个提交`,
      detail: result.behind === 0 ? `源分支包含 ${result.ahead} 个待合并提交。` : '建议先吸收目标分支变化，再重新运行推演。',
      evidence: 'Git rev-list',
    },
    {
      id: 'workspace', state: result.workingTreeClean ? 'pass' : result.ahead === 0 ? 'warn' : 'block',
      title: result.workingTreeClean ? '工作区干净' : `${result.dirtyCount} 项改动尚未提交`,
      detail: result.workingTreeClean ? '推演结果没有被本地未提交内容干扰。' : '未提交内容不在分支差异中，当前结论可能遗漏真实改动。',
      evidence: 'Git status',
    },
    {
      id: 'validation', state: failed.length ? 'block' : validations.length ? 'pass' : 'unknown',
      title: failed.length ? `${failed.length} 项验证失败` : validations.length ? `${validations.length} 项验证有执行证据` : '缺少可关联的验证记录',
      detail: failed.length ? failed.slice(0, 2).map((item) => item.label).join('、') : validations.length ? '来自当前仓库关联 Codex 任务的命令退出状态。' : '可以继续人工复核，但不能据此声称改动已经验证。',
      evidence: validations.length ? 'Codex 事件' : '证据未知',
    },
    {
      id: 'intent', state: task ? unresolvedDebt.length ? 'warn' : 'pass' : 'unknown',
      title: task ? unresolvedDebt.length ? `${unresolvedDebt.length} 项任务债务待确认` : '任务目标与改动已关联' : '没有关联 Codex 任务',
      detail: task ? task.title : 'Git 推演仍然有效，但缺少“为什么改”的任务上下文。',
      evidence: task ? '自动关联' : '证据未知',
    },
  ];
}

function GateIcon({ state }: { state: GateState }) {
  if (state === 'pass') return <CheckCircle weight="fill" />;
  if (state === 'block') return <WarningCircle weight="fill" />;
  if (state === 'warn') return <Warning weight="fill" />;
  return <ShieldCheck />;
}

export default function MergeCockpit({
  data, preferredSource, isDemo, evidence, onClose, onOpenGit, onEnableEvidence,
}: {
  data: RepositoryData; preferredSource: string; isDemo: boolean; evidence: CodexEvidence | null;
  onClose: () => void; onOpenGit: () => void; onEnableEvidence: () => void;
}) {
  const refs = useMemo(() => data.refs.filter((ref) => ref.type !== 'tag').map((ref) => ref.short), [data.refs]);
  const initialSource = useMemo(() => chooseSource(data, preferredSource), [data, preferredSource]);
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(() => chooseTarget(data, initialSource));
  const [result, setResult] = useState<MergePreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (nextSource = source, nextTarget = target) => {
    if (!nextTarget || nextSource === nextTarget) { setError('请选择不同的源分支与目标分支'); return }
    setLoading(true); setError(''); setReview('');
    try {
      setResult(isDemo || !window.gitAtlas ? demoPreflight(data, nextSource, nextTarget) : await window.gitAtlas.runMergePreflight(data.path, nextSource, nextTarget));
    } catch (cause) { setResult(null); setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  };

  useEffect(() => { void run(initialSource, chooseTarget(data, initialSource)) }, [data.path]);

  const gates = result ? buildGates(result, evidence) : [];
  const blockers = gates.filter((gate) => gate.state === 'block');
  const warnings = gates.filter((gate) => gate.state === 'warn' || gate.state === 'unknown');
  const verdict = result?.ahead === 0 ? 'noop' : blockers.length ? 'blocked' : warnings.length ? 'hold' : 'ready';
  const task = evidence?.selectedTask;
  const maxModule = result?.modules[0]?.churn || 1;

  const requestReview = async () => {
    if (!result) return;
    setReviewing(true); setReview('');
    try {
      if (isDemo || !window.gitAtlas) setReview('AI 推断：该分支主要改变图谱渲染与交互命中路径。合并前应优先复核 GraphCanvas 的拓扑稳定性，并运行分支操作与渲染性能测试。最小回滚边界是本次分支的独立提交范围。');
      else setReview(await window.gitAtlas.reviewMergeWithCodex(data.path, result.source, result.target));
    } catch (cause) { setReview(`复核失败：${cause instanceof Error ? cause.message : String(cause)}`) }
    finally { setReviewing(false) }
  };

  const copyContract = async () => {
    if (!result) return;
    const text = [`# 合并检查单`, `${result.source} -> ${result.target}`, `Merge Base: ${result.mergeBase.shortHash} ${result.mergeBase.subject}`, `距离: +${result.ahead} / -${result.behind}`, `虚拟合并: ${result.virtualMerge.state}`, `工作区: ${result.workingTreeClean ? '干净' : `${result.dirtyCount} 项未提交`}`, `变更: ${result.files.length} 文件 +${result.additions}/-${result.deletions}`, '', ...gates.map((gate) => `- [${gate.state === 'pass' ? 'x' : ' '}] ${gate.title}: ${gate.detail}`)].join('\n');
    await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  return <section className="merge-cockpit" data-merge-cockpit data-verdict={verdict}>
    <header className="merge-cockpit-header">
      <div className="merge-cockpit-title"><GitPullRequest weight="duotone" /><span><small>GIT MERGE SIMULATION</small><h1>合并推演舱</h1><p>在不切换分支、不修改工作区的前提下，预演一次真实合并。</p></span></div>
      <div className="merge-route-control">
        <label><small>源分支</small><span><GitBranch /><select value={source} onChange={(event) => { const next = event.target.value; setSource(next); if (next === target) setTarget(chooseTarget(data, next)) }}>{refs.map((ref) => <option key={ref}>{ref}</option>)}</select></span></label>
        <ArrowRight />
        <label><small>目标分支</small><span><GitMerge /><select value={target} onChange={(event) => setTarget(event.target.value)}>{refs.filter((ref) => ref !== source).map((ref) => <option key={ref}>{ref}</option>)}</select></span></label>
        <button type="button" onClick={() => run()} disabled={loading || source === target}><ArrowClockwise className={loading ? 'spin' : ''} />{loading ? '推演中' : '重新推演'}</button>
      </div>
      <button type="button" className="merge-cockpit-close" onClick={onClose} aria-label="关闭合并推演"><X /></button>
    </header>

    {error && <div className="merge-cockpit-error"><WarningCircle />{error}</div>}
    {!result && !error && <div className="merge-cockpit-loading"><GitMerge /><strong>正在建立虚拟合并树</strong><small>读取 Merge Base、提交距离、文件差异与冲突信息</small></div>}
    {result && <div className="merge-cockpit-body">
      <section className="merge-verdict">
        <div className={`merge-verdict-mark ${verdict}`}><span>{verdict === 'noop' ? 'SYNCED' : verdict === 'ready' ? 'READY' : verdict === 'blocked' ? 'BLOCKED' : 'REVIEW'}</span><b>{verdict === 'noop' ? '分支无需合并' : verdict === 'ready' ? '可进入合并' : verdict === 'blocked' ? '存在硬阻断' : '需要人工复核'}</b></div>
        <div className="merge-topology" aria-label="分支合并关系">
          <span className="source"><small>SOURCE</small><b>{result.source}</b><em>{result.ahead} 个独有提交</em></span>
          <i className="source-line"><b /></i>
          <span className="base"><small>MERGE BASE</small><code>{result.mergeBase.shortHash}</code><em>{result.mergeBase.subject}</em></span>
          <i className="target-line"><b /></i>
          <span className="target"><small>TARGET</small><b>{result.target}</b><em>{result.behind} 个新提交</em></span>
          <span className={`virtual-result ${result.virtualMerge.state}`}><GitMerge weight="fill" />{result.virtualMerge.state === 'clean' ? '虚拟合并成功' : result.virtualMerge.state === 'conflicts' ? '检测到冲突' : '无法推演'}</span>
        </div>
        <div className="merge-metrics"><span><b>{result.commits.length}</b><small>待合并提交</small></span><span><b>{result.files.length}</b><small>变更文件</small></span><span className="add"><b>+{shortNumber(result.additions)}</b><small>新增</small></span><span className="del"><b>−{shortNumber(result.deletions)}</b><small>删除</small></span></div>
      </section>

      <section className="merge-gates">
        <header><span><ShieldCheck />合并闸门</span><small>{gates.filter((gate) => gate.state === 'pass').length}/{gates.length} 已通过</small></header>
        <div>{gates.map((gate) => <article key={gate.id} className={gate.state}><GateIcon state={gate.state} /><span><strong>{gate.title}</strong><p>{gate.detail}</p></span><em>{gate.evidence}</em></article>)}</div>
      </section>

      <section className="merge-scope">
        <header><span><Code />变更雷达</span><small>相对 Merge Base</small></header>
        {result.files.length ? <><div className="merge-module-radar">{result.modules.slice(0, 5).map((module) => <span key={module.name}><b>{module.name}</b><i><em style={{ width: `${Math.max(8, module.churn / maxModule * 100)}%` }} /></i><small>{module.churn}</small></span>)}</div>
        <div className="merge-file-list">{result.files.slice(0, 8).map((file) => <span key={file.path}><em className={`status-${file.status.toLowerCase()}`}>{file.status}</em><code>{file.path}</code><b>+{file.additions}</b><i>−{file.deletions}</i></span>)}{result.files.length > 8 && <small>另有 {result.files.length - 8} 个文件包含在检查单中</small>}</div></> : <div className="merge-empty-scope"><CheckCircle weight="duotone" /><strong>分支内容完全一致</strong><p>源分支相对 Merge Base 没有文件变化，也没有待合并提交。</p><span><code>{result.source}</code><Check /><code>{result.target}</code></span></div>}
      </section>

      <section className="merge-ai-brief">
        <header><span><Brain />任务与代码契约</span><small>{task ? 'Codex 事件 + Git 实证' : '仅 Git 实证'}</small></header>
        {task ? <><div className="merge-task-goal"><small>关联任务</small><strong>{task.title}</strong><p>{task.turns[0]?.goal || task.preview}</p></div><div className="merge-task-stats"><span><b>{task.turns.length}</b><small>任务轮次</small></span><span><b>{task.files.length}</b><small>触达文件</small></span><span><b>{task.turns.flatMap((turn) => turn.validations).length}</b><small>验证记录</small></span></div></> : <div className="merge-no-task"><Brain /><strong>缺少任务上下文</strong><p>仍可依靠 Git 完成推演；开启证据后可补上目标、命令与验证链路。</p><button type="button" onClick={onEnableEvidence}>开启 AI 证据</button></div>}
        {review && <div className="merge-review-result"><small>CODEX READ-ONLY REVIEW</small><p>{review}</p></div>}
        <div className="merge-ai-actions"><button type="button" onClick={requestReview} disabled={reviewing}><Brain />{reviewing ? 'Codex 正在复核' : '让 Codex 复核分支'}</button><button type="button" onClick={copyContract}><ClipboardText />{copied ? '已复制' : '复制合并检查单'}</button></div>
      </section>

      <section className="merge-commit-flight">
        <header><span><GitCommit />待合并提交序列</span><small>{result.source} → {result.target}</small></header>
        <div>{result.commits.slice(0, 10).map((commit, index) => <article key={commit.hash}><em>{String(index + 1).padStart(2, '0')}</em><i /><code>{commit.shortHash}</code><span><strong>{commit.subject}</strong><small>{commit.author}</small></span></article>)}{!result.commits.length && <p>两个分支目前没有待合并提交。</p>}</div>
      </section>

      <footer className="merge-cockpit-footer"><span><Check />只读推演不会 checkout、merge 或 rebase，也不会移动任何 Git 引用。</span><div><button type="button" onClick={copyContract}><ClipboardText />导出检查单</button><button type="button" onClick={onOpenGit}><TerminalWindow />打开 Git 操作</button></div></footer>
    </div>}
  </section>;
}
