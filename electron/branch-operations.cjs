function cleanBranchName(value) {
  return String(value || '')
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\//, '')
    .replace(/^origin\//, '')
    .trim();
}

function parseMergeSource(subject) {
  const value = String(subject || '').trim();
  const quoted = value.match(/^Merge (?:remote-tracking )?branch ['"]([^'"]+)['"]/i);
  if (quoted) return cleanBranchName(quoted[1]);
  const pullRequest = value.match(/^Merge pull request #\d+ from [^/]+\/(.+)$/i);
  if (pullRequest) return cleanBranchName(pullRequest[1]);
  const into = value.match(/^Merge (.+?) into (.+)$/i);
  if (into) return cleanBranchName(into[1].replace(/^branch\s+/i, '').replace(/^['"]|['"]$/g, ''));
  return '';
}

function parseHeadReflog(raw) {
  return String(raw || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash = '', selector = '', subject = '', recordedAt = ''] = line.split('\x1f');
    return { hash, selector, subject, recordedAt };
  });
}

function parseRebaseOperations(raw) {
  const entries = parseHeadReflog(raw);
  const operations = [];
  const seen = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const finish = entry.subject.match(/^rebase(?: -i)? \(finish\): returning to refs\/heads\/(.+)$/i);
    if (!finish || !entry.hash) continue;
    let target = '';
    for (let cursor = index + 1; cursor < entries.length; cursor += 1) {
      const candidate = entries[cursor];
      if (/^rebase(?: -i)? \(finish\):/i.test(candidate.subject)) break;
      const start = candidate.subject.match(/^rebase(?: -i)? \(start\): checkout (.+)$/i);
      if (start) { target = cleanBranchName(start[1]); break; }
    }
    const source = cleanBranchName(finish[1]);
    const key = `${entry.hash}:${source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    operations.push({
      hash: entry.hash,
      kind: 'rebase',
      source,
      target: target || '新基线',
      evidence: 'local-reflog',
      recordedAt: entry.recordedAt,
    });
  }
  return operations;
}

function attachBranchOperations(commits, headReflog, currentBranch) {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  commits.forEach((commit) => { commit.operations = []; });

  commits.forEach((commit) => {
    if (commit.parents.length < 2) return;
    const target = commit.branches.includes(currentBranch)
      ? currentBranch
      : cleanBranchName(commit.refs.find((ref) => !ref.startsWith('tag:') && !ref.includes('origin/'))) || commit.branches[0] || '当前分支';
    const source = parseMergeSource(commit.subject) || commit.parents[1].slice(0, 7);
    commit.operations.push({
      kind: 'merge',
      source,
      target,
      evidence: 'commit-parents',
      parentCount: commit.parents.length,
    });
  });

  parseRebaseOperations(headReflog).forEach((operation) => {
    const commit = byHash.get(operation.hash);
    if (commit) commit.operations.push({
      kind: operation.kind,
      source: operation.source,
      target: operation.target,
      evidence: operation.evidence,
      recordedAt: operation.recordedAt,
    });
  });
  return commits;
}

module.exports = { attachBranchOperations, parseHeadReflog, parseMergeSource, parseRebaseOperations };
