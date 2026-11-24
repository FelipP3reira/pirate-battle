import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { ShipKind } from '../game/config';

export const SHIP_COLORS: Record<ShipKind, number> = {
  player: 5,
  chaser: 3,
  shooter: 2,
};

export interface BarStyle {
  frame: Texture;
  fills: Texture[];
  fillRect: { x: number; width: number };
  scale: number;
}

export class HealthBar {
  readonly container = new Container();
  private readonly fill: Sprite;
  private cropped: Texture | null = null;
  private lastRatio = -1;

  constructor(private readonly style: BarStyle) {
    const frame = new Sprite(style.frame);
    this.fill = new Sprite(Texture.EMPTY);
    this.container.addChild(frame, this.fill);
    this.container.scale.set(style.scale);
    this.container.pivot.set(style.frame.width / 2, style.frame.height);
    this.container.eventMode = 'none';
  }

  setRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (Math.abs(clamped - this.lastRatio) < 0.001) return;
    this.lastRatio = clamped;
    const { fills, fillRect } = this.style;
    const index = fills.length === 3 ? (clamped > 0.6 ? 0 : clamped > 0.3 ? 1 : 2) : clamped > 0.4 ? 0 : 1;
    const source = fills[index] ?? fills[0];
    if (!source) return;
    this.cropped?.destroy(false);
    const width = Math.max(0, Math.round(fillRect.x + fillRect.width * clamped));
    if (clamped <= 0 || width <= fillRect.x) {
      this.cropped = null;
      this.fill.texture = Texture.EMPTY;
      return;
    }
    this.cropped = new Texture({
      source: source.source,
      frame: new Rectangle(source.frame.x, source.frame.y, width, source.frame.height),
    });
    this.fill.texture = this.cropped;
  }

  destroy(): void {
    this.cropped?.destroy(false);
    this.cropped = null;
    this.container.destroy({ children: true });
  }
}

export class ShipView {
  readonly hull: Container = new Container();
  readonly bar: HealthBar;
  private readonly sprite: Sprite;
  private readonly flames: Sprite[] = [];
  private level = -1;
  private flicker = Math.random() * 10;

  constructor(
    readonly kind: ShipKind,
    private readonly textureFor: (color: number, level: number) => Texture,
    fireTextures: [Texture, Texture],
    barStyle: BarStyle,
  ) {
    this.sprite = new Sprite(textureFor(SHIP_COLORS[kind], 0));
    this.sprite.anchor.set(0.5);
    this.hull.addChild(this.sprite);
    this.hull.eventMode = 'none';
    this.bar = new HealthBar(barStyle);
    const offsets: Array<[number, number]> = [
      [-12, -14],
      [10, 18],
    ];
    for (const [index, [x, y]] of offsets.entries()) {
      const flame = new Sprite(fireTextures[index % 2] ?? fireTextures[0]);
      flame.anchor.set(0.5, 0.9);
      flame.position.set(x, y);
      flame.visible = false;
      this.flames.push(flame);
      this.hull.addChild(flame);
    }
  }

  update(x: number, y: number, angle: number, healthRatio: number, dt: number): void {
    this.hull.position.set(x, y);
    this.hull.rotation = angle - Math.PI / 2;
    this.bar.container.position.set(x, y - 62);
    this.bar.setRatio(healthRatio);
    const level = healthRatio > 0.66 ? 0 : healthRatio > 0.33 ? 1 : 2;
    if (level !== this.level) {
      this.level = level;
      this.sprite.texture = this.textureFor(SHIP_COLORS[this.kind], level);
      this.flames.forEach((flame, index) => {
        flame.visible = level > index;
      });
    }
    this.flicker += dt * 14;
    this.flames.forEach((flame, index) => {
      if (!flame.visible) return;
      flame.scale.set(0.8 + Math.sin(this.flicker + index * 2) * 0.12, 0.85 + Math.cos(this.flicker * 1.3 + index) * 0.15);
      flame.rotation = -this.hull.rotation * 0.15;
    });
  }

  destroy(): void {
    this.hull.destroy({ children: true });
    this.bar.destroy();
  }
}
