import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  Film, 
  Tv, 
  Upload, 
  Key, 
  CheckCircle2, 
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';

interface MediaRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
}

export const MediaRequestModal: React.FC<MediaRequestModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [requestType, setRequestType] = useState<'request_title' | 'request_uploader_role'>('request_title');
  const [category, setCategory] = useState<'movie' | 'series' | 'anime'>('series');
  const [titleRequested, setTitleRequested] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (requestType === 'request_title' && !titleRequested.trim()) {
      setError('Please provide the title of the movie, series, or anime you want to watch.');
      return;
    }

    if (requestType === 'request_uploader_role' && !note.trim()) {
      setError('Please tell the admin what media you have to share.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'media_requests'), {
        userUid: currentUser.uid,
        userName: currentUser.name,
        userEmail: currentUser.email,
        type: requestType,
        category: requestType === 'request_title' ? category : undefined,
        titleRequested: requestType === 'request_title' ? titleRequested.trim() : undefined,
        note: note.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setTitleRequested('');
        setNote('');
      }, 2200);
    } catch (err: any) {
      console.error('Failed to submit request:', err);
      setError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
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
                {requestType === 'request_title' ? <Film className="w-5 h-5" /> : <Key className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  {requestType === 'request_title' ? 'Request a Movie, Series, or Anime' : 'Request Uploader Rights'}
                </h3>
                <p className="text-xs text-slate-400">
                  Send a direct request to the master admin
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

          {/* Request Type Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { setRequestType('request_title'); setError(''); }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                requestType === 'request_title'
                  ? 'bg-sky-500/30 text-sky-200 border border-sky-400/30 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-sky-400" />
              Request a Title
            </button>
            <button
              type="button"
              onClick={() => { setRequestType('request_uploader_role'); setError(''); }}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                requestType === 'request_uploader_role'
                  ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              Request Uploader Rights
            </button>
          </div>

          {success ? (
            <div className="py-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mx-auto flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white font-display">
                Request Sent Successfully!
              </h4>
              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                The master admin has received your request. Check back soon!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {requestType === 'request_title' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'movie', label: '🎬 Movie' },
                        { id: 'series', label: '📺 TV Series' },
                        { id: 'anime', label: '⛩️ Anime' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCategory(item.id as any)}
                          className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                            category === item.id
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Title Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Arcane Season 2, Demon Slayer, Inception..."
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                      value={titleRequested}
                      onChange={(e) => setTitleRequested(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Additional Notes / Links (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Japanese audio with English subtitles preferred, or link to Archive.org / Drive"
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input resize-none"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-indigo-500/10 border border-indigo-400/20 rounded-2xl space-y-1 text-slate-300 text-xs">
                    <p className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Help Grow the Penguin View Library!
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Uploaders can add Movies, TV Series, and Anime directly to our Internet Archive unlimited cloud storage or link existing collections.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      What content would you like to contribute?
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. I have complete 1080p series of Attack on Titan and Breaking Bad on my drive ready to upload to our archive!"
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input resize-none"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isSubmitting ? (
                    <span className="animate-spin text-sm">⏳</span>
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Submit Request</span>
                </button>
              </div>
            </form>
          )}

        </LiquidGlassCard>
      </div>
    </div>
  );
};
