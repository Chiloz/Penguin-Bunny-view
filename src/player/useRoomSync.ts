import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Reaction, Room, RoomParticipant, UserProfile } from '../types';
import { MediaEngine, UserIntent } from './mediaEngine';
import { timestampToMs } from '../components/player/format';

const PRESENCE_INTERVAL_MS = 10_000;
const PRESENCE_TTL_MS = 35_000;
const WRITE_MIN_GAP_MS = 220;
const PLAYING_DRIFT_S = 1.25;
const PAUSED_DRIFT_S = 0.45;
const MAX_LATENCY_COMP_S = 12;

export interface UseRoomSyncArgs {
  roomId: string;
  currentUser: UserProfile;
  engine: MediaEngine;
  onReaction?: (emoji: string, senderName: string) => void;
}

export function useRoomSync({ roomId, currentUser, engine, onReaction }: UseRoomSyncArgs) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [members, setMembers] = useState<RoomParticipant[]>([]);
  const [syncWarning, setSyncWarning] = useState('');

  const roomRef = useRef<Room | null>(null);
  const skewSamples = useRef<number[]>([]);
  const onReactionRef = useRef(onReaction);
  onReactionRef.current = onReaction;
  const meRef = useRef(currentUser);
  meRef.current = currentUser;

  // -------------------------------------------------------------------------
  // Clock skew: phones are often seconds off. We learn (serverTime - localTime) from our own presence
  // writes (serverTimestamp is resolved by Firestore), so latency compensation uses the server clock.
  // -------------------------------------------------------------------------
  const getSkewMs = () => {
    const s = skewSamples.current;
    return s.length ? Math.max(...s) : 0; // each sample under-estimates by network delay; max is closest
  };

  const targetTimeFor = useCallback((r: Room): number => {
    let t = r.currentTime || 0;
    if (r.isPlaying && r.lastUpdatedAt) {
      const updatedMs = timestampToMs(r.lastUpdatedAt);
      if (updatedMs > 0) {
        const latency = (Date.now() + getSkewMs() - updatedMs) / 1000;
        if (latency > 0 && latency < MAX_LATENCY_COMP_S) t += latency;
      }
    }
    return Math.max(0, t);
  }, []);

  // -------------------------------------------------------------------------
  // Apply the room's state to the local engine
  // -------------------------------------------------------------------------
  const applyRoomState = useCallback((r: Room, force: boolean) => {
    const state = engine.getState();
    if (state.activeKind === 'embed') return; // third-party iframe, cannot be driven
    if (!engine.isReady()) return; // onReady re-applies the latest room

    const target = targetTimeFor(r);
    const drift = Math.abs(engine.getCurrentTime() - target);
    const threshold = r.isPlaying ? PLAYING_DRIFT_S : PAUSED_DRIFT_S;
    if (force || drift > threshold) {
      engine.seek(target, 'remote');
    }

    const paused = engine.isPaused();
    if (r.isPlaying && paused) void engine.play('remote');
    else if (!r.isPlaying && !paused) engine.pause('remote');
  }, [engine, targetTimeFor]);

  // Re-apply when media becomes ready (initial join, episode change, source fallback, retry).
  useEffect(() => {
    return engine.onReady(() => {
      const r = roomRef.current;
      if (r) applyRoomState(r, true);
    });
  }, [engine, applyRoomState]);

  // Coming back from background / lock screen: the OS may have paused us. Catch up with the room.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const r = roomRef.current;
      if (r) applyRoomState(r, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [applyRoomState]);

  // -------------------------------------------------------------------------
  // Room document subscription (ONE subscription per room, never re-created by playback state)
  // -------------------------------------------------------------------------
  useEffect(() => {
    setLoading(true);
    setRoomError('');
    const ref = doc(db, 'rooms', roomId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRoomError('This room does not exist or was closed by the host.');
          setLoading(false);
          return;
        }
        const data = snap.data() as Room;
        const prev = roomRef.current;
        roomRef.current = data;
        setRoom(data);
        setLoading(false);

        const mine = data.senderId === meRef.current.uid;
        const sourceChanged = !!prev && prev.streamUrl !== data.streamUrl;
        if (sourceChanged) return; // a new source is about to load; onReady applies the new state
        // Our own writes echo back; applying them would only fight the user's finger.
        if (mine) return;
        applyRoomState(data, false);
      },
      (err) => {
        console.error('Room listener error:', err);
        setRoomError('Lost connection to the room. Check your internet and try again.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [roomId, applyRoomState]);

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------
  useEffect(() => {
    const me = meRef.current;
    const myRef = doc(db, `rooms/${roomId}/participants`, me.uid);
    const write = () => {
      setDoc(
        myRef,
        {
          uid: me.uid,
          name: me.name,
          profilePic: me.profilePic || '🐧',
          themeColor: me.themeColor || 'sky',
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      ).catch((e) => console.warn('Presence update failed:', e?.code || e));
    };
    write();
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible') write();
    }, PRESENCE_INTERVAL_MS);

    const unsub = onSnapshot(
      collection(db, `rooms/${roomId}/participants`),
      (snap) => {
        const now = Date.now();
        const active: RoomParticipant[] = [];
        snap.forEach((d) => {
          const data = d.data() as RoomParticipant;
          const seen = timestampToMs(data.lastSeen);
          if (data.uid === me.uid && seen > 0 && !(d as any).metadata?.hasPendingWrites) {
            const s = skewSamples.current;
            s.push(seen - now);
            if (s.length > 6) s.shift();
          }
          if (seen === 0 || now - seen < PRESENCE_TTL_MS) active.push(data);
        });
        setMembers(active);
      },
      (err) => console.warn('Participants listener error:', err?.code || err)
    );

    return () => {
      clearInterval(beat);
      unsub();
    };
  }, [roomId, currentUser.uid]);

  // -------------------------------------------------------------------------
  // Writing local intents to the room (coalesced, never throws)
  // -------------------------------------------------------------------------
  const lastWriteAt = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<{ playing: boolean; time: number } | null>(null);

  const flushWrite = useCallback(() => {
    const p = pendingWrite.current;
    if (!p) return;
    pendingWrite.current = null;
    lastWriteAt.current = Date.now();
    updateDoc(doc(db, 'rooms', roomId), {
      isPlaying: p.playing,
      currentTime: p.time,
      lastUpdatedAt: serverTimestamp(),
      senderId: meRef.current.uid,
    })
      .then(() => setSyncWarning(''))
      .catch((e) => {
        console.warn('Room sync write failed:', e?.code || e);
        setSyncWarning('Sync is having trouble. Your playback is fine, but others may not see your controls.');
      });
  }, [roomId]);

  const queueWrite = useCallback((playing: boolean, time: number) => {
    pendingWrite.current = { playing, time };
    const wait = WRITE_MIN_GAP_MS - (Date.now() - lastWriteAt.current);
    if (wait <= 0) {
      if (trailing.current) { clearTimeout(trailing.current); trailing.current = null; }
      flushWrite();
    } else if (!trailing.current) {
      trailing.current = setTimeout(() => { trailing.current = null; flushWrite(); }, wait);
    }
  }, [flushWrite]);

  useEffect(() => {
    return engine.onIntent((i: UserIntent) => {
      if (i.type === 'play') queueWrite(true, i.time);
      else if (i.type === 'pause') queueWrite(false, i.time);
      else queueWrite(!engine.isPaused(), i.time);
    });
  }, [engine, queueWrite]);

  useEffect(() => () => {
    if (trailing.current) clearTimeout(trailing.current);
  }, []);

  // -------------------------------------------------------------------------
  // Source / episode changes
  // -------------------------------------------------------------------------
  const announceEpisode = useCallback(async (p: { videoName: string; index: number; total: number; playing: boolean; streamUrl?: string }) => {
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        videoName: p.videoName,
        currentEpisodeIndex: p.index,
        currentEpisodeName: p.videoName,
        totalEpisodesCount: p.total,
        currentTime: 0,
        isPlaying: p.playing,
        ...(p.streamUrl ? { streamUrl: p.streamUrl } : {}),
        lastUpdatedAt: serverTimestamp(),
        senderId: meRef.current.uid,
      });
    } catch (e: any) {
      console.warn('Episode sync failed:', e?.code || e);
      setSyncWarning('Could not tell the room about the episode change.');
    }
  }, [roomId]);

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------
  useEffect(() => {
    const q = query(collection(db, `rooms/${roomId}/reactions`), orderBy('timestamp', 'desc'), limit(15));
    const seen = new Set<string>();
    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type !== 'added' || seen.has(c.doc.id)) return;
          seen.add(c.doc.id);
          const d = c.doc.data() as Reaction;
          if (d.senderId === meRef.current.uid) return; // already shown instantly when sent
          const t = timestampToMs(d.timestamp) || Date.now();
          if (Date.now() - t < 6000) onReactionRef.current?.(d.emoji, d.senderName);
        });
      },
      (err) => console.warn('Reactions listener error:', err?.code || err)
    );
    return () => unsub();
  }, [roomId]);

  const lastReactionAt = useRef(0);
  const sendReaction = useCallback(async (emoji: string) => {
    if (Date.now() - lastReactionAt.current < 400) return; // stop accidental double-tap floods
    lastReactionAt.current = Date.now();
    onReactionRef.current?.(emoji, meRef.current.name); // instant local feedback, even on slow networks
    try {
      await addDoc(collection(db, `rooms/${roomId}/reactions`), {
        emoji,
        roomId,
        senderId: meRef.current.uid,
        senderName: meRef.current.name,
        timestamp: serverTimestamp(),
      });
    } catch (e: any) {
      console.warn('Reaction failed:', e?.code || e);
    }
  }, [roomId]);

  const resync = useCallback(() => {
    const r = roomRef.current;
    if (r) applyRoomState(r, true);
  }, [applyRoomState]);

  return { room, loading, roomError, members, syncWarning, sendReaction, announceEpisode, resync, queueWrite };
}
