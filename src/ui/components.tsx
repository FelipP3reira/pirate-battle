import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { audio } from '../audio/AudioManager';

const ICON_BASE = `${import.meta.env.BASE_URL}assets/png/default/ui`;

export type IconName =
  | 'close'
  | 'fire_front'
  | 'fire_left'
  | 'fire_right'
  | 'forward'
  | 'home'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'turn_left'
  | 'turn_right';

export function iconUrl(name: IconName): string {
  return `${ICON_BASE}/controls/icon_${name}.png`;
}

export function hudUrl(name: string): string {
  return `${ICON_BASE}/hud/${name}.png`;
}

export function Panel({
  wide = false,
  className = '',
  children,
  labelledBy,
  role,
}: {
  wide?: boolean;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
  role?: 'dialog' | 'region';
}) {
  return (
    <section
      className={`panel ${wide ? 'panel--wide' : ''} ${className}`}
      aria-labelledby={labelledBy}
      role={role}
      aria-modal={role === 'dialog' ? true : undefined}
    >
      <div className="panel__content">{children}</div>
    </section>
  );
}

type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  size?: 'large' | 'small';
  sound?: 'click' | 'back' | null;
};

export function GameButton({ variant = 'primary', size = 'large', sound = 'click', className = '', onClick, children, ...rest }: GameButtonProps) {
  return (
    <button
      type="button"
      className={`game-button game-button--${variant} game-button--${size} ${className}`}
      onClick={(event) => {
        audio.unlock();
        if (sound) audio.play(sound, 0.5);
        onClick?.(event);
      }}
      {...rest}
    >
      <span className="game-button__label">{children}</span>
    </button>
  );
}

type RoundButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
};

export function RoundButton({ icon, label, className = '', ...rest }: RoundButtonProps) {
  return (
    <button type="button" className={`round-button ${className}`} aria-label={label} title={label} {...rest}>
      <img src={iconUrl(icon)} alt="" draggable={false} />
    </button>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean, restoreTo?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreTarget = restoreTo?.current ?? null;
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      const head = items[0];
      const tail = items[items.length - 1];
      if (!head || !tail) return;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    container.addEventListener('keydown', handleKey);
    return () => {
      container.removeEventListener('keydown', handleKey);
      const target = restoreTarget ?? previous;
      if (target?.isConnected) target.focus();
    };
  }, [active, containerRef, restoreTo]);
}

export function useHeadingFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

export function SceneBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="scene">
      <div className="scene__backdrop" aria-hidden="true" />
      <main className="scene__main">{children}</main>
      <img className="brand-logo" src={`${import.meta.env.BASE_URL}assets/logo_jungle_gaming.svg`} alt="Jungle Gaming" />
    </div>
  );
}
