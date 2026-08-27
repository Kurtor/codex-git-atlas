'use client';

import { useEffect, useMemo, useState } from 'react';

type Commit = { hash: string; branch: string; message: string; author: string; time: string; date: string; color: string; tags?: string[]; lane: number };

const demoCommits: Commit[] = [
  { hash: 'a7c2e18', branch: 'main', message: 'Ship keyboard-first branch explorer', author: 'Maya Chen', time: '12 min ago', date: 'Aug 27, 2026 · 17:42', color: '#d9ff43', tags: ['HEAD', 'origin/main'], lane: 0 },
  { hash: '9d41bc3', branch: 'main', message: 'Merge branch feature/command-palette', author: 'Maya Chen', time: '38 min ago', date: 'Aug 27, 2026 · 17:16', color: '#d9ff43', lane: 0 },
  { hash: 'fe07a65', branch: 'feature/command-palette', message: 'Add quick switcher and fuzzy search', author: 'Jon Bell', time: '1 hr ago', date: 'Aug 27, 2026 · 16:48', color: '#ff7a5c', tags: ['feature/command-palette'], lane: 1 },
  { hash: '60cda92', branch: 'feature/command-palette', message: 'Wire repository actions to shortcuts', author: 'Jon Bell', time: '2 hrs ago', date: 'Aug 27, 2026 · 15:51', color: '#ff7a5c', lane: 1 },
  { hash: '6f24ee0', branch: 'main', message: 'Refine graph spacing for dense histories', author: 'Priya Shah', time: '3 hrs ago', date: 'Aug 27, 2026 · 14:32', color: '#d9ff43', tags: ['v0.4.0'], lane: 0 },
  { hash: '21af8d7', branch: 'fix/windows-paths', message: 'Normalize Windows worktree paths', author: 'Alex Kim', time: 'Yesterday', date: 'Aug 26, 2026 · 21:08', color: '#8c7cff', tags: ['fix/windows-paths'], lane: 2 },
  { hash: 'beb4701', branch: 'main', message: 'Add commit detail inspector', author: 'Maya Chen', time: 'Yesterday', date: 'Aug 26, 2026 · 18:20', color: '#d9ff43', lane: 0 },
  { hash: '47ca103', branch: 'experiment/minimap', message: 'Prototype repository minimap', author: 'Sam Ortiz', time: '2 days ago', date: 'Aug 25, 2026 · 13:06', color: '#45c9ff', tags: ['experiment/minimap'], lane: 3 },
  { hash: '4fb1d85', branch: 'main', message: 'Establish dark visual language', author: 'Maya Chen', time: '2 days ago', date: 'Aug 25, 2026 · 09:44', color: '#d9ff43', lane: 0 },
];

function Icon({ children }: { children: string }) { return <span className="icon" aria-hidden="true">{children}</span> }

export default function Home() {
  const [data, setData] = useState(demoCommits);
  const [query, setQuery] = useState('');
  const [activeBranch, setActiveBranch] = useState('All branches');
  const [selected, setSelected] = useState(demoCommits[0]);
  const [showImport, setShowImport] = useState(false);
  const [rawLog, setRawLog] = useState('');
  const [repoName, setRepoName] = useState('Kurtor / codex-git-atlas');
  const liveBranches = useMemo(() => Array.from(new Map(data.map((item) => [item.branch, item])).values()).map((item) => ({ name: item.branch, color: item.color, count: data.filter((commit) => commit.branch === item.branch).length })), [data]);
  const visibleCommits = useMemo(() => data.filter((commit) => {
    const q = query.toLowerCase();
    return (activeBranch === 'All branches' || commit.branch === activeBranch) && (!q || `${commit.message} ${commit.author} ${commit.hash} ${commit.branch}`.toLowerCase().includes(q));
  }), [query, activeBranch, data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowImport(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.search input')?.focus() }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !showImport) {
        event.preventDefault(); const current = visibleCommits.findIndex((item) => item.hash === selected.hash); const next = event.key === 'ArrowDown' ? Math.min(current + 1, visibleCommits.length - 1) : Math.max(current - 1, 0); if (visibleCommits[next]) setSelected(visibleCommits[next]);
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [selected, visibleCommits, showImport]);

  const importHistory = () => {
    const palette = ['#d9ff43','#ff7a5c','#8c7cff','#45c9ff','#ffcc55']; const lanes = new Map<string, number>();
    const parsed = rawLog.split(/\r?\n/).filter(Boolean).map((line, index) => {
      const [hash, refs = '', message = 'Untitled commit', author = 'Unknown', iso = '', parents = ''] = line.split('\t');
      const cleanRefs = refs.replace('HEAD -> ', '').split(',').map((ref) => ref.trim().replace(/^origin\//, '')).filter((ref) => ref && !ref.includes('tag:'));
      const branch = cleanRefs[0] || (parents.trim().split(/\s+/).length > 1 ? `merge/${hash}` : 'main'); if (!lanes.has(branch)) lanes.set(branch, Math.min(lanes.size, 4)); const lane = lanes.get(branch) ?? 0;
      const date = iso ? new Date(iso) : new Date();
      return { hash, branch, message, author, time: index === 0 ? 'Latest' : `${index} commit${index > 1 ? 's' : ''} ago`, date: date.toLocaleString(), color: palette[lane], tags: cleanRefs.length ? cleanRefs : undefined, lane } satisfies Commit;
    }).filter((item) => item.hash);
    if (parsed.length) { setData(parsed); setSelected(parsed[0]); setActiveBranch('All branches'); setRepoName('Imported repository'); setShowImport(false); setRawLog('') }
  };

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">GA</div><div className="brand-copy"><strong>Git Atlas</strong><span>for Codex</span></div>
      <button className="repo-switcher" type="button" onClick={() => setShowImport(true)}><span className="repo-icon">⌘</span><span><small>Repository</small><strong>{repoName}</strong></span><span className="chevron">⌄</span></button>
      <div className="top-actions"><span className="sync-state"><i /> Ready</span><button className="icon-button" aria-label="Restore demo" onClick={() => { setData(demoCommits); setSelected(demoCommits[0]); setRepoName('Kurtor / codex-git-atlas') }}>↻</button><button className="primary-button" onClick={() => setShowImport(true)}><span>＋</span> Open repository</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-section"><p className="eyebrow">Workspace</p><button className="nav-item active"><Icon>⑂</Icon> Branch graph <kbd>G</kbd></button><button className="nav-item"><Icon>◌</Icon> Working tree <span className="count-pill">3</span></button><button className="nav-item"><Icon>⌁</Icon> Pull requests <span className="count-pill">2</span></button></div>
        <div className="sidebar-section branches"><div className="section-heading"><p className="eyebrow">Local branches</p><button aria-label="Add branch">＋</button></div>
          <button className={activeBranch === 'All branches' ? 'branch-row selected' : 'branch-row'} onClick={() => setActiveBranch('All branches')}><span className="all-dot">✣</span><span>All branches</span><small>{data.length}</small></button>
          {liveBranches.map((branch) => <button key={branch.name} className={activeBranch === branch.name ? 'branch-row selected' : 'branch-row'} onClick={() => setActiveBranch(branch.name)}><i style={{ background: branch.color }} /><span>{branch.name}</span><small>{branch.count}</small></button>)}
        </div>
        <div className="codex-card"><div className="codex-card-head"><span>✦</span><strong>Ask Codex</strong></div><p>Understand this history without leaving the graph.</p><button onClick={() => navigator.clipboard.writeText(`Explain commit ${selected.hash} (${selected.message}) in this repository. Cover intent, important changes, and risks.`)}>Copy explanation prompt <span>→</span></button></div>
        <div className="sidebar-footer"><span>⌘</span><span><small>LOCAL WORKTREE</small><strong>Clean · main</strong></span></div>
      </aside>
      <section className="graph-panel">
        <div className="graph-header"><div><p className="eyebrow">History</p><h1>{activeBranch}</h1></div><div className="graph-tools"><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commits…" /><kbd>⌘ K</kbd></label><button className="tool-button">◎ Focus</button><button className="tool-button">☷</button></div></div>
        <div className="timeline-head"><span>Graph</span><span>Commit</span><span>Author</span><span>When</span></div>
        <div className="commit-list">{visibleCommits.map((commit) => <button key={commit.hash} className={selected.hash === commit.hash ? 'commit-row active' : 'commit-row'} onClick={() => setSelected(commit)}>
          <div className="graph-cell" aria-hidden="true">{[0,1,2,3].map((lane) => <span key={lane} className="lane" style={{ left: 15 + lane * 14, borderColor: lane === 0 ? '#d9ff43' : lane === 1 ? '#ff7a5c' : lane === 2 ? '#8c7cff' : '#45c9ff', opacity: lane <= commit.lane || commit.lane === 0 ? .55 : .08 }} />)}<i className="commit-node" style={{ left: 10 + commit.lane * 14, background: commit.color, boxShadow: `0 0 0 4px ${commit.color}20` }} /></div>
          <div className="commit-copy"><strong>{commit.message}</strong><div><code>{commit.hash}</code>{commit.tags?.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div></div>
          <div className="author"><span>{commit.author.split(' ').map(n => n[0]).join('')}</span><strong>{commit.author}</strong></div><time>{commit.time}</time>
        </button>)}{visibleCommits.length === 0 && <div className="empty-state">No commits match “{query}”.</div>}</div>
        <div className="graph-status"><span><i className="green-dot" /> {visibleCommits.length} commits visible</span><span>Scroll to explore history</span></div>
      </section>
      <aside className="inspector">
        <div className="inspector-head"><p className="eyebrow">Commit details</p><button aria-label="Open on GitHub" onClick={() => window.open('https://github.com/Kurtor/codex-git-atlas', '_blank')}>↗</button></div><div className="commit-title"><span className="large-node" style={{ background: selected.color }} /><h2>{selected.message}</h2></div><div className="hash-line"><code>{selected.hash}</code><button aria-label="Copy hash" onClick={() => navigator.clipboard.writeText(selected.hash)}>▣</button></div>
        <div className="meta-grid"><span>Author</span><strong>{selected.author}</strong><span>Committed</span><strong>{selected.date}</strong><span>Branch</span><strong className="branch-name"><i style={{ background: selected.color }} />{selected.branch}</strong></div><div className="divider" />
        <div className="change-summary"><div><p className="eyebrow">Changes</p><strong>7 files changed</strong></div><div className="diff-total"><b>+184</b><em>−32</em></div></div><div className="diff-bar"><i /><i /><i /></div>
        <div className="files"><div><span className="file-badge ts">TS</span><p><strong>app/graph.tsx</strong><small>Modified</small></p><b>+92</b><em>−18</em></div><div><span className="file-badge css">#</span><p><strong>app/globals.css</strong><small>Modified</small></p><b>+61</b><em>−8</em></div><div><span className="file-badge md">M</span><p><strong>README.md</strong><small>Modified</small></p><b>+31</b><em>−6</em></div></div>
        <button className="inspect-button" onClick={() => navigator.clipboard.writeText(`Inspect git commit ${selected.hash}. Summarize what changed, why, likely regressions, and suggested tests.`)}>Copy Codex inspection prompt <span>↗</span></button><div className="shortcut-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>⌘ K</kbd> Search</div>
      </aside>
    </div>
    {showImport && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) setShowImport(false) }}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="modal-head"><div><p className="eyebrow">Open a repository</p><h2 id="import-title">Bring your Git history into focus.</h2></div><button onClick={() => setShowImport(false)} aria-label="Close">×</button></div>
      <p className="modal-copy">Run this read-only command inside any Git repository, then paste the output below. Your history stays in this browser.</p>
      <div className="command-box"><code>git log --all --date=iso-strict --pretty=format:&quot;%h%x09%D%x09%s%x09%an%x09%aI%x09%P&quot;</code><button onClick={() => navigator.clipboard.writeText('git log --all --date=iso-strict --pretty=format:"%h%x09%D%x09%s%x09%an%x09%aI%x09%P"')}>Copy</button></div>
      <label className="paste-label">Git log output<textarea autoFocus value={rawLog} onChange={(e) => setRawLog(e.target.value)} placeholder={'a7c2e18\tHEAD -> main, origin/main\tShip branch explorer\tMaya Chen\t2026-08-27T17:42:00+08:00\t9d41bc3'} /></label>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setShowImport(false)}>Cancel</button><button className="primary-button" disabled={!rawLog.trim()} onClick={importHistory}>Visualize history <span>→</span></button></div>
    </section></div>}
  </main>
}
