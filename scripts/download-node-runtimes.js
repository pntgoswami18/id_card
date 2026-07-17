// Downloads the Node.js runtimes bundled into the Windows installer, so the
// installed app needs no pre-existing Node.js on the target machine. Pinned
// to 18.20.8 (last Node 18.x release, and the last major to ship official
// win-x86 builds — Node 20+ dropped 32-bit Windows) rather than the
// project's own dev-time Node version: this runtime only ever runs
// scripts/static-server.js, a zero-dependency static file server, so it
// doesn't need to satisfy Vite's Node version floor.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NODE_VERSION = '18.20.8';
const VENDOR_DIR = path.join(__dirname, '..', 'vendor');

const TARGETS = [
  { arch: 'x64', dir: 'node-win-x64' },
  { arch: 'ia32', winArch: 'x86', dir: 'node-win-ia32' },
];

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectsLeft) => {
      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error(`Too many redirects fetching ${url}`));
              return;
            }
            request(res.headers.location, redirectsLeft - 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download ${currentUrl}: HTTP ${res.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
          file.on('error', reject);
        })
        .on('error', reject);
    };
    request(url, 5);
  });
}

function extractNodeExeFromZip(zipPath, destDir, folderName) {
  // Windows-only build step, so relying on the system `tar` (bundled with
  // Windows 10+) to pull the single file we need out of the zip avoids an
  // extra npm dependency just for this build script.
  execFileSync('tar', ['-xf', zipPath, '-C', destDir, `${folderName}/node.exe`], {
    stdio: 'inherit',
  });
  fs.renameSync(path.join(destDir, folderName, 'node.exe'), path.join(destDir, 'node.exe'));
  fs.rmSync(path.join(destDir, folderName), { recursive: true, force: true });
}

async function downloadTarget({ arch, winArch, dir }) {
  const destDir = path.join(VENDOR_DIR, dir);
  const destExe = path.join(destDir, 'node.exe');
  if (fs.existsSync(destExe)) {
    console.log(`vendor/${dir}/node.exe already present, skipping.`);
    return;
  }

  const label = winArch || arch;
  const folderName = `node-v${NODE_VERSION}-win-${label}`;
  const zipName = `${folderName}.zip`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`;
  const zipPath = path.join(VENDOR_DIR, zipName);

  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Downloading ${url} ...`);
  await download(url, zipPath);
  console.log(`Extracting node.exe -> vendor/${dir}/node.exe`);
  extractNodeExeFromZip(zipPath, destDir, folderName);
  fs.rmSync(zipPath, { force: true });
}

async function main() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  for (const target of TARGETS) {
    await downloadTarget(target);
  }
  console.log('Done. Bundled runtimes are in vendor/ (gitignored).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
