import React, { useMemo } from 'react';
import { motion } from 'motion/react';

interface LeafParticle {
  id: number;
  startX: number;
  startY: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  swayAmount: number;
  leafType: 'maple' | 'oak' | 'aspen' | 'birch';
  rotationStart: number;
  rotationEnd: number;
}

const RICH_AUTUMN_PALETTE = [
  '#ff7b00', // Fiery glowing orange
  '#e85d04', // Rich pumpkin orange
  '#dc2f02', // Deep vibrant red-orange
  '#d00000', // Crimson maple
  '#faa307', // Golden amber
  '#ffba08', // Radiant sunlit yellow-gold
  '#9d0208', // Rich burgundy red
  '#f48c06', // Warm autumn amber
  '#e76f51', // Terracotta
  '#d4a373', // Warm golden sand
];

export const FallAutumnTreeBackground: React.FC = () => {
  // Generate random drifting leaves with organic properties
  const leaves: LeafParticle[] = useMemo(() => {
    const list: LeafParticle[] = [];
    const count = 28; // Rich density
    
    for (let i = 0; i < count; i++) {
      list.push({
        id: i,
        startX: 4 + (i * (92 / count)) + ((i % 4) * 2), // Spanning full width
        startY: -20 - ((i % 6) * 25),
        size: 18 + (i % 5) * 5, // 18px to 38px
        color: RICH_AUTUMN_PALETTE[i % RICH_AUTUMN_PALETTE.length],
        duration: 7 + (i % 6) * 2, // 7s to 17s smooth drift
        delay: (i * 0.5) % 7,
        swayAmount: 35 + (i % 4) * 25, // 35px to 110px side-to-side sway
        leafType: i % 4 === 0 ? 'maple' : i % 4 === 1 ? 'oak' : i % 4 === 2 ? 'aspen' : 'birch',
        rotationStart: (i * 55) % 360,
        rotationEnd: (i * 55) + 360 + (i % 2 === 0 ? 360 : -360),
      });
    }
    return list;
  }, []);

  const renderLeafSvg = (type: string, color: string) => {
    if (type === 'maple') {
      return (
        <svg viewBox="0 0 24 24" fill={color} className="w-full h-full drop-shadow-md">
          <path d="M12 2L13.8 6.2L18.2 4.8L16.8 9.2L21.5 11.2L18.2 13.8L20.2 18.2L15.5 16.8L13.8 21.2L12 18.8L10.2 21.2L8.5 16.8L3.8 18.2L5.8 13.8L2.5 11.2L7.2 9.2L5.8 4.8L10.2 6.2L12 2Z" />
          <path d="M12 18.8V23.5" stroke="#5c2e0b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === 'oak') {
      return (
        <svg viewBox="0 0 24 24" fill={color} className="w-full h-full drop-shadow-md">
          <path d="M12 2C9.5 4.5 6.5 4.2 7.8 7.5C5.5 8.8 4.5 11.8 6.8 14C4.8 16.2 5.8 19.5 9 20.2C10.2 21.2 11.2 22 12 22.8C12.8 22 13.8 21.2 15 20.2C18.2 19.5 19.2 16.2 17.2 14C19.5 11.8 18.5 8.8 16.2 7.5C17.5 4.2 14.5 4.5 12 2Z" />
          <path d="M12 20.2V23.5" stroke="#5c2e0b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    if (type === 'aspen') {
      return (
        <svg viewBox="0 0 24 24" fill={color} className="w-full h-full drop-shadow-md">
          <path d="M12 2.5C7.5 5.5 4.5 10 5.5 15.5C6.5 20 10 21.5 12 21.5C14 21.5 17.5 20 18.5 15.5C19.5 10 16.5 5.5 12 2.5Z" />
          <path d="M12 17.5V23" stroke="#5c2e0b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }
    // Birch
    return (
      <svg viewBox="0 0 24 24" fill={color} className="w-full h-full drop-shadow-md">
        <path d="M12 2C8.5 7 5.5 12.5 7.5 17.5C9.5 21 11.5 21.5 12 21.5C12.5 21.5 14.5 21 16.5 17.5C18.5 12.5 15.5 7 12 2Z" />
        <path d="M12 18.5V23" stroke="#5c2e0b" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" 
      aria-hidden="true"
      id="fall-autumn-tree-background"
    >
      {/* 1. Warm Golden Autumn Atmospheric Light & Sunbeams */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-950/40 via-orange-950/25 to-[#070b14]/70 pointer-events-none" />
      
      {/* Centered Sunbeam Radiance */}
      <div className="absolute top-60 sm:top-20 md:top-10 left-1/2 -translate-x-1/2 w-[750px] sm:w-[950px] h-[550px] bg-radial from-amber-500/25 via-orange-500/15 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-64 sm:top-28 left-1/4 w-[450px] h-[450px] bg-radial from-yellow-400/20 via-orange-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-64 sm:top-28 right-1/4 w-[450px] h-[450px] bg-radial from-yellow-400/20 via-orange-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* 2. Majestic Centered Autumn Maple Tree (Dropped Down so Canopy is Fully Visible on Phone & Laptop) */}
      <div className="absolute top-64 sm:top-28 md:top-16 lg:top-20 left-1/2 -translate-x-1/2 w-[98vw] sm:w-[92vw] max-w-[880px] h-[380px] sm:h-[460px] md:h-[560px] pointer-events-none opacity-95">
        <svg 
          viewBox="0 0 800 550" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full filter drop-shadow-2xl"
        >
          <defs>
            {/* Trunk Wood Gradients */}
            <linearGradient id="barkGradCenter" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2c170a" />
              <stop offset="35%" stopColor="#4a2812" />
              <stop offset="65%" stopColor="#6e3e1b" />
              <stop offset="100%" stopColor="#241208" />
            </linearGradient>

            <linearGradient id="barkHighlightCenter" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8d562e" />
              <stop offset="50%" stopColor="#5c381c" />
              <stop offset="100%" stopColor="#331c0c" />
            </linearGradient>

            {/* Rich Foliage Gradients */}
            <radialGradient id="foliageGoldGlow" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#ffe66d" stopOpacity="1" />
              <stop offset="45%" stopColor="#ffb703" stopOpacity="0.95" />
              <stop offset="85%" stopColor="#fb8500" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#e85d04" stopOpacity="0.8" />
            </radialGradient>

            <radialGradient id="foliageFieryOrange" cx="45%" cy="35%" r="55%">
              <stop offset="0%" stopColor="#ffb703" stopOpacity="1" />
              <stop offset="35%" stopColor="#fb8500" stopOpacity="0.95" />
              <stop offset="75%" stopColor="#e85d04" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c1121f" stopOpacity="0.85" />
            </radialGradient>

            <radialGradient id="foliageCrimsonAmber" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f48c06" stopOpacity="1" />
              <stop offset="40%" stopColor="#dc2f02" stopOpacity="0.95" />
              <stop offset="80%" stopColor="#9d0208" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6a040f" stopOpacity="0.85" />
            </radialGradient>

            <radialGradient id="foliageSunlitYellow" cx="40%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#fff3b0" stopOpacity="1" />
              <stop offset="50%" stopColor="#ffba08" stopOpacity="0.95" />
              <stop offset="90%" stopColor="#f48c06" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dc2f02" stopOpacity="0.75" />
            </radialGradient>
          </defs>

          {/* Majestic Center Tree Trunk with Organic Curves */}
          <path 
            d="M 370 230 Q 360 320 340 420 Q 320 490 280 550 L 520 550 Q 480 490 460 420 Q 440 320 430 230 Z" 
            fill="url(#barkGradCenter)" 
          />

          {/* Trunk Texture Lines */}
          <path d="M 375 270 Q 365 370 345 470 Q 330 520 310 550" stroke="#784724" strokeWidth="4" strokeLinecap="round" opacity="0.65" />
          <path d="M 400 240 Q 400 350 395 450 Q 390 510 380 550" stroke="#2c170a" strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
          <path d="M 425 270 Q 435 370 455 470 Q 470 520 490 550" stroke="#8d562e" strokeWidth="4" strokeLinecap="round" opacity="0.6" />

          {/* Spreading Autumn Branches: Left, Right, Center, and Crown */}
          {/* Main Left Branch */}
          <path 
            d="M 380 260 Q 300 240 220 200 Q 140 160 80 140 Q 150 180 230 225 Q 310 265 370 290 Z" 
            fill="url(#barkHighlightCenter)" 
          />
          {/* Main Left Upper Branch */}
          <path 
            d="M 375 220 Q 290 170 210 120 Q 140 80 90 70 Q 160 105 240 150 Q 320 195 380 225 Z" 
            fill="url(#barkGradCenter)" 
          />
          {/* Sub-Branch Left */}
          <path 
            d="M 230 145 Q 170 115 120 120 Q 175 135 220 160 Z" 
            fill="url(#barkGradCenter)" 
          />

          {/* Main Right Branch */}
          <path 
            d="M 420 260 Q 500 240 580 200 Q 660 160 720 140 Q 650 180 570 225 Q 490 265 430 290 Z" 
            fill="url(#barkHighlightCenter)" 
          />
          {/* Main Right Upper Branch */}
          <path 
            d="M 425 220 Q 510 170 590 120 Q 660 80 710 70 Q 640 105 560 150 Q 480 195 420 225 Z" 
            fill="url(#barkGradCenter)" 
          />
          {/* Sub-Branch Right */}
          <path 
            d="M 570 145 Q 630 115 680 120 Q 625 135 580 160 Z" 
            fill="url(#barkGradCenter)" 
          />

          {/* Center Crown Upward Branches */}
          <path 
            d="M 385 200 Q 370 130 350 70 Q 370 115 395 180 Z" 
            fill="url(#barkHighlightCenter)" 
          />
          <path 
            d="M 415 200 Q 430 130 450 70 Q 430 115 405 180 Z" 
            fill="url(#barkHighlightCenter)" 
          />

          {/* Deep Rich Balanced Canopy Layers (Centered Majestic Spread) */}
          
          {/* Layer 1: Deep Crimson & Burnt Amber Base Canopy (Shadows / Depth) */}
          <ellipse cx="400" cy="170" rx="140" ry="95" fill="url(#foliageCrimsonAmber)" opacity="0.95" />
          <ellipse cx="270" cy="180" rx="120" ry="85" fill="url(#foliageCrimsonAmber)" opacity="0.92" />
          <ellipse cx="530" cy="180" rx="120" ry="85" fill="url(#foliageCrimsonAmber)" opacity="0.92" />
          <ellipse cx="160" cy="155" rx="105" ry="75" fill="url(#foliageCrimsonAmber)" opacity="0.9" />
          <ellipse cx="640" cy="155" rx="105" ry="75" fill="url(#foliageCrimsonAmber)" opacity="0.9" />
          <ellipse cx="280" cy="95" rx="110" ry="80" fill="url(#foliageCrimsonAmber)" opacity="0.9" />
          <ellipse cx="520" cy="95" rx="110" ry="80" fill="url(#foliageCrimsonAmber)" opacity="0.9" />

          {/* Layer 2: Vibrant Fiery Orange & Pumpkin Mid-Canopy */}
          <ellipse cx="400" cy="130" rx="130" ry="90" fill="url(#foliageFieryOrange)" opacity="0.96" />
          <ellipse cx="250" cy="140" rx="115" ry="80" fill="url(#foliageFieryOrange)" opacity="0.95" />
          <ellipse cx="550" cy="140" rx="115" ry="80" fill="url(#foliageFieryOrange)" opacity="0.95" />
          <ellipse cx="140" cy="120" rx="95" ry="70" fill="url(#foliageFieryOrange)" opacity="0.94" />
          <ellipse cx="660" cy="120" rx="95" ry="70" fill="url(#foliageFieryOrange)" opacity="0.94" />
          <ellipse cx="320" cy="70" rx="105" ry="75" fill="url(#foliageFieryOrange)" opacity="0.95" />
          <ellipse cx="480" cy="70" rx="105" ry="75" fill="url(#foliageFieryOrange)" opacity="0.95" />

          {/* Layer 3: Radiant Golden Yellow & Sunlit Amber Highlights (Canopy Rim) */}
          <ellipse cx="400" cy="85" rx="115" ry="75" fill="url(#foliageSunlitYellow)" opacity="0.98" />
          <ellipse cx="280" cy="55" rx="100" ry="70" fill="url(#foliageGoldGlow)" opacity="0.98" />
          <ellipse cx="520" cy="55" rx="100" ry="70" fill="url(#foliageSunlitYellow)" opacity="0.98" />
          <ellipse cx="170" cy="85" rx="85" ry="60" fill="url(#foliageGoldGlow)" opacity="0.96" />
          <ellipse cx="630" cy="85" rx="85" ry="60" fill="url(#foliageSunlitYellow)" opacity="0.96" />
          <ellipse cx="90" cy="110" rx="70" ry="50" fill="url(#foliageGoldGlow)" opacity="0.93" />
          <ellipse cx="710" cy="110" rx="70" ry="50" fill="url(#foliageSunlitYellow)" opacity="0.93" />

          {/* Organic Leaf Cluster Dappling */}
          {[
            // Top Center Crown
            { cx: 400, cy: 35, r: 36, c: '#fff3b0' },
            { cx: 340, cy: 45, r: 32, c: '#ffba08' },
            { cx: 460, cy: 45, r: 32, c: '#ffba08' },
            // Upper Left
            { cx: 270, cy: 40, r: 30, c: '#ff7b00' },
            { cx: 200, cy: 55, r: 28, c: '#ffba08' },
            { cx: 130, cy: 80, r: 26, c: '#e85d04' },
            { cx: 70, cy: 110, r: 24, c: '#ffba08' },
            // Upper Right
            { cx: 530, cy: 40, r: 30, c: '#ff7b00' },
            { cx: 600, cy: 55, r: 28, c: '#ffba08' },
            { cx: 670, cy: 80, r: 26, c: '#e85d04' },
            { cx: 730, cy: 110, r: 24, c: '#ffba08' },
            // Mid Canopy Clusters
            { cx: 310, cy: 115, r: 30, c: '#dc2f02' },
            { cx: 490, cy: 115, r: 30, c: '#dc2f02' },
            { cx: 210, cy: 140, r: 28, c: '#ff7b00' },
            { cx: 590, cy: 140, r: 28, c: '#ff7b00' },
            { cx: 120, cy: 160, r: 24, c: '#ffba08' },
            { cx: 680, cy: 160, r: 24, c: '#ffba08' },
            // Lower Clustered Foliage Tips
            { cx: 270, cy: 220, r: 24, c: '#dc2f02' },
            { cx: 530, cy: 220, r: 24, c: '#dc2f02' },
            { cx: 370, cy: 210, r: 26, c: '#ff7b00' },
            { cx: 430, cy: 210, r: 26, c: '#ff7b00' },
          ].map((cluster, idx) => (
            <circle 
              key={idx} 
              cx={cluster.cx} 
              cy={cluster.cy} 
              r={cluster.r} 
              fill={cluster.c} 
              opacity="0.92" 
              className="drop-shadow-xs"
            />
          ))}
        </svg>
      </div>

      {/* 3. Golden Carpet of Autumn Leaves along Bottom Viewport */}
      <div className="absolute bottom-0 left-0 right-0 h-28 sm:h-36 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 via-orange-500/10 to-transparent" />
        
        <svg 
          viewBox="0 0 1200 120" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="absolute bottom-0 w-full h-full opacity-60 preserve-3d"
          preserveAspectRatio="none"
        >
          <path d="M 0 120 Q 300 80 600 95 Q 900 75 1200 90 L 1200 120 L 0 120 Z" fill="#4a2812" opacity="0.6" />
          <path d="M 0 120 Q 200 90 500 100 Q 800 85 1200 105 L 1200 120 L 0 120 Z" fill="#6e3e1b" opacity="0.65" />
          <path d="M 0 120 Q 400 95 800 100 Q 1050 90 1200 110 L 1200 120 L 0 120 Z" fill="#e85d04" opacity="0.4" />
          
          {/* Dappled Fallen Leaves on the Ground */}
          {[
            { cx: 80, cy: 105, r: 12, c: '#ff7b00' },
            { cx: 160, cy: 112, r: 9, c: '#ffba08' },
            { cx: 240, cy: 100, r: 14, c: '#dc2f02' },
            { cx: 320, cy: 108, r: 11, c: '#ff7b00' },
            { cx: 410, cy: 114, r: 8, c: '#e85d04' },
            { cx: 500, cy: 104, r: 13, c: '#ffba08' },
            { cx: 590, cy: 110, r: 10, c: '#dc2f02' },
            { cx: 680, cy: 102, r: 12, c: '#ff7b00' },
            { cx: 770, cy: 112, r: 9, c: '#ffba08' },
            { cx: 860, cy: 106, r: 14, c: '#e85d04' },
            { cx: 950, cy: 114, r: 10, c: '#dc2f02' },
            { cx: 1040, cy: 103, r: 13, c: '#ff7b00' },
            { cx: 1130, cy: 110, r: 11, c: '#ffba08' },
          ].map((leaf, idx) => (
            <ellipse key={idx} cx={leaf.cx} cy={leaf.cy} rx={leaf.r * 1.6} ry={leaf.r * 0.7} fill={leaf.c} opacity="0.85" />
          ))}
        </svg>
      </div>

      {/* 4. Smoothly Drifting, Swaying & Twirling Autumn Maple Leaves (Spanning Full Screen) */}
      {leaves.map((leaf) => (
        <motion.div
          key={leaf.id}
          className="absolute"
          style={{
            width: leaf.size,
            height: leaf.size,
            left: `${leaf.startX}%`,
            top: -40,
          }}
          initial={{
            y: leaf.startY,
            x: 0,
            rotate: leaf.rotationStart,
            opacity: 0,
          }}
          animate={{
            y: ['0vh', '118vh'],
            x: [
              0,
              leaf.swayAmount,
              -leaf.swayAmount,
              leaf.swayAmount * 0.9,
              -leaf.swayAmount * 0.6,
              leaf.swayAmount * 0.3,
              0
            ],
            rotate: [leaf.rotationStart, leaf.rotationEnd],
            opacity: [0, 0.95, 0.95, 0.9, 0.75, 0],
          }}
          transition={{
            duration: leaf.duration,
            repeat: Infinity,
            delay: leaf.delay,
            ease: "easeInOut",
            times: [0, 0.15, 0.35, 0.6, 0.8, 0.95, 1],
          }}
        >
          {renderLeafSvg(leaf.leafType, leaf.color)}
        </motion.div>
      ))}

      {/* 5. Charming Autumn Accent Emojis */}
      <div className="absolute bottom-12 left-10 text-2xl opacity-50 animate-pulse">🍂</div>
      <div className="absolute top-1/3 right-12 text-3xl opacity-45 animate-bounce" style={{ animationDuration: '6s' }}>🍁</div>
      <div className="absolute bottom-28 right-20 text-2xl opacity-40 animate-pulse">🌾</div>
      <div className="absolute top-1/2 left-8 text-xl opacity-35 animate-bounce" style={{ animationDuration: '8s' }}>✨</div>
    </div>
  );
};

export default FallAutumnTreeBackground;
