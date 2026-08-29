import { useEffect, useRef } from 'react';
import {
  ArrowElbowUpLeft, ArrowRight, BracketsCurly, ClockCounterClockwise, File, Folder,
  FolderOpen, GitBranch, House, SpinnerGap, WarningCircle, X,
} from '@phosphor-icons/react';
import type { DirectoryListing, RecentRepository } from './types';

type RepositoryBrowserProps = {
  currentPath: string;
  listing: DirectoryListing | null;
  recentRepositories: RecentRepository[];
  pathDraft: string;
  loading: boolean;
  error: string;
  onPathDraft: (value: string) => void;
  onBrowse: (path?: string) => void;
  onLoad: (path: string) => void;
  onClose: () => void;
};

const canonicalPath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase();
const samePath = (left: string, right: string) => canonicalPath(left) === canonicalPath(right);

export default function RepositoryBrowser({
  currentPath, listing, recentRepositories, pathDraft, loading, error,
  onPathDraft, onBrowse, onLoad, onClose,
}: RepositoryBrowserProps) {
  const pathInput = useRef<HTMLInputElement>(null);

  useEffect(() => { pathInput.current?.focus() }, []);

  return <div className="repository-browser" data-repository-browser>
    <header className="repository-browser-header">
      <div><strong>打开本地仓库</strong><span>目录浏览器</span></div>
      <button type="button" onClick={onClose} aria-label="返回分支列表" title="返回分支列表"><X /></button>
    </header>

    <section className="recent-repositories" aria-label="最近仓库">
      <div className="repository-section-title"><span><ClockCounterClockwise />最近仓库</span><small>{recentRepositories.length}</small></div>
      <div className="recent-repository-list">
        {recentRepositories.length === 0 && <p>打开仓库后会保留在这里</p>}
        {recentRepositories.slice(0, 3).map((repository) => {
          const active = samePath(repository.path, currentPath);
          return <button key={repository.path} type="button" className={active ? 'active' : ''} disabled={!repository.available || active} onClick={() => onLoad(repository.path)} title={repository.path}>
            <span className="recent-repository-icon"><BracketsCurly weight={active ? 'fill' : 'regular'} /></span>
            <span><strong>{repository.name}</strong><small>{active ? '当前仓库' : repository.available ? repository.path : '路径已失效'}</small></span>
            {active ? <i>当前</i> : <ArrowRight />}
          </button>;
        })}
      </div>
    </section>

    <section className="local-files" aria-label="本机文件列表">
      <div className="repository-section-title"><span><FolderOpen />本机文件</span>{listing && <small>{listing.entries.length} 项</small>}</div>
      <form className="repository-path" onSubmit={(event) => { event.preventDefault(); onBrowse(pathDraft) }}>
        <button type="button" onClick={() => onBrowse(listing?.parentPath || undefined)} disabled={!listing?.parentPath} aria-label="上一级目录" title="上一级目录"><ArrowElbowUpLeft /></button>
        <label><House /><input ref={pathInput} value={pathDraft} onChange={(event) => onPathDraft(event.target.value)} aria-label="本机文件夹路径" spellCheck={false} /></label>
        <button type="submit" aria-label="前往路径" title="前往路径"><ArrowRight /></button>
      </form>

      {listing?.isRepository && <button type="button" className="open-current-directory" disabled={samePath(listing.path, currentPath)} onClick={() => onLoad(listing.path)}>
        <GitBranch weight="bold" /><span><strong>{samePath(listing.path, currentPath) ? '正在查看当前仓库' : '打开这个 Git 仓库'}</strong><small>{listing.path}</small></span><ArrowRight />
      </button>}

      <div className="directory-list" aria-live="polite">
        {loading && <div className="browser-state"><SpinnerGap className="spin" /><span>正在读取目录</span></div>}
        {!loading && error && <div className="browser-state error"><WarningCircle /><span>{error}</span></div>}
        {!loading && !error && listing?.entries.length === 0 && <div className="browser-state"><Folder /><span>这个文件夹是空的</span></div>}
        {!loading && !error && listing?.entries.map((entry) => entry.type === 'directory'
          ? <div className={`directory-entry ${entry.isRepository ? 'is-repository' : ''}`} key={entry.path} title={entry.path}>
            <button type="button" className="directory-entry-main" onClick={() => onBrowse(entry.path)}>
              {entry.isRepository ? <BracketsCurly weight="duotone" /> : <Folder weight="fill" />}
              <span>{entry.name}</span>{entry.isRepository && <i>Git</i>}
            </button>
            {entry.isRepository && <button type="button" className="directory-entry-open" onClick={() => onLoad(entry.path)} aria-label={`打开仓库 ${entry.name}`}>打开</button>}
          </div>
          : <div className="directory-entry file-entry" key={entry.path} title={entry.path}><File /><span>{entry.name}</span></div>)}
      </div>
    </section>
  </div>;
}
