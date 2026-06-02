import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const myst = join(root, 'node_modules/mystmd/dist/myst.cjs');
const args = process.argv.slice(2);

function cleanPath(path) {
  return path
    .split(':')
    .filter(
      (entry) =>
        entry &&
        !entry.includes('.bun/bin') &&
        !entry.endsWith('/bun/bin') &&
        !entry.includes('/bun-node'),
    )
    .join(':');
}

function isRealNode(nodePath) {
  if (!nodePath || !existsSync(nodePath)) return false;
  if (nodePath.includes('bun-node') || nodePath.includes('.bun/bin')) return false;
  try {
    const version = execSync(`"${nodePath}" --version`, { encoding: 'utf8' }).trim();
    return /^v\d+/.test(version);
  } catch {
    return false;
  }
}

function nvmNodeCandidates() {
  const home = process.env.HOME;
  if (!home) return [];
  const versionsDir = join(home, '.nvm/versions/node');
  if (!existsSync(versionsDir)) return [];
  return readdirSync(versionsDir)
    .map((version) => join(versionsDir, version, 'bin/node'))
    .filter(isRealNode)
    .sort()
    .reverse();
}

function findNode() {
  if (process.env.MYST_NODE && isRealNode(process.env.MYST_NODE)) {
    return process.env.MYST_NODE;
  }

  const candidates = [
    ...nvmNodeCandidates(),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
  ];

  for (const candidate of candidates) {
    if (isRealNode(candidate)) return candidate;
  }

  const path = cleanPath(process.env.PATH ?? '');
  try {
    const node = execSync('command -v node', {
      env: { ...process.env, PATH: path },
      encoding: 'utf8',
    }).trim();
    if (isRealNode(node)) return node;
  } catch {
    // fall through
  }

  throw new Error(
    'Node.js 20+ is required to preview docs (install Node or set MYST_NODE to your node binary).',
  );
}

const node = findNode();
const result = spawnSync(node, [myst, ...args], {
  cwd: join(root, 'docs'),
  stdio: 'inherit',
  env: {
    ...process.env,
    PATH: `${dirname(node)}:/usr/bin:/bin`,
  },
});

process.exit(result.status ?? 1);
