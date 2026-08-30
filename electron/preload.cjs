const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAtlas', {
  chooseRepository: () => ipcRenderer.invoke('repo:choose'),
  loadRepository: (repoPath) => ipcRenderer.invoke('repo:load', repoPath),
  getLastRepository: () => ipcRenderer.invoke('repo:last'),
  getRecentRepositories: () => ipcRenderer.invoke('repo:recent'),
  browseDirectory: (directoryPath) => ipcRenderer.invoke('repo:browse', directoryPath),
  getWorkspaceStatus: (repoPath) => ipcRenderer.invoke('git:status', repoPath),
  runGitAction: (repoPath, action, payload) => ipcRenderer.invoke('git:action', repoPath, action, payload),
  getCodexProjectContext: () => ipcRenderer.invoke('codex:context'),
  getCodexEvidenceEnabled: () => ipcRenderer.invoke('codex:evidence-enabled'),
  setCodexEvidenceEnabled: (enabled) => ipcRenderer.invoke('codex:evidence-set-enabled', enabled),
  loadCodexEvidence: (repoPath, threadId) => ipcRenderer.invoke('codex:evidence-load', repoPath, threadId),
  getFollowCodex: () => ipcRenderer.invoke('follow:get'),
  setFollowCodex: (enabled) => ipcRenderer.invoke('follow:set', enabled),
  getCommitDetails: (repoPath, hash) => ipcRenderer.invoke('commit:details', repoPath, hash),
  compareWithParent: (repoPath, hash) => ipcRenderer.invoke('commit:compare-parent', repoPath, hash),
  analyzeWithCodex: (repoPath, hash) => ipcRenderer.invoke('codex:analyze', repoPath, hash),
  openExternal: (target) => ipcRenderer.invoke('external:open', target),
});
