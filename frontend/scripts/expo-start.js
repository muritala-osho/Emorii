#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.EXPO_FORCE_WEBCONTAINER_ENV =
  process.env.EXPO_FORCE_WEBCONTAINER_ENV || '1';

if (process.env.EXPO_UNSTABLE_HEADLESS == null) {
  process.env.EXPO_UNSTABLE_HEADLESS = 'false';
}

try {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const replitNix = path.join(repoRoot, 'replit.nix');
  if (fs.existsSync(replitNix) && fs.existsSync('/nix/store')) {
    const expr = `let pkgs = import <nixpkgs> {}; in pkgs.lib.makeLibraryPath (import ${JSON.stringify(replitNix)} { inherit pkgs; }).deps`;
    const res = spawnSync(
      'nix',
      ['--extra-experimental-features', 'nix-command', 'eval', '--impure', '--raw', '--expr', expr],
      { encoding: 'utf8', timeout: 30000 }
    );
    if (res.status === 0 && res.stdout) {
      const extra = res.stdout.trim();
      process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
        ? `${extra}:${process.env.LD_LIBRARY_PATH}`
        : extra;
    }
  }
} catch {
  // best effort — ignore
}

const args = ['expo', 'start', ...process.argv.slice(2)];

const child = spawn('npx', args, {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..'),
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[expo-start] failed to spawn:', err.message);
  process.exit(1);
});
