import React, { useState, useEffect } from 'react';
import { Activity, Radio, AlertTriangle, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function DashboardOverlay({ 
  ambulancePosition, 
  distanceToIntersection, 
  isPreempted, 
  systemStatus,
  auditLogs,
  manualOverride,
  toggleManualOverride
}) {
  const [time, setTime] = useState("");
  const [isHUDVisible, setIsHUDVisible] = useState(true);

  // Time Loop
  useEffect(() => {
    const updateTime = () => setTime(new Date().toISOString().substring(11, 19));
    updateTime();
    const int = setInterval(updateTime, 1000);
    return () => clearInterval(int);
  }, []);

  // Tab Key Toggle for HUD
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault(); // Stop normal browser tabbing
        setIsHUDVisible((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between text-slate-300 font-mono overflow-hidden">
      
      {/* WRAPPER FOR HUD PANELS TO TOGGLE OPACITY/VISIBILITY */}
      <div className={cn(
        "absolute inset-0 p-6 flex flex-col justify-between transition-opacity duration-300", 
        isHUDVisible ? "opacity-100 pointer-events-none" : "opacity-0 pointer-events-none"
      )}>
        
        {/* HEADER SECTION */}
        <header className={cn("flex justify-between items-start", isHUDVisible ? "pointer-events-auto" : "pointer-events-none")}>
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded shadow-2xl w-80">
            <h1 className="text-xl font-bold text-emerald-500 flex items-center gap-3 mb-2 tracking-wide">
              <Radio className="animate-pulse" /> SEMTOS CMD
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">
              Smart Emergency Mobility <br/> & Traffic Orchestration System
            </p>
            <div className="mt-4 flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
              <span>Uplink: <span className="text-emerald-400 font-bold">ACTIVE</span></span>
              <span>Mode: SIMULATION</span>
            </div>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded shadow-2xl flex flex-col items-end min-w-[200px]">
            <div className="text-sm text-slate-400 tracking-widest">UTC: <span className="text-slate-100">{time}</span></div>
            <div className={cn(
              "mt-3 text-xs font-bold px-3 py-1.5 rounded tracking-widest",
              systemStatus === 'NOMINAL' 
                ? 'bg-slate-800 text-slate-400 border border-slate-600' 
                : 'bg-red-900/30 text-red-400 border border-red-500 animate-pulse'
            )}>
              STATUS: {systemStatus}
            </div>
          </div>
        </header>

        {/* FOOTER PANELS */}
        <div className={cn("flex gap-6 h-72", isHUDVisible ? "pointer-events-auto" : "pointer-events-none")}>
          
          {/* TELEMETRY HUD */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-5 rounded shadow-2xl flex-[2] flex flex-col">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-4 border-b border-slate-700 pb-2 tracking-widest">
              <Activity size={16} className="text-blue-400" /> LIVE TELEMETRY
            </h2>
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div className="bg-slate-950/50 border border-slate-800 rounded p-4 flex flex-col justify-center">
                <span className="text-xs text-slate-500 mb-1 tracking-wider">DISTANCE TO I/S</span>
                <span className={cn("text-3xl font-bold tracking-wider", isPreempted ? "text-red-500" : "text-emerald-400")}>
                  {Math.round(distanceToIntersection)} <span className="text-lg text-slate-600">m</span>
                </span>
              </div>
              <div className="bg-slate-950/50 border border-slate-800 rounded p-4 flex flex-col justify-center">
                <span className="text-xs text-slate-500 mb-1 tracking-wider">Z-COORDINATE</span>
                <span className="text-3xl font-bold text-blue-400 tracking-wider">
                  {ambulancePosition.z.toFixed(1)}
                </span>
              </div>
              <div className="col-span-2 relative overflow-hidden group flex flex-col justify-end mt-2">
                <button 
                  onClick={toggleManualOverride}
                  className={cn(
                    "relative z-10 w-full py-4 rounded font-bold tracking-widest transition-all flex items-center justify-center gap-3",
                    manualOverride 
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] border border-red-400" 
                      : "bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  )}
                >
                  {manualOverride ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
                  {manualOverride ? "OVERRIDE ACTIVE (FORCE GREEN)" : "ENGAGE MANUAL OVERRIDE"}
                </button>
              </div>
            </div>
          </div>

          {/* AUDIT LOGS */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-5 rounded shadow-2xl flex-[3] flex flex-col">
            <h2 className="text-sm font-bold text-slate-100 mb-4 border-b border-slate-700 pb-2 tracking-widest">
              AUDIT TRAIL
            </h2>
            <div className="flex-1 overflow-y-auto pr-4 space-y-3 flex flex-col-reverse custom-scrollbar">
              {[...auditLogs].reverse().map(log => {
                const isHighlight = log.message.includes('GREEN') || log.message.includes('ACTIVATED') || log.message.includes('EMERGENCY');
                return (
                  <div key={log.id} className="text-xs font-mono leading-relaxed border-b border-slate-800/50 pb-2 last:border-0">
                    <span className="text-slate-500 mr-3">{log.timestamp}</span>
                    <span className={isHighlight ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                      {log.message}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* HELPER TEXT (ALWAYS VISIBLE) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-400/80 font-mono text-[10px] tracking-widest uppercase bg-slate-900/50 px-4 py-1.5 rounded backdrop-blur border border-slate-700/50 pointer-events-auto z-20 shadow-lg">
        Press [SPACE] to start/pause simulation | Press [TAB] to toggle HUD
      </div>
    </div>
  );
}
