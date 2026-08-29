import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise, BracketsCurly, CaretDown, ChartLineUp, CheckCircle,
  CirclesThreePlus, ClockCounterClockwise, Code, GitBranch, GitCommit as GitCommitIcon, GitFork,
  GitMerge, GitPullRequest, MagnifyingGlass, Minus, Path, Plus, Robot, SidebarSimple,
  Tag, TreeStructure, Warning, X,
} from '@phosphor-icons/react';
import GraphCanvas, { graphHeight } from './GraphCanvas';
import { collectRelations, commitRiskScore, riskLevel, type AppMode } from './analytics';
import { demoRepository } from './demo';
import { ModeWorkspace, ScopeDossier, modeCopy } from './ModeWorkspace';
import type { CodexProjectContext, CommitDetails, GitCommit, ParentComparison, RepositoryData } from './types';

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

function ActivityOverview({ commits, selectedHash, onSelect }: { commits: GitCommit[]; selectedHash: string; onSelect: (hash: string) => void }) {
  const dated = commits.filter((commit) => Number.isFinite(new Date(commit.isoDate).getTime()));
  if (!dated.length) return <section className="activity-section"><div className="side-title"><span>提交活跃度</span><ChartLineUp /></div><div className="empty-side">暂无时间数据</div></section>;
  const times = dated.map((commit) => new Date(commit.isoDate).getTime()); const earliest = Math.min(...times); const latest = Math.max(...times); const span = Math.max(1, latest - earliest);
  const bins = Array.from({ length: 12 }, () => ({ count: 0, commit: null as GitCommit | null }));
  dated.forEach((commit) => { const index = Math.min(11, Math.floor((new Date(commit.isoDate).getTime() - earliest) / span * 12)); bins[index].count += 1; bins[index].commit ||= commit });
  const max = Math.max(1, ...bins.map((bin) => bin.count)); const selectedTime = new Date(commits.find((commit) => commit.hash === selectedHash)?.isoDate || '').getTime(); const selectedBin = Number.isFinite(selectedTime) ? Math.min(11, Math.floor((selectedTime - earliest) / span * 12)) : -1;
  return <section className="activity-section"><div className="side-title"><span>提交活跃度</span><small>最近 {commits.length} 条</small></div><div className="activity-chart" role="group" aria-label="按时间分布的提交活跃度">{bins.map((bin, index) => <button key={index} className={index === selectedBin ? 'selected' : ''} disabled={!bin.commit} title={`${bin.count} 个提交${bin.commit ? '，点击定位' : ''}`} onClick={() => bin.commit && onSelect(bin.commit.hash)}><i style={{ height: `${Math.max(bin.count ? 12 : 3, bin.count / max * 100)}%` }} /></button>)}</div><div className="activity-axis"><span>较早</span><span>柱高 = 提交数</span><span>最近</span></div></section>;
}

function Sidebar({ data, activeBranch, selectedHash, followCodex, followContext, onBranch, onSelect, onOpen, onFollow }: { data: RepositoryData; activeBranch: string; selectedHash: string; followCodex: boolean; followContext: CodexProjectContext | null; onBranch: (branch: string) => void; onSelect: (hash: string) => void; onOpen: () => void; onFollow: (enabled: boolean) => void }) {
  const local = data.refs.filter((ref) => ref.type === 'local'); const tags = data.refs.filter((ref) => ref.type === 'tag');
  const followText = !followCodex ? '已固定当前仓库' : followContext?.status === 'ready' ? `已跟随：${followContext.projectName}` : followContext?.status === 'ambiguous' ? `${followContext.projectName} 含多个仓库` : followContext?.status === 'not-git' ? `${followContext.projectName} 不是 Git 仓库` : followContext?.status === 'unavailable' ? '等待 Codex 本地项目' : '正在读取 Codex 项目';
  return <aside className="sidebar">
    <button className="repo-block" onClick={onOpen}><span className="repo-symbol"><BracketsCurly weight="duotone" /></span><span><small>工作区</small><strong>{data.name}</strong><em>{data.path}</em></span><CaretDown /></button>
    <div className={`follow-card ${followCodex ? 'enabled' : ''} ${followContext?.status === 'ambiguous' || followContext?.status === 'not-git' ? 'attention' : ''}`}><div className="follow-copy"><Robot weight={followCodex ? 'fill' : 'regular'} /><span><strong>跟随 Codex</strong><small>{followText}</small></span></div><label className="follow-switch" title={followCodex ? '关闭后固定当前仓库' : '开启后自动跟随 Codex 当前项目'}><input type="checkbox" checked={followCodex} onChange={(event) => onFollow(event.target.checked)} /><i /></label></div>
    <section><div className="side-label">当前分支</div><button className="branch-item current" onClick={() => onBranch(data.branch)}><GitBranch /><strong>{data.branch}</strong><span className="head-tag">HEAD</span><small>↑{data.ahead} ↓{data.behind}</small></button></section>
    <section className="branch-list"><div className="side-title"><span>所有分支</span><button aria-label="新建分支"><Plus /></button></div><button className={activeBranch === '全部' ? 'branch-item active' : 'branch-item'} onClick={() => onBranch('全部')}><CirclesThreePlus /><span>全部提交</span><small>{data.commits.length}</small></button>
      {local.slice(0, 8).map((ref, index) => { const commitCount = data.commits.filter((commit) => commit.branches.includes(ref.short)).length; return <button key={ref.full} data-branch={ref.short} data-commit-count={commitCount} title={`${ref.short}，${commitCount} 个可达提交${ref.track ? `，${ref.track}` : ''}`} className={activeBranch === ref.short ? 'branch-item active' : 'branch-item'} onClick={() => onBranch(ref.short)}><GitBranch style={{ color: ['#68a8e8','#9b8ae7','#d4a855','#52ad9c','#d87575'][index % 5] }} /><span>{ref.short}</span>{ref.short === data.branch && <span className="head-tag">HEAD</span>}<small>{commitCount}</small></button> })}
    </section>
    <section><div className="side-title"><span>标签</span><Tag /></div>{tags.slice(0, 4).map((ref) => <div className="tag-item" key={ref.full}><Tag /><span>{ref.short}</span><small>{ref.hash}</small></div>)}{!tags.length && <div className="empty-side">暂无标签</div>}</section>
    <ActivityOverview commits={data.commits} selectedHash={selectedHash} onSelect={onSelect} />
    <footer><span><i /> {data.dirtyCount ? `${data.dirtyCount} 项未提交更改` : '工作区干净'}</span><button aria-label="收起侧栏"><SidebarSimple /></button></footer>
  </aside>;
}

function Inspector({ commit, details, comparison, analyzing, comparing, analysis, onAnalyze, onCompare }: { commit: GitCommit; details: CommitDetails | null; comparison: ParentComparison | null; analyzing: boolean; comparing: boolean; analysis: string; onAnalyze: () => void; onCompare: () => void }) {
  const modules = Object.entries(commit.modules).sort((a,b) => b[1] - a[1]).slice(0, 4); const max = modules[0]?.[1] || 1;
  const score = commitRiskScore(commit); const level = riskLevel(score); const risk = level === 'high' ? '高风险' : level === 'medium' ? '中等风险' : '低风险'; const churn = commit.additions + commit.deletions; const deletionRatio = Math.round(commit.deletions / Math.max(1, churn) * 100);
  const changedFiles = comparison?.files || details?.files || [];
  return <aside className="inspector"><header><span>提交详情</span><button aria-label="关闭详情"><X /></button></header>
    <section className="commit-summary"><div className="hash-copy"><code>{commit.shortHash}</code><button onClick={() => navigator.clipboard.writeText(commit.hash)}>复制</button></div><h2>{commit.subject}</h2><p><span className="avatar">{commit.author.slice(0,1)}</span>{commit.author}<time>{new Date(commit.isoDate).toLocaleString('zh-CN')}</time></p></section>
    <section><div className="section-title">变更规模</div><div className="diff-numbers"><b>+{commit.additions}</b><em>−{commit.deletions}</em><DiffBar commit={commit} /></div></section>
    <section><div className="section-title">受影响模块 ({modules.length})</div><div className="module-list">{modules.map(([name, value], index) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.max(12, value / max * 100)}%` }} /></i><strong>+{Math.round(value * .72)}</strong><em>−{Math.round(value * .18)}</em></div>)}</div></section>
    <section className="scope-stats"><div className="section-title">影响范围</div><div><span><Code /> <b>{details?.files.length ?? Object.keys(commit.modules).length * 6}</b><small>文件</small></span><span><Plus /> <b>{compactNumber(commit.additions)}</b><small>添加</small></span><span><Minus /> <b>{compactNumber(commit.deletions)}</b><small>删除</small></span></div></section>
    {changedFiles.length > 0 && <section className="changed-files"><div className="section-title">{comparison ? comparison.parentHash ? `与 ${comparison.parentHash.slice(0,7)} 对比` : '根提交变更' : '变更文件'} ({changedFiles.length})</div>{changedFiles.slice(0, comparison ? 10 : 4).map((file) => <div key={file.file} title={file.file}><code>{file.file}</code><strong>+{file.additions}</strong><em>−{file.deletions}</em></div>)}{!comparison && changedFiles.length > 4 && <small>生成对比可查看完整列表</small>}</section>}
    <section className="risk-explain"><div className="section-title">风险评估 <span className={`risk ${level}`}>{score}，{risk}</span></div><div className="risk-meter"><i style={{ width: `${score}%` }} /><b style={{ left: `${score}%` }} /></div><div className="risk-factors"><span>变更规模 <b>{compactNumber(churn)}</b></span><span>删除比例 <b>{deletionRatio}%</b></span><span>模块跨度 <b>{Object.keys(commit.modules).length}</b></span><span>提交结构 <b>{commit.parents.length > 1 ? '合并' : '普通'}</b></span></div><p className="risk-note">由变更规模、删除比例、模块跨度与合并结构计算，范围 0-100。</p></section>
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
  const dataPathRef = useRef(data.path); const loadSequenceRef = useRef(0);
  const selected = data.commits.find((commit) => commit.hash === selectedHash) || data.commits[0];
  const rowHeight = density === 'compact' ? 36 : density === 'relaxed' ? 52 : ROW_HEIGHT; const expandedHeight = density === 'compact' ? 158 : density === 'relaxed' ? 216 : EXPANDED_HEIGHT;
  const scoped = useMemo(() => data.commits.filter((commit) => (activeBranch === '全部' || commit.branches.includes(activeBranch)) && (!query || `${commit.shortHash} ${commit.subject} ${commit.author} ${commit.refs.join(' ')}`.toLowerCase().includes(query.toLowerCase()))), [data, activeBranch, query]);
  const relations = useMemo(() => collectRelations(data.commits, selectedHash), [data.commits, selectedHash]);
  const visible = useMemo(() => scoped.filter((commit) => (mode !== 'risk' || commitRiskScore(commit) >= 45) && (mode !== 'modules' || activeModule === '全部模块' || Boolean(commit.modules[activeModule])) && (mode !== 'causal' || !causalOnly || relations.all.has(commit.hash))), [scoped, mode, activeModule, causalOnly, relations]);
  const switchMode = (nextMode: AppMode) => { setMode(nextMode); setCausalOnly(nextMode === 'causal'); if (nextMode !== 'modules') setActiveModule('全部模块') };
  const columnLabels = mode === 'history' ? ['稳定拓扑','提交','提交信息','模块构成','变更规模','作者','提交时间'] : mode === 'causal' ? ['因果路径','提交','路径事件','关系','变更规模','作者','提交时间'] : mode === 'modules' ? ['模块轨迹','提交','触达事件','主模块 / 触达','变更规模','作者','提交时间'] : ['风险轨迹','提交','待检查事件','风险评分','变更规模','作者','提交时间'];

  const applyRepository = useCallback(async (repoPath: string, options: { force?: boolean } = {}) => {
    if (!window.gitAtlas || (!options.force && dataPathRef.current.toLowerCase() === repoPath.toLowerCase())) return;
    const sequence = ++loadSequenceRef.current; setLoading(true); setError('');
    try {
      const repo = await window.gitAtlas.loadRepository(repoPath); if (sequence !== loadSequenceRef.current) return;
      dataPathRef.current = repo.path; setData(repo); setIsDemo(false); setSelectedHash(repo.commits[0]?.hash || ''); setActiveBranch('全部'); setAnalysis(''); setComparison(null);
    } catch (cause) { if (sequence === loadSequenceRef.current) setError(`仓库切换失败：${cause instanceof Error ? cause.message : String(cause)}`) }
    finally { if (sequence === loadSequenceRef.current) setLoading(false) }
  }, []);

  useEffect(() => { if (!window.gitAtlas) return; let cancelled = false; (async () => { const enabled = await window.gitAtlas!.getFollowCodex(); if (cancelled) return; setFollowCodex(enabled); if (!enabled) { const last = await window.gitAtlas!.getLastRepository(); if (!cancelled && last) await applyRepository(last) } })().catch(() => null); return () => { cancelled = true } }, [applyRepository]);
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
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.history-toolbar input')?.focus() } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { const index = visible.findIndex((commit) => commit.hash === selectedHash); const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1); if (visible[next]) setSelectedHash(visible[next].hash) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [visible, selectedHash]);

  const openRepository = async () => {
    if (!window.gitAtlas) { setError('请在 Git Atlas 桌面应用中选择本地仓库。当前浏览器预览使用演示数据。'); return }
    setLoading(true); setError(''); try { const repo = await window.gitAtlas.chooseRepository(); if (repo) { if (followCodex) { setFollowCodex(false); setFollowContext(null); await window.gitAtlas.setFollowCodex(false) } dataPathRef.current = repo.path; setData(repo); setIsDemo(false); setSelectedHash(repo.commits[0]?.hash || ''); setActiveBranch('全部'); setAnalysis(''); setComparison(null) } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setLoading(false) }
  };
  const toggleFollowCodex = async (enabled: boolean) => { setFollowCodex(enabled); setFollowContext(enabled ? { status: 'checking', observedAt: Date.now() } : null); if (window.gitAtlas) await window.gitAtlas.setFollowCodex(enabled) };
  const refreshRepository = async () => { if (isDemo) { await openRepository(); return } await applyRepository(data.path, { force: true }) };
  const analyze = async () => { if (!selected) return; if (!window.gitAtlas || isDemo) { setAnalysis('该提交重构了分支渲染管线，主要影响图谱布局、画布交互和颜色映射。建议重点验证大型仓库下的渲染性能、合并提交路径和缩放后的命中检测。'); return } setAnalyzing(true); setAnalysis(''); try { setAnalysis(await window.gitAtlas.analyzeWithCodex(data.path, selected.hash)) } catch (cause) { setAnalysis(`分析失败：${cause instanceof Error ? cause.message : String(cause)}`) } finally { setAnalyzing(false) } };
  const compareParent = async () => { if (!selected) return; if (!window.gitAtlas || isDemo) { setComparison({ parentHash: selected.parents[0] || null, additions: selected.additions, deletions: selected.deletions, files: Object.keys(selected.modules).map((file) => ({ file, additions: Math.round(selected.modules[file] * .72), deletions: Math.round(selected.modules[file] * .18) })) }); return } setComparing(true); try { setComparison(await window.gitAtlas.compareWithParent(data.path, selected.hash)) } catch (cause) { setError(`无法生成提交对比：${cause instanceof Error ? cause.message : String(cause)}`) } finally { setComparing(false) } };

  return <main className="app"><div className="titlebar" />
    <nav className={`topbar active-mode-${mode}`}><div className="logo"><img src="./git-atlas-mark.png" alt="" /><span><strong>Git Atlas</strong><small>仓库情报工作台</small></span></div><div className="mode-tabs">{([['history', ClockCounterClockwise], ['causal', Path], ['modules', TreeStructure], ['risk', Warning]] as const).map(([value, Icon]) => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => switchMode(value)}><Icon /><span>{modeCopy[value].title}</span></button>)}</div><div className="density-control"><span>列表密度</span><div role="group" aria-label="列表密度">{([['compact','紧凑'],['standard','标准'],['relaxed','宽松']] as const).map(([value,label]) => <button key={value} aria-pressed={density === value} className={density === value ? 'active' : ''} onClick={() => setDensity(value)}>{label}</button>)}</div></div>{mode === 'causal' && <label className="causal-toggle"><input type="checkbox" checked={causalOnly} onChange={(event) => setCausalOnly(event.target.checked)} /><i />只看关联路径</label>}</nav>
    <div className="layout"><Sidebar data={data} activeBranch={activeBranch} selectedHash={selectedHash} followCodex={followCodex} followContext={followContext} onBranch={setActiveBranch} onSelect={(hash) => { setSelectedHash(hash); setComparison(null) }} onOpen={openRepository} onFollow={toggleFollowCodex} />
      <section className="history"><header className="history-toolbar"><div><strong>{data.name}</strong><span>{activeBranch === '全部' ? '全部分支' : activeBranch}，{visible.length} 个可见提交{isDemo && '，演示数据'}{followCodex && '，跟随 Codex'}</span></div><label><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提交、作者、哈希或引用" /><kbd>Ctrl K</kbd></label><button onClick={openRepository}><GitPullRequest />打开仓库</button><button onClick={refreshRepository} aria-label="刷新"><ArrowsClockwise /></button></header>
        {error && <div className="toast"><Warning />{error}<button onClick={() => setError('')}><X /></button></div>}
        {loading && <div className="loading"><ArrowsClockwise /><span>{followCodex ? '正在跟随 Codex 切换仓库…' : '正在读取仓库历史…'}</span></div>}
        {selected && <ModeWorkspace mode={mode} data={data} commits={scoped} selected={selected} activeModule={activeModule} onModule={setActiveModule} onSelect={(hash) => { setSelectedHash(hash); setAnalysis(''); setComparison(null) }} />}
        <div className="history-scroll"><div className="column-head">{columnLabels.map((label) => <span key={label}>{label}</span>)}</div>
          <div className="commit-stack" style={{ height: graphHeight(visible, selectedHash, rowHeight, expandedHeight) }}><GraphCanvas commits={visible} selectedHash={selectedHash} causalOnly={causalOnly} rowHeight={rowHeight} expandedHeight={expandedHeight} />
            {visible.map((commit, index) => <div role="button" tabIndex={0} key={commit.hash} className={`commit-row ${commit.hash === selectedHash ? 'selected' : ''}`} style={{ height: rowHeight, gridTemplateRows: `${rowHeight}px` }} onClick={() => { setSelectedHash(commit.hash); setAnalysis(''); setComparison(null) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedHash(commit.hash); setAnalysis(''); setComparison(null) } }}>
              <span className="row-index">{String(index + 1).padStart(2, '0')}</span><span className="graph-space" /><code>{commit.shortHash}</code><span className="subject">{commit.subject}{commit.refs.slice(0,2).map((ref) => <i key={ref}>{ref.replace('HEAD -> ', '')}</i>)}</span><ModeSignal commit={commit} mode={mode} relation={commit.hash === selectedHash ? 'focus' : relations.ancestors.has(commit.hash) ? 'ancestor' : relations.descendants.has(commit.hash) ? 'descendant' : 'outside'} /><DiffBar commit={commit} /><span className="author">{commit.author}</span><time>{relativeTime(commit.isoDate)}</time>
            </div>)}
          </div>
          {visible.length > 0 && <ScopeDossier commits={visible} />}
        </div><footer className="legend">{data.refs.filter((ref) => ref.type === 'local').slice(0,3).map((ref, index) => <span key={ref.full}><i style={{ background:['#68a8e8','#9b8ae7','#d4a855'][index] }} />{ref.short}</span>)}<span><GitMerge />合并提交</span><span><GitCommitIcon />分支点</span><span><b />当前 HEAD</span></footer>
      </section>
      {selected && <Inspector commit={selected} details={details} comparison={comparison} analyzing={analyzing} comparing={comparing} analysis={analysis} onAnalyze={analyze} onCompare={compareParent} />}
    </div>
  </main>;
}
