// Orchestrates the Windows installer build: verifies prerequisites, builds
// the production bundle, then substitutes ${ARCH} in installer/id-card-installer.nsi
// and invokes makensis once per requested architecture.
//
// Usage:
//   node scripts/build-installer.js [--arch=x64,x86] [--skip-build]
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const NSI_SOURCE = path.join(ROOT, 'installer', 'id-card-installer.nsi');
const ARCH_VENDOR_DIR = {
  x64: path.join(ROOT, 'vendor', 'node-win-x64', 'node.exe'),
  x86: path.join(ROOT, 'vendor', 'node-win-ia32', 'node.exe'),
};

function parseArgs(argv) {
  const args = { arch: ['x64', 'x86'], skipBuild: false };
  for (const arg of argv) {
    if (arg === '--skip-build') args.skipBuild = true;
    else if (arg.startsWith('--arch=')) args.arch = arg.slice('--arch='.length).split(',').map((a) => a.trim());
  }
  return args;
}

function checkPrerequisites(archList) {
  const problems = [];

  if (process.platform !== 'win32') {
    problems.push('This must be run on Windows — makensis is a Windows-only tool.');
  }

  try {
    execSync('makensis /VERSION', { stdio: 'ignore' });
  } catch {
    problems.push('makensis was not found on PATH. Install NSIS (https://nsis.sourceforge.io/) first.');
  }

  for (const arch of archList) {
    const exe = ARCH_VENDOR_DIR[arch];
    if (!exe) {
      problems.push(`Unknown architecture "${arch}" (expected x64 or x86).`);
      continue;
    }
    if (!fs.existsSync(exe)) {
      problems.push(`Missing ${path.relative(ROOT, exe)} — run "node scripts/download-node-runtimes.js" first.`);
    }
  }

  return problems;
}

function checkDistOutput() {
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  return fs.existsSync(distIndex);
}

function buildDist() {
  console.log('Running npm run build ...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

function buildArch(arch) {
  console.log(`\nBuilding installer for ${arch} ...`);
  const source = fs.readFileSync(NSI_SOURCE, 'utf8');
  const substituted = source.replace(/\$\{ARCH\}/g, arch);

  if (substituted.includes('${ARCH}')) {
    throw new Error('Leftover ${ARCH} token after substitution — check installer/id-card-installer.nsi.');
  }

  const archScript = path.join(ROOT, 'installer', `id-card-installer.${arch}.generated.nsi`);
  fs.writeFileSync(archScript, substituted);

  try {
    execFileSync('makensis', [archScript], { cwd: path.join(ROOT, 'installer'), stdio: 'inherit' });
  } finally {
    fs.rmSync(archScript, { force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const problems = checkPrerequisites(args.arch);
  if (problems.length > 0) {
    console.error('Cannot build installer:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  if (!args.skipBuild) {
    buildDist();
  } else if (!checkDistOutput()) {
    console.error('dist/index.html not found and --skip-build was passed. Run "npm run build" first.');
    process.exit(1);
  }

  for (const arch of args.arch) {
    buildArch(arch);
  }

  console.log('\nDone. Installer(s) written to installer/.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
