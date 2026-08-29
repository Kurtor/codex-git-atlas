import { ChartLineUp, ClockCounterClockwise, Code, GitBranch, GitMerge, Path, TreeStructure, Warning } from '@phosphor-icons/react';
import { aggregateAuthors, aggregateModules, collectRelations, commitRiskScore, riskLevel, type AppMode } from './analytics';
import type { GitCommit, RepositoryData } from './types';

const compactNumber = (value: number) => value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);

export const modeCopy = {
  history: { title: '提交演化', description: '沿时间阅读仓库变化，在稳定拓扑中定位关键转折。', Icon: ClockCounterClockwise },
  causal: { title: '因果场', description: '展开当前提交的完整祖先与后继，追踪来源和影响。', Icon: Path },
  modules: { title: '模块影响', description: '聚合模块触达，识别变更扩散、协作边界与耦合热点。', Icon: TreeStructure },
  risk: { title: '风险路径', description: '综合变更规模、删除比例、提交结构与模块跨度，排列检查优先级。', Icon: Warning },
} satisfies Record<AppMode, { title: string; description: string; Icon: typeof ClockCounterClockwise }>;

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="mode-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function HistoryPanel({ commits }: { commits: GitCommit[] }) {
  const authors = aggregateAuthors(commits).slice(0, 4); const merges = commits.filter((commit) => commit.parents.length > 1).length;
  const max = Math.max(1, ...commits.slice(0, 14).map((commit) => commit.additions + commit.deletions));
  return <div className="mode-detail history-detail"><div className="evolution-spark"><div><ChartLineUp /><span>最近变更节奏</span><small>柱高代表单次变更规模</small></div><div className="evolution-bars">{commits.slice(0, 14).reverse().map((commit) => <i key={commit.hash} style={{ height: `${Math.max(8, (commit.additions + commit.deletions) / max * 100)}%` }} title={`${commit.shortHash}，新增 ${commit.additions}，删除 ${commit.deletions}`} />)}</div></div><div className="history-facts"><span><GitMerge />合并提交 <b>{merges}</b></span><span><GitBranch />活跃作者 <b>{authors.length}</b></span><div>{authors.map((author) => <em key={author.name}>{author.name}<b>{author.commits}</b></em>)}</div></div></div>;
}

function CausalPanel({ commits, selected, onSelect }: { commits: GitCommit[]; selected: GitCommit; onSelect: (hash: string) => void }) {
  const relations = collectRelations(commits, selected.hash); const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const ancestors = [...relations.ancestors].map((hash) => byHash.get(hash)).filter(Boolean).slice(0, 3) as GitCommit[];
  const descendants = [...relations.descendants].map((hash) => byHash.get(hash)).filter(Boolean).slice(0, 3) as GitCommit[];
  const group = (label: string, items: GitCommit[], empty: string) => <div className="causal-group"><span>{label}</span>{items.map((commit) => <button key={commit.hash} title={`${commit.shortHash}，${commit.subject}`} onClick={() => onSelect(commit.hash)}><code>{commit.shortHash}</code><b>{commit.subject}</b></button>)}{!items.length && <small>{empty}</small>}</div>;
  return <div className="mode-detail causal-detail">{group('上游祖先', ancestors, '这是路径根部')}<div className="causal-focus"><Path weight="duotone" /><code>{selected.shortHash}</code><strong>{selected.subject}</strong><small>{selected.parents.length} 个直接父提交，{Object.keys(selected.modules).length} 个模块</small></div>{group('下游后继', descendants, '尚无后继提交')}</div>;
}

function ModulePanel({ commits, activeModule, onModule }: { commits: GitCommit[]; activeModule: string; onModule: (name: string) => void }) {
  const modules = aggregateModules(commits).slice(0, 6); const max = modules[0]?.churn || 1;
  return <div className="mode-detail module-detail"><button aria-pressed={activeModule === '全部模块'} className={activeModule === '全部模块' ? 'active' : ''} onClick={() => onModule('全部模块')}><span>全部模块</span><strong>{modules.length}</strong><small>清除筛选</small><i style={{ width: '100%' }} /></button>{modules.map((module) => <button key={module.name} aria-pressed={activeModule === module.name} title={`${module.name}，${module.commits} 次触达，风险 ${module.averageRisk}`} className={activeModule === module.name ? 'active' : ''} onClick={() => onModule(module.name)}><span>{module.name}</span><strong>{compactNumber(module.churn)}</strong><small>{module.commits} 次触达，风险 {module.averageRisk}</small><i style={{ width: `${Math.max(10, module.churn / max * 100)}%` }} /></button>)}</div>;
}

function RiskPanel({ commits, onSelect }: { commits: GitCommit[]; onSelect: (hash: string) => void }) {
  const ranked = commits.map((commit) => ({ commit, score: commitRiskScore(commit) })).sort((a, b) => b.score - a.score);
  const counts = ranked.reduce((sum, item) => ({ ...sum, [riskLevel(item.score)]: sum[riskLevel(item.score)] + 1 }), { high: 0, medium: 0, low: 0 });
  return <div className="mode-detail risk-detail"><div className="risk-totals"><span className="high"><b>{counts.high}</b>高风险</span><span className="medium"><b>{counts.medium}</b>中风险</span><span className="low"><b>{counts.low}</b>低风险</span><small>当前列表仅保留中高风险提交</small></div><div className="risk-queue">{ranked.slice(0, 4).map(({ commit, score }, index) => <button key={commit.hash} title={`${commit.shortHash}，风险 ${score}，${commit.subject}`} onClick={() => onSelect(commit.hash)}><em>0{index + 1}</em><code>{commit.shortHash}</code><span><b>{commit.subject}</b><small>{commit.additions + commit.deletions} 行变更，{commit.parents.length > 1 ? '合并提交' : `${Object.keys(commit.modules).length} 个模块`}</small></span><strong>{score}</strong></button>)}</div></div>;
}

export function ModeWorkspace({ mode, data, commits, selected, activeModule, onModule, onSelect }: { mode: AppMode; data: RepositoryData; commits: GitCommit[]; selected: GitCommit; activeModule: string; onModule: (name: string) => void; onSelect: (hash: string) => void }) {
  const copy = modeCopy[mode]; const churn = commits.reduce((sum, commit) => sum + commit.additions + commit.deletions, 0); const authors = aggregateAuthors(commits); const modules = aggregateModules(commits); const relations = collectRelations(commits, selected.hash); const risky = commits.filter((commit) => commitRiskScore(commit) >= 45);
  const metrics = mode === 'history'
    ? [['范围提交', commits.length, '当前筛选范围'], ['本地分支', data.refs.filter((ref) => ref.type === 'local').length, '按可达性计算'], ['贡献者', authors.length, '独立作者'], ['代码变更', compactNumber(churn), '新增 + 删除']]
    : mode === 'causal'
      ? [['上游祖先', relations.ancestors.size, '完整可达路径'], ['下游后继', relations.descendants.size, '潜在影响范围'], ['直接父级', selected.parents.length, '当前提交'], ['路径提交', relations.all.size, '关联视图']]
      : mode === 'modules'
        ? [['模块总数', modules.length, '当前范围'], ['热点模块', modules[0]?.name || '暂无', '按变更量'], ['跨模块提交', commits.filter((commit) => Object.keys(commit.modules).length > 2).length, '涉及 3+ 模块'], ['模块触达', modules.reduce((sum, module) => sum + module.commits, 0), '累计次数']]
        : [['待检查', risky.length, '中高风险'], ['高风险', risky.filter((commit) => riskLevel(commitRiskScore(commit)) === 'high').length, '建议优先'], ['合并提交', commits.filter((commit) => commit.parents.length > 1).length, '结构性风险'], ['最大评分', Math.max(0, ...commits.map(commitRiskScore)), '满分 100']];
  return <section className={`mode-workspace mode-${mode}`} data-mode={mode}><header className="mode-identity"><div className="mode-name"><h1><copy.Icon weight="duotone" />{copy.title}</h1><p>{copy.description}</p></div><div className="mode-metrics">{metrics.map(([label, value, note]) => <Metric key={String(label)} label={String(label)} value={value} note={String(note)} />)}</div></header>{mode === 'history' ? <HistoryPanel commits={commits} /> : mode === 'causal' ? <CausalPanel commits={commits} selected={selected} onSelect={onSelect} /> : mode === 'modules' ? <ModulePanel commits={commits} activeModule={activeModule} onModule={onModule} /> : <RiskPanel commits={commits} onSelect={onSelect} />}</section>;
}

export function ScopeDossier({ commits }: { commits: GitCommit[] }) {
  const modules = aggregateModules(commits).slice(0, 5); const authors = aggregateAuthors(commits).slice(0, 5); const risks = commits.map(commitRiskScore); const maxModule = modules[0]?.churn || 1;
  return <section className="scope-dossier"><header><span><Code />当前范围档案</span><small>由可见提交实时聚合，不产生后台扫描</small></header><div><article><h3>模块分布</h3>{modules.map((module) => <p key={module.name}><span>{module.name}</span><i><b style={{ width: `${module.churn / maxModule * 100}%` }} /></i><strong>{compactNumber(module.churn)}</strong></p>)}</article><article><h3>贡献者</h3>{authors.map((author, index) => <p key={author.name}><em>{String(index + 1).padStart(2, '0')}</em><span>{author.name}</span><strong>{author.commits} 次提交</strong></p>)}</article><article><h3>质量信号</h3><p><span>平均风险</span><strong>{risks.length ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : 0} / 100</strong></p><p><span>中高风险</span><strong>{risks.filter((score) => score >= 45).length} 个</strong></p><p><span>合并提交</span><strong>{commits.filter((commit) => commit.parents.length > 1).length} 个</strong></p><p><span>净代码变化</span><strong>{compactNumber(commits.reduce((sum, commit) => sum + commit.additions - commit.deletions, 0))} 行</strong></p></article></div></section>;
}
