"use client";

import React, { useState, useEffect } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { Canvas3D } from '../../components/Canvas3D';

function SignalHUD({ phase, nGreen, sGreen, eGreen, wGreen, nYellow, sYellow, eYellow, wYellow, timeRemaining }) {
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
    <div style={{ position:'fixed',top:20,left:20,zIndex:100,background:'rgba(2,6,23,0.88)',border:`1.5px solid ${p.color}`,borderRadius:10,padding:'12px 18px',fontFamily:'monospace',minWidth:240,boxShadow:`0 0 18px ${p.color}55` }}>
      <div style={{ fontSize:11,color:'#94a3b8',letterSpacing:2,marginBottom:4 }}>TRAFFIC SIGNAL - CASE 01</div>
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

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  const { ambulancePosition, isFrozen, registerCallbacks } = useTrafficStream(true);
  const { phase, nGreen,sGreen,eGreen,wGreen, nYellow,sYellow,eYellow,wYellow, isPreempted, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle, signalPhase, timeRemaining } = useTrafficSignal();

  useEffect(() => {
    registerCallbacks(onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle);
  }, [registerCallbacks, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle]);

  const cases = [
    { id:1,label:'CASE 01',title:'Ambulance Priority Preemption',description:'BLE-triggered emergency vehicle preemption at a 4-way intersection. The traffic signal system yields a green corridor for an incoming ambulance, while all other directions are held at red.',tags:['4-Way Signal Control','BLE Preemption','Real-Time Traffic'],color:'#22c55e',available:true },
    { id:2,label:'CASE 02',title:'Adaptive Signal Timing',description:'AI-powered signal timing that dynamically adjusts green phase durations based on real-time vehicle queue density detected on each arm of the intersection.',tags:['Queue Detection','AI Optimization','Dynamic Timing'],color:'#60a5fa',available:false },
    { id:3,label:'CASE 03',title:'Multi-Intersection Coordination',description:'City-wide green wave coordination across a grid of intersections. Vehicles moving at the speed limit experience a continuous sequence of green lights along a corridor.',tags:['Green Wave','Multi-Junction','V2I Communication'],color:'#a78bfa',available:false },
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
            <div key={c.id} onClick={()=>c.available&&setStarted(true)}
              style={{ background:c.available?`linear-gradient(135deg,rgba(2,6,23,0.95) 0%,rgba(${c.id===1?'34,197,94':c.id===2?'96,165,250':'167,139,250'},0.08) 100%)`:'rgba(2,6,23,0.6)',border:`1.5px solid ${c.available?c.color:'#1e293b'}`,borderRadius:16,padding:'28px 24px',cursor:c.available?'pointer':'not-allowed',position:'relative',transition:'transform 0.2s,box-shadow 0.2s',boxShadow:c.available?`0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`:'0 4px 24px rgba(0,0,0,0.4)',opacity:c.available?1:0.55,overflow:'hidden' }}
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
          ambulancePosition={ambulancePosition}
          isPreempted={isPreempted}
          isFrozen={isFrozen}
          signalPhase={signalPhase}
          nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
          nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
        />
      </div>
      <SignalHUD phase={phase} nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen} nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow} timeRemaining={timeRemaining} />
    </main>
  );
}
