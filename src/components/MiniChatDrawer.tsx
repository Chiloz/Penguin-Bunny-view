import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, DirectMessage } from '../types';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  updateDoc
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
  Bell
} from 'lucide-react';

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
  const [customRoomId, setCustomRoomId] = useState(activeRoomId || '');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{ [friendUid: string]: number }>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto select initial friend or first friend if none selected
  useEffect(() => {
    if (initialSelectedFriendId) {
      const found = friendsProfiles.find(f => f.uid === initialSelectedFriendId);
      if (found) setSelectedFriend(found);
    } else if (!selectedFriend && friendsProfiles.length > 0) {
      setSelectedFriend(friendsProfiles[0]);
    }
  }, [initialSelectedFriendId, friendsProfiles]);

  // Listen for unread / incoming messages across all friends
  useEffect(() => {
    if (!currentUser.uid) return;

    const q = query(
      collection(db, 'direct_messages'),
      where('recipientId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: { [friendUid: string]: number } = {};
      snapshot.docs.forEach(d => {
        const data = d.data();
        if (!data.isRead) {
          counts[data.senderId] = (counts[data.senderId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  // Real-time listener for chat messages with selected friend
  useEffect(() => {
    if (!currentUser.uid || !selectedFriend) {
      setMessages([]);
      return;
    }

    // Query messages sent from selectedFriend to currentUser OR currentUser to selectedFriend
    const q1 = query(
      collection(db, 'direct_messages'),
      where('senderId', 'in', [currentUser.uid, selectedFriend.uid]),
      where('recipientId', 'in', [currentUser.uid, selectedFriend.uid])
    );

    const unsubscribe = onSnapshot(q1, (snapshot) => {
      const msgs: DirectMessage[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DirectMessage));

      // Sort by timestamp on client to handle unsynced indexes
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

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send standard text message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !selectedFriend) return;

    const messageText = textInput.trim();
    setTextInput('');

    try {
      await addDoc(collection(db, 'direct_messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderPic: currentUser.profilePic || '',
        recipientId: selectedFriend.uid,
        text: messageText,
        isInvite: false,
        isRead: false,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Send direct room invitation
  const handleSendRoomInvite = async () => {
    if (!selectedFriend) return;

    setIsSendingInvite(true);
    try {
      const finalRoomId = customRoomId.trim() || activeRoomId || `room-${Date.now().toString(36)}`;
      const videoName = inviteVideoTitle.trim() || 'Sync Movie Session';

      // 1. Post to direct_messages
      await addDoc(collection(db, 'direct_messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.name,
        senderPic: currentUser.profilePic || '',
        recipientId: selectedFriend.uid,
        text: `🍿 Hey! I'm inviting you to watch "${videoName}" together in a sync room!`,
        isInvite: true,
        roomId: finalRoomId,
        roomVideoName: videoName,
        isRead: false,
        timestamp: serverTimestamp()
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

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[92vw] sm:w-[420px] h-[560px] max-h-[85vh] bg-[#0c101d]/95 backdrop-blur-xl border border-sky-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
      
      {/* Drawer Header */}
      <div className="p-3.5 bg-white/5 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white font-display flex items-center gap-1.5">
              Friend Mini Chat & Invites
            </h3>
            <p className="text-[10px] text-slate-400">Instant direct messages & 1-click room invites</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Friends Selector Bar */}
      {friendsProfiles.length > 0 ? (
        <div className="px-3 py-2 bg-black/20 border-b border-white/5 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {friendsProfiles.map((f) => {
            const isSelected = selectedFriend?.uid === f.uid;
            const unread = unreadCounts[f.uid] || 0;

            return (
              <button
                key={f.uid}
                onClick={() => setSelectedFriend(f)}
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

      {/* Main Chat Stream */}
      {selectedFriend ? (
        <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-black/10 scrollbar-thin">
          <div className="text-center py-2">
            <span className="text-[10px] text-slate-500 font-mono bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
              Chatting with {selectedFriend.name}
            </span>
          </div>

          {messages.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Sparkles className="w-6 h-6 text-sky-400 mx-auto opacity-50" />
              <p className="text-xs text-slate-400">No messages yet with {selectedFriend.name}.</p>
              <p className="text-[11px] text-slate-500">Say hi or send a 1-click room invite below!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.uid;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[9px] text-slate-400 font-medium">{isMe ? 'You' : msg.senderName}</span>
                  </div>

                  {msg.isInvite ? (
                    /* Sync Watch Room Invite Card */
                    <div className={`p-3.5 rounded-2xl max-w-[85%] border space-y-2.5 shadow-lg ${
                      isMe 
                        ? 'bg-gradient-to-br from-indigo-900/60 to-sky-900/60 border-sky-400/40 text-white'
                        : 'bg-gradient-to-br from-slate-900/90 to-indigo-950/90 border-indigo-400/40 text-white'
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

                      <p className="text-xs text-slate-200 font-sans leading-snug">{msg.text}</p>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-slate-300 bg-white/5 px-2 py-1 rounded-md border border-white/10 truncate max-w-[140px]">
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
                    /* Regular Text Bubble */
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs max-w-[80%] leading-relaxed ${
                        isMe
                          ? 'bg-sky-500 text-white rounded-br-none shadow-md shadow-sky-500/20'
                          : 'bg-white/10 text-slate-100 rounded-bl-none border border-white/10'
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              );
            })
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
        <div className="p-3 bg-white/5 border-t border-white/10 space-y-2 shrink-0">
          
          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-200 border border-amber-400/30 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Tv className="w-3.5 h-3.5 text-amber-300" />
              <span>🍿 Send Room Invite</span>
            </button>

            <span className="text-[10px] text-slate-400 font-mono truncate">
              {selectedFriend.name}
            </span>
          </div>

          {/* Standard Text Chat Form */}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              placeholder={`Message ${selectedFriend.name}...`}
              className="px-3 py-2 text-xs text-slate-100 liquid-glass-input flex-grow"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={!textInput.trim()}
              className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/20"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Send Room Invite Modal Overlay inside Drawer */}
      {isInviteModalOpen && selectedFriend && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md p-4 z-50 flex flex-col justify-center animate-in fade-in duration-200">
          <div className="bg-[#121829] border border-sky-400/30 rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white font-display">Invite {selectedFriend.name} to Watch</h4>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white"
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
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold"
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
