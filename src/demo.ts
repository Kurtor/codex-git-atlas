import type { GitCommit, RepositoryData } from './types';

const colors = ['#68a8e8', '#9b8ae7', '#d4a855', '#52ad9c', '#d87575'];
const subjects = ['优化因果场布局算法','改进拓扑小图密度计算','语义缩放交互体验优化','模块热度带渲染重构','提交卡片对齐与可读性增强','重构分支渲染管线','画布交互命中检测优化','颜色映射策略抽象化','性能测试基准更新','修复缩放后连线偏移问题','因果路径过滤器实现','提交详情面板重构','风险评分算法 v2','文档：因果场说明更新','更新依赖项','初始化项目结构'];
const branches = ['main','main','main','main','feature/causal-lens','main','feature/render-pipeline','feature/render-pipeline','perf/benchmark','feature/render-pipeline','feature/causal-lens','feature/causal-lens','feature/causal-lens','docs/readme-upd','chore/deps-bump','main'];
const authors = ['演示作者 A','演示作者 A','演示作者 A','演示作者 A','演示作者 B','演示作者 A','演示作者 B','演示作者 C','演示作者 C','演示作者 B','演示作者 A','演示作者 B','演示作者 C','演示作者 A','演示作者 B','演示作者 A'];

const commits: GitCommit[] = subjects.map((subject, index) => {
  const lane = branches[index] === 'main' ? 0 : branches[index].includes('causal') ? 1 : branches[index].includes('render') ? 2 : branches[index].includes('perf') ? 3 : 4;
  const hash = `${['f3b8d1a','e9a7b56','c4d2f90','9b7f6c3','b1e4a22','a7c2e18','d6f3a91','7c9b3d0','3e2d9f7','2b7e6c1','8a1d2b4','f0c3b98','1a9b7e2','0d6e4f1','b4c5d6e','9f8e7d6'][index]}000000000000000000000000000000000`;
  const additions = [142,98,73,210,56,312,118,89,67,34,41,29,63,17,5,12][index];
  const deletions = [27,16,11,34,9,87,21,14,10,5,6,4,8,2,1,0][index];
  const memberships = ['main'];
  if (index >= 4) memberships.push('feature/causal-lens');
  if (index >= 6) memberships.push('feature/render-pipeline');
  if (index >= 8) memberships.push('perf/benchmark');
  return { hash, shortHash: hash.slice(0,7), refs: index === 0 ? ['HEAD -> main'] : index === 4 ? ['feature/causal-lens'] : [], subject, author: authors[index], isoDate: new Date(Date.now() - index * 9 * 3600_000).toISOString(), parents: index < subjects.length - 1 ? [`${['e9a7b56','c4d2f90','9b7f6c3','b1e4a22','a7c2e18','d6f3a91','7c9b3d0','3e2d9f7','2b7e6c1','8a1d2b4','f0c3b98','1a9b7e2','0d6e4f1','b4c5d6e','9f8e7d6',''][index]}000000000000000000000000000000000`] : [], additions, deletions, modules: { '渲染管线': additions, '画布交互': Math.round(additions*.42), '颜色映射': Math.round(additions*.27), '性能测试': Math.round(additions*.15) }, branch: branches[index], branches: memberships, tags: index === 13 ? ['v1.2.0'] : [], lane, color: colors[lane] };
});

commits[5].parents = [commits[6].hash, commits[7].hash];

export const demoRepository: RepositoryData = {
  path: 'D:\\Projects\\codex-git-atlas', name: 'codex-git-atlas', branch: 'main', ahead: 1, behind: 0, dirtyCount: 3, commits,
  refs: [
    { full:'refs/heads/main', short:'main', hash:'f3b8d1a', track:'↑1', type:'local' },
    { full:'refs/heads/feature/causal-lens', short:'feature/causal-lens', hash:'b1e4a22', track:'', type:'local' },
    { full:'refs/heads/feature/render-pipeline', short:'feature/render-pipeline', hash:'d6f3a91', track:'', type:'local' },
    { full:'refs/heads/perf/benchmark', short:'perf/benchmark', hash:'3e2d9f7', track:'', type:'local' },
    { full:'refs/heads/refactor/state-store', short:'refactor/state-store', hash:'2b7e6c1', track:'', type:'local' },
    { full:'refs/heads/fix/tooltip-bug', short:'fix/tooltip-bug', hash:'8a1d2b4', track:'', type:'local' },
    { full:'refs/tags/v1.2.0', short:'v1.2.0', hash:'0d6e4f1', track:'', type:'tag' },
    { full:'refs/tags/v1.1.0', short:'v1.1.0', hash:'b4c5d6e', track:'', type:'tag' },
    { full:'refs/tags/v1.0.0-beta.3', short:'v1.0.0-beta.3', hash:'9f8e7d6', track:'', type:'tag' },
  ],
};
