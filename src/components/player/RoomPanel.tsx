import React, { useState } from 'react';
import { Check, Copy, FolderPlus, ListVideo, MessageSquare, Share2, Users } from 'lucide-react';
import { Room, RoomParticipant } from '../../types';
import { REACTION_EMOJIS } from './PlayerControls';

export interface EpisodeItem {
  index: number;
  title: string;
  subtitle?: string;
}

const QUICK_COMMENTS = [
  'Wow! 😮', 'Nice! 🔥', 'What just happened?! 🤯', 'I love this! 💕', "What's gonna happen? 🤔",
  'OMG!! 😱', 'Peak fiction! 🍿', 'Rewind that! ⏪',
];

type Tab = 'chat' | 'episodes' | 'people';

interface RoomPanelProps {
  roomId: string;
  room: Room | null;
  members: RoomParticipant[];
  currentUserId: string;
  episodes: EpisodeItem[];
  activeEpisode: number;
  onSelectEpisode: (index: number) => void;
  onAddFiles?: () => void;
  onReact: (text: string) => void;
  onShare: () => void;
  /** Controls the tab from outside (the player's member badge opens "people"). */
  forcedTab?: Tab | null;
}

export const RoomPanel: React.FC<RoomPanelProps> = ({
  roomId, room, members, currentUserId, episodes, activeEpisode, onSelectEpisode, onAddFiles, onReact, onShare, forcedTab,
}) => {
  const [tab, setTab] = useState<Tab>('chat');
  const [copied, setCopied] = useState(false);
  const current: Tab = forcedTab || tab;

  const link = `${window.location.origin}/?room=${roomId}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API needs HTTPS + a gesture; fall back to a temporary textarea.
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'chat', label: 'React', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'episodes', label: 'Episodes', icon: <ListVideo className="w-4 h-4" />, badge: episodes.length > 1 ? episodes.length : undefined },
    { id: 'people', label: 'Watching', icon: <Users className="w-4 h-4" />, badge: members.length },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full" data-no-ptr>
      <div className="flex items-center gap-1 p-1 mx-3 mt-3 rounded-2xl bg-white/5 border border-white/5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              current === t.id ? 'bg-white/12 text-white shadow border border-white/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge !== undefined && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500/25 text-sky-200 text-[10px] font-bold flex items-center justify-center">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 min-h-0">
        {current === 'chat' && (
          <>
            <div className="grid grid-cols-6 gap-2">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => onReact(e)}
                  className="h-12 rounded-2xl text-2xl bg-white/5 border border-white/10 active:scale-110 active:bg-white/10 transition-all"
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_COMMENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => onReact(c)}
                  className="px-3 h-9 rounded-full text-xs font-medium text-slate-200 bg-white/5 border border-white/10 active:scale-95 active:bg-white/10 transition-all"
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'episodes' && (
          <>
            {episodes.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm space-y-3">
                <ListVideo className="w-8 h-8 mx-auto opacity-40" />
                <p>No playlist yet.</p>
                {onAddFiles && (
                  <button onClick={onAddFiles} className="px-4 h-11 rounded-2xl bg-white/8 border border-white/15 text-white text-sm font-semibold inline-flex items-center gap-2 active:scale-95">
                    <FolderPlus className="w-4 h-4" /> Add videos from this device
                  </button>
                )}
              </div>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {episodes.map((ep) => (
                    <li key={ep.index}>
                      <button
                        onClick={() => onSelectEpisode(ep.index)}
                        className={`w-full text-left px-3.5 py-3 rounded-2xl border flex items-center gap-3 active:scale-[0.99] transition-all ${
                          ep.index === activeEpisode
                            ? 'bg-sky-500/15 border-sky-400/40'
                            : 'bg-white/[0.03] border-white/5 hover:bg-white/8'
                        }`}
                      >
                        <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${ep.index === activeEpisode ? 'bg-sky-400 text-slate-900' : 'bg-white/10 text-slate-300'}`}>
                          {ep.index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white truncate">{ep.title}</span>
                          {ep.subtitle && <span className="block text-[11px] text-slate-400 truncate">{ep.subtitle}</span>}
                        </span>
                        {ep.index === activeEpisode && <span className="text-[10px] font-mono uppercase text-sky-300">Now</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {onAddFiles && (
                  <button onClick={onAddFiles} className="w-full h-11 rounded-2xl bg-white/5 border border-dashed border-white/15 text-slate-300 text-sm font-semibold flex items-center justify-center gap-2 active:scale-95">
                    <FolderPlus className="w-4 h-4" /> Add more videos
                  </button>
                )}
              </>
            )}
          </>
        )}

        {current === 'people' && (
          <>
            <ul className="space-y-1.5">
              {members.length === 0 && <li className="text-center text-sm text-slate-500 py-6">Just you for now.</li>}
              {members.map((m) => (
                <li key={m.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/5">
                  <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-lg overflow-hidden shrink-0">
                    {m.profilePic && m.profilePic.startsWith('data:image/') ? (
                      <img src={m.profilePic} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.profilePic || '🐧'
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">
                      {m.name}{m.uid === currentUserId && <span className="text-slate-400 font-normal"> (you)</span>}
                    </span>
                    {room?.hostId === m.uid && <span className="text-[10px] font-mono uppercase text-amber-300">Host</span>}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={onShare} className="h-12 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
                <Share2 className="w-4 h-4" /> Invite
              </button>
              <button onClick={copyLink} className="h-12 rounded-2xl bg-white/8 border border-white/15 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
