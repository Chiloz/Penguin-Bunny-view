import React from 'react';
import { Layers, RefreshCw, Share2, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { haptic } from '../../player/device';

interface ActionBarProps {
  muted: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleMute: () => void;
  onResync: () => void;
  onOpenSource: () => void;
  onShare: () => void;
}

const Action: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={() => { haptic(8); onClick(); }}
    disabled={disabled}
    className="flex-1 min-w-0 h-[58px] rounded-2xl flex flex-col items-center justify-center gap-1 text-slate-200 bg-white/[0.04] border border-white/10 active:scale-95 active:bg-white/10 transition-all disabled:opacity-30 disabled:pointer-events-none"
  >
    {children}
    <span className="text-[10px] font-semibold leading-none">{label}</span>
  </button>
);

/** Thumb-reach row under the video on phones: everything that does not fit over the picture. */
export const ActionBar: React.FC<ActionBarProps> = (p) => (
  <div className="flex gap-1.5 px-3 pt-3" data-no-ptr>
    <Action label="Prev" onClick={p.onPrev} disabled={!p.canPrev}><SkipBack className="w-[18px] h-[18px] fill-current" /></Action>
    <Action label="Next" onClick={p.onNext} disabled={!p.canNext}><SkipForward className="w-[18px] h-[18px] fill-current" /></Action>
    <Action label={p.muted ? 'Unmute' : 'Mute'} onClick={p.onToggleMute}>
      {p.muted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
    </Action>
    <Action label="Sync" onClick={p.onResync}><RefreshCw className="w-[18px] h-[18px] text-sky-300" /></Action>
    <Action label="Source" onClick={p.onOpenSource}><Layers className="w-[18px] h-[18px]" /></Action>
    <Action label="Invite" onClick={p.onShare}><Share2 className="w-[18px] h-[18px]" /></Action>
  </div>
);
