import {
  ClockCounterClockwise, ChartLineUp, Path, TreeStructure, Warning,
} from '@phosphor-icons/react';
import {
  aggregateAuthors, aggregateModules, collectRelations, commitRiskScore, riskLevel,
  type AppMode,
} from './analytics';
import type { GitCommit, RepositoryData } from './types';

const compactNumber = (value: number) => value > 999 ? `${(value / 1000).toFixed(1)}k` : String(value);

export const modeCopy = {
  history: { title: '提交演化', short: '历史如何演进', description: '沿时间阅读仓库变化，在稳定拓扑中定位关键转折。', Icon: ClockCounterClockwise },
  causal: { title: '因果场', short: '变更为何发生', description: '展开当前提交的完整祖先与后继，追踪来源和影响。', Icon: Path },
  modules: { title: '模块影响', short: '改动影响哪些模块', description: '聚合模块触达，识别变更扩散、协作边界与耦合热点。', Icon: TreeStructure },
  risk: { title: '风险路径', short: '风险从哪来', description: '综合变更规模、删除比例、提交结构与模块跨度，排列检查优先级。', Icon: Warning },
} satisfies Record<AppMode, { title: string; short: string; description: string; Icon: typeof ClockCounterClockwise }>;

function HistoryRibbon({ commits, data }: { commits: GitCommit[]; data: RepositoryData }) {
  const merges = commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'merge')).length;
  const rebases = commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'rebase')).length;
  const authors = aggregateAuthors(commits).length;
  const churn = commits.reduce((sum, commit) => sum + commit.additions + commit.deletions, 0);
  const max = Math.max(1, ...commits.slice(0, 16).map((commit) => commit.additions + commit.deletions));
  return <>
    <div className="ribbon-heading"><ChartLineUp weight="duotone" /><span><strong>最近变更节奏</strong><small>柱高代表单次变更规模</small></span></div>
    <div className="ribbon-spark" aria-label="最近提交变更规模">{commits.slice(0, 16).reverse().map((commit) => <i key={commit.hash} style={{ height: `${Math.max(14, (commit.additions + commit.deletions) / max * 100)}%` }} title={`${commit.shortHash}，${commit.additions + commit.deletions} 行变更`} />)}</div>
    <div className="ribbon-stats">
      <span><b>{commits.length}</b><small>可见提交</small></span>
      <span><b>{data.refs.filter((ref) => ref.type === 'local').length}</b><small>本地分支</small></span>
      <span><b>{merges + rebases}</b><small>{merges} 合并 · {rebases} Rebase</small></span>
      <span><b>{authors}</b><small>贡献者</small></span>
      <span><b>{compactNumber(churn)}</b><small>代码变更</small></span>
    </div>
  </>;
}

function CommitChip({ commit, onSelect }: { commit: GitCommit; onSelect: (hash: string) => void }) {
  return <button type="button" onClick={() => onSelect(commit.hash)} title={commit.subject}><code>{commit.shortHash}</code><span>{commit.subject}</span></button>;
}

function CausalRibbon({ commits, selected, onSelect }: { commits: GitCommit[]; selected: GitCommit; onSelect: (hash: string) => void }) {
  const relations = collectRelations(commits, selected.hash);
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const ancestors = [...relations.ancestors].map((hash) => byHash.get(hash)).filter(Boolean).slice(0, 3) as GitCommit[];
  const descendants = [...relations.descendants].map((hash) => byHash.get(hash)).filter(Boolean).slice(0, 3) as GitCommit[];
  return <div className="causal-ribbon-flow">
    <div className="causal-cluster"><small>上游祖先 · {relations.ancestors.size}</small><div>{ancestors.map((commit) => <CommitChip key={commit.hash} commit={commit} onSelect={onSelect} />)}{!ancestors.length && <em>路径根部</em>}</div></div>
    <span className="causal-arrow">→</span>
    <button type="button" className="causal-current" aria-current="true"><small>当前提交</small><code>{selected.shortHash}</code><strong>{selected.subject}</strong></button>
    <span className="causal-arrow">→</span>
    <div className="causal-cluster"><small>下游后继 · {relations.descendants.size}</small><div>{descendants.map((commit) => <CommitChip key={commit.hash} commit={commit} onSelect={onSelect} />)}{!descendants.length && <em>尚无后继</em>}</div></div>
  </div>;
}

function ModuleRibbon({ commits, activeModule, onModule }: { commits: GitCommit[]; activeModule: string; onModule: (name: string) => void }) {
  const modules = aggregateModules(commits).slice(0, 6);
  const max = modules[0]?.churn || 1;
  return <div className="module-ribbon-list">
    <button type="button" aria-pressed={activeModule === '全部模块'} className={activeModule === '全部模块' ? 'active' : ''} onClick={() => onModule('全部模块')}><span><strong>全部模块</strong><small>{modules.length} 个模块</small></span><b>{commits.length}</b></button>
    {modules.map((module) => <button type="button" key={module.name} aria-pressed={activeModule === module.name} className={activeModule === module.name ? 'active' : ''} onClick={() => onModule(module.name)} title={`${module.name}，${module.commits} 次触达，风险 ${module.averageRisk}`}><span><strong>{module.name}</strong><small>{module.commits} 次触达 · 风险 {module.averageRisk}</small></span><i><em style={{ width: `${Math.max(12, module.churn / max * 100)}%` }} /></i><b>{compactNumber(module.churn)}</b></button>)}
  </div>;
}

function RiskRibbon({ commits, onSelect }: { commits: GitCommit[]; onSelect: (hash: string) => void }) {
  const ranked = commits.map((commit) => ({ commit, score: commitRiskScore(commit) })).sort((a, b) => b.score - a.score);
  const high = ranked.filter((item) => riskLevel(item.score) === 'high').length;
  const medium = ranked.filter((item) => riskLevel(item.score) === 'medium').length;
  return <>
    <div className="risk-ribbon-totals"><span className="high"><b>{high}</b><small>高风险</small></span><span className="medium"><b>{medium}</b><small>中风险</small></span><span><b>{ranked[0]?.score ?? 0}</b><small>最高评分</small></span></div>
    <div className="risk-ribbon-queue"><small>优先检查</small>{ranked.slice(0, 4).map(({ commit, score }, index) => <button type="button" key={commit.hash} onClick={() => onSelect(commit.hash)}><em>0{index + 1}</em><code>{commit.shortHash}</code><span>{commit.subject}</span><b>{score}</b></button>)}</div>
  </>;
}

export function ModeWorkspace({ mode, data, commits, selected, activeModule, onModule, onSelect }: { mode: AppMode; data: RepositoryData; commits: GitCommit[]; selected: GitCommit; activeModule: string; onModule: (name: string) => void; onSelect: (hash: string) => void }) {
  return <section className={`mode-workspace mode-${mode}`} data-mode={mode} aria-label={`${modeCopy[mode].title}上下文`}>
    {mode === 'history' && <HistoryRibbon commits={commits} data={data} />}
    {mode === 'causal' && <CausalRibbon commits={commits} selected={selected} onSelect={onSelect} />}
    {mode === 'modules' && <ModuleRibbon commits={commits} activeModule={activeModule} onModule={onModule} />}
    {mode === 'risk' && <RiskRibbon commits={commits} onSelect={onSelect} />}
  </section>;
}

export function ScopeDossier({ commits }: { commits: GitCommit[] }) {
  const modules = aggregateModules(commits).slice(0, 4);
  const authors = aggregateAuthors(commits).slice(0, 4);
  const risks = commits.map(commitRiskScore);
  return <section className="scope-dossier"><header><span>当前范围档案</span><small>实时聚合</small></header><div><span><b>{modules.map((module) => module.name).join(' · ') || '暂无模块'}</b><small>模块分布</small></span><span><b>{authors.map((author) => author.name).join(' · ') || '暂无作者'}</b><small>主要贡献者</small></span><span><b>{risks.length ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : 0} / 100</b><small>平均风险</small></span><span><b>{commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'merge')).length} 合并 · {commits.filter((commit) => commit.operations.some((operation) => operation.kind === 'rebase')).length} Rebase</b><small>分支行为</small></span></div></section>;
}
