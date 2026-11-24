import { Application, Container, Graphics, Rectangle, Sprite, TilingSprite, type Texture } from 'pixi.js';
import { TILE_SIZE, type Arena, type Island } from '../game/arena';
import { lerp, lerpAngle } from '../game/math';
import type { Simulation } from '../game/simulation';
import type { GameEvent, Ship } from '../game/types';
import type { GameTextures } from './assets';
import { EffectLayer } from './effects';
import { SHIP_COLORS, ShipView, type BarStyle } from './ShipView';

const ISLAND_SOURCE: Record<Island['kind'], { column: number; row: number }> = {
  grass: { column: 5, row: 0 },
  sand: { column: 0, row: 0 },
};

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

function tileName(column: number, row: number): string {
  return `tile_${row * 16 + column + 1}`;
}

export class GameRenderer {
  readonly app: Application;
  private readonly water: TilingSprite;
  private readonly world = new Container();
  private readonly frame = new Graphics();
  private readonly shipLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly barLayer = new Container();
  private readonly effects: EffectLayer;
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, Sprite>();
  private readonly projectilePool: Sprite[] = [];
  private readonly ballTexture: Texture;
  private readonly enemyBar: BarStyle;
  private readonly playerBar: BarStyle;
  private islandTexture: Texture | null = null;
  private viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 };
  private destroyed = false;

  private constructor(
    app: Application,
    private readonly textures: GameTextures,
    private readonly arena: Arena,
  ) {
    this.app = app;
    const tile = (name: string) => this.texture(textures.tiles.textures[name], name);
    const ship = (name: string) => this.texture(textures.ships.textures[name], name);
    const ui = (name: string) => this.texture(textures.ui.textures[name], name);

    this.water = new TilingSprite({ texture: tile('tile_73'), width: 1, height: 1 });
    this.ballTexture = ship('cannon_ball');
    this.enemyBar = {
      frame: ui('enemy_health_frame'),
      fills: [ui('enemy_health_fill_green'), ui('enemy_health_fill_red')],
      fillRect: { x: 24, width: 112 },
      scale: 0.5,
    };
    this.playerBar = {
      frame: ui('health_frame'),
      fills: [ui('health_fill_green'), ui('health_fill_amber'), ui('health_fill_red')],
      fillRect: { x: 30, width: 196 },
      scale: 0.36,
    };
    this.effects = new EffectLayer({
      explosion: [ship('explosion_1'), ship('explosion_2'), ship('explosion_3')],
      fire: [ship('fire_1'), ship('fire_2')],
      wreck: (color) => ship(`ship_${color + 18}`),
    });

    app.stage.eventMode = 'none';
    app.stage.addChild(this.water, this.world);
    this.world.addChild(this.buildShallows(), this.buildIslands(), this.shipLayer, this.projectileLayer, this.effects.container, this.barLayer);
    app.stage.addChild(this.frame);
  }

  static async create(textures: GameTextures, arena: Arena, width: number, height: number): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      width: Math.max(1, width),
      height: Math.max(1, height),
      background: 0x2aa7cf,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });
    return new GameRenderer(app, textures, arena);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get currentViewport(): Viewport {
    return this.viewport;
  }

  get displayCounts(): { ships: number; projectiles: number; effects: number } {
    return { ships: this.ships.size, projectiles: this.projectiles.size, effects: this.effects.count };
  }

  resize(width: number, height: number): void {
    if (this.destroyed || width <= 0 || height <= 0) return;
    this.app.renderer.resolution = Math.min(window.devicePixelRatio || 1, 2);
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / this.arena.width, height / this.arena.height);
    const offsetX = (width - this.arena.width * scale) / 2;
    const offsetY = (height - this.arena.height * scale) / 2;
    this.viewport = { scale, offsetX, offsetY, width, height };
    this.world.scale.set(scale);
    this.world.position.set(offsetX, offsetY);
    this.water.width = width;
    this.water.height = height;
    this.water.tileScale.set(scale);
    this.water.tilePosition.set(offsetX, offsetY);
    this.frame.clear();
    const arenaWidth = this.arena.width * scale;
    const arenaHeight = this.arena.height * scale;
    const shade = { color: 0x0b2236, alpha: 0.45 };
    if (offsetX > 0.5) {
      this.frame.rect(0, 0, offsetX, height).fill(shade);
      this.frame.rect(offsetX + arenaWidth, 0, width - offsetX - arenaWidth, height).fill(shade);
    }
    if (offsetY > 0.5) {
      this.frame.rect(offsetX, 0, arenaWidth, offsetY).fill(shade);
      this.frame.rect(offsetX, offsetY + arenaHeight, arenaWidth, height - offsetY - arenaHeight).fill(shade);
    }
    this.frame.rect(offsetX, offsetY, arenaWidth, arenaHeight).stroke({ width: 2, color: 0xffffff, alpha: 0.18 });
    this.app.render();
  }

  render(simulation: Simulation, dt: number): void {
    if (this.destroyed) return;
    const alpha = simulation.phase === 'running' ? simulation.interpolation : 1;
    const alive = new Set<number>();
    const ships: Ship[] = simulation.player.health > 0 ? [simulation.player, ...simulation.enemies] : [...simulation.enemies];
    for (const ship of ships) {
      alive.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) {
        view = new ShipView(
          ship.kind,
          (color, level) => this.texture(this.textures.ships.textures[`ship_${color + level * 6}`], 'ship'),
          [this.texture(this.textures.ships.textures.fire_1, 'fire_1'), this.texture(this.textures.ships.textures.fire_2, 'fire_2')],
          ship.kind === 'player' ? this.playerBar : this.enemyBar,
        );
        this.ships.set(ship.id, view);
        this.shipLayer.addChild(view.hull);
        this.barLayer.addChild(view.bar.container);
      }
      view.update(
        lerp(ship.prevX, ship.x, alpha),
        lerp(ship.prevY, ship.y, alpha),
        lerpAngle(ship.prevAngle, ship.angle, alpha),
        ship.health / ship.hull.maxHealth,
        dt,
      );
    }
    for (const [id, view] of this.ships) {
      if (!alive.has(id)) {
        view.destroy();
        this.ships.delete(id);
      }
    }

    const liveProjectiles = new Set<number>();
    for (const projectile of simulation.projectiles) {
      liveProjectiles.add(projectile.id);
      let sprite = this.projectiles.get(projectile.id);
      if (!sprite) {
        sprite = this.projectilePool.pop() ?? this.createBall();
        sprite.visible = true;
        sprite.tint = projectile.faction === 'player' ? 0xffffff : 0x3a2a22;
        this.projectiles.set(projectile.id, sprite);
      }
      sprite.position.set(lerp(projectile.prevX, projectile.x, alpha), lerp(projectile.prevY, projectile.y, alpha));
    }
    for (const [id, sprite] of this.projectiles) {
      if (!liveProjectiles.has(id)) {
        sprite.visible = false;
        this.projectiles.delete(id);
        this.projectilePool.push(sprite);
      }
    }

    this.effects.update(dt);
  }

  applyEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.count > 1) {
            const forward = event.angle - (Math.PI / 2) * (event.slot === 'left' ? -1 : 1);
            for (const offset of [-26, 0, 26]) {
              this.effects.muzzleFlash(event.x + Math.cos(forward) * offset, event.y + Math.sin(forward) * offset, event.angle);
            }
          } else {
            this.effects.muzzleFlash(event.x, event.y, event.angle);
          }
          break;
        case 'hit':
          this.effects.woodHit(event.x, event.y);
          break;
        case 'splash':
          if (event.surface === 'water') this.effects.splash(event.x, event.y);
          else this.effects.islandImpact(event.x, event.y);
          break;
        case 'destroyed':
          this.effects.wreck(event.x, event.y, event.angle, SHIP_COLORS[event.kind]);
          this.effects.explosion(event.x, event.y, event.kind === 'player' ? 1.5 : 1.1);
          break;
        default:
          break;
      }
    }
  }

  reset(): void {
    for (const view of this.ships.values()) view.destroy();
    this.ships.clear();
    for (const sprite of this.projectiles.values()) sprite.destroy();
    this.projectiles.clear();
    this.effects.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reset();
    for (const sprite of this.projectilePool) sprite.destroy();
    this.projectilePool.length = 0;
    this.islandTexture?.destroy(true);
    this.islandTexture = null;
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }

  private texture(texture: Texture | undefined, name: string): Texture {
    if (!texture) throw new Error(`Missing texture ${name}`);
    return texture;
  }

  private createBall(): Sprite {
    const sprite = new Sprite(this.ballTexture);
    sprite.anchor.set(0.5);
    sprite.scale.set(1.1);
    this.projectileLayer.addChild(sprite);
    return sprite;
  }

  private buildShallows(): Graphics {
    const shallows = new Graphics();
    for (const island of this.arena.islands) {
      const x = island.column * TILE_SIZE;
      const y = island.row * TILE_SIZE;
      const width = island.columns * TILE_SIZE;
      const height = island.rows * TILE_SIZE;
      shallows.roundRect(x - 34, y - 34, width + 68, height + 68, 70).fill({ color: 0xffffff, alpha: 0.1 });
      shallows.roundRect(x - 16, y - 16, width + 32, height + 32, 56).fill({ color: 0xffffff, alpha: 0.1 });
    }
    return shallows;
  }

  private buildIslands(): Sprite {
    const layer = new Container();
    for (const island of this.arena.islands) {
      const source = ISLAND_SOURCE[island.kind];
      for (let row = 0; row < island.rows; row += 1) {
        for (let column = 0; column < island.columns; column += 1) {
          const name = tileName(source.column + column, source.row + row);
          const sprite = new Sprite(this.texture(this.textures.tiles.textures[name], name));
          sprite.position.set((island.column + column) * TILE_SIZE, (island.row + row) * TILE_SIZE);
          layer.addChild(sprite);
        }
      }
    }
    for (const decoration of this.arena.decorations) {
      const name = `tile_${decoration.tile}`;
      const sprite = new Sprite(this.texture(this.textures.tiles.textures[name], name));
      sprite.anchor.set(0.5);
      sprite.position.set(decoration.x, decoration.y);
      sprite.scale.set(decoration.scale);
      sprite.rotation = decoration.rotation;
      layer.addChild(sprite);
    }
    this.islandTexture = this.app.renderer.generateTexture({
      target: layer,
      frame: new Rectangle(0, 0, this.arena.width, this.arena.height),
      resolution: 1,
      antialias: false,
    });
    layer.destroy({ children: true });
    const baked = new Sprite(this.islandTexture);
    baked.eventMode = 'none';
    return baked;
  }
}
