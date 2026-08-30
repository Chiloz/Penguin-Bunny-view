import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, DirectMessage, ChatThreadSettings } from '../types';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { 
  MessageSquare, 
  Send, 
  Tv, 
  X, 
  Users, 
  Plus, 
  Sparkles, 
  Play, 
  Check, 
  Film,
  User as UserIcon,
  Bell,
  Palette,
  Image as ImageIcon,
  Upload,
  Trash2,
  Smile,
  Flame,
  Droplets,
  Zap,
  Heart,
  Eye,
  Smartphone,
  Info
} from 'lucide-react';
import { 
  sendPushNotification, 
  requestNotificationPermission, 
  compressImageFile,
  isIOSDevice,
  isStandalonePWA
} from '../utils/notifications';

interface MiniChatDrawerProps {
  currentUser: UserProfile;
  friendsProfiles: UserProfile[];
  onStartRoom: (roomIdOrTitle: string) => void;
  isOpen: boolean;
  onClose: () => void;
  initialSelectedFriendId?: string | null;
  activeRoomId?: string;
  activeRoomVideoName?: string;
}

const QUICK_EMOJIS = ['❤️', '😂', '🔥', '😮', '😢', '👏', '🐧', '🍿'];

const CHAT_THEMES = [
  { 
    id: 'liquid', 
    label: 'Liquid Smooth', 
    icon: Droplets, 
    bgClass: 'bg-gradient-to-b from-[#09152b] via-[#0e2142] to-[#081020]',
    accentGlow: 'rgba(14, 165, 233, 0.25)',
    bubbleMeClass: 'bg-sky-500 text-white shadow-sky-500/25',
    bubbleFriendClass: 'bg-[#182949]/90 text-slate-100 border-sky-400/20'
  },
  { 
    id: 'bubbles', 
    label: 'Bouncing Bubbles', 
    icon: Sparkles, 
    bgClass: 'bg-gradient-to-b from-[#061838] via-[#0c2e6b] to-[#040f26]',
    accentGlow: 'rgba(56, 189, 248, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white shadow-sky-400/30',
    bubbleFriendClass: 'bg-[#0f2452]/90 text-slate-100 border-sky-400/30'
  },
  { 
    id: 'fire', 
    label: 'Burning Fire', 
    icon: Flame, 
    bgClass: 'bg-gradient-to-b from-[#2e0909] via-[#4d1010] to-[#1a0505]',
    accentGlow: 'rgba(239, 68, 68, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-rose-500/30',
    bubbleFriendClass: 'bg-[#3b1212]/90 text-slate-100 border-rose-500/30'
  },
  { 
    id: 'cyber', 
    label: 'Cyber Matrix', 
    icon: Zap, 
    bgClass: 'bg-gradient-to-b from-[#032117] via-[#063828] to-[#02140e]',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-medium shadow-emerald-400/30',
    bubbleFriendClass: 'bg-[#0a291f]/90 text-emerald-100 border-emerald-400/30'
  },
  { 
    id: 'emerald', 
    label: 'Lush Emerald', 
    icon: Heart, 
    bgClass: 'bg-gradient-to-b from-[#06241b] via-[#0a4030] to-[#03140f]',
    accentGlow: 'rgba(20, 184, 166, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-teal-500/30',
    bubbleFriendClass: 'bg-[#0d3326]/90 text-slate-100 border-teal-400/25'
  },
  { 
    id: 'gold', 
    label: 'Royal Gold', 
    icon: Sparkles, 
    bgClass: 'bg-gradient-to-b from-[#2b2106] via-[#47360a] to-[#171103]',
    accentGlow: 'rgba(245, 158, 11, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 font-bold shadow-amber-400/30',
    bubbleFriendClass: 'bg-[#362908]/90 text-amber-100 border-amber-400/30'
  },
  { 
    id: 'orange', 
    label: 'Sunset Orange', 
    icon: Flame, 
    bgClass: 'bg-gradient-to-b from-[#301605] via-[#522409] to-[#1c0c03]',
    accentGlow: 'rgba(249, 115, 22, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/30',
    bubbleFriendClass: 'bg-[#3d1c08]/90 text-slate-100 border-orange-400/30'
  },
  { 
    id: 'silver', 
    label: 'Platinum Silver', 
    icon: Eye, 
    bgClass: 'bg-gradient-to-b from-[#181e29] via-[#283245] to-[#0f131a]',
    accentGlow: 'rgba(203, 213, 225, 0.25)',
    bubbleMeClass: 'bg-gradient-to-r from-slate-200 to-slate-400 text-slate-900 font-bold shadow-slate-300/20',
    bubbleFriendClass: 'bg-[#1f2838]/90 text-slate-100 border-slate-400/20'
  },
  { 
    id: 'sky', 
    label: 'Midnight Sky', 
    icon: Eye, 
    bgClass: 'bg-gradient-to-b from-[#0c142b] via-[#14234f] to-[#060a17]',
    accentGlow: 'rgba(99, 102, 241, 0.35)',
    bubbleMeClass: 'bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-indigo-500/30',
    bubbleFriendClass: 'bg-[#182347]/90 text-slate-100 border-indigo-400/25'
  }
];

export const MiniChatDrawer: React.FC<MiniChatDrawerProps> = ({
  currentUser,
  friendsProfiles,
  onStartRoom,
  isOpen,
  onClose,
  initialSelectedFriendId = null,
  activeRoomId,
  activeRoomVideoName
}) => {
  const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteVideoTitle, setInviteVideoTitle] = useState(activeRoomVideoName || 'Sync Movie Watch');
  const [inviteCustomNote, setInviteCustomNote] = useState('Come watch with me! 🍿');
  const [customRoomId, setCustomRoomId] = useState(activeRoomId || '');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{ [friendUid: string]: number }>({});
  
  // Custom Background & Theme Customizer Modal State
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatThreadSettings | null>(null);
  const [bgImageError, setBgImageError] = useState<string>('');
  const [isUploadingBg, setIsUploadingBg] = useState<boolean>(false);
  
  // Active reaction picker on message
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [lastTapTimeRef, setLastTapTimeRef] = useState<{ [msgId: string]: number }>({});
  
  // Typing state
  const [isFriendTyping, setIsFriendTyping] = useState<boolean>(false);
  const lastTypingSentRef = useRef<number>(0);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Notification status
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef<boolean>(true);

  // Derive conversation thread ID between currentUser and selectedFriend
  const getThreadId = () => {
    if (!selectedFriend || !currentUser.uid) return '';
    return [currentUser.uid, selectedFriend.uid].sort().join('_');
  };

  // Auto select initial friend or first friend if none selected
  useEffect(() => {
    if (initialSelectedFriendId) {
      const found = friendsProfiles.find(f => f.uid === initialSelectedFriendId);
      if (found) setSelectedFriend(found);
    } else if (!selectedFriend && friendsProfiles.length > 0) {
      setSelectedFriend(friendsProfiles[0]);
    }
  }, [initialSelectedFriendId, friendsProfiles]);

  // Request push notification permission
  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      sendPushNotification("Penguin View Notifications Enabled! 🍿", {
        body: "You'll now receive alerts when friends message you or send room invites."
      });
    }
  };

  // Listen for unread / incoming messages across all friends for unread badges & push notifications
  useEffect(() => {
    if (!currentUser.uid) return;

    const q = query(
      collection(db, 'direct_messages'),
      where('recipientId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: { [friendUid: string]: number } = {};
      
      snapshot.docs.forEach(d => {
        const data = d.data() as DirectMessage;
        const msgId = d.id;

        if (!data.isRead) {
          counts[data.senderId] = (counts[data.senderId] || 0) + 1;
        }

        // Push notification for brand-new incoming messages
        if (!initialLoadRef.current && !seenMessageIdsRef.current.has(msgId) && !data.isRead) {
          seenMessageIdsRef.current.add(msgId);
          
          sendPushNotification(`💬 ${data.senderName}`, {
            body: data.isInvite ? `🍿 Room Invite: "${data.roomVideoName || 'Movie Watch'}" - ${data.text}` : data.text,
            tag: msgId,
            onClick: () => {
              const friend = friendsProfiles.find(f => f.uid === data.senderId);
              if (friend) setSelectedFriend(friend);
            }
          });
        } else {
          seenMessageIdsRef.current.add(msgId);
        }
      });

      setUnreadCounts(counts);
      initialLoadRef.current = false;
    });

    return () => unsubscribe();
  }, [currentUser.uid, friendsProfiles]);

  // Real-time listener for shared Chat Settings (Background Wallpaper & Theme) + Typing Status
  useEffect(() => {
    const threadId = getThreadId();
    if (!threadId) {
      setChatSettings(null);
      setIsFriendTyping(false);
      return;
    }

    const docRef = doc(db, 'chat_settings', threadId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ChatThreadSettings;
        setChatSettings(data);

        // Check if friend is typing
        if (selectedFriend) {
          const friendTypingUntil = (data as any)[`typing_${selectedFriend.uid}`] || 0;
          setIsFriendTyping(friendTypingUntil > Date.now());
        }
      } else {
        setChatSettings(null);
        setIsFriendTyping(false);
      }
    });

    // Check typing expiration interval
    const interval = setInterval(() => {
      if (chatSettings && selectedFriend) {
        const friendTypingUntil = (chatSettings as any)[`typing_${selectedFriend.uid}`] || 0;
        setIsFriendTyping(friendTypingUntil > Date.now());
      }
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [selectedFriend, currentUser.uid]);

  // Real-time listener for chat messages with selected friend
  useEffect(() => {
    if (!currentUser.uid || !selectedFriend) {
      setMessages([]);
      return;
    }

    const q1 = query(
      collection(db, 'direct_messages'),
      where('senderId', 'in', [currentUser.uid, selectedFriend.uid]),
      where('recipientId', 'in', [currentUser.uid, selectedFriend.uid])
    );

    const unsubscribe = onSnapshot(q1, (snapshot) => {
      const msgs: DirectMessage[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as DirectMessage));

      // Sort by timestamp on client
      msgs.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return tA - tB;
      });

      setMessages(msgs);

      // Mark incoming messages as read
      snapshot.docs.forEach(async (d) => {
        const data = d.data();
        if (data.recipientId === currentUser.uid && !data.isRead) {
          try {
            await updateDoc(doc(db, 'direct_messages', d.id), { isRead: true });
          } catch (err) {
            console.error("Error marking read:", err);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [currentUser.uid, selectedFriend]);

  // Auto scroll to bottom when new messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isFriendTyping]);

  // Handle typing activity update
  const handleInputChange = (val: string) => {
    setTextInput(val);
    const threadId = getThreadId();
    if (!threadId || !selectedFriend || !currentUser.uid) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      setDoc(doc(db, 'chat_settings', threadId), {
        threadId,
        [`typing_${currentUser.uid}`]: Date.now() + 3500,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(() => {});
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setDoc(doc(db, 'chat_settings', threadId), {
        [`typing_${currentUser.uid}`]: 0
      }, { merge: true }).catch(() => {});
    }, 3000);
  };

  // Clear typing status on submit
  const clearTypingStatus = () => {
    const threadId = getThreadId();
    if (!threadId || !currentUser.uid) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setDoc(doc(db, 'chat_settings', threadId), {
      [`typing_${currentUser.uid}`]: 0
    }, { merge: true }).catch(() => {});
  };

  // Send standard text message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !selectedFriend) return;

    const messageText = textInput.trim();
    setTextInput('');
    clearTypingStatus();

    try {
      await addDoc(collection(db, 'direct_messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderPic: currentUser.profilePic || '',
        recipientId: selectedFriend.uid,
        text: messageText,
        isInvite: false,
        isRead: false,
        timestamp: serverTimestamp(),
        reactions: {}
      });
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Toggle Message Reaction
  const handleToggleReaction = async (messageId: string, emoji: string, currentReactions?: { [emoji: string]: string[] }) => {
    const reactions = { ...(currentReactions || {}) };
    const rawUids = reactions[emoji];
    const uids = Array.isArray(rawUids) ? [...rawUids] : [];
    
    const userIdx = uids.indexOf(currentUser.uid);
    if (userIdx >= 0) {
      uids.splice(userIdx, 1);
    } else {
      uids.push(currentUser.uid);
    }

    if (uids.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = uids;
    }

    setReactionPickerMsgId(null);

    try {
      await updateDoc(doc(db, 'direct_messages', messageId), {
        reactions: reactions
      });
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  };

  // Handle double-tap to react ❤️ on mobile
  const handleBubbleClick = (msg: DirectMessage) => {
    const now = Date.now();
    const lastTap = lastTapTimeRef[msg.id] || 0;
    if (now - lastTap < 320) {
      // Double tap detected!
      handleToggleReaction(msg.id, '❤️', msg.reactions);
    } else {
      // Single tap -> toggle reaction picker
      setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id);
    }
    setLastTapTimeRef(prev => ({ ...prev, [msg.id]: now }));
  };

  // Handle Shared Chat Background Image Upload (< 1MB)
  const handleBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBgImageError('');
    setIsUploadingBg(true);

    try {
      // Strictly enforced < 1MB limit & lightweight compression
      const compressedDataUrl = await compressImageFile(file, 1280, 720, 0.78);
      const threadId = getThreadId();

      if (!threadId) throw new Error("Conversation thread not initialized.");

      await setDoc(doc(db, 'chat_settings', threadId), {
        threadId,
        customBgImage: compressedDataUrl,
        theme: 'custom',
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByName: currentUser.name
      }, { merge: true });

      setIsUploadingBg(false);
    } catch (err: any) {
      console.error("Chat bg upload error:", err);
      setBgImageError(err.message || 'Failed to upload background image.');
      setIsUploadingBg(false);
    }
  };

  // Remove Shared Chat Wallpaper
  const handleRemoveBgImage = async () => {
    const threadId = getThreadId();
    if (!threadId) return;

    try {
      await setDoc(doc(db, 'chat_settings', threadId), {
        customBgImage: '',
        theme: 'liquid',
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByName: currentUser.name
      }, { merge: true });
    } catch (err) {
      console.error("Error removing chat bg:", err);
    }
  };

  // Select Shared Chat Theme
  const handleSelectChatTheme = async (themeId: string) => {
    const threadId = getThreadId();
    if (!threadId) return;

    try {
      await setDoc(doc(db, 'chat_settings', threadId), {
        theme: themeId,
        customBgImage: '',
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        updatedByName: currentUser.name
      }, { merge: true });
    } catch (err) {
      console.error("Error setting chat theme:", err);
    }
  };

  // Send direct room invitation
  const handleSendRoomInvite = async () => {
    if (!selectedFriend) return;

    setIsSendingInvite(true);
    try {
      const finalRoomId = customRoomId.trim() || activeRoomId || `room-${Date.now().toString(36)}`;
      const videoName = inviteVideoTitle.trim() || 'Sync Movie Session';
      const customText = inviteCustomNote.trim() || `🍿 Hey! I'm inviting you to watch "${videoName}" together in a sync room!`;

      // 1. Post to direct_messages
      await addDoc(collection(db, 'direct_messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderPic: currentUser.profilePic || '',
        recipientId: selectedFriend.uid,
        text: customText,
        isInvite: true,
        roomId: finalRoomId,
        roomVideoName: videoName,
        isRead: false,
        timestamp: serverTimestamp(),
        reactions: {}
      });

      // 2. Post to invites collection for Dashboard banner
      await addDoc(collection(db, 'invites'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderPic: currentUser.profilePic || '',
        recipientId: selectedFriend.uid,
        roomId: finalRoomId,
        videoName: videoName,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setIsInviteModalOpen(false);
      setIsSendingInvite(false);
    } catch (err) {
      console.error("Error sending room invite:", err);
      setIsSendingInvite(false);
    }
  };

  if (!isOpen) return null;

  // Active theme configuration
  const currentThemeId = chatSettings?.customBgImage ? 'custom' : (chatSettings?.theme || 'liquid');
  const activeThemeConfig = CHAT_THEMES.find(t => t.id === currentThemeId) || CHAT_THEMES[0];

  // Background styling for Chat Stream based on shared chat settings
  const getChatStreamBackgroundStyle = () => {
    if (chatSettings?.customBgImage) {
      return {
        backgroundImage: `linear-gradient(rgba(10, 14, 26, 0.65), rgba(10, 14, 26, 0.82)), url(${chatSettings.customBgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    return {};
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[94vw] sm:w-[440px] h-[600px] max-h-[88vh] bg-[#0c101d]/95 backdrop-blur-2xl border border-sky-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300 font-sans">
      
      {/* Drawer Header */}
      <div className="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white font-display flex items-center gap-1.5">
              Friend Mini Chat & Sync
            </h3>
            <p className="text-[10px] text-slate-400">Synced wallpaper, reactions & 1-click room invites</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Notification permission prompt if not enabled */}
          {notifPermission !== 'granted' && (
            <button
              onClick={handleEnableNotifications}
              className="p-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="Enable Push Notifications on Phone & Laptop"
            >
              <Bell className="w-3.5 h-3.5 animate-bounce" />
              <span className="hidden sm:inline">Enable Alerts</span>
            </button>
          )}

          {selectedFriend && (
            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 transition-all cursor-pointer"
              title="Change Shared Chat Background & Theme"
            >
              <Palette className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Friends Selector Bar */}
      {friendsProfiles.length > 0 ? (
        <div className="px-3 py-2 bg-black/25 border-b border-white/5 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {friendsProfiles.map((f) => {
            const isSelected = selectedFriend?.uid === f.uid;
            const unread = unreadCounts[f.uid] || 0;

            return (
              <button
                key={f.uid}
                onClick={() => {
                  setSelectedFriend(f);
                  setReactionPickerMsgId(null);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 shrink-0 transition-all cursor-pointer border relative ${
                  isSelected
                    ? 'bg-sky-500/20 text-white border-sky-400/50 shadow-md shadow-sky-500/10'
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                <div className="w-5 h-5 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-xs overflow-hidden shrink-0">
                  {f.profilePic && f.profilePic.startsWith('data:image/') ? (
                    <img src={f.profilePic} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    f.profilePic || '🐧'
                  )}
                </div>
                <span className="truncate max-w-[90px]">{f.name}</span>

                {unread > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 animate-pulse">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-center">
          <p className="text-[11px] text-amber-300 font-medium">No friends added yet!</p>
          <p className="text-[10px] text-slate-400">Add friends using friend codes in your dashboard to chat and send invites.</p>
        </div>
      )}

      {/* Main Chat Stream Container */}
      {selectedFriend ? (
        <div 
          className={`flex-1 p-3 overflow-y-auto space-y-3.5 scrollbar-thin relative transition-all ${
            chatSettings?.customBgImage ? '' : activeThemeConfig.bgClass
          }`}
          style={getChatStreamBackgroundStyle()}
          onClick={() => setReactionPickerMsgId(null)}
        >
          {/* Subtle Ambient Radial Glow overlay for active theme */}
          {!chatSettings?.customBgImage && (
            <div 
              className="absolute inset-0 pointer-events-none transition-all duration-700 opacity-60"
              style={{
                background: `radial-gradient(circle at 50% 20%, ${activeThemeConfig.accentGlow} 0%, transparent 70%)`
              }}
            />
          )}

          {/* Header pill in chat */}
          <div className="flex items-center justify-between px-1 relative z-10">
            <span className="text-[10px] text-slate-300 font-mono bg-black/50 px-2.5 py-0.5 rounded-full border border-white/15 backdrop-blur-md">
              💬 With {selectedFriend.name}
            </span>

            {chatSettings?.customBgImage ? (
              <span className="text-[9px] text-emerald-300 font-mono bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1 backdrop-blur-md">
                <ImageIcon className="w-2.5 h-2.5" />
                Shared Wallpaper
              </span>
            ) : (
              <span className="text-[9px] text-sky-300 font-mono bg-black/50 px-2.5 py-0.5 rounded-full border border-white/15 flex items-center gap-1 backdrop-blur-md">
                <Palette className="w-2.5 h-2.5 text-sky-400" />
                Theme: {activeThemeConfig.label}
              </span>
            )}
          </div>

          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-2 relative z-10">
              <Sparkles className="w-7 h-7 text-sky-400 mx-auto opacity-70 animate-pulse" />
              <p className="text-xs text-slate-200 font-semibold">No messages yet with {selectedFriend.name}.</p>
              <p className="text-[11px] text-slate-300 max-w-[260px] mx-auto">Say hello! Tap messages to add emoji reactions, or pick a shared theme!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.uid;
              const isPickerOpen = reactionPickerMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`w-full flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1 relative group z-10`}
                >
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[9px] text-slate-400 font-medium">{isMe ? 'You' : msg.senderName}</span>
                  </div>

                  {msg.isInvite ? (
                    /* Sync Watch Room Invite Card */
                    <div className={`p-3.5 rounded-2xl w-full max-w-[88%] sm:max-w-[80%] border space-y-2.5 shadow-lg backdrop-blur-md ${
                      isMe 
                        ? 'bg-gradient-to-br from-indigo-900/90 to-sky-900/90 border-sky-400/40 text-white'
                        : 'bg-gradient-to-br from-slate-900/95 to-indigo-950/95 border-indigo-400/40 text-white'
                    }`}>
                      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                        <div className="p-1.5 bg-sky-500/20 text-sky-300 rounded-lg">
                          <Film className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider font-bold text-sky-300 font-mono">
                            SYNC ROOM INVITE
                          </span>
                          <h4 className="text-xs font-bold text-white line-clamp-1">{msg.roomVideoName || 'Movie Watch'}</h4>
                        </div>
                      </div>

                      <p className="text-xs text-slate-200 font-sans leading-snug break-normal [overflow-wrap:anywhere]">{msg.text}</p>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-slate-300 bg-white/5 px-2 py-1 rounded-md border border-white/10 truncate max-w-[120px]">
                          ID: {msg.roomId}
                        </div>

                        <button
                          onClick={() => {
                            if (msg.roomId) {
                              onStartRoom(msg.roomId);
                              onClose();
                            }
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-sky-400 to-indigo-500 hover:from-sky-300 hover:to-indigo-400 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Join Room
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Regular Text Bubble - Bulletproof width and wrapping */
                    <div className={`relative flex items-center gap-1.5 max-w-[85%] sm:max-w-[78%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div
                        onClick={() => handleBubbleClick(msg)}
                        className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-normal [overflow-wrap:anywhere] inline-block w-auto min-w-[48px] shadow-md transition-all select-text cursor-pointer active:scale-[0.98] ${
                          isMe
                            ? `${activeThemeConfig.bubbleMeClass} rounded-br-none`
                            : `${activeThemeConfig.bubbleFriendClass} rounded-bl-none border backdrop-blur-md`
                        }`}
                        title="Double-tap for ❤️ or tap for reactions"
                      >
                        {msg.text}
                      </div>

                      {/* Accessible Smile Reaction Button for Mobile Touch and Desktop */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReactionPickerMsgId(isPickerOpen ? null : msg.id);
                        }}
                        className="p-1 rounded-full bg-black/40 hover:bg-black/70 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0 opacity-70 hover:opacity-100"
                        title="Add emoji reaction"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Reaction Badges List */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(msg.reactions).map(([emoji, rawUids]) => {
                        const uids = Array.isArray(rawUids) ? rawUids : [];
                        if (uids.length === 0) return null;
                        const hasReacted = uids.includes(currentUser.uid);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReaction(msg.id, emoji, msg.reactions);
                            }}
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border transition-all cursor-pointer backdrop-blur-md active:scale-95 ${
                              hasReacted
                                ? 'bg-sky-500/35 border-sky-400 text-white shadow-sm shadow-sky-500/30 scale-105'
                                : 'bg-black/60 border-white/20 text-slate-300 hover:bg-white/10'
                            }`}
                            title={`${uids.length} reaction${uids.length > 1 ? 's' : ''}`}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] font-bold font-mono">{uids.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Emoji Reaction Popover Bar */}
                  {isPickerOpen && (
                    <div 
                      className={`relative z-30 my-1 flex items-center gap-1 bg-[#121829]/95 border border-sky-400/40 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150 ${
                        isMe ? 'self-end' : 'self-start'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleToggleReaction(msg.id, emoji, msg.reactions)}
                          className="p-1 hover:scale-130 active:scale-90 transition-transform text-base cursor-pointer rounded-lg hover:bg-white/10"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Typing Feedback Bubble */}
          {isFriendTyping && selectedFriend && (
            <div className="flex items-center gap-2 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-200 relative z-10">
              <div className="w-6 h-6 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-xs overflow-hidden shrink-0">
                {selectedFriend.profilePic && selectedFriend.profilePic.startsWith('data:image/') ? (
                  <img src={selectedFriend.profilePic} alt={selectedFriend.name} className="w-full h-full object-cover" />
                ) : (
                  selectedFriend.profilePic || '🐧'
                )}
              </div>
              <div className="px-3 py-2 rounded-2xl rounded-bl-none bg-[#182033]/90 backdrop-blur-md border border-sky-400/30 flex items-center gap-1.5 shadow-md">
                <span className="text-[10px] text-slate-300 font-medium mr-1">{selectedFriend.name} is typing</span>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400">
          <p className="text-xs">Select a friend above to start chatting and sending invitations.</p>
        </div>
      )}

      {/* Input Footer & Invite Launcher */}
      {selectedFriend && (
        <div className="p-3 bg-white/5 border-t border-white/10 space-y-2 shrink-0 backdrop-blur-md">
          
          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-200 border border-amber-400/30 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Tv className="w-3.5 h-3.5 text-amber-300" />
              <span>🍿 Send Room Invite</span>
            </button>

            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer font-semibold"
            >
              <Palette className="w-3 h-3" />
              <span>Shared Theme & Wallpaper</span>
            </button>
          </div>

          {/* Standard Text Chat Form */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              placeholder={`Message ${selectedFriend.name}...`}
              className="px-3 py-2 text-xs text-slate-100 liquid-glass-input flex-grow"
              value={textInput}
              onChange={(e) => handleInputChange(e.target.value)}
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="px-3.5 py-2 bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 disabled:opacity-40 disabled:hover:from-sky-400 disabled:hover:to-indigo-600 text-white rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/20 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Shared Chat Wallpaper & Theme Customizer Modal Overlay */}
      {isThemeModalOpen && selectedFriend && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-xl p-4 z-50 flex flex-col justify-between overflow-y-auto animate-in fade-in duration-200">
          <div className="space-y-4">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-sky-500/20 text-sky-300 rounded-xl">
                  <Palette className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white font-display">Shared Chat Wallpaper & Theme</h4>
                  <p className="text-[10px] text-slate-400">Updates simultaneously for both you & {selectedFriend.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsThemeModalOpen(false)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inbuilt Visual Themes Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                  <Palette className="w-3.5 h-3.5 text-sky-400" />
                  Inbuilt Moving & Color Themes
                </label>
                <span className="text-[10px] text-sky-300 font-mono">
                  Active: {activeThemeConfig.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Click any theme below to instantly transform the chat backdrop and bubble styling in real-time.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                {CHAT_THEMES.map((theme) => {
                  const Icon = theme.icon;
                  const isSelected = (!chatSettings?.customBgImage && chatSettings?.theme === theme.id) || (!chatSettings?.theme && !chatSettings?.customBgImage && theme.id === 'liquid');

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleSelectChatTheme(theme.id)}
                      className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${theme.bgClass} ${
                        isSelected
                          ? 'border-sky-400 ring-2 ring-sky-400/50 shadow-lg shadow-sky-500/20 text-white scale-[1.02]'
                          : 'border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-300 animate-pulse' : 'text-slate-400'}`} />
                      <span className="truncate text-[11px]">{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Background Image Upload Option (< 1MB) */}
            <div className="space-y-2 bg-white/5 p-3 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  Or Custom Background Photo
                </label>
                <span className="text-[9px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 border border-amber-400/20 rounded-md">
                  Strictly &lt; 1.0 MB
                </span>
              </div>

              {bgImageError && (
                <div className="p-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>{bgImageError}</span>
                </div>
              )}

              {chatSettings?.customBgImage ? (
                <div 
                  className="relative rounded-2xl overflow-hidden border border-white/20 h-28 bg-cover bg-center flex items-end p-3"
                  style={{ backgroundImage: `url(${chatSettings.customBgImage})` }}
                >
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                  <div className="relative z-10 flex items-center justify-between w-full">
                    <span className="text-[10px] text-white font-mono bg-black/60 px-2 py-1 rounded-md border border-white/20">
                      Active for both users
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveBgImage}
                      className="px-2.5 py-1 bg-rose-500/80 hover:bg-rose-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-md"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove Wallpaper
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-3 border border-dashed border-white/15 rounded-xl space-y-2">
                  <p className="text-[11px] text-slate-300">Upload a personal photo from your device for this chat stream.</p>
                  <label 
                    htmlFor="chat-bg-upload-input" 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 text-sky-200 border border-sky-400/30 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-300" />
                    <span>{isUploadingBg ? 'Compressing & Syncing...' : 'Upload Image (Max 1MB)'}</span>
                  </label>
                  <input
                    id="chat-bg-upload-input"
                    type="file"
                    accept="image/*"
                    onChange={handleBgImageUpload}
                    className="hidden"
                  />
                </div>
              )}
            </div>

          </div>

          <div className="pt-3 border-t border-white/10">
            <button
              onClick={() => setIsThemeModalOpen(false)}
              className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all"
            >
              Done & Save
            </button>
          </div>
        </div>
      )}

      {/* Send Room Invite Modal Overlay inside Drawer */}
      {isInviteModalOpen && selectedFriend && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md p-4 z-50 flex flex-col justify-center animate-in fade-in duration-200">
          <div className="bg-[#121829] border border-sky-400/30 rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white font-display">Invite {selectedFriend.name} to Watch</h4>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-300">
              Send an instant invitation card directly to {selectedFriend.name}'s chat & dashboard with a 1-click Join button!
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Movie / Video Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inception, Avatar, Anime Episode 1..."
                  className="px-3 py-2 text-xs text-slate-100 liquid-glass-input w-full"
                  value={inviteVideoTitle}
                  onChange={(e) => setInviteVideoTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Short Note / Text to Friend
                </label>
                <input
                  type="text"
                  placeholder="e.g. Come watch with me! 🍿"
                  className="px-3 py-2 text-xs text-slate-100 liquid-glass-input w-full"
                  value={inviteCustomNote}
                  onChange={(e) => setInviteCustomNote(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Sync Room ID (Optional or leave auto-generated)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to create a new room automatically"
                  className="px-3 py-2 text-xs text-slate-100 liquid-glass-input w-full font-mono"
                  value={customRoomId}
                  onChange={(e) => setCustomRoomId(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendRoomInvite}
                disabled={isSendingInvite}
                className="px-4 py-2 bg-gradient-to-r from-sky-400 to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md hover:scale-105 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingInvite ? 'Sending Invite...' : 'Send Invite Now'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
