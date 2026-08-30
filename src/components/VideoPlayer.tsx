import React, { useRef, useState, useEffect } from 'react';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Room, Reaction, UserProfile, RoomParticipant } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  ChevronLeft, 
  Share2, 
  Check, 
  Users, 
  Smartphone, 
  RefreshCw,
  Video,
  MessageSquare,
  Folder,
  FolderPlus,
  ListVideo,
  SkipForward,
  SkipBack,
  AlertCircle
} from 'lucide-react';

interface VideoPlayerProps {
  roomId: string;
  currentUser: UserProfile;
  onLeave: () => void;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  senderName: string;
  left: number; // horizontal percentage
}

const QUICK_COMMENTS = [
  "Wow! 😮",
  "Nice! 🔥",
  "What just happened?! 🤯",
  "I love this! 💕",
  "What's gonna happen? 🤔",
  "OMG!! 😱",
  "🐦🔥 Penguin Fire!",
  "Peak fiction! 🍿",
  "Fast forward! ⏩",
  "Rewind that! ⏪"
];

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  roomId, 
  currentUser, 
  onLeave 
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUpdatingFirestore = useRef<boolean>(false);
  const lastSyncTime = useRef<number>(0);
  const lastProgrammaticChangeTime = useRef<number>(0);

  // Video source & Playlist state
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [playlistFiles, setPlaylistFiles] = useState<File[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Sync Room state
  const [room, setRoom] = useState<Room | null>(null);
  const [activeMembers, setActiveMembers] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [roomError, setRoomError] = useState<string>('');

  // Player controls state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHudVisible, setIsHudVisible] = useState<boolean>(true);
  const [isCommentsMenuOpen, setIsCommentsMenuOpen] = useState<boolean>(false);
  
  // Custom screen mode: Half Screen vs Full screen (CSS mock fullscreen)
  const [isHalfScreen, setIsHalfScreen] = useState<boolean>(true);
  
  // Floating reactions state
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // HUD timer
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up object URLs on unmount or URL change to prevent browser leaks
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Presence heartbeat: keep current user active in room participants
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const participantRef = doc(db, `rooms/${roomId}/participants`, currentUser.uid);
    const writePresence = () => {
      setDoc(participantRef, {
        uid: currentUser.uid,
        name: currentUser.name,
        profilePic: currentUser.profilePic || '🐧',
        themeColor: currentUser.themeColor || 'sky',
        lastSeen: serverTimestamp()
      }, { merge: true }).catch(err => console.error("Presence update error:", err));
    };

    writePresence();
    const heartbeat = setInterval(writePresence, 10000);

    // Subscribe to active participants in this room
    const participantsCol = collection(db, `rooms/${roomId}/participants`);
    const unsubscribe = onSnapshot(participantsCol, (snapshot) => {
      const active: RoomParticipant[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RoomParticipant;
        let lastSeenMs = now;
        if (data.lastSeen) {
          lastSeenMs = data.lastSeen.toMillis ? data.lastSeen.toMillis() : new Date(data.lastSeen).getTime();
        }
        if (now - lastSeenMs < 35000) {
          active.push(data);
        }
      });
      setActiveMembers(active);
    }, (err) => {
      console.error("Participants listener error:", err);
    });

    return () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
  }, [roomId, currentUser]);

  // 1. Listen for room synchronization updates in real-time
  useEffect(() => {
    setLoading(true);
    const roomRef = doc(db, 'rooms', roomId);

    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) {
        setRoomError("Room does not exist or was closed by the host.");
        setLoading(false);
        return;
      }

      const roomData = docSnap.data() as Room;
      setRoom(roomData);
      setLoading(false);

      // Episode switch synchronization
      if (
        roomData.currentEpisodeIndex !== undefined && 
        roomData.currentEpisodeIndex !== currentEpisodeIndex
      ) {
        setCurrentEpisodeIndex(roomData.currentEpisodeIndex);
        if (playlistFiles[roomData.currentEpisodeIndex]) {
          loadSelectedEpisodeFile(playlistFiles[roomData.currentEpisodeIndex], roomData.currentEpisodeIndex, false);
        }
      }

      const video = videoRef.current;
      if (!video) return;

      // Calculate state changes and perform video syncing
      if (isUpdatingFirestore.current) {
        // This change was originated by this client. Clear lock.
        isUpdatingFirestore.current = false;
        return;
      }

      // Check play/pause state synchronization
      if (roomData.isPlaying) {
        if (video.paused) {
          lastProgrammaticChangeTime.current = Date.now();
          video.play().catch(e => console.log("Playback start deferred: ", e));
          setIsPlaying(true);
        }
      } else {
        if (!video.paused) {
          lastProgrammaticChangeTime.current = Date.now();
          video.pause();
          setIsPlaying(false);
        }
      }

      // Sync playback timeline seeking
      let targetTime = roomData.currentTime;
      
      // Calculate elapsed time since the sender's actual action to offset latency
      if (roomData.isPlaying && roomData.lastUpdatedAt) {
        let updateMs = 0;
        if (roomData.lastUpdatedAt.toMillis) {
          updateMs = roomData.lastUpdatedAt.toMillis();
        } else if (roomData.lastUpdatedAt instanceof Date) {
          updateMs = roomData.lastUpdatedAt.getTime();
        } else {
          updateMs = new Date(roomData.lastUpdatedAt).getTime();
        }

        const latencySeconds = (Date.now() - updateMs) / 1000;
        // Ignore crazy offsets to prevent buffer starvation loops
        if (latencySeconds > 0 && latencySeconds < 15) {
          targetTime += latencySeconds;
        }
      }

      // Sync if drift is larger than 1.5 seconds
      const drift = Math.abs(video.currentTime - targetTime);
      if (drift > 1.5) {
        lastProgrammaticChangeTime.current = Date.now();
        video.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    }, (err) => {
      console.error(err);
      handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId, currentEpisodeIndex, playlistFiles]);

  // 2. Listen for Floating Reactions
  useEffect(() => {
    const reactionsCol = collection(db, `rooms/${roomId}/reactions`);
    const q = query(reactionsCol, orderBy('timestamp', 'desc'), limit(15));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const reactionData = change.doc.data() as Reaction;
          
          // Only show reactions created in the last 6 seconds (to avoid backlog spam)
          let reactionTime = Date.now();
          if (reactionData.timestamp) {
            reactionTime = reactionData.timestamp.toMillis 
              ? reactionData.timestamp.toMillis() 
              : new Date(reactionData.timestamp).getTime();
          }

          if (Date.now() - reactionTime < 6000) {
            triggerFloatingEmoji(reactionData.emoji, reactionData.senderName);
          }
        }
      });
    }, (err) => {
      console.error(err);
    });

    return () => unsubscribe();
  }, [roomId]);

  // Show HUD controls on mouse move / tap, auto-hide after 3.5 seconds
  const handleUserActivity = () => {
    setIsHudVisible(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setIsHudVisible(false);
      }
    }, 3500);
  };

  useEffect(() => {
    handleUserActivity();
    return () => {
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, [isPlaying]);

  // Helper: Process multiple files or folder inputs
  const processSelectedFiles = (rawFiles: FileList | File[]) => {
    const fileArray = Array.from(rawFiles);
    // Filter for video files or files with video extensions
    const videoFiles = fileArray.filter(file => {
      const isVideoType = file.type.startsWith('video/');
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isVideoExt = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.ts', '.3gp'].includes(ext);
      return isVideoType || isVideoExt;
    });

    if (videoFiles.length === 0) return;

    // Natural alphanumeric sorting (Episode 1, Episode 2, Episode 10...)
    videoFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    setPlaylistFiles(videoFiles);
    loadSelectedEpisodeFile(videoFiles[0], 0, true, videoFiles.length);
  };

  // Switch video file by episode index
  const loadSelectedEpisodeFile = async (
    file: File, 
    index: number, 
    syncRoom: boolean = true, 
    totalCount?: number
  ) => {
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(file);
    setCurrentEpisodeIndex(index);
    const newUrl = URL.createObjectURL(file);
    setVideoUrl(newUrl);

    if (syncRoom) {
      const roomRef = doc(db, 'rooms', roomId);
      try {
        await updateDoc(roomRef, {
          videoName: file.name,
          currentEpisodeIndex: index,
          currentEpisodeName: file.name,
          totalEpisodesCount: totalCount !== undefined ? totalCount : (playlistFiles.length || 1),
          currentTime: 0,
          isPlaying: true,
          lastUpdatedAt: serverTimestamp(),
          senderId: currentUser.uid
        });
      } catch (err) {
        console.error("Failed to sync episode switch:", err);
      }
    }
  };

  // Handle single or multiple file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  // Next / Prev Episode Trigger
  const handleNextEpisode = () => {
    if (playlistFiles.length > 0) {
      const nextIndex = currentEpisodeIndex + 1;
      if (nextIndex < playlistFiles.length) {
        loadSelectedEpisodeFile(playlistFiles[nextIndex], nextIndex, true);
      }
    } else {
      // Sync room state to next episode index even if local files aren't loaded yet
      const nextIndex = (room?.currentEpisodeIndex || 0) + 1;
      const roomRef = doc(db, 'rooms', roomId);
      updateDoc(roomRef, {
        currentEpisodeIndex: nextIndex,
        currentEpisodeName: `Episode ${nextIndex + 1}`,
        lastUpdatedAt: serverTimestamp(),
        senderId: currentUser.uid
      }).catch(console.error);
    }
  };

  const handlePrevEpisode = () => {
    if (playlistFiles.length > 0) {
      const prevIndex = currentEpisodeIndex - 1;
      if (prevIndex >= 0) {
        loadSelectedEpisodeFile(playlistFiles[prevIndex], prevIndex, true);
      }
    } else {
      const prevIndex = Math.max(0, (room?.currentEpisodeIndex || 0) - 1);
      const roomRef = doc(db, 'rooms', roomId);
      updateDoc(roomRef, {
        currentEpisodeIndex: prevIndex,
        currentEpisodeName: `Episode ${prevIndex + 1}`,
        lastUpdatedAt: serverTimestamp(),
        senderId: currentUser.uid
      }).catch(console.error);
    }
  };

  // Helper: Write room playback state changes to Firestore
  const updateRoomState = async (playing: boolean, time: number) => {
    if (!room) return;
    
    // Prevent syncing more frequently than every 250ms to limit rate limits
    if (Date.now() - lastSyncTime.current < 250) return;
    lastSyncTime.current = Date.now();

    isUpdatingFirestore.current = true;
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    try {
      await updateDoc(roomRef, {
        isPlaying: playing,
        currentTime: time,
        lastUpdatedAt: serverTimestamp(),
        senderId: currentUser.uid
      });
    } catch (fsErr) {
      isUpdatingFirestore.current = false;
      handleFirestoreError(fsErr, OperationType.UPDATE, path);
    }
  };

  // Video Element event listeners
  const handlePlay = () => {
    setIsPlaying(true);
    if (Date.now() - lastProgrammaticChangeTime.current < 1500) {
      return;
    }
    updateRoomState(true, videoRef.current?.currentTime || 0);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (Date.now() - lastProgrammaticChangeTime.current < 1500) {
      return;
    }
    updateRoomState(false, videoRef.current?.currentTime || 0);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      
      // Sync immediately on initial video load
      if (room) {
        lastProgrammaticChangeTime.current = Date.now();
        let targetTime = room.currentTime;
        
        // Compensate for latency if already actively playing
        if (room.isPlaying && room.lastUpdatedAt) {
          let updateMs = 0;
          if (room.lastUpdatedAt.toMillis) {
            updateMs = room.lastUpdatedAt.toMillis();
          } else if (room.lastUpdatedAt instanceof Date) {
            updateMs = room.lastUpdatedAt.getTime();
          } else {
            updateMs = new Date(room.lastUpdatedAt).getTime();
          }
          const latencySeconds = (Date.now() - updateMs) / 1000;
          if (latencySeconds > 0 && latencySeconds < 15) {
            targetTime += latencySeconds;
          }
        }
        
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
        
        if (room.isPlaying) {
          videoRef.current.play().catch(e => console.log("Initial autoplay deferred: ", e));
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  // Controls actions
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(e => console.log(e));
      setIsPlaying(true);
      updateRoomState(true, video.currentTime);
    } else {
      video.pause();
      setIsPlaying(false);
      updateRoomState(false, video.currentTime);
    }
  };

  // Skip playback forward/backward 5 seconds
  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    let target = video.currentTime + seconds;
    if (target < 0) target = 0;
    if (target > duration) target = duration;

    video.currentTime = target;
    setCurrentTime(target);
    updateRoomState(isPlaying, target);
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const target = parseFloat(e.target.value);
    video.currentTime = target;
    setCurrentTime(target);
    updateRoomState(isPlaying, target);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  // React Fast Reactions dispatcher
  const sendReaction = async (emoji: string) => {
    try {
      const reactionsCol = collection(db, `rooms/${roomId}/reactions`);
      await addDoc(reactionsCol, {
        emoji,
        senderId: currentUser.uid,
        senderName: currentUser.name,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to post reaction: ", err);
    }
  };

  const triggerFloatingEmoji = (emoji: string, senderName: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const left = Math.floor(Math.random() * 80) + 10; // Scatter between 10% and 90%
    
    setFloatingEmojis(prev => [...prev, { id, emoji, senderName, left }]);
    
    // Auto remove emoji after animation ends (2.5 seconds)
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2500);
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const forceResync = () => {
    if (!room) return;
    const video = videoRef.current;
    if (!video) return;
    
    lastProgrammaticChangeTime.current = Date.now();
    let targetTime = room.currentTime;
    if (room.isPlaying && room.lastUpdatedAt) {
      let updateMs = 0;
      if (room.lastUpdatedAt.toMillis) {
        updateMs = room.lastUpdatedAt.toMillis();
      } else if (room.lastUpdatedAt instanceof Date) {
        updateMs = room.lastUpdatedAt.getTime();
      } else {
        updateMs = new Date(room.lastUpdatedAt).getTime();
      }
      const latencySeconds = (Date.now() - updateMs) / 1000;
      if (latencySeconds > 0 && latencySeconds < 15) {
        targetTime += latencySeconds;
      }
    }
    
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    
    if (room.isPlaying) {
      video.play().catch(e => console.log(e));
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (time: number): string => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Render file picker if video is not selected yet
  if (!videoUrl) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center font-sans">
        <LiquidGlassCard intensity="glass" className="space-y-6 py-10">
          
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 transition-all duration-300 flex flex-col items-center justify-center gap-5 ${
              isDragging 
                ? 'border-sky-400 bg-sky-500/10 scale-[1.02] shadow-[0_0_25px_rgba(56,189,248,0.25)]' 
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            <div className={`w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center border border-sky-400/20 text-sky-400 transition-transform ${isDragging ? 'scale-110 animate-bounce' : 'animate-pulse'}`}>
              <Video className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white font-display">
                {isDragging ? 'Drop Your Folder or Videos Here!' : 'Select Anime Folder or Video File'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                You can select an entire anime series folder or individual video files. Watch together without re-creating rooms for every episode!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm pt-2">
              <button
                onClick={() => document.getElementById('local-folder-input')?.click()}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Folder className="w-4 h-4" />
                Select Entire Folder
              </button>

              <button
                onClick={() => document.getElementById('local-files-input')?.click()}
                className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Video className="w-4 h-4 text-sky-400" />
                Select Video File(s)
              </button>
            </div>

            {/* Hidden File Inputs */}
            <input 
              id="local-folder-input"
              type="file" 
              // @ts-ignore - directory attributes supported in modern browsers
              webkitdirectory=""
              directory=""
              multiple
              accept="video/*" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <input 
              id="local-files-input"
              type="file" 
              multiple
              accept="video/*" 
              className="hidden" 
              onChange={handleFileChange} 
            />
          </div>

          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            To sync playback, all participants load their local copy of the folder or files. <strong>Penguin View</strong> coordinates playback, pauses, and next episodes seamlessly!
          </p>

          {room && (
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl text-left space-y-1">
              <p className="text-slate-500 text-[10px] uppercase font-mono tracking-wider">Suggested / Current Episode</p>
              <p className="text-white text-xs font-semibold line-clamp-1">{room.currentEpisodeName || room.videoName || 'Any Video File'}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400 text-[10px]">Host: {room.hostName}</span>
                {activeMembers.length > 0 && (
                  <span className="text-emerald-400 text-[10px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    {activeMembers.length} member{activeMembers.length > 1 ? 's' : ''} in room
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2 border-t border-white/5">
            <button 
              onClick={onLeave}
              className="text-xs text-slate-500 hover:text-white transition-colors cursor-pointer"
            >
              Exit Room
            </button>
          </div>
        </LiquidGlassCard>
      </div>
    );
  }

  return (
    <div className={`font-sans min-h-[60vh] sm:min-h-[90vh] flex flex-col justify-center py-2 sm:py-4 ${
      isHalfScreen ? 'max-w-6xl mx-auto px-4 w-full' : 'fixed inset-0 z-50 bg-[#060911] justify-center py-0'
    }`}>
      {/* Sync Error Display */}
      {roomError && (
        <div className="max-w-md mx-auto p-4 text-center bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded-2xl mb-4">
          <p className="text-sm font-semibold">{roomError}</p>
          <button onClick={onLeave} className="text-xs text-white underline mt-2 font-mono cursor-pointer">BACK TO DASHBOARD</button>
        </div>
      )}

      {/* Main stage: Responsive Flex depending on screen configuration */}
      <div className={`w-full flex flex-col gap-6 ${isHalfScreen ? 'lg:flex-row' : 'h-full flex-grow relative'}`}>
        
        {/* VIDEO CANVAS STAGE */}
        <div 
          ref={containerRef}
          onMouseMove={handleUserActivity}
          onClick={handleUserActivity}
          className={`relative group bg-black overflow-hidden flex items-center justify-center select-none shadow-2xl transition-all duration-300 ${
            isHalfScreen 
              ? 'w-full lg:w-[70%] aspect-video rounded-[24px] border border-white/10' 
              : 'w-full h-full flex-grow'
          } ${!isHudVisible ? 'cursor-none' : ''}`}
        >
          {/* Real local HTML5 Video object */}
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleNextEpisode}
            onClick={togglePlayPause}
            playsInline
          />

          {/* FLOATING SOCIAL REACTIONS STAGE */}
          <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
            {floatingEmojis.map((e) => {
              const isQuickComment = e.emoji.length > 2;
              return (
                <div
                  key={e.id}
                  className="absolute bottom-6 animate-reaction flex flex-col items-center"
                  style={{ left: `${e.left}%` }}
                >
                  {isQuickComment ? (
                    <div className="px-3.5 py-1.5 rounded-2xl bg-gradient-to-r from-sky-500/90 to-indigo-600/90 backdrop-blur-md text-white font-bold text-xs sm:text-sm shadow-2xl border border-white/30 flex items-center gap-1.5 whitespace-nowrap">
                      <span>{e.emoji}</span>
                    </div>
                  ) : (
                    <span className="text-4xl filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">{e.emoji}</span>
                  )}
                  <span className="text-[10px] font-semibold text-white/95 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 mt-1 whitespace-nowrap shadow-md">
                    {e.senderName}
                  </span>
                </div>
              );
            })}
          </div>

          {/* LIQUID GLASS CUSTOM PLAYER HUD OVERLAY */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 flex flex-col justify-between p-4 md:p-6 transition-opacity duration-300 z-40 ${
            isHudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}>
            
            {/* HUD Top Bar */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onLeave}
                className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold backdrop-blur-md"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-xl flex items-center gap-1.5 backdrop-blur-md text-[11px] sm:text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-slate-200 font-medium">Room: {roomId.slice(0, 6)}</span>
                </div>

                {/* Active Members Count Badge */}
                {activeMembers.length > 0 && (
                  <div className="px-2.5 py-1.5 bg-white/10 border border-white/10 rounded-xl flex items-center gap-1.5 backdrop-blur-md text-[11px] sm:text-xs text-sky-300">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    <span>{activeMembers.length} Online</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyRoomLink}
                  className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold backdrop-blur-md"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="hidden sm:inline">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-sky-400" />
                      <span className="hidden sm:inline">Share Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* HUD Central / Bottom Fast Reactions panel */}
            <div className="flex flex-col items-center gap-3">
              
              {/* Quick Comments Overlay Menu Popup */}
              {isCommentsMenuOpen && (
                <div 
                  className="p-3 bg-slate-900/90 border border-white/20 rounded-2xl shadow-2xl backdrop-blur-xl animate-fade-in max-w-md w-full grid grid-cols-2 gap-2 text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="col-span-2 flex items-center justify-between border-b border-white/10 pb-1.5 mb-1">
                    <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Quick Comments
                    </span>
                    <button 
                      onClick={() => setIsCommentsMenuOpen(false)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Close ✕
                    </button>
                  </div>
                  {QUICK_COMMENTS.map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => {
                        sendReaction(phrase);
                        setIsCommentsMenuOpen(false);
                      }}
                      className="px-2.5 py-1.5 bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-400/40 rounded-xl text-xs text-white text-left font-medium transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              )}

              {/* Emojis & Quick Comments Selector Bar */}
              <div 
                className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-white/10 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl animate-fade-in max-w-full overflow-x-auto"
                style={{ borderRadius: '20px' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 💬 Quick Comment Popup Button */}
                <button
                  onClick={() => setIsCommentsMenuOpen(!isCommentsMenuOpen)}
                  className={`px-3 py-1.5 sm:py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    isCommentsMenuOpen 
                      ? 'bg-sky-500 text-white border-sky-400 scale-105' 
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-sky-300'
                  }`}
                  title="Open quick comments menu"
                >
                  <MessageSquare className="w-4 h-4 text-sky-400" />
                  <span className="hidden sm:inline">Comments</span>
                </button>

                <div className="w-[1px] h-6 bg-white/15 mx-0.5" />

                {['🤣', '👀', '😱', '🫢', '💕', '🔥', '🍿', '🐧', '🐰'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xl sm:text-2xl hover:scale-125 active:scale-95 transition-all cursor-pointer hover:rotate-3"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              
              {/* HUD Control Console (Scrubber + Playback commands) */}
              <div 
                className="w-full max-w-2xl bg-white/5 border border-white/15 p-3.5 sm:p-4 flex flex-col gap-3 backdrop-blur-xl shadow-2xl"
                style={{ borderRadius: '20px' }}
                onClick={(e) => e.stopPropagation()}
              >
                
                {/* Custom Seek Scrubber */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-300 font-medium min-w-[32px]">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleTimelineChange}
                    className="flex-grow accent-sky-400 cursor-pointer h-1.5 rounded-full bg-white/20 hover:bg-white/30"
                  />
                  <span className="text-[10px] font-mono text-slate-300 font-medium min-w-[32px]">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Console Bottom Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2">
                  {/* Left Side: Navigation Controls + Episode Switchers */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={handlePrevEpisode}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Previous Episode"
                    >
                      <SkipBack className="w-5 h-5 text-indigo-400" />
                    </button>

                    <button
                      onClick={() => skip(-5)}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Jump 5s back"
                    >
                      <RotateCcw className="w-5 h-5 text-sky-400" />
                    </button>

                    <button
                      onClick={togglePlayPause}
                      className="w-10 h-10 rounded-full bg-white text-slate-950 flex items-center justify-center hover:scale-105 active:scale-95 cursor-pointer shadow-lg transition-transform"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-black" />
                      ) : (
                        <Play className="w-5 h-5 fill-black ml-0.5" />
                      )}
                    </button>

                    <button
                      onClick={() => skip(5)}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Jump 5s forward"
                      style={{ transform: 'scaleX(-1)' }}
                    >
                      <RotateCcw className="w-5 h-5 text-sky-400" />
                    </button>

                    <button
                      onClick={handleNextEpisode}
                      className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Next Episode"
                    >
                      <SkipForward className="w-5 h-5 text-indigo-400" />
                    </button>
                  </div>

                  {/* Middle Side: Audio */}
                  <div className="hidden sm:flex items-center gap-2 max-w-[120px]">
                    <button onClick={toggleMute} className="text-slate-300 hover:text-white cursor-pointer">
                      {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-16 accent-white cursor-pointer h-1 rounded-full bg-white/20"
                    />
                  </div>

                  {/* Right Side: Options & Screens */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={forceResync}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-xs text-sky-300 flex items-center gap-1 cursor-pointer"
                      title="Sync playback timeline now"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Resync</span>
                    </button>

                    <button
                      onClick={() => setIsHalfScreen(!isHalfScreen)}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-xs text-white flex items-center gap-1 cursor-pointer"
                    >
                      {isHalfScreen ? (
                        <>
                          <Maximize className="w-3.5 h-3.5 text-indigo-300" />
                          <span className="hidden sm:inline">Full View</span>
                        </>
                      ) : (
                        <>
                          <Minimize className="w-3.5 h-3.5 text-indigo-300" />
                          <span className="hidden sm:inline">Half View</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>

        {/* SIDE BAR / EPISODES & ACTIVE MEMBERS MODULE (Visible in half screen play mode) */}
        {isHalfScreen && (
          <div className="w-full lg:w-[30%] flex flex-col gap-4">
            <LiquidGlassCard intensity="glass" className="h-full flex flex-col justify-between p-5 space-y-5">
              
              {/* Top Section: Active Members in Room */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    ONLINE MEMBERS ({activeMembers.length})
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  {activeMembers.map((m) => (
                    <div 
                      key={m.uid}
                      className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 text-xs font-medium text-white"
                    >
                      {m.profilePic && m.profilePic.startsWith('data:image/') ? (
                        <img src={m.profilePic} alt={m.name} className="w-5 h-5 rounded-full object-cover border border-white/20" />
                      ) : (
                        <span className="text-sm">{m.profilePic || '🐧'}</span>
                      )}
                      <span className="line-clamp-1">{m.name}</span>
                      {m.uid === room?.hostId && (
                        <span className="text-[9px] px-1 bg-sky-500/20 text-sky-300 rounded font-mono">HOST</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Middle Section: Playlist / Episodes inside Room */}
              <div className="space-y-3 flex-grow overflow-hidden flex flex-col">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                    <ListVideo className="w-4 h-4 text-sky-400" />
                    Episode Playlist ({playlistFiles.length > 0 ? playlistFiles.length : (room?.totalEpisodesCount || 1)})
                  </h4>

                  <button
                    onClick={() => document.getElementById('sidebar-folder-input')?.click()}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Add Folder
                  </button>

                  <input 
                    id="sidebar-folder-input"
                    type="file" 
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    accept="video/*" 
                    className="hidden" 
                    onChange={handleFileChange} 
                  />
                </div>

                {/* Playlist Files List */}
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {playlistFiles.length > 0 ? (
                    playlistFiles.map((f, idx) => {
                      const isCurrent = idx === currentEpisodeIndex;
                      return (
                        <button
                          key={f.name + idx}
                          onClick={() => loadSelectedEpisodeFile(f, idx, true)}
                          className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                            isCurrent
                              ? 'bg-sky-500/20 border-sky-400/50 text-white font-bold shadow-md'
                              : 'bg-white/[0.03] hover:bg-white/10 border-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isCurrent ? 'bg-sky-400 text-black font-bold' : 'bg-white/10 text-slate-400'}`}>
                              {idx + 1}
                            </span>
                            <span className="line-clamp-1">{f.name}</span>
                          </div>
                          {isCurrent && (
                            <span className="text-[10px] font-mono text-sky-400 animate-pulse font-bold">PLAYING</span>
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-center space-y-2">
                      <p className="text-xs text-slate-300 font-medium line-clamp-1">
                        Currently: {room?.currentEpisodeName || room?.videoName || 'Episode 1'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Load your local anime/movie folder to enable one-click episode switching for everyone!
                      </p>
                      <button
                        onClick={() => document.getElementById('sidebar-folder-input')?.click()}
                        className="w-full py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 text-sky-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Folder className="w-3.5 h-3.5" />
                        Select Local Folder
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Session Details */}
              <div className="border-t border-white/10 pt-3">
                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-500 uppercase">INVITE CODE</p>
                    <p className="text-xs font-mono text-white font-bold mt-0.5">{roomId.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <button
                    onClick={copyRoomLink}
                    className="p-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Copy Link
                  </button>
                </div>
              </div>

            </LiquidGlassCard>
          </div>
        )}

      </div>
    </div>
  );
};
