import type { GitCommit } from './types';

export type AppMode = 'history' | 'causal' | 'modules' | 'risk';

export function commitRiskScore(commit: GitCommit) {
  const churn = commit.additions + commit.deletions;
  const deletionRatio = commit.deletions / Math.max(1, churn);
  const scale = Math.log10(churn + 1) * 19;
  const structural = Math.min(18, Object.keys(commit.modules).length * 2.5) + (commit.parents.length > 1 ? 14 : 0);
  return Math.min(100, Math.round(scale + deletionRatio * 34 + structural));
}

export function riskLevel(score: number) {
  return score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
}

export function collectRelations(commits: GitCommit[], selectedHash: string) {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const children = new Map<string, string[]>();
  commits.forEach((commit) => commit.parents.forEach((parent) => children.set(parent, [...(children.get(parent) || []), commit.hash])));
  const ancestors = new Set<string>(); const descendants = new Set<string>();
  const walk = (start: string, next: (hash: string) => string[], target: Set<string>) => {
    const queue = [...next(start)];
    while (queue.length) { const hash = queue.shift()!; if (target.has(hash)) continue; target.add(hash); queue.push(...next(hash)) }
  };
  walk(selectedHash, (hash) => byHash.get(hash)?.parents.filter((parent) => byHash.has(parent)) || [], ancestors);
  walk(selectedHash, (hash) => children.get(hash) || [], descendants);
  return { ancestors, descendants, all: new Set([selectedHash, ...ancestors, ...descendants]) };
}

export type ModuleStat = { name: string; churn: number; commits: number; averageRisk: number };

export function aggregateModules(commits: GitCommit[]) {
  const values = new Map<string, { churn: number; commits: number; risk: number }>();
  commits.forEach((commit) => Object.entries(commit.modules).forEach(([name, churn]) => {
    const current = values.get(name) || { churn: 0, commits: 0, risk: 0 };
    current.churn += churn; current.commits += 1; current.risk += commitRiskScore(commit); values.set(name, current);
  }));
  return [...values.entries()].map(([name, value]) => ({ name, churn: value.churn, commits: value.commits, averageRisk: Math.round(value.risk / value.commits) })).sort((a, b) => b.churn - a.churn);
}

export function aggregateAuthors(commits: GitCommit[]) {
  const values = new Map<string, number>();
  commits.forEach((commit) => values.set(commit.author, (values.get(commit.author) || 0) + 1));
  return [...values.entries()].map(([name, commits]) => ({ name, commits })).sort((a, b) => b.commits - a.commits);
}
