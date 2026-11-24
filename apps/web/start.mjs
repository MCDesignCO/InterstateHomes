import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const port = String(process.env.PORT || '3000');
const host = '0.0.0.0';

const child = spawn(process.execPath, [nextBin, 'start', '-H', host, '-p', port], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: host,
  },
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('error', (err) => {
  console.error('[interstate-web] Failed to start Next.js server:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
