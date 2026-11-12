/**
 * MediaEngine - owns ONE <video> element and everything that can go wrong with it.
 *
 * Why this exists
 * ---------------
 * The old player kept playback logic inside a React component. When you left a movie, the <video>
 * was just removed from the DOM: its network request kept running (browsers only abort on GC), the
 * server proxy kept pulling the file from the upstream host, and the next movie then fought the
 * leftover connection / quota and threw errors. This engine makes the lifecycle explicit:
 *
 *   - every load bumps a token, so late callbacks from a previous movie can never touch the new one
 *   - teardown pauses, strips `src`, calls load() (this is what really aborts the download),
 *     destroys HLS, revokes object URLs, clears every timer and aborts diagnostics
 *   - failures walk an ordered CANDIDATE chain (see sources.ts) with retry + backoff + resume
 *
 * It is framework free so it can be unit tested and driven from any UI.
 */

import {
  Candidate,
  SourceKind,
  addCacheBust,
  buildCandidates,
  isServerApiAvailable,
} from './sources';
import { canPlayNativeHls, msSinceUserGesture } from './device';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export type EngineErrorCode =
  | 'network'
  | 'timeout'
  | 'stall'
  | 'decode'
  | 'unsupported'
  | 'not-found'
  | 'forbidden'
  | 'quota'
  | 'no-server'
  | 'html'
  | 'unknown';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
  hint?: string;
}

export interface EngineState {
  status: EngineStatus;
  playing: boolean;
  buffering: boolean;
  ended: boolean;
  duration: number;
  muted: boolean;
  volume: number;
  /** Autoplay was blocked: the UI must show a "tap to play" affordance. */
  needsGesture: boolean;
  error: EngineError | null;
  candidates: Candidate[];
  candidateIndex: number;
  activeKind: SourceKind | null;
  hasVideoTrack: boolean;
  /** Increments for every load(); handy as a React key / effect dependency. */
  sourceId: number;
  reconnecting: boolean;
  /** Short transient message ("Switched to H.264 stream"). Auto clears. */
  notice: string | null;
}

export interface TimeState {
  currentTime: number;
  buffered: number;
  duration: number;
}

export type UserIntent =
  | { type: 'play'; time: number }
  | { type: 'pause'; time: number }
  | { type: 'seek'; time: number };

type Source = 'user' | 'remote';

const LOAD_TIMEOUT_MS = 30_000;
const STALL_TIMEOUT_MS = 12_000;
const MAX_SAME_SOURCE_RETRIES = 2;
const SUPPRESS_TTL_MS = 2_000;

const INITIAL_STATE: EngineState = {
  status: 'idle',
  playing: false,
  buffering: false,
  ended: false,
  duration: 0,
  muted: false,
  volume: 1,
  needsGesture: false,
  error: null,
  candidates: [],
  candidateIndex: 0,
  activeKind: null,
  hasVideoTrack: true,
  sourceId: 0,
  reconnecting: false,
  notice: null,
};

export class MediaEngine {
  private el: HTMLVideoElement | null = null;
  private state: EngineState = { ...INITIAL_STATE };
  private time: TimeState = { currentTime: 0, buffered: 0, duration: 0 };

  private stateListeners = new Set<() => void>();
  private timeListeners = new Set<() => void>();
  private intentListeners = new Set<(i: UserIntent) => void>();
  private readyListeners = new Set<() => void>();
  private endedListeners = new Set<() => void>();

  private token = 0;
  private candidates: Candidate[] = [];
  private index = 0;
  private attempts = 0;
  private resumeAt = 0;
  private wantAutoplay = false;
  private lastGoodTime = 0;
  private lastProgressAt = 0;
  private ownedBlobUrl: string | null = null;
  private rawUrl: string | null = null;
  /** True from load() until unload()/dispose(). Lets a re-attached <video> resume instead of going blank. */
  private session = false;

  private hls: any = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private diagAbort: AbortController | null = null;
  private failing = false;

  /** Counters for events WE caused, so they are not echoed back as user intents. */
  private expect = { play: 0, pause: 0, seek: 0 };
  private expectTimers: Partial<Record<'play' | 'pause' | 'seek', ReturnType<typeof setTimeout>>> = {};

  private boundHandlers: Array<[string, EventListener]> = [];

  private apiKnown: boolean | null = null;

  constructor() {
    // Warm the API probe so load() can usually stay synchronous (keeps iOS user-gesture context).
    void isServerApiAvailable().then((ok) => { this.apiKnown = ok; });
  }

  // -------------------------------------------------------------------------
  // Subscriptions (compatible with React useSyncExternalStore)
  // -------------------------------------------------------------------------

  getState = (): EngineState => this.state;
  getTime = (): TimeState => this.time;

  subscribeState = (cb: () => void): (() => void) => {
    this.stateListeners.add(cb);
    return () => { this.stateListeners.delete(cb); };
  };

  subscribeTime = (cb: () => void): (() => void) => {
    this.timeListeners.add(cb);
    return () => { this.timeListeners.delete(cb); };
  };

  onIntent(cb: (i: UserIntent) => void): () => void {
    this.intentListeners.add(cb);
    return () => { this.intentListeners.delete(cb); };
  }

  onReady(cb: () => void): () => void {
    this.readyListeners.add(cb);
    return () => { this.readyListeners.delete(cb); };
  }

  onEnded(cb: () => void): () => void {
    this.endedListeners.add(cb);
    return () => { this.endedListeners.delete(cb); };
  }

  private setState(patch: Partial<EngineState>): void {
    let changed = false;
    for (const k of Object.keys(patch) as Array<keyof EngineState>) {
      if (this.state[k] !== patch[k]) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.stateListeners.forEach((l) => l());
  }

  private setTime(patch: Partial<TimeState>): void {
    const next = { ...this.time, ...patch };
    if (next.currentTime === this.time.currentTime && next.buffered === this.time.buffered && next.duration === this.time.duration) return;
    this.time = next;
    this.timeListeners.forEach((l) => l());
  }

  private emitIntent(i: UserIntent): void {
    this.intentListeners.forEach((l) => l(i));
  }

  private flashNotice(msg: string, ms = 4500): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.setState({ notice: msg });
    this.noticeTimer = setTimeout(() => this.setState({ notice: null }), ms);
  }

  // -------------------------------------------------------------------------
  // Element binding
  // -------------------------------------------------------------------------

  /**
   * React ref callback target. Passing null (or a different element) detaches.
   *
   * Detaching must NOT forget what we were asked to play: React re-invokes ref callbacks (StrictMode,
   * re-mounts, moving the element between parents), and doing attach(null) -> attach(el) in the same
   * tick used to wipe a not-yet-started source, leaving a blank player (the "second movie won't play"
   * race). So a detach only releases the element; the session survives and a new element resumes it.
   */
  attach = (el: HTMLVideoElement | null): void => {
    if (el === this.el) return;
    let wasPlaying = false;
    if (this.el) {
      wasPlaying = !this.el.paused && !this.el.ended;
      const t = this.el.currentTime;
      if (t > 0) this.lastGoodTime = t;
      this.unbind();
      this.clearTimers();
      this.detachSourceOnly();
    }
    this.el = el;
    if (!el) return;

    // Phones: inline playback is mandatory or iOS hijacks the video into its own fullscreen player.
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.setAttribute('x5-playsinline', '');
    el.setAttribute('x-webkit-airplay', 'allow');
    el.playsInline = true;
    el.controls = false;
    el.preload = 'auto';
    el.disablePictureInPicture = false;

    this.bind();
    this.syncVolumeState();

    if (this.session && this.candidates.length > 0 && this.state.status !== 'error') {
      this.resumeAt = Math.max(this.resumeAt, this.lastGoodTime);
      this.wantAutoplay = wasPlaying || this.wantAutoplay;
      this.useCandidate(this.index, this.token, false);
    }
  };

  private bind(): void {
    const el = this.el!;
    const on = (name: string, fn: EventListener) => {
      el.addEventListener(name, fn);
      this.boundHandlers.push([name, fn]);
    };

    on('loadedmetadata', () => this.onLoadedMetadata());
    on('loadeddata', () => this.onLoadedData());
    on('durationchange', () => this.updateDuration());
    on('timeupdate', () => this.onTimeUpdate());
    on('progress', () => this.updateBuffered());
    on('seeked', () => this.onSeeked());
    on('play', () => this.onPlayEvent());
    on('pause', () => this.onPauseEvent());
    on('playing', () => this.onPlaying());
    on('canplay', () => this.onCanPlay());
    on('waiting', () => this.onWaiting());
    on('stalled', () => this.touchProgress(false));
    on('volumechange', () => this.syncVolumeState());
    on('ended', () => this.handleEnded());
    on('error', () => this.onElementError());

    this.stallTimer = setInterval(() => this.checkStall(), 2000);
  }

  private unbind(): void {
    const el = this.el;
    if (el) for (const [name, fn] of this.boundHandlers) el.removeEventListener(name, fn);
    this.boundHandlers = [];
    if (this.stallTimer) { clearInterval(this.stallTimer); this.stallTimer = null; }
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /** Load a stream URL (Drive, Archive.org, HLS, direct, or blob:). */
  async load(raw: string, opts: { startAt?: number; autoplay?: boolean } = {}): Promise<void> {
        const token = this.beginLoad(opts);
    this.rawUrl = raw;

    let apiAvailable = this.apiKnown;
    if (apiAvailable === null) {
      apiAvailable = await isServerApiAvailable();
      this.apiKnown = apiAvailable;
      if (token !== this.token) return; // superseded while probing
    }
    this.startWithCandidates(buildCandidates(raw, { apiAvailable }), token);
  }

  /** Load a user-selected local File. Fully synchronous so iOS keeps the user-gesture context. */
  loadFile(file: File | Blob, opts: { startAt?: number; autoplay?: boolean } = {}): void {
        const token = this.beginLoad(opts);
    const url = URL.createObjectURL(file);
    this.ownedBlobUrl = url;
    this.rawUrl = url;
    this.startWithCandidates([{ url, kind: 'blob', label: 'Local file' }], token);
  }

  private beginLoad(opts: { startAt?: number; autoplay?: boolean }): number {
    const token = ++this.token;
    this.session = true;
    this.teardownMedia();
    this.resumeAt = Math.max(0, opts.startAt || 0);
    this.lastGoodTime = this.resumeAt;
    this.wantAutoplay = !!opts.autoplay;
    this.attempts = 0;
    this.index = 0;
    this.failing = false;
    this.setTime({ currentTime: this.resumeAt, buffered: 0, duration: 0 });
    this.setState({
      status: 'loading',
      playing: false,
      buffering: true,
      ended: false,
      duration: 0,
      needsGesture: false,
      error: null,
      candidates: [],
      candidateIndex: 0,
      activeKind: null,
      hasVideoTrack: true,
      reconnecting: false,
      sourceId: this.state.sourceId + 1,
    });
    return token;
  }

  private startWithCandidates(cands: Candidate[], token: number): void {
    if (token !== this.token) return;
    this.candidates = cands;
    this.setState({ candidates: cands });
    if (cands.length === 0) {
      this.fail({ code: 'unsupported', message: 'No playable source was found for this title.' });
      return;
    }
    // No element yet (the <video> mounts right after we pick a source): attach() starts it.
    if (!this.el) return;
    this.useCandidate(0, token, false);
  }

  private useCandidate(i: number, token: number, bust: boolean): void {
    if (token !== this.token) return;
    const c = this.candidates[i];
    if (!c) return;
    this.index = i;
    this.setState({ candidateIndex: i, activeKind: c.kind, status: 'loading', buffering: true, error: null });
    this.clearTimers();
    this.detachSourceOnly();

    if (c.kind === 'embed') {
      // Third-party iframe takes over; there is nothing for us to drive.
      this.setState({ status: 'ready', buffering: false, hasVideoTrack: true });
      return;
    }

    const el = this.el;
    if (!el) return;

    this.armLoadTimeout(token);

    if (c.kind === 'hls' && !canPlayNativeHls()) {
      void this.attachHls(c.url, token);
      return;
    }

    el.src = bust ? addCacheBust(c.url) : c.url;
    try { el.load(); } catch { /* ignore */ }
    if (this.wantAutoplay) void this.tryAutoplay();
  }

  private async attachHls(url: string, token: number): Promise<void> {
    try {
      const mod: any = await import('hls.js');
      if (token !== this.token || !this.el) return;
      const Hls = mod.default || mod;
      if (!Hls.isSupported()) {
        this.onFailure('unsupported', 'This browser cannot play HLS streams.');
        return;
      }
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        startPosition: this.resumeAt > 0 ? this.resumeAt : -1,
      });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
        if (token !== this.token || !data?.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && this.attempts < MAX_SAME_SOURCE_RETRIES) {
          this.attempts++;
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && this.attempts < MAX_SAME_SOURCE_RETRIES) {
          this.attempts++;
          hls.recoverMediaError();
        } else {
          this.onFailure(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : 'decode');
        }
      });
      hls.loadSource(url);
      hls.attachMedia(this.el);
      if (this.wantAutoplay) void this.tryAutoplay();
    } catch {
      if (token === this.token) this.onFailure('unsupported', 'Could not start the HLS player.');
    }
  }

  // -------------------------------------------------------------------------
  // Teardown - the part that fixes "second movie won't play"
  // -------------------------------------------------------------------------

  private clearTimers(): void {
    if (this.loadTimer) { clearTimeout(this.loadTimer); this.loadTimer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.bufferTimer) { clearTimeout(this.bufferTimer); this.bufferTimer = null; }
    if (this.diagAbort) { this.diagAbort.abort(); this.diagAbort = null; }
  }

  /** Release the network connection and decoder of whatever is currently loaded. */
  private detachSourceOnly(): void {
    if (this.hls) {
      try { this.hls.destroy(); } catch { /* ignore */ }
      this.hls = null;
    }
    const el = this.el;
    if (el) {
      if (!el.paused) {
        // pause() queues a `pause` event; it must not be echoed to the room as a user action.
        this.expectEvent('pause');
        try { el.pause(); } catch { /* ignore */ }
      }
      if (el.getAttribute('src') !== null) {
        el.removeAttribute('src');
        try { el.load(); } catch { /* ignore */ } // load() with no src is what aborts the in-flight request
      }
    }
  }

  private teardownMedia(): void {
    this.clearTimers();
    if (this.noticeTimer) { clearTimeout(this.noticeTimer); this.noticeTimer = null; }
    (['play', 'pause', 'seek'] as const).forEach((k) => {
      this.expect[k] = 0;
      const t = this.expectTimers[k];
      if (t) clearTimeout(t);
      delete this.expectTimers[k];
    });
    this.detachSourceOnly();
    if (this.ownedBlobUrl) {
      try { URL.revokeObjectURL(this.ownedBlobUrl); } catch { /* ignore */ }
      this.ownedBlobUrl = null;
    }
  }

  /** Stop playback and free everything, but keep the engine reusable. */
  unload(): void {
    this.token++;
    this.session = false;
    this.teardownMedia();
    this.rawUrl = null;
    this.candidates = [];
    this.setTime({ currentTime: 0, buffered: 0, duration: 0 });
    this.setState({ ...INITIAL_STATE, sourceId: this.state.sourceId + 1, volume: this.state.volume, muted: this.state.muted });
  }

  /**
   * Release the element and every resource (component unmount). Deliberately NOT terminal: React
   * StrictMode simulates unmount/mount, so the engine must be re-attachable afterwards.
   */
  dispose(): void {
    this.token++;
    this.session = false;
    this.candidates = [];
    this.unbind();
    this.teardownMedia();
    this.el = null;
    this.setState({ ...INITIAL_STATE, sourceId: this.state.sourceId + 1, volume: this.state.volume, muted: this.state.muted });
  }

  // -------------------------------------------------------------------------
  // Element event handlers
  // -------------------------------------------------------------------------

  private armLoadTimeout(token: number): void {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      if (token !== this.token) return;
      this.onFailure('timeout');
    }, LOAD_TIMEOUT_MS);
  }

  private onLoadedMetadata(): void {
    const el = this.el;
    if (!el || !this.isLive()) return;
    if (this.loadTimer) { clearTimeout(this.loadTimer); this.loadTimer = null; }
    this.updateDuration();
    this.setState({ status: 'ready', reconnecting: false, error: null });
    if (this.resumeAt > 0.5) {
      this.expectEvent('seek');
      try { el.currentTime = Math.min(this.resumeAt, isFinite(el.duration) ? el.duration : this.resumeAt); } catch { /* ignore */ }
    }
    this.touchProgress(true);
    this.readyListeners.forEach((l) => l());
    if (this.wantAutoplay && el.paused) void this.tryAutoplay();
  }

  private onLoadedData(): void {
    const el = this.el;
    if (!el || !this.isLive()) return;
    // Classic HEVC-on-a-phone symptom: audio plays, picture never appears (videoWidth stays 0).
    const noVideo = el.videoWidth === 0 && el.videoHeight === 0 && this.state.activeKind !== 'embed';
    if (noVideo) {
      const hasNext = this.index < this.candidates.length - 1;
      if (hasNext) {
        this.onFailure('decode');
        return;
      }
      this.setState({ hasVideoTrack: false });
      this.flashNotice('No picture was decoded. This device may not support the video codec.', 8000);
    } else {
      this.setState({ hasVideoTrack: true });
    }
    this.updateBuffered();
  }

  private onCanPlay(): void {
    this.setBuffering(false);
    if (this.wantAutoplay && this.el?.paused && !this.state.needsGesture) void this.tryAutoplay();
  }

  private onPlaying(): void {
    this.setBuffering(false);
    this.touchProgress(true);
    this.setState({ playing: true, needsGesture: false, ended: false, error: null, reconnecting: false });
    this.attempts = 0;
  }

  private onWaiting(): void {
    if (!this.isLive()) return;
    // Debounce: short hiccups should not flash a spinner.
    if (this.bufferTimer) return;
    this.bufferTimer = setTimeout(() => {
      this.bufferTimer = null;
      if (this.el && !this.el.paused && this.el.readyState < 3) this.setState({ buffering: true });
    }, 350);
  }

  private setBuffering(v: boolean): void {
    if (!v && this.bufferTimer) { clearTimeout(this.bufferTimer); this.bufferTimer = null; }
    this.setState({ buffering: v });
  }

  private onTimeUpdate(): void {
    const el = this.el;
    if (!el || !this.isLive()) return;
    const t = el.currentTime;
    if (t !== this.time.currentTime && !el.paused) this.touchProgress(true);
    if (t > 0) this.lastGoodTime = t;
    this.setTime({ currentTime: t });
    this.updateBuffered();
  }

  private onSeeked(): void {
    const el = this.el;
    if (!el || !this.isLive()) return;
    this.setTime({ currentTime: el.currentTime });
    this.lastGoodTime = el.currentTime;
    if (this.consumeExpect('seek')) return;
    // Seek that did not come through our API (e.g. native controls). Only a real gesture counts.
    if (msSinceUserGesture() < 1500) this.emitIntent({ type: 'seek', time: el.currentTime });
  }

  private onPlayEvent(): void {
    if (!this.isLive()) return;
    this.setState({ playing: true, ended: false });
    if (this.consumeExpect('play')) return;
    if (msSinceUserGesture() < 1500) this.emitIntent({ type: 'play', time: this.el?.currentTime || 0 });
  }

  private onPauseEvent(): void {
    const el = this.el;
    if (!el || !this.isLive()) return;
    if (el.ended) return; // spec fires `pause` right before `ended`
    this.setState({ playing: false });
    if (this.consumeExpect('pause')) return;
    // OS-initiated pause (phone call, lock screen, headset unplugged): reflect locally, never broadcast.
    if (msSinceUserGesture() < 1500) this.emitIntent({ type: 'pause', time: el.currentTime });
  }

  private handleEnded(): void {
    if (!this.isLive()) return;
    this.setState({ playing: false, ended: true, buffering: false });
    this.endedListeners.forEach((l) => l());
  }

  private onElementError(): void {
    const el = this.el;
    if (!el) return;
    // Errors fired by us stripping `src` during teardown are not real failures.
    if (!el.getAttribute('src') && !this.hls) return;
    const err = el.error;
    if (!err) return;
    if (err.code === 1 /* MEDIA_ERR_ABORTED */) return;
    if (err.code === 2 /* NETWORK */) this.onFailure('network');
    else if (err.code === 3 /* DECODE */) this.onFailure('decode');
    else this.onFailure('unsupported'); // 4: SRC_NOT_SUPPORTED (iOS also reports codec problems here)
  }

  private updateDuration(): void {
    const el = this.el;
    if (!el) return;
    const d = isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    this.setTime({ duration: d });
    this.setState({ duration: d });
  }

  private updateBuffered(): void {
    const el = this.el;
    if (!el) return;
    let end = 0;
    try {
      const r = el.buffered;
      const t = el.currentTime;
      for (let i = 0; i < r.length; i++) {
        if (r.start(i) <= t + 0.5 && r.end(i) >= t) { end = r.end(i); break; }
        end = Math.max(end, r.end(i));
      }
    } catch { /* ignore */ }
    this.setTime({ buffered: end });
  }

  private syncVolumeState(): void {
    const el = this.el;
    if (!el) return;
    this.setState({ muted: el.muted, volume: el.volume });
  }

  private isLive(): boolean {
    return !!this.el && (!!this.el.getAttribute('src') || !!this.hls);
  }

  // -------------------------------------------------------------------------
  // Suppressing echoes of our own programmatic changes
  // -------------------------------------------------------------------------

  private expectEvent(k: 'play' | 'pause' | 'seek'): void {
    this.expect[k]++;
    const prev = this.expectTimers[k];
    if (prev) clearTimeout(prev);
    this.expectTimers[k] = setTimeout(() => { this.expect[k] = 0; }, SUPPRESS_TTL_MS);
  }

  private consumeExpect(k: 'play' | 'pause' | 'seek'): boolean {
    if (this.expect[k] > 0) {
      this.expect[k]--;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Failure handling / recovery
  // -------------------------------------------------------------------------

  private touchProgress(real: boolean): void {
    if (real) this.lastProgressAt = Date.now();
  }

  private checkStall(): void {
    const el = this.el;
    if (!el || !this.isLive() || this.failing) return;
    if (el.paused || el.ended || el.seeking) {
      this.lastProgressAt = Date.now();
      return;
    }
    if (el.readyState >= 3) {
      this.lastProgressAt = Date.now();
      return;
    }
    if (Date.now() - this.lastProgressAt > STALL_TIMEOUT_MS) {
      this.lastProgressAt = Date.now();
      this.onFailure('stall');
    }
  }

  private onFailure(kind: EngineErrorCode, detail?: string): void {
    if (this.failing) return;
    const token = this.token;
    const el = this.el;
    const live = el ? el.currentTime : 0;
    if (live > 0) this.lastGoodTime = live;
    const resume = Math.max(this.lastGoodTime, this.resumeAt);
    const wasPlaying = !!el && !el.paused;
    this.failing = true;
    this.clearTimers();

    const current = this.candidates[this.index];
    // Phones report a transient server blip at load time as "format not supported" (code 4), so a remote
    // source gets exactly one retry (cache-busted) before we conclude it really cannot play.
    const retryable =
      kind === 'network' || kind === 'timeout' || kind === 'stall' ||
      (kind === 'unsupported' && !!current && current.kind !== 'blob' && current.kind !== 'embed' && this.attempts < 1);
    const canRetrySame = retryable && this.attempts < MAX_SAME_SOURCE_RETRIES && current && current.kind !== 'blob' && current.kind !== 'embed';

    if (canRetrySame) {
      this.attempts++;
      const delay = 700 * Math.pow(2, this.attempts - 1);
      this.setState({ reconnecting: true, buffering: true });
      this.retryTimer = setTimeout(() => {
        if (token !== this.token) return;
        this.failing = false;
        this.resumeAt = resume;
        this.wantAutoplay = wasPlaying || this.wantAutoplay;
        this.useCandidate(this.index, token, true);
      }, delay);
      return;
    }

    // Same source is not going to work. Find out WHY (same-origin proxy only), then move on.
    void (async () => {
      const diag = current ? await this.diagnose(current.url, token) : null;
      if (token !== this.token) return;

      if (diag?.code === 'no-server') this.apiKnown = false;

      const next = this.index + 1;
      if (next < this.candidates.length) {
        this.failing = false;
        this.attempts = 0;
        this.resumeAt = resume;
        this.wantAutoplay = wasPlaying || this.wantAutoplay;
        const label = this.candidates[next].label;
        this.flashNotice(`That source failed${diag ? ` (${diag.message.replace(/\.$/, '')})` : ''}. Trying ${label}…`, 5000);
        this.useCandidate(next, token, false);
        return;
      }

      this.failing = false;
      this.fail(diag || this.describe(kind, detail), resume);
    })();
  }

  private fail(err: EngineError, resume?: number): void {
    this.clearTimers();
    this.detachSourceOnly();
    if (resume !== undefined) this.resumeAt = resume;
    this.setState({ status: 'error', error: err, buffering: false, playing: false, reconnecting: false });
  }

  private describe(kind: EngineErrorCode, detail?: string): EngineError {
    switch (kind) {
      case 'network':
      case 'timeout':
      case 'stall':
        return { code: kind, message: detail || 'The connection dropped or is too slow to keep playing.', hint: 'Check your signal, then tap Retry. Playback resumes where it stopped.' };
      case 'decode':
        return { code: 'decode', message: detail || "This device couldn't decode the video.", hint: 'The file likely uses a codec your phone does not support (often HEVC/H.265). Try another source or an MP4 (H.264) copy.' };
      case 'unsupported':
        return { code: 'unsupported', message: detail || "This video couldn't be played.", hint: 'The link may be broken, or this phone cannot decode its format. Try another source, or pick an MP4 (H.264) file from your phone.' };
      default:
        return { code: 'unknown', message: detail || 'Something went wrong while loading the video.' };
    }
  }

  /** Same-origin only (cross-origin responses are opaque). Reads our server's X-Stream-Error header. */
  private async diagnose(url: string, token: number): Promise<EngineError | null> {
    if (!url.startsWith('/')) return null;
    const ctrl = new AbortController();
    this.diagAbort = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: ctrl.signal, cache: 'no-store' });
      const type = (res.headers.get('content-type') || '').toLowerCase();
      const tag = res.headers.get('x-stream-error');
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (token !== this.token) return null;

      if (tag === 'quota' || res.status === 429) {
        return { code: 'quota', message: 'Google Drive is rate-limiting this file (download quota reached).', hint: 'Wait a few minutes, use the Drive player, or play your own copy.' };
      }
      if (tag === 'private' || res.status === 401 || res.status === 403) {
        return { code: 'forbidden', message: 'This file is not shared publicly.', hint: 'Set sharing to "Anyone with the link can view".' };
      }
      if (tag === 'notfound' || res.status === 404) {
        return { code: 'not-found', message: 'The video file was not found.', hint: 'It may have been moved or deleted.' };
      }
      if (type.includes('text/html')) {
        // Static hosting rewrites unknown paths to index.html: there is no streaming server here.
        return { code: 'no-server', message: 'The streaming server is not available on this hosting.', hint: 'Use a direct link, the Drive player, or play a local file.' };
      }
      if (res.status >= 500) {
        return { code: 'network', message: 'The streaming server had a problem. Try again in a moment.' };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      if (this.diagAbort === ctrl) this.diagAbort = null;
    }
  }

  // -------------------------------------------------------------------------
  // Public controls
  // -------------------------------------------------------------------------

  private async tryAutoplay(): Promise<void> {
    await this.play('remote');
  }

  async play(source: Source = 'user'): Promise<void> {
    const el = this.el;
    if (!el || this.state.activeKind === 'embed') return;
    if (!this.isLive()) {
      this.wantAutoplay = true; // remember intent until the source is attached
      return;
    }
    const wasPaused = el.paused;
    if (wasPaused) this.expectEvent('play');
    try {
      await el.play();
      this.setState({ needsGesture: false });
      if (source === 'user' && wasPaused) this.emitIntent({ type: 'play', time: el.currentTime });
    } catch (e: any) {
      if (wasPaused) this.expect.play = Math.max(0, this.expect.play - 1);
      if (e?.name === 'NotAllowedError') {
        // Mobile autoplay policy: needs a real tap. Surface it instead of failing silently.
        this.setState({ needsGesture: true, playing: false, buffering: false });
      }
      // AbortError = interrupted by a newer load/pause; NotSupportedError = no source yet. Both are benign here.
    }
  }

  pause(source: Source = 'user'): void {
    const el = this.el;
    if (!el) return;
    this.wantAutoplay = false;
    if (!el.paused) {
      this.expectEvent('pause');
      el.pause();
      if (source === 'user') this.emitIntent({ type: 'pause', time: el.currentTime });
    }
  }

  toggle(): void {
    const el = this.el;
    if (!el) return;
    if (el.paused || el.ended) void this.play('user');
    else this.pause('user');
  }

  seek(time: number, source: Source = 'user'): void {
    const el = this.el;
    if (!el) return;
    const dur = this.time.duration;
    let t = Math.max(0, time);
    if (dur > 0) t = Math.min(t, Math.max(0, dur - 0.05));
    if (!this.isLive() || el.readyState === 0) {
      this.resumeAt = t; // applied on loadedmetadata
      this.setTime({ currentTime: t });
      return;
    }
    if (Math.abs(el.currentTime - t) > 0.05) this.expectEvent('seek');
    try { el.currentTime = t; } catch { /* ignore */ }
    this.lastGoodTime = t;
    this.setTime({ currentTime: t });
    if (source === 'user') this.emitIntent({ type: 'seek', time: t });
  }

  skip(delta: number, source: Source = 'user'): void {
    const el = this.el;
    if (!el) return;
    this.seek((el.currentTime || this.time.currentTime) + delta, source);
  }

  setMuted(m: boolean): void {
    if (this.el) this.el.muted = m;
    this.syncVolumeState();
  }

  setVolume(v: number): void {
    if (!this.el) return;
    const vol = Math.min(1, Math.max(0, v));
    this.el.volume = vol;
    this.el.muted = vol === 0;
    this.syncVolumeState();
  }

  /** Reload the current source at the last good position (cache-busting proxy/direct URLs). */
  retry(): void {
    if (this.candidates.length === 0) return;
    const token = ++this.token;
    const el = this.el;
    const resume = Math.max(this.lastGoodTime, el ? el.currentTime : 0, this.resumeAt);
    this.clearTimers();
    this.failing = false;
    this.attempts = 0;
    this.resumeAt = resume;
    this.wantAutoplay = true;
    this.setState({ status: 'loading', error: null, buffering: true, reconnecting: false });
    this.useCandidate(this.index, token, true);
  }

  /** Manually switch to a specific candidate (source menu). Resumes at the current position. */
  selectSource(i: number): void {
    if (this.candidates.length === 0 || i < 0 || i >= this.candidates.length) return;
    const token = ++this.token;
    const el = this.el;
    this.resumeAt = Math.max(this.lastGoodTime, el ? el.currentTime : 0, this.resumeAt);
    this.wantAutoplay = el ? !el.paused || this.wantAutoplay : this.wantAutoplay;
    this.failing = false;
    this.attempts = 0;
    this.clearTimers();
    this.flashNotice(`Switching to ${this.candidates[i].label}…`);
    this.useCandidate(i, token, false);
  }

  /** Manually advance to the next candidate (wraps around). */
  tryNextSource(): void {
    if (this.candidates.length < 2) return;
    this.selectSource((this.index + 1) % this.candidates.length);
  }

  getRawUrl(): string | null {
    return this.rawUrl;
  }

  getElement(): HTMLVideoElement | null {
    return this.el;
  }

  getCurrentTime(): number {
    return this.el ? this.el.currentTime : this.time.currentTime;
  }

  isPaused(): boolean {
    return this.el ? this.el.paused : true;
  }

  hasSource(): boolean {
    return this.isLive() || this.state.activeKind === 'embed';
  }

  isReady(): boolean {
    return this.state.status === 'ready' && (this.el ? this.el.readyState >= 1 : false);
  }

  /** iPhone-only escape hatch: hand the video to the OS player (loses our overlay). */
  enterNativeFullscreen(): boolean {
    const el = this.el as any;
    if (el && typeof el.webkitEnterFullscreen === 'function') {
      try { el.webkitEnterFullscreen(); return true; } catch { /* ignore */ }
    }
    return false;
  }
}
