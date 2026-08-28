export type RefItem = { full: string; short: string; hash: string; track: string; type: 'local' | 'remote' | 'tag' };

export type GitCommit = {
  hash: string; shortHash: string; refs: string[]; subject: string; author: string; isoDate: string;
  parents: string[]; additions: number; deletions: number; modules: Record<string, number>;
  branch: string; tags: string[]; lane: number; color: string;
};

export type RepositoryData = {
  path: string; name: string; branch: string; ahead: number; behind: number; dirtyCount: number;
  commits: GitCommit[]; refs: RefItem[];
};

export type CommitDetails = {
  fullHash: string; shortHash: string; subject: string; author: string; email: string; isoDate: string;
  parents: string[]; files: { file: string; additions: number; deletions: number }[];
};

declare global {
  interface Window {
    gitAtlas?: {
      chooseRepository(): Promise<RepositoryData | null>;
      loadRepository(path: string): Promise<RepositoryData>;
      getLastRepository(): Promise<string | null>;
      getCommitDetails(path: string, hash: string): Promise<CommitDetails>;
      analyzeWithCodex(path: string, hash: string): Promise<string>;
      openExternal(target: string): Promise<void>;
    };
  }
}

