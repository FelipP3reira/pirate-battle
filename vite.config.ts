import { cpSync, createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const kitDir = resolve(root, 'assets');

const publishedKit = [
  'spritesheet',
  'tilesheet',
  'sounds',
  'png/default/ui',
  'png/retina/ui',
  'ui_scene_background.png',
  'logo_jungle_gaming.svg',
];

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};

function isPublished(relativePath: string): boolean {
  return publishedKit.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`));
}

function assetKit(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pirate-battle-asset-kit',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        const relativePath = normalize(decodeURIComponent((req.url ?? '').split('?')[0] ?? '')).replace(/^\/+/, '');
        const filePath = join(kitDir, relativePath);
        if (!isPublished(relativePath) || !filePath.startsWith(kitDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', mimeTypes[extname(filePath)] ?? 'application/octet-stream');
        createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      for (const entry of publishedKit) {
        const target = join(outDir, 'assets', entry);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(kitDir, entry), target, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), assetKit()],
  build: {
    assetsDir: 'static',
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
