import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A strict Content-Security-Policy is injected into the production build only
// (the dev server needs inline scripts for React Fast Refresh).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const cspPlugin = {
  name: 'dailycollect-csp',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (ctx.server) return html;
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  },
};

export default defineConfig({
  root: '.',
  base: './',
  plugins: [react(), cspPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
