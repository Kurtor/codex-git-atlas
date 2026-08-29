export type RefItem = { full: string; short: string; hash: string; track: string; type: 'local' | 'remote' | 'tag' };

export type BranchOperation = {
  kind: 'merge' | 'rebase'; source: string; target: string;
  evidence: 'commit-parents' | 'local-reflog'; parentCount?: number; recordedAt?: string;
};

export type GitCommit = {
  hash: string; shortHash: string; refs: string[]; subject: string; author: string; isoDate: string;
  parents: string[]; additions: number; deletions: number; modules: Record<string, number>;
  branch: string; branches: string[]; tags: string[]; operations: BranchOperation[]; lane: number; color: string;
};

export type RepositoryData = {
  path: string; name: string; branch: string; ahead: number; behind: number; dirtyCount: number;
  commits: GitCommit[]; refs: RefItem[];
};

export type RecentRepository = { path: string; name: string; available: boolean };

export type DirectoryEntry = {
  path: string; name: string; type: 'directory' | 'file'; isRepository: boolean;
};

export type DirectoryListing = {
  path: string; parentPath: string | null; isRepository: boolean; entries: DirectoryEntry[];
};

export type GitAction = 'fetch' | 'pull' | 'push' | 'stage-all' | 'unstage-all' | 'commit' | 'switch-branch' | 'create-branch';

export type GitWorkspaceFile = {
  path: string; index: string; worktree: string; staged: boolean; unstaged: boolean; untracked: boolean;
};

export type GitWorkspaceStatus = {
  branch: string; upstream: string; ahead: number; behind: number; clean: boolean;
  totalFiles: number; staged: number; unstaged: number; untracked: number; files: GitWorkspaceFile[];
};

export type GitActionResult = { action: GitAction; command: string; summary: string; output: string };

export type CommitDetails = {
  fullHash: string; shortHash: string; subject: string; author: string; email: string; isoDate: string;
  parents: string[]; files: { file: string; additions: number; deletions: number }[];
};

export type ParentComparison = {
  parentHash: string | null; additions: number; deletions: number;
  files: { file: string; additions: number; deletions: number }[];
};

export type CodexProjectContext = {
  status: 'checking' | 'ready' | 'unavailable' | 'not-git' | 'ambiguous';
  projectId?: string | null; projectName?: string; projectPath?: string | null; repoPath?: string;
  source?: 'selected-project' | 'active-workspace-roots'; candidates?: string[]; message?: string; observedAt: number;
};

declare global {
  interface Window {
    gitAtlas?: {
      chooseRepository(): Promise<RepositoryData | null>;
      loadRepository(path: string): Promise<RepositoryData>;
      getLastRepository(): Promise<string | null>;
      getRecentRepositories(): Promise<RecentRepository[]>;
      browseDirectory(path?: string): Promise<DirectoryListing>;
      getWorkspaceStatus(path: string): Promise<GitWorkspaceStatus>;
      runGitAction(path: string, action: GitAction, payload?: { message?: string; branch?: string }): Promise<GitActionResult>;
      getCodexProjectContext(): Promise<CodexProjectContext>;
      getFollowCodex(): Promise<boolean>;
      setFollowCodex(enabled: boolean): Promise<boolean>;
      getCommitDetails(path: string, hash: string): Promise<CommitDetails>;
      compareWithParent(path: string, hash: string): Promise<ParentComparison>;
      analyzeWithCodex(path: string, hash: string): Promise<string>;
      openExternal(target: string): Promise<void>;
    };
  }
}
