const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAtlas', {
  chooseRepository: () => ipcRenderer.invoke('repo:choose'),
  loadRepository: (repoPath) => ipcRenderer.invoke('repo:load', repoPath),
  getLastRepository: () => ipcRenderer.invoke('repo:last'),
  getRecentRepositories: () => ipcRenderer.invoke('repo:recent'),
  browseDirectory: (directoryPath) => ipcRenderer.invoke('repo:browse', directoryPath),
  getCodexProjectContext: () => ipcRenderer.invoke('codex:context'),
  getFollowCodex: () => ipcRenderer.invoke('follow:get'),
  setFollowCodex: (enabled) => ipcRenderer.invoke('follow:set', enabled),
  getCommitDetails: (repoPath, hash) => ipcRenderer.invoke('commit:details', repoPath, hash),
  compareWithParent: (repoPath, hash) => ipcRenderer.invoke('commit:compare-parent', repoPath, hash),
  analyzeWithCodex: (repoPath, hash) => ipcRenderer.invoke('codex:analyze', repoPath, hash),
  openExternal: (target) => ipcRenderer.invoke('external:open', target),
});
