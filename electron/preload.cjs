const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAtlas', {
  chooseRepository: () => ipcRenderer.invoke('repo:choose'),
  loadRepository: (repoPath) => ipcRenderer.invoke('repo:load', repoPath),
  getLastRepository: () => ipcRenderer.invoke('repo:last'),
  getCommitDetails: (repoPath, hash) => ipcRenderer.invoke('commit:details', repoPath, hash),
  analyzeWithCodex: (repoPath, hash) => ipcRenderer.invoke('codex:analyze', repoPath, hash),
  openExternal: (target) => ipcRenderer.invoke('external:open', target),
});
