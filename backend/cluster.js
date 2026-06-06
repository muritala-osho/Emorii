const cluster = require('cluster');
const os = require('os');

const WORKERS = Math.min(os.cpus().length, 4);

// Expose worker count so rateLimiter.js can divide its in-memory max correctly
// when Redis is unavailable. Without this, WEB_CONCURRENCY defaults to 1 in
// the child processes and perWorkerMax() applies no scaling correction.
process.env.WEB_CONCURRENCY = String(WORKERS);

if (cluster.isPrimary) {
  console.log(`[cluster] Primary ${process.pid} started — spawning ${WORKERS} worker(s)`);

  for (let i = 0; i < WORKERS; i++) cluster.fork();

  // Per-worker restart counter for backoff calculation.
  const restartCounts = new Map(); // workerPid → restartCount

  cluster.on('exit', (worker, code, signal) => {
    const pid     = worker.process.pid;
    const attempt = (restartCounts.get(pid) || 0) + 1;
    // Exponential backoff: 0 s, 1 s, 2 s, 4 s, 8 s … capped at 30 s.
    // Prevents crash-loop burn (CPU/memory thrash on repeated fast exits).
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
    console.warn(
      `[cluster] Worker ${pid} exited (code=${code}, signal=${signal}) ` +
      `— restarting in ${delayMs}ms (attempt #${attempt})`
    );
    setTimeout(() => {
      const newWorker = cluster.fork();
      restartCounts.set(newWorker.process.pid, attempt);
    }, delayMs);
    // After 5 min assume the worker is stable; reset its restart counter.
    setTimeout(() => restartCounts.delete(pid), 5 * 60 * 1000);
  });

  // Graceful shutdown: send SIGTERM to all workers and give them 5 s to drain.
  const shutdown = (sig) => {
    console.log(`[cluster] ${sig} received — draining workers`);
    for (const w of Object.values(cluster.workers || {})) {
      try { w.process.kill('SIGTERM'); } catch (_) {}
    }
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

} else {
  require('./server.js');
  console.log(`[cluster] Worker ${process.pid} started`);
}
