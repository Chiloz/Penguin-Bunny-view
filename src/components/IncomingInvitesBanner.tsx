import React, { useState, useEffect } from 'react';
import { UserProfile, RoomInvite } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Tv, Play, X, Sparkles, Check, Bell } from 'lucide-react';
import { LiquidGlassCard } from './LiquidGlassCard';

interface IncomingInvitesBannerProps {
  currentUser: UserProfile;
  onStartRoom: (roomId: string) => void;
  onJoinRoom?: (roomId: string) => void;
}

export const IncomingInvitesBanner: React.FC<IncomingInvitesBannerProps> = ({
  currentUser,
  onStartRoom,
  onJoinRoom
}) => {
  const [invites, setInvites] = useState<RoomInvite[]>([]);

  useEffect(() => {
    if (!currentUser.uid) return;

    const q = query(
      collection(db, 'invites'),
      where('recipientId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingInvites: RoomInvite[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as RoomInvite));

      // Sort by latest
      pendingInvites.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA;
      });

      setInvites(pendingInvites);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  const handleAcceptInvite = async (invite: RoomInvite) => {
    try {
      await updateDoc(doc(db, 'invites', invite.id), { status: 'accepted' });
    } catch (err) {
      console.error("Error accepting invite:", err);
    }
    if (onJoinRoom) {
      onJoinRoom(invite.roomId);
    } else {
      onStartRoom(invite.roomId);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    try {
      await deleteDoc(doc(db, 'invites', inviteId));
    } catch (err) {
      console.error("Error declining invite:", err);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="space-y-3 my-4 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-300 font-mono flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-amber-400 animate-bounce" />
          Active Room Invites From Friends ({invites.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {invites.map((inv) => (
          <LiquidGlassCard key={inv.id} className="border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-sky-500/10 p-4 relative overflow-hidden group">
            <div className="flex items-center justify-between gap-3 relative z-10">
              
              {/* Left Side: Friend Info & Movie Name */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-xl overflow-hidden shrink-0 shadow-md">
                  {inv.senderPic && inv.senderPic.startsWith('data:image/') ? (
                    <img src={inv.senderPic} alt={inv.senderName} className="w-full h-full object-cover" />
                  ) : (
                    inv.senderPic || '🍿'
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{inv.senderName}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono font-semibold">
                      INVITED YOU
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-200 line-clamp-1 mt-0.5">
                    Watching: <span className="text-sky-300 font-bold">{inv.videoName || 'Sync Session'}</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Room ID: {inv.roomId}</p>
                </div>
              </div>

              {/* Right Side: Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleDeclineInvite(inv.id)}
                  className="p-2 bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 rounded-xl transition-all cursor-pointer"
                  title="Dismiss Invite"
                >
                  <X className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleAcceptInvite(inv)}
                  className="px-3.5 py-2 bg-gradient-to-r from-sky-400 to-indigo-500 hover:from-sky-300 hover:to-indigo-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-sky-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Join Room</span>
                </button>
              </div>

            </div>
          </LiquidGlassCard>
        ))}
      </div>
    </div>
  );
};
