"use client";

import React, { useState } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { Canvas3D } from '../../components/Canvas3D';

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  
  const {
    ambulancePosition,
    isPreempted,
    signalState,
  } = useTrafficStream(true);

  if (!started) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-slate-200">
        <div className="text-center p-10 bg-slate-900 border border-slate-700 rounded shadow-2xl max-w-lg">
          <h1 className="text-4xl font-bold mb-4 text-emerald-500 tracking-widest">SEMTOS CMD</h1>
          <p className="mb-10 font-mono text-sm text-slate-400 leading-relaxed">
            Digital Twin Command Dashboard. Interaction is required to initialize secure WebSockets and Audio Context for priority preemption alarms.
          </p>
          <button 
            onClick={() => setStarted(true)}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded tracking-[0.2em] font-mono transition-colors shadow-[0_0_20px_rgba(16,185,129,0.4)]"
          >
            START CINEMATIC MODE
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-slate-200 font-sans">
      {/* 3D WebGL Canvas Layer - 100% Full Screen */}
      <div className="absolute inset-0 z-0">
        <Canvas3D 
          ambulancePosition={ambulancePosition} 
          isPreempted={isPreempted} 
          signalState={signalState}
        />
      </div>

      {/* Cinematic Mode Active: UI has been completely hidden to provide an unobstructed view. */}
      {/* The Spacebar listener in useTrafficStream remains active in the background for simulation control. */}
    </main>
  );
}
