import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global PWA prompt tracking for Chromium, Edge (Linux/Windows/macOS), and Android
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    (window as any).__PWA_DEFERRED_PROMPT__ = e;
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
    console.log('Penguin View PWA install prompt is ready and captured.');
  });

  window.addEventListener('appinstalled', () => {
    (window as any).__PWA_DEFERRED_PROMPT__ = null;
    (window as any).__PWA_IS_INSTALLED__ = true;
    window.dispatchEvent(new CustomEvent('pwa-app-installed'));
    console.log('Penguin View successfully installed as PWA.');
  });
}

// Register Service Worker for PWA / iOS / Android / Desktop push notifications.
// Updates are surfaced (never forced) so a reload can't interrupt a movie or a running upload.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install: nothing stale to replace
    (window as any).__PV_UPDATE_READY__ = true;
    window.dispatchEvent(new CustomEvent('pv-update-ready'));
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        console.log('Penguin View Service Worker registered with scope:', reg.scope);
        reg.update().catch(() => {});
        // Installed PWAs can stay alive for days: re-check whenever the app returns to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch((err) => {
        console.warn('SW registration info:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
