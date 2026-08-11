import React, { useEffect, useRef } from 'react';

export function PreemptionAlertBanner({ isPreempted, flushDuration }) {
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (isPreempted) {
      if (!audioContextRef.current) {
        // Initialize AudioContext on demand
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      
      const playTone = () => {
        // Many browsers suspend AudioContext until user interaction; try to resume
        if (ctx.state === 'suspended') {
          ctx.resume(); 
        }
        
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.2); 

        // Envelope generator
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime + 0.2);
        osc1.stop(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 0.4);
      };

      // Play tone immediately and then repeat
      playTone();
      const interval = setInterval(playTone, 1000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [isPreempted]);

  if (!isPreempted) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-8">
      {/* Flashing screen border */}
      <div className="absolute inset-0 border-[6px] border-red-600 animate-[pulse_1s_ease-in-out_infinite] opacity-60 pointer-events-none" />
      
      {/* Alert Banner */}
      <div className="bg-red-600/90 backdrop-blur text-white px-8 py-4 rounded shadow-[0_0_30px_rgba(220,38,38,0.6)] animate-pulse font-mono font-bold tracking-widest text-xl border border-red-400">
        AMBULANCE APPROACHING — CORRIDOR PREEMPTED (GREEN) — FLUSH TIME: {flushDuration}s
      </div>
    </div>
  );
}
