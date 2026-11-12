import React, { useRef, useState } from 'react';
import { ChevronLeft, Cloud, Film, FolderOpen, HardDrive, Play, Smartphone } from 'lucide-react';
import { Room } from '../../types';
import { isMobile } from '../../player/device';

export const VIDEO_ACCEPT = 'video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp,.ts';

interface SourceSetupProps {
  room: Room | null;
  loading: boolean;
  onPickFiles: (files: File[]) => void;
  onStreamCloud: () => void;
  onLeave: () => void;
  /** When the room expects a specific local file, we say which one. */
  expectedLocalName?: string;
}

/**
 * Shown before anything plays. One tap on a big button starts playback, which also gives the browser
 * the user gesture that phones demand before they allow video (+ sound) to start.
 */
export const SourceSetup: React.FC<SourceSetupProps> = ({ room, loading, onPickFiles, onStreamCloud, onLeave, expectedLocalName }) => {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const hasCloud = !!room?.streamUrl && !room.streamUrl.startsWith('local://');
  const title = room?.currentEpisodeName || room?.videoName || 'Watch together';

  const onFiles = (list: FileList | null) => {
    if (list && list.length) onPickFiles(Array.from(list));
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col px-4 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),20px)]"
      onDragOver={isMobile ? undefined : (e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={isMobile ? undefined : () => setDragging(false)}
      onDrop={isMobile ? undefined : (e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
    >
      <div className="flex items-center h-12 -mx-1">
        <button
          onClick={onLeave}
          aria-label="Back"
          className="w-11 h-11 rounded-full flex items-center justify-center text-slate-200 hover:bg-white/10 active:scale-90 transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-md w-full mx-auto gap-5 py-4">
        <div className="w-20 h-20 rounded-[28%] bg-gradient-to-tr from-sky-400 to-indigo-500 p-[2px] shadow-2xl shadow-sky-500/20">
          <div className="w-full h-full rounded-[26%] bg-[#0e1424]/95 flex items-center justify-center text-4xl">
            {loading ? <span className="animate-pulse">🐧</span> : <Film className="w-9 h-9 text-sky-300" />}
          </div>
        </div>

        <div className="text-center space-y-1.5">
          <h1 className="text-xl font-extrabold text-white font-display leading-tight line-clamp-2">{loading ? 'Joining room…' : title}</h1>
          <p className="text-sm text-slate-400">
            {expectedLocalName
              ? 'This room plays a movie stored on each person\'s device.'
              : hasCloud
                ? 'Ready to stream. Everyone stays in sync.'
                : 'Pick the movie on your device. Everyone loads their own copy and Penguin View keeps you in sync.'}
          </p>
        </div>

        {expectedLocalName && (
          <div className="w-full p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 text-left">
            <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-1">Select this file</p>
            <p className="text-sm text-white font-semibold break-all">{expectedLocalName}</p>
          </div>
        )}

        <div className="w-full space-y-3">
          {hasCloud && (
            <button
              onClick={onStreamCloud}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-xl shadow-sky-500/25 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Play className="w-5 h-5 fill-current" />
              Stream now
              <Cloud className="w-4 h-4 opacity-70" />
            </button>
          )}

          <button
            onClick={() => fileInput.current?.click()}
            disabled={loading}
            className={`w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all disabled:opacity-50 ${
              hasCloud
                ? 'bg-white/8 hover:bg-white/12 border border-white/15 text-white'
                : 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white shadow-xl shadow-sky-500/25'
            }`}
          >
            {isMobile ? <Smartphone className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
            {isMobile ? 'Choose video from this phone' : 'Choose video file(s)'}
          </button>

          {hasCloud && (
            <p className="text-center text-[11px] text-slate-500">Playing your own copy uses 0 MB of mobile data.</p>
          )}

          {/* Folder selection only exists on desktop browsers; phones can't open folders. */}
          {!isMobile && (
            <button
              onClick={() => folderInput.current?.click()}
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <FolderOpen className="w-4 h-4 text-sky-300" />
              Choose a whole folder (series)
            </button>
          )}
        </div>

        {dragging && (
          <div className="fixed inset-0 z-50 bg-sky-500/10 border-4 border-dashed border-sky-400/60 flex items-center justify-center pointer-events-none">
            <p className="text-xl font-bold text-white">Drop to play</p>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          multiple
          accept={VIDEO_ACCEPT}
          className="hidden"
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
        {!isMobile && (
          <input
            ref={folderInput}
            type="file"
            // @ts-ignore - non-standard but supported by every desktop browser
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
          />
        )}
      </div>
    </div>
  );
};
