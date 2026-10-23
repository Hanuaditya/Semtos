// hooks/useTrafficStream.js
import { useState, useEffect, useRef, useCallback } from 'react';

// Ambulance starts far West on the main avenue and drives East (along +X).
const AMB_START_X      = -120;
const AMB_LANE_Z       =  -6.0;  // East-bound lane centre Z
const AMB_SPEED_DX     =   0.6;  // units per 50 ms tick (~12 u/s)
const AMB_WRAP_X       =  150;
const AVE_ENTRY_X      =  -85;   // fires W_GREEN signal
const CLEARED_X        =   15;   // fires N_RELEASE sequential sequence

export function useTrafficStream(useMockData = true) {
  const [state, setState] = useState({
    ambulancePosition: { x: AMB_START_X, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
    isSimulationRunning: false,
    isFrozen: false,
    auditLogs: [],
  });

  const simRunningRef        = useRef(false);
  const isFrozenRef          = useRef(false);
  const onAvenueCallbackRef  = useRef(null);
  const onClearedCallbackRef = useRef(null);
  const onNormalCycleCallbackRef = useRef(null);
  const avenueEventFiredRef  = useRef(false);
  const clearedEventFiredRef = useRef(false);
  const xRef                 = useRef(AMB_START_X);

  const update = useCallback((patch) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  const addLog = useCallback((msg) => {
    setState(prev => {
      const logs = [...prev.auditLogs, {
        id: Date.now() + Math.random(),
        timestamp: '[' + new Date().toTimeString().split(' ')[0] + ']',
        message: msg,
      }];
      if (logs.length > 50) logs.shift();
      return { ...prev, auditLogs: logs };
    });
  }, []);

  // page.js calls this once to wire up signal-hook callbacks
  const registerCallbacks = useCallback((onAvenue, onCleared, onNormal) => {
    onAvenueCallbackRef.current      = onAvenue;
    onClearedCallbackRef.current     = onCleared;
    onNormalCycleCallbackRef.current = onNormal || null;
  }, []);

  const dispatchCase1 = useCallback(() => {
    if (simRunningRef.current) return;
    simRunningRef.current = true;
    avenueEventFiredRef.current  = false;
    clearedEventFiredRef.current = false;
    xRef.current = AMB_START_X;
    addLog('Ambulance dispatched — heading East on Main Avenue.');
    update({ isSimulationRunning: true });
  }, [addLog, update]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    update({ isFrozen: isFrozenRef.current });
    addLog('System ' + (isFrozenRef.current ? 'FROZEN' : 'UNFROZEN') + '.');
  }, [addLog, update]);

  // ENTER key: dispatch ambulance  |  N key: start normal cycle  |  F key: freeze
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        dispatchCase1();
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        if (onNormalCycleCallbackRef.current) {
          onNormalCycleCallbackRef.current();
          addLog('Normal cycle activated by operator.');
        }
      }
      if (e.code === 'KeyF') {
        toggleFreeze();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatchCase1, toggleFreeze, addLog]);

  // Ambulance movement loop
  useEffect(() => {
    if (!useMockData) return;
    addLog('System ready. Press ENTER to dispatch ambulance.');
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;
      xRef.current += AMB_SPEED_DX;
      const x = xRef.current;

      if (!avenueEventFiredRef.current && x >= AVE_ENTRY_X) {
        avenueEventFiredRef.current = true;
        addLog('Ambulance on avenue — West corridor GREEN.');
        if (onAvenueCallbackRef.current) onAvenueCallbackRef.current();
      }
      if (!clearedEventFiredRef.current && x >= CLEARED_X) {
        clearedEventFiredRef.current = true;
        addLog('Ambulance cleared junction — sequential release begins.');
        if (onClearedCallbackRef.current) onClearedCallbackRef.current();
      }
      if (x > AMB_WRAP_X) {
        simRunningRef.current = false;
        xRef.current = AMB_START_X;
        addLog('Ambulance exited. Press ENTER for next run.');
        update({
          isSimulationRunning: false,
          ambulancePosition: { x: AMB_START_X, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
        });
        return;
      }
      update({ ambulancePosition: { x, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 } });
    }, 50);
    return () => clearInterval(interval);
  }, [useMockData, addLog, update]);

  return {
    ambulancePosition: state.ambulancePosition,
    isSimulationRunning: state.isSimulationRunning,
    isFrozen: state.isFrozen,
    auditLogs: state.auditLogs,
    isPreempted: false,
    registerCallbacks,
    dispatchCase1,
    toggleFreeze,
  };
}
