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

// Register Service Worker for PWA / iOS / Android / Desktop push notifications
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('Penguin View Service Worker registered with scope:', reg.scope);
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
