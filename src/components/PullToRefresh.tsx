import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, onRefresh }) => {
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const startYRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const PULL_THRESHOLD = 75; // px required to trigger refresh

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only enable pull-to-refresh if page is at the very top
      if (window.scrollY <= 5 && !isRefreshing) {
        startYRef.current = e.touches[0].clientY;
        isDraggingRef.current = true;
      } else {
        startYRef.current = null;
        isDraggingRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || startYRef.current === null || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startYRef.current;

      if (deltaY > 0 && window.scrollY <= 5) {
        // Apply rubber band damping curve
        const damped = Math.min(deltaY * 0.45, 110);
        setPullDistance(damped);
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(60); // lock at refreshing height

        try {
          if (navigator.vibrate) {
            navigator.vibrate(20);
          }
        } catch {
          // ignore vibration errors
        }

        try {
          if (onRefresh) {
            await onRefresh();
          } else {
            // Default: reload page smoothly
            await new Promise(resolve => setTimeout(resolve, 800));
            window.location.reload();
          }
        } catch (err) {
          console.error('Refresh error:', err);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        // Reset without refreshing
        setPullDistance(0);
      }

      startYRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, isRefreshing, onRefresh]);

  const isTriggerable = pullDistance >= PULL_THRESHOLD;

  return (
    <div className="relative min-h-screen">
      {/* Pull down indicator pill */}
      <div 
        className="fixed top-2 left-0 right-0 z-50 flex justify-center pointer-events-none transition-transform duration-150"
        style={{
          transform: `translateY(${Math.max(pullDistance - 15, -60)}px)`,
          opacity: pullDistance > 10 ? Math.min(pullDistance / 50, 1) : 0
        }}
      >
        <div className="px-4 py-2 bg-[#0b1329]/90 border border-white/20 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-2 text-white">
          {isRefreshing ? (
            <>
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
              <span className="text-xs font-semibold tracking-wide">Refreshing Penguin View...</span>
            </>
          ) : isTriggerable ? (
            <>
              <span className="text-sm animate-bounce">🐧</span>
              <span className="text-xs font-bold text-sky-300">Release to reload</span>
            </>
          ) : (
            <>
              <ArrowDown className="w-3.5 h-3.5 text-slate-400 animate-bounce" />
              <span className="text-xs font-medium text-slate-300">Pull down to refresh</span>
            </>
          )}
        </div>
      </div>

      {/* Main App Content */}
      <div 
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.4}px)` : 'none',
          transition: isDraggingRef.current ? 'none' : 'transform 0.25s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
};
