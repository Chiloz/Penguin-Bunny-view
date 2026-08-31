import React, { useEffect, useRef } from 'react';
import { FallAutumnTreeBackground } from './FallAutumnTreeBackground';

interface AnimatedBackgroundProps {
  theme: 'sky' | 'liquid' | 'bubbles' | 'fire' | 'cyber' | 'emerald' | 'autumn' | 'fall' | string;
  customBgImage?: string;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ theme, customBgImage }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme === 'autumn' || theme === 'fall') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particle / Physics state objects
    // 1. Bubbles
    const bubbles = Array.from({ length: 22 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      radius: Math.random() * 28 + 12,
      hue: Math.floor(Math.random() * 60) + 180, // Cyan to Purple
      alpha: Math.random() * 0.35 + 0.15
    }));

    // 2. Fire Embers
    const embers = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height + height,
      vy: Math.random() * 1.5 + 0.8,
      vx: (Math.random() - 0.5) * 0.6,
      size: Math.random() * 4.5 + 1.5,
      alpha: Math.random() * 0.8 + 0.2,
      life: Math.random() * 100
    }));

    let step = 0;

    const render = () => {
      step += 0.015;
      ctx.clearRect(0, 0, width, height);

      if (theme === 'bubbles') {
        // Draw bouncing neon bubbles
        bubbles.forEach((b) => {
          b.x += b.vx;
          b.y += b.vy;

          // Bounce off canvas edges
          if (b.x - b.radius < 0 || b.x + b.radius > width) b.vx *= -1;
          if (b.y - b.radius < 0 || b.y + b.radius > height) b.vy *= -1;

          ctx.beginPath();
          const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.radius);
          grad.addColorStop(0, `hsla(${b.hue}, 85%, 65%, ${b.alpha + 0.2})`);
          grad.addColorStop(0.7, `hsla(${b.hue}, 70%, 50%, ${b.alpha * 0.5})`);
          grad.addColorStop(1, `hsla(${b.hue}, 80%, 40%, 0)`);

          ctx.fillStyle = grad;
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // Bubble glossy rim highlight
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.8})`;
          ctx.fill();
        });
      } else if (theme === 'fire') {
        // Hot flame glow at bottom
        const fireGrad = ctx.createLinearGradient(0, height, 0, height - 350);
        fireGrad.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
        fireGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.12)');
        fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fireGrad;
        ctx.fillRect(0, height - 350, width, 350);

        // Render floating burning embers
        embers.forEach((e) => {
          e.y -= e.vy;
          e.x += Math.sin(step + e.life) * 0.8 + e.vx;

          if (e.y < -20) {
            e.y = height + Math.random() * 40;
            e.x = Math.random() * width;
          }

          ctx.beginPath();
          const eGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 2);
          eGrad.addColorStop(0, `rgba(254, 240, 138, ${e.alpha})`); // warm bright orange/yellow
          eGrad.addColorStop(0.5, `rgba(249, 115, 22, ${e.alpha * 0.7})`);
          eGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');

          ctx.fillStyle = eGrad;
          ctx.arc(e.x, e.y, e.size * 2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (theme === 'liquid') {
        // Morphing liquid gradient wave pulses
        const cx1 = width * 0.3 + Math.sin(step) * 150;
        const cy1 = height * 0.3 + Math.cos(step * 0.8) * 120;
        const cx2 = width * 0.7 + Math.cos(step * 1.1) * 180;
        const cy2 = height * 0.6 + Math.sin(step * 0.9) * 140;

        const g1 = ctx.createRadialGradient(cx1, cy1, 20, cx1, cy1, 450);
        g1.addColorStop(0, 'rgba(14, 165, 233, 0.28)'); // Sky blue
        g1.addColorStop(1, 'rgba(0, 0, 0, 0)');

        const g2 = ctx.createRadialGradient(cx2, cy2, 20, cx2, cy2, 500);
        g2.addColorStop(0, 'rgba(168, 85, 247, 0.22)'); // Purple liquid
        g2.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'emerald' || theme === 'green') {
        // Northern Lights / Lush Emerald Meadow wave
        const yOffset = Math.sin(step) * 60;
        const auroraGrad = ctx.createLinearGradient(0, height * 0.2 + yOffset, width, height * 0.8 - yOffset);
        auroraGrad.addColorStop(0, 'rgba(34, 197, 94, 0.25)'); // Lush Green
        auroraGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.20)'); // Emerald
        auroraGrad.addColorStop(1, 'rgba(20, 184, 166, 0.15)'); // Teal

        ctx.fillStyle = auroraGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'cyber') {
        // Synthwave neon purple grid ambiance
        const cyberGrad = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, width * 0.6);
        cyberGrad.addColorStop(0, 'rgba(236, 72, 153, 0.22)'); // Neon Pink
        cyberGrad.addColorStop(0.5, 'rgba(147, 51, 234, 0.18)'); // Electric Purple
        cyberGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = cyberGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'yellow') {
        // Solar flare / Sunburst Yellow
        const pulse = Math.sin(step * 1.5) * 40;
        const sunGrad = ctx.createRadialGradient(width / 2, height * 0.3, 20, width / 2, height * 0.3, 400 + pulse);
        sunGrad.addColorStop(0, 'rgba(250, 204, 21, 0.28)'); // Bright Yellow
        sunGrad.addColorStop(0.6, 'rgba(234, 179, 8, 0.15)'); // Amber Yellow
        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'orange') {
        // Vibrant Sunset Orange
        const cx = width * 0.5 + Math.sin(step) * 100;
        const cy = height * 0.4 + Math.cos(step) * 80;
        const orangeGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 500);
        orangeGrad.addColorStop(0, 'rgba(249, 115, 22, 0.28)'); // Radiant Orange
        orangeGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)'); // Amber
        orangeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = orangeGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'gold') {
        // Royal Luxury Gold
        const cx1 = width * 0.4 + Math.cos(step * 0.8) * 120;
        const cy1 = height * 0.4 + Math.sin(step * 0.8) * 100;
        const goldGrad = ctx.createRadialGradient(cx1, cy1, 10, cx1, cy1, 480);
        goldGrad.addColorStop(0, 'rgba(254, 240, 138, 0.32)'); // Light Metallic Gold
        goldGrad.addColorStop(0.4, 'rgba(245, 158, 11, 0.22)'); // Warm Gold
        goldGrad.addColorStop(0.8, 'rgba(180, 83, 9, 0.12)'); // Deep Bronze Gold
        goldGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = goldGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (theme === 'silver') {
        // Platinum Silver Starlight Sheen
        const cx = width * 0.5 + Math.sin(step * 0.7) * 140;
        const cy = height * 0.3 + Math.cos(step * 0.7) * 100;
        const silverGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 460);
        silverGrad.addColorStop(0, 'rgba(248, 250, 252, 0.25)'); // Bright Platinum
        silverGrad.addColorStop(0.5, 'rgba(203, 213, 225, 0.18)'); // Cool Silver
        silverGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = silverGrad;
        ctx.fillRect(0, 0, width, height);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  const isAutumn = theme === 'autumn' || theme === 'fall';

  return (
    <>
      {customBgImage && (
        <div 
          className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center transition-all duration-1000 opacity-40 mix-blend-screen scale-105"
          style={{ backgroundImage: `url(${customBgImage})` }}
        />
      )}
      {isAutumn ? (
        <FallAutumnTreeBackground />
      ) : (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000"
          style={{ opacity: 0.95 }}
        />
      )}
    </>
  );
};
