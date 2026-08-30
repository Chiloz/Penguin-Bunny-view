// Notification and Audio Chime Utilities for Penguin View

/**
 * Detect if device is running iOS (iPhone / iPad)
 */
export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Detect if running as installed standalone PWA
 */
export const isStandalonePWA = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
};

/**
 * Play a crystal-clear synthetic notification chime via Web Audio API.
 * Works without external MP3 dependencies across browsers and devices.
 */
export const playNotificationChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    
    // Note 1: E5 (659.25Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Note 2: B5 (987.77Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, now + 0.08);
    gain2.gain.setValueAtTime(0.25, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch (err) {
    // Audio autoplay might be blocked before first interaction
  }
};

/**
 * Request notification permissions from the browser/OS.
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window === 'undefined') {
    return 'denied';
  }

  // Handle standard Notification API
  if ('Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn("Notification.requestPermission standard error:", err);
      // Older callback fallback if Promise rejection
      return new Promise((resolve) => {
        try {
          Notification.requestPermission((p) => resolve(p));
        } catch {
          resolve('denied');
        }
      });
    }
  }

  return 'denied';
};

/**
 * Send an alert push notification on Phone or Laptop.
 * Dispatches via ServiceWorker (for mobile/iOS/Android background push),
 * Web Notification API, and in-app event bus.
 */
export const sendPushNotification = (
  title: string, 
  options: { 
    body: string; 
    icon?: string; 
    tag?: string; 
    url?: string;
    onClick?: () => void;
  }
) => {
  // 1. Always trigger sound chime
  playNotificationChime();

  // 2. Trigger device vibration if supported (Android/supported browsers)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {}
  }

  // 3. Dispatch In-App Banner Event (guarantees real-time alert visibility)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('penguin-in-app-notification', {
        detail: {
          title,
          body: options.body,
          icon: options.icon || '/penguin_logo.jpg',
          tag: options.tag,
          onClick: options.onClick
        }
      })
    );
  }

  // 4. Dispatch System OS / Device Push Notification
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
    // Prefer ServiceWorker showNotification (essential on Android & iOS PWA Web Push)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body: options.body,
          icon: options.icon || '/penguin_logo.jpg',
          badge: '/penguin_logo.jpg',
          tag: options.tag || 'penguin-alert',
          renotify: true,
          data: options.url || '/',
          vibrate: [120, 60, 120]
        } as NotificationOptions & { vibrate?: number[] }).catch((swErr) => {
          console.warn("ServiceWorker showNotification fallback to window Notification:", swErr);
          tryDirectNotification(title, options);
        });
      }).catch(() => {
        tryDirectNotification(title, options);
      });
    } else {
      tryDirectNotification(title, options);
    }
  }
};

const tryDirectNotification = (
  title: string,
  options: { body: string; icon?: string; tag?: string; onClick?: () => void }
) => {
  try {
    const notif = new Notification(title, {
      body: options.body,
      icon: options.icon || '/penguin_logo.jpg',
      badge: '/penguin_logo.jpg',
      tag: options.tag,
      silent: false,
    });

    if (options.onClick) {
      notif.onclick = () => {
        window.focus();
        options.onClick?.();
        notif.close();
      };
    }
  } catch (directErr) {
    console.warn("Direct Notification constructor failed:", directErr);
  }
};

/**
 * Compress an image file to guaranteed under 1MB (and optimized to ~80-150KB)
 * for snappy real-time syncing.
 */
export const compressImageFile = (
  file: File, 
  maxWidth = 1280, 
  maxHeight = 720, 
  quality = 0.78
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 1. Strict size check: file MUST be under 1MB as requested by user
    if (file.size > 1024 * 1024) {
      reject(new Error(`File size is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Please choose an image smaller than 1.0 MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

