import React from 'react';

interface LiquidGlassCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: 'light' | 'dark' | 'glass';
  onClick?: () => void;
  id?: string;
}

export const LiquidGlassCard: React.FC<LiquidGlassCardProps> = ({
  children,
  className = '',
  intensity = 'glass',
  onClick,
  id
}) => {
  const getIntensityClass = () => {
    switch (intensity) {
      case 'light':
        return 'bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl';
      case 'dark':
        return 'bg-slate-900/40 backdrop-blur-2xl border border-white/5 shadow-2xl';
      case 'glass':
      default:
        return 'liquid-glass';
    }
  };

  return (
    <div
      id={id}
      onClick={onClick}
      className={`relative overflow-hidden transition-all duration-300 ${getIntensityClass()} ${
        onClick ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]' : ''
      } ${className}`}
      style={{ borderRadius: '24px' }} // Apple-like super rounded corners
    >
      {/* Glare effect inside border */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
      
      {/* Content wrapper */}
      <div className="relative z-10 p-6">
        {children}
      </div>
    </div>
  );
};
