import { Assets, Spritesheet, Texture } from 'pixi.js';

export interface GameTextures {
  ships: Spritesheet;
  tiles: Spritesheet;
  ui: Spritesheet;
}

const BASE = import.meta.env.BASE_URL;

const MANIFEST = {
  ships: `${BASE}atlas/ships.json`,
  tiles: `${BASE}atlas/tiles.json`,
  ui: `${BASE}assets/spritesheet/ui_sheet.json`,
} as const;

type AtlasName = keyof typeof MANIFEST;

class TextureLibrary {
  private loaded: GameTextures | null = null;
  private pending: Promise<GameTextures> | null = null;
  private readonly progressListeners = new Set<(value: number) => void>();

  get ready(): GameTextures | null {
    return this.loaded;
  }

  load(onProgress?: (value: number) => void): Promise<GameTextures> {
    if (this.loaded) {
      onProgress?.(1);
      return Promise.resolve(this.loaded);
    }
    if (onProgress) this.progressListeners.add(onProgress);
    if (!this.pending) {
      this.pending = this.fetchAll()
        .then((textures) => {
          this.loaded = textures;
          return textures;
        })
        .finally(() => {
          this.pending = null;
          this.progressListeners.clear();
        });
    }
    return this.pending;
  }

  texture(sheet: Spritesheet, name: string): Texture {
    const texture = sheet.textures[name];
    if (!texture) throw new Error(`Missing texture ${name}`);
    return texture;
  }

  private async fetchAll(): Promise<GameTextures> {
    const names = Object.keys(MANIFEST) as AtlasName[];
    const progress = new Map<AtlasName, number>(names.map((name) => [name, 0]));
    const report = () => {
      const total = [...progress.values()].reduce((sum, value) => sum + value, 0) / names.length;
      for (const listener of this.progressListeners) listener(total);
    };
    try {
      const sheets = await Promise.all(
        names.map(async (name) => {
          const sheet = await Assets.load<Spritesheet>(MANIFEST[name], (value) => {
            progress.set(name, value);
            report();
          });
          if (!(sheet instanceof Spritesheet)) throw new Error(`${name} atlas did not load as a spritesheet`);
          progress.set(name, 1);
          report();
          return [name, sheet] as const;
        }),
      );
      const result = Object.fromEntries(sheets) as unknown as GameTextures;
      return result;
    } catch (error) {
      await Promise.all(names.map((name) => Assets.unload(MANIFEST[name]).catch(() => undefined)));
      throw error instanceof Error ? error : new Error('Asset loading failed');
    }
  }
}

export const textureLibrary = new TextureLibrary();
