import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp, collection } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile } from './types';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { VideoPlayer } from './components/VideoPlayer';
import { LiquidGlassCard } from './components/LiquidGlassCard';
import { AnimatedBackground } from './components/AnimatedBackground';
import { FloatingNotificationBanner } from './components/FloatingNotificationBanner';
import { PullToRefresh } from './components/PullToRefresh';
import { WelcomePopup } from './components/WelcomePopup';
import { Sparkles, Film } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Navigation / Room State
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // Welcome Pop-up State
  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(false);

  // 1. Listen to Firebase Authentication state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch UserProfile from Firestore when logged in
  useEffect(() => {
    if (!user) return;

    if (user.isDemo) {
      setProfile({
        uid: user.uid,
        name: user.displayName || 'Guest Penguin',
        email: 'guest@penguinview.local',
        profilePic: '🐧',
        themeColor: 'sky',
        friendCode: 'GUEST99',
        friends: []
      });
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        console.warn("User profile doc not found. Retrying/creating...");
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Handle incoming join room links (e.g. ?room=ROOM_ID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const cleanRoom = roomParam.trim();
      sessionStorage.setItem('pendingRoomId', cleanRoom);
      setActiveRoomId(cleanRoom);
    }
  }, []);

  // Ensure pending room is joined once user and profile are loaded
  useEffect(() => {
    if (profile && !activeRoomId) {
      const pending = sessionStorage.getItem('pendingRoomId');
      if (pending) {
        sessionStorage.removeItem('pendingRoomId');
        setActiveRoomId(pending);
      }
    }
  }, [profile, activeRoomId]);

  // Check and display Welcome Pop-up when user logs in
  useEffect(() => {
    if (profile && !activeRoomId) {
      const welcomedKey = `pv_welcomed_${profile.uid}`;
      const hasBeenWelcomed = sessionStorage.getItem(welcomedKey);
      const justLoggedIn = sessionStorage.getItem('just_logged_in');

      if (!hasBeenWelcomed || justLoggedIn === 'true') {
        sessionStorage.setItem(welcomedKey, 'true');
        sessionStorage.removeItem('just_logged_in');
        // Slight delay so the UI paints first and the popup animates in cleanly with fireworks
        const timer = setTimeout(() => {
          setIsWelcomeOpen(true);
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [profile, activeRoomId]);

  // Action: Launch a Sync Playback Room (Supports Local file OR Cloud Stream link)
  const handleStartRoom = async (
    movieTitle: string,
    streamUrl?: string,
    mediaItem?: any,
    episode?: any,
    seasonNumber?: number
  ) => {
    if (!profile) return;

    // Generate random room document ID
    const randomId = doc(collection(db, 'rooms')).id;
    const roomRef = doc(db, 'rooms', randomId);

    const displayName = episode?.title 
      ? `${movieTitle} - S${seasonNumber || 1}E${episode.episodeNumber || 1}: ${episode.title}`
      : movieTitle;

    const roomPayload: any = {
      roomId: randomId,
      hostId: profile.uid,
      hostName: profile.name,
      videoName: displayName,
      isPlaying: false,
      currentTime: 0,
      lastUpdatedAt: serverTimestamp(),
      senderId: profile.uid
    };

    if (streamUrl) {
      roomPayload.streamUrl = streamUrl;
    }
    if (mediaItem?.id) {
      roomPayload.mediaId = mediaItem.id;
    }
    if (episode?.title) {
      roomPayload.currentEpisodeName = displayName;
      roomPayload.currentEpisodeIndex = (episode.episodeNumber || 1) - 1;
    }

    const path = `rooms/${randomId}`;
    try {
      await setDoc(roomRef, roomPayload);
      
      // Update URL search parameters to allow sharing
      const newUrl = `${window.location.origin}/?room=${randomId}`;
      window.history.pushState({ path: newUrl }, '', newUrl);
      
      setActiveRoomId(randomId);
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.CREATE, path);
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (!roomId) return;
    const cleanId = roomId.trim();
    setActiveRoomId(cleanId);
    const newUrl = `${window.location.origin}/?room=${cleanId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleLeaveRoom = () => {
    // Clear room state and URL query parameter
    setActiveRoomId(null);
    sessionStorage.removeItem('pendingRoomId');
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.pushState({ path: cleanUrl }, '', cleanUrl);
  };

  // Set standard body backdrop glows based on user theme choice
  const getThemeBackgroundClass = () => {
    if (!profile) return 'theme-sky';
    return `theme-${profile.themeColor || 'sky'}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070a13] font-sans">
        <div className="w-16 h-16 rounded-[28%] bg-gradient-to-tr from-sky-400 to-indigo-500 p-[2px] shadow-2xl animate-pulse mb-6">
          <div className="w-full h-full rounded-[26%] bg-[#0e1424]/95 flex items-center justify-center">
            <span className="text-3xl">🐧</span>
          </div>
        </div>
        <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-indigo-300 font-mono tracking-widest uppercase">LOADING PENGUIN VIEW...</p>
      </div>
    );
  }

  // Render Auth screen if not signed in
  if (!user || !profile) {
    return (
      <Auth 
        onAuthSuccess={(uid) => console.log('Auth success: ', uid)} 
        onDemoLogin={(guestName) => {
          const demoUid = `demo-${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem('just_logged_in', 'true');
          setUser({ uid: demoUid, displayName: guestName || 'Penguin21', isDemo: true });
        }}
      />
    );
  }

  return (
    <PullToRefresh>
      <div className={`min-h-screen bg-[#060911] relative overflow-x-hidden transition-colors duration-500 ${getThemeBackgroundClass()}`}>
        
        {/* Real-time In-App Push Notification Alert Banner */}
        <FloatingNotificationBanner />

        {/* Welcome Pop-up with Fireworks and Dynamic Greeting */}
        <WelcomePopup 
          currentUser={profile}
          isOpen={isWelcomeOpen}
          onClose={() => setIsWelcomeOpen(false)}
          onExploreCatalog={() => {
            setIsWelcomeOpen(false);
            const catalogEl = document.getElementById('catalog-search-input');
            if (catalogEl) {
              catalogEl.focus();
            }
          }}
        />

        {/* Dynamic Animated Canvas Background (Liquid, Bubbles, Fire, Cyber, Emerald, etc.) */}
        <AnimatedBackground theme={profile.activeTheme || 'liquid'} customBgImage={profile.customBgImage} />

        {/* Absolute Ambient Glows mapped to User's Color Preference */}
        <div className="absolute top-0 right-10 w-[500px] h-[500px] rounded-full blur-[150px] opacity-15 pointer-events-none transition-all duration-700"
          style={{
            background: profile.themeColor === 'sky' ? '#38bdf8' :
                        profile.themeColor === 'rose' ? '#f43f5e' :
                        profile.themeColor === 'emerald' ? '#10b981' :
                        profile.themeColor === 'amber' ? '#f59e0b' :
                        profile.themeColor === 'purple' ? '#a855f7' :
                        profile.themeColor === 'autumn' ? '#ea580c' : '#14b8a6'
          }}
        />
        
        {!activeRoomId && (
          <header className="relative z-20 border-b border-white/5 py-4 px-6"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)'
            }}
          >
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div 
                onClick={handleLeaveRoom}
                className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <span className="text-2xl animate-pulse">🐧</span>
                <div>
                  <h1 className="text-lg font-extrabold font-display tracking-tight text-white">
                    Penguin View
                  </h1>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold font-mono">
                    Video Sync Engine
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsWelcomeOpen(true)}
                  className="text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-md cursor-pointer transition-all hover:scale-105"
                  title="Click to view your welcome greeting & fireworks!"
                >
                  {profile.profilePic && profile.profilePic.startsWith('data:image/') ? (
                    <img src={profile.profilePic} alt={profile.name} className="w-5 h-5 rounded-full object-cover border border-white/20" />
                  ) : (
                    <span className="text-sm">{profile.profilePic || '🐧'}</span>
                  )}
                  <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
                  <span>{profile.name}</span>
                  <span className="text-[10px] text-amber-300 font-medium">🎆</span>
                </button>
              </div>
            </div>
          </header>
        )}

        <main className={`relative min-h-[80vh] ${activeRoomId ? 'py-2 px-0 sm:py-6 sm:px-4' : 'py-6 px-4'}`}>
          {activeRoomId ? (
            <VideoPlayer 
              roomId={activeRoomId} 
              currentUser={profile} 
              onLeave={handleLeaveRoom} 
            />
          ) : (
            <Dashboard 
              currentUser={profile} 
              onLogout={() => {
                sessionStorage.removeItem(`pv_welcomed_${profile.uid}`);
                auth.signOut();
              }} 
              onStartRoom={handleStartRoom}
              onJoinRoom={handleJoinRoom}
              onOpenWelcome={() => setIsWelcomeOpen(true)}
            />
          )}
        </main>
      </div>
    </PullToRefresh>
  );
}
