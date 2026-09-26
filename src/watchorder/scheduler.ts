/**
 * Runs the builder nightly as a separate, lowest-priority process.
 *
 * Kept out of the server process on purpose: rendering is CPU-bound and
 * synchronous in places, and a subtitle request must never queue behind it.
 * At nice 19 the kernel gives the builder only what the server leaves idle.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WatchOrderStore } from './store.js';

/** A build older than this at startup is redone straight away. */
const STALE_MS = 20 * 3600 * 1000;

export function startScheduler(opts: { dir: string; hour: number; publicUrl: string; store: WatchOrderStore }): void {
  // The builder sits next to this file: build.js when compiled, build.ts
  // under tsx (whose loader is passed on through execArgv).
  const builder = fileURLToPath(import.meta.url).replace(/scheduler\.(ts|js)$/, 'build.$1');
  let running = false;

  const run = (why: string) => {
    if (running) return;
    running = true;
    const started = Date.now();
    console.log(`[watch-order] rebuilding (${why})`);
    const child = spawn(process.execPath, [...process.execArgv, builder], {
      env: { ...process.env, WATCH_ORDER_DIR: opts.dir, PUBLIC_URL: opts.publicUrl },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    try {
      if (child.pid) setPriority(child.pid, 19);
    } catch {
      // Not permitted everywhere (some containers); the build still runs.
    }
    child.on('exit', (code) => {
      running = false;
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (code === 0) {
        console.log(`[watch-order] rebuild finished in ${secs}s`);
        opts.store.reload();
      } else {
        console.error(`[watch-order] rebuild failed (exit ${code}) after ${secs}s; still serving the previous build`);
      }
    });
  };

  const nextRunIn = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(opts.hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  const schedule = () => {
    setTimeout(() => {
      run('nightly');
      schedule();
    }, nextRunIn()).unref();
  };

  let age = Infinity;
  try {
    age = Date.now() - statSync(join(opts.dir, 'index.json')).mtimeMs;
  } catch {
    // never built
  }
  // A short delay so a restart is serving subtitles before any build work.
  if (age > STALE_MS) setTimeout(() => run(age === Infinity ? 'first build' : 'stale'), 30_000).unref();
  schedule();
}
