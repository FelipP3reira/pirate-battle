import { Container, Graphics, Sprite, type Texture } from 'pixi.js';

interface Effect {
  display: Container;
  age: number;
  life: number;
  update(progress: number): void;
}

export interface EffectTextures {
  explosion: [Texture, Texture, Texture];
  fire: [Texture, Texture];
  wreck: (color: number) => Texture;
}

export class EffectLayer {
  readonly container = new Container();
  private readonly effects: Effect[] = [];

  constructor(private readonly textures: EffectTextures) {
    this.container.eventMode = 'none';
  }

  get count(): number {
    return this.effects.length;
  }

  muzzleFlash(x: number, y: number, angle: number): void {
    const sprite = new Sprite(this.textures.explosion[2]);
    sprite.anchor.set(0.5);
    sprite.position.set(x + Math.cos(angle) * 6, y + Math.sin(angle) * 6);
    sprite.rotation = angle;
    this.add(sprite, 0.14, (t) => {
      sprite.alpha = 1 - t;
      sprite.scale.set(0.32 + t * 0.25);
    });
    const smoke = new Graphics().circle(0, 0, 9).fill({ color: 0xf2efe6, alpha: 0.5 });
    smoke.position.set(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
    this.add(smoke, 0.45, (t) => {
      smoke.alpha = 0.55 * (1 - t);
      smoke.scale.set(0.6 + t * 1.4);
      smoke.position.x += Math.cos(angle) * 0.4;
      smoke.position.y += Math.sin(angle) * 0.4;
    });
  }

  splash(x: number, y: number): void {
    const ring = new Graphics().circle(0, 0, 10).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
    ring.position.set(x, y);
    this.add(ring, 0.55, (t) => {
      ring.scale.set(0.5 + t * 1.6);
      ring.alpha = 1 - t;
    });
    const spray = new Graphics().circle(0, 0, 6).fill({ color: 0xffffff, alpha: 0.85 });
    spray.position.set(x, y);
    this.add(spray, 0.3, (t) => {
      spray.scale.set(1 + t);
      spray.alpha = 0.85 * (1 - t);
    });
  }

  islandImpact(x: number, y: number): void {
    const dust = new Graphics().circle(0, 0, 10).fill({ color: 0xe8cf98, alpha: 0.85 });
    dust.position.set(x, y);
    this.add(dust, 0.4, (t) => {
      dust.scale.set(0.6 + t * 1.5);
      dust.alpha = 0.85 * (1 - t);
    });
  }

  woodHit(x: number, y: number): void {
    const burst = new Sprite(this.textures.explosion[2]);
    burst.anchor.set(0.5);
    burst.position.set(x, y);
    this.add(burst, 0.28, (t) => {
      burst.scale.set(0.35 + t * 0.35);
      burst.alpha = 1 - t * t;
    });
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index + Math.random() * 1.2;
      const speed = 40 + Math.random() * 50;
      const chip = new Graphics().rect(-3, -1.5, 6, 3).fill({ color: 0x7a4a24 });
      chip.position.set(x, y);
      chip.rotation = angle;
      this.add(chip, 0.5, (t) => {
        chip.position.set(x + Math.cos(angle) * speed * t, y + Math.sin(angle) * speed * t);
        chip.rotation += 0.2;
        chip.alpha = 1 - t;
      });
    }
  }

  explosion(x: number, y: number, scale = 1): void {
    const frames = this.textures.explosion;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    this.add(sprite, 0.6, (t) => {
      const frame = frames[Math.min(2, Math.floor(t * 3))];
      if (frame && sprite.texture !== frame) sprite.texture = frame;
      sprite.scale.set(scale * (0.8 + t * 0.7));
      sprite.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    });
  }

  wreck(x: number, y: number, angle: number, color: number): void {
    const sprite = new Sprite(this.textures.wreck(color));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.rotation = angle - Math.PI / 2;
    this.add(sprite, 1.8, (t) => {
      sprite.alpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
      sprite.scale.set(1 - t * 0.25);
      sprite.rotation += 0.002;
    });
  }

  update(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      if (!effect) continue;
      effect.age += dt;
      const progress = Math.min(1, effect.age / effect.life);
      effect.update(progress);
      if (progress >= 1) {
        this.effects.splice(index, 1);
        effect.display.destroy({ children: true });
      }
    }
  }

  clear(): void {
    for (const effect of this.effects) effect.display.destroy({ children: true });
    this.effects.length = 0;
  }

  private add(display: Container, life: number, update: (progress: number) => void): void {
    this.container.addChild(display);
    update(0);
    this.effects.push({ display, age: 0, life, update });
  }
}
