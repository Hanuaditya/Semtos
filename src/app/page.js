"use client";

import React, { useState, useEffect } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { useCase3TrafficStream } from '../../hooks/useCase3TrafficStream';
import { useHardwareSerial } from '../../hooks/useHardwareSerial';
import { useHardwareWifi } from '../../hooks/useHardwareWifi';
import { Canvas3D } from '../../components/Canvas3D';

function Case1SignalHUD({ phase, nGreen, sGreen, eGreen, wGreen, nYellow, sYellow, eYellow, wYellow, timeRemaining, onBackToMenu, onSwitchCase }) {
  const phaseLabel = {
    ALL_RED:      { text: 'ALL APPROACHES - GRIDLOCK',      color: '#ef4444', sub: 'Press ENTER to dispatch ambulance' },
    W_GREEN:      { text: 'EMERGENCY - WEST CORRIDOR OPEN', color: '#f97316', sub: 'Ambulance en route - N/S/E holding' },
    N_RELEASE:    { text: 'NORTH RELEASED',                 color: '#22c55e', sub: 'S/E/W holding' },
    S_RELEASE:    { text: 'SOUTH RELEASED',                 color: '#22c55e', sub: 'E/W holding' },
    E_RELEASE:    { text: 'EAST RELEASED',                  color: '#22c55e', sub: 'Resuming normal cycle' },
    NORMAL_CYCLE: { text: 'NORMAL CYCLE',                   color: '#60a5fa', sub: 'Standard signal rotation active' },
  };
  const p = phaseLabel[phase] || { text: phase, color: '#fff', sub: '' };
  const arms = [
    { label: 'NORTH', green: nGreen, yellow: nYellow },
    { label: 'EAST',  green: eGreen, yellow: eYellow },
    { label: 'SOUTH', green: sGreen, yellow: sYellow },
    { label: 'WEST',  green: wGreen, yellow: wYellow },
  ];
  return (
    <div style={{ position:'fixed',top:20,left:20,zIndex:100,background:'rgba(2,6,23,0.92)',border:`1.5px solid ${p.color}`,borderRadius:12,padding:'12px 18px',fontFamily:'monospace',minWidth:260,boxShadow:`0 0 20px ${p.color}44`,backdropFilter:'blur(10px)' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,borderBottom:'1px solid #334155',paddingBottom:6 }}>
        <button
          onClick={onBackToMenu}
          style={{ background:'#1e293b',color:'#94a3b8',border:'1px solid #475569',borderRadius:6,fontSize:10,padding:'2px 8px',cursor:'pointer',fontWeight:700 }}
        >
          ← MENU
        </button>
        <span style={{ fontSize:10,color:'#94a3b8',letterSpacing:2 }}>CASE 01 PREEMPTION</span>
        <button
          onClick={() => onSwitchCase(3)}
          style={{ background:'rgba(245,158,11,0.2)',color:'#f59e0b',border:'1px solid #f59e0b',borderRadius:6,fontSize:10,padding:'2px 8px',cursor:'pointer',fontWeight:700 }}
        >
          CASE 03
        </button>
      </div>
      <div style={{ fontSize:14,fontWeight:700,color:p.color,marginBottom:2 }}>{p.text}</div>
      <div style={{ fontSize:11,color:'#64748b',marginBottom:8 }}>{p.sub}</div>
      {(phase==='N_RELEASE'||phase==='S_RELEASE'||phase==='E_RELEASE')&&(
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
          <span style={{ fontSize:11,color:'#64748b' }}>NEXT IN</span>
          <span style={{ fontSize:22,fontWeight:900,color:p.color }}>{timeRemaining}s</span>
        </div>
      )}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:11 }}>
        {arms.map(({label,green,yellow})=>{
          const icon=green?'🟢':yellow?'🟡':'🔴';
          const col=green?'#22c55e':yellow?'#facc15':'#ef4444';
          return(<div key={label} style={{color:col,display:'flex',gap:4,alignItems:'center'}}><span>{icon}</span><span style={{color:'#94a3b8'}}>{label}</span></div>);
        })}
      </div>
    </div>
  );
}

function Case3TelemetryHUD({ case3, onBackToMenu, onSwitchCase }) {
  const { ambulanceA, ambulanceB, deadlockDetected, trafficCycleActive, signals, metrics } = case3;

  const arms = [
    { label: 'NORTH', green: signals.sGreen, yellow: signals.sYellow },
    { label: 'EAST',  green: signals.wGreen, yellow: signals.wYellow },
    { label: 'SOUTH', green: signals.nGreen, yellow: signals.nYellow },
    { label: 'WEST',  green: signals.eGreen, yellow: signals.eYellow },
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      left: 20,
      zIndex: 100,
      background: 'rgba(2, 6, 23, 0.94)',
      border: `1.5px solid ${trafficCycleActive ? '#22c55e' : '#f59e0b'}`,
      borderRadius: 12,
      padding: '14px 18px',
      fontFamily: 'monospace',
      width: 350,
      boxShadow: `0 0 24px ${trafficCycleActive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
      backdropFilter: 'blur(10px)',
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease'
    }}>
      {/* Top Header / Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 6 }}>
        <button
          onClick={onBackToMenu}
          style={{
            background: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #475569',
            borderRadius: 6,
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: 700
          }}
        >
          ← MENU
        </button>
        <span style={{ fontSize: 11, color: trafficCycleActive ? '#22c55e' : '#f59e0b', fontWeight: 800, letterSpacing: 2 }}>
          {trafficCycleActive ? 'CASE 03: NORMAL TRAFFIC' : 'CASE 03: MACRO-DETOUR'}
        </span>
        <button
          onClick={() => onSwitchCase(1)}
          style={{
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
            border: '1px solid #22c55e',
            borderRadius: 6,
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: 700
          }}
        >
          CASE 01
        </button>
      </div>

      {/* Dispatch / Re-dispatch Button */}
      <button
        onClick={case3.dispatchCase3}
        style={{
          width: '100%',
          background: (case3.isSimulationRunning && !trafficCycleActive)
            ? 'rgba(30, 41, 59, 0.8)'
            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: (case3.isSimulationRunning && !trafficCycleActive) ? '#94a3b8' : '#000',
          fontWeight: 900,
          fontSize: 11,
          padding: '7px 0',
          borderRadius: 8,
          border: (case3.isSimulationRunning && !trafficCycleActive) ? '1px solid #334155' : '1px solid #f59e0b',
          cursor: (case3.isSimulationRunning && !trafficCycleActive) ? 'default' : 'pointer',
          letterSpacing: 1.2,
          marginBottom: 10,
          boxShadow: (case3.isSimulationRunning && !trafficCycleActive) ? 'none' : '0 0 16px rgba(245, 158, 11, 0.45)',
          transition: 'all 0.2s ease'
        }}
      >
        {trafficCycleActive
          ? '🔄 RE-DISPATCH DUAL AMBULANCES [ENTER]'
          : case3.isSimulationRunning
          ? '🚑 AMBULANCES IN MOTION'
          : '▶ DISPATCH DUAL AMBULANCES [ENTER]'}
      </button>

      {/* ── CONDITIONAL PANEL: Normal Traffic Orchestration (Case 1 style) vs Emergency Tracking ── */}
      {trafficCycleActive ? (
        <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid #22c55e', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 800, letterSpacing: 1.5, marginBottom: 4 }}>
            TRAFFIC ORCHESTRATION ACTIVE
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', marginBottom: 4, lineHeight: 1.3 }}>
            {signals.phaseLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>PHASE TIMER:</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{signals.timeRemaining}s</span>
          </div>

          {/* 4-Arm Live Signal Status Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11, borderTop: '1px solid #334155', paddingTop: 8 }}>
            {arms.map(({ label, green, yellow }) => {
              const icon = green ? '🟢' : yellow ? '🟡' : '🔴';
              const col  = green ? '#22c55e' : yellow ? '#facc15' : '#ef4444';
              return (
                <div key={label} style={{ color: col, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{icon}</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{label}</span>
                </div>
              );
            })}
          </div>

          {/* Delivery Confirmation */}
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #334155', fontSize: 9, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>AMB A: <strong style={{ color: '#22c55e' }}>DELIVERED</strong></span>
            <span>AMB B: <strong style={{ color: '#22c55e' }}>DELIVERED</strong></span>
          </div>
        </div>
      ) : (
        <>
          {/* Ambulance A Status Card */}
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid #3b82f6', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#60a5fa' }}>
              <span>🚑 AMBULANCE A (CARDIAC)</span>
              <span style={{ color: ambulanceA.status === 'CORRIDOR_ACTIVE' ? '#22c55e' : '#94a3b8' }}>
                {ambulanceA.status}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 3 }}>
              South Approach (X: {ambulanceA.position.x.toFixed(1)}, Z: {ambulanceA.position.z.toFixed(1)})
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              Junction Status: <strong style={{ color: '#22c55e' }}>SOUTH GREEN (DIRECT FLUSH)</strong>
            </div>
          </div>

          {/* Ambulance B Detour Card */}
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>
              <span>🚑 AMBULANCE B (TRAUMA)</span>
              <span style={{ color: ambulanceB.status === 'DETOUR_ACTIVE' ? '#f59e0b' : '#94a3b8' }}>
                {ambulanceB.status}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#fef08a', marginTop: 3, fontWeight: 600 }}>
              {ambulanceB.waypointName}
            </div>
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
              TELEMETRY: X: <strong style={{ color: '#fff' }}>{ambulanceB.position.x.toFixed(1)}</strong> | Z: <strong style={{ color: '#fff' }}>{ambulanceB.position.z.toFixed(1)}</strong>
            </div>
            
            {/* Progress Waypoint Pills */}
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {[
                { id: 1, label: 'WP1 (X:47)' },
                { id: 2, label: 'WP2 (Z:-60)' },
                { id: 3, label: 'WP3 (X:-85)' },
                { id: 4, label: 'WP4 (Rejoin)' },
              ].map(wp => {
                const active = ambulanceB.currentWaypointIdx === wp.id;
                const done = ambulanceB.currentWaypointIdx > wp.id;
                return (
                  <div key={wp.id} style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '3px 0',
                    borderRadius: 4,
                    fontSize: 8,
                    fontWeight: 800,
                    background: done ? '#22c55e' : active ? '#f59e0b' : '#1e293b',
                    color: done || active ? '#000' : '#64748b',
                    border: `1px solid ${done ? '#22c55e' : active ? '#f59e0b' : '#334155'}`
                  }}>
                    {wp.label}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* AI Comparative Analytics */}
      <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', fontSize: 10 }}>
        <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
          AI MACRO-DETOUR EFFICIENCY:
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', marginBottom: 2 }}>
          <span>Sequential Junction Flush:</span>
          <strong>+{metrics.directJunctionDelaySec}s Delay</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#22c55e', marginBottom: 2 }}>
          <span>North Side-Street Route:</span>
          <strong>{metrics.macroDetourDurationSec}s Continuous</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', borderTop: '1px solid #334155', paddingTop: 3, fontWeight: 700 }}>
          <span>Net Clearance Saved:</span>
          <strong>{metrics.netTimeSavedSec}s (-62.5%)</strong>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  const [selectedCase, setSelectedCase] = useState(1);

  // Case 1 Hooks
  const case1Stream = useTrafficStream(selectedCase === 1);
  const case1Signal = useTrafficSignal();

  // Case 3 Hook
  const case3 = useCase3TrafficStream();

  // ESP32 Web Serial Hardware Synchronization (Zero-Fail Fallback)
  const {
    isConnected: isSerialConnected,
    portName: serialPortName,
    lastByteSent: serialLastByte,
    connectESP32,
    disconnectESP32,
    sendByteCommand,
  } = useHardwareSerial();

  // ESP32 Wi-Fi V2I HTTP Actuation (Wireless Hotspot Demo)
  const {
    espIp,
    updateEspIp,
    isWifiEnabled,
    toggleWifi,
    lastWifiByteSent,
    wifiStatus,
    lastResponseTime,
    isConnecting: isWifiConnecting,
    lastError: wifiLastError,
    linkSuccess: wifiLinkSuccess,
    saveAndLink,
    sendWifiCommand,
    testPing,
  } = useHardwareWifi();

  const [showHardwareMenu, setShowHardwareMenu] = useState(false);
  const [tempIp, setTempIp] = useState(espIp);

  useEffect(() => {
    setTempIp(espIp);
  }, [espIp]);

  useEffect(() => {
    if (selectedCase === 1) {
      case1Stream.registerCallbacks(
        case1Signal.onAmbulanceOnAvenue,
        case1Signal.onAmbulanceCleared,
        case1Signal.onNormalCycle
      );
    }
  }, [selectedCase, case1Stream.registerCallbacks, case1Signal.onAmbulanceOnAvenue, case1Signal.onAmbulanceCleared, case1Signal.onNormalCycle]);

  // Synchronize simulation signal states in real-time to physical ESP32
  useEffect(() => {
    let targetByte = 'R';

    if (selectedCase === 1) {
      // ── In CASE 01 (West Approach Monitoring): ──────────────────────────
      // - If signalPhase === 'W_GREEN' or signalPhase === 'E_RESUME': send 'P'.
      // - If signalPhase === 'W_RELEASE': send 'G'.
      // - If transitioning from West Green (Yellow phase): send 'Y'.
      // - For all other phases (ALL_RED, N_RELEASE, S_RELEASE, E_RELEASE): send 'R'.
      const phase = case1Signal.phase;
      const signalPhase = case1Signal.signalPhase;

      if (phase === 'W_GREEN' || phase === 'E_RESUME' || (signalPhase === 'W_GREEN' && phase !== 'NORMAL_CYCLE')) {
        targetByte = 'P';
      } else if (case1Signal.wYellow) {
        targetByte = 'Y';
      } else if (phase === 'W_RELEASE' || signalPhase === 'W_RELEASE' || (phase === 'NORMAL_CYCLE' && case1Signal.wGreen)) {
        targetByte = 'G';
      } else {
        targetByte = 'R';
      }
    } else if (selectedCase === 3) {
      // ── In CASE 03 (Ambulance A South Corridor & Post-Clearance Cycle): ──
      // - Before dispatch (IDLE_STANDBY / ALL_RED): send 'R'.
      // - Upon [ENTER] dispatch while Ambulance A's corridor is flushing: send 'P'.
      // - During Post-Clearance Normal Traffic Orchestration:
      //   - When monitored approach is Green: send 'G'.
      //   - During Yellow transition: send 'Y'.
      //   - When Red: send 'R'.
      if (!case3.isSimulationRunning || case3.signals.phase === 'ALL_RED') {
        targetByte = 'R';
      } else if (!case3.trafficCycleActive) {
        targetByte = 'P';
      } else {
        // Monitored approach is South approach corridor
        if (case3.signals.nYellow) {
          targetByte = 'Y';
        } else if (case3.signals.nGreen) {
          targetByte = 'G';
        } else {
          targetByte = 'R';
        }
      }
    }

    sendByteCommand(targetByte);
    sendWifiCommand(targetByte);
  }, [
    selectedCase,
    case1Signal.phase,
    case1Signal.signalPhase,
    case1Signal.wGreen,
    case1Signal.wYellow,
    case3.isSimulationRunning,
    case3.trafficCycleActive,
    case3.signals.phase,
    case3.signals.nGreen,
    case3.signals.nYellow,
    sendByteCommand,
    sendWifiCommand
  ]);

  const cases = [
    {
      id: 1,
      label: 'CASE 01',
      title: 'Ambulance Priority Preemption',
      description: 'BLE-triggered emergency vehicle preemption at a 4-way intersection. The traffic signal system yields a green corridor for an incoming ambulance, while all other directions are held at red.',
      tags: ['4-Way Signal Control', 'BLE Preemption', 'Real-Time Traffic'],
      color: '#22c55e',
      available: true
    },
    {
      id: 2,
      label: 'CASE 02',
      title: 'Adaptive Signal Timing',
      description: 'AI-powered signal timing that dynamically adjusts green phase durations based on real-time vehicle queue density detected on each arm of the intersection.',
      tags: ['Queue Detection', 'AI Optimization', 'Dynamic Timing'],
      color: '#60a5fa',
      available: false
    },
    {
      id: 3,
      label: 'CASE 03',
      title: 'Dual-Ambulance Conflict & Macro-Detour',
      description: 'Two equal-priority emergency vehicles converge at the central junction simultaneously. AI detects deadlock, grants Ambulance A the South corridor right-of-way, and dynamically reroutes Ambulance B through the North block side streets to prevent city gridlock.',
      tags: ['Deadlock Detection', 'Macro-Detour', 'Dual BLE Priority', 'Side-Street Routing'],
      color: '#f59e0b',
      available: true
    },
  ];

  if (!started) {
    return (
      <div style={{ minHeight:'100vh',background:'radial-gradient(ellipse at 50% 0%,#0f2027 0%,#020617 60%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px',fontFamily:"'Courier New',monospace" }}>
        <div style={{ textAlign:'center',marginBottom:48 }}>
          <div style={{ fontSize:11,letterSpacing:6,color:'#64748b',marginBottom:8 }}>DIGITAL TWIN COMMAND DASHBOARD</div>
          <h1 style={{ fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:900,color:'#22c55e',letterSpacing:'0.25em',margin:0,textShadow:'0 0 40px rgba(34,197,94,0.4)' }}>SEMTOS CMD</h1>
          <p style={{ color:'#475569',fontSize:13,marginTop:10,maxWidth:480,lineHeight:1.7 }}>Select a simulation case to initialize the 3D digital twin environment.</p>
        </div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:24,width:'100%',maxWidth:1000 }}>
          {cases.map((c)=>(
            <div key={c.id} onClick={()=>{
                if (c.available) {
                  setSelectedCase(c.id);
                  setStarted(true);
                }
              }}
              style={{ background:c.available?`linear-gradient(135deg,rgba(2,6,23,0.95) 0%,rgba(${c.id===1?'34,197,94':c.id===2?'96,165,250':'245,158,11'},0.08) 100%)`:'rgba(2,6,23,0.6)',border:`1.5px solid ${c.available?c.color:'#1e293b'}`,borderRadius:16,padding:'28px 24px',cursor:c.available?'pointer':'not-allowed',position:'relative',transition:'transform 0.2s,box-shadow 0.2s',boxShadow:c.available?`0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`:'0 4px 24px rgba(0,0,0,0.4)',opacity:c.available?1:0.55,overflow:'hidden' }}
              onMouseEnter={e=>{if(c.available){e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow=`0 0 48px ${c.color}44,0 8px 32px rgba(0,0,0,0.6)`;}}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow=c.available?`0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`:'0 4px 24px rgba(0,0,0,0.4)';}}
            >
              {!c.available&&<div style={{ position:'absolute',top:16,right:16,background:'#1e293b',color:'#64748b',fontSize:9,letterSpacing:2,padding:'3px 10px',borderRadius:20,border:'1px solid #334155' }}>COMING SOON</div>}
              {c.available&&<div style={{ position:'absolute',top:16,right:16,display:'flex',alignItems:'center',gap:5 }}><div style={{ width:7,height:7,borderRadius:'50%',background:c.color,boxShadow:`0 0 8px ${c.color}`,animation:'pulse 2s infinite' }}/><span style={{ fontSize:9,letterSpacing:2,color:c.color }}>READY</span></div>}
              <div style={{ fontSize:10,letterSpacing:4,color:c.color,marginBottom:12,opacity:0.8 }}>{c.label}</div>
              <h2 style={{ fontSize:18,fontWeight:700,color:c.available?'#f1f5f9':'#475569',margin:'0 0 12px 0',lineHeight:1.3 }}>{c.title}</h2>
              <p style={{ fontSize:12,color:c.available?'#94a3b8':'#334155',lineHeight:1.7,margin:'0 0 20px 0' }}>{c.description}</p>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:24 }}>
                {c.tags.map(tag=>(<span key={tag} style={{ fontSize:9,letterSpacing:1,padding:'3px 8px',borderRadius:4,background:c.available?`${c.color}15`:'rgba(30,41,59,0.5)',color:c.available?c.color:'#334155',border:`1px solid ${c.available?`${c.color}30`:'#1e293b'}` }}>{tag}</span>))}
              </div>
              <div style={{ padding:'10px 0',borderTop:`1px solid ${c.available?`${c.color}30`:'#1e293b'}`,fontSize:11,letterSpacing:3,color:c.available?c.color:'#334155',fontWeight:700 }}>
                {c.available?'▶ LAUNCH SIMULATION':'⊘ NOT AVAILABLE'}
              </div>
            </div>
          ))}
        </div>
        <p style={{ color:'#1e293b',fontSize:11,marginTop:36,letterSpacing:2 }}>SEMTOS - SMART EMERGENCY MANAGEMENT TRAFFIC OPTIMIZATION SYSTEM</p>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-slate-200 font-sans">
      <div className="absolute inset-0 z-0">
        <Canvas3D
          selectedCase={selectedCase}
          ambulancePosition={case1Stream.ambulancePosition}
          ambulanceA={case3.ambulanceA}
          ambulanceB={case3.ambulanceB}
          activeCamFollow={case3.activeCamFollow}
          onSetCamFollow={case3.setCamFollow}
          isSimulationRunning={selectedCase === 1 ? case1Stream.isSimulationRunning : case3.isSimulationRunning}
          isPreempted={selectedCase === 1 ? case1Signal.isPreempted : (case3.deadlockDetected && !case3.trafficCycleActive)}
          isFrozen={selectedCase === 1 ? case1Stream.isFrozen : case3.isFrozen}
          signalPhase={selectedCase === 1 ? case1Signal.signalPhase : case3.signals.phase}
          nGreen={selectedCase === 1 ? case1Signal.nGreen : case3.signals.nGreen}
          sGreen={selectedCase === 1 ? case1Signal.sGreen : case3.signals.sGreen}
          eGreen={selectedCase === 1 ? case1Signal.eGreen : case3.signals.eGreen}
          wGreen={selectedCase === 1 ? case1Signal.wGreen : case3.signals.wGreen}
          nYellow={selectedCase === 1 ? case1Signal.nYellow : case3.signals.nYellow}
          sYellow={selectedCase === 1 ? case1Signal.sYellow : case3.signals.sYellow}
          eYellow={selectedCase === 1 ? case1Signal.eYellow : case3.signals.eYellow}
          wYellow={selectedCase === 1 ? case1Signal.wYellow : case3.signals.wYellow}
        />
      </div>

      {/* Top Deadlock Notification Alert Banner for Case 3 */}
      {selectedCase === 3 && case3.deadlockDetected && !case3.trafficCycleActive && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 110,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(220, 38, 38, 0.95)',
            border: '2px solid #ef4444',
            boxShadow: '0 0 35px rgba(239, 68, 68, 0.7)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 10,
            fontFamily: 'monospace',
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'pulse 1.2s infinite'
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>DEADLOCK DETECTED: AMBULANCE B REROUTING VIA NORTH BLOCK</span>
            <span style={{ fontSize: 18 }}>🔄</span>
          </div>
          <div style={{
            background: 'rgba(2, 6, 23, 0.90)',
            border: '1px solid #f59e0b',
            color: '#fcd34d',
            padding: '3px 14px',
            borderRadius: 20,
            fontSize: 11,
            fontFamily: 'monospace',
            letterSpacing: 1
          }}>
            AMBULANCE A CORRIDOR RIGHT-OF-WAY • AMBULANCE B MACRO-DETOUR ACTIVE
          </div>
        </div>
      )}

      {/* Top Post-Clearance Orchestration Success Banner for Case 3 */}
      {selectedCase === 3 && case3.trafficCycleActive && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 110,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none'
        }}>
          <div style={{
            background: 'rgba(5, 150, 105, 0.95)',
            border: '2px solid #10b981',
            boxShadow: '0 0 32px rgba(16, 185, 129, 0.55)',
            color: '#fff',
            padding: '8px 24px',
            borderRadius: 10,
            fontFamily: 'monospace',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 1.2,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span>AMBULANCES DELIVERED • NORMAL TRAFFIC ORCHESTRATION ACTIVE</span>
          </div>
        </div>
      )}

      {/* ── Top-Right Hardware Control Bar (Dual USB Serial & Wi-Fi V2I) ── */}
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'monospace'
      }}>
        {/* USB Serial Indicator / Button */}
        {!isSerialConnected ? (
          <button
            onClick={connectESP32}
            title="Connect USB Serial (Zero-Fail 115200 baud Fallback)"
            style={{
              background: 'rgba(2, 6, 23, 0.94)',
              color: '#38bdf8',
              border: '1.5px solid #0284c7',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 14px rgba(2, 132, 199, 0.35)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(14, 165, 233, 0.18)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(2, 6, 23, 0.94)';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(2, 132, 199, 0.35)';
            }}
          >
            <span>🔌</span>
            <span>USB SERIAL</span>
          </button>
        ) : (
          <div style={{
            background: 'rgba(2, 6, 23, 0.94)',
            border: `1.5px solid ${
              serialLastByte === 'P' || serialLastByte === 'G'
                ? '#22c55e'
                : serialLastByte === 'Y'
                ? '#facc15'
                : '#ef4444'
            }`,
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 0 16px ${
              serialLastByte === 'P' || serialLastByte === 'G'
                ? 'rgba(34, 197, 94, 0.35)'
                : serialLastByte === 'Y'
                ? 'rgba(250, 204, 21, 0.35)'
                : 'rgba(239, 68, 68, 0.35)'
            }`,
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background:
                serialLastByte === 'P'
                  ? '#10b981'
                  : serialLastByte === 'G'
                  ? '#22c55e'
                  : serialLastByte === 'Y'
                  ? '#facc15'
                  : '#ef4444',
              boxShadow: `0 0 10px ${
                serialLastByte === 'P'
                  ? '#10b981'
                  : serialLastByte === 'G'
                  ? '#22c55e'
                  : serialLastByte === 'Y'
                  ? '#facc15'
                  : '#ef4444'
              }`,
              animation: serialLastByte === 'P' ? 'pulse 0.8s infinite' : 'none'
            }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc' }}>
              ⚡ USB: <strong style={{ color: serialLastByte === 'P' ? '#10b981' : serialLastByte === 'G' ? '#22c55e' : serialLastByte === 'Y' ? '#facc15' : '#ef4444' }}>[{serialLastByte || 'R'}]</strong>
            </span>
            <button
              onClick={disconnectESP32}
              title="Disconnect USB"
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Wi-Fi V2I HTTP Indicator / Button */}
        {!isWifiEnabled ? (
          <button
            onClick={() => toggleWifi(true)}
            title="Enable Wireless V2I (HTTP fetch to ESP32 IP)"
            style={{
              background: 'rgba(2, 6, 23, 0.94)',
              color: '#a855f7',
              border: '1.5px solid #9333ea',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 14px rgba(168, 85, 247, 0.3)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.18)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(2, 6, 23, 0.94)';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(168, 85, 247, 0.3)';
            }}
          >
            <span>📶</span>
            <span>WI-FI V2I</span>
          </button>
        ) : (
          <div style={{
            background: 'rgba(2, 6, 23, 0.94)',
            border: `1.5px solid ${wifiStatus === 'ERROR' ? '#ef4444' : '#a855f7'}`,
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 0 16px ${wifiStatus === 'ERROR' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(168, 85, 247, 0.35)'}`,
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: wifiStatus === 'ERROR' ? '#ef4444' : (lastWifiByteSent === 'P' ? '#10b981' : lastWifiByteSent === 'G' ? '#22c55e' : lastWifiByteSent === 'Y' ? '#facc15' : '#ef4444'),
              boxShadow: `0 0 10px ${wifiStatus === 'ERROR' ? '#ef4444' : '#a855f7'}`
            }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc' }}>
              📶 V2I ({espIp}): <strong style={{ color: '#c084fc' }}>[{lastWifiByteSent || 'R'}]</strong>
            </span>
            <button
              onClick={() => toggleWifi(false)}
              title="Disable Wi-Fi Actuation"
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Settings Gear (Open Drawer / IP Config) */}
        <button
          onClick={() => setShowHardwareMenu(prev => !prev)}
          title="Hardware Actuation Settings & Manual Test"
          style={{
            background: showHardwareMenu ? '#334155' : 'rgba(2, 6, 23, 0.94)',
            color: '#94a3b8',
            border: '1.5px solid #475569',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease',
          }}
        >
          ⚙️
        </button>

        {/* ── EXPANDABLE HARDWARE CONFIGURATION CARD ── */}
        {showHardwareMenu && (
          <div style={{
            position: 'absolute',
            top: 48,
            right: 0,
            width: 320,
            background: 'rgba(2, 6, 23, 0.98)',
            border: '1.5px solid #334155',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.8), 0 0 24px rgba(56, 189, 248, 0.2)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            zIndex: 130
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', letterSpacing: 1.2 }}>
                HARDWARE ACTUATION CONFIG
              </span>
              <button
                onClick={() => setShowHardwareMenu(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            {/* Wi-Fi V2I IP Settings */}
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                <span>📶 ESP32 WI-FI IP (HOTSPOT / SOFTAP):</span>
                {wifiStatus === 'LINKED' && (
                  <span style={{ color: '#22c55e', fontWeight: 800 }}>ONLINE ({lastResponseTime || 12}ms)</span>
                )}
                {wifiStatus === 'CONNECTING' && (
                  <span style={{ color: '#facc15', fontWeight: 800 }}>TESTING...</span>
                )}
                {wifiStatus === 'ERROR' && (
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>OFFLINE</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={tempIp}
                  onChange={e => setTempIp(e.target.value)}
                  placeholder="e.g. 192.168.4.1"
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: `1px solid ${wifiStatus === 'ERROR' ? '#ef4444' : wifiStatus === 'LINKED' ? '#22c55e' : '#475569'}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: '#f8fafc',
                    fontSize: 11,
                    fontFamily: 'monospace'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      saveAndLink(tempIp, 'R');
                    }
                  }}
                />
                <button
                  onClick={() => saveAndLink(tempIp, 'R')}
                  disabled={isWifiConnecting}
                  style={{
                    background: isWifiConnecting
                      ? '#475569'
                      : wifiLinkSuccess
                      ? '#059669'
                      : wifiStatus === 'ERROR'
                      ? '#b91c1c'
                      : '#9333ea',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: isWifiConnecting ? 'wait' : 'pointer',
                    boxShadow: isWifiConnecting ? 'none' : '0 0 10px rgba(147, 51, 234, 0.4)',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isWifiConnecting ? '⏳ TESTING...' : wifiLinkSuccess ? '✅ LINKED!' : 'SAVE & LINK'}
                </button>
              </div>

              {/* Endpoint Target info */}
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Target: <code>http://{espIp}/signal?cmd=...</code></span>
                <span>Port: <strong>80 (HTTP)</strong></span>
              </div>

              {/* Success Notification */}
              {wifiLinkSuccess && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', borderRadius: 6, fontSize: 10, color: '#4ade80' }}>
                  ✅ <strong>Handshake Confirmed:</strong> ESP32 responded on <code>http://{espIp}</code>!
                </div>
              )}

              {/* Diagnostic Error Banner */}
              {wifiStatus === 'ERROR' && wifiLastError && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.6)',
                  borderRadius: 6,
                  fontSize: 10,
                  color: '#fca5a5'
                }}>
                  <div style={{ fontWeight: 800, color: '#f87171', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚠️</span>
                    <span>CANNOT REACH ESP32 AT {espIp}</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 6 }}>
                    {wifiLastError}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(239, 68, 68, 0.3)', paddingTop: 5, fontSize: 9, color: '#e2e8f0' }}>
                    <strong>Verify checklist:</strong>
                    <ul style={{ paddingLeft: 14, margin: '3px 0 0 0', lineHeight: 1.4 }}>
                      <li>Ensure ESP32 is flashed with <code>firmware/esp32_traffic_light.ino</code>.</li>
                      <li>Check Arduino Serial Monitor for the actual IP assigned by your hotspot.</li>
                      <li>Ensure this laptop & ESP32 are on the <strong>same</strong> Wi-Fi/Hotspot.</li>
                      <li><strong>Presentation fallback:</strong> Click <strong>[🔌 USB SERIAL]</strong> for instant wired control without Wi-Fi!</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Test Triggers */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                MANUAL HARDWARE OVERRIDE (TEST LEDS):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => { sendByteCommand('P'); testPing('P'); }}
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  🟢 TEST 'P' (PREEMPTION)
                </button>
                <button
                  onClick={() => { sendByteCommand('G'); testPing('G'); }}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  🟢 TEST 'G' (GREEN)
                </button>
                <button
                  onClick={() => { sendByteCommand('Y'); testPing('Y'); }}
                  style={{ background: '#ca8a04', color: '#000', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  🟡 TEST 'Y' (YELLOW)
                </button>
                <button
                  onClick={() => { sendByteCommand('R'); testPing('R'); }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  🔴 TEST 'R' (RED)
                </button>
              </div>
            </div>

            {/* Recommendation note */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 6, fontSize: 9, color: '#64748b', lineHeight: 1.4 }}>
              💡 <strong>Presentation Tip:</strong> Both USB and Wi-Fi run concurrently. You can demo Wi-Fi V2I wirelessly via phone hotspot, with USB Serial connected as a fail-safe.
            </div>
          </div>
        )}
      </div>

      {/* Primary HUD depending on selected case */}
      {selectedCase === 1 ? (
        <Case1SignalHUD
          phase={case1Signal.phase}
          nGreen={case1Signal.nGreen}
          sGreen={case1Signal.sGreen}
          eGreen={case1Signal.eGreen}
          wGreen={case1Signal.wGreen}
          nYellow={case1Signal.nYellow}
          sYellow={case1Signal.sYellow}
          eYellow={case1Signal.eYellow}
          wYellow={case1Signal.wYellow}
          timeRemaining={case1Signal.timeRemaining}
          onBackToMenu={() => setStarted(false)}
          onSwitchCase={(caseId) => setSelectedCase(caseId)}
        />
      ) : (
        <Case3TelemetryHUD
          case3={case3}
          onBackToMenu={() => setStarted(false)}
          onSwitchCase={(caseId) => setSelectedCase(caseId)}
        />
      )}
    </main>
  );
}
