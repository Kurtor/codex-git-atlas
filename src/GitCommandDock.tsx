import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise, CheckCircle, CloudArrowDown, CloudArrowUp, GitBranch, GitCommit,
  GitDiff, Plus, TerminalWindow, TrayArrowDown, TrayArrowUp, Warning, X,
} from '@phosphor-icons/react';
import type { GitAction, GitActionResult, GitWorkspaceStatus } from './types';

type Props = {
  status: GitWorkspaceStatus | null;
  branches: string[];
  loading: boolean;
  running: GitAction | null;
  result: GitActionResult | null;
  error: string;
  onRefresh: () => void;
  onRun: (action: GitAction, payload?: { message?: string; branch?: string }) => void;
  onClose: () => void;
};

const actionLabel: Record<GitAction, string> = {
  fetch: '获取远端', pull: '快进拉取', push: '推送分支', 'stage-all': '暂存全部',
  'unstage-all': '取消暂存', commit: '创建提交', 'switch-branch': '切换分支', 'create-branch': '新建分支',
};

export default function GitCommandDock({ status, branches, loading, running, result, error, onRefresh, onRun, onClose }: Props) {
  const [confirmation, setConfirmation] = useState<'pull' | 'push' | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const dirtyCount = status?.totalFiles || 0;
  const localBranches = useMemo(() => [...new Set(branches)].sort((left, right) => left.localeCompare(right)), [branches]);

  useEffect(() => {
    const fallback = localBranches.find((branch) => branch !== status?.branch) || localBranches[0] || '';
    setSelectedBranch((current) => localBranches.includes(current) ? current : fallback);
  }, [localBranches, status?.branch]);

  useEffect(() => {
    if (result?.action === 'commit') setCommitMessage('');
    if (result?.action === 'create-branch') setNewBranch('');
  }, [result]);

  const run = (action: GitAction, payload?: { message?: string; branch?: string }) => {
    setConfirmation(null); onRun(action, payload);
  };

  return <section className="git-command-dock" aria-label="Git 快捷操作台" data-git-command-dock>
    <header className="git-command-header">
      <div className="git-command-title"><TerminalWindow /><span><strong>Git 快捷操作</strong><small><kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>P</kbd></small></span></div>
      <div className="git-command-branch"><GitBranch /><span>{status?.branch || '读取中'}</span>{status?.upstream && <small>跟踪 {status.upstream}</small>}</div>
      <div className="git-command-header-actions"><button type="button" onClick={onRefresh} disabled={loading || Boolean(running)} title="刷新工作区状态" aria-label="刷新工作区状态"><ArrowsClockwise className={loading ? 'spin' : ''} /></button><button type="button" onClick={onClose} aria-label="关闭 Git 操作台"><X /></button></div>
    </header>

    <div className="git-command-grid">
      <section className="git-sync-section">
        <div className="git-section-heading"><span>远端同步</span><small>仅普通推送</small></div>
        <div className="git-sync-actions">
          <button type="button" data-git-action="fetch" onClick={() => run('fetch')} disabled={Boolean(running)}><CloudArrowDown /><span><strong>获取</strong><small>fetch --prune</small></span></button>
          <button type="button" data-git-action="pull" onClick={() => setConfirmation('pull')} disabled={Boolean(running) || !status?.upstream} title={!status?.upstream ? '当前分支尚未配置上游' : undefined}><TrayArrowDown /><span><strong>拉取</strong><small>{status?.upstream ? '仅允许快进' : '未配置上游'}</small></span></button>
          <button type="button" data-git-action="push" onClick={() => setConfirmation('push')} disabled={Boolean(running)}><CloudArrowUp /><span><strong>推送</strong><small>{status?.upstream || '自动关联 origin'}</small></span></button>
        </div>
        {confirmation && <div className={`git-confirm ${confirmation}`}><Warning /><span>{confirmation === 'pull' ? '将以 --ff-only 更新当前分支' : `将推送 ${status?.branch || '当前分支'}，不会强推`}</span><button type="button" onClick={() => run(confirmation)}>确认</button><button type="button" onClick={() => setConfirmation(null)}>取消</button></div>}
      </section>

      <section className="git-worktree-section">
        <div className="git-section-heading"><span>工作区</span><small>{status?.clean ? '干净' : `${dirtyCount} 项状态`}</small></div>
        <div className="git-status-numbers"><span><b>{status?.staged ?? 0}</b><small>已暂存</small></span><span><b>{status?.unstaged ?? 0}</b><small>未暂存</small></span><span><b>{status?.untracked ?? 0}</b><small>未跟踪</small></span></div>
        <div className="git-stage-actions"><button type="button" data-git-action="stage-all" onClick={() => run('stage-all')} disabled={Boolean(running) || dirtyCount === 0}><TrayArrowUp />暂存全部</button><button type="button" data-git-action="unstage-all" onClick={() => run('unstage-all')} disabled={Boolean(running) || !status?.staged}><GitDiff />取消暂存</button></div>
        <div className="git-file-preview">{status?.files.slice(0, 4).map((file) => <span key={`${file.index}${file.worktree}${file.path}`} title={file.path}><code>{file.untracked ? '??' : `${file.index}${file.worktree}`}</code>{file.path}</span>)}{status && status.totalFiles > 4 && <small>另有 {status.totalFiles - 4} 个文件</small>}{status?.clean && <span className="clean"><CheckCircle />没有未提交更改</span>}</div>
      </section>

      <section className="git-branch-section">
        <div className="git-section-heading"><span>分支</span><small>{localBranches.length} 个本地分支</small></div>
        <label className="git-select-row"><GitBranch /><select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} aria-label="选择本地分支">{localBranches.map((branch) => <option key={branch} value={branch}>{branch}{branch === status?.branch ? '（当前）' : ''}</option>)}</select><button type="button" onClick={() => run('switch-branch', { branch: selectedBranch })} disabled={Boolean(running) || !status?.clean || !selectedBranch || selectedBranch === status?.branch}>切换</button></label>
        <label className="git-new-branch"><Plus /><input value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="新分支名称" spellCheck={false} /><button type="button" onClick={() => run('create-branch', { branch: newBranch })} disabled={Boolean(running) || !status?.clean || !newBranch.trim()}>创建</button></label>
        {!status?.clean && <p>工作区有更改时暂停切换与新建，避免修改被带到其他分支。</p>}
      </section>
    </div>

    <form className="git-commit-bar" onSubmit={(event) => { event.preventDefault(); run('commit', { message: commitMessage }) }}>
      <GitCommit /><label><span>提交说明</span><input value={commitMessage} maxLength={200} onChange={(event) => setCommitMessage(event.target.value.replace(/[\r\n]/g, ''))} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.form?.requestSubmit() }} placeholder={status?.staged ? '说明这次改动的意图' : '先暂存需要提交的更改'} /></label><kbd>Ctrl Enter</kbd><button type="submit" disabled={Boolean(running) || !status?.staged || !commitMessage.trim()}>提交</button>
    </form>

    <footer className={`git-command-output ${error ? 'error' : result ? 'success' : ''}`} aria-live="polite">
      <TerminalWindow />
      {running ? <span><strong>正在执行 {actionLabel[running]}</strong><small>Git Atlas 会在完成后自动刷新仓库</small></span>
        : error ? <span><strong>操作未完成</strong><small>{error}</small></span>
          : result ? <span><strong>{result.summary}</strong><small><code>{result.command}</code>{result.output && result.output !== result.summary ? `  ${result.output}` : ''}</small></span>
            : <span><strong>等待操作</strong><small>这里只执行上方列出的白名单命令，不接受任意 Shell 输入。</small></span>}
    </footer>
  </section>;
}
