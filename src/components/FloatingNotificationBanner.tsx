import React, { useState, useEffect } from 'react';
import { Bell, X, MessageSquare, Film, ChevronRight } from 'lucide-react';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export const FloatingNotificationBanner: React.FC = () => {
  const [activeNotification, setActiveNotification] = useState<NotificationItem | null>(null);

  useEffect(() => {
    const handleInAppNotification = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationItem>;
      if (!customEvent.detail) return;

      const notifItem: NotificationItem = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: customEvent.detail.title,
        body: customEvent.detail.body,
        icon: customEvent.detail.icon,
        tag: customEvent.detail.tag,
        onClick: customEvent.detail.onClick
      };

      setActiveNotification(notifItem);

      // Auto dismiss after 6 seconds
      const timer = setTimeout(() => {
        setActiveNotification((curr) => (curr?.id === notifItem.id ? null : curr));
      }, 6000);

      return () => clearTimeout(timer);
    };

    window.addEventListener('penguin-in-app-notification', handleInAppNotification);
    return () => {
      window.removeEventListener('penguin-in-app-notification', handleInAppNotification);
    };
  }, []);

  if (!activeNotification) return null;

  const isInvite = activeNotification.body.toLowerCase().includes('invite') || 
                   activeNotification.body.includes('🍿') || 
                   activeNotification.title.toLowerCase().includes('room');

  return (
    <div className="fixed top-4 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-[9999] pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-300">
      <div 
        onClick={() => {
          if (activeNotification.onClick) {
            activeNotification.onClick();
          }
          setActiveNotification(null);
        }}
        className={`group p-3.5 rounded-2xl border backdrop-blur-2xl shadow-2xl transition-all cursor-pointer flex items-start gap-3 relative overflow-hidden ${
          isInvite
            ? 'bg-gradient-to-r from-indigo-950/95 via-sky-950/95 to-slate-900/95 border-sky-400/50 shadow-sky-500/20 hover:border-sky-300'
            : 'bg-[#0f172a]/95 border-sky-500/30 shadow-sky-500/10 hover:border-sky-400/60'
        }`}
      >
        {/* Left Icon Avatar */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
          isInvite 
            ? 'bg-gradient-to-tr from-amber-500 to-rose-500 text-white' 
            : 'bg-gradient-to-tr from-sky-400 to-indigo-600 text-white'
        }`}>
          {isInvite ? <Film className="w-5 h-5 animate-pulse" /> : <MessageSquare className="w-5 h-5" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-sky-400 flex items-center gap-1">
              <Bell className="w-2.5 h-2.5" />
              PENGUIN ALERT
            </span>
          </div>
          <h4 className="text-xs font-bold text-white truncate font-display">
            {activeNotification.title}
          </h4>
          <p className="text-[11px] text-slate-300 line-clamp-2 leading-snug mt-0.5">
            {activeNotification.body}
          </p>
        </div>

        {/* Action arrow */}
        <div className="self-center p-1 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all">
          <ChevronRight className="w-4 h-4" />
        </div>

        {/* Dismiss close button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActiveNotification(null);
          }}
          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Bottom progress decay bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-400 to-indigo-500 animate-[width_6s_linear]" />
      </div>
    </div>
  );
};
