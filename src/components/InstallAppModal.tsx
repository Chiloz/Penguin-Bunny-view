import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Smartphone, 
  Monitor, 
  Apple, 
  Share2, 
  PlusSquare, 
  X, 
  Check, 
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { LiquidGlassCard } from './LiquidGlassCard';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [activePlatformTab, setActivePlatformTab] = useState<'ios' | 'windows' | 'mac' | 'android'>('ios');

  // Detect user platform
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setActivePlatformTab('ios');
    } else if (/macintosh|mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua)) {
      setActivePlatformTab('mac');
    } else if (/windows/.test(ua)) {
      setActivePlatformTab('windows');
    } else if (/android/.test(ua)) {
      setActivePlatformTab('android');
    }

    // Check if app is already running in standalone mode (PWA installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Listen for Chrome/Edge/Android install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200 font-sans">
      <div className="w-full max-w-lg relative">
        <LiquidGlassCard intensity="glow" className="p-6 md:p-8 space-y-6 relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/20 shrink-0">
                <div className="w-full h-full rounded-[14px] bg-[#0c1222] flex items-center justify-center">
                  <span className="text-2xl">🐧</span>
                </div>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white font-display flex items-center gap-2">
                  Install Penguin View App
                  <Sparkles className="w-4 h-4 text-sky-400" />
                </h3>
                <p className="text-xs text-slate-400">
                  Full screen movies without browser tabs, faster launching & offline support
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

          {/* 1-Click Native Install Button (When browser beforeinstallprompt is ready) */}
          {deferredPrompt && !isInstalled && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-400/40 text-center space-y-3">
              <p className="text-xs font-semibold text-sky-200">
                One-Click Installation Available For Your Device!
              </p>
              <button
                onClick={handleInstallClick}
                className="w-full py-3 bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-sky-500/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Install Penguin View Now
              </button>
            </div>
          )}

          {isInstalled && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl flex items-center gap-2.5 text-emerald-300 text-xs font-semibold">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Penguin View is currently installed as a standalone app on this device!</span>
            </div>
          )}

          {/* Platform Guide Tabs */}
          <div className="space-y-4">
            <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10 gap-1">
              <button
                onClick={() => setActivePlatformTab('ios')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'ios'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                iPhone / iPad
              </button>

              <button
                onClick={() => setActivePlatformTab('windows')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'windows'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Windows Taskbar
              </button>

              <button
                onClick={() => setActivePlatformTab('mac')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'mac'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                MacBook Dock
              </button>

              <button
                onClick={() => setActivePlatformTab('android')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'android'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Android
              </button>
            </div>

            {/* Platform Specific Step-by-Step Cards */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left">
              {activePlatformTab === 'ios' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Apple className="w-4 h-4 text-sky-400" />
                    How to install on Apple iPhone & iPad Screen:
                  </h4>
                  <ol className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <span>
                        Open this page in <strong>Apple Safari</strong>. Tap the <strong>Share</strong> button (<Share2 className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" /> icon at bottom of screen).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <span>
                        Scroll down and tap <strong>"Add to Home Screen"</strong> (<PlusSquare className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" />).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        3
                      </span>
                      <span>
                        Tap <strong>"Add"</strong> in the top right corner. Penguin View icon will appear on your phone screen!
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {activePlatformTab === 'windows' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-sky-400" />
                    How to pin to Windows Taskbar & Start Menu:
                  </h4>
                  <ol className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <span>
                        In Google Chrome or Microsoft Edge, look at the right side of the address bar at the top.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <span>
                        Click the <strong>"Install Penguin View"</strong> icon (<Download className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" />) or browser menu ➔ <em>"Install / Apps"</em>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        3
                      </span>
                      <span>
                        When Penguin View opens in its own window, right-click the penguin icon on your taskbar and select <strong>"Pin to taskbar"</strong>!
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {activePlatformTab === 'mac' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Apple className="w-4 h-4 text-sky-400" />
                    How to add to MacBook Dock & Launchpad:
                  </h4>
                  <ol className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <span>
                        <strong>In Safari (macOS Sonoma or later):</strong> Click <strong>File</strong> in top menu bar ➔ <strong>"Add to Dock..."</strong> ➔ Click <strong>"Add"</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <span>
                        <strong>In Chrome / Edge on Mac:</strong> Click the <strong>Install</strong> icon in the address bar ➔ Pins directly to your Mac Dock & Applications folder.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        3
                      </span>
                      <span>
                        Launch Penguin View straight from your Mac Dock with native window controls and no browser tabs!
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {activePlatformTab === 'android' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-sky-400" />
                    How to install on Android phone screen:
                  </h4>
                  <ol className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <span>
                        Tap the <strong>three dots menu (⋮)</strong> in Chrome at the top right.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <span>
                        Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        3
                      </span>
                      <span>
                        Penguin View is added to your app drawer and home screen.
                      </span>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Got It
            </button>
          </div>

        </LiquidGlassCard>
      </div>
    </div>
  );
};
