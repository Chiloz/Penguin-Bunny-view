import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, ExternalLink, HardDrive, Loader2, Play, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import { db } from '../firebase';
import { MediaItem, UserProfile } from '../types';
import { ShareInviteModal } from './ShareInviteModal';
import { BottomSheet } from './player/BottomSheet';
import { PlayerControls } from './player/PlayerControls';
import { ActionBar } from './player/ActionBar';
import { RoomPanel, EpisodeItem } from './player/RoomPanel';
import { SourceSetup, VIDEO_ACCEPT } from './player/SourceSetup';
import { formatSeconds, naturalCompare } from './player/format';
import { useMediaEngine } from '../player/useMediaEngine';
import { useRoomSync } from '../player/useRoomSync';
import { driveEmbedUrl, getGoogleDriveId } from '../player/sources';
import {
  WakeLockManager,
  bindMediaSession,
  canRequestElementFullscreen,
  containerLikelyUnsupported,
  exitElementFullscreen,
  getFullscreenElement,
  haptic,
  isIPhone,
  isMobile,
  lockLandscape,
  requestElementFullscreen,
  supportsVolumeControl,
  unlockOrientation,
  updateMediaSessionPosition,
} from '../player/device';
import { getLocalVideo, storeLocalVideo } from '../utils/localVideoStorage';

// Kept for any older import sites.
export { formatSeconds } from './player/format';
export { resolvePlayableStreamUrl, getGoogleDriveId } from '../player/sources';

interface VideoPlayerProps {
  roomId: string;
  currentUser: UserProfile;
  onLeave: () => void;
}

interface FloatingEmoji {
  id: string;
  text: string;
  name: string;
  left: number;
}

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.ts', '.3gp'];
const CONTROLS_HIDE_MS = 3200;
const MAX_CACHED_FILE_BYTES = 600 * 1024 * 1024; // phones evict/crash on multi-GB IndexedDB writes

const cleanName = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ').trim();
const isVideoFile = (f: File) => f.type.startsWith('video/') || VIDEO_EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e));
const formatBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ roomId, currentUser, onLeave }) => {
  const { engine, state, videoRef } = useMediaEngine();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const addFilesInput = useRef<HTMLInputElement | null>(null);

  // Source state -------------------------------------------------------------
  const [mode, setMode] = useState<'none' | 'cloud' | 'local'>('none');
  const [playlist, setPlaylist] = useState<File[]>([]);
  const [episodeIdx, setEpisodeIdx] = useState(0);
  const playlistRef = useRef<File[]>([]);
  const episodeIdxRef = useRef(0);
  const loadedCloudUrl = useRef<string | null>(null);
  const autoStartedRef = useRef(false);
  const [localNotice, setLocalNotice] = useState('');

  // UI state -----------------------------------------------------------------
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [landscapePhone, setLandscapePhone] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [shareOpen, setShareOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [seekFlash, setSeekFlash] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [seriesEpisodes, setSeriesEpisodes] = useState<Array<{ title: string; streamUrl: string; number: number }>>([]);
  const [seriesTitle, setSeriesTitle] = useState('');

  const fullscreenLike = nativeFullscreen || pseudoFullscreen || landscapePhone;

  // Room sync ----------------------------------------------------------------
  const showFloating = useCallback((text: string, name: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    setFloating((prev) => [...prev.slice(-12), { id, text, name, left: 8 + Math.floor(Math.random() * 78) }]);
    setTimeout(() => setFloating((prev) => prev.filter((e) => e.id !== id)), 2400);
  }, []);

  const { room, loading, roomError, members, syncWarning, sendReaction, announceEpisode, resync } = useRoomSync({
    roomId,
    currentUser,
    engine,
    onReaction: showFloating,
  });

  const isHost = room?.hostId === currentUser.uid;
  const isLocalRoom = !!room?.streamUrl?.startsWith('local://');
  const hasCloud = !!room?.streamUrl && !isLocalRoom;

  // -------------------------------------------------------------------------
  // Loading sources
  // -------------------------------------------------------------------------
  const startCloud = useCallback((url: string, autoplay: boolean) => {
    loadedCloudUrl.current = url;
    setMode('cloud');
    void engine.load(url, { autoplay });
  }, [engine]);

  const loadLocalEpisode = useCallback((files: File[], index: number, opts: { announce: boolean; autoplay: boolean }) => {
    const file = files[index];
    if (!file) return;
    episodeIdxRef.current = index;
    setEpisodeIdx(index);
    setMode('local');
    setLocalNotice(containerLikelyUnsupported(file.name) || '');
    engine.loadFile(file, { autoplay: opts.autoplay });
    if (opts.announce) {
      void announceEpisode({ videoName: file.name, index, total: files.length, playing: opts.autoplay });
    }
  }, [engine, announceEpisode]);

  const startLocal = useCallback((rawFiles: File[], announce: boolean) => {
    const files = rawFiles.filter(isVideoFile).sort((a, b) => naturalCompare(a.name, b.name));
    if (files.length === 0) {
      setLocalNotice('That does not look like a video file. Try an MP4.');
      return;
    }
    playlistRef.current = files;
    setPlaylist(files);
    loadLocalEpisode(files, 0, { announce, autoplay: true });

    // Cache the first file so a reload is instant. Skip huge files: phones evict or crash on them.
    const first = files[0];
    if (first.size <= MAX_CACHED_FILE_BYTES) {
      setTimeout(() => { storeLocalVideo(first.name, first).catch(() => {}); }, 1500);
    }
  }, [loadLocalEpisode]);

  const addFiles = useCallback((raw: File[]) => {
    const files = raw.filter(isVideoFile);
    if (!files.length) return;
    const merged = [...playlistRef.current, ...files].sort((a, b) => naturalCompare(a.name, b.name));
    playlistRef.current = merged;
    setPlaylist(merged);
    if (mode !== 'local') loadLocalEpisode(merged, 0, { announce: isHost, autoplay: true });
  }, [mode, isHost, loadLocalEpisode]);

  // Host who just created a cloud room is already mid-tap: start straight away. Everyone else chooses.
  useEffect(() => {
    if (!room || autoStartedRef.current || mode !== 'none') return;
    if (hasCloud && isHost) {
      autoStartedRef.current = true;
      startCloud(room.streamUrl!, false);
    } else if (isLocalRoom) {
      autoStartedRef.current = true;
      const name = room.streamUrl!.replace('local://', '');
      getLocalVideo(name)
        .then((blob) => {
          if (blob) startLocal([new File([blob], name, { type: blob.type || 'video/mp4' })], false);
        })
        .catch(() => {});
    }
  }, [room, hasCloud, isHost, isLocalRoom, mode, startCloud, startLocal]);

  // The room moved to a different cloud stream (next episode, host changed the movie).
  useEffect(() => {
    if (mode !== 'cloud' || !room?.streamUrl || isLocalRoom) return;
    if (room.streamUrl !== loadedCloudUrl.current) {
      startCloud(room.streamUrl, !!room.isPlaying);
    }
  }, [room?.streamUrl, mode, isLocalRoom, startCloud, room?.isPlaying]);

  // Someone else moved to another local episode.
  useEffect(() => {
    if (mode !== 'local' || room?.currentEpisodeIndex === undefined) return;
    const idx = room.currentEpisodeIndex;
    if (room.senderId === currentUser.uid || idx === episodeIdxRef.current) return;
    if (playlistRef.current[idx]) {
      loadLocalEpisode(playlistRef.current, idx, { announce: false, autoplay: !!room.isPlaying });
    } else {
      setLocalNotice(`The room moved to episode ${idx + 1}. Add that file from the Episodes tab.`);
    }
  }, [room?.currentEpisodeIndex, room?.senderId, mode, currentUser.uid, loadLocalEpisode, room?.isPlaying]);

  // Cloud series: fetch the episode list so Next / Previous work without local files.
  useEffect(() => {
    if (!room?.mediaId) { setSeriesEpisodes([]); return; }
    let cancelled = false;
    getDoc(doc(db, 'media_items', room.mediaId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const item = snap.data() as MediaItem;
        const season = item.seasons?.find((s) => s.seasonNumber === room.seasonNumber) || item.seasons?.[0];
        setSeriesTitle(item.title);
        setSeriesEpisodes(
          (season?.episodes || [])
            .slice()
            .sort((a, b) => a.episodeNumber - b.episodeNumber)
            .map((e) => ({ title: e.title, streamUrl: e.streamUrl, number: e.episodeNumber }))
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [room?.mediaId, room?.seasonNumber]);

  // Friends (for the invite dialog)
  useEffect(() => {
    const ids = currentUser.friends || [];
    if (!ids.length) { setFriends([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('uid', 'in', ids.slice(0, 30))),
      (snap) => setFriends(snap.docs.map((d) => d.data() as UserProfile)),
      () => {}
    );
    return () => unsub();
  }, [currentUser.friends]);

  // -------------------------------------------------------------------------
  // Episodes (local playlist wins, otherwise the cloud series)
  // -------------------------------------------------------------------------
  const cloudIndex = useMemo(() => {
    if (!seriesEpisodes.length) return -1;
    const byUrl = seriesEpisodes.findIndex((e) => e.streamUrl === room?.streamUrl);
    if (byUrl >= 0) return byUrl;
    return Math.min(room?.currentEpisodeIndex ?? 0, seriesEpisodes.length - 1);
  }, [seriesEpisodes, room?.streamUrl, room?.currentEpisodeIndex]);

  const usingPlaylist = mode === 'local' && playlist.length > 0;
  const episodeItems: EpisodeItem[] = usingPlaylist
    ? playlist.map((f, i) => ({ index: i, title: cleanName(f.name), subtitle: formatBytes(f.size) }))
    : mode === 'cloud'
      ? seriesEpisodes.map((e, i) => ({ index: i, title: e.title, subtitle: `Episode ${e.number}` }))
      : [];
  const activeEpisode = usingPlaylist ? episodeIdx : Math.max(cloudIndex, 0);
  const canPrev = activeEpisode > 0 && episodeItems.length > 1;
  const canNext = activeEpisode < episodeItems.length - 1;

  const selectEpisode = useCallback((index: number) => {
    haptic(10);
    if (usingPlaylist) {
      loadLocalEpisode(playlistRef.current, index, { announce: true, autoplay: true });
    } else if (mode === 'cloud' && seriesEpisodes[index]) {
      const ep = seriesEpisodes[index];
      void announceEpisode({
        videoName: `${seriesTitle} - S${room?.seasonNumber || 1}E${ep.number}: ${ep.title}`,
        index,
        total: seriesEpisodes.length,
        playing: true,
        streamUrl: ep.streamUrl,
      });
    }
  }, [usingPlaylist, mode, seriesEpisodes, seriesTitle, room?.seasonNumber, loadLocalEpisode, announceEpisode]);

  const selectEpisodeRef = useRef(selectEpisode);
  selectEpisodeRef.current = selectEpisode;
  const flow = useRef({ activeEpisode, canNext, canPrev });
  flow.current = { activeEpisode, canNext, canPrev };

  const goNext = useCallback(() => { if (flow.current.canNext) selectEpisodeRef.current(flow.current.activeEpisode + 1); }, []);
  const goPrev = useCallback(() => { if (flow.current.canPrev) selectEpisodeRef.current(flow.current.activeEpisode - 1); }, []);

  // Auto-advance when an episode ends.
  useEffect(() => engine.onEnded(() => { if (flow.current.canNext) goNext(); }), [engine, goNext]);

  // -------------------------------------------------------------------------
  // Controls visibility
  // -------------------------------------------------------------------------
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetOpen = shareOpen || sourceOpen || peopleOpen;

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    const keepOpen = !state.playing || scrubbing || sheetOpen || state.status !== 'ready' || state.needsGesture;
    if (keepOpen) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else {
      showControls();
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [state.playing, scrubbing, sheetOpen, state.status, state.needsGesture, showControls]);

  // -------------------------------------------------------------------------
  // Stage taps: tap = toggle controls, double-tap sides = +/-10s, double-tap centre = play/pause
  // -------------------------------------------------------------------------
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashKey = useRef(0);

  const onStageClick = (e: React.MouseEvent) => {
    const stage = stageRef.current;
    if (!stage || state.status === 'error' || state.activeKind === 'embed') return;
    const pointerType = (e.nativeEvent as PointerEvent).pointerType;
    const mouse = pointerType ? pointerType === 'mouse' : !isMobile;

    if (mouse) {
      engine.toggle();
      showControls();
      return;
    }

    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.34) { engine.skip(-10); setSeekFlash({ side: 'left', key: ++flashKey.current }); }
      else if (x > 0.66) { engine.skip(10); setSeekFlash({ side: 'right', key: ++flashKey.current }); }
      else engine.toggle();
      haptic(10);
      setControlsVisible(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      setControlsVisible((v) => {
        if (!v) { showControls(); return true; }
        if (hideTimer.current) clearTimeout(hideTimer.current);
        return false;
      });
    }, 260);
  };

  useEffect(() => {
    if (!seekFlash) return;
    const t = setTimeout(() => setSeekFlash(null), 650);
    return () => clearTimeout(t);
  }, [seekFlash]);

  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);

  // -------------------------------------------------------------------------
  // Fullscreen (native where it exists, CSS "theatre" on iPhone)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const sync = () => {
      const on = !!getFullscreenElement();
      setNativeFullscreen(on);
      if (!on) unlockOrientation();
    };
    const evts = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    evts.forEach((n) => document.addEventListener(n, sync));
    return () => evts.forEach((n) => document.removeEventListener(n, sync));
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
    const update = () => setLandscapePhone(mq.matches && isMobile);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (getFullscreenElement()) { await exitElementFullscreen(); return; }
    if (pseudoFullscreen) { setPseudoFullscreen(false); return; }
    const el = stageRef.current;
    if (!isIPhone && el && canRequestElementFullscreen(el) && (await requestElementFullscreen(el))) {
      if (isMobile) void lockLandscape();
      return;
    }
    setPseudoFullscreen(true);
  }, [pseudoFullscreen]);

  useEffect(() => () => {
    if (getFullscreenElement()) void exitElementFullscreen();
    unlockOrientation();
  }, []);

  // -------------------------------------------------------------------------
  // Phone integrations: wake lock + lock-screen controls
  // -------------------------------------------------------------------------
  const wakeLock = useRef<WakeLockManager | null>(null);
  useEffect(() => {
    wakeLock.current = new WakeLockManager();
    return () => { wakeLock.current?.destroy(); wakeLock.current = null; };
  }, []);
  useEffect(() => {
    if (state.playing) void wakeLock.current?.request();
    else void wakeLock.current?.release();
  }, [state.playing]);

  const title = room?.currentEpisodeName || room?.videoName || 'Penguin View';
  useEffect(() => {
    if (state.status !== 'ready') return;
    const unbind = bindMediaSession(title, room?.hostName ? `Hosted by ${room.hostName}` : 'Penguin View', {
      play: () => void engine.play('user'),
      pause: () => engine.pause('user'),
      seekTo: (t) => engine.seek(t, 'user'),
      seekBy: (d) => engine.skip(d),
      next: canNext ? goNext : undefined,
      previous: canPrev ? goPrev : undefined,
    });
    let last = 0;
    const off = engine.subscribeTime(() => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      const t = engine.getTime();
      updateMediaSessionPosition(t.currentTime, t.duration, 1);
    });
    return () => { unbind(); off(); };
  }, [engine, state.status, state.sourceId, title, room?.hostName, canNext, canPrev, goNext, goPrev]);

  // -------------------------------------------------------------------------
  // Keyboard (desktop / tablets with keyboards)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if ((e.key === ' ' || e.key === 'Enter') && (tag === 'BUTTON' || el?.getAttribute('role') === 'slider')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); engine.toggle(); break;
        case 'ArrowLeft': e.preventDefault(); engine.skip(-5); break;
        case 'ArrowRight': e.preventDefault(); engine.skip(5); break;
        case 'j': case 'J': engine.skip(-10); break;
        case 'l': case 'L': engine.skip(10); break;
        case 'ArrowUp': e.preventDefault(); engine.setVolume(engine.getState().volume + 0.05); break;
        case 'ArrowDown': e.preventDefault(); engine.setVolume(engine.getState().volume - 0.05); break;
        case 'm': case 'M': engine.setMuted(!engine.getState().muted); break;
        case 'f': case 'F': void toggleFullscreen(); break;
        case 'n': case 'N': goNext(); break;
        case 'p': case 'P': goPrev(); break;
        default: return;
      }
      showControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, toggleFullscreen, goNext, goPrev, showControls]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (roomError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <WifiOff className="w-10 h-10 mx-auto text-rose-300" />
          <p className="text-white font-semibold">{roomError}</p>
          <button onClick={onLeave} className="h-12 px-6 rounded-2xl bg-white/10 border border-white/15 text-white font-bold active:scale-95 transition-all">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'none') {
    return (
      <SourceSetup
        room={room}
        loading={loading}
        expectedLocalName={isLocalRoom ? room!.streamUrl!.replace('local://', '') : undefined}
        onPickFiles={(files) => startLocal(files, isHost)}
        onStreamCloud={() => room?.streamUrl && startCloud(room.streamUrl, !!room.isPlaying)}
        onLeave={onLeave}
      />
    );
  }

  const driveId = room?.streamUrl ? getGoogleDriveId(room.streamUrl) : null;
  const embedActive = state.activeKind === 'embed';
  const showSpinner = !embedActive && state.status !== 'error' && (state.status === 'loading' || state.buffering);
  const errorShown = state.status === 'error' && state.error;
  const resumeLabel = formatSeconds(engine.getCurrentTime());

  const stageClass = fullscreenLike
    ? 'fixed inset-0 z-[60] bg-black'
    : 'relative w-full aspect-video lg:aspect-auto lg:h-full bg-black';

  return (
    <div className="fixed inset-0 z-30 bg-[#05070e] flex flex-col lg:flex-row" style={{ height: '100dvh' }}>
      <div className={`${fullscreenLike ? '' : 'bg-black pt-[env(safe-area-inset-top)] lg:pt-0 lg:flex-1 lg:min-w-0 shrink-0'}`}>
        <div
          ref={stageRef}
          className={`${stageClass} overflow-hidden select-none`}
          style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
          onClick={onStageClick}
          data-no-ptr
        >
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-contain bg-black ${embedActive ? 'invisible' : ''}`}
            playsInline
            preload="auto"
          />

          {embedActive && driveId && (
            <iframe
              src={driveEmbedUrl(driveId)}
              title="Google Drive player"
              className="absolute inset-0 w-full h-full border-0 z-10"
              allow="autoplay; fullscreen; encrypted-media"
              allowFullScreen
            />
          )}

          {/* Floating reactions */}
          <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
            {floating.map((f) => (
              <div key={f.id} className="absolute bottom-24 flex flex-col items-center animate-reaction" style={{ left: `${f.left}%` }}>
                <span className={f.text.length > 4 ? 'px-3 py-1.5 rounded-2xl bg-black/60 border border-white/15 text-white text-sm font-semibold max-w-[60vw] text-center' : 'text-5xl drop-shadow-lg'}>
                  {f.text}
                </span>
                <span className="text-[10px] text-white/80 mt-1 font-semibold drop-shadow">{f.name}</span>
              </div>
            ))}
          </div>

          {/* Double-tap feedback */}
          {seekFlash && (
            <div
              key={seekFlash.key}
              className={`absolute top-0 bottom-0 w-1/3 z-30 pointer-events-none flex items-center justify-center bg-white/10 animate-in fade-in duration-150 ${seekFlash.side === 'left' ? 'left-0 rounded-r-[100px]' : 'right-0 rounded-l-[100px]'}`}
            >
              <div className="text-white text-center">
                <div className="text-2xl">{seekFlash.side === 'left' ? '⏪' : '⏩'}</div>
                <div className="text-xs font-bold">10 seconds</div>
              </div>
            </div>
          )}

          {/* Embedded-player top bar (sync is off) */}
          {embedActive && (
            <div className="absolute top-0 inset-x-0 z-30 flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),8px)] pb-6 bg-gradient-to-b from-black/80 to-transparent" onClick={(e) => e.stopPropagation()}>
              <button onClick={onLeave} className="h-10 px-3 rounded-full bg-white/10 text-white text-xs font-bold active:scale-95">Leave</button>
              <span className="flex-1 text-[11px] text-amber-200 truncate">Drive player: playback is not synced</span>
              <button onClick={() => engine.selectSource(0)} className="h-10 px-3 rounded-full bg-sky-500/80 text-white text-xs font-bold active:scale-95">Back to synced</button>
            </div>
          )}

          {/* Buffering */}
          {showSpinner && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Loader2 className="w-10 h-10 text-white/90 animate-spin" />
              {state.reconnecting && <p className="text-xs text-white/80 font-semibold bg-black/50 px-3 py-1 rounded-full">Reconnecting…</p>}
            </div>
          )}

          {/* Tap to start (phones block autoplay until a real tap) */}
          {state.needsGesture && !errorShown && !embedActive && (
            <button
              onClick={(e) => { e.stopPropagation(); haptic(14); void engine.play('remote').then(resync); }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[2px] animate-in fade-in duration-150"
            >
              <span className="w-20 h-20 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-2xl shadow-sky-500/40 active:scale-90 transition-transform">
                <Play className="w-9 h-9 text-white fill-current ml-1" />
              </span>
              <span className="text-white font-bold text-sm">Tap to join the movie</span>
            </button>
          )}

          {/* Errors with real recovery options */}
          {errorShown && (
            <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="w-full max-w-sm space-y-3 text-center">
                <AlertTriangle className="w-9 h-9 mx-auto text-amber-400" />
                <p className="text-white font-bold text-base leading-snug">{state.error!.message}</p>
                {state.error!.hint && <p className="text-slate-300 text-xs leading-relaxed">{state.error!.hint}</p>}
                <div className="grid gap-2 pt-1">
                  <button onClick={() => engine.retry()} className="h-12 rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95">
                    <RefreshCw className="w-4 h-4" /> Retry from {resumeLabel}
                  </button>
                  {state.candidates.length > 1 && (
                    <button onClick={() => engine.tryNextSource()} className="h-12 rounded-2xl bg-white/10 border border-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95">
                      <RotateCcw className="w-4 h-4" /> Try another source
                    </button>
                  )}
                  <button onClick={() => addFilesInput.current?.click()} className="h-12 rounded-2xl bg-white/10 border border-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95">
                    <HardDrive className="w-4 h-4" /> Play a file from this device
                  </button>
                  {driveId && (
                    <a href={`https://drive.google.com/file/d/${driveId}/view`} target="_blank" rel="noreferrer" className="h-11 rounded-2xl text-sky-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> Open in Google Drive
                    </a>
                  )}
                  <button onClick={onLeave} className="h-10 text-slate-400 text-xs font-semibold">Leave room</button>
                </div>
              </div>
            </div>
          )}

          {/* Toasts */}
          <div className="absolute top-[max(env(safe-area-inset-top),56px)] inset-x-3 z-50 flex flex-col items-center gap-2 pointer-events-none">
            {state.notice && <div className="px-3.5 py-2 rounded-2xl bg-black/75 border border-white/15 text-white text-xs font-medium text-center backdrop-blur-md animate-in fade-in slide-in-from-top-2 max-w-md">{state.notice}</div>}
            {syncWarning && <div className="px-3.5 py-2 rounded-2xl bg-amber-950/85 border border-amber-500/40 text-amber-100 text-xs text-center backdrop-blur-md max-w-md">{syncWarning}</div>}
            {localNotice && (
              <div className="pointer-events-auto px-3.5 py-2 rounded-2xl bg-amber-950/85 border border-amber-500/40 text-amber-100 text-xs text-center backdrop-blur-md max-w-md flex items-start gap-2" onClick={(e) => { e.stopPropagation(); setLocalNotice(''); }}>
                <span>{localNotice}</span><span className="opacity-60">✕</span>
              </div>
            )}
            {!state.hasVideoTrack && !embedActive && (
              <div className="px-3.5 py-2 rounded-2xl bg-rose-950/85 border border-rose-500/40 text-rose-100 text-xs text-center backdrop-blur-md max-w-md">
                Sound only: this phone could not decode the picture. Try another source.
              </div>
            )}
          </div>

          {!embedActive && !errorShown && (
            <PlayerControls
              engine={engine}
              state={state}
              visible={controlsVisible && !state.needsGesture}
              title={title}
              subtitle={episodeItems.length > 1 ? `Episode ${activeEpisode + 1} of ${episodeItems.length}` : room?.hostName ? `Hosted by ${room.hostName}` : undefined}
              memberCount={members.length || 1}
              isFullscreen={fullscreenLike}
              compact={narrow && !fullscreenLike}
              showVolume={supportsVolumeControl()}
              canPrev={canPrev}
              canNext={canNext}
              hasMultipleSources={state.candidates.length > 1 || mode === 'local' || hasCloud}
              onBack={onLeave}
              onShare={() => setShareOpen(true)}
              onToggleFullscreen={toggleFullscreen}
              onPrev={goPrev}
              onNext={goNext}
              onResync={() => { resync(); showControls(); }}
              onOpenSource={() => setSourceOpen(true)}
              onReact={(e) => { void sendReaction(e); showControls(); }}
              onOpenMembers={() => setPeopleOpen(true)}
              onInteract={showControls}
              onScrubChange={setScrubbing}
            />
          )}
        </div>
      </div>

      {/* Side / lower panel (hidden in fullscreen & landscape phones) */}
      {!fullscreenLike && (
        <aside className="flex-1 min-h-0 lg:flex-none lg:w-[380px] border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0a0f1c]/90 flex flex-col pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 pt-3 pb-1">
            <h1 className="text-base font-extrabold text-white font-display leading-snug line-clamp-2">{title}</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {members.length || 1} watching · {mode === 'local' ? 'playing from this device' : 'streaming'}
              {isMobile && mode === 'local' ? ' · 0 MB data' : ''}
            </p>
          </div>
          {narrow && (
            <ActionBar
              muted={state.muted || state.volume === 0}
              canPrev={canPrev}
              canNext={canNext}
              onPrev={goPrev}
              onNext={goNext}
              onToggleMute={() => engine.setMuted(!state.muted)}
              onResync={() => { resync(); showControls(); }}
              onOpenSource={() => setSourceOpen(true)}
              onShare={() => setShareOpen(true)}
            />
          )}
          <RoomPanel
            roomId={roomId}
            room={room}
            members={members}
            currentUserId={currentUser.uid}
            episodes={episodeItems}
            activeEpisode={activeEpisode}
            onSelectEpisode={selectEpisode}
            onAddFiles={() => addFilesInput.current?.click()}
            onReact={(t) => { void sendReaction(t); }}
            onShare={() => setShareOpen(true)}
          />
        </aside>
      )}

      {/* Source sheet */}
      <BottomSheet open={sourceOpen} onClose={() => setSourceOpen(false)} title="Video source">
        {state.candidates.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase font-mono tracking-wider text-slate-500">Cloud streams</p>
            {state.candidates.map((c, i) => (
              <button
                key={c.url}
                onClick={() => { engine.selectSource(i); setSourceOpen(false); }}
                className={`w-full text-left px-4 h-12 rounded-2xl border flex items-center justify-between active:scale-[0.99] transition-all ${
                  i === state.candidateIndex && mode === 'cloud' ? 'bg-sky-500/15 border-sky-400/40 text-white' : 'bg-white/[0.04] border-white/10 text-slate-200'
                }`}
              >
                <span className="text-sm font-semibold">{c.label}</span>
                {i === state.candidateIndex && mode === 'cloud' && <span className="text-[10px] font-mono uppercase text-sky-300">Playing</span>}
              </button>
            ))}
          </div>
        )}
        {hasCloud && mode === 'local' && (
          <button onClick={() => { setSourceOpen(false); startCloud(room!.streamUrl!, !engine.isPaused()); }} className="w-full h-12 rounded-2xl bg-white/8 border border-white/15 text-white text-sm font-semibold active:scale-95">
            Switch back to cloud stream
          </button>
        )}
        <button onClick={() => { setSourceOpen(false); addFilesInput.current?.click(); }} className="w-full h-12 rounded-2xl bg-white/8 border border-white/15 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95">
          <HardDrive className="w-4 h-4 text-sky-300" /> Play a file from this device (0 MB data)
        </button>
        <p className="text-[11px] text-slate-500 leading-relaxed">If a source stutters or shows no picture, try another one. Playback resumes where you were.</p>
      </BottomSheet>

      {/* People sheet (opened from the player's member badge) */}
      <BottomSheet open={peopleOpen} onClose={() => setPeopleOpen(false)} title={`Watching now (${members.length || 1})`}>
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/5">
              <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg overflow-hidden">
                {m.profilePic && m.profilePic.startsWith('data:image/') ? <img src={m.profilePic} alt="" className="w-full h-full object-cover" /> : m.profilePic || '🐧'}
              </span>
              <span className="text-sm font-semibold text-white flex-1 truncate">{m.name}{m.uid === currentUser.uid ? ' (you)' : ''}</span>
              {room?.hostId === m.uid && <span className="text-[10px] font-mono uppercase text-amber-300">Host</span>}
            </li>
          ))}
        </ul>
        <button onClick={() => { setPeopleOpen(false); setShareOpen(true); }} className="w-full h-12 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-bold active:scale-95">Invite friends</button>
      </BottomSheet>

      <ShareInviteModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={roomId}
        videoTitle={title}
        currentUser={currentUser}
        friendsProfiles={friends}
      />

      {/* One hidden picker for "add / replace with a file from this device" */}
      <input
        ref={addFilesInput}
        type="file"
        multiple
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (!files.length) return;
          if (mode === 'local') addFiles(files);
          else startLocal(files, false);
        }}
      />
    </div>
  );
};
