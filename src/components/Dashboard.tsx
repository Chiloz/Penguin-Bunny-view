import React, { useState, useEffect } from 'react';
import { 
  doc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { WatchList } from './WatchList';
import { SharedWatchLists } from './SharedWatchLists';
import { MiniChatDrawer } from './MiniChatDrawer';
import { IncomingInvitesBanner } from './IncomingInvitesBanner';
import { InstallAppModal } from './InstallAppModal';
import { MediaCatalog } from './MediaCatalog';
import { 
  User as UserIcon, 
  Palette, 
  Users, 
  Share2, 
  Check, 
  Copy, 
  Plus, 
  Sparkles, 
  LogOut, 
  Tv, 
  UserCheck,
  ChevronRight,
  Film,
  Clapperboard,
  Settings,
  HelpCircle,
  Play,
  Flame,
  Droplets,
  Zap,
  Eye,
  Heart,
  Upload,
  Image as ImageIcon,
  Trash2,
  X,
  MessageSquare,
  Smartphone,
  Download,
  Bell,
  Volume2,
  Leaf,
  Trees,
  PartyPopper
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { 
  sendPushNotification, 
  requestNotificationPermission, 
  playNotificationChime 
} from '../utils/notifications';
import { formatFriendlyName } from '../utils/greetingEngine';

interface DashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onStartRoom: (movieTitle: string, streamUrl?: string, mediaItem?: any, episode?: any, seasonNumber?: number) => void;
  onJoinRoom: (roomId: string) => void;
  onOpenWelcome?: () => void;
}

const EMOJI_PRESETS = ['🐧', '🐨', '🦊', '🐯', '🦁', '🐼', '🐸', '🐙', '🦄', '🦖', '🍿', '🎬'];
const THEME_PRESETS = [
  { name: 'sky', label: 'Liquid Sky', class: 'bg-sky-500/25 text-sky-200 border-sky-400/30' },
  { name: 'rose', label: 'Sunset Coral', class: 'bg-rose-500/25 text-rose-200 border-rose-400/30' },
  { name: 'emerald', label: 'Forest Green', class: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30' },
  { name: 'amber', label: 'Honey Gold', class: 'bg-amber-500/25 text-amber-200 border-amber-400/30' },
  { name: 'purple', label: 'Cosmic Violet', class: 'bg-purple-500/25 text-purple-200 border-purple-400/30' },
  { name: 'teal', label: 'Deep Ocean', class: 'bg-teal-500/25 text-teal-200 border-teal-400/30' }
];

const ANIMATED_THEMES = [
  { id: 'autumn', label: 'Autumn Tree 🍁', icon: Leaf, color: 'from-amber-500 to-orange-600' },
  { id: 'liquid', label: 'Liquid Smooth', icon: Droplets, color: 'from-cyan-500 to-blue-600' },
  { id: 'bubbles', label: 'Bouncing Bubbles', icon: Sparkles, color: 'from-sky-400 to-indigo-500' },
  { id: 'fire', label: 'Burning Fire', icon: Flame, color: 'from-amber-500 to-rose-600' },
  { id: 'cyber', label: 'Cyber Matrix', icon: Zap, color: 'from-emerald-400 to-teal-600' },
  { id: 'emerald', label: 'Lush Emerald', icon: Heart, color: 'from-teal-400 to-emerald-500' },
  { id: 'green', label: 'Meadow Green', icon: Sparkles, color: 'from-green-400 to-emerald-600' },
  { id: 'yellow', label: 'Solar Yellow', icon: Sparkles, color: 'from-yellow-300 to-amber-500' },
  { id: 'orange', label: 'Sunset Orange', icon: Flame, color: 'from-orange-400 to-amber-600' },
  { id: 'gold', label: 'Royal Gold', icon: Sparkles, color: 'from-yellow-400 to-amber-600' },
  { id: 'silver', label: 'Platinum Silver', icon: Eye, color: 'from-slate-300 to-slate-500' },
  { id: 'sky', label: 'Midnight Sky', icon: Eye, color: 'from-slate-600 to-indigo-900' }
];

export const Dashboard: React.FC<DashboardProps> = ({ 
  currentUser, 
  onLogout,
  onStartRoom,
  onJoinRoom,
  onOpenWelcome
}) => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'catalog' | 'watch' | 'settings'>('catalog');
  const [watchSubTab, setWatchSubTab] = useState<'personal' | 'shared'>('personal');

  // Mini Chat Box State
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [selectedChatFriendId, setSelectedChatFriendId] = useState<string | null>(null);
  const [totalUnreadCount, setTotalUnreadCount] = useState<number>(0);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);

  // Push notification permission state
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
    if (granted) {
      sendPushNotification('🔔 Notifications Enabled!', {
        body: 'Penguin View will now alert you whenever friends message you or invite you to watch movies.',
      });
    }
  };

  const handleTestNotification = () => {
    sendPushNotification('🐧 Penguin View Alert', {
      body: 'Test alert: Popcorn is ready! Real-time notifications are working on your device.',
    });
  };

  // Listen for total unread direct messages / invites & fire push notification if new
  useEffect(() => {
    if (!currentUser.uid) return;

    const q = query(
      collection(db, 'direct_messages'),
      where('recipientId', '==', currentUser.uid),
      where('isRead', '==', false)
    );

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTotalUnreadCount(snapshot.docs.length);

      // Trigger push notification on newly incoming messages if not initial load
      if (!isInitialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const senderName = data.senderName || 'A friend';
            const textPreview = data.messageType === 'room_invite' 
              ? `🍿 Invited you to watch: ${data.roomMovieTitle || 'a movie'}!` 
              : data.text || 'Sent you a message';

            sendPushNotification(`💬 ${senderName}`, {
              body: textPreview,
              tag: `msg-${change.doc.id}`,
            });
          }
        });
      }
      isInitialLoad = false;
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Active theme state
  const [activeTheme, setActiveTheme] = useState<string>(currentUser.activeTheme || 'liquid');

  const handleSelectTheme = async (themeId: string) => {
    setActiveTheme(themeId);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { activeTheme: themeId });
    } catch (err) {
      console.error("Theme update error:", err);
    }
  };

  // Editing Profile State
  const [name, setName] = useState<string>(currentUser.name);
  const [profilePic, setProfilePic] = useState<string>(currentUser.profilePic);
  const [customBgImage, setCustomBgImage] = useState<string>(currentUser.customBgImage || '');
  const [themeColor, setThemeColor] = useState<string>(currentUser.themeColor || 'sky');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [profileSuccess, setProfileSuccess] = useState<boolean>(false);
  const [profilePicError, setProfilePicError] = useState<string>('');
  const [bgImageError, setBgImageError] = useState<string>('');

  // Handle Profile Picture Upload (Max 1.5MB)
  const handleProfilePicFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProfilePicError('');

    // 1.5MB limit (1.5 * 1024 * 1024 bytes = 1,572,864 bytes)
    if (file.size > 1.5 * 1024 * 1024) {
      setProfilePicError(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 1.5MB limit for profile picture.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const SIZE = 250;
        canvas.width = SIZE;
        canvas.height = SIZE;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, SIZE, SIZE);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setProfilePic(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle Custom Background Image Upload (Max 1.0MB)
  const handleBgImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBgImageError('');

    // 1.0MB limit (1.0 * 1024 * 1024 bytes = 1,048,576 bytes)
    if (file.size > 1.0 * 1024 * 1024) {
      setBgImageError(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 1MB limit for background image to avoid slowness.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setCustomBgImage(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Friends State
  const [friendCodeInput, setFriendCodeInput] = useState<string>('');
  const [friendError, setFriendError] = useState<string>('');
  const [friendSuccess, setFriendSuccess] = useState<string>('');
  const [friendLoading, setFriendLoading] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  
  // Real-time friends profiles
  const [friendsProfiles, setFriendsProfiles] = useState<UserProfile[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);

  // Room Creation & Connection state
  const [customMovieName, setCustomMovieName] = useState<string>('');
  const [joinRoomIdInput, setJoinRoomIdInput] = useState<string>('');
  const [joinRoomError, setJoinRoomError] = useState<string>('');

  // Realtime subscription for friends profiles
  useEffect(() => {
    if (currentUser.friends && currentUser.friends.length > 0) {
      const q = query(
        collection(db, 'users'),
        where('uid', 'in', currentUser.friends)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const profiles: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          profiles.push(docSnap.data() as UserProfile);
        });
        setFriendsProfiles(profiles);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      });

      return () => unsubscribe();
    } else {
      setFriendsProfiles([]);
    }
  }, [currentUser.friends]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setProfileSuccess(false);

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const path = `users/${currentUser.uid}`;
      
      await updateDoc(userRef, {
        name: name.trim(),
        profilePic,
        customBgImage: customBgImage || null,
        themeColor
      });

      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = friendCodeInput.trim().toUpperCase();
    if (!code) return;

    if (code === currentUser.friendCode) {
      setFriendError("That is your own code!");
      return;
    }

    setFriendLoading(true);
    setFriendError('');
    setFriendSuccess('');

    try {
      // Query users collection for this friend code
      const q = query(collection(db, 'users'), where('friendCode', '==', code));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setFriendError("Friend code not found. Make sure it's spelled correctly!");
        setFriendLoading(false);
        return;
      }

      const friendDoc = querySnapshot.docs[0];
      const friendData = friendDoc.data() as UserProfile;

      if (currentUser.friends?.includes(friendData.uid)) {
        setFriendError(`You are already friends with ${friendData.name}!`);
        setFriendLoading(false);
        return;
      }

      // 1. Add to current user's friends list
      const updatedFriends = [...(currentUser.friends || []), friendData.uid];
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { friends: updatedFriends });

      // 2. Bidirectional Friend addition: also add current user to friend's friends list
      const friendRef = doc(db, 'users', friendData.uid);
      const friendFriends = friendData.friends || [];
      if (!friendFriends.includes(currentUser.uid)) {
        await updateDoc(friendRef, { friends: [...friendFriends, currentUser.uid] });
      }

      setFriendSuccess(`Successfully added ${friendData.name}! You are now bidirectional friends.`);
      setFriendCodeInput('');
      
      setTimeout(() => setFriendSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      setFriendError("An error occurred. Please try again.");
    } finally {
      setFriendLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentUser.friendCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error(err);
    }
  };

  const selectedTheme = THEME_PRESETS.find(t => t.name === themeColor) || THEME_PRESETS[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 font-sans">
      
      {/* Welcome Bar with user theme gradient glow */}
      <div className="relative overflow-hidden rounded-[24px] p-5 md:p-6 border border-white/10"
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)'
        }}
      >
        {/* Glow color based on theme selection */}
        <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-40 transition-all duration-500`}
          style={{
            background: themeColor === 'sky' ? '#38bdf8' :
                        themeColor === 'rose' ? '#f43f5e' :
                        themeColor === 'emerald' ? '#10b981' :
                        themeColor === 'amber' ? '#f59e0b' :
                        themeColor === 'purple' ? '#a855f7' : '#14b8a6'
          }}
        />

        <div className="relative flex flex-col md:flex-row items-center justify-between gap-5 z-10">
          <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-3xl shadow-inner border border-white/20 select-none overflow-hidden">
              {profilePic && profilePic.startsWith('data:image/') ? (
                <img src={profilePic} alt={currentUser.name} className="w-full h-full object-cover" />
              ) : (
                profilePic || '🐧'
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <h2 className="text-xl md:text-2xl font-extrabold font-display text-white tracking-tight">
                  Hi, {formatFriendlyName(currentUser.name)}!
                </h2>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold font-mono uppercase tracking-wider text-sky-300 border border-sky-400/30 bg-sky-500/10">
                  ONLINE
                </span>
                {onOpenWelcome && (
                  <button
                    onClick={onOpenWelcome}
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 transition-all flex items-center gap-1 cursor-pointer hover:scale-105"
                    title="View welcome greeting & fireworks!"
                  >
                    <PartyPopper className="w-3 h-3 text-amber-400" />
                    <span>Greeting</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-md font-light">
                Ready to watch films? Synchronize movies locally and sync controls in real-time.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {onOpenWelcome && (
              <button
                onClick={onOpenWelcome}
                className="px-3.5 py-2 text-xs font-bold text-amber-200 hover:text-white bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-pink-500/20 hover:from-amber-500/30 hover:to-pink-500/30 border border-amber-400/30 transition-all rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10 hover:scale-105 active:scale-95"
                title="View your personalized daily greeting & pop mini fireworks!"
              >
                <PartyPopper className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Daily Greeting 🎆</span>
              </button>
            )}

            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold text-sky-200 hover:text-white bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-400/30 transition-all rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/10 hover:scale-105 active:scale-95"
              title="Install Penguin View on Phone screen, Windows taskbar, or Mac dock"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span>Install App</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 cursor-pointer liquid-glass-button flex items-center gap-2"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Code Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  My Code: <span className="font-mono text-white text-xs">{currentUser.friendCode}</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* High-Fidelity Sliding Tab Controls */}
      <div className="flex items-center justify-center sm:justify-start gap-1.5 bg-white/5 border border-white/5 p-1 rounded-2xl max-w-md">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white shadow-lg border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
          }`}
        >
          <Clapperboard className="w-4 h-4 text-sky-200" />
          <span>Media Hub</span>
        </button>
        <button
          onClick={() => setActiveTab('watch')}
          className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'watch'
              ? 'bg-white/10 text-white shadow border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
          }`}
        >
          <Tv className="w-4 h-4 text-sky-400" />
          <span>Watch Rooms</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-white/10 text-white shadow border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
          }`}
        >
          <Settings className="w-4 h-4 text-indigo-400" />
          <span>Penguin Settings</span>
        </button>
      </div>

      {/* Conditional Rendering of Tabs */}
      {activeTab === 'catalog' ? (
        <div className="space-y-6">
          {/* Real-time Incoming Room Invites Banner */}
          <IncomingInvitesBanner
            currentUser={currentUser}
            onStartRoom={onStartRoom}
            onJoinRoom={onJoinRoom}
          />

          {/* Media Catalog Hub */}
          <MediaCatalog 
            currentUser={currentUser}
            onStartRoom={onStartRoom}
          />
        </div>
      ) : activeTab === 'watch' ? (
        <div className="space-y-6">

          {/* Real-time Incoming Room Invites Banner */}
          <IncomingInvitesBanner
            currentUser={currentUser}
            onStartRoom={onStartRoom}
            onJoinRoom={onJoinRoom}
          />
          
          {/* Section 1: Launch Sync Session & Snowy Join Form */}
          <LiquidGlassCard intensity="glass" className="border-sky-500/20 shadow-sky-500/5 p-5 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/5">
              
              {/* Left Side: Create / Launch Room */}
              <div className="space-y-3 pb-5 md:pb-0">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-sky-400" />
                    Launch Snowy Room
                  </h3>
                  <p className="text-[11px] text-slate-400 font-light leading-relaxed">
                    Start a fresh sync room. Give it a title and invite your friends to join with synced timeline controls!
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter movie title..."
                    className="px-3 py-2 text-xs text-slate-100 liquid-glass-input flex-grow font-sans"
                    value={customMovieName}
                    onChange={(e) => setCustomMovieName(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      const titleToUse = customMovieName.trim() || 'Untitled Sync Video';
                      onStartRoom(titleToUse);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-1 bg-gradient-to-r from-sky-400 to-indigo-500 border border-white/10 rounded-xl"
                  >
                    Start Room
                  </button>
                </div>
              </div>

              {/* Right Side: Join Existing Snowy Room */}
              <div className="space-y-3 pt-5 md:pt-0 md:pl-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
                    <Tv className="w-4 h-4 text-indigo-400 animate-pulse" />
                    Connect to Existing Room
                  </h3>
                  <p className="text-[11px] text-slate-400 font-light leading-relaxed">
                    Paste a room ID or a shared invitation URL from your friend to synchronize with their player instantly.
                  </p>
                </div>

                {joinRoomError && (
                  <p className="text-[10px] text-rose-300 bg-rose-950/20 border border-rose-500/20 px-2 py-1 rounded-lg animate-fade-in">
                    {joinRoomError}
                  </p>
                )}
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste room ID or full link..."
                    className="px-3 py-2 text-xs text-slate-100 liquid-glass-input flex-grow font-sans"
                    value={joinRoomIdInput}
                    onChange={(e) => {
                      setJoinRoomIdInput(e.target.value);
                      setJoinRoomError('');
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = joinRoomIdInput.trim();
                      if (!input) {
                        setJoinRoomError('Please provide a Room ID or URL');
                        return;
                      }

                      let finalRoomId = input;
                      // Extract room id from query parameter if pasting full link
                      try {
                        if (input.includes('?room=')) {
                          const urlObj = new URL(input);
                          const parsedId = urlObj.searchParams.get('room');
                          if (parsedId) {
                            finalRoomId = parsedId;
                          }
                        } else if (input.includes('/?room=')) {
                          const parts = input.split('?room=');
                          if (parts.length > 1) {
                            finalRoomId = parts[1].split('&')[0];
                          }
                        }
                      } catch (e) {
                        // treat as direct ID
                      }

                      if (!finalRoomId) {
                        setJoinRoomError('Could not extract Room ID from link');
                        return;
                      }

                      onJoinRoom(finalRoomId);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:opacity-95 active:scale-[0.98] transition-all flex items-center gap-1 bg-gradient-to-r from-indigo-500 to-purple-600 border border-white/10 rounded-xl whitespace-nowrap"
                  >
                    Enter snowy room
                  </button>
                </div>
              </div>

            </div>
          </LiquidGlassCard>

          {/* Section 2: Watch List Subtabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <button
              onClick={() => setWatchSubTab('personal')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                watchSubTab === 'personal'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              My Personal Watch List
            </button>

            <button
              onClick={() => setWatchSubTab('shared')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                watchSubTab === 'shared'
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              Collaborative Lists with Friends
            </button>
          </div>

          <LiquidGlassCard className="border-white/5">
            {watchSubTab === 'personal' ? (
              <WatchList 
                currentUser={currentUser} 
                selectedFriend={selectedFriend}
                onStartRoom={onStartRoom}
              />
            ) : (
              <SharedWatchLists
                currentUser={currentUser}
                friendsProfiles={friendsProfiles}
                onStartRoom={onStartRoom}
              />
            )}
          </LiquidGlassCard>

        </div>
      ) : (
        /* Settings Tab: Profile customization & friends hub */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          
          {/* Column 1: Edit Profile */}
          <LiquidGlassCard className="h-full">
            <h3 className="text-sm font-bold text-white font-display flex items-center gap-2 mb-3">
              <Palette className="w-4.5 h-4.5 text-sky-400" />
              Edit Profile & Accent
            </h3>

            {profileSuccess && (
              <div className="p-2 mb-4 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
                Profile updated successfully!
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">My Name</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Profile Picture Upload & Emoji Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <UserIcon className="w-3.5 h-3.5 text-sky-400" />
                    Profile Picture / Avatar
                  </label>
                  <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 border border-sky-400/20 rounded-md">
                    Max 1.5 MB
                  </span>
                </div>

                {profilePicError && (
                  <div className="p-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>{profilePicError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-3 rounded-2xl">
                  {/* Avatar Preview */}
                  <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl overflow-hidden shrink-0 shadow-md">
                    {profilePic && profilePic.startsWith('data:image/') ? (
                      <img src={profilePic} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      profilePic || '🐧'
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-grow">
                    <label htmlFor="profile-pic-file-input" className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95">
                      <Upload className="w-3.5 h-3.5 text-sky-300" />
                      <span>Upload Profile Photo</span>
                    </label>
                    <input
                      id="profile-pic-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePicFileChange}
                      className="hidden"
                    />

                    {profilePic && profilePic.startsWith('data:image/') && (
                      <button
                        type="button"
                        onClick={() => setProfilePic('🐧')}
                        className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer self-start"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove photo (Use Emoji)
                      </button>
                    )}
                  </div>
                </div>

                {/* Preset Emoji Options */}
                <div className="pt-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Or Choose Avatar Emoji</label>
                  <div className="grid grid-cols-6 gap-2">
                    {EMOJI_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setProfilePic(emoji)}
                        className={`text-xl p-1.5 rounded-xl border transition-all text-center flex items-center justify-center hover:scale-110 active:scale-95 cursor-pointer ${
                          profilePic === emoji 
                            ? 'bg-white/20 border-white/40 scale-105' 
                            : 'bg-white/5 border-transparent'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Custom Emoji / Symbol Option */}
                  <div className="mt-2.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type custom emoji (e.g. 🍿, ⚡)"
                        className="flex-grow px-3 py-1.5 text-xs text-slate-100 liquid-glass-input"
                        value={profilePic.startsWith('data:image/') ? '' : profilePic}
                        onChange={(e) => setProfilePic(e.target.value.substring(0, 4))}
                      />
                      <span className="text-lg px-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center select-none w-12 h-9 overflow-hidden">
                        {profilePic && profilePic.startsWith('data:image/') ? (
                          <img src={profilePic} alt="Avatar" className="w-full h-full object-cover rounded" />
                        ) : (
                          profilePic || '🐧'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Animated Background Themes */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Palette className="w-3.5 h-3.5 text-sky-400" />
                    Live Moving Background Theme
                  </label>
                  <span className="text-[10px] text-sky-300 font-mono">
                    Selected: {activeTheme}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {ANIMATED_THEMES.map((theme) => {
                    const Icon = theme.icon;
                    const isSelected = activeTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleSelectTheme(theme.id)}
                        className={`px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-sky-500/25 text-white border-sky-400 shadow-md shadow-sky-500/20 scale-[1.02]'
                            : 'bg-white/5 text-slate-400 hover:text-slate-200 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-300' : 'text-slate-400'}`} />
                        <span className="truncate text-[11px]">{theme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Background Image Upload (Max 1MB) */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    Custom Background Image
                  </label>
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 border border-amber-400/20 rounded-md">
                    Max 1.0 MB
                  </span>
                </div>

                {bgImageError && (
                  <div className="p-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    <span>{bgImageError}</span>
                  </div>
                )}

                {customBgImage ? (
                  <div className="relative rounded-2xl overflow-hidden border border-white/20 h-28 bg-cover bg-center flex items-end p-3 group"
                    style={{ backgroundImage: `url(${customBgImage})` }}
                  >
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                    <div className="relative z-10 flex items-center justify-between w-full">
                      <span className="text-[10px] text-white font-mono bg-black/60 px-2 py-1 rounded-md border border-white/20">
                        Custom Wallpaper Active
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomBgImage('')}
                        className="px-2.5 py-1 bg-rose-500/80 hover:bg-rose-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-md"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove Wallpaper
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-dashed border-white/15 p-3 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-slate-300 font-medium">No custom background image uploaded</p>
                    <p className="text-[10px] text-slate-400">Upload a crisp background image (Max 1MB) to customize your dashboard!</p>
                    <label htmlFor="bg-image-file-input" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95">
                      <Upload className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Choose Background Image</span>
                    </label>
                    <input
                      id="bg-image-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleBgImageFileChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              {/* Accent Theme Selection */}
              <div className="pt-2 border-t border-white/10">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Liquid Accent Color</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {THEME_PRESETS.map((theme) => (
                    <button
                      key={theme.name}
                      type="button"
                      onClick={() => setThemeColor(theme.name)}
                      className={`text-[10px] font-semibold py-1.5 px-2 rounded-xl border cursor-pointer transition-all ${
                        themeColor === theme.name 
                          ? theme.class + ' ring-2 ring-white/10 scale-[1.02]' 
                          : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 text-xs font-semibold text-white shadow-md active:scale-95 transition-all cursor-pointer text-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px'
                }}
              >
                {isSaving ? 'Saving Profile...' : 'Save Profile & Custom Theme'}
              </button>
            </form>
          </LiquidGlassCard>

          {/* Column 2: Notifications & Friends Hub */}
          <div className="space-y-6">
            
            {/* Device Push Notifications & Alerts */}
            <LiquidGlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-400" />
                  Push Notifications & Alerts
                </h3>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                    : notifPermission === 'denied'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-400/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                }`}>
                  {notifPermission === 'granted' ? 'Active / Granted' : notifPermission === 'denied' ? 'Blocked in Browser' : 'Prompt Required'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3.5 leading-relaxed">
                Receive instant pop-up alerts, vibrations, and audio chimes on your phone or laptop whenever friends send messages or invite you to watch.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {notifPermission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    className="px-3.5 py-2 text-xs font-bold text-sky-100 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-md shadow-sky-500/10"
                  >
                    <Bell className="w-3.5 h-3.5 text-sky-300" />
                    Enable Phone & Laptop Push Alerts
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="px-3.5 py-2 text-xs font-semibold text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
                    Test Notification Sound & Alert
                  </button>
                )}
              </div>
            </LiquidGlassCard>

            {/* Friends Code Share / Addition */}
            <LiquidGlassCard>
              <h3 className="text-sm font-bold text-white font-display flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-sky-400" />
                Add Friends
              </h3>
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                Enter a friend's unique code. Once added, friendship is fully bidirectional: you both immediately appear on each other's friends lists!
              </p>

              {friendError && (
                <div className="p-2 mb-3 text-xs text-rose-300 bg-rose-950/30 border border-rose-500/20 rounded-xl">
                  {friendError}
                </div>
              )}
              {friendSuccess && (
                <div className="p-2 mb-3 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-xl">
                  {friendSuccess}
                </div>
              )}

              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input
                  type="text"
                  placeholder="ABC123"
                  className="flex-grow px-3 py-2 text-xs text-center uppercase tracking-wider font-mono text-slate-100 liquid-glass-input"
                  value={friendCodeInput}
                  onChange={(e) => setFriendCodeInput(e.target.value)}
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={friendLoading}
                  className="px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition-all flex items-center justify-center cursor-pointer active:scale-95 text-xs"
                >
                  {friendLoading ? (
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Add Friend'
                  )}
                </button>
              </form>
            </LiquidGlassCard>

            {/* Friends List */}
            <LiquidGlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white font-display flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-sky-400" />
                  My Friends ({friendsProfiles.length})
                </h3>
                {selectedFriend && (
                  <button
                    onClick={() => {
                      setSelectedFriend(null);
                      setActiveTab('watch'); // direct them to watch tab to see list
                    }}
                    className="text-[10px] text-sky-300 hover:underline cursor-pointer"
                  >
                    View list in Watch Center
                  </button>
                )}
              </div>

              {friendsProfiles.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                  <Users className="w-6 h-6 mx-auto text-slate-600 mb-1.5 opacity-50" />
                  <p className="text-xs text-slate-400 font-medium">No friends added yet</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Share your code above with a friend to link lists!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {friendsProfiles.map((friend) => (
                    <div
                      key={friend.uid}
                      className={`w-full p-2.5 flex items-center justify-between rounded-2xl border text-left transition-all ${
                        selectedFriend?.uid === friend.uid
                          ? 'bg-white/15 border-white/25 shadow-md'
                          : 'bg-white/5 border-transparent hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-sm overflow-hidden shrink-0">
                          {friend.profilePic && friend.profilePic.startsWith('data:image/') ? (
                            <img src={friend.profilePic} alt={friend.name} className="w-full h-full object-cover" />
                          ) : (
                            friend.profilePic || '🐧'
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white line-clamp-1">{friend.name}</p>
                          <p className="text-[9px] text-slate-400 font-mono">Code: {friend.friendCode}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChatFriendId(friend.uid);
                            setIsChatOpen(true);
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded-xl hover:bg-amber-500/25 transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Chat & Invite</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFriend(friend);
                            setActiveTab('watch');
                          }}
                          className="text-[9px] text-sky-400 px-2 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/20 rounded-xl transition-all cursor-pointer"
                        >
                          Lists
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </LiquidGlassCard>

          </div>

        </div>
      )}

      {/* Floating Mini Chat Launcher Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 px-4 py-3 bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-600 hover:from-sky-300 hover:to-purple-500 text-white font-bold text-xs rounded-2xl shadow-2xl shadow-sky-500/30 border border-white/20 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 cursor-pointer animate-bounce-subtle"
        >
          <div className="relative">
            <MessageSquare className="w-4 h-4 text-white" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse shadow-md">
                {totalUnreadCount}
              </span>
            )}
          </div>
          <span className="font-display tracking-tight">Friend Chat & Invites</span>
        </button>
      )}

      {/* Mini Chat Box Drawer */}
      <MiniChatDrawer
        currentUser={currentUser}
        friendsProfiles={friendsProfiles}
        onStartRoom={onStartRoom}
        onJoinRoom={onJoinRoom}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        initialSelectedFriendId={selectedChatFriendId}
      />

      {/* Install App Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      {/* Footer Credentials */}
      <div className="text-center pt-6 border-t border-white/5 font-mono text-[9px] text-slate-500 flex items-center justify-center gap-1.5">
        <span>Penguin View Global Sync Web-app v1.3</span>
        <span>•</span>
        <span>Connected to Planet-Scale Firestore</span>
      </div>
    </div>
  );
};
