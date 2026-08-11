import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useTrafficStream(useMockData = true) {
  const [state, setState] = useState({
    // Start off-screen on the side street facing down the Z axis
    ambulancePosition: { x: -85, y: 0.5, z: -40, rotation: 0 },
    distanceToIntersection: 2000,
    isPreempted: false,
    flushDuration: 12,
    systemStatus: 'NOMINAL',
    signalState: 'RED',
    manualOverride: false,
    auditLogs: [],
  });

  const [isSimulationRunning, setIsSimulationRunning] = useState(false);
  const stateRef = useRef(state);
  const simulationRunningRef = useRef(isSimulationRunning);

  useEffect(() => {
    simulationRunningRef.current = isSimulationRunning;
  }, [isSimulationRunning]);

  const updateState = useCallback((newState) => {
    setState((prev) => {
      const updated = { ...prev, ...newState };
      stateRef.current = updated;
      return updated;
    });
  }, []);

  const addAuditLog = useCallback((message) => {
    const now = new Date();
    const timestamp = `[${now.toTimeString().split(' ')[0]}]`;
    setState((prev) => {
      const newLogs = [...prev.auditLogs, { id: Date.now() + Math.random(), timestamp, message }];
      if (newLogs.length > 50) newLogs.shift();
      return { ...prev, auditLogs: newLogs };
    });
  }, []);

  const toggleManualOverride = useCallback(() => {
    const newVal = !stateRef.current.manualOverride;
    updateState({ manualOverride: newVal });
    addAuditLog(`Manual override ${newVal ? 'ACTIVATED' : 'DEACTIVATED'}.`);
  }, [updateState, addAuditLog]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // ENTER: Dispatch Ambulance
      if (e.code === 'Enter') {
        e.preventDefault(); 
        setIsSimulationRunning(prev => {
          if (prev) return prev; // Ignore spam if already running
          addAuditLog('Ambulance Dispatched!');
          return true;
        });
      }
      
      // L: Toggle Traffic Light manually
      if (e.code === 'KeyL') {
        e.preventDefault();
        setState(prev => {
          const nextState = prev.signalState === 'RED' ? 'GREEN' : 'RED';
          addAuditLog(`Traffic Light manually set to ${nextState}.`);
          return { ...prev, signalState: nextState };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addAuditLog]);

  useEffect(() => {
    if (useMockData) {
      addAuditLog('System initialized in MOCK mode. Press ENTER to start simulation.');
      
      let x = -85;
      let z = -40;
      let rotation = 0;
      
      const interval = setInterval(() => {
        if (stateRef.current.manualOverride) return; 
        if (!simulationRunningRef.current) return; 

        // Segment 1: Drive down the side street (increasing Z)
        if (z < -4.2) {
          z += 0.4; // Speed
          rotation = 0; // facing +Z direction
        } else if (x > -35 && x < -15) {
          // Slight swerve for visual effect when crossing intersection
          x += 0.4;
          rotation = -Math.PI / 2 + 0.1;
        } else {
          // Straight run down the avenue
          x += 0.4;
          rotation = -Math.PI / 2;
        }
        
        // Reset the loop once it drives off into the distance
        if (x > 150) {
          x = -85;
          z = -40;
          rotation = 0;
          addAuditLog('Ambulance has exited. Waiting for next dispatch (Press Enter).');
          setIsSimulationRunning(false); // Stop the simulation loop
        }

        const distanceToIntersection = Math.max(0, Math.abs(x - 0) * 10 + Math.abs(z - 0) * 10);
        
        // Preemption is active as long as it is on the main avenue but hasn't passed the signal
        const isPreempted = x > -85 && x < 5;
        const systemStatus = isPreempted ? 'EMERGENCY_PREEMPTION_ACTIVE' : 'NOMINAL';

        // Log the exact moment it makes the turn
        if (Math.abs(x - -85) < 0.3 && x > -85 && z >= -4.5) {
          addAuditLog('Vehicle turned onto Main Avenue.');
          addAuditLog('Phase C Actuation -> Signal GREEN.');
          updateState({ signalState: 'GREEN' });
        }

        updateState({
          ambulancePosition: { x, y: 0.5, z, rotation },
          distanceToIntersection,
          isPreempted,
          systemStatus
        });

      }, 50);

      return () => clearInterval(interval);
    } else {
      addAuditLog('Connecting to Socket.io backend...');
      const socket = io('http://localhost:5000');
      
      socket.on('connect', () => {
        addAuditLog('Socket connected successfully.');
      });

      socket.on('preemption_event', (data) => {
        if (!stateRef.current.manualOverride) {
           updateState(data);
        }
      });

      return () => socket.disconnect();
    }
  }, [useMockData, updateState, addAuditLog]);

  const effectiveIsPreempted = state.manualOverride || state.isPreempted;
  
  return {
    ...state,
    isPreempted: effectiveIsPreempted,
    toggleManualOverride,
    isSimulationRunning
  };
}
