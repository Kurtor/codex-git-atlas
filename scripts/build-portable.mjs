import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = resolve(tmpdir());
const outputDirectory = mkdtempSync(join(temporaryRoot, 'git-atlas-build-'));
const builderCli = join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const releaseDirectory = join(projectRoot, 'release');

try {
  const result = spawnSync(
    process.execPath,
    [builderCli, '--win', 'portable', `--config.directories.output=${outputDirectory}`],
    { cwd: projectRoot, stdio: 'inherit' },
  );

  if (result.status !== 0) process.exit(result.status ?? 1);

  const artifact = readdirSync(outputDirectory)
    .find((file) => /^Git-Atlas-.*-Windows-x64\.exe$/i.test(file));

  if (!artifact) throw new Error('没有找到生成的 Git Atlas 便携版。');

  mkdirSync(releaseDirectory, { recursive: true });
  const destination = join(releaseDirectory, basename(artifact));
  copyFileSync(join(outputDirectory, artifact), destination);
  console.log(`\n便携版已生成：${destination}`);
} finally {
  const resolvedOutput = resolve(outputDirectory);
  if (resolvedOutput.startsWith(`${temporaryRoot}\\`) && basename(resolvedOutput).startsWith('git-atlas-build-')) {
    rmSync(resolvedOutput, { recursive: true, force: true });
  }
}
