import React, { useCallback, useRef, useState } from 'react';
import { MediaEngine } from '../../player/mediaEngine';
import { useEngineTime } from '../../player/useMediaEngine';
import { formatSeconds } from './format';

interface SeekbarProps {
  engine: MediaEngine;
  onScrubChange?: (scrubbing: boolean) => void;
}

/**
 * Touch-first seek bar.
 *  - 44px tall hit area, thin visual track that grows while dragging
 *  - pointer events + capture (works for finger, pen and mouse; the page can't scroll under it)
 *  - the seek is COMMITTED on release only, so dragging never spams the room with updates
 *  - shows buffered range and a time bubble while scrubbing
 *  - works with an unknown duration (live/odd streams) instead of dividing by zero
 */
export const Seekbar: React.FC<SeekbarProps> = ({ engine, onScrubChange }) => {
  const { currentTime, buffered, duration } = useEngineTime(engine);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const timeFromEvent = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    return ratio * duration;
  }, [duration]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onScrubChange?.(true);
    setScrubTime(timeFromEvent(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setScrubTime(timeFromEvent(e.clientX));
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const t = timeFromEvent(e.clientX);
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setScrubTime(null);
    onScrubChange?.(false);
    if (commit) engine.seek(t, 'user');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); engine.skip(-5); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); engine.skip(5); }
    else if (e.key === 'Home') { e.preventDefault(); engine.seek(0); }
    else if (e.key === 'End' && duration > 0) { e.preventDefault(); engine.seek(duration); }
  };

  const shown = scrubTime ?? currentTime;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (shown / duration) * 100)) : 0;
  const bufPct = duration > 0 ? Math.min(100, Math.max(0, (buffered / duration) * 100)) : 0;
  const active = scrubTime !== null;

  return (
    <div className="flex items-center gap-2.5 w-full select-none" onClick={(e) => e.stopPropagation()}>
      <span className="text-[11px] font-mono tabular-nums text-white/90 min-w-[34px] text-right">{formatSeconds(shown)}</span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatSeconds(shown)} of ${formatSeconds(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, false)}
        onKeyDown={onKeyDown}
        className="relative flex-1 h-11 flex items-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 rounded-full"
        style={{ touchAction: 'none' }}
      >
        <div className={`relative w-full rounded-full bg-white/25 transition-all duration-150 ${active ? 'h-2' : 'h-1'}`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400" style={{ width: `${pct}%` }} />
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-lg transition-all duration-150 ${active ? 'w-5 h-5' : 'w-3.5 h-3.5'}`}
            style={{ left: `${pct}%` }}
          />
          {active && (
            <div
              className="absolute -top-9 -translate-x-1/2 px-2 py-1 rounded-lg bg-black/80 border border-white/15 text-[11px] font-mono text-white pointer-events-none"
              style={{ left: `${Math.min(92, Math.max(8, pct))}%` }}
            >
              {formatSeconds(shown)}
            </div>
          )}
        </div>
      </div>

      <span className="text-[11px] font-mono tabular-nums text-white/70 min-w-[34px]">{duration > 0 ? formatSeconds(duration) : '--:--'}</span>
    </div>
  );
};
