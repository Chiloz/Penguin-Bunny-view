import React, { useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, 
  Play, 
  Calendar, 
  Clock, 
  Flame, 
  RefreshCw, 
  Film,
  Tv,
  HelpCircle,
  PartyPopper
} from 'lucide-react';
import { UserProfile } from '../types';
import { getWelcomeGreeting, GreetingDetails, formatFriendlyName } from '../utils/greetingEngine';

interface WelcomePopupProps {
  currentUser: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onExploreCatalog?: () => void;
}

/**
 * Triggers multi-burst mini fireworks using canvas-confetti
 */
export function triggerMiniFireworks() {
  const duration = 2.2 * 1000;
  const animationEnd = Date.now() + duration;

  // Initial center burst
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.6, x: 0.5 },
    colors: ['#38bdf8', '#818cf8', '#f43f5e', '#fbbf24', '#34d399', '#ec4899'],
    ticks: 200,
    gravity: 1.1,
    scalar: 1.1
  });

  // Staggered mini fireworks popping from left and right
  const interval: any = setInterval(() => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 28 * (timeLeft / duration);

    // Left mini firework
    confetti({
      particleCount: Math.floor(particleCount),
      angle: 60,
      spread: 55,
      origin: { x: 0.15, y: 0.65 },
      colors: ['#38bdf8', '#34d399', '#facc15', '#a855f7'],
      shapes: ['star', 'circle'],
      scalar: 0.9
    });

    // Right mini firework
    confetti({
      particleCount: Math.floor(particleCount),
      angle: 120,
      spread: 55,
      origin: { x: 0.85, y: 0.65 },
      colors: ['#f43f5e', '#ec4899', '#fbbf24', '#22d3ee'],
      shapes: ['star', 'circle'],
      scalar: 0.9
    });

    // Random star sparkles near center
    if (Math.random() > 0.4) {
      confetti({
        particleCount: 15,
        spread: 360,
        startVelocity: 15,
        origin: { x: 0.4 + Math.random() * 0.2, y: 0.45 + Math.random() * 0.2 },
        colors: ['#ffffff', '#fde047', '#38bdf8'],
        shapes: ['star'],
        scalar: 0.75
      });
    }
  }, 350);
}

export const WelcomePopup: React.FC<WelcomePopupProps> = ({
  currentUser,
  isOpen,
  onClose,
  onExploreCatalog
}) => {
  const [greeting, setGreeting] = useState<GreetingDetails>(() => 
    getWelcomeGreeting(currentUser.name)
  );
  const [hasPopped, setHasPopped] = useState<boolean>(false);

  // Re-calculate greeting whenever currentUser changes or user requests a refresh
  const refreshGreeting = useCallback(() => {
    setGreeting(getWelcomeGreeting(currentUser.name));
    triggerMiniFireworks();
  }, [currentUser.name]);

  // Launch fireworks on open
  useEffect(() => {
    if (isOpen && !hasPopped) {
      const timer = setTimeout(() => {
        triggerMiniFireworks();
        setHasPopped(true);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hasPopped]);

  // Reset pop trigger if modal re-opens
  useEffect(() => {
    if (isOpen) {
      setGreeting(getWelcomeGreeting(currentUser.name));
    } else {
      setHasPopped(false);
    }
  }, [isOpen, currentUser.name]);

  if (!isOpen) return null;

  const friendlyName = formatFriendlyName(currentUser.name);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{
        background: 'rgba(3, 7, 18, 0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}
    >
      {/* Background radial glow */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-[140px] pointer-events-none opacity-25 animate-pulse"
        style={{
          background: currentUser.themeColor === 'rose' ? '#f43f5e' :
                      currentUser.themeColor === 'emerald' ? '#10b981' :
                      currentUser.themeColor === 'amber' ? '#f59e0b' :
                      currentUser.themeColor === 'purple' ? '#a855f7' : '#38bdf8'
        }}
      />

      {/* Main Glass Card Container */}
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/20 p-6 sm:p-8 text-center text-white shadow-2xl shadow-sky-500/10 animate-scale-up"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(15, 23, 42, 0.75) 100%)',
          backdropFilter: 'blur(35px) saturate(190%)',
          WebkitBackdropFilter: 'blur(35px) saturate(190%)'
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-all cursor-pointer z-10"
          aria-label="Close welcome modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Decorative Seasonal & Date Pill */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-[11px] font-mono font-medium text-sky-200 bg-sky-500/20 border border-sky-400/30 flex items-center gap-1.5 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-sky-300" />
            <span>{greeting.dateBadge}</span>
          </span>
          <span className="px-3 py-1 rounded-full text-[11px] font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/30 flex items-center gap-1 shadow-sm">
            <span>{greeting.seasonalBadge}</span>
          </span>
        </div>

        {/* Avatar / Mascot with Animated Aura */}
        <div className="relative mx-auto w-24 h-24 mb-5 flex items-center justify-center">
          {/* Animated concentric rings */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-400/40 via-indigo-500/40 to-pink-500/40 animate-spin blur-md opacity-70" style={{ animationDuration: '6s' }} />
          <div className="absolute inset-1 rounded-full bg-[#0a0f1d] border border-white/20" />
          
          <div className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-inner select-none overflow-hidden">
            {currentUser.profilePic && currentUser.profilePic.startsWith('data:image/') ? (
              <img src={currentUser.profilePic} alt={currentUser.name} className="w-full h-full object-cover" />
            ) : (
              <span className="transform hover:scale-110 transition-transform duration-300">
                {currentUser.profilePic || '🐧'}
              </span>
            )}
          </div>

          {/* Floating Emoji Mood Badge */}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center text-sm shadow-md border-2 border-[#0a0f1d] animate-bounce">
            {greeting.moodEmoji}
          </div>
        </div>

        {/* Headline Greeting (e.g., "Hi penguin, welcome back!") */}
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display text-white mb-2 leading-snug">
          {greeting.headline}
        </h2>

        {/* Dynamic Question Prompt ("What are we gonna watch today or tonight?") */}
        <div className="my-3 px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 max-w-md mx-auto">
          <p className="text-sm sm:text-base font-semibold text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-indigo-200 to-pink-200 flex items-center justify-center gap-2">
            <Film className="w-4 h-4 text-sky-400 shrink-0" />
            <span>"{greeting.questionPrompt}"</span>
          </p>
        </div>

        {/* Day, Date & Month Context Greeting */}
        <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed max-w-md mx-auto mb-6">
          {greeting.subGreeting}
        </p>

        {/* Action Buttons: Let's Watch & Launch Mini Fireworks */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => {
              onClose();
              if (onExploreCatalog) onExploreCatalog();
            }}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-sky-500 via-indigo-600 to-blue-600 hover:from-sky-400 hover:via-indigo-500 hover:to-blue-500 transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Let's Watch! 🍿</span>
          </button>

          <button
            type="button"
            onClick={() => triggerMiniFireworks()}
            className="w-full sm:w-auto px-4 py-3 rounded-2xl font-semibold text-xs text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            title="Pop more mini fireworks!"
          >
            <PartyPopper className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>Mini Fireworks 🎆</span>
          </button>

          <button
            type="button"
            onClick={refreshGreeting}
            className="p-3 rounded-2xl text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
            title="Shuffle greeting message"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Hint */}
        <p className="text-[10px] text-slate-400 mt-4 font-mono">
          Penguin View • Synchronized Theater • Enjoy the show, {friendlyName}!
        </p>
      </div>
    </div>
  );
};
