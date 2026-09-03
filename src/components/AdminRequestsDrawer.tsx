import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Check, 
  ShieldCheck, 
  Film, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  Mail, 
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  SlidersHorizontal
} from 'lucide-react';
import { MediaRequest, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';

interface AdminRequestsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const AdminRequestsDrawer: React.FC<AdminRequestsDrawerProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [actionMessage, setActionMessage] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const q = query(
      collection(db, 'media_requests'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MediaRequest[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MediaRequest);
      });
      setRequests(list);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching requests:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch slide / swipe to close
  const touchStartXRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartXRef.current !== null && touchCurrentXRef.current !== null) {
      const deltaX = touchCurrentXRef.current - touchStartXRef.current;
      // Swiping to the right by more than 50px closes the drawer
      if (deltaX > 50) {
        onClose();
      }
    }
    touchStartXRef.current = null;
    touchCurrentXRef.current = null;
  };

  if (!isOpen) return null;

  // Grant uploader role to a user
  const handleApproveUploader = async (request: MediaRequest) => {
    try {
      // 1. Update user role in users collection
      await updateDoc(doc(db, 'users', request.userUid), {
        role: 'uploader'
      });

      // 2. Mark request as approved
      await updateDoc(doc(db, 'media_requests', request.id), {
        status: 'approved'
      });

      setActionMessage(`Granted Uploader rights to ${request.userName}!`);
      setTimeout(() => setActionMessage(''), 3000);
    } catch (err: any) {
      console.error('Failed to grant role:', err);
      alert(err.message || 'Failed to update user role');
    }
  };

  const handleUpdateStatus = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'media_requests', requestId), {
        status
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (statusFilter === 'pending') return r.status === 'pending';
    return true;
  });

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-sans"
    >
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-md h-full bg-[#080d1a] border-l border-white/10 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300 relative z-[101]"
      >
        
        {/* Top Floating Slide-To-Close Handle on Mobile */}
        <div className="pt-2 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing border-b border-white/5 bg-[#0b1224]/80">
          <div className="w-12 h-1 rounded-full bg-white/20 hover:bg-white/40 transition-colors" />
          <span className="text-[9px] text-slate-500 font-mono tracking-wider mt-1">
            Slide right or tap back to close
          </span>
        </div>

        {/* Header with Back Button and Close */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-[#080d1a]">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-sky-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-white/10 active:scale-95 shadow-sm"
              title="Back to Media Catalog"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white font-display">
                Admin Center
              </h3>
              <p className="text-[10px] text-slate-400">
                Title &amp; upload rights
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/5"
            title="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Switcher */}
        <div className="px-5 pt-3 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending ({requests.filter(r => r.status === 'pending').length})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All History
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mx-5 my-2 p-2.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Requests List */}
        <div className="flex-1 p-5 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Loading requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 space-y-2 text-slate-500">
              <CheckCircle2 className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs font-medium">No {statusFilter} requests at the moment.</p>
            </div>
          ) : (
            filteredRequests.map(req => (
              <div 
                key={req.id}
                className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                    req.type === 'request_uploader_role'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  }`}>
                    {req.type === 'request_uploader_role' ? '⚡ Uploader Rights' : `🎬 ${req.category || 'Title'}`}
                  </span>

                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    req.status === 'pending'
                      ? 'bg-amber-400/10 text-amber-300'
                      : req.status === 'approved'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-rose-400/10 text-rose-300'
                  }`}>
                    {req.status}
                  </span>
                </div>

                <div>
                  {req.type === 'request_title' ? (
                    <h4 className="text-sm font-bold text-white">
                      {req.titleRequested}
                    </h4>
                  ) : (
                    <h4 className="text-sm font-bold text-white">
                      Wants to become an Uploader
                    </h4>
                  )}

                  {req.note && (
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed bg-black/30 p-2 rounded-xl">
                      "{req.note}"
                    </p>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-white/5 pt-2">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-sky-400" />
                    {req.userName}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {req.userEmail}
                  </span>
                </div>

                {/* Actions */}
                {req.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-1">
                    {req.type === 'request_uploader_role' ? (
                      <button
                        onClick={() => handleApproveUploader(req)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Grant Uploader Role
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(req.id, 'approved')}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Mark as Added
                      </button>
                    )}

                    <button
                      onClick={() => handleUpdateStatus(req.id, 'rejected')}
                      className="py-1.5 px-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
