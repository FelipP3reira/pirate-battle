import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/atlas');
mkdirSync(outDir, { recursive: true });

function frame(x, y, w, h) {
  return {
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
  };
}

function meta(image, w, h, scale) {
  return { app: 'scripts/build-atlases.mjs', image, format: 'RGBA8888', size: { w, h }, scale: String(scale) };
}

function convertTextureAtlas(xmlFile, imagePath, outFile, scale, sheetSize) {
  const xml = readFileSync(resolve(root, xmlFile), 'utf8');
  const frames = {};
  const pattern = /<SubTexture name="([^"]+)\.png" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g;
  for (const match of xml.matchAll(pattern)) {
    const [, name, x, y, w, h] = match;
    frames[name] = frame(Number(x), Number(y), Number(w), Number(h));
  }
  writeFileSync(resolve(outDir, outFile), JSON.stringify({ frames, meta: meta(imagePath, sheetSize.w, sheetSize.h, scale) }, null, 1));
  return Object.keys(frames).length;
}

function buildTileGrid(imagePath, outFile, tileSize, scale) {
  const columns = 16;
  const rows = 6;
  const frames = {};
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      frames[`tile_${row * columns + column + 1}`] = frame(column * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
  writeFileSync(
    resolve(outDir, outFile),
    JSON.stringify({ frames, meta: meta(imagePath, columns * tileSize, rows * tileSize, scale) }, null, 1),
  );
  return columns * rows;
}

const ships = convertTextureAtlas(
  'assets/spritesheet/ships_miscellaneous_sheet.xml',
  '../assets/spritesheet/ships_miscellaneous_sheet.png',
  'ships.json',
  1,
  { w: 1024, h: 512 },
);
const tiles = buildTileGrid('../assets/tilesheet/tiles_sheet.png', 'tiles.json', 64, 1);
console.log(`ships.json: ${ships} frames, tiles.json: ${tiles} frames`);
