import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, ArrowsClockwise, BracketsCurly, CaretDown, ChartLineUp, CheckCircle,
  CirclesThreePlus, Code, GitBranch, GitCommit as GitCommitIcon,
  Folders, GitMerge, MagnifyingGlass, Minus, Plus, Robot, SidebarSimple,
  Tag, TerminalWindow, Warning, X,
} from '@phosphor-icons/react';
import GraphCanvas, { graphHeight } from './GraphCanvas';
import { collectRelations, commitRiskScore, riskLevel, type AppMode } from './analytics';
import { demoRepository } from './demo';
import { ModeWorkspace, ScopeDossier, modeCopy } from './ModeWorkspace';
import GitCommandDock from './GitCommandDock';
import RepositoryBrowser from './RepositoryBrowser';
import AiWorkspace, { aiModeCopy, type AiMode } from './AiWorkspace';
import type { CodexEvidence, CodexProjectContext, CommitDetails, DirectoryListing, GitAction, GitActionResult, GitCommit, GitWorkspaceStatus, ParentComparison, RecentRepository, RepositoryData } from './types';

const ROW_HEIGHT = 43;
const EXPANDED_HEIGHT = 180;
const contextKey = (context: CodexProjectContext | null) => JSON.stringify(context ? { ...context, observedAt: 0 } : null);

const compactNumber = (value: number) => value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);
const relativeTime = (iso: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 1) return '刚刚'; if (hours < 24) return `${hours}小时前`; const days = Math.floor(hours / 24); if (days < 7) return `${days}天前`; return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

function ModuleFootprint({ commit }: { commit: GitCommit }) {
  const modules = Object.entries(commit.modules).sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, modules.reduce((sum, [, value]) => sum + value, 0));
  const [primary = ['根目录', 0], secondary = ['', 0]] = modules;
  const primaryShare = Math.round(primary[1] / total * 100); const secondaryShare = Math.round(secondary[1] / total * 100);
  return <div className="module-footprint" title={modules.slice(0, 4).map(([name, value]) => `${name} ${Math.round(value / total * 100)}%`).join('，')}><span>{primary[0]}</span><div><i style={{ width: `${primaryShare}%` }} /><em style={{ width: `${secondaryShare}%` }} /></div><small>{primaryShare}%</small></div>;
}

function ModeSignal({ commit, mode, relation }: { commit: GitCommit; mode: AppMode; relation: string }) {
  if (mode === 'history') return <ModuleFootprint commit={commit} />;
  if (mode === 'causal') return <span className={`causal-signal ${relation}`}>{relation === 'focus' ? '当前焦点' : relation === 'ancestor' ? '上游祖先' : relation === 'descendant' ? '下游后继' : '路径之外'}</span>;
  if (mode === 'modules') { const module = Object.entries(commit.modules).sort((a, b) => b[1] - a[1])[0]; return <span className="module-signal"><b>{module?.[0] || '根目录'}</b><small>{compactNumber(module?.[1] || 0)}</small></span> }
  const score = commitRiskScore(commit); return <span className={`risk-signal ${riskLevel(score)}`}><b>{score}</b><small>{score >= 70 ? '高风险' : score >= 45 ? '中风险' : '低风险'}</small></span>;
}

function DiffBar({ commit }: { commit: GitCommit }) {
  const total = Math.max(1, commit.additions + commit.deletions); const add = Math.round(commit.additions / total * 100);
  return <div className="diff-wrap"><span className="add">+{compactNumber(commit.additions)}</span><span className="del">−{compactNumber(commit.deletions)}</span><div className="diff-bar"><i style={{ width: `${add}%` }} /><em /></div></div>;
}

function OperationBadges({ commit }: { commit: GitCommit }) {
  return <>{commit.operations.map((operation) => <span key={`${operation.kind}-${operation.source}-${operation.target}`} className={`operation-badge ${operation.kind}`} data-operation={operation.kind} title={`${operation.kind === 'merge' ? '合并' : 'Rebase'}：${operation.source} → ${operation.target}`}>
    {operation.kind === 'merge' ? <GitMerge weight="bold" /> : <ArrowsClockwise weight="bold" />}
    {operation.kind === 'merge' ? '合并' : 'REBASE'}
  </span>)}</>;
}

function ActivityOverview({ commits, selectedHash, onSelect }: { commits: GitCommit[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const dated = commits.filter((commit) => Number.isFinite(new Date(commit.isoDate).getTime()));
  if (!dated.length) return <section className="activity-section"><div className="side-title"><span>提交活跃度</span><ChartLineUp /></div><div className="empty-side">暂无时间数据</div></section>;
  const times = dated.map((commit) => new Date(commit.isoDate).getTime()); const earliest = Math.min(...times); const latest = Math.max(...times); const span = Math.max(1, latest - earliest);
  const bins = Array.from({ length: 12 }, () => ({ count: 0, commit: null as GitCommit | null }));
  dated.forEach((commit) => { const index = Math.min(11, Math.floor((new Date(commit.isoDate).getTime() - earliest) / span * 12)); bins[index].count += 1; bins[index].commit ||= commit });
  const max = Math.max(1, ...bins.map((bin) => bin.count)); const selectedTime = new Date(commits.find((commit) => commit.hash === selectedHash)?.isoDate || '').getTime(); const selectedBin = Number.isFinite(selectedTime) ? Math.min(11, Math.floor((selectedTime - earliest) / span * 12)) : -1;
  return <section className="activity-section"><div className="side-title"><span>提交活跃度</span><small>最近 {commits.length} 条</small></div><div className="activity-chart" role="group" aria-label="按时间分布的提交活跃度">{bins.map((bin, index) => <button key={index} className={index === selectedBin ? 'selected' : ''} disabled={!bin.commit} title={`${bin.count} 个提交${bin.commit ? '，点击定位' : ''}`} onClick={() => bin.commit && onSelect(bin.commit.hash)}><i style={{ height: `${Math.max(bin.count ? 12 : 3, bin.count / max * 100)}%` }} /></button>)}</div><div className="activity-axis"><span>较早</span><span>柱高 = 提交数</span><span>最近</span></div></section>;
}

function Sidebar({
  data, activeBranch, selectedHash, followCodex, followContext, repositoryBrowserOpen,
  directoryListing, recentRepositories, repositoryPathDraft, repositoryBrowserLoading, repositoryBrowserError,
  onBranch, onSelect, onToggleRepositoryBrowser, onRepositoryPathDraft, onBrowseDirectory, onLoadRepository, onFollow, onGitOperations, onClose,
}: {
  data: RepositoryData; activeBranch: string; selectedHash: string; followCodex: boolean; followContext: CodexProjectContext | null;
  repositoryBrowserOpen: boolean; directoryListing: DirectoryListing | null; recentRepositories: RecentRepository[];
  repositoryPathDraft: string; repositoryBrowserLoading: boolean; repositoryBrowserError: string;
  onBranch: (branch: string) => void; onSelect: (hash: string) => void; onToggleRepositoryBrowser: () => void;
  onRepositoryPathDraft: (value: string) => void; onBrowseDirectory: (path?: string) => void; onLoadRepository: (path: string) => void;
  onFollow: (enabled: boolean) => void; onGitOperations: () => void; onClose: () => void;
}) {
  const local = data.refs.filter((ref) => ref.type === 'local'); const tags = data.refs.filter((ref) => ref.type === 'tag');
  const followText = !followCodex ? '已固定当前仓库' : followContext?.status === 'ready' ? `已跟随：${followContext.projectName}` : followContext?.status === 'ambiguous' ? `${followContext.projectName} 含多个仓库` : followContext?.status === 'not-git' ? `${followContext.projectName} 不是 Git 仓库` : followContext?.status === 'unavailable' ? '等待 Codex 本地项目' : '正在读取 Codex 项目';
  return <aside className="sidebar">
    <div className={`repo-block ${repositoryBrowserOpen ? 'browser-open' : ''}`}><span className="repo-symbol"><BracketsCurly weight="duotone" /></span><span><small>当前仓库</small><strong>{data.name}</strong><em>{data.path}</em></span><button type="button" className="repo-browser-toggle" data-repository-browser-toggle onClick={onToggleRepositoryBrowser} aria-expanded={repositoryBrowserOpen}><span>{repositoryBrowserOpen ? '返回' : '切换'}</span><CaretDown /></button></div>
    {repositoryBrowserOpen ? <RepositoryBrowser currentPath={data.path} listing={directoryListing} recentRepositories={recentRepositories} pathDraft={repositoryPathDraft} loading={repositoryBrowserLoading} error={repositoryBrowserError} onPathDraft={onRepositoryPathDraft} onBrowse={onBrowseDirectory} onLoad={onLoadRepository} onClose={onToggleRepositoryBrowser} /> : <>
      <div className={`follow-card ${followCodex ? 'enabled' : ''} ${followContext?.status === 'ambiguous' || followContext?.status === 'not-git' ? 'attention' : ''}`}><div className="follow-copy"><Robot weight={followCodex ? 'fill' : 'regular'} /><span><strong>跟随 Codex</strong><small>{followText}</small></span></div><label className="follow-switch" title={followCodex ? '关闭后固定当前仓库' : '开启后自动跟随 Codex 当前项目'}><input type="checkbox" checked={followCodex} onChange={(event) => onFollow(event.target.checked)} /><i /></label></div>
      <section><div className="side-label">当前分支</div><button className="branch-item current" onClick={() => onBranch(data.branch)}><GitBranch /><strong>{data.branch}</strong><span className="head-tag">HEAD</span><small>↑{data.ahead} ↓{data.behind}</small></button></section>
      <section className="branch-list"><div className="side-title"><span>所有分支</span><button aria-label="新建分支"><Plus /></button></div><button className={activeBranch === '全部' ? 'branch-item active' : 'branch-item'} onClick={() => onBranch('全部')}><CirclesThreePlus /><span>全部提交</span><small>{data.commits.length}</small></button>
        {local.slice(0, 8).map((ref, index) => { const commitCount = data.commits.filter((commit) => commit.branches.includes(ref.short)).length; return <button key={ref.full} data-branch={ref.short} data-commit-count={commitCount} title={`${ref.short}，${commitCount} 个可达提交${ref.track ? `，${ref.track}` : ''}`} className={activeBranch === ref.short ? 'branch-item active' : 'branch-item'} onClick={() => onBranch(ref.short)}><GitBranch style={{ color: ['#68a8e8','#9b8ae7','#d4a855','#52ad9c','#d87575'][index % 5] }} /><span>{ref.short}</span>{ref.short === data.branch && <span className="head-tag">HEAD</span>}<small>{commitCount}</small></button> })}
      </section>
      <section><div className="side-title"><span>标签</span><Tag /></div>{tags.slice(0, 4).map((ref) => <div className="tag-item" key={ref.full}><Tag /><span>{ref.short}</span><small>{ref.hash}</small></div>)}{!tags.length && <div className="empty-side">暂无标签</div>}</section>
      <ActivityOverview commits={data.commits} selectedHash={selectedHash} onSelect={onSelect} />
      <footer><button type="button" className="workspace-status-button" data-git-command-toggle onClick={onGitOperations} title="打开 Git 快捷操作"><i />{data.dirtyCount ? `${data.dirtyCount} 项未提交更改` : '工作区干净'}</button><button onClick={onClose} aria-label="收起侧栏"><SidebarSimple /></button></footer>
    </>}
  </aside>;
}

function Inspector({ commit, details, comparison, analyzing, comparing, analysis, onAnalyze, onCompare, onClose }: { commit: GitCommit; details: CommitDetails | null; comparison: ParentComparison | null; analyzing: boolean; comparing: boolean; analysis: string; onAnalyze: () => void; onCompare: () => void; onClose: () => void }) {
  const modules = Object.entries(commit.modules).sort((a,b) => b[1] - a[1]).slice(0, 4); const max = modules[0]?.[1] || 1;
  const score = commitRiskScore(commit); const level = riskLevel(score); const risk = level === 'high' ? '高风险' : level === 'medium' ? '中等风险' : '低风险'; const churn = commit.additions + commit.deletions; const deletionRatio = Math.round(commit.deletions / Math.max(1, churn) * 100);
  const changedFiles = comparison?.files || details?.files || [];
  return <aside className="inspector"><header><span>提交详情</span>{commit.operations[0] && <em className={`inspector-operation ${commit.operations[0].kind}`}>{commit.operations[0].kind === 'merge' ? '合并提交' : 'Rebase 事件'}</em>}<button onClick={onClose} aria-label="关闭详情"><X /></button></header>
    <section className="commit-summary"><div className="hash-copy"><code>{commit.shortHash}</code><button onClick={() => navigator.clipboard.writeText(commit.hash)}>复制</button></div><h2>{commit.subject}</h2><p><span className="avatar">{commit.author.slice(0,1)}</span>{commit.author}<time>{new Date(commit.isoDate).toLocaleString('zh-CN')}</time></p></section>
    {commit.operations.length > 0 && <section className="branch-operations"><div className="section-title">分支行为</div>{commit.operations.map((operation) => <div className={`branch-operation ${operation.kind}`} data-operation-detail={operation.kind} key={`${operation.kind}-${operation.source}-${operation.target}`}>
      <span className="operation-icon">{operation.kind === 'merge' ? <GitMerge weight="bold" /> : <ArrowsClockwise weight="bold" />}</span>
      <div><strong>{operation.kind === 'merge' ? '合并完成' : 'Rebase 完成'}</strong><b><code>{operation.source}</code><ArrowRight /><code>{operation.target}</code></b><small>{operation.kind === 'merge' ? `${operation.parentCount || commit.parents.length} 条父线在此汇合，依据提交结构识别` : '依据本机 Git reflog 识别，记录过期后可能不再显示'}</small></div>
    </div>)}</section>}
    <section><div className="section-title">变更规模</div><div className="diff-numbers"><b>+{commit.additions}</b><em>−{commit.deletions}</em><DiffBar commit={commit} /></div></section>
    <section><div className="section-title">受影响模块 ({modules.length})</div><div className="module-list">{modules.map(([name, value], index) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.max(12, value / max * 100)}%` }} /></i><strong>+{Math.round(value * .72)}</strong><em>−{Math.round(value * .18)}</em></div>)}</div></section>
    <section className="scope-stats"><div className="section-title">影响范围</div><div><span><Code /> <b>{details?.files.length ?? Object.keys(commit.modules).length * 6}</b><small>文件</small></span><span><Plus /> <b>{compactNumber(commit.additions)}</b><small>添加</small></span><span><Minus /> <b>{compactNumber(commit.deletions)}</b><small>删除</small></span></div></section>
    {changedFiles.length > 0 && <section className="changed-files"><div className="section-title">{comparison ? comparison.parentHash ? `与 ${comparison.parentHash.slice(0,7)} 对比` : '根提交变更' : '变更文件'} ({changedFiles.length})</div>{changedFiles.slice(0, comparison ? 10 : 4).map((file) => <div key={file.file} title={file.file}><code>{file.file}</code><strong>+{file.additions}</strong><em>−{file.deletions}</em></div>)}{!comparison && changedFiles.length > 4 && <small>生成对比可查看完整列表</small>}</section>}
    <section className="risk-explain"><div className="section-title">风险评估 <span className={`risk ${level}`}>{score}，{risk}</span></div><div className="risk-meter"><i style={{ width: `${score}%` }} /><b style={{ left: `${score}%` }} /></div><div className="risk-factors"><span>变更规模 <b>{compactNumber(churn)}</b></span><span>删除比例 <b>{deletionRatio}%</b></span><span>模块跨度 <b>{Object.keys(commit.modules).length}</b></span><span>提交结构 <b>{commit.operations.some((operation) => operation.kind === 'merge') ? '合并' : commit.operations.some((operation) => operation.kind === 'rebase') ? 'Rebase' : '普通'}</b></span></div><p className="risk-note">由变更规模、删除比例、模块跨度与合并结构计算，范围 0-100。</p></section>
    <section><div className="section-title">父提交</div>{commit.parents.slice(0, 2).map((parent, index) => <div className="parent-row" key={parent}><i style={{ background: index ? '#9b8ae7' : '#68a8e8' }} /><code>{parent.slice(0,7)}</code><span>{index ? '合并来源' : '直接父提交'}</span></div>)}</section>
    {analysis && <section className="analysis-result"><div className="section-title"><CheckCircle /> Codex 分析</div><p>{analysis}</p></section>}
    <div className="inspector-actions"><button className="codex-button" onClick={onAnalyze} disabled={analyzing}><Robot weight="fill" />{analyzing ? '正在分析…' : '用 Codex 分析'}</button><button onClick={onCompare} disabled={comparing}><GitMerge />{comparing ? '正在比较…' : comparison ? '已生成对比' : commit.parents.length ? '比较父提交' : '查看根提交变更'}</button></div>
  </aside>;
}

export default function App() {
  const [data, setData] = useState<RepositoryData>(demoRepository); const [isDemo, setIsDemo] = useState(true); const [activeBranch, setActiveBranch] = useState('全部'); const [query, setQuery] = useState('');
  const [selectedHash, setSelectedHash] = useState(demoRepository.commits[5].hash); const [causalOnly, setCausalOnly] = useState(false); const [mode, setMode] = useState<AppMode>('history'); const [activeModule, setActiveModule] = useState('全部模块'); const [details, setDetails] = useState<CommitDetails | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [analysis, setAnalysis] = useState(''); const [analyzing, setAnalyzing] = useState(false);
  const [density, setDensity] = useState<'compact'|'standard'|'relaxed'>('standard'); const [comparison, setComparison] = useState<ParentComparison | null>(null); const [comparing, setComparing] = useState(false);
  const [followCodex, setFollowCodex] = useState(false); const [followContext, setFollowContext] = useState<CodexProjectContext | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false); const [inspectorOpen, setInspectorOpen] = useState(true);
  const [repositoryBrowserOpen, setRepositoryBrowserOpen] = useState(false); const [directoryListing, setDirectoryListing] = useState<DirectoryListing | null>(null);
  const [recentRepositories, setRecentRepositories] = useState<RecentRepository[]>([]); const [repositoryPathDraft, setRepositoryPathDraft] = useState('');
  const [repositoryBrowserLoading, setRepositoryBrowserLoading] = useState(false); const [repositoryBrowserError, setRepositoryBrowserError] = useState('');
  const [gitCommandOpen, setGitCommandOpen] = useState(false); const [gitWorkspaceStatus, setGitWorkspaceStatus] = useState<GitWorkspaceStatus | null>(null);
  const [gitStatusLoading, setGitStatusLoading] = useState(false); const [gitActionRunning, setGitActionRunning] = useState<GitAction | null>(null);
  const [gitActionResult, setGitActionResult] = useState<GitActionResult | null>(null); const [gitActionError, setGitActionError] = useState('');
  const [workspace, setWorkspace] = useState<'ai' | 'git'>('ai'); const [aiMode, setAiMode] = useState<AiMode>('tasks');
  const [codexEvidenceEnabled, setCodexEvidenceEnabled] = useState(false); const [codexEvidence, setCodexEvidence] = useState<CodexEvidence | null>(null); const [codexEvidenceLoading, setCodexEvidenceLoading] = useState(false);
  const dataPathRef = useRef(data.path); const loadSequenceRef = useRef(0);
  const selected = data.commits.find((commit) => commit.hash === selectedHash) || data.commits[0];
  const rowHeight = density === 'compact' ? 36 : density === 'relaxed' ? 50 : ROW_HEIGHT; const expandedHeight = density === 'compact' ? 158 : density === 'relaxed' ? 210 : EXPANDED_HEIGHT;
  const scoped = useMemo(() => data.commits.filter((commit) => (activeBranch === '全部' || commit.branches.includes(activeBranch)) && (!query || `${commit.shortHash} ${commit.subject} ${commit.author} ${commit.refs.join(' ')} ${commit.operations.map((operation) => `${operation.kind} ${operation.source} ${operation.target}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()))), [data, activeBranch, query]);
  const relations = useMemo(() => collectRelations(data.commits, selectedHash), [data.commits, selectedHash]);
  const visible = useMemo(() => scoped.filter((commit) => (mode !== 'risk' || commitRiskScore(commit) >= 45) && (mode !== 'modules' || activeModule === '全部模块' || Boolean(commit.modules[activeModule])) && (mode !== 'causal' || !causalOnly || relations.all.has(commit.hash))), [scoped, mode, activeModule, causalOnly, relations]);
  const switchMode = (nextMode: AppMode) => { setMode(nextMode); setCausalOnly(nextMode === 'causal'); if (nextMode !== 'modules') setActiveModule('全部模块') };
  const columnLabels = mode === 'history' ? ['稳定拓扑','提交','提交信息','模块构成','变更规模','作者','提交时间'] : mode === 'causal' ? ['因果路径','提交','路径事件','关系','变更规模','作者','提交时间'] : mode === 'modules' ? ['模块轨迹','提交','触达事件','主模块 / 触达','变更规模','作者','提交时间'] : ['风险轨迹','提交','待检查事件','风险评分','变更规模','作者','提交时间'];

  const applyRepository = useCallback(async (repoPath: string, options: { force?: boolean } = {}) => {
    if (!window.gitAtlas) return false;
    if (!options.force && dataPathRef.current.toLowerCase() === repoPath.toLowerCase()) return true;
    const sequence = ++loadSequenceRef.current; setLoading(true); setError('');
    try {
      const repo = await window.gitAtlas.loadRepository(repoPath); if (sequence !== loadSequenceRef.current) return;
      dataPathRef.current = repo.path; setData(repo); setIsDemo(false); setSelectedHash(repo.commits[0]?.hash || ''); setActiveBranch('全部'); setAnalysis(''); setComparison(null);
      setRecentRepositories(await window.gitAtlas.getRecentRepositories());
      return true;
    } catch (cause) { if (sequence === loadSequenceRef.current) setError(`仓库切换失败：${cause instanceof Error ? cause.message : String(cause)}`); return false }
    finally { if (sequence === loadSequenceRef.current) setLoading(false) }
  }, []);

  const browseDirectory = useCallback(async (directoryPath?: string) => {
    if (!window.gitAtlas) { setRepositoryBrowserError('本机目录仅在 Git Atlas 桌面版中可用'); return }
    setRepositoryBrowserLoading(true); setRepositoryBrowserError('');
    try {
      const listing = await window.gitAtlas.browseDirectory(directoryPath);
      setDirectoryListing(listing); setRepositoryPathDraft(listing.path);
    } catch (cause) { setRepositoryBrowserError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setRepositoryBrowserLoading(false) }
  }, []);

  const refreshGitStatus = useCallback(async () => {
    if (!window.gitAtlas) return;
    setGitStatusLoading(true); setGitActionError('');
    try { setGitWorkspaceStatus(await window.gitAtlas.getWorkspaceStatus(dataPathRef.current)) }
    catch (cause) { setGitActionError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setGitStatusLoading(false) }
  }, []);

  const loadCodexEvidence = useCallback(async (threadId?: string) => {
    if (!window.gitAtlas || !dataPathRef.current || dataPathRef.current === demoRepository.path) return;
    setCodexEvidenceLoading(true);
    try { setCodexEvidence(await window.gitAtlas.loadCodexEvidence(dataPathRef.current, threadId)) }
    catch (cause) { setCodexEvidence({ status: 'unavailable', tasks: [], selectedTask: null, observedAt: Date.now(), message: cause instanceof Error ? cause.message : String(cause) }) }
    finally { setCodexEvidenceLoading(false) }
  }, []);

  useEffect(() => { if (!window.gitAtlas) return; let cancelled = false; (async () => { const [enabled, recent] = await Promise.all([window.gitAtlas!.getFollowCodex(), window.gitAtlas!.getRecentRepositories()]); if (cancelled) return; setFollowCodex(enabled); setRecentRepositories(recent); if (!enabled) { const last = await window.gitAtlas!.getLastRepository(); if (!cancelled && last) await applyRepository(last) } })().catch(() => null); return () => { cancelled = true } }, [applyRepository]);
  useEffect(() => { if (!window.gitAtlas) return; let cancelled = false; window.gitAtlas.getCodexEvidenceEnabled().then((enabled) => { if (!cancelled) setCodexEvidenceEnabled(enabled) }).catch(() => null); return () => { cancelled = true } }, []);
  useEffect(() => { if (codexEvidenceEnabled && !isDemo) void loadCodexEvidence() }, [codexEvidenceEnabled, isDemo, data.path, loadCodexEvidence]);
  useEffect(() => {
    if (!window.gitAtlas || !followCodex) { setFollowContext(null); return }
    let cancelled = false; let running = false;
    const sync = async () => {
      if (running) return; running = true;
      try { const context = await window.gitAtlas!.getCodexProjectContext(); if (cancelled) return; setFollowContext((current) => contextKey(current) === contextKey(context) ? current : context); if (context.status === 'ready' && context.repoPath) await applyRepository(context.repoPath) }
      catch { if (!cancelled) setFollowContext({ status: 'unavailable', observedAt: Date.now(), message: '无法读取 Codex 项目状态' }) }
      finally { running = false }
    };
    const syncWhenVisible = () => { if (document.visibilityState === 'visible') sync() };
    setFollowContext({ status: 'checking', observedAt: Date.now() }); syncWhenVisible(); const timer = window.setInterval(syncWhenVisible, 3000); document.addEventListener('visibilitychange', syncWhenVisible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', syncWhenVisible) };
  }, [applyRepository, followCodex]);
  useEffect(() => { if (!selected || isDemo || !window.gitAtlas) { setDetails(null); return } window.gitAtlas.getCommitDetails(data.path, selected.hash).then(setDetails).catch(() => setDetails(null)) }, [selected?.hash, data.path, isDemo]);
  useEffect(() => { if (visible.length && !visible.some((commit) => commit.hash === selectedHash)) setSelectedHash(visible[0].hash) }, [visible, selectedHash]);
  useEffect(() => {
    if (!gitCommandOpen) return;
    setGitActionResult(null);
    if (!window.gitAtlas || isDemo) { setGitWorkspaceStatus(null); setGitActionError('Git 快捷操作仅在桌面版的真实仓库中可用'); return }
    void refreshGitStatus();
  }, [gitCommandOpen, data.path, isDemo, refreshGitStatus]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); if (isDemo) setError('请先从仓库导航打开本地 Git 仓库'); else setGitCommandOpen((open) => !open); return }
    if (event.key === 'Escape' && gitCommandOpen) { setGitCommandOpen(false); return }
    if (event.key === 'Escape' && navigationOpen) { setNavigationOpen(false); return }
    if (event.key === 'Escape' && inspectorOpen) { setInspectorOpen(false); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus(); return }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { const index = visible.findIndex((commit) => commit.hash === selectedHash); const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1); if (visible[next]) setSelectedHash(visible[next].hash) }
  }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [visible, selectedHash, gitCommandOpen, navigationOpen, inspectorOpen, isDemo]);

  const toggleRepositoryBrowser = () => {
    setNavigationOpen(true);
    setRepositoryBrowserOpen((open) => {
      const next = !open;
      if (next) {
        void browseDirectory(isDemo ? undefined : dataPathRef.current);
        if (window.gitAtlas) void window.gitAtlas.getRecentRepositories().then(setRecentRepositories);
      }
      return next;
    });
  };
  const loadRepositoryFromBrowser = async (repoPath: string) => {
    if (followCodex && window.gitAtlas) { setFollowCodex(false); setFollowContext(null); await window.gitAtlas.setFollowCodex(false) }
    if (await applyRepository(repoPath)) { setRepositoryBrowserOpen(false); setNavigationOpen(false) }
  };
  const toggleFollowCodex = async (enabled: boolean) => { setFollowCodex(enabled); setFollowContext(enabled ? { status: 'checking', observedAt: Date.now() } : null); if (window.gitAtlas) await window.gitAtlas.setFollowCodex(enabled) };
  const toggleCodexEvidence = async (enabled: boolean) => { setCodexEvidenceEnabled(enabled); if (!enabled) setCodexEvidence(null); if (window.gitAtlas) await window.gitAtlas.setCodexEvidenceEnabled(enabled) };
  const toggleGitCommand = () => { if (isDemo) { setError('请先从仓库导航打开本地 Git 仓库'); return } setGitCommandOpen((open) => !open) };
  const runGitAction = async (action: GitAction, payload?: { message?: string; branch?: string }) => {
    if (!window.gitAtlas || isDemo) { setGitActionError('Git 快捷操作仅在桌面版的真实仓库中可用'); return }
    setGitActionRunning(action); setGitActionResult(null); setGitActionError('');
    try {
      const result = await window.gitAtlas.runGitAction(dataPathRef.current, action, payload);
      setGitActionResult(result);
      await applyRepository(dataPathRef.current, { force: true });
      await refreshGitStatus();
    } catch (cause) { setGitActionError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setGitActionRunning(null) }
  };
  const refreshRepository = async () => { if (isDemo) { if (!repositoryBrowserOpen) toggleRepositoryBrowser(); return } await applyRepository(data.path, { force: true }) };
  const analyze = async () => { if (!selected) return; if (!window.gitAtlas || isDemo) { setAnalysis('该提交重构了分支渲染管线，主要影响图谱布局、画布交互和颜色映射。建议重点验证大型仓库下的渲染性能、合并提交路径和缩放后的命中检测。'); return } setAnalyzing(true); setAnalysis(''); try { setAnalysis(await window.gitAtlas.analyzeWithCodex(data.path, selected.hash)) } catch (cause) { setAnalysis(`分析失败：${cause instanceof Error ? cause.message : String(cause)}`) } finally { setAnalyzing(false) } };
  const compareParent = async () => { if (!selected) return; if (!window.gitAtlas || isDemo) { setComparison({ parentHash: selected.parents[0] || null, additions: selected.additions, deletions: selected.deletions, files: Object.keys(selected.modules).map((file) => ({ file, additions: Math.round(selected.modules[file] * .72), deletions: Math.round(selected.modules[file] * .18) })) }); return } setComparing(true); try { setComparison(await window.gitAtlas.compareWithParent(data.path, selected.hash)) } catch (cause) { setError(`无法生成提交对比：${cause instanceof Error ? cause.message : String(cause)}`) } finally { setComparing(false) } };
  const selectCommit = (hash: string) => { setSelectedHash(hash); setAnalysis(''); setComparison(null); setInspectorOpen(true) };
  const followLabel = !followCodex ? 'Codex 跟随关闭' : followContext?.status === 'ready' ? 'Codex 已连接' : followContext?.status === 'checking' ? '正在连接 Codex' : '等待 Codex 项目';

  return <main className={`app active-mode-${mode} workspace-${workspace} ${navigationOpen ? 'navigation-open' : ''} ${inspectorOpen ? 'inspector-open' : ''}`} data-mode={mode}>
    <div className="titlebar" />
    <header className="shellbar">
      <div className="logo"><img src="./git-atlas-mark.png" alt="" /><span><strong>Git Atlas</strong><small>AI 原生 Git 证据工作台</small></span></div>
      <button type="button" className="repository-trigger" onClick={() => { setRepositoryBrowserOpen(false); setNavigationOpen((open) => !open) }} aria-expanded={navigationOpen} title={data.path}><BracketsCurly weight="duotone" /><span><strong>{data.name}</strong><small>{isDemo ? '演示数据' : data.path}</small></span><CaretDown /></button>
      <button type="button" className="branch-trigger" onClick={() => { setRepositoryBrowserOpen(false); setNavigationOpen(true) }}><GitBranch /><span>{activeBranch === '全部' ? data.branch : activeBranch}</span><small>{activeBranch === '全部' ? '全部' : '筛选'}</small><CaretDown /></button>
      <label className={`codex-follow ${followCodex ? 'enabled' : ''}`} title={followLabel}><Robot weight={followCodex ? 'fill' : 'regular'} /><span><strong>{followLabel}</strong><small>{followCodex ? '自动切换仓库' : '固定当前仓库'}</small></span><input type="checkbox" checked={followCodex} onChange={(event) => toggleFollowCodex(event.target.checked)} /><i /></label>
      <label className="global-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提交、作者、路径…" /><kbd>Ctrl K</kbd></label>
      <button type="button" data-git-command-toggle className={`git-command-trigger ${gitCommandOpen ? 'active' : ''}`} onClick={toggleGitCommand}><TerminalWindow />Git 操作<CaretDown /></button>
      <button type="button" className="icon-button" onClick={toggleRepositoryBrowser} aria-label="打开本机仓库列表" title="打开本机仓库列表"><Folders /></button>
      <button type="button" className="icon-button" onClick={refreshRepository} aria-label="刷新仓库" title="刷新仓库"><ArrowsClockwise /></button>
    </header>

    <nav className="mode-tabs" aria-label={workspace === 'ai' ? 'AI 协作模式' : 'Git 图谱分析模式'}>
      {workspace === 'ai' ? (Object.keys(aiModeCopy) as AiMode[]).map((value, index) => {
        const copy = aiModeCopy[value]; const Icon = value === 'tasks' ? Robot : value === 'code' ? Code : value === 'handoff' ? CirclesThreePlus : Warning;
        return <button type="button" key={value} data-ai-mode={value} aria-pressed={aiMode === value} className={aiMode === value ? 'active' : ''} onClick={() => setAiMode(value)}><em>0{index + 1}</em><Icon weight={aiMode === value ? 'duotone' : 'regular'} /><span><strong>{copy.title}</strong><small>{copy.short}</small></span></button>;
      }) : (Object.keys(modeCopy) as AppMode[]).map((value, index) => {
        const copy = modeCopy[value]; const Icon = copy.Icon;
        return <button type="button" key={value} data-mode={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => switchMode(value)}><em>0{index + 1}</em><Icon weight={mode === value ? 'duotone' : 'regular'} /><span><strong>{copy.title}</strong><small>{copy.short}</small></span></button>;
      })}
      <div className="mode-utilities">
        <div className="workspace-layer-switch" role="group" aria-label="工作层"><button type="button" className={workspace === 'ai' ? 'active ai' : 'ai'} aria-pressed={workspace === 'ai'} onClick={() => setWorkspace('ai')}><Robot /><span><strong>AI 协作</strong><small>意图与验证</small></span></button><button type="button" className={workspace === 'git' ? 'active git' : 'git'} aria-pressed={workspace === 'git'} onClick={() => setWorkspace('git')}><GitBranch /><span><strong>Git 图谱</strong><small>历史与操作</small></span></button></div>
      </div>
    </nav>

    {workspace === 'ai' ? <AiWorkspace mode={aiMode} data={data} enabled={codexEvidenceEnabled} evidence={codexEvidence} loading={codexEvidenceLoading} onEnable={toggleCodexEvidence} onRefresh={() => loadCodexEvidence()} onTask={(id) => loadCodexEvidence(id)} /> : <div className="layout">
      {navigationOpen && <><button type="button" className="drawer-scrim" onClick={() => setNavigationOpen(false)} aria-label="关闭仓库导航" /><Sidebar data={data} activeBranch={activeBranch} selectedHash={selectedHash} followCodex={followCodex} followContext={followContext} repositoryBrowserOpen={repositoryBrowserOpen} directoryListing={directoryListing} recentRepositories={recentRepositories} repositoryPathDraft={repositoryPathDraft} repositoryBrowserLoading={repositoryBrowserLoading} repositoryBrowserError={repositoryBrowserError} onBranch={(branch) => { setActiveBranch(branch); setNavigationOpen(false) }} onSelect={selectCommit} onToggleRepositoryBrowser={toggleRepositoryBrowser} onRepositoryPathDraft={setRepositoryPathDraft} onBrowseDirectory={browseDirectory} onLoadRepository={loadRepositoryFromBrowser} onFollow={toggleFollowCodex} onGitOperations={toggleGitCommand} onClose={() => setNavigationOpen(false)} /></>}
      <section className="history">
        <div className="git-view-controls"><span><GitBranch />Git 图谱 · {activeBranch === '全部' ? '全部分支' : activeBranch}</span>{mode === 'causal' && <label className="causal-toggle"><input type="checkbox" checked={causalOnly} onChange={(event) => setCausalOnly(event.target.checked)} /><i />只看关联路径</label>}<div className="density-control" role="group" aria-label="列表密度">{([['compact','紧'],['standard','标'],['relaxed','宽']] as const).map(([value,label]) => <button type="button" key={value} title={value === 'compact' ? '紧凑密度' : value === 'standard' ? '标准密度' : '宽松密度'} aria-pressed={density === value} className={density === value ? 'active' : ''} onClick={() => setDensity(value)}>{label}</button>)}</div></div>
        {error && <div className="toast"><Warning />{error}<button type="button" onClick={() => setError('')}><X /></button></div>}
        {loading && <div className="loading"><ArrowsClockwise /><span>{followCodex ? '正在跟随 Codex 切换仓库…' : '正在读取仓库历史…'}</span></div>}
        {selected && <ModeWorkspace mode={mode} data={data} commits={scoped} selected={selected} activeModule={activeModule} onModule={setActiveModule} onSelect={selectCommit} />}
        {gitCommandOpen && <GitCommandDock status={gitWorkspaceStatus} branches={data.refs.filter((ref) => ref.type === 'local').map((ref) => ref.short)} loading={gitStatusLoading} running={gitActionRunning} result={gitActionResult} error={gitActionError} onRefresh={refreshGitStatus} onRun={runGitAction} onClose={() => setGitCommandOpen(false)} />}
        <div className="history-scroll">
          <div className="column-head">{columnLabels.map((label) => <span key={label}>{label}</span>)}</div>
          <div className="commit-stack" style={{ height: graphHeight(visible, selectedHash, rowHeight, expandedHeight) }}>
            <GraphCanvas commits={visible} selectedHash={selectedHash} causalOnly={causalOnly} rowHeight={rowHeight} expandedHeight={expandedHeight} />
            {visible.map((commit, index) => <div role="button" tabIndex={0} key={commit.hash} data-operations={commit.operations.map((operation) => operation.kind).join(' ') || undefined} className={`commit-row ${commit.hash === selectedHash ? 'selected' : ''} ${commit.operations.length ? 'has-operation' : ''}`} style={{ height: rowHeight, gridTemplateRows: `${rowHeight}px` }} onClick={() => selectCommit(commit.hash)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCommit(commit.hash) } }}>
              <span className="row-index">{String(index + 1).padStart(2, '0')}</span><span className="graph-space" /><code>{commit.shortHash}</code><span className="subject"><span className="subject-title">{commit.subject}</span><OperationBadges commit={commit} />{commit.refs.slice(0,2).map((ref) => <i key={ref}>{ref.replace('HEAD -> ', '')}</i>)}</span><ModeSignal commit={commit} mode={mode} relation={commit.hash === selectedHash ? 'focus' : relations.ancestors.has(commit.hash) ? 'ancestor' : relations.descendants.has(commit.hash) ? 'descendant' : 'outside'} /><DiffBar commit={commit} /><span className="author">{commit.author}</span><time>{relativeTime(commit.isoDate)}</time>
            </div>)}
          </div>
          {visible.length > 0 && <ScopeDossier commits={visible} />}
        </div>
        <footer className="legend"><span className="range-summary">{activeBranch === '全部' ? '全部分支' : activeBranch} · {visible.length} 个提交</span>{data.refs.filter((ref) => ref.type === 'local').slice(0,3).map((ref, index) => <span key={ref.full}><i style={{ background:['#58a6ff','#bc8cff','#e3b341'][index] }} />{ref.short}</span>)}<span className="legend-merge"><GitMerge />合并节点</span><span className="legend-rebase"><ArrowsClockwise />Rebase</span><span><GitCommitIcon />分支点</span><span><b />当前 HEAD</span></footer>
      </section>
      {selected && inspectorOpen && <Inspector commit={selected} details={details} comparison={comparison} analyzing={analyzing} comparing={comparing} analysis={analysis} onAnalyze={analyze} onCompare={compareParent} onClose={() => setInspectorOpen(false)} />}
    </div>}
  </main>;
}
