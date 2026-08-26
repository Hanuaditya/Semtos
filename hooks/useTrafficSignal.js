import { useState, useEffect, useRef, useCallback } from 'react';

// ── Case 1 Signal Phase Sequence ──────────────────────────────────────────────
//
//  ALL_RED       — Initial gridlock. All 4 arms red. Cars queued.
//  W_GREEN       — Ambulance preemption. East-facing lane (type E) gets green.
//  E_RESUME      — Ambulance cleared. E cars resume and move freely. (5 s)
//  N_RELEASE     — North green, others red.                     (15 s)
//  S_RELEASE     — South green, others red.                     (15 s)
//  W_RELEASE     — Westbound green.                             (15 s)
//  E_RELEASE     — Eastbound green.                             (15 s)
//  NORMAL_CYCLE  — Sequential: N(15s) → S(15s) → W(15s) → E(15s) → repeat
// ─────────────────────────────────────────────────────────────────────────────

const RELEASE_DURATION = 15_000; // ms — used for both release phases AND normal cycle arms
const RESUME_DURATION  = 5_000;  // ms — post-ambulance east-resume window

// Normal cycle: one arm at a time, same 15-second green each
const SEQ_ARMS = ['N', 'S', 'W', 'E'];

export function useTrafficSignal() {
  const [phase, setPhase]               = useState('ALL_RED');
  const [seqIdx, setSeqIdx]             = useState(0);   // index into SEQ_ARMS for normal cycle
  const [timeRemaining, setTimeRemaining] = useState(RELEASE_DURATION);

  const phaseRef  = useRef('ALL_RED');
  const seqIdxRef = useRef(0);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { seqIdxRef.current = seqIdx; }, [seqIdx]);

  // ── External triggers called by page.js ──────────────────────────────────
  const onAmbulanceOnAvenue = useCallback(() => {
    // Trigger preemption from ANY phase — during normal cycle, cut all reds immediately
    const current = phaseRef.current;
    if (current !== 'W_GREEN' && current !== 'E_RESUME') {
      setPhase('W_GREEN');
      phaseRef.current = 'W_GREEN';
      setSeqIdx(0);
      seqIdxRef.current = 0;
    }
  }, []);

  const onAmbulanceCleared = useCallback(() => {
    if (phaseRef.current === 'W_GREEN') {
      setPhase('E_RESUME');
      phaseRef.current = 'E_RESUME';
      setTimeRemaining(RESUME_DURATION);
    }
  }, []);

  const onNormalCycle = useCallback(() => {
    // Allow jumping to normal cycle from any state except mid-ambulance run
    const cur = phaseRef.current;
    if (cur !== 'W_GREEN' && cur !== 'E_RESUME') {
      setPhase('NORMAL_CYCLE');
      phaseRef.current = 'NORMAL_CYCLE';
      setSeqIdx(0);
      seqIdxRef.current = 0;
      setTimeRemaining(RELEASE_DURATION);
    }
  }, []);

  // ── Sequential release timer (E_RESUME → N → S → W → E → NORMAL) ────────
  // This handles the post-ambulance one-by-one release phases.
  useEffect(() => {
    if (
      phase !== 'E_RESUME'  &&
      phase !== 'N_RELEASE' &&
      phase !== 'S_RELEASE' &&
      phase !== 'W_RELEASE' &&
      phase !== 'E_RELEASE'
    ) return;

    const id = setInterval(() => {
      setTimeRemaining(prev => {
        const next = prev - 100;
        if (next <= 0) {
          setPhase(cur => {
            if (cur === 'E_RESUME')  return 'N_RELEASE';
            if (cur === 'N_RELEASE') return 'S_RELEASE';
            if (cur === 'S_RELEASE') return 'W_RELEASE';
            if (cur === 'W_RELEASE') return 'E_RELEASE';
            return 'NORMAL_CYCLE'; // E_RELEASE → NORMAL_CYCLE
          });
          setTimeRemaining(RELEASE_DURATION);
          return RELEASE_DURATION;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ── Normal cycle timer — one arm at a time, 15 s each ────────────────────
  // Sequence: N → S → W → E → N → S → ...
  useEffect(() => {
    if (phase !== 'NORMAL_CYCLE') return;
    setTimeRemaining(RELEASE_DURATION);

    const id = setInterval(() => {
      setTimeRemaining(prev => {
        const next = prev - 100;
        if (next <= 0) {
          // Advance to next arm
          const nextIdx = (seqIdxRef.current + 1) % SEQ_ARMS.length;
          setSeqIdx(nextIdx);
          seqIdxRef.current = nextIdx;
          setTimeRemaining(RELEASE_DURATION);
          return RELEASE_DURATION;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ── Derive per-arm booleans ───────────────────────────────────────────────
  let nGreen = false, sGreen = false, eGreen = false, wGreen = false;
  let nYellow = false, sYellow = false, eYellow = false, wYellow = false;
  let isPreempted = false;

  const currentNormalArm = SEQ_ARMS[seqIdx]; // 'N', 'S', 'W', or 'E'

  switch (phase) {
    case 'W_GREEN':
      eGreen = true;       // East-heading cars (type E) get the corridor
      isPreempted = true;  // triggers BLE yield logic for back-of-queue cars
      break;
    case 'E_RESUME':
      eGreen = true;       // Keep east green so yielded cars merge back and go
      isPreempted = false;
      break;
    case 'N_RELEASE': nGreen = true; break;
    case 'S_RELEASE': sGreen = true; break;
    case 'W_RELEASE': wGreen = true; break;
    case 'E_RELEASE': eGreen = true; break;
    case 'NORMAL_CYCLE':
      // One arm at a time — same sequential logic as the release phases
      if (currentNormalArm === 'N') nGreen = true;
      if (currentNormalArm === 'S') sGreen = true;
      if (currentNormalArm === 'W') wGreen = true;
      if (currentNormalArm === 'E') eGreen = true;
      break;
    default: break; // ALL_RED — all false
  }

  // Determine a human-readable label for the UI
  const armLabel =
    phase === 'NORMAL_CYCLE'
      ? `${currentNormalArm}_GREEN`
      : phase;

  return {
    phase,
    nGreen, sGreen, eGreen, wGreen,
    nYellow, sYellow, eYellow, wYellow,
    isPreempted,
    onAmbulanceOnAvenue,
    onAmbulanceCleared,
    onNormalCycle,
    signalPhase: armLabel,
    timeRemaining: Math.ceil(timeRemaining / 1000),
  };
}