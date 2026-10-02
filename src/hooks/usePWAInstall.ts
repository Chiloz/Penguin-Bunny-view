import { useState, useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && (window as any).__PWA_DEFERRED_PROMPT__) {
      return (window as any).__PWA_DEFERRED_PROMPT__;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      (window as any).__PWA_IS_INSTALLED__ === true
    );
  });

  const [platformInfo, setPlatformInfo] = useState<{
    isLinux: boolean;
    isEdge: boolean;
    isIOS: boolean;
    isWindows: boolean;
    isMac: boolean;
    isAndroid: boolean;
    detectedPlatform: 'linux' | 'windows' | 'mac' | 'ios' | 'android';
  }>(() => {
    if (typeof window === 'undefined') {
      return {
        isLinux: false,
        isEdge: false,
        isIOS: false,
        isWindows: false,
        isMac: false,
        isAndroid: false,
        detectedPlatform: 'linux'
      };
    }

    const ua = navigator.userAgent.toLowerCase();
    const isEdge = /edg\//.test(ua);
    const isAndroid = /android/.test(ua);
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isMac = /macintosh|mac os x/.test(ua) && !isIOS;
    const isWindows = /windows/.test(ua);
    const isLinux = /linux/.test(ua) && !isAndroid;

    let detectedPlatform: 'linux' | 'windows' | 'mac' | 'ios' | 'android' = 'linux';
    if (isLinux) detectedPlatform = 'linux';
    else if (isWindows) detectedPlatform = 'windows';
    else if (isMac) detectedPlatform = 'mac';
    else if (isIOS) detectedPlatform = 'ios';
    else if (isAndroid) detectedPlatform = 'android';

    return {
      isLinux,
      isEdge,
      isIOS,
      isWindows,
      isMac,
      isAndroid,
      detectedPlatform
    };
  });

  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        (window as any).__PWA_IS_INSTALLED__ === true;
      setIsInstalled(isStandalone);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__PWA_DEFERRED_PROMPT__ = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).__PWA_DEFERRED_PROMPT__ = null;
      (window as any).__PWA_IS_INSTALLED__ = true;
    };

    const handlePromptReady = () => {
      if ((window as any).__PWA_DEFERRED_PROMPT__) {
        setDeferredPrompt((window as any).__PWA_DEFERRED_PROMPT__);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-prompt-available', handlePromptReady);

    if ((window as any).__PWA_DEFERRED_PROMPT__) {
      setDeferredPrompt((window as any).__PWA_DEFERRED_PROMPT__);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-prompt-available', handlePromptReady);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptToUse = deferredPrompt || (window as any).__PWA_DEFERRED_PROMPT__;
    if (!promptToUse) {
      return false;
    }

    try {
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        (window as any).__PWA_DEFERRED_PROMPT__ = null;
        (window as any).__PWA_IS_INSTALLED__ = true;
        return true;
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
    return false;
  };

  return {
    isInstallable: !!(deferredPrompt || (typeof window !== 'undefined' && (window as any).__PWA_DEFERRED_PROMPT__)),
    isInstalled,
    install,
    deferredPrompt: deferredPrompt || (typeof window !== 'undefined' ? (window as any).__PWA_DEFERRED_PROMPT__ : null),
    ...platformInfo
  };
}
