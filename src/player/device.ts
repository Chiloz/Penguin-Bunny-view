/**
 * Device / platform helpers for the player.
 * Everything here is feature-detected, never trusted blindly, and safe to call on the server.
 */

const hasWindow = typeof window !== 'undefined' && typeof navigator !== 'undefined';

export const isIOS: boolean = hasWindow && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS 13+ reports as Mac with touch support
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
);

export const isAndroid: boolean = hasWindow && /Android/i.test(navigator.userAgent);

export const isMobile: boolean = hasWindow && (
  isIOS || isAndroid || /Mobi|Mobile/i.test(navigator.userAgent) ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
);

/** iPhone (not iPad): the only platform where element fullscreen is unavailable for non-video elements. */
export const isIPhone: boolean = hasWindow && /iPhone|iPod/.test(navigator.userAgent);

export const isStandalonePWA: boolean = hasWindow && (
  (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
  (navigator as any).standalone === true
);

// ---------------------------------------------------------------------------
// User-gesture tracking. The OS pauses video for calls, lock screen, Bluetooth drops, etc. Those pauses
// must NOT be broadcast to the room as "the user paused". A genuine pause is preceded by a tap/key.
// ---------------------------------------------------------------------------

let lastGestureAt = 0;
if (hasWindow) {
  const mark = () => { lastGestureAt = Date.now(); };
  ['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, mark, { capture: true, passive: true })
  );
}
export function msSinceUserGesture(): number {
  return Date.now() - lastGestureAt;
}
export function noteUserGesture(): void {
  lastGestureAt = Date.now();
}

let volumeSupportCache: boolean | null = null;
/** iOS ignores `video.volume` (it is always 1). Hardware buttons control volume there. */
export function supportsVolumeControl(): boolean {
  if (!hasWindow) return true;
  if (volumeSupportCache !== null) return volumeSupportCache;
  try {
    const v = document.createElement('video');
    v.volume = 0.5;
    volumeSupportCache = v.volume === 0.5;
  } catch {
    volumeSupportCache = false;
  }
  return volumeSupportCache;
}

export function canPlayNativeHls(): boolean {
  if (!hasWindow) return false;
  try {
    const v = document.createElement('video');
    return v.canPlayType('application/vnd.apple.mpegurl') !== '';
  } catch {
    return false;
  }
}

/** Containers phones cannot decode reliably. Used to give an honest message instead of a black screen. */
export function containerLikelyUnsupported(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (isIOS && ['.mkv', '.avi', '.wmv', '.flv', '.ts', '.mpg', '.mpeg', '.m2ts', '.ogv'].includes(ext)) {
    return `iPhones and iPads can't decode ${ext} files. Use an MP4 (H.264) copy, or stream the cloud version.`;
  }
  if (isAndroid && ['.avi', '.wmv', '.flv', '.m2ts'].includes(ext)) {
    return `Many Android phones can't decode ${ext} files. An MP4 (H.264) copy plays everywhere.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------

export function getFullscreenElement(): Element | null {
  if (!hasWindow) return null;
  const d = document as any;
  return document.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement || null;
}

export function canRequestElementFullscreen(el: HTMLElement | null): boolean {
  if (!el) return false;
  const e = el as any;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen || e.mozRequestFullScreen || e.msRequestFullscreen);
}

export async function requestElementFullscreen(el: HTMLElement): Promise<boolean> {
  const e = el as any;
  try {
    if (e.requestFullscreen) await e.requestFullscreen({ navigationUI: 'hide' });
    else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
    else if (e.mozRequestFullScreen) await e.mozRequestFullScreen();
    else if (e.msRequestFullscreen) await e.msRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export async function exitElementFullscreen(): Promise<void> {
  const d = document as any;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    else if (d.mozCancelFullScreen) await d.mozCancelFullScreen();
    else if (d.msExitFullscreen) await d.msExitFullscreen();
  } catch {
    /* ignore */
  }
}

/** Best-effort landscape lock. Only works in fullscreen on Android Chrome; silently ignored elsewhere. */
export async function lockLandscape(): Promise<void> {
  try {
    const o = (screen as any).orientation;
    if (o && typeof o.lock === 'function') await o.lock('landscape');
  } catch {
    /* not supported / not allowed */
  }
}

export function unlockOrientation(): void {
  try {
    const o = (screen as any).orientation;
    if (o && typeof o.unlock === 'function') o.unlock();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Screen wake lock (keeps the phone awake while a movie plays)
// ---------------------------------------------------------------------------

export class WakeLockManager {
  private sentinel: any = null;
  private wanted = false;
  private onVisibility = () => {
    if (document.visibilityState === 'visible' && this.wanted && !this.sentinel) {
      void this.acquire();
    }
  };

  constructor() {
    if (hasWindow) document.addEventListener('visibilitychange', this.onVisibility);
  }

  async request(): Promise<void> {
    this.wanted = true;
    await this.acquire();
  }

  private async acquire(): Promise<void> {
    try {
      const wl = (navigator as any).wakeLock;
      if (!wl || this.sentinel) return;
      this.sentinel = await wl.request('screen');
      this.sentinel.addEventListener?.('release', () => { this.sentinel = null; });
    } catch {
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    try {
      await this.sentinel?.release?.();
    } catch {
      /* ignore */
    }
    this.sentinel = null;
  }

  destroy(): void {
    void this.release();
    if (hasWindow) document.removeEventListener('visibilitychange', this.onVisibility);
  }
}

// ---------------------------------------------------------------------------
// Media Session (lock screen / notification shade / headset controls)
// ---------------------------------------------------------------------------

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  seekBy: (delta: number) => void;
  next?: () => void;
  previous?: () => void;
}

export function bindMediaSession(title: string, subtitle: string, h: MediaSessionHandlers): () => void {
  const ms = hasWindow ? (navigator as any).mediaSession : null;
  if (!ms) return () => {};
  try {
    const MM = (window as any).MediaMetadata;
    if (MM) {
      ms.metadata = new MM({
        title,
        artist: subtitle,
        album: 'Penguin View',
        artwork: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
    }
  } catch {
    /* ignore */
  }
  const set = (action: string, fn: ((d?: any) => void) | null) => {
    try { ms.setActionHandler(action, fn); } catch { /* unsupported action */ }
  };
  set('play', () => h.play());
  set('pause', () => h.pause());
  set('seekto', (d: any) => { if (d && typeof d.seekTime === 'number') h.seekTo(d.seekTime); });
  set('seekforward', (d: any) => h.seekBy(d?.seekOffset || 10));
  set('seekbackward', (d: any) => h.seekBy(-(d?.seekOffset || 10)));
  set('nexttrack', h.next ? () => h.next!() : null);
  set('previoustrack', h.previous ? () => h.previous!() : null);
  return () => {
    ['play', 'pause', 'seekto', 'seekforward', 'seekbackward', 'nexttrack', 'previoustrack'].forEach((a) => set(a, null));
    try { ms.metadata = null; } catch { /* ignore */ }
  };
}

export function updateMediaSessionPosition(position: number, duration: number, rate: number): void {
  const ms = hasWindow ? (navigator as any).mediaSession : null;
  if (!ms || typeof ms.setPositionState !== 'function') return;
  if (!isFinite(duration) || duration <= 0) return;
  try {
    ms.setPositionState({ duration, position: Math.min(Math.max(position, 0), duration), playbackRate: rate || 1 });
  } catch {
    /* ignore invalid state */
  }
}

export function haptic(ms = 12): void {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}
