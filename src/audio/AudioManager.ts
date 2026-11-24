const SOUND_FILES = {
  cannon1: 'cannon_fire_1',
  cannon2: 'cannon_fire_2',
  cannon3: 'cannon_fire_3',
  broadside: 'cannon_broadside',
  splash1: 'cannonball_water_hit_1',
  splash2: 'cannonball_water_hit_2',
  wood1: 'ship_wood_hit_1',
  wood2: 'ship_wood_hit_2',
  explosion1: 'ship_explosion_1',
  explosion2: 'ship_explosion_2',
  collision: 'ship_collision',
  sinking: 'ship_sinking',
  score: 'score_point',
  start: 'game_start',
  pause: 'game_pause',
  resume: 'game_resume',
  complete: 'game_complete',
  over: 'game_over',
  timeWarning: 'time_warning',
  healthLow: 'health_low',
  click: 'ui_click',
  back: 'ui_back',
  ocean: 'ocean_ambience_loop',
  sailing: 'ship_sailing_loop',
} as const;

export type SoundName = keyof typeof SOUND_FILES;

interface LoopHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Map<SoundName, Promise<AudioBuffer | null>>();
  private readonly loops = new Map<SoundName, LoopHandle>();
  private readonly loopsWanted = new Set<SoundName>();

  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.context.destination);
      for (const name of Object.keys(SOUND_FILES) as SoundName[]) void this.loadBuffer(name);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  play(name: SoundName, volume = 1): void {
    const context = this.context;
    const buffer = this.buffers.get(name);
    if (!context || !this.master || !buffer || context.state !== 'running') return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  startLoop(name: SoundName, volume: number): void {
    const context = this.context;
    if (!context || !this.master || this.loops.has(name)) return;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.loadBuffer(name).then((loaded) => {
        if (loaded && this.loopsWanted.has(name)) this.startLoop(name, volume);
      });
      this.loopsWanted.add(name);
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
    this.loops.set(name, { source, gain });
    this.loopsWanted.add(name);
  }

  setLoopVolume(name: SoundName, volume: number): void {
    const loop = this.loops.get(name);
    if (!loop || !this.context) return;
    loop.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.15);
  }

  stopLoops(): void {
    this.loopsWanted.clear();
    for (const loop of this.loops.values()) {
      loop.source.stop();
      loop.source.disconnect();
      loop.gain.disconnect();
    }
    this.loops.clear();
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
  }


  private loadBuffer(name: SoundName): Promise<AudioBuffer | null> {
    const existing = this.loading.get(name);
    if (existing) return existing;
    const context = this.context;
    if (!context) return Promise.resolve(null);
    const request = fetch(`${import.meta.env.BASE_URL}assets/sounds/${SOUND_FILES[name]}.wav`)
      .then((response) => {
        if (!response.ok) throw new Error(`Sound ${name} returned ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
        return buffer;
      })
      .catch(() => {
        this.loading.delete(name);
        return null;
      });
    this.loading.set(name, request);
    return request;
  }
}

export const audio = new AudioManager();
