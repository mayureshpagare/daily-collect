// Starts the Vite dev server, then launches Electron pointed at it.
// Renderer changes hot-reload; restart this script after changing files in electron/.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const server = await createServer({ configFile: 'vite.config.mjs' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`[dev] Vite running at ${url}`);

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

const shutdown = async (code = 0) => {
  await server.close();
  process.exit(code);
};
child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => child.kill());
