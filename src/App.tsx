import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise, BracketsCurly, CaretDown, ChartLineUp, CheckCircle,
  CirclesThreePlus, ClockCounterClockwise, Code, GitBranch, GitCommit as GitCommitIcon, GitFork,
  GitMerge, GitPullRequest, MagnifyingGlass, Minus, Path, Plus, Robot, SidebarSimple,
  SlidersHorizontal, Tag, TreeStructure, Warning, X,
} from '@phosphor-icons/react';
import GraphCanvas, { graphHeight } from './GraphCanvas';
import { demoRepository } from './demo';
import type { CommitDetails, GitCommit, RepositoryData } from './types';

const ROW_HEIGHT = 43;
const EXPANDED_HEIGHT = 180;

const compactNumber = (value: number) => value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);
const relativeTime = (iso: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 1) return '刚刚'; if (hours < 24) return `${hours}小时前`; const days = Math.floor(hours / 24); if (days < 7) return `${days}天前`; return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

function ModuleHeat({ commit }: { commit: GitCommit }) {
  const total = Math.max(1, Object.values(commit.modules).reduce((a, b) => a + b, 0));
  const values = Object.values(commit.modules).slice(0, 8);
  return <div className="module-heat" title="模块影响热度">{Array.from({ length: 8 }, (_, index) => {
    const intensity = values[index % Math.max(1, values.length)] || 0; const alpha = .14 + Math.min(.86, intensity / total * 2.8);
    return <i key={index} style={{ background: index % 3 === 1 ? `rgba(225,172,50,${alpha})` : `rgba(61,168,255,${alpha})` }} />;
  })}</div>;
}

function DiffBar({ commit }: { commit: GitCommit }) {
  const total = Math.max(1, commit.additions + commit.deletions); const add = Math.round(commit.additions / total * 100);
  return <div className="diff-wrap"><span className="add">+{compactNumber(commit.additions)}</span><span className="del">−{compactNumber(commit.deletions)}</span><div className="diff-bar"><i style={{ width: `${add}%` }} /><em /></div></div>;
}

function Sidebar({ data, activeBranch, onBranch, onOpen }: { data: RepositoryData; activeBranch: string; onBranch: (branch: string) => void; onOpen: () => void }) {
  const local = data.refs.filter((ref) => ref.type === 'local'); const tags = data.refs.filter((ref) => ref.type === 'tag');
  return <aside className="sidebar">
    <button className="repo-block" onClick={onOpen}><span className="repo-symbol"><BracketsCurly weight="duotone" /></span><span><small>工作区</small><strong>{data.name}</strong><em>{data.path}</em></span><CaretDown /></button>
    <section><div className="side-label">当前分支</div><button className="branch-item current" onClick={() => onBranch(data.branch)}><GitBranch /><strong>{data.branch}</strong><span className="head-tag">HEAD</span><small>↑{data.ahead} ↓{data.behind}</small></button></section>
    <section className="branch-list"><div className="side-title"><span>所有分支</span><button aria-label="新建分支"><Plus /></button></div><button className={activeBranch === '全部' ? 'branch-item active' : 'branch-item'} onClick={() => onBranch('全部')}><CirclesThreePlus /><span>全部提交</span><small>{data.commits.length}</small></button>
      {local.slice(0, 8).map((ref, index) => <button key={ref.full} className={activeBranch === ref.short ? 'branch-item active' : 'branch-item'} onClick={() => onBranch(ref.short)}><GitBranch style={{ color: ['#9cff57','#9466ff','#3da8ff','#35c6bb','#e06f59'][index % 5] }} /><span>{ref.short}</span>{ref.short === data.branch && <span className="head-tag">HEAD</span>}<small>{ref.track}</small></button>)}
    </section>
    <section><div className="side-title"><span>标签</span><Tag /></div>{tags.slice(0, 4).map((ref) => <div className="tag-item" key={ref.full}><Tag /><span>{ref.short}</span><small>{ref.hash}</small></div>)}{!tags.length && <div className="empty-side">暂无标签</div>}</section>
    <section className="mini-section"><div className="side-title"><span>拓扑小图</span><ChartLineUp /></div><div className="mini-map"><span>高密度</span>{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${46 + Math.sin(index * .8) * 18}%`, top: `${index * 5.2}%`, background: index === 6 ? '#e47757' : index % 3 ? '#42abc5' : '#9cff57' }} />)}<b /><em /><span>低密度</span></div></section>
    <footer><span><i /> {data.dirtyCount ? `${data.dirtyCount} 项未提交更改` : '工作区干净'}</span><button aria-label="收起侧栏"><SidebarSimple /></button></footer>
  </aside>;
}

function Inspector({ commit, details, analyzing, analysis, onAnalyze }: { commit: GitCommit; details: CommitDetails | null; analyzing: boolean; analysis: string; onAnalyze: () => void }) {
  const modules = Object.entries(commit.modules).sort((a,b) => b[1] - a[1]).slice(0, 4); const max = modules[0]?.[1] || 1;
  const risk = commit.deletions > 100 || commit.additions + commit.deletions > 700 ? '高风险' : commit.deletions > 30 ? '中等风险' : '低风险';
  return <aside className="inspector"><header><span>提交详情</span><button aria-label="关闭详情"><X /></button></header>
    <section className="commit-summary"><div className="hash-copy"><code>{commit.shortHash}</code><button onClick={() => navigator.clipboard.writeText(commit.hash)}>复制</button></div><h2>{commit.subject}</h2><p><span className="avatar">{commit.author.slice(0,1)}</span>{commit.author}<time>{new Date(commit.isoDate).toLocaleString('zh-CN')}</time></p></section>
    <section><div className="section-title">变更规模</div><div className="diff-numbers"><b>+{commit.additions}</b><em>−{commit.deletions}</em><DiffBar commit={commit} /></div></section>
    <section><div className="section-title">受影响模块 ({modules.length})</div><div className="module-list">{modules.map(([name, value], index) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.max(12, value / max * 100)}%` }} /></i><strong>+{Math.round(value * .72)}</strong><em>−{Math.round(value * .18)}</em></div>)}</div></section>
    <section className="scope-stats"><div className="section-title">影响范围</div><div><span><Code /> <b>{details?.files.length ?? Object.keys(commit.modules).length * 6}</b><small>文件</small></span><span><Plus /> <b>{compactNumber(commit.additions)}</b><small>添加</small></span><span><Minus /> <b>{compactNumber(commit.deletions)}</b><small>删除</small></span></div></section>
    <section><div className="section-title">风险评估 <span className={`risk ${risk === '高风险' ? 'high' : risk === '中等风险' ? 'medium' : ''}`}>{risk}</span></div><div className="risk-meter"><i /><b style={{ left: `${risk === '高风险' ? 84 : risk === '中等风险' ? 58 : 24}%` }} /></div><div className="risk-labels"><span>低</span><span>中</span><span>高</span></div></section>
    <section><div className="section-title">父提交</div>{commit.parents.slice(0, 2).map((parent, index) => <div className="parent-row" key={parent}><i style={{ background: index ? '#9466ff' : '#9cff57' }} /><code>{parent.slice(0,7)}</code><span>{index ? '合并来源' : '直接父提交'}</span></div>)}</section>
    {analysis && <section className="analysis-result"><div className="section-title"><CheckCircle /> Codex 分析</div><p>{analysis}</p></section>}
    <div className="inspector-actions"><button className="codex-button" onClick={onAnalyze} disabled={analyzing}><Robot weight="fill" />{analyzing ? '正在分析…' : '用 Codex 分析'}</button><button><GitMerge />比较父提交</button></div>
  </aside>;
}

export default function App() {
  const [data, setData] = useState<RepositoryData>(demoRepository); const [isDemo, setIsDemo] = useState(true); const [activeBranch, setActiveBranch] = useState('全部'); const [query, setQuery] = useState('');
  const [selectedHash, setSelectedHash] = useState(demoRepository.commits[5].hash); const [causalOnly, setCausalOnly] = useState(false); const [mode, setMode] = useState<'history'|'causal'|'modules'|'risk'>('history'); const [zoom, setZoom] = useState(100); const [details, setDetails] = useState<CommitDetails | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [analysis, setAnalysis] = useState(''); const [analyzing, setAnalyzing] = useState(false);
  const selected = data.commits.find((commit) => commit.hash === selectedHash) || data.commits[0];
  const rowHeight = zoom < 90 ? 36 : zoom > 110 ? 52 : ROW_HEIGHT; const expandedHeight = zoom < 90 ? 158 : zoom > 110 ? 216 : EXPANDED_HEIGHT;
  const visible = useMemo(() => data.commits.filter((commit) => (activeBranch === '全部' || commit.branch === activeBranch || commit.refs.some((ref) => ref.includes(activeBranch))) && (!query || `${commit.shortHash} ${commit.subject} ${commit.author} ${commit.refs.join(' ')}`.toLowerCase().includes(query.toLowerCase())) && (mode !== 'risk' || commit.deletions > 30 || commit.additions + commit.deletions > 500)), [data, activeBranch, query, mode]);

  useEffect(() => { if (!window.gitAtlas) return; window.gitAtlas.getLastRepository().then((last) => { if (!last) return; setLoading(true); window.gitAtlas!.loadRepository(last).then((repo) => { setData(repo); setIsDemo(false); setSelectedHash(repo.commits[0]?.hash || ''); }).catch(() => null).finally(() => setLoading(false)) }) }, []);
  useEffect(() => { if (!selected || isDemo || !window.gitAtlas) { setDetails(null); return } window.gitAtlas.getCommitDetails(data.path, selected.hash).then(setDetails).catch(() => setDetails(null)) }, [selected?.hash, data.path, isDemo]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.history-toolbar input')?.focus() } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { const index = visible.findIndex((commit) => commit.hash === selectedHash); const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1); if (visible[next]) setSelectedHash(visible[next].hash) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [visible, selectedHash]);

  const openRepository = async () => {
    if (!window.gitAtlas) { setError('请在 Git Atlas 桌面应用中选择本地仓库。当前浏览器预览使用演示数据。'); return }
    setLoading(true); setError(''); try { const repo = await window.gitAtlas.chooseRepository(); if (repo) { setData(repo); setIsDemo(false); setSelectedHash(repo.commits[0]?.hash || ''); setActiveBranch('全部'); setAnalysis('') } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setLoading(false) }
  };
  const analyze = async () => { if (!selected) return; if (!window.gitAtlas || isDemo) { setAnalysis('该提交重构了分支渲染管线，主要影响图谱布局、画布交互和颜色映射。建议重点验证大型仓库下的渲染性能、合并提交路径和缩放后的命中检测。'); return } setAnalyzing(true); setAnalysis(''); try { setAnalysis(await window.gitAtlas.analyzeWithCodex(data.path, selected.hash)) } catch (cause) { setAnalysis(`分析失败：${cause instanceof Error ? cause.message : String(cause)}`) } finally { setAnalyzing(false) } };

  return <main className="app"><div className="titlebar" />
    <nav className="topbar"><div className="logo"><img src="/git-atlas-mark.png" alt="" /><span><strong>Git Atlas</strong><small>可变形因果场</small></span></div><div className="mode-tabs"><button className={mode === 'history' ? 'active' : ''} onClick={() => { setMode('history'); setCausalOnly(false) }}><ClockCounterClockwise />提交演化</button><button className={mode === 'causal' ? 'active' : ''} onClick={() => { setMode('causal'); setCausalOnly(true) }}><Path />因果场</button><button className={mode === 'modules' ? 'active' : ''} onClick={() => setMode('modules')}><TreeStructure />模块影响</button><button className={mode === 'risk' ? 'active' : ''} onClick={() => setMode('risk')}><Warning />风险路径</button></div><div className="semantic-zoom"><span>语义缩放</span><input type="range" min="80" max="120" step="20" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><b>{zoom}%</b></div><label className="causal-toggle"><input type="checkbox" checked={causalOnly} onChange={(event) => setCausalOnly(event.target.checked)} /><i />只看关联路径</label><time>2026年8月28日</time></nav>
    <div className="layout"><Sidebar data={data} activeBranch={activeBranch} onBranch={setActiveBranch} onOpen={openRepository} />
      <section className="history"><header className="history-toolbar"><div><strong>提交演化</strong><span>{visible.length} 个提交{isDemo && ' · 演示数据'}</span></div><label><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提交、作者或哈希" /><kbd>Ctrl K</kbd></label><button onClick={openRepository}><GitPullRequest />打开仓库</button><button onClick={openRepository} aria-label="刷新"><ArrowsClockwise /></button></header>
        {error && <div className="toast"><Warning />{error}<button onClick={() => setError('')}><X /></button></div>}
        {loading && <div className="loading"><ArrowsClockwise /><span>正在读取仓库历史…</span></div>}
        <div className="history-scroll"><div className="column-head"><span>因果拓扑</span><span>提交</span><span>提交信息</span><span>模块热度</span><span>变更规模</span><span>作者</span><span>提交时间</span></div>
          <div className="commit-stack" style={{ height: graphHeight(visible, selectedHash, rowHeight, expandedHeight) }}><GraphCanvas commits={visible} selectedHash={selectedHash} causalOnly={causalOnly} rowHeight={rowHeight} expandedHeight={expandedHeight} />
            {visible.map((commit, index) => <div role="button" tabIndex={0} key={commit.hash} className={`commit-row ${commit.hash === selectedHash ? 'selected' : ''}`} style={{ height: commit.hash === selectedHash ? expandedHeight : rowHeight, gridTemplateRows: `${Math.min(rowHeight, 52)}px 1fr` }} onClick={() => { setSelectedHash(commit.hash); setAnalysis('') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedHash(commit.hash); setAnalysis('') } }}>
              <span className="row-index">{String(index + 1).padStart(2, '0')}</span><span className="graph-space" /><code>{commit.shortHash}</code><span className="subject">{commit.subject}{commit.refs.slice(0,2).map((ref) => <i key={ref}>{ref.replace('HEAD -> ', '')}</i>)}</span><ModuleHeat commit={commit} /><DiffBar commit={commit} /><span className="author">{commit.author}</span><time>{relativeTime(commit.isoDate)}</time>
              {commit.hash === selectedHash && <div className="aperture-detail"><div className="aperture-title"><span><GitCommitIcon />局部因果场</span><small>选中提交周围的拓扑已展开，文字时间轴保持稳定</small></div><div className="impact-grid">{Object.entries(commit.modules).slice(0,4).map(([name,value]) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.min(100, value / Math.max(...Object.values(commit.modules)) * 100)}%` }} /></i><strong>+{Math.round(value * .72)}</strong><em>−{Math.round(value * .18)}</em></div>)}</div><div className="aperture-actions"><button onClick={(event) => { event.stopPropagation(); analyze() }}><Robot />用 Codex 分析</button><button><GitFork />比较父提交</button></div></div>}
            </div>)}
          </div>
        </div><footer className="legend"><span><i style={{ background:'#9cff57' }} />main</span><span><i style={{ background:'#9466ff' }} />feature/causal-lens</span><span><i style={{ background:'#3da8ff' }} />feature/render-pipeline</span><span><GitMerge />合并提交</span><span><GitCommitIcon />分支点</span><span><b />当前 HEAD</span></footer>
      </section>
      {selected && <Inspector commit={selected} details={details} analyzing={analyzing} analysis={analysis} onAnalyze={analyze} />}
    </div>
  </main>;
}
