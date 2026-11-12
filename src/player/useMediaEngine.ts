import { useEffect, useRef, useSyncExternalStore } from 'react';
import { EngineState, MediaEngine, TimeState } from './mediaEngine';

/**
 * Owns one MediaEngine for the lifetime of the component.
 * - `state` changes rarely (play/pause/buffering/error...) so the whole player can read it.
 * - Time changes ~4x/second, so it has its own hook (useEngineTime) that only the seek bar uses.
 */
export function useMediaEngine() {
  const ref = useRef<MediaEngine | null>(null);
  if (!ref.current) ref.current = new MediaEngine();
  const engine = ref.current;

  // dispose() is non-terminal on purpose: React StrictMode simulates an unmount and remount.
  useEffect(() => () => engine.dispose(), [engine]);

  const state: EngineState = useSyncExternalStore(engine.subscribeState, engine.getState, engine.getState);
  return { engine, state, videoRef: engine.attach };
}

export function useEngineTime(engine: MediaEngine): TimeState {
  return useSyncExternalStore(engine.subscribeTime, engine.getTime, engine.getTime);
}
