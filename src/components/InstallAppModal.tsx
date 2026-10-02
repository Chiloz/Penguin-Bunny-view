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
  Terminal,
  ExternalLink,
  ShieldCheck,
  Compass,
  Laptop
} from 'lucide-react';
import { LiquidGlassCard } from './LiquidGlassCard';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const { 
    isInstallable, 
    isInstalled, 
    install, 
    detectedPlatform,
    isEdge,
    isLinux 
  } = usePWAInstall();

  const [activePlatformTab, setActivePlatformTab] = useState<'linux' | 'windows' | 'mac' | 'ios' | 'android'>('linux');
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (detectedPlatform) {
      setActivePlatformTab(detectedPlatform);
    }
  }, [detectedPlatform]);

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setInstallSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200 font-sans">
      <div className="w-full max-w-xl relative">
        <LiquidGlassCard intensity="glow" className="p-6 md:p-8 space-y-6 relative overflow-hidden">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-sky-500/20 shrink-0">
                <div className="w-full h-full rounded-[14px] bg-[#0c1222] flex items-center justify-center overflow-hidden">
                  <img src="/pwa-192x192.png" alt="Penguin View Logo" className="w-9 h-9 object-cover rounded-lg" />
                </div>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white font-display flex items-center gap-2">
                  Install Penguin View App
                  {isEdge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">Microsoft Edge Detected</span>}
                </h3>
                <p className="text-xs text-slate-400">
                  Runs natively in its own window without browser tabs, with full video sync and offline speed.
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

          {/* 1-Click Native Install Button (When browser prompt is ready) */}
          {isInstallable && !isInstalled && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-500/25 via-indigo-500/20 to-purple-500/25 border border-sky-400/40 text-center space-y-3 shadow-lg shadow-sky-500/10">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-sky-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Native 1-Click Installation Ready For Your Browser</span>
              </div>
              <button
                onClick={handleInstallClick}
                className="w-full py-3.5 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-sky-500/30 flex items-center justify-center gap-2.5 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Install Penguin View Now
              </button>
            </div>
          )}

          {(isInstalled || installSuccess) && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl flex items-center gap-2.5 text-emerald-300 text-xs font-semibold">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Penguin View is installed and registered as a standalone app!</span>
            </div>
          )}

          {/* Platform Guide Tabs */}
          <div className="space-y-4">
            <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10 gap-1 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActivePlatformTab('linux')}
                className={`flex-1 min-w-[100px] py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'linux'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Edge / Linux
              </button>

              <button
                onClick={() => setActivePlatformTab('windows')}
                className={`flex-1 min-w-[85px] py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'windows'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Windows
              </button>

              <button
                onClick={() => setActivePlatformTab('mac')}
                className={`flex-1 min-w-[75px] py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'mac'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                macOS
              </button>

              <button
                onClick={() => setActivePlatformTab('android')}
                className={`flex-1 min-w-[80px] py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'android'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Android
              </button>

              <button
                onClick={() => setActivePlatformTab('ios')}
                className={`flex-1 min-w-[90px] py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activePlatformTab === 'ios'
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                iPhone / iPad
              </button>
            </div>

            {/* Platform Specific Step-by-Step Cards */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4.5 text-left">
              
              {/* LINUX / MICROSOFT EDGE TAB */}
              {activePlatformTab === 'linux' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-sky-400" />
                      Installing on Microsoft Edge on Linux:
                    </h4>
                    <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-full font-mono">
                      Linux Desktop (Ubuntu / Debian / Fedora / Arch)
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/20 text-xs text-sky-200">
                    <strong className="text-white">Note for Edge Linux:</strong> Microsoft Edge on Linux supports two instant ways to install Penguin View directly into your Linux App Launcher (GNOME / KDE / XFCE) with custom desktop icons.
                  </div>

                  <ol className="space-y-3 text-xs text-slate-300">
                    <li className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <div>
                        <strong className="text-white">From the Edge Address Bar (Omnibox):</strong>
                        <p className="text-slate-400 mt-0.5">
                          Look at the right-hand side of your Microsoft Edge URL address bar. You will see the <strong className="text-sky-300">"App available. Install Penguin View"</strong> icon (a computer monitor icon with a down arrow, or a <code className="bg-black/40 px-1 py-0.5 rounded text-sky-300">+</code> button). Click it and select <strong className="text-white">Install</strong>.
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <div>
                        <strong className="text-white">From Edge Menu (Always Available on Linux):</strong>
                        <p className="text-slate-400 mt-0.5">
                          Click the <strong className="text-white">three dots menu (···)</strong> at the top right of Edge (or press <kbd className="px-1.5 py-0.5 bg-black/40 border border-white/20 rounded font-mono text-[10px] text-white">Alt + F</kbd>) ➔ Hover over <strong className="text-sky-300">Apps</strong> ➔ Click <strong className="text-white">"Install Penguin View"</strong> (or <strong className="text-white">"Install this site as an app"</strong>).
                        </p>
                      </div>
                    </li>

                    <li className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        3
                      </span>
                      <div>
                        <strong className="text-white">Native Linux Integration:</strong>
                        <p className="text-slate-400 mt-0.5">
                          Edge creates a native desktop entry in <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-[10px] text-indigo-300">~/.local/share/applications/</code>. Penguin View will appear in your Linux App Drawer, Ubuntu Dash, KDE Application Launcher, or rofi/dmenu. Right-click the Penguin icon in your Linux dock to <strong className="text-white">"Pin to Dash"</strong>!
                        </p>
                      </div>
                    </li>
                  </ol>
                </div>
              )}

              {/* WINDOWS TAB */}
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
                        In Microsoft Edge or Google Chrome, look at the right side of the address bar at the top.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        2
                      </span>
                      <span>
                        Click the <strong>"Install Penguin View"</strong> icon (<Download className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" />) or browser menu ➔ <em>"Apps ➔ Install Penguin View"</em>.
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

              {/* MACOS TAB */}
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
                        <strong>In Edge / Chrome on Mac:</strong> Click the <strong>Install</strong> icon in the address bar ➔ Pins directly to your Mac Dock & Applications folder.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              {/* ANDROID TAB */}
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
                        Tap the <strong>three dots menu (⋮)</strong> in Edge or Chrome at the top right.
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
                  </ol>
                </div>
              )}

              {/* IOS TAB */}
              {activePlatformTab === 'ios' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-sky-400" />
                    How to install on Apple iPhone & iPad Screen:
                  </h4>
                  <ol className="space-y-2.5 text-xs text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-sky-400/30">
                        1
                      </span>
                      <span>
                        Open this page in <strong>Apple Safari</strong>. Tap the <strong>Share</strong> button (<Share2 className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" /> at bottom of screen).
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
                  </ol>
                </div>
              )}

            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Verified PWA v3 with PNG icons & Edge Linux compatibility
            </span>
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
