import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Send, 
  Check, 
  Copy, 
  Users, 
  Tv, 
  MessageSquare, 
  Film,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';

interface ShareInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  videoTitle?: string;
  currentUser: UserProfile;
  friendsProfiles: UserProfile[];
}

const QUICK_SHORT_TEXTS = [
  "Come watch with me! 🍿",
  "Starting the episode now! 🔥",
  "Join my sync room! 🎬",
  "You gotta see this! 😱",
  "Let's watch this movie together! 💕"
];

export const ShareInviteModal: React.FC<ShareInviteModalProps> = ({
  isOpen,
  onClose,
  roomId,
  videoTitle,
  currentUser,
  friendsProfiles
}) => {
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [customMessage, setCustomMessage] = useState<string>('Come watch with me! 🍿');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sentSuccessFriends, setSentSuccessFriends] = useState<string[]>([]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const roomUrl = `${window.location.origin}/?room=${roomId}`;
  const displayTitle = videoTitle || 'Sync Movie Watch';

  if (!isOpen) return null;

  const toggleSelectFriend = (friendUid: string) => {
    setSelectedFriendIds(prev => 
      prev.includes(friendUid) 
        ? prev.filter(id => id !== friendUid) 
        : [...prev, friendUid]
    );
  };

  const handleSelectAll = () => {
    if (selectedFriendIds.length === friendsProfiles.length) {
      setSelectedFriendIds([]);
    } else {
      setSelectedFriendIds(friendsProfiles.map(f => f.uid));
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Penguin View: ${displayTitle}`,
          text: `🍿 Hey! Join my synchronized watch room on Penguin View for "${displayTitle}"!`,
          url: roomUrl
        });
      } catch (err) {
        console.log('Share dismissed:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  const handleSendInviteToFriends = async () => {
    if (selectedFriendIds.length === 0) return;

    setIsSending(true);
    const sentNames: string[] = [];

    try {
      for (const friendUid of selectedFriendIds) {
        const friend = friendsProfiles.find(f => f.uid === friendUid);
        if (!friend) continue;

        const messageText = customMessage.trim() || `🍿 Hey! I'm inviting you to watch "${displayTitle}" in my sync room!`;

        // 1. Add to direct_messages so it appears in the Mini Chat Box
        await addDoc(collection(db, 'direct_messages'), {
          senderId: currentUser.uid,
          senderName: currentUser.name,
          senderPic: currentUser.profilePic || '',
          recipientId: friend.uid,
          text: messageText,
          isInvite: true,
          roomId: roomId,
          roomVideoName: displayTitle,
          isRead: false,
          timestamp: serverTimestamp()
        });

        // 2. Add to invites collection so it appears on Dashboard Incoming Banner
        await addDoc(collection(db, 'invites'), {
          senderId: currentUser.uid,
          senderName: currentUser.name,
          senderPic: currentUser.profilePic || '',
          recipientId: friend.uid,
          roomId: roomId,
          videoName: displayTitle,
          status: 'pending',
          createdAt: serverTimestamp()
        });

        sentNames.push(friend.name);
      }

      setSentSuccessFriends(sentNames);
      setIsSending(false);
      setSelectedFriendIds([]);

      // Auto close after 2.5 seconds on success
      setTimeout(() => {
        setSentSuccessFriends([]);
      }, 3000);
    } catch (err) {
      console.error("Error sending invites:", err);
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200 font-sans">
      <div className="w-full max-w-lg relative">
        <LiquidGlassCard intensity="glow" className="p-6 space-y-5 relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  Share & Invite Friends
                </h3>
                <p className="text-xs text-slate-400">
                  Send 1-click room invite with short text to friends
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current Video Room info pill */}
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="p-2 bg-sky-500/20 text-sky-300 rounded-xl">
                <Film className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Active Watch Room</p>
                <p className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-[260px]">{displayTitle}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-sky-500/10 text-sky-300 px-2 py-1 rounded-lg border border-sky-400/20 shrink-0">
              ID: {roomId.slice(0, 8)}
            </span>
          </div>

          {/* Success Banner */}
          {sentSuccessFriends.length > 0 && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-2xl flex items-center gap-2.5 text-emerald-300 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Invite & message sent successfully to <strong>{sentSuccessFriends.join(', ')}</strong>! When they open Penguin View, the invite will be waiting in their chat & dashboard.
              </span>
            </div>
          )}

          {/* Tab / Section 1: Send to Friend List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                <Users className="w-4 h-4 text-sky-400" />
                Select Friends From List ({friendsProfiles.length})
              </label>

              {friendsProfiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                >
                  {selectedFriendIds.length === friendsProfiles.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {friendsProfiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {friendsProfiles.map((friend) => {
                  const isSelected = selectedFriendIds.includes(friend.uid);

                  return (
                    <button
                      key={friend.uid}
                      type="button"
                      onClick={() => toggleSelectFriend(friend.uid)}
                      className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-400/60 shadow-md shadow-sky-500/10'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-sm overflow-hidden shrink-0">
                        {friend.profilePic && friend.profilePic.startsWith('data:image/') ? (
                          <img src={friend.profilePic} alt={friend.name} className="w-full h-full object-cover" />
                        ) : (
                          friend.profilePic || '🐧'
                        )}
                      </div>

                      <div className="flex-grow overflow-hidden">
                        <p className="text-xs font-semibold text-white truncate">{friend.name}</p>
                        <p className="text-[9px] text-slate-400 font-mono">#{friend.friendCode}</p>
                      </div>

                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-sky-500 border-sky-400 text-white' : 'border-white/30 bg-transparent'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1">
                <p className="text-xs text-amber-300 font-semibold">No friends added yet</p>
                <p className="text-[11px] text-slate-400">
                  Share your friend code from the dashboard or copy the direct room link below to invite anyone!
                </p>
              </div>
            )}

            {/* Short text message customize input */}
            {friendsProfiles.length > 0 && (
              <div className="space-y-2 pt-1">
                <label className="block text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Short Text To Your Friend(s):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Come watch with me! 🍿"
                  className="px-3.5 py-2.5 text-xs text-slate-100 liquid-glass-input w-full"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  maxLength={120}
                />

                {/* Quick short text suggestion tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {QUICK_SHORT_TEXTS.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => setCustomMessage(phrase)}
                      className="px-2.5 py-1 bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-400/40 rounded-xl text-[10px] text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSendInviteToFriends}
                  disabled={selectedFriendIds.length === 0 || isSending}
                  className="w-full py-2.5 bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 disabled:opacity-40 disabled:hover:from-sky-400 disabled:hover:to-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95 transition-all cursor-pointer mt-2"
                >
                  <Send className="w-4 h-4" />
                  {isSending 
                    ? 'Sending Invites...' 
                    : `Send Invite to ${selectedFriendIds.length > 0 ? `${selectedFriendIds.length} Friend(s)` : 'Selected Friends'}`
                  }
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Direct Link Copy & Native Share */}
          <div className="border-t border-white/10 pt-4 space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
              Or Share Via Direct Link
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={roomUrl}
                className="px-3 py-2 text-xs text-slate-300 bg-black/40 border border-white/10 rounded-xl flex-grow font-mono truncate select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/15 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="p-2 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-300 rounded-xl transition-all cursor-pointer shrink-0"
                  title="Share to other apps"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        </LiquidGlassCard>
      </div>
    </div>
  );
};
