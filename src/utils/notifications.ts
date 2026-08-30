// Notification and Audio Chime Utilities for Penguin View

/**
 * Play a crystal-clear synthetic notification chime via Web Audio API.
 * Works without external MP3 dependencies across browsers and devices.
 */
export const playNotificationChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Smooth bell tone: 2 harmonic notes
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
    // Audio autoplay might be suspended until interaction
  }
};

/**
 * Request notification permissions from the browser/OS.
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error("Error requesting notification permission:", err);
    return 'denied';
  }
};

/**
 * Send an alert push notification on Phone or Laptop.
 */
export const sendPushNotification = (
  title: string, 
  options: { 
    body: string; 
    icon?: string; 
    tag?: string; 
    onClick?: () => void;
  }
) => {
  // Always trigger sound and haptic vibration if supported
  playNotificationChime();
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([100, 50, 100]);
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'granted') {
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
    } catch (err) {
      console.warn("Could not dispatch push notification directly, trying service worker:", err);
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: options.body,
            icon: options.icon || '/penguin_logo.jpg',
            tag: options.tag,
            vibrate: [100, 50, 100]
          } as NotificationOptions & { vibrate?: number[] });
        }).catch(swErr => console.warn("SW notification failed:", swErr));
      }
    }
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
