import React, { useState } from 'react';
import {
  ChevronLeft,
  Layers,
  Maximize,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
  Smile,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MediaEngine, EngineState } from '../../player/mediaEngine';
import { Seekbar } from './Seekbar';
import { haptic } from '../../player/device';

export const REACTION_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😢'];

interface PlayerControlsProps {
  engine: MediaEngine;
  state: EngineState;
  visible: boolean;
  title: string;
  subtitle?: string;
  memberCount: number;
  isFullscreen: boolean;
  /** Small portrait stage: only the essentials fit over the picture; the rest lives in the action bar. */
  compact: boolean;
  showVolume: boolean;
  canPrev: boolean;
  canNext: boolean;
  hasMultipleSources: boolean;
  onBack: () => void;
  onShare: () => void;
  onToggleFullscreen: () => void;
  onPrev: () => void;
  onNext: () => void;
  onResync: () => void;
  onOpenSource: () => void;
  onReact: (emoji: string) => void;
  onOpenMembers: () => void;
  onInteract: () => void;
  onScrubChange: (scrubbing: boolean) => void;
}

const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  active?: boolean;
}> = ({ label, onClick, children, disabled, className = '', active }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={(e) => { e.stopPropagation(); haptic(8); onClick(); }}
    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
      active ? 'bg-white/20 text-white' : 'text-white/90 hover:bg-white/10'
    } ${className}`}
  >
    {children}
  </button>
);

export const PlayerControls: React.FC<PlayerControlsProps> = (p) => {
  const { engine, state } = p;
  const [showEmojis, setShowEmojis] = useState(false);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const hidden = !p.visible;

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-200 ${hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      aria-hidden={hidden}
    >
      {/* Top bar */}
      <div
        className={`flex items-center gap-1 px-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent ${p.compact ? 'pt-1 pb-3' : 'pt-[max(env(safe-area-inset-top),8px)] pb-6'}`}
        onClick={stop}
      >
        <IconButton label="Leave room" onClick={p.onBack}>
          <ChevronLeft className="w-6 h-6" />
        </IconButton>
        <div className="min-w-0 flex-1 px-1">
          <p className="text-sm font-bold text-white truncate leading-tight">{p.title}</p>
          {p.subtitle && !p.compact && <p className="text-[11px] text-white/60 truncate leading-tight">{p.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); p.onOpenMembers(); }}
          className="h-9 px-2.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
          aria-label={`${p.memberCount} watching`}
        >
          <Users className="w-3.5 h-3.5 text-sky-300" />
          {p.memberCount}
        </button>
        <IconButton label="Invite friends" onClick={p.onShare}>
          <Share2 className="w-5 h-5" />
        </IconButton>
      </div>

      {/* Centre cluster */}
      <div className="flex items-center justify-center gap-6 sm:gap-10 pointer-events-none">
        <button
          type="button"
          aria-label="Back 10 seconds"
          onClick={(e) => { e.stopPropagation(); haptic(8); engine.skip(-10); }}
          className={`pointer-events-auto relative rounded-full flex items-center justify-center text-white/90 bg-black/30 backdrop-blur-sm active:scale-90 transition-all ${p.compact ? 'w-10 h-10' : 'w-12 h-12'}`}
        >
          <RotateCcw className={p.compact ? 'w-6 h-6' : 'w-7 h-7'} strokeWidth={1.6} />
          <span className="absolute text-[9px] font-bold mt-0.5">10</span>
        </button>

        <button
          type="button"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={(e) => { e.stopPropagation(); haptic(14); engine.toggle(); }}
          className={`pointer-events-auto rounded-full flex items-center justify-center text-white bg-white/15 backdrop-blur-md border border-white/25 shadow-2xl active:scale-90 transition-all ${p.compact ? 'w-14 h-14' : 'w-[68px] h-[68px] sm:w-20 sm:h-20'}`}
        >
          {state.playing ? <Pause className={p.compact ? 'w-6 h-6 fill-current' : 'w-8 h-8 fill-current'} /> : <Play className={p.compact ? 'w-6 h-6 fill-current ml-0.5' : 'w-8 h-8 fill-current ml-1'} />}
        </button>

        <button
          type="button"
          aria-label="Forward 10 seconds"
          onClick={(e) => { e.stopPropagation(); haptic(8); engine.skip(10); }}
          className={`pointer-events-auto relative rounded-full flex items-center justify-center text-white/90 bg-black/30 backdrop-blur-sm active:scale-90 transition-all ${p.compact ? 'w-10 h-10' : 'w-12 h-12'}`}
        >
          <RotateCw className={p.compact ? 'w-6 h-6' : 'w-7 h-7'} strokeWidth={1.6} />
          <span className="absolute text-[9px] font-bold mt-0.5">10</span>
        </button>
      </div>

      {/* Bottom bar */}
      <div
        className={`px-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent ${p.compact ? 'pb-0.5 pt-4' : 'pb-[max(env(safe-area-inset-bottom),8px)] pt-8'}`}
        onClick={stop}
      >
        {showEmojis && !p.compact && (
          <div className="flex items-center justify-center gap-1 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { haptic(10); p.onReact(e); p.onInteract(); }}
                className="w-11 h-11 rounded-full text-2xl flex items-center justify-center bg-white/10 border border-white/10 active:scale-125 transition-transform"
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {p.compact ? (
          <div className="flex items-center">
            <div className="flex-1 min-w-0"><Seekbar engine={engine} onScrubChange={p.onScrubChange} /></div>
            <IconButton label="Full screen" onClick={p.onToggleFullscreen}>
              <Maximize className="w-5 h-5" />
            </IconButton>
          </div>
        ) : (<>
        <Seekbar engine={engine} onScrubChange={p.onScrubChange} />

        <div className="flex items-center justify-between -mt-1">
          <div className="flex items-center">
            <IconButton label="Previous episode" onClick={p.onPrev} disabled={!p.canPrev}>
              <SkipBack className="w-5 h-5 fill-current" />
            </IconButton>
            <IconButton label="Next episode" onClick={p.onNext} disabled={!p.canNext}>
              <SkipForward className="w-5 h-5 fill-current" />
            </IconButton>
            <IconButton label={state.muted || state.volume === 0 ? 'Unmute' : 'Mute'} onClick={() => engine.setMuted(!state.muted)}>
              {state.muted || state.volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </IconButton>
            {p.showVolume && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={state.muted ? 0 : state.volume}
                onChange={(e) => engine.setVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="hidden md:block w-20 accent-sky-400 mr-1"
              />
            )}
          </div>

          <div className="flex items-center">
            <IconButton label="Reactions" onClick={() => setShowEmojis((v) => !v)} active={showEmojis}>
              <Smile className="w-5 h-5" />
            </IconButton>
            <IconButton label="Sync with the room" onClick={p.onResync}>
              <RefreshCw className="w-5 h-5" />
            </IconButton>
            <IconButton label="Video source" onClick={p.onOpenSource}>
              <Layers className={`w-5 h-5 ${p.hasMultipleSources ? 'text-sky-300' : ''}`} />
            </IconButton>
            <IconButton label={p.isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={p.onToggleFullscreen}>
              {p.isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </IconButton>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
};
