import React, { useState } from 'react';
import { Download, Terminal, Monitor, Smartphone, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { InstallAppModal } from './InstallAppModal';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'compact' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
  variant = 'header'
}) => {
  const { isInstallable, isInstalled, install, isLinux, isEdge } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If already installed and running standalone
  if (isInstalled) {
    if (variant === 'banner') return null;
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-[11px] font-semibold ${className}`}>
        <Check className="w-3 h-3 text-emerald-400" />
        <span className="hidden sm:inline">Penguin View</span> Installed
      </div>
    );
  }

  const handleClick = async () => {
    // If browser prompt is ready, try direct native install
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setIsModalOpen(true);
      }
    } else {
      // Otherwise open guide modal (especially for Edge on Linux, Safari, etc.)
      setIsModalOpen(true);
    }
  };

  const getPlatformLabel = () => {
    if (isEdge && isLinux) return 'Install on Edge Linux';
    if (isLinux) return 'Install on Linux';
    return 'Install App';
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`px-3 py-1.5 text-xs font-bold text-sky-200 hover:text-white bg-gradient-to-r from-sky-500/20 via-blue-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-400/30 transition-all rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/10 hover:scale-105 active:scale-95 ${className}`}
        title={isEdge ? "Install Penguin View on Microsoft Edge" : "Install Penguin View as a native desktop/mobile app"}
      >
        <Download className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
        <span>{getPlatformLabel()}</span>
      </button>

      <InstallAppModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
};
