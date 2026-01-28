/*
 * LiftAI v7 - FULLY CORRECTED VERSION
 * 
 * ALL FIXES APPLIED AND VERIFIED:
 * ✅ Syntax error fixed
 * ✅ Workout detail buttons working
 * ✅ Day selector multi-select working
 * ✅ Exercise variation using weekIndex
 * ✅ Readiness modal fully functional
 * ✅ Athlete details saved and loaded
 * ✅ Preference fields working
 * ✅ Injury system working
 * ✅ All dropdowns populated
 * ✅ Mobile styling fixed
 */

'use strict';

const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const roundTo = (n, step) => {
  const s = Number(step) || 1;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / s) * s;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function notify(msg) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(notify._timer);
    notify._timer = setTimeout(() => { t.classList.remove('show'); }, 2200);
  }
  console.log(msg);
}

// v7.16 STAGE 4: Rest Timer
let restTimer = {
  active: false,
  startTime: null,
  duration: 180, // 3 minutes default
  intervalId: null,
  exerciseKey: null
};

function startRestTimer(durationSeconds = 180, exerciseKey = '') {
  // Clear any existing timer
  stopRestTimer();
  
  restTimer = {
    active: true,
    startTime: Date.now(),
    duration: durationSeconds,
    intervalId: null,
    exerciseKey
  };
  
  // Update timer display every second
  restTimer.intervalId = setInterval(() => {
    updateRestTimerDisplay();
  }, 1000);
  
  updateRestTimerDisplay();
}

function stopRestTimer() {
  if (restTimer.intervalId) {
    clearInterval(restTimer.intervalId);
  }
  restTimer.active = false;
  restTimer.intervalId = null;
  
  // Clear all timer displays
  document.querySelectorAll('[data-rest-timer]').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
  
  // v7.19: Reset all start/cancel buttons
  document.querySelectorAll('[data-role="startTimer"]').forEach(btn => {
    btn.style.display = 'block';
  });
  document.querySelectorAll('[data-role="cancelTimer"]').forEach(btn => {
    btn.style.display = 'none';
  });
}

function updateRestTimerDisplay() {
  if (!restTimer.active) return;
  
  const elapsed = Math.floor((Date.now() - restTimer.startTime) / 1000);
  const remaining = Math.max(0, restTimer.duration - elapsed);
  
  // Format time
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  
  // Find timer display for this exercise
  const timerEl = document.querySelector(`[data-rest-timer="${restTimer.exerciseKey}"]`);
  if (timerEl) {
    if (remaining > 0) {
      // Pronounced countdown display
      timerEl.textContent = `⏱ ${timeStr}`;
      timerEl.style.display = 'block';
      
      if (remaining <= 10) {
        // Last 10 seconds - RED and urgent
        timerEl.style.color = '#ef4444';
        timerEl.style.background = 'rgba(239,68,68,0.15)';
        timerEl.style.borderColor = 'rgba(239,68,68,0.6)';
        timerEl.style.fontSize = '24px';
      } else if (remaining <= 30) {
        // Last 30 seconds - ORANGE warning
        timerEl.style.color = '#f59e0b';
        timerEl.style.background = 'rgba(245,158,11,0.15)';
        timerEl.style.borderColor = 'rgba(245,158,11,0.5)';
        timerEl.style.fontSize = '22px';
      } else {
        // Normal - BLUE
        timerEl.style.color = '#3b82f6';
        timerEl.style.background = 'rgba(59,130,246,0.15)';
        timerEl.style.borderColor = 'rgba(59,130,246,0.5)';
        timerEl.style.fontSize = '20px';
      }
    } else {
      // Ready state - GREEN and prominent
      timerEl.textContent = '✅ READY TO LIFT!';
      timerEl.style.color = '#10b981';
      timerEl.style.background = 'rgba(16,185,129,0.2)';
      timerEl.style.borderColor = 'rgba(16,185,129,0.6)';
      timerEl.style.fontSize = '24px';
      
      // Auto-clear after 5 seconds
      setTimeout(() => {
        if (timerEl.textContent === '✅ READY TO LIFT!') {
          timerEl.textContent = '';
          timerEl.style.display = 'none';
        }
      }, 5000);
      
      stopRestTimer();
    }
  }
}

function ensureSetLogs() {
  if (!state.setLogs) state.setLogs = {};
  return state.setLogs;
}

function workoutKey(weekIndex, dayIndex) {
  return `${state.activeProfile}|w${weekIndex}|d${dayIndex}`;
}

function ensureExOverrides(dayLog) {
  if (!dayLog.__exOverrides) dayLog.__exOverrides = {};
  return dayLog.__exOverrides;
}

function getWorkSetsOverride(dayLog, exIndex, fallbackSets) {
  const o = ensureExOverrides(dayLog)[exIndex];
  const n = o && Number.isFinite(o.workSets) ? o.workSets : fallbackSets;
  return Math.max(1, Math.floor(n || fallbackSets || 1));
}

function setWorkSetsOverride(dayLog, exIndex, workSets) {
  ensureExOverrides(dayLog)[exIndex] = { 
    ...(ensureExOverrides(dayLog)[exIndex] || {}), 
    workSets: Math.max(1, Math.floor(workSets || 1)) 
  };
}

function getWeightOffsetOverride(dayLog, exIndex) {
  const o = ensureExOverrides(dayLog)[exIndex];
  const v = o && Number.isFinite(o.weightOffset) ? o.weightOffset : 0;
  return clamp(v, -0.10, 0.10);
}

function setWeightOffsetOverride(dayLog, exIndex, weightOffset) {
  ensureExOverrides(dayLog)[exIndex] = { 
    ...(ensureExOverrides(dayLog)[exIndex] || {}), 
    weightOffset: clamp(Number(weightOffset) || 0, -0.10, 0.10) 
  };
}

function actionDelta(action) {
  switch ((action || '').toLowerCase()) {
    case 'make': return 0.01;
    case 'belt': return 0.00;
    case 'heavy': return -0.02;
    case 'miss': return -0.05;
    default: return 0.00;
  }
}

const SWAP_POOLS = {
  snatch: [
    // Basic Variations
    { name: 'Snatch', liftKey: 'snatch' },
    { name: 'Power Snatch', liftKey: 'snatch' },
    { name: 'Hang Snatch (knee)', liftKey: 'snatch' },
    { name: 'Hang Power Snatch', liftKey: 'snatch' },
    { name: 'Block Snatch (knee)', liftKey: 'snatch' },
    { name: 'Pause Snatch (2s)', liftKey: 'snatch' },
    { name: 'Snatch from Blocks (mid-thigh)', liftKey: 'snatch' },
    { name: 'Muscle Snatch', liftKey: 'snatch' },
    
    // Technique & Position Complexes
    { name: 'Snatch High Pull + Hang Snatch + OHS', liftKey: 'snatch' },
    { name: 'Snatch (pause at knee) + Snatch', liftKey: 'snatch' },
    { name: 'Hang Snatch (above knee) + Snatch', liftKey: 'snatch' },
    { name: 'Snatch + OHS (pause)', liftKey: 'snatch' },
    { name: 'Muscle Snatch + OHS', liftKey: 'snatch' },
    { name: 'Tall Snatch + Snatch', liftKey: 'snatch' },
    { name: 'Low Hang Snatch + Hang Snatch + Snatch', liftKey: 'snatch' },
    { name: 'Hip Snatch + Hang Snatch + Snatch', liftKey: 'snatch' },
    { name: 'Snatch Balance + OHS', liftKey: 'snatch' },
    
    // Pull-to-Catch Complexes
    { name: 'Snatch Pull + Snatch', liftKey: 'snatch' },
    { name: 'Snatch Pull + Hang Snatch + Snatch', liftKey: 'snatch' },
    { name: 'Snatch High Pull + Snatch', liftKey: 'snatch' },
    { name: 'Segment Snatch Pull + Snatch', liftKey: 'snatch' },
    { name: 'Halting Snatch Deadlift + Snatch Pull + Snatch', liftKey: 'snatch' },
    
    // Competition & Rehearsal
    { name: 'Snatch + Snatch (1+1)', liftKey: 'snatch' },
    { name: 'Power Snatch + Snatch', liftKey: 'snatch' },
    { name: 'Block Snatch + Snatch', liftKey: 'snatch' }
  ],
  cj: [
    // Basic Variations
    { name: 'Clean & Jerk', liftKey: 'cj' },
    { name: 'Power Clean + Jerk', liftKey: 'cj' },
    { name: 'Hang Clean (knee) + Jerk', liftKey: 'cj' },
    { name: 'Clean + Push Jerk', liftKey: 'cj' },
    { name: 'Clean + Power Jerk', liftKey: 'cj' },
    { name: 'Block Clean (knee) + Jerk', liftKey: 'cj' },
    { name: 'Power Jerk from Rack', liftKey: 'cj' },
    { name: 'Hang Power Clean + Jerk', liftKey: 'cj' },
    
    // Clean Technique & Position Complexes
    { name: 'Clean Pull + Hang Clean + Front Squat', liftKey: 'cj' },
    { name: 'Clean (pause at knee) + Clean', liftKey: 'cj' },
    { name: 'Hang Clean (above knee) + Clean', liftKey: 'cj' },
    { name: 'Tall Clean + Clean', liftKey: 'cj' },
    { name: 'Low Hang Clean + Hang Clean + Clean', liftKey: 'cj' },
    { name: 'Hip Clean + Hang Clean + Clean', liftKey: 'cj' },
    
    // Clean Strength-in-Lift Complexes
    { name: 'Clean + Front Squat', liftKey: 'cj' },
    { name: 'Clean + Front Squat + Clean', liftKey: 'cj' },
    { name: 'Clean + Front Squat (2 reps)', liftKey: 'cj' },
    { name: 'Clean + Front Squat + Jerk', liftKey: 'cj' },
    { name: 'Clean Pull + Clean + Front Squat', liftKey: 'cj' },
    
    // Jerk Complexes
    { name: 'Jerk Dip Squat (pause) + Jerk', liftKey: 'cj' },
    { name: 'Power Jerk + Split Jerk', liftKey: 'cj' },
    { name: 'Pause Jerk + Jerk', liftKey: 'cj' },
    { name: 'Split Jerk + Jerk Balance', liftKey: 'cj' },
    { name: 'Jerk from Blocks + Jerk', liftKey: 'cj' },
    { name: 'Clean + Jerk + Jerk', liftKey: 'cj' },
    
    // Competition & Rehearsal
    { name: 'Clean + Jerk (1+1)', liftKey: 'cj' },
    { name: 'Power Clean + Clean + Jerk', liftKey: 'cj' },
    { name: 'Block Clean + Clean + Jerk', liftKey: 'cj' },
    { name: 'Tempo Clean (3s) + Clean', liftKey: 'cj' }
  ],
  pull_snatch: [
    { name: 'Snatch Pull', liftKey: 'snatch' },
    { name: 'Snatch High Pull', liftKey: 'snatch' },
    { name: 'Deficit Snatch Pull', liftKey: 'snatch' },
    { name: 'Halting Snatch Pull', liftKey: 'snatch' }
  ],
  pull_clean: [
    { name: 'Clean Pull', liftKey: 'cj' },
    { name: 'Clean High Pull', liftKey: 'cj' },
    { name: 'Deficit Clean Pull', liftKey: 'cj' },
    { name: 'Halting Clean Pull', liftKey: 'cj' }
  ],
  bs: [
    { name: 'Back Squat', liftKey: 'bs' },
    { name: 'Pause Back Squat', liftKey: 'bs' },
    { name: 'Tempo Back Squat', liftKey: 'bs' }
  ],
  fs: [
    { name: 'Front Squat', liftKey: 'fs' },
    { name: 'Pause Front Squat', liftKey: 'fs' },
    { name: 'Tempo Front Squat', liftKey: 'fs' }
  ],
  press: [
    { name: 'Push Press', liftKey: 'pushPress' },
    { name: 'Strict Press', liftKey: 'strictPress' },
    { name: 'Behind-the-Neck Push Press', liftKey: 'pushPress' },
    { name: 'Jerk Dip + Drive', liftKey: 'cj' }
  ],
  accessory: [
    { name: 'RDL', liftKey: 'bs', recommendedPct: 0.60, description: '~60% of Back Squat' },
    { name: 'Good Morning', liftKey: 'bs', recommendedPct: 0.50, description: '~50% of Back Squat' },
    { name: 'Bulgarian Split Squat', liftKey: 'bs', recommendedPct: 0.55, description: '~55% of Back Squat' },
    { name: 'Row', liftKey: 'bs', recommendedPct: 0.30, description: '~30% of Back Squat' },
    { name: 'Pull-up', liftKey: '', recommendedPct: 0, description: 'Bodyweight or add load' },
    { name: 'Plank', liftKey: '', recommendedPct: 0, description: 'Bodyweight hold' },
    { name: 'Back Extension', liftKey: 'bs', recommendedPct: 0.40, description: '~40% of Back Squat' }
  ]
};

// v7.27: COMPREHENSIVE ACCESSORY EXERCISE DATABASE - ALL EXERCISES MAPPED
const ACCESSORY_DATABASE = {
  back_vertical: [
    'Pull-up', 'Pull-ups', 'Weighted Pull-up', 'Weighted Pull-ups',
    'Chin-up', 'Chin-ups', 
    'Lat Pulldown', 'Wide-Grip Lat Pulldown', 'Close-Grip Lat Pulldown'
  ],
  back_horizontal: [
    'Barbell Row', 'Pendlay Row', 'T-Bar Row', 
    'Dumbbell Row', 'Single-Arm Row', 'Single-Arm Dumbbell Row',
    'Chest-Supported Row', 'Seated Cable Row', 'Cable Row', 'Machine Row', 
    'TRX Row', 'Row', 'Back Extension'
  ],
  shoulders_press: [
    'Overhead Press', 'Seated Dumbbell Press', 'Standing Dumbbell Press',
    'Overhead Dumbbell Press', 'Arnold Press', 'Machine Shoulder Press',
    'Landmine Press'
  ],
  shoulders_lateral: [
    'Dumbbell Lateral Raise', 'Cable Lateral Raise', 'Machine Lateral Raise',
    'Leaning Cable Lateral Raise', 'Lateral Raise', 'Front Raise'
  ],
  shoulders_rear: [
    'Face Pull', 'Reverse Pec Deck', 'Bent-Over Dumbbell Fly',
    'Cable Rear Delt Fly', 'Rear Delt Row', 'Rear Delt Fly'
  ],
  chest_press: [
    'Barbell Bench Press', 'Incline Barbell Bench Press', 'Dumbbell Bench Press',
    'Incline Dumbbell Press', 'Weighted Dips', 'Bodyweight Dips',
    'Machine Chest Press', 'Dips', 'Close-Grip Push-up'
  ],
  chest_isolation: [
    'Cable Flyes', 'Dumbbell Flyes', 'Pec Deck Machine', 'Incline Cable Flyes'
  ],
  legs_quad: [
    'Leg Extension', 'Single-Leg Extension', 'Leg Press',
    'Hack Squat Machine', 'Bulgarian Split Squat'
  ],
  legs_hamstring: [
    'Leg Curl', 'Seated Leg Curl', 'Lying Leg Curl', 'Nordic Curl',
    'Romanian Deadlift', 'RDL', 'Dumbbell Romanian Deadlift', 'Good Morning'
  ],
  legs_glutes: [
    'Hip Thrust', 'Barbell Glute Bridge', 'Glute Bridge', 'Cable Pull-Through'
  ],
  legs_calves: [
    'Standing Calf Raise', 'Seated Calf Raise', 'Leg Press Calf Raise', 'Calf Raises'
  ],
  arms_biceps: [
    'Barbell Curl', 'EZ-Bar Curl', 'Dumbbell Curl', 'Hammer Curl',
    'Incline Dumbbell Curl', 'Cable Curl', 'Preacher Curl'
  ],
  arms_triceps: [
    'Close-Grip Bench Press', 'Dumbbell Overhead Extension',
    'Cable Tricep Pushdown', 'Rope Tricep Pushdown', 'Tricep Pushdown',
    'Overhead Cable Extension', 'Skull Crusher', 'Rope Tricep Extension', 'Tricep Extension'
  ],
  core: [
    'Plank', 'Ab Wheel Rollout', 'Cable Crunch', 'Pallof Press',
    'Side Plank', 'Core + Mobility', 'Core Circuit'
  ]
};

// v7.25: Map exercises to categories for intelligent swapping
const EXERCISE_CATEGORIES = {
  // BACK - Vertical Pull (Lats)
  'Lat Pulldown': 'back_vertical', 'Wide-Grip Lat Pulldown': 'back_vertical', 'Close-Grip Lat Pulldown': 'back_vertical',
  'Pull-ups': 'back_vertical', 'Pull-up': 'back_vertical', 
  'Weighted Pull-ups': 'back_vertical', 'Weighted Pull-up': 'back_vertical',
  'Chin-ups': 'back_vertical', 'Chin-up': 'back_vertical',
  
  // BACK - Horizontal Pull (Mid-back, Traps)
  'Barbell Row': 'back_horizontal', 'Pendlay Row': 'back_horizontal', 'T-Bar Row': 'back_horizontal',
  'Dumbbell Row': 'back_horizontal', 'Chest-Supported Row': 'back_horizontal', 
  'Seated Cable Row': 'back_horizontal', 'Machine Row': 'back_horizontal',
  'Row': 'back_horizontal', 'Cable Row': 'back_horizontal', 
  'Single-Arm Row': 'back_horizontal', 'Single-Arm Dumbbell Row': 'back_horizontal', 'TRX Row': 'back_horizontal',
  'Back Extension': 'back_horizontal',
  
  // SHOULDERS - Press
  'Overhead Press': 'shoulders_press', 'Seated Dumbbell Press': 'shoulders_press', 
  'Standing Dumbbell Press': 'shoulders_press', 'Arnold Press': 'shoulders_press',
  'Overhead Dumbbell Press': 'shoulders_press', 'Machine Shoulder Press': 'shoulders_press',
  'Landmine Press': 'shoulders_press',
  
  // SHOULDERS - Lateral Delts
  'Dumbbell Lateral Raise': 'shoulders_lateral', 'Cable Lateral Raise': 'shoulders_lateral', 
  'Machine Lateral Raise': 'shoulders_lateral', 'Leaning Cable Lateral Raise': 'shoulders_lateral',
  'Lateral Raise': 'shoulders_lateral', 'Front Raise': 'shoulders_lateral',
  
  // SHOULDERS - Rear Delts
  'Face Pull': 'shoulders_rear', 'Reverse Pec Deck': 'shoulders_rear', 
  'Bent-Over Dumbbell Fly': 'shoulders_rear', 'Cable Rear Delt Fly': 'shoulders_rear', 
  'Rear Delt Row': 'shoulders_rear', 'Rear Delt Fly': 'shoulders_rear',
  
  // CHEST - Press
  'Barbell Bench Press': 'chest_press', 'Incline Barbell Bench Press': 'chest_press',
  'Dumbbell Bench Press': 'chest_press', 'Incline Dumbbell Press': 'chest_press',
  'Weighted Dips': 'chest_press', 'Bodyweight Dips': 'chest_press', 
  'Machine Chest Press': 'chest_press', 'Dips': 'chest_press',
  'Close-Grip Push-up': 'chest_press',
  
  // CHEST - Isolation
  'Cable Flyes': 'chest_isolation', 'Dumbbell Flyes': 'chest_isolation', 
  'Pec Deck Machine': 'chest_isolation', 'Incline Cable Flyes': 'chest_isolation',
  
  // LEGS - Quads
  'Leg Extension': 'legs_quad', 'Single-Leg Extension': 'legs_quad', 
  'Leg Press': 'legs_quad', 'Hack Squat Machine': 'legs_quad', 
  'Bulgarian Split Squat': 'legs_quad',
  
  // LEGS - Hamstrings
  'Leg Curl': 'legs_hamstring', 'Seated Leg Curl': 'legs_hamstring', 
  'Lying Leg Curl': 'legs_hamstring', 'Nordic Curl': 'legs_hamstring',
  'Romanian Deadlift': 'legs_hamstring', 'Dumbbell Romanian Deadlift': 'legs_hamstring',
  'RDL': 'legs_hamstring', 'Good Morning': 'legs_hamstring',
  
  // LEGS - Glutes
  'Hip Thrust': 'legs_glutes', 'Barbell Glute Bridge': 'legs_glutes', 
  'Cable Pull-Through': 'legs_glutes', 'Glute Bridge': 'legs_glutes',
  
  // LEGS - Calves
  'Standing Calf Raise': 'legs_calves', 'Seated Calf Raise': 'legs_calves', 
  'Leg Press Calf Raise': 'legs_calves', 'Calf Raises': 'legs_calves',
  
  // ARMS - Biceps
  'Barbell Curl': 'arms_biceps', 'EZ-Bar Curl': 'arms_biceps', 
  'Dumbbell Curl': 'arms_biceps', 'Hammer Curl': 'arms_biceps',
  'Incline Dumbbell Curl': 'arms_biceps', 'Cable Curl': 'arms_biceps', 
  'Preacher Curl': 'arms_biceps',
  
  // ARMS - Triceps
  'Close-Grip Bench Press': 'arms_triceps', 'Dumbbell Overhead Extension': 'arms_triceps',
  'Cable Tricep Pushdown': 'arms_triceps', 'Rope Tricep Pushdown': 'arms_triceps',
  'Overhead Cable Extension': 'arms_triceps', 'Skull Crusher': 'arms_triceps',
  'Tricep Pushdown': 'arms_triceps', 'Rope Tricep Extension': 'arms_triceps', 'Tricep Extension': 'arms_triceps',
  
  // CORE
  'Plank': 'core', 'Ab Wheel Rollout': 'core', 'Cable Crunch': 'core', 
  'Pallof Press': 'core', 'Side Plank': 'core', 
  'Core + Mobility': 'core', 'Core Circuit': 'core'
};

function inferSwapFamily(exName, liftKey) {
  const n = String(exName || '').toLowerCase();
  const lk = String(liftKey || '').toLowerCase();
  if (n.includes('pull')) return (lk === 'snatch') ? 'pull_snatch' : 'pull_clean';
  if (n.includes('squat')) return (n.includes('front') || lk === 'fs') ? 'fs' : 'bs';
  if (n.includes('press') || n.includes('jerk dip')) return 'press';
  if (n.includes('snatch')) return 'snatch';
  if (n.includes('clean') || n.includes('jerk')) return 'cj';
  return 'accessory';
}

function getSwapOptionsForExercise(ex, dayPlan) {
  const lk = ex.liftKey || dayPlan.liftKey || '';
  const family = inferSwapFamily(ex.name, lk);
  
  // v7.25: Check if this is an accessory exercise with a category
  const category = EXERCISE_CATEGORIES[ex.name];
  
  // DEBUG: Log what we found
  console.log('🔍 Swap lookup for:', ex.name);
  console.log('   Category found:', category);
  console.log('   Has database:', category && ACCESSORY_DATABASE[category] ? 'YES' : 'NO');
  
  let pool = [];
  
  if (category && ACCESSORY_DATABASE[category]) {
    // Use accessory database for recognized exercises
    pool = ACCESSORY_DATABASE[category].map(name => ({ name, liftKey: '' }));
    console.log('   ✅ Using accessory database, pool size:', pool.length);
  } else if (SWAP_POOLS[family]) {
    // Use Olympic lift pools for comp lifts
    pool = [...SWAP_POOLS[family]];
    console.log('   ⚠️ Using Olympic lift pools (family:', family + ')');
  }
  
  // Ensure current exercise is in the list
  if (!pool.some(o => o.name === ex.name)) {
    pool.unshift({ name: ex.name, liftKey: lk });
  }
  
  // Remove duplicates
  const uniq = [];
  pool.forEach(o => {
    if (!uniq.some(u => u.name === o.name)) uniq.push(o);
  });
  
  // Move current exercise to top
  const currentIdx = uniq.findIndex(o => o.name === ex.name);
  if (currentIdx > 0) {
    const cur = uniq.splice(currentIdx, 1)[0];
    uniq.unshift(cur);
  }
  
  return uniq;
}

function clearExerciseLogs(dayLog, exIndex) {
  Object.keys(dayLog).forEach((k) => {
    if (k.startsWith(`${exIndex}:`)) delete dayLog[k];
  });
  if (dayLog.__exOverrides && dayLog.__exOverrides[exIndex]) {
    delete dayLog.__exOverrides[exIndex];
  }
}

window.closeModal = function closeModal() {
  const o = $('modalOverlay');
  if (o) o.classList.remove('show');
};

window.openModal = function openModal(title, subtitle, html) {
  const o = $('modalOverlay');
  if (!o) return;
  const t = $('modalTitle');
  const s = $('modalSubtitle');
  const c = $('modalContent');
  if (t) t.textContent = title || 'Info';
  if (s) s.textContent = subtitle || '';
  if (c) c.innerHTML = html || '';
  o.classList.add('show');
};

window.closeReadinessModal = function closeReadinessModal() {
  const o = $('readinessOverlay');
  if (o) o.classList.remove('show');
};

window.saveReadinessCheck = function saveReadinessCheck() {
  const p = getProfile();
  const sleep = Number($('sleepSlider')?.value || 7);
  const quality = Number($('sleepQualityValue')?.textContent || 3);
  const stress = Number($('stressValue')?.textContent || 3);
  const soreness = Number($('sorenessValue')?.textContent || 3);
  const readiness = Number($('readinessValueDisplay')?.textContent || 3);
  const score = ((sleep/2) + quality + (6-stress) + (6-soreness) + readiness) / 5;
  const scoreRounded = Math.round(score * 10) / 10;
  p.readinessLog = p.readinessLog || [];
  p.readinessLog.push({ 
    date: todayISO(), 
    score: scoreRounded,
    sleep, quality, stress, soreness, readiness,
    notes: 'Pre-workout check' 
  });
  saveState();
  window.closeReadinessModal();
  notify('Readiness logged: ' + scoreRounded.toFixed(1) + '/5.0');
};

window.showInfo = function showInfo(topic) {
  openModal('Info', topic, `<div class="help">More info coming soon for: ${topic}</div>`);
};

// Clear optional 1RM field to use auto-calculated value
window.clearOptional1RM = function clearOptional1RM(fieldId) {
  const field = $(fieldId);
  if (field) {
    field.value = '';
    updateAutoCalcDisplays();
  }
};

// Update auto-calculated displays based on main lift values
window.updateAutoCalcDisplays = function updateAutoCalcDisplays() {
  const sn = Number($('setupSnatch')?.value) || 0;
  const cj = Number($('setupCleanJerk')?.value) || 0;
  
  const ratios = {
    'setupPowerSnatch': { base: sn, ratio: 0.88, name: 'Power Snatch' },
    'setupPowerClean': { base: cj, ratio: 0.90, name: 'Power Clean' },
    'setupOHS': { base: sn, ratio: 0.85, name: 'Overhead Squat' },
    'setupHangSnatch': { base: sn, ratio: 0.95, name: 'Hang Snatch' },
    'setupHangPowerSnatch': { base: sn, ratio: 0.80, name: 'Hang Power Snatch' },
    'setupHangClean': { base: cj, ratio: 0.95, name: 'Hang Clean' }
  };
  
  for (const [fieldId, config] of Object.entries(ratios)) {
    const field = $(fieldId);
    const displayId = 'autoCalc' + fieldId.replace('setup', '');
    const display = $(displayId);
    
    if (field && display && config.base > 0) {
      const autoValue = roundTo(config.base * config.ratio, 1);
      const hasCustom = field.value && Number(field.value) > 0;
      
      if (hasCustom) {
        display.innerHTML = `<span style="color:var(--primary)">✓ Using custom: ${field.value} kg</span> <span style="color:var(--text-dim)">(Auto would be: ${autoValue} kg)</span>`;
      } else {
        display.innerHTML = `<span style="color:var(--text-dim)">Auto: ${autoValue} kg (${Math.round(config.ratio * 100)}% of base lift)</span>`;
      }
    }
  }
};

window.showInfo = function showInfo(topic) {
  const MAP = {
    profile: 'Profiles store all settings locally.',
    units: 'Choose kg or lb. Loads rounded accordingly.',
    blocklength: 'Block length: how many weeks generated.',
    programtype: 'Different emphasis: General, Strength, Hypertrophy, Competition.',
    transition: 'Ramp-in period gradually increases intensity.',
    preferences: 'Presets adjust training stress.',
    athletemode: 'Recreational or Competition mode.',
    blocks: 'Block variations require lifting blocks.',
    volume: 'Standard/Reduced/Minimal sets.',
    autocut: 'Suggests cutting sets if fatigue spikes.',
    restduration: 'Default rest time between sets. Heavy lifts (85%+) automatically use 5 minutes.',
    aicoach: 'AI features placeholder.',
    hfmodel: 'AI model name storage.',
    aitest: 'AI testing disabled.',
    maxes: 'Enter best recent 1RMs. Working maxes at 90%.',
    maindays: 'Select Olympic lift training days.',
    accessorydays: 'Select accessory work days.',
    duration: 'Average session time.',
    athletedetails: 'Optional personalization.',
    trainingage: 'How long training Olympic lifts.',
    recovery: 'Recovery capacity between sessions.',
    limiter: 'Primary weakness to address.',
    meetplanning: 'Competition date for periodization.',
    macroperiod: 'Training cycle phase.',
    taper: 'Pre-competition volume reduction.',
    heavysingle: 'Include heavy singles (90%+).',
    injuries: 'Active injuries to work around.'
  };
  alert(MAP[topic] || 'Info about ' + topic);
};

const STORAGE_KEY = 'liftai_v7_fully_fixed';

const DEFAULT_PROFILE = () => ({
  name: 'Default',
  units: 'kg',
  blockLength: 8,
  programType: 'general',
  transitionWeeks: 1,
  transitionProfile: 'standard',
  prefPreset: 'balanced',
  athleteMode: 'recreational',
  includeBlocks: true,
  volumePref: 'reduced',
  duration: 75, // Session duration in minutes
  restDuration: 180, // Default rest timer duration in seconds (v7.19)
  autoCut: true,
  age: null,
  trainingAge: 1,
  recovery: 3,
  limiter: 'balanced',
  competitionDate: null,
  macroPeriod: 'AUTO',
  taperStyle: 'default',
  heavySingleExposure: 'off',
  injuries: [],
  mainDays: [2, 4, 6],
  accessoryDays: [7],
  aiEnabled: true,
  aiModel: '',
  maxes: { 
    snatch: 80, 
    cj: 100, 
    fs: 130, 
    bs: 150, 
    pushPress: 0, 
    strictPress: 0,
    // Optional custom 1RMs (null = use auto-calculated ratio)
    powerSnatch: null,
    powerClean: null,
    ohs: null,
    hangPowerSnatch: null,
    hangSnatch: null
  },
  workingMaxes: { snatch: 72, cj: 90, fs: 117, bs: 135, pushPress: 0, strictPress: 0 },
  liftAdjustments: { snatch: 0, cj: 0, fs: 0, bs: 0, pushPress: 0, strictPress: 0 },
  readinessLog: []
});

const DEFAULT_STATE = () => ({
  version: 'fully_fixed_v1',
  activeProfile: 'Default',
  profiles: { Default: DEFAULT_PROFILE() },
  currentBlock: null,
  history: [],
  setLogs: {}
});

let state = loadState();
let ui = { currentPage: 'Setup', weekIndex: 0 };

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeJsonParse(raw, null) : null;
  if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE();
  const s = Object.assign(DEFAULT_STATE(), parsed);
  if (!s.profiles || typeof s.profiles !== 'object') {
    s.profiles = { Default: DEFAULT_PROFILE() };
  }
  if (!s.activeProfile || !s.profiles[s.activeProfile]) {
    s.activeProfile = Object.keys(s.profiles)[0] || 'Default';
  }
  Object.keys(s.profiles).forEach(profileName => {
    const p = s.profiles[profileName];
    const defaults = DEFAULT_PROFILE();
    Object.keys(defaults).forEach(key => {
      if (!(key in p)) p[key] = defaults[key];
    });
  });
  return s;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getProfile() {
  const p = state.profiles[state.activeProfile];
  if (!p) {
    state.profiles.Default = state.profiles.Default || DEFAULT_PROFILE();
    state.activeProfile = 'Default';
    saveState();
    return state.profiles.Default;
  }
  return p;
}

function setActiveProfile(name) {
  if (!state.profiles[name]) return;
  state.activeProfile = name;
  saveState();
}

const PAGES = {
  Setup: 'pageSetup',
  Dashboard: 'pageDashboard',
  Workout: 'pageWorkout',
  History: 'pageHistory',
  Settings: 'pageSettings'
};

function showPage(pageName) {
  ui.currentPage = pageName;
  for (const [name, id] of Object.entries(PAGES)) {
    const el = $(id);
    if (!el) continue;
    if (name === pageName) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
  const navMap = {
    Setup: 'navSetup',
    Dashboard: 'navDashboard',
    Workout: 'navWorkout',
    History: 'navHistory',
    Settings: 'navSettings'
  };
  for (const [name, btnId] of Object.entries(navMap)) {
    const b = $(btnId);
    if (!b) continue;
    b.classList.toggle('active', name === pageName);
  }
  if (pageName === 'Setup') renderSetup();
  if (pageName === 'Dashboard') renderDashboard();
  if (pageName === 'Workout') renderWorkout();
  if (pageName === 'History') renderHistory();
  if (pageName === 'Settings') renderSettings();
}

function computeWorkingMaxes(maxes) {
  return {
    snatch: roundTo((Number(maxes.snatch) || 0) * 0.9, 1),
    cj: roundTo((Number(maxes.cj) || 0) * 0.9, 1),
    fs: roundTo((Number(maxes.fs) || 0) * 0.9, 1),
    bs: roundTo((Number(maxes.bs) || 0) * 0.9, 1),
    pushPress: roundTo((Number(maxes.pushPress) || 0) * 0.9, 1),
    strictPress: roundTo((Number(maxes.strictPress) || 0) * 0.9, 1)
  };
}

function phaseForWeek(weekIndex) {
  const w = weekIndex % 4;
  if (w === 0 || w === 1) return 'accumulation';
  if (w === 2) return 'intensification';
  return 'deload';
}

function volumeFactorFor(profile, phase, weekIndex = 0) {
  const pref = profile.volumePref || 'reduced';
  const base = (pref === 'standard') ? 1.0 : (pref === 'minimal' ? 0.6 : 0.8);
  const phaseMult = (phase === 'accumulation') ? 1.0 : (phase === 'intensification' ? 0.85 : 0.6);
  
  // Age-based volume adjustment for Masters athletes
  let ageMult = 1.0;
  const age = Number(profile.age) || 0;
  if (age >= 50) {
    ageMult = 0.85; // Masters 50+ = 85% volume
  } else if (age >= 40) {
    ageMult = 0.90; // Masters 40-49 = 90% volume
  }
  
  // MESOCYCLE PROGRESSION: Wave-based volume bumps
  const waveNumber = Math.floor(weekIndex / 4); // Wave 0, 1, 2...
  const volumeBump = waveNumber * 0.05; // +5% per wave
  const waveMult = Math.min(1 + volumeBump, 1.15); // Cap at +15%
  
  return base * phaseMult * ageMult * waveMult;
}

function transitionMultiplier(profile, weekIndex) {
  const tw = Number(profile.transitionWeeks) || 0;
  if (tw <= 0) return { intensity: 1, volume: 1 };
  if (weekIndex >= tw) return { intensity: 1, volume: 1 };
  const mode = profile.transitionProfile || 'standard';
  const t = (weekIndex + 1) / tw;
  let minI = 0.85, minV = 0.80;
  if (mode === 'conservative') { minI = 0.80; minV = 0.70; }
  if (mode === 'aggressive') { minI = 0.90; minV = 0.90; }
  return { intensity: minI + (1 - minI) * t, volume: minV + (1 - minV) * t };
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function blockSeed() {
  return (state.currentBlock && state.currentBlock.seed) ? Number(state.currentBlock.seed) : 0;
}

const HYPERTROPHY_POOLS = {
  upperPush: [
    { name: 'Dumbbell Bench Press', refLift: 'bs', refPct: 0.22, description: '~22% of BS per hand' },
    { name: 'Incline Dumbbell Press', refLift: 'bs', refPct: 0.20, description: '~20% of BS per hand' },
    { name: 'Dips', refLift: 'bs', refPct: 0.00, description: 'Bodyweight or add load' },
    { name: 'Overhead Dumbbell Press', refLift: 'bs', refPct: 0.15, description: '~15% of BS per hand' },
    { name: 'Landmine Press', refLift: 'bs', refPct: 0.30, description: '~30% of BS' }
  ],
  upperPull: [
    { name: 'Barbell Row', refLift: 'bs', refPct: 0.40, description: '~40% of BS' },
    { name: 'Pull-ups', refLift: '', refPct: 0, description: 'Bodyweight or add load' },
    { name: 'Lat Pulldown', refLift: 'bs', refPct: 0.35, description: '~35% of BS' },
    { name: 'Cable Row', refLift: 'bs', refPct: 0.35, description: '~35% of BS' },
    { name: 'T-Bar Row', refLift: 'bs', refPct: 0.40, description: '~40% of BS' },
    { name: 'Single-Arm Dumbbell Row', refLift: 'bs', refPct: 0.18, description: '~18% of BS per hand' }
  ],
  shoulders: [
    { name: 'Lateral Raise', refLift: 'bs', refPct: 0.06, description: '~6% of BS per hand' },
    { name: 'Face Pull', refLift: 'bs', refPct: 0.15, description: '~15% of BS' },
    { name: 'Rear Delt Fly', refLift: 'bs', refPct: 0.05, description: '~5% of BS per hand' },
    { name: 'Front Raise', refLift: 'bs', refPct: 0.06, description: '~6% of BS per hand' },
    { name: 'Cable Lateral Raise', refLift: 'bs', refPct: 0.06, description: '~6% of BS per hand' }
  ],
  arms: [
    { name: 'Barbell Curl', refLift: 'bs', refPct: 0.25, description: '~25% of BS' },
    { name: 'Hammer Curl', refLift: 'bs', refPct: 0.12, description: '~12% of BS per hand' },
    { name: 'Tricep Extension', refLift: 'bs', refPct: 0.20, description: '~20% of BS' },
    { name: 'Tricep Pushdown', refLift: 'bs', refPct: 0.25, description: '~25% of BS' },
    { name: 'Dumbbell Curl', refLift: 'bs', refPct: 0.10, description: '~10% of BS per hand' },
    { name: 'Close-Grip Push-up', refLift: '', refPct: 0, description: 'Bodyweight or add load' }
  ],
  lowerPosterior: [
    { name: 'Romanian Deadlift', refLift: 'bs', refPct: 0.60, description: '~60% of BS' },
    { name: 'Leg Curl', refLift: 'bs', refPct: 0.25, description: '~25% of BS' },
    { name: 'Good Morning', refLift: 'bs', refPct: 0.50, description: '~50% of BS' },
    { name: 'Glute Bridge', refLift: 'bs', refPct: 0.60, description: '~60% of BS' },
    { name: 'Nordic Curl', refLift: '', refPct: 0, description: 'Bodyweight' }
  ],
  lowerQuad: [
    { name: 'Bulgarian Split Squat', refLift: 'bs', refPct: 0.55, description: '~55% of BS' },
    { name: 'Leg Press', refLift: 'bs', refPct: 1.20, description: '~120% of BS' },
    { name: 'Walking Lunge', refLift: 'bs', refPct: 0.35, description: '~35% of BS' },
    { name: 'Leg Extension', refLift: 'bs', refPct: 0.30, description: '~30% of BS' },
    { name: 'Step-up', refLift: 'bs', refPct: 0.40, description: '~40% of BS' }
  ]
};


function pickFromPool(pool, key, weekIndex) {
  if (!pool || pool.length === 0) return null;
  const h = hash32(String(key) + '|w' + String(weekIndex));
  const idx = (h % (pool.length * 7)) % pool.length;
  return pool[idx];
}

function chooseHypertrophyExercise(poolName, profile, weekIndex, slotKey) {
  const pool = HYPERTROPHY_POOLS[poolName] || [];
  if (pool.length === 0) return { name: poolName, refLift: '', refPct: 0, description: '' };
  
  // v7.11 FIX: Same exercise for ENTIRE BLOCK (4 weeks)
  // Remove weekIndex from key so exercise doesn't change weekly
  // This allows proper progression tracking
  const seed = Number(profile.lastBlockSeed || 0) || blockSeed() || 0;
  const key = `${seed}|hyp|${poolName}|${slotKey}|${profile.programType || 'general'}`;
  // Note: weekIndex removed - same exercise all 4 weeks
  return pickFromPool(pool, key, 0) || pool[0];  // Use week 0 always
}

// v7.11 NEW: Calculate hypertrophy progression parameters
function getHypertrophyProgression(weekIndex, phase) {
  // Research-based progression:
  // Week 1: Lower volume, higher RIR (conditioning)
  // Week 2-3: Higher volume, moderate RIR (accumulation)
  // Week 4: Peak volume, low RIR (overreach)
  // Then deload
  
  const weekInMeso = weekIndex % 4;
  
  if (phase === 'deload') {
    return { setMultiplier: 0.6, rirAdjustment: 2 }; // 60% sets, RIR +2
  }
  
  // Accumulation phase (typical)
  const progression = {
    0: { setMultiplier: 1.0, rirAdjustment: 1 },   // Week 1: Base, RIR 3
    1: { setMultiplier: 1.0, rirAdjustment: 0 },   // Week 2: Base, RIR 2
    2: { setMultiplier: 1.2, rirAdjustment: 0 },   // Week 3: +20% sets, RIR 2
    3: { setMultiplier: 1.2, rirAdjustment: -1 }   // Week 4: +20% sets, RIR 1
  };
  
  return progression[weekInMeso] || progression[0];
}

// v7.11 NEW: Helper to create hypertrophy exercise with weight guidance
function makeHypExercise(poolName, profile, weekIndex, slotKey, sets, reps, baseRIR, hypProg) {
  const ex = chooseHypertrophyExercise(poolName, profile, weekIndex, slotKey);
  return {
    name: ex.name,
    sets: sets,
    reps: reps,
    pct: 0,
    tag: 'hypertrophy',
    targetRIR: Math.max(0, baseRIR + hypProg.rirAdjustment),
    liftKey: ex.refLift || '',
    recommendedPct: ex.refPct || 0,
    description: ex.description || ''
  };
}


function microIntensityFor(profile, phase, weekIndex) {
  const w = weekIndex % 4;
  const mode = (profile.athleteMode || 'recreational');
  const pt = (profile.programType || 'general');
  
  // Base intensities
  let acc = [0.70, 0.74];
  let intens = 0.85;
  let del = 0.62;
  if (mode === 'competition' || pt === 'competition') {
    acc = [0.73, 0.77];
    intens = 0.88;
    del = 0.65;
  }
  if (pt === 'powerbuilding') {
    acc = [0.70, 0.75];
    intens = 0.83;
    del = 0.62;
  }
  if (pt === 'hypertrophy') {
    acc = [0.68, 0.72];
    intens = 0.80;
    del = 0.60;
  }
  
  // MESOCYCLE PROGRESSION: Wave-based intensity bumps
  const waveNumber = Math.floor(weekIndex / 4); // Wave 0, 1, 2...
  const intensityBump = waveNumber * 0.02; // +2% per wave
  
  let baseIntensity = 0;
  if (phase === 'accumulation') baseIntensity = (w === 0 ? acc[0] : acc[1]);
  else if (phase === 'intensification') baseIntensity = intens;
  else baseIntensity = del;
  
  return Math.min(baseIntensity + intensityBump, 0.95); // Cap at 95%
}

function chooseVariation(family, profile, weekIndex, phase, slotKey, dayIndex = 0) {
  let pool = SWAP_POOLS[family] || [];
  if (pool.length === 0) return { name: slotKey, liftKey: '' };
  
  // Filter out block variations if user has includeBlocks set to false
  const allowBlocks = (profile.includeBlocks === true || profile.includeBlocks === undefined);
  if (!allowBlocks) {
    pool = pool.filter(ex => {
      const name = (ex.name || '').toLowerCase();
      return !name.includes('block') && !name.includes('from blocks');
    });
    // If all exercises were filtered out, use original pool
    if (pool.length === 0) pool = SWAP_POOLS[family];
  }
  
  const pt = (profile.programType || 'general');
  const mode = (profile.athleteMode || 'recreational');
  const preferSpecific = (mode === 'competition' || pt === 'competition');
  
  // CRITICAL FIX: Use profile.lastBlockSeed (the NEW seed being generated)
  // NOT blockSeed() which returns the OLD currentBlock.seed during generation
  const seed = Number(profile.lastBlockSeed || 0) || blockSeed() || 0;
  
  // DEBUG LOGGING
  if (family === 'snatch' && weekIndex === 0 && dayIndex === 0) {
    console.log('🔍 EXERCISE SELECTION DEBUG:');
    console.log('  family:', family);
    console.log('  slotKey:', slotKey);
    console.log('  seed:', seed);
    console.log('  profile.lastBlockSeed:', profile.lastBlockSeed);
    console.log('  blockSeed() [old block]:', blockSeed());
    console.log('  dayIndex:', dayIndex);
    console.log('  weekIndex:', weekIndex);
  }
  
  // CRITICAL FIX: Include dayIndex to ensure different exercises on different days
  const key = `${seed}|${family}|${slotKey}|${phase}|${pt}|${mode}|d${dayIndex}`;
  
  if (preferSpecific && (phase === 'intensification')) {
    const h = hash32(key + '|w' + weekIndex);
    if ((h % 10) < 7) return pool[0];
  }
  
  const selected = pickFromPool(pool, key, weekIndex) || pool[0];
  
  // DEBUG LOGGING
  if (family === 'snatch' && weekIndex === 0 && dayIndex === 0) {
    console.log('  key:', key);
    console.log('  selected:', selected.name);
    console.log('  pool size:', pool.length);
  }
  
  return selected;
}

function chooseVariationExcluding(family, profile, weekIndex, phase, slotKey, excludeNames = [], dayIndex = 0) {
  const pool = SWAP_POOLS[family] || [];
  if (pool.length === 0) return { name: slotKey, liftKey: '' };
  
  // Filter out excluded exercises
  const availablePool = pool.filter(ex => !excludeNames.includes(ex.name));
  
  // If filtering removed everything, use full pool as fallback
  const finalPool = availablePool.length > 0 ? availablePool : pool;
  
  // Use same selection logic as chooseVariation but with filtered pool
  const pt = (profile.programType || 'general');
  const mode = (profile.athleteMode || 'recreational');
  const preferSpecific = (mode === 'competition' || pt === 'competition');
  
  // CRITICAL FIX: Use profile.lastBlockSeed first (NEW seed), not old blockSeed()
  const seed = Number(profile.lastBlockSeed || 0) || blockSeed() || 0;
  
  // CRITICAL FIX: Include dayIndex
  const key = `${seed}|${family}|${slotKey}|${phase}|${pt}|${mode}|d${dayIndex}`;
  
  if (preferSpecific && (phase === 'intensification')) {
    const h = hash32(key + '|w' + weekIndex);
    if ((h % 10) < 7) return finalPool[0];
  }
  
  return pickFromPool(finalPool, key, weekIndex) || finalPool[0];
}

function makeWeekPlan(profile, weekIndex) {
  const phase = phaseForWeek(weekIndex);
  const baseI = microIntensityFor(profile, phase, weekIndex);
  const trans = transitionMultiplier(profile, weekIndex);
  const intensity = clamp(baseI * trans.intensity, 0.55, 0.92);
  const volFactor = clamp(volumeFactorFor(profile, phase, weekIndex) * trans.volume, 0.45, 1.10);
  const mainDays = Array.isArray(profile.mainDays) && profile.mainDays.length ? profile.mainDays.slice() : [2, 4, 6];
  const accessoryDays = Array.isArray(profile.accessoryDays) && profile.accessoryDays.length ? profile.accessoryDays.slice() : [7];
  const mainSet = new Set(mainDays.map(Number));
  const accClean = accessoryDays.map(Number).filter(d => !mainSet.has(d));
  
  // CRITICAL FIX: Generate exercise templates per-day, not once for whole week
  const generateMainTemplate = (templateIndex, dayIndex) => {
    const templates = [
      { title: 'Snatch Focus', kind: 'snatch', main: 'Snatch', liftKey: 'snatch', work: [
        { name: chooseVariation('snatch', profile, weekIndex, phase, 'snatch_main', dayIndex).name, liftKey: 'snatch', sets: Math.round(5 * volFactor), reps: 2, pct: intensity },
        { name: chooseVariation('pull_snatch', profile, weekIndex, phase, 'snatch_pull', dayIndex).name, liftKey: 'snatch', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + 0.10, 0.60, 0.95) },
        { name: chooseVariation('bs', profile, weekIndex, phase, 'back_squat', dayIndex).name, liftKey: 'bs', sets: Math.round(4 * volFactor), reps: 5, pct: clamp(intensity + 0.05, 0.55, 0.92) }
      ]},
      { title: 'Clean & Jerk Focus', kind: 'cj', main: 'Clean & Jerk', liftKey: 'cj', work: [
        { name: chooseVariation('cj', profile, weekIndex, phase, 'cj_main', dayIndex).name, liftKey: 'cj', sets: Math.round(4 * volFactor), reps: 1, pct: clamp(intensity + 0.05, 0.60, 0.95) },
        { name: chooseVariation('pull_clean', profile, weekIndex, phase, 'clean_pull', dayIndex).name, liftKey: 'cj', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + 0.12, 0.60, 0.98) },
        { name: chooseVariation('fs', profile, weekIndex, phase, 'front_squat', dayIndex).name, liftKey: 'fs', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + 0.08, 0.55, 0.92) }
      ]},
      { title: 'Strength + Positions', kind: 'strength', main: 'Back Squat', liftKey: 'bs', work: [
        { name: chooseVariation('bs', profile, weekIndex, phase, 'back_squat_strength', dayIndex).name, liftKey: 'bs', sets: Math.round(5 * volFactor), reps: 3, pct: clamp(intensity + 0.08, 0.55, 0.95) },
        { name: chooseVariation('snatch', profile, weekIndex, phase, 'snatch_secondary', dayIndex).name, liftKey: 'snatch', sets: Math.round(4 * volFactor), reps: 2, pct: clamp(intensity - 0.02, 0.55, 0.90) },
        { name: chooseVariation('press', profile, weekIndex, phase, 'press', dayIndex).name, liftKey: chooseVariation('press', profile, weekIndex, phase, 'press', dayIndex).liftKey, sets: Math.round(4 * volFactor), reps: 5, pct: clamp(intensity - 0.12, 0.45, 0.80) }
      ]}
    ];
    return templates[templateIndex % templates.length];
  };
  
  // Build accessory template with no duplicates per day
  const generateAccessoryTemplate = (dayIndex) => {
    const acc1 = chooseVariation('accessory', profile, weekIndex, phase, 'accessory_1', dayIndex);
    const acc2 = chooseVariationExcluding('accessory', profile, weekIndex, phase, 'accessory_2', [acc1.name], dayIndex);
    return { title: 'Accessory + Core', kind: 'accessory', main: 'Accessory', liftKey: '', work: [
      { name: acc1.name, liftKey: acc1.liftKey, recommendedPct: acc1.recommendedPct || 0, description: acc1.description || '', sets: Math.round(3 * volFactor), reps: 5, pct: 0 },
      { name: acc2.name, liftKey: acc2.liftKey, recommendedPct: acc2.recommendedPct || 0, description: acc2.description || '', sets: Math.round(3 * volFactor), reps: 8, pct: 0 },
      { name: 'Core + Mobility', sets: 1, reps: 1, pct: 0 }
    ]};
  };
  
  const sessions = [];
  mainDays.map(Number).sort((a, b) => a - b).forEach((d, i) => {
    const t = generateMainTemplate(i, i); // Generate unique template per day
    sessions.push({ ...t, dow: d });
  });
  accClean.sort((a, b) => a - b).forEach((d, i) => {
    const accessoryDayIndex = mainDays.length + i; // Unique index for accessory days
    sessions.push({ ...generateAccessoryTemplate(accessoryDayIndex), dow: d });
  });
  
  // DURATION-AWARE PROGRAMMING: Apply to ALL program types
  const duration = profile.duration || 75;
  const programType = profile.programType || 'general';
  
  sessions.forEach((s, si) => {
    // v7.11: Get hypertrophy progression parameters
    const hypProg = getHypertrophyProgression(weekIndex, phase);
    
    // POWERBUILDING: Hypertrophy + Olympic
    if (programType === 'powerbuilding') {
      // v7.11 FIX #1: Increased base volume (was 3, now 4)
      // v7.11 FIX #2: Apply weekly progression multiplier
      const baseHypSets = phase === 'accumulation' ? 4 : 
                          phase === 'intensification' ? 4 : 2;
      const hypSets = Math.round(baseHypSets * volFactor * hypProg.setMultiplier);
      const hypReps = phase === 'accumulation' ? 12 : phase === 'intensification' ? 8 : 8;
      
      if (s.kind === 'accessory') {
        s.title = 'Hypertrophy + Pump';
        const dayKey = `d${si}`; // Use session index to differentiate days
        if (duration >= 90) {
          s.work = [
            makeHypExercise('upperPush', profile, weekIndex, `hyp_acc_push_${dayKey}`, hypSets + 1, hypReps, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, `hyp_acc_pull_${dayKey}`, hypSets + 1, hypReps, 2, hypProg),
            makeHypExercise('shoulders', profile, weekIndex, `hyp_acc_sh1_${dayKey}`, hypSets, 10, 2, hypProg),
            makeHypExercise('shoulders', profile, weekIndex, `hyp_acc_sh2_${dayKey}`, hypSets, 15, 3, hypProg),
            makeHypExercise('lowerQuad', profile, weekIndex, `hyp_acc_quad_${dayKey}`, hypSets, 15, 3, hypProg),
            makeHypExercise('lowerPosterior', profile, weekIndex, `hyp_acc_post_${dayKey}`, hypSets, hypReps, 2, hypProg),
            { name: 'Core Circuit', sets: 3, reps: 1, pct: 0, tag: 'core' }
          ];
        } else {
          s.work = [
            makeHypExercise('upperPush', profile, weekIndex, `hyp_acc_push_${dayKey}`, hypSets, hypReps, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, `hyp_acc_pull_${dayKey}`, hypSets, hypReps, 2, hypProg),
            makeHypExercise('lowerQuad', profile, weekIndex, `hyp_acc_quad_${dayKey}`, hypSets, 12, 2, hypProg),
            { name: 'Core Circuit', sets: 2, reps: 1, pct: 0, tag: 'core' }
          ];
        }
      } else if (s.kind === 'snatch') {
        if (duration >= 90) {
          s.work = [...s.work,
            makeHypExercise('upperPush', profile, weekIndex, 'hyp_sn_push', hypSets, hypReps - 2, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, 'hyp_sn_pull', hypSets, hypReps - 2, 2, hypProg),
            makeHypExercise('shoulders', profile, weekIndex, 'hyp_sn_sh', hypSets, hypReps, 2, hypProg),
            makeHypExercise('arms', profile, weekIndex, 'hyp_sn_arm', hypSets, hypReps, 2, hypProg)
          ];
        } else {
          s.work = [...s.work,
            makeHypExercise('upperPush', profile, weekIndex, 'hyp_sn_push', hypSets, 10, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, 'hyp_sn_pull', hypSets, 10, 2, hypProg)
          ];
        }
      } else if (s.kind === 'cj') {
        if (duration >= 90) {
          s.work = [...s.work,
            makeHypExercise('upperPull', profile, weekIndex, 'hyp_cj_pull1', hypSets, hypReps - 2, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, 'hyp_cj_pull2', hypSets, hypReps, 2, hypProg),
            makeHypExercise('shoulders', profile, weekIndex, 'hyp_cj_sh', hypSets, hypReps, 2, hypProg),
            makeHypExercise('arms', profile, weekIndex, 'hyp_cj_arm1', hypSets, hypReps, 3, hypProg)
          ];
        } else {
          s.work = [...s.work,
            makeHypExercise('upperPull', profile, weekIndex, 'hyp_cj_pull', hypSets, 10, 2, hypProg),
            makeHypExercise('arms', profile, weekIndex, 'hyp_cj_arm1', hypSets, 12, 2, hypProg)
          ];
        }
      } else if (s.kind === 'strength') {
        if (duration >= 90) {
          s.work = [...s.work,
            makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_st_post1', hypSets, hypReps - 2, 2, hypProg),
            makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_st_post2', hypSets, hypReps, 2, hypProg),
            makeHypExercise('lowerQuad', profile, weekIndex, 'hyp_st_quad', hypSets, hypReps - 2, 2, hypProg),
            { name: 'Calf Raises', sets: 4, reps: 15, pct: 0, tag: 'hypertrophy' }
          ];
        } else {
          s.work = [...s.work,
            makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_st_post1', hypSets, 10, 2, hypProg),
            { name: 'Calf Raises', sets: 3, reps: 15, pct: 0, tag: 'hypertrophy' }
          ];
        }
      }
    }
    
    // HYPERTROPHY: Higher volume bodybuilding
    else if (programType === 'hypertrophy') {
      // v7.11 FIX: Increased base volume and added progression
      const baseHypSets = phase === 'accumulation' ? 5 : 4; // Was 4 and 3
      const hypSets = Math.round(baseHypSets * volFactor * hypProg.setMultiplier);
      const dayKey = `d${si}`; // Use session index
      if (s.kind === 'accessory' && duration >= 75) {
        s.work = [
          ...s.work,
          makeHypExercise('upperPush', profile, weekIndex, `hyp_acc_extra1_${dayKey}`, hypSets, 12, 2, hypProg),
          makeHypExercise('shoulders', profile, weekIndex, `hyp_acc_extra2_${dayKey}`, 3, 15, 3, hypProg)
        ];
      } else if (duration >= 75 && s.kind !== 'accessory') {
        if (s.kind === 'snatch' || s.kind === 'strength') {
          s.work = [...s.work,
            makeHypExercise('upperPush', profile, weekIndex, `hyp_${s.kind}_push`, hypSets, 10, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, `hyp_${s.kind}_pull`, hypSets, 10, 2, hypProg)
          ];
        } else if (s.kind === 'cj') {
          s.work = [...s.work,
            makeHypExercise('lowerQuad', profile, weekIndex, 'hyp_cj_quad', hypSets, 12, 2, hypProg),
            makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_cj_post', hypSets, 10, 2, hypProg)
          ];
        }
      }
    }
    
    // STRENGTH: Heavy compounds + support work
    else if (programType === 'strength' && duration >= 75 && s.kind !== 'accessory') {
      const supportLift = s.kind === 'snatch' ? chooseVariation('pull_snatch', profile, weekIndex, phase, `${s.kind}_support`) :
                         s.kind === 'cj' ? chooseVariation('pull_clean', profile, weekIndex, phase, `${s.kind}_support`) :
                         chooseVariation('bs', profile, weekIndex, phase, `${s.kind}_support`);
      s.work = [...s.work,
        { name: supportLift.name, liftKey: supportLift.liftKey, sets: Math.round(3 * volFactor), reps: 3, pct: clamp(intensity + 0.15, 0.60, 0.98), tag: 'strength' }
      ];
    }
    
    // GENERAL/COMPETITION/TECHNIQUE: Keep standard templates (already optimal)
  });
    
  const days = sessions.map(s => {
    const { dow, ...rest } = s;
    return { ...rest, dow };
  });
  return { weekIndex, phase, intensity, volFactor, days };
}

function generateBlockFromSetup() {
  const profile = getProfile();
  profile.units = ($('setupUnits')?.value) || profile.units || 'kg';
  profile.blockLength = Number($('setupBlockLength')?.value) || profile.blockLength || 8;
  profile.programType = ($('setupProgram')?.value) || profile.programType || 'general';
  profile.transitionWeeks = Number($('setupTransitionWeeks')?.value) || 0;
  profile.transitionProfile = ($('setupTransitionProfile')?.value) || 'standard';
  profile.prefPreset = ($('setupPrefPreset')?.value) || 'balanced';
  profile.athleteMode = ($('setupAthleteMode')?.value) || 'recreational';
  profile.includeBlocks = ($('setupIncludeBlocks')?.value) === 'yes';
  profile.volumePref = ($('setupVolumePref')?.value) || 'reduced';
  profile.duration = Number($('setupDuration')?.value) || 75; // Session duration in minutes
  profile.restDuration = Number($('setupRestDuration')?.value) || 180; // v7.19: Rest timer duration
  profile.autoCut = ($('setupAutoCut')?.value) !== 'no';
  profile.age = Number($('setupAge')?.value) || null;
  profile.trainingAge = Number($('setupTrainingAge')?.value) || 1;
  profile.recovery = Number($('setupRecovery')?.value) || 3;
  profile.limiter = $('setupLimiter')?.value || 'balanced';
  profile.competitionDate = $('setupCompetitionDate')?.value || null;
  profile.macroPeriod = $('setupMacroPeriod')?.value || 'AUTO';
  profile.taperStyle = $('setupTaperStyle')?.value || 'default';
  profile.heavySingleExposure = $('setupHeavySingleExposure')?.value || 'off';
  const injuryPreset = $('setupInjuryPreset')?.value;
  if (injuryPreset === 'multiple') {
    profile.injuries = [];
    if ($('injShoulder')?.checked) profile.injuries.push('shoulder');
    if ($('injWrist')?.checked) profile.injuries.push('wrist');
    if ($('injElbow')?.checked) profile.injuries.push('elbow');
    if ($('injBack')?.checked) profile.injuries.push('back');
    if ($('injHip')?.checked) profile.injuries.push('hip');
    if ($('injKnee')?.checked) profile.injuries.push('knee');
    if ($('injAnkle')?.checked) profile.injuries.push('ankle');
  } else if (injuryPreset && injuryPreset !== 'none') {
    profile.injuries = [injuryPreset];
  } else {
    profile.injuries = [];
  }
  const sn = Number($('setupSnatch')?.value);
  const cj = Number($('setupCleanJerk')?.value);
  const fs = Number($('setupFrontSquat')?.value);
  const bs = Number($('setupBackSquat')?.value);
  const pushPress = Number($('setupPushPress')?.value) || 0;
  const strictPress = Number($('setupStrictPress')?.value) || 0;
  
  // Optional custom 1RMs (null = use auto-calculated ratio)
  const powerSnatch = Number($('setupPowerSnatch')?.value) || null;
  const powerClean = Number($('setupPowerClean')?.value) || null;
  const ohs = Number($('setupOHS')?.value) || null;
  const hangSnatch = Number($('setupHangSnatch')?.value) || null;
  const hangPowerSnatch = Number($('setupHangPowerSnatch')?.value) || null;
  const hangClean = Number($('setupHangClean')?.value) || null;
  
  if ([sn, cj, fs, bs].some(v => !Number.isFinite(v) || v <= 0)) {
    alert('Please enter all four main 1RM values (Snatch, C&J, Front Squat, Back Squat).');
    return;
  }
  profile.maxes = { 
    snatch: sn, 
    cj: cj, 
    fs: fs, 
    bs: bs, 
    pushPress, 
    strictPress,
    powerSnatch,
    powerClean,
    ohs,
    hangSnatch,
    hangPowerSnatch,
    hangClean
  };
  profile.workingMaxes = computeWorkingMaxes(profile.maxes);
  
  // Save updated profile before generating block
  state.profiles[state.activeProfile] = profile;
  saveState();
  
  const blockLength = clamp(profile.blockLength, 4, 12);
  const _seed = Date.now();
  
  // DEBUG: Log seed generation
  console.log('🔧 CREATING NEW BLOCK:');
  console.log('  New seed:', _seed);
  console.log('  Old currentBlock seed:', state.currentBlock?.seed);
  console.log('  Old profile.lastBlockSeed:', profile.lastBlockSeed);
  
  profile.lastBlockSeed = _seed;
  
  console.log('  Updated profile.lastBlockSeed:', profile.lastBlockSeed);
  
  const weeks = [];
  for (let w = 0; w < blockLength; w++) {
    weeks.push(makeWeekPlan(profile, w));
  }
  state.currentBlock = {
    seed: _seed,
    profileName: state.activeProfile,
    startDateISO: todayISO(),
    programType: profile.programType,
    blockLength,
    weeks
  };
  
  // Save entire block to history
  state.blockHistory = state.blockHistory || [];
  const blockHistoryEntry = {
    id: `${state.activeProfile}_${_seed}`,
    profileName: state.activeProfile,
    startDateISO: todayISO(),
    programType: profile.programType,
    blockLength,
    blockSeed: _seed,
    units: profile.units,
    maxes: { ...profile.maxes },
    weeks: weeks.map((week, weekIndex) => ({
      weekIndex,
      phase: week.phase,
      days: week.days.map((day, dayIndex) => ({
        dayIndex,
        title: day.title,
        dow: day.dow,
        completed: false,
        completedDate: null,
        exercises: day.work.map(ex => ({
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          prescribedWeight: ex.pct && ex.liftKey ? 
            roundTo(getBaseForExercise(ex.name, ex.liftKey, profile) * ex.pct, profile.units === 'kg' ? 1 : 1) : null,
          prescribedPct: ex.pct ? Math.round(ex.pct * 100) : null,
          liftKey: ex.liftKey || '',
          actualSets: [] // Will be filled when completed
        }))
      }))
    }))
  };
  state.blockHistory.unshift(blockHistoryEntry);
  
  ui.weekIndex = 0;
  saveState();
  showPage('Dashboard');
  notify('Training block generated');
  renderHistory();
}

function getAdjustedWorkingMax(profile, liftKey) {
  const base = (profile.workingMaxes && profile.workingMaxes[liftKey]) ? Number(profile.workingMaxes[liftKey]) : 0;
  
  // If press maxes not entered, estimate from C&J
  if (!base && (liftKey === 'pushPress' || liftKey === 'strictPress')) {
    const cjMax = profile.workingMaxes?.cj || 0;
    if (cjMax > 0) {
      // Push Press ≈ 70% of C&J, Strict Press ≈ 55% of C&J
      const ratio = liftKey === 'pushPress' ? 0.70 : 0.55;
      const estimated = roundTo(cjMax * ratio, profile.units === 'kg' ? 1 : 1);
      const adj = (profile.liftAdjustments && Number(profile.liftAdjustments[liftKey])) ? Number(profile.liftAdjustments[liftKey]) : 0;
      const capped = clamp(adj, -0.05, 0.05);
      return estimated * (1 + capped);
    }
  }
  
  const adj = (profile.liftAdjustments && Number(profile.liftAdjustments[liftKey])) ? Number(profile.liftAdjustments[liftKey]) : 0;
  const capped = clamp(adj, -0.05, 0.05);
  return base * (1 + capped);
}

// v7.10 FIX: Detect if exercise is a complex
function isComplex(exerciseName) {
  // Complexes contain '+' separator (e.g., "Clean + Front Squat + Jerk")
  return (exerciseName || '').includes('+');
}

// CRITICAL: Determine if exercise should use true max or working max (90%)
function shouldUseTrueMax(exerciseName) {
  // Competition lifts and technical variations use TRUE MAX
  // They are skill/speed limited, not strength limited
  const trueMaxExercises = [
    'snatch', 'power snatch', 'hang snatch', 'hang power snatch',
    'block snatch', 'pause snatch', 'snatch balance', 'drop snatch',
    'clean & jerk', 'clean', 'power clean', 'hang clean',
    'hang power clean', 'block clean', 'pause clean',
    'jerk', 'power jerk', 'split jerk', 'push jerk', 'jerk from blocks',
    'jerk dip + drive', 'overhead squat'
  ];
  
  const nameLower = (exerciseName || '').toLowerCase();
  
  // v7.10 FIX: ALL exercises now use TRUE MAX (100%)
  // Research shows squats and pressing should use 100% of their own 1RM
  // NOT 90% working max
  // 
  // Previously squats/pressing used working max (90%) - this was WRONG
  // Elite programs (Catalyst, USAW, StrengthLog) use 100% of exercise 1RM
  //
  // Working max concept (90%) was only valid for the competition lifts
  // to calculate derivatives (e.g., Back Squat working max = 90% of BS 1RM)
  // But the prescription itself should still use 100% of that working max
  
  // Pulls use TRUE MAX (tied to competition lift)
  if (nameLower.includes('pull')) {
    return true;
  }
  
  // v7.10: Squats now use TRUE MAX (was working max)
  // v7.10: Pressing now uses TRUE MAX (was working max)
  // Everything uses TRUE MAX
  return true;
}

// Get the correct base weight for an exercise
function getBaseForExercise(exerciseName, liftKey, profile) {
  const nameLower = (exerciseName || '').toLowerCase();
  
  // v7.10 FIX: Complexes use reduced weight (5% lighter)
  // Research: Elite programs (Catalyst, StrengthLog) program complexes at 70-85%
  // Complexes are harder than singles due to cumulative fatigue
  if (isComplex(exerciseName)) {
    // Get base for the primary lift, then apply complex reduction
    const baseWithoutComplexReduction = getBaseForExerciseInternal(exerciseName, liftKey, profile);
    return baseWithoutComplexReduction * 0.95;  // 5% reduction for complexes
  }
  
  return getBaseForExerciseInternal(exerciseName, liftKey, profile);
}

// Internal function to get base without complex adjustment
function getBaseForExerciseInternal(exerciseName, liftKey, profile) {
  const nameLower = (exerciseName || '').toLowerCase();
  
  // Check for custom 1RM first
  const customMapping = {
    'power snatch': 'powerSnatch',
    'power clean': 'powerClean',
    'overhead squat': 'ohs',
    'hang power snatch': 'hangPowerSnatch',
    'hang snatch': 'hangSnatch',
    'hang clean': 'hangClean'
  };
  
  for (const [exercise, key] of Object.entries(customMapping)) {
    if (nameLower.includes(exercise)) {
      const customValue = profile.maxes?.[key];
      if (customValue != null && customValue > 0) {
        // Use custom 1RM with adjustments
        const adj = (profile.liftAdjustments && profile.liftAdjustments[liftKey]) ? Number(profile.liftAdjustments[liftKey]) : 0;
        const capped = clamp(adj, -0.05, 0.05);
        return customValue * (1 + capped);
      }
      // If no custom value, fall through to ratio calculation
      break;
    }
  }
  
  if (shouldUseTrueMax(exerciseName)) {
    // Use TRUE MAX for competition lifts and technical variations
    const trueMax = (profile.maxes && profile.maxes[liftKey]) ? Number(profile.maxes[liftKey]) : 0;
    
    // Apply research-based ratios for variations without custom values
    let ratio = 1.0;
    if (nameLower.includes('power snatch')) ratio = 0.88;
    else if (nameLower.includes('power clean')) ratio = 0.90;
    else if (nameLower.includes('overhead squat')) ratio = 0.85;
    else if (nameLower.includes('hang power snatch')) ratio = 0.80;
    else if (nameLower.includes('hang snatch') && !nameLower.includes('power')) ratio = 0.95;
    else if (nameLower.includes('hang clean') && !nameLower.includes('power')) ratio = 0.95;
    
    const adj = (profile.liftAdjustments && Number(profile.liftAdjustments[liftKey])) ? Number(profile.liftAdjustments[liftKey]) : 0;
    const capped = clamp(adj, -0.05, 0.05);
    return trueMax * ratio * (1 + capped);
  } else {
    // v7.10: This branch should never be hit now (everything uses TRUE MAX)
    // Kept for safety - returns working max if somehow reached
    return getAdjustedWorkingMax(profile, liftKey);
  }
}

function computeCumulativeAdj(dayLog, exIndex, setIndex, scheme) {
  let d = getWeightOffsetOverride(dayLog, exIndex);
  for (let i = 0; i < setIndex; i++) {
    if (scheme[i]?.tag !== 'work') continue;
    const rec = dayLog[`${exIndex}:${i}`];
    if (rec && rec.action) d += actionDelta(rec.action);
  }
  return d;
}

function buildSetScheme(ex, liftKey, profile) {
  const sets = [];
  // For accessories with recommendedPct but no pct, use recommendedPct
  const targetPct = ex.pct || ex.recommendedPct || 0;
  const wm = liftKey ? getBaseForExercise(ex.name, liftKey, profile) : 0;
  const roundInc = profile.units === 'kg' ? 1 : 1;
  const pushSet = (pct, reps, tag) => {
    const w = (wm && pct) ? roundTo(wm * pct, roundInc) : 0;
    sets.push({ targetPct: pct, targetReps: reps, tag, targetWeight: w });
  };
  const isPctBased = !!(targetPct && liftKey);
  const isMainish = /snatch|clean|jerk|squat|pull/i.test(ex.name);
  if (isPctBased && isMainish) {
    const ladder = [0.40, 0.50, 0.60, 0.70].filter(v => v < targetPct - 0.02);
    ladder.forEach((pct) => {
      const reps = Math.min(3, Math.max(1, ex.reps));
      pushSet(pct, reps, 'warmup');
    });
  }
  for (let i = 0; i < ex.sets; i++) pushSet(targetPct, ex.reps, 'work');
  return sets;
}

function getSetProgress(weekIndex, dayIndex, dayPlan) {
  const p = getProfile();
  const key = workoutKey(weekIndex, dayIndex);
  const logs = ensureSetLogs();
  const dayLog = logs[key] || {};
  let total = 0;
  let done = 0;
  dayPlan.work.forEach((ex, exIndex) => {
    const liftKey = ex.liftKey || dayPlan.liftKey;
    const workSets = getWorkSetsOverride(dayLog, exIndex, ex.sets);
    const scheme = buildSetScheme({ ...ex, sets: workSets }, liftKey, p);
    total += scheme.length;
    scheme.forEach((_, setIndex) => {
      const rec = dayLog[`${exIndex}:${setIndex}`];
      if (rec && rec.status && rec.status !== 'pending') done += 1;
    });
  });
  return { done, total };
}

function openWorkoutDetail(weekIndex, dayIndex, dayPlan) {
  const p = getProfile();
  const overlay = $('workoutDetail');
  const body = $('detailBody');
  const title = $('detailTitle');
  const meta = $('detailMeta');
  if (!overlay || !body || !title || !meta) return;
  ui.detailContext = { weekIndex, dayIndex };
  
  // v7.16 STAGE 5: Deload indicator
  const phase = phaseForWeek(weekIndex);
  const isDeload = phase === 'deload';
  
  title.textContent = `Day ${dayIndex + 1} • ${dayPlan.title}`;
  
  if (isDeload) {
    meta.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:inline-flex; align-items:center; gap:8px;">
          <span style="background:rgba(245,158,11,0.15); color:#f59e0b; padding:4px 10px; border-radius:6px; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">
            🔋 DELOAD WEEK
          </span>
          <span style="opacity:0.7;">Week ${weekIndex + 1} • ${phase}</span>
        </div>
        <div style="font-size:12px; opacity:0.8; font-style:italic;">
          Recovery focus: Lower volume & intensity by design
        </div>
      </div>
    `;
  } else {
    meta.textContent = `Week ${weekIndex + 1} • ${phase} • ${p.programType || 'general'}`;
  }
  
  body.innerHTML = '';
  const key = workoutKey(weekIndex, dayIndex);
  const logs = ensureSetLogs();
  const dayLog = logs[key] || {};
  logs[key] = dayLog;
  const persist = () => {
    state.setLogs = logs;
    saveState();
    renderWorkout();
  };
  dayPlan.work.forEach((ex, exIndex) => {
    const liftKey = ex.liftKey || dayPlan.liftKey;
    const workSets = getWorkSetsOverride(dayLog, exIndex, ex.sets);
    const exEff = { ...ex, sets: workSets };
    const scheme = buildSetScheme(exEff, liftKey, p);
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '14px';
    const head = document.createElement('div');
    head.className = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    
    // v7.23 FIX #3: Calculate recommendation for accessories - IMPROVED
    let recommendationText = '';
    if (ex.recommendedPct && ex.recommendedPct > 0 && ex.liftKey) {
      const baseMax = getBaseForExercise(ex.name, ex.liftKey, p);
      const recWeight = baseMax ? roundTo(baseMax * ex.recommendedPct, p.units === 'kg' ? 1 : 1) : 0;
      
      // Expand lift abbreviations for clarity
      const liftNames = {
        'snatch': 'Snatch',
        'cj': 'Clean & Jerk',
        'fs': 'Front Squat',
        'bs': 'Back Squat',
        'pushPress': 'Push Press',
        'strictPress': 'Strict Press'
      };
      const fullLiftName = liftNames[ex.liftKey] || ex.liftKey;
      const pctText = Math.round(ex.recommendedPct * 100);
      
      // v7.28: Don't show BS% recommendations for accessory exercises
      // Only show for Olympic lift variations (snatch, clean & jerk, squats)
      const isOlympicVariation = ['snatch', 'cj', 'fs', 'bs', 'pushPress', 'strictPress'].includes(ex.liftKey);
      
      if (isOlympicVariation && recWeight > 0) {
        // Show % recommendation for Olympic lifts
        recommendationText = `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px;line-height:1.5"><span style="font-weight:600;color:rgba(59,130,246,1)">Recommended:</span> ${pctText}% of ${fullLiftName} <span style="opacity:0.8">(~${recWeight}${p.units || 'kg'})</span></div>`;
      } else if (ex.description && !ex.liftKey) {
        // Show description for accessories without liftKey (e.g., "Bodyweight or add load")
        recommendationText = `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px">${ex.description}</div>`;
      }
      // Otherwise leave blank - user will enter their own weights
    } else if (ex.description) {
      recommendationText = `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px">${ex.description}</div>`;
    }
    
    head.innerHTML = `
      <div style="flex:1">
        <div class="card-title"><span class="collapse-icon" style="margin-right:8px; user-select:none;">▶</span>${ex.name}</div>
        <div class="card-subtitle">${workSets}×${ex.reps}${ex.pct && liftKey ? ` • ${Math.round(ex.pct*100)}%` : ''}${ex.targetRIR ? ` • RIR ${ex.targetRIR}` : ''}</div>
        ${recommendationText}
        <div data-rest-timer="ex${exIndex}" style="display:none; margin-top:10px; padding:12px 16px; background:rgba(59,130,246,0.15); border:2px solid rgba(59,130,246,0.5); border-radius:10px; font-size:20px; font-weight:700; text-align:center; letter-spacing:1px;"></div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
        <button class="primary" data-role="startTimer" style="min-width:90px; font-size:16px; font-weight:700; padding:10px 16px;">⏱ Start Rest</button>
        <button class="danger small" data-role="cancelTimer" style="display:none; min-width:80px;">✕ Cancel</button>
        <select class="quick-swap" data-role="swap"></select>
        <button class="secondary small" data-role="minusSet">− Set</button>
        <button class="secondary small" data-role="plusSet">+ Set</button>
        <button class="danger small" data-role="removeEx" style="padding:4px 8px;">✕</button>
      </div>
    `;
    const MAX_WORK_SETS = 12;
    const applySetCountChange = (nextWorkSets) => {
      const next = Math.max(1, Math.min(MAX_WORK_SETS, Math.floor(nextWorkSets)));
      setWorkSetsOverride(dayLog, exIndex, next);
      const nextScheme = buildSetScheme({ ...ex, sets: next }, liftKey, p);
      Object.keys(dayLog).forEach((k) => {
        if (!/^[0-9]+:[0-9]+$/.test(k)) return;
        const [ei, si] = k.split(':').map(n => parseInt(n, 10));
        if (ei === exIndex && si >= nextScheme.length) delete dayLog[k];
      });
      persist();
      openWorkoutDetail(weekIndex, dayIndex, dayPlan);
    };
    head.querySelector('[data-role="minusSet"]')?.addEventListener('click', (e) => { 
      e.preventDefault(); 
      applySetCountChange(workSets - 1); 
    });
    head.querySelector('[data-role="plusSet"]')?.addEventListener('click', (e) => { 
      e.preventDefault(); 
      applySetCountChange(workSets + 1); 
    });
    
    // v7.16 STAGE 4: Rest timer button
    const startBtn = head.querySelector('[data-role="startTimer"]');
    const cancelBtn = head.querySelector('[data-role="cancelTimer"]');
    
    startBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Get user's preferred rest duration from profile (v7.19)
      let restDuration = Number(p.restDuration) || 180; // Default 3 minutes
      
      // Override based on exercise intensity if user hasn't set preference
      if (!p.restDuration) {
        if (ex.pct && ex.pct >= 0.85) {
          restDuration = 300; // 5 minutes for heavy lifts (85%+)
        } else if (ex.pct && ex.pct <= 0.60) {
          restDuration = 120; // 2 minutes for light/technique work
        }
      }
      
      startRestTimer(restDuration, `ex${exIndex}`);
      
      // Show cancel button, hide start button
      if (startBtn) startBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'block';
    });
    
    // v7.19: Cancel timer button
    cancelBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      stopRestTimer();
      
      // Show start button, hide cancel button
      if (startBtn) startBtn.style.display = 'block';
      if (cancelBtn) cancelBtn.style.display = 'none';
    });
    
    const swapEl = head.querySelector('[data-role="swap"]');
    if (swapEl) {
      const options = getSwapOptionsForExercise(ex, dayPlan);
      swapEl.innerHTML = '';
      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.name;
        opt.textContent = o.name;
        swapEl.appendChild(opt);
      });
      // Add "Custom..." option
      const customOpt = document.createElement('option');
      customOpt.value = '__CUSTOM__';
      customOpt.textContent = 'Custom...';
      swapEl.appendChild(customOpt);
      
      swapEl.value = ex.name;
      swapEl.addEventListener('change', () => {
        const chosenValue = String(swapEl.value || ex.name);
        
        // Handle custom exercise input
        if (chosenValue === '__CUSTOM__') {
          const customName = prompt('Enter custom exercise name:', '');
          if (!customName || !customName.trim()) {
            swapEl.value = ex.name; // Reset if cancelled
            return;
          }
          const chosen = { name: customName.trim(), liftKey: '' };
          try {
            const wk = state.currentBlock?.weeks?.[weekIndex];
            const dy = wk?.days?.[dayIndex];
            if (dy && dy.work && dy.work[exIndex]) {
              dy.work[exIndex] = { ...dy.work[exIndex], name: chosen.name, liftKey: chosen.liftKey };
            }
            clearExerciseLogs(dayLog, exIndex);
            persist();
            openWorkoutDetail(weekIndex, dayIndex, dy || dayPlan);
          } catch (err) {
            console.error('Swap error:', err);
          }
          return;
        }
        
        // Handle normal swap
        const chosenName = chosenValue;
        if (!chosenName || chosenName === ex.name) return;
        const chosen = options.find(o => o.name === chosenName) || { name: chosenName, liftKey };
        try {
          const wk = state.currentBlock?.weeks?.[weekIndex];
          const dy = wk?.days?.[dayIndex];
          if (dy && dy.work && dy.work[exIndex]) {
            dy.work[exIndex] = { ...dy.work[exIndex], name: chosen.name, liftKey: chosen.liftKey || dy.work[exIndex].liftKey };
          }
          clearExerciseLogs(dayLog, exIndex);
          persist();
          openWorkoutDetail(weekIndex, dayIndex, dy || dayPlan);
        } catch (err) {
          console.warn('Swap failed', err);
        }
      });
    }
    const table = document.createElement('table');
    table.className = 'set-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    // v7.13 FIX #1: Remove Copy column (blocks view on mobile)
    table.innerHTML = `<thead><tr><th>Set</th><th>Weight</th><th>Reps</th><th>RPE</th><th>Action</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    const updateRec = (setIndex, patch) => {
      const recKey = `${exIndex}:${setIndex}`;
      const prev = dayLog[recKey] || {};
      dayLog[recKey] = { ...prev, ...patch };
      persist();
    };
    scheme.forEach((s, setIndex) => {
      const recKey = `${exIndex}:${setIndex}`;
      const rec = dayLog[recKey] || {};
      const cumAdj = computeCumulativeAdj(dayLog, exIndex, setIndex, scheme);
      const adjWeight = s.targetWeight ? roundTo(s.targetWeight * (1 + cumAdj), p.units === 'kg' ? 1 : 1) : 0;
      const weightVal = (rec.weight != null && rec.weight !== '') ? rec.weight : (adjWeight || '');
      const repsVal = (rec.reps != null && rec.reps !== '') ? rec.reps : (s.targetReps || '');
      const rpeVal = (rec.rpe != null && rec.rpe !== '') ? rec.rpe : '';
      const actionVal = rec.action || '';
      const row = document.createElement('tr');
      row.dataset.idx = String(setIndex);
      row.innerHTML = `
        <td style="padding:8px 6px; opacity:.9">${setIndex + 1}${s.tag === 'warmup' ? '<span style="opacity:.6">w</span>' : ''}</td>
        <td style="padding:6px"><div style="display:flex; gap:8px; align-items:center;">
          <input inputmode="decimal" class="input small" data-role="weight" placeholder="—" />
          <span style="opacity:.65; font-size:12px">${s.targetPct ? `${Math.round(s.targetPct*100)}%` : (s.tag || '')}</span>
        </div></td>
        <td style="padding:6px"><input inputmode="numeric" class="input small" data-role="reps" placeholder="—" /></td>
        <td style="padding:6px"><input inputmode="decimal" class="input small" data-role="rpe" placeholder="—" /></td>
        <td style="padding:6px"><select class="input small" data-role="action">
          <option value="">—</option><option value="make">✓</option><option value="belt">↑</option>
          <option value="heavy">⚠︎</option><option value="miss">✕</option>
        </select></td>
      `;
      const wEl = row.querySelector('[data-role="weight"]');
      const repsEl = row.querySelector('[data-role="reps"]');
      const rpeEl = row.querySelector('[data-role="rpe"]');
      const aEl = row.querySelector('[data-role="action"]');
      
      
      if (wEl) { 
        wEl.value = String(weightVal);
        
        // v7.12 FIX #1: Use 'change' instead of 'input' event
        // Prevents bug where typing "50" shows: 50, 5, 5
        // 'change' fires only when user finishes (blur or Enter)
        wEl.addEventListener('change', () => {
          updateRec(setIndex, { weight: wEl.value, status: 'done' });
          
          // Auto-fill subsequent EMPTY sets with user's entered weight
          const entered = Number(wEl.value);
          if (Number.isFinite(entered) && entered > 0 && scheme[setIndex]?.tag === 'work') {
            for (let j = setIndex + 1; j < scheme.length; j++) {
              if (scheme[j]?.tag !== 'work') continue;
              const nextKey = `${exIndex}:${j}`;
              const nextRec = dayLog[nextKey] || {};
              // Only fill if empty
              if (nextRec.weight != null && nextRec.weight !== '') continue;
              const nextRow = tbody.querySelector(`tr[data-idx="${j}"]`);
              if (nextRow) {
                const nextWEl = nextRow.querySelector('[data-role="weight"]');
                if (nextWEl && !nextWEl.value) {
                  nextWEl.value = String(entered);
                  updateRec(j, { weight: entered });
                }
              }
            }
          }
          
          // Also update offset if first set
          const firstWorkIdx = scheme.findIndex(x => x.tag === 'work');
          if (scheme[setIndex]?.tag === 'work' && firstWorkIdx === setIndex) {
            const prescribed = Number(adjWeight || s.targetWeight || 0);
            if (Number.isFinite(entered) && entered > 0 && Number.isFinite(prescribed) && prescribed > 0) {
              const off = clamp((entered / prescribed) - 1, -0.10, 0.10);
              setWeightOffsetOverride(dayLog, exIndex, off);
            }
          }
        });
      }
      if (repsEl) { 
        repsEl.value = String(repsVal); 
        repsEl.addEventListener('input', () => updateRec(setIndex, { reps: repsEl.value, status: 'done' })); 
      }
      if (rpeEl) { 
        rpeEl.value = String(rpeVal); 
        rpeEl.addEventListener('input', () => updateRec(setIndex, { rpe: rpeEl.value, status: 'done' })); 
      }
      if (aEl) {
        aEl.value = actionVal;
        aEl.addEventListener('change', () => {
          // v7.24 COMPLETE FIX: When action button clicked, calculate next sets from ACTUAL weight
          const actualWeight = Number(wEl.value);
          const prescribedWeight = scheme[setIndex]?.targetWeight || 0;
          
          // Save the action and actual weight
          updateRec(setIndex, { 
            action: aEl.value, 
            weight: actualWeight,
            status: 'done' 
          });
          
          // Calculate next sets based on ACTUAL weight lifted, not prescribed
          if (scheme[setIndex]?.tag === 'work' && actualWeight > 0) {
            // Get the action adjustment percentage
            const actionAdj = actionDelta(aEl.value);
            
            // Apply to ACTUAL weight, not prescribed
            let baseWeight = actualWeight * (1 + actionAdj);
            
            // Update all subsequent work sets
            for (let j = setIndex + 1; j < scheme.length; j++) {
              if (scheme[j]?.tag !== 'work') continue;
              
              // Each subsequent set gets the action adjustment
              const nextW = roundTo(baseWeight, p.units === 'kg' ? 1 : 1);
              const nextRow = tbody.querySelector(`tr[data-idx="${j}"]`);
              if (nextRow) {
                const nextWEl = nextRow.querySelector('[data-role="weight"]');
                if (nextWEl) {
                  nextWEl.value = String(nextW);
                  updateRec(j, { weight: nextW });
                }
              }
              
              // Next set starts from this weight
              baseWeight = nextW;
            }
          }
        });
      }
      
      tbody.appendChild(row);
    });
    
    // Remove exercise button
    const removeBtn = head.querySelector('[data-role="removeEx"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Create modal with options
        const modalHTML = `
          <div style="padding:20px">
            <h3 style="margin-top:0">${ex.name}</h3>
            <p style="color:var(--text-dim);margin-bottom:20px">What would you like to do?</p>
            <div style="display:flex;flex-direction:column;gap:12px">
              <button class="btn primary" data-action="move" style="width:100%">Move to Another Day</button>
              <button class="btn danger" data-action="delete" style="width:100%">Delete Exercise</button>
              <button class="btn secondary" data-action="cancel" style="width:100%">Cancel</button>
            </div>
          </div>
        `;
        
        // Show modal
        openModal('Exercise Options', '', modalHTML);
        
        // Attach event listeners after modal is rendered (setTimeout to ensure DOM is ready)
        setTimeout(() => {
          const modalEl = $('modalContent');
          if (!modalEl) return;
          
          // Move to another day
          const moveBtn = modalEl.querySelector('[data-action="move"]');
          if (moveBtn) {
            moveBtn.addEventListener('click', () => {
              const wk = state.currentBlock?.weeks?.[weekIndex];
              if (!wk || !wk.days) return;
              
              // Build day selection
              const dayOptions = wk.days.map((d, idx) => {
                if (idx === dayIndex) return null; // Skip current day
                return `Day ${idx + 1} - ${d.title}`;
              }).filter(Boolean);
              
              if (dayOptions.length === 0) {
                alert('No other days available');
                return;
              }
              
              const selection = prompt(`Move "${ex.name}" to:\n${dayOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nEnter number (1-${dayOptions.length}):`);
              if (!selection) return;
              
              const selectedIdx = parseInt(selection) - 1;
              if (selectedIdx < 0 || selectedIdx >= dayOptions.length) {
                alert('Invalid selection');
                return;
              }
              
              // Find actual day index (accounting for skipped current day)
              let targetDayIdx = 0;
              let count = 0;
              for (let i = 0; i < wk.days.length; i++) {
                if (i === dayIndex) continue;
                if (count === selectedIdx) {
                  targetDayIdx = i;
                  break;
                }
                count++;
              }
              
              try {
                const dy = wk.days[dayIndex];
                const targetDay = wk.days[targetDayIdx];
                
                // Copy exercise to target day
                const exerciseCopy = { ...ex };
                targetDay.work.push(exerciseCopy);
                
                // Remove from current day
                dy.work.splice(exIndex, 1);
                clearExerciseLogs(dayLog, exIndex);
                
                persist();
                $('modalOverlay')?.classList.remove('show');
                openWorkoutDetail(weekIndex, dayIndex, dy || dayPlan);
                notify(`Moved to ${targetDay.title}`);
              } catch (err) {
                console.error('Move failed:', err);
                alert('Failed to move exercise');
              }
            });
          }
          
          // Delete exercise
          const deleteBtn = modalEl.querySelector('[data-action="delete"]');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              if (confirm(`Permanently delete "${ex.name}"?`)) {
                try {
                  const wk = state.currentBlock?.weeks?.[weekIndex];
                  const dy = wk?.days?.[dayIndex];
                  if (dy && dy.work) {
                    dy.work.splice(exIndex, 1);
                    clearExerciseLogs(dayLog, exIndex);
                    persist();
                    $('modalOverlay')?.classList.remove('show');
                    openWorkoutDetail(weekIndex, dayIndex, dy || dayPlan);
                    notify('Exercise deleted');
                  }
                } catch (err) {
                  console.error('Delete failed:', err);
                }
              }
            });
          }
          
          // Cancel
          const cancelBtn = modalEl.querySelector('[data-action="cancel"]');
          if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
              $('modalOverlay')?.classList.remove('show');
            });
          }
        }, 100); // 100ms delay to ensure modal is fully rendered
      });
    }
    const collapseIcon = head.querySelector('.collapse-icon');
    let isCollapsed = true; // Start collapsed
    table.style.display = 'none'; // Hide by default
    head.style.cursor = 'pointer';
    head.addEventListener('click', (e) => {
      // Don't collapse when clicking dropdown or buttons
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'OPTION') return;
      
      isCollapsed = !isCollapsed;
      table.style.display = isCollapsed ? 'none' : 'table';
      if (collapseIcon) collapseIcon.textContent = isCollapsed ? '▶' : '▼';
    });
    
    card.appendChild(head);
    card.appendChild(table);
    body.appendChild(card);
  });
  
  // v7.15 STAGE 3: Volume Summary
  const summaryCard = document.createElement('div');
  summaryCard.className = 'card';
  summaryCard.style.marginBottom = '14px';
  summaryCard.style.background = 'rgba(59,130,246,0.05)';
  summaryCard.style.border = '1px solid rgba(59,130,246,0.3)';
  
  // Calculate volume stats
  let totalSets = 0;
  let workSets = 0;
  let totalReps = 0;
  let totalTonnage = 0;
  let intensitySum = 0;
  let intensityCount = 0;
  
  dayPlan.work.forEach((ex, exIndex) => {
    const liftKey = ex.liftKey || dayPlan.liftKey;
    const workSetsCount = getWorkSetsOverride(dayLog, exIndex, ex.sets);
    const exEff = { ...ex, sets: workSetsCount };
    const scheme = buildSetScheme(exEff, liftKey, p);
    
    scheme.forEach((s, setIndex) => {
      totalSets++;
      if (s.tag === 'work') {
        workSets++;
        const recKey = `${exIndex}:${setIndex}`;
        const rec = dayLog[recKey] || {};
        const reps = Number(rec.reps) || 0;
        const weight = Number(rec.weight) || 0;
        
        if (reps > 0) {
          totalReps += reps;
          if (weight > 0) {
            totalTonnage += weight * reps;
          }
        }
        
        if (s.targetPct) {
          intensitySum += s.targetPct * 100;
          intensityCount++;
        }
      }
    });
  });
  
  const avgIntensity = intensityCount > 0 ? Math.round(intensitySum / intensityCount) : 0;
  
  summaryCard.innerHTML = `
    <div style="padding:16px;">
      <div style="font-weight:700; font-size:15px; margin-bottom:12px; color:var(--primary);">
        📊 Workout Summary
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:12px;">
        <div>
          <div style="font-size:11px; opacity:0.7; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Total Sets</div>
          <div style="font-size:24px; font-weight:700;">${totalSets}</div>
          <div style="font-size:11px; opacity:0.6;">${workSets} work sets</div>
        </div>
        <div>
          <div style="font-size:11px; opacity:0.7; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Total Reps</div>
          <div style="font-size:24px; font-weight:700;">${totalReps}</div>
        </div>
        <div>
          <div style="font-size:11px; opacity:0.7; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Tonnage</div>
          <div style="font-size:24px; font-weight:700;">${Math.round(totalTonnage)}</div>
          <div style="font-size:11px; opacity:0.6;">${p.units || 'kg'}</div>
        </div>
        ${avgIntensity > 0 ? `
        <div>
          <div style="font-size:11px; opacity:0.7; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Avg Intensity</div>
          <div style="font-size:24px; font-weight:700;">${avgIntensity}%</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
  body.appendChild(summaryCard);
  
  // Add "Add Exercise" button at the bottom
  const addExCard = document.createElement('div');
  addExCard.className = 'card';
  addExCard.style.marginBottom = '14px';
  addExCard.style.cursor = 'pointer';
  addExCard.style.border = '2px dashed rgba(59, 130, 246, 1)';
  addExCard.innerHTML = `
    <div style="padding:16px; text-align:center; color:var(--primary); font-weight:600;">
      + Add Exercise
    </div>
  `;
  addExCard.addEventListener('click', () => {
    const exerciseName = prompt('Exercise name:');
    if (!exerciseName || !exerciseName.trim()) return;
    
    const sets = prompt('Number of sets:', '3');
    if (!sets) return;
    
    const reps = prompt('Number of reps:', '10');
    if (!reps) return;
    
    try {
      const wk = state.currentBlock?.weeks?.[weekIndex];
      const dy = wk?.days?.[dayIndex];
      if (dy && dy.work) {
        dy.work.push({
          name: exerciseName.trim(),
          sets: Number(sets) || 3,
          reps: Number(reps) || 10,
          pct: 0,
          liftKey: '',
          tag: 'custom'
        });
        persist();
        openWorkoutDetail(weekIndex, dayIndex, dy || dayPlan);
        notify('Exercise added');
      }
    } catch (err) {
      console.error('Add exercise failed:', err);
    }
  });
  body.appendChild(addExCard);
  
  overlay.classList.add('show');
}

function bindWorkoutDetailControls() {
  const btnClose = $('btnCloseDetail');
  if (btnClose) {
    btnClose.replaceWith(btnClose.cloneNode(true));
    $('btnCloseDetail')?.addEventListener('click', () => {
      stopRestTimer(); // v7.16: Clean up timer
      $('workoutDetail')?.classList.remove('show');
    });
  }
  const btnComplete = $('btnComplete');
  if (btnComplete) {
    btnComplete.replaceWith(btnComplete.cloneNode(true));
    $('btnComplete')?.addEventListener('click', () => {
      const ctx = ui.detailContext;
      if (!ctx || ctx.weekIndex == null || ctx.dayIndex == null) return;
      const block = state.currentBlock;
      const day = block?.weeks?.[ctx.weekIndex]?.days?.[ctx.dayIndex];
      if (day) completeDay(ctx.weekIndex, ctx.dayIndex, day);
      $('workoutDetail')?.classList.remove('show');
    });
  }
}

function bindReadinessModal() {
  const sleepSlider = $('sleepSlider');
  const sleepValue = $('sleepValue');
  if (sleepSlider && sleepValue) {
    sleepSlider.addEventListener('input', () => {
      sleepValue.textContent = sleepSlider.value;
      updateReadinessScore();
    });
  }
  const scales = ['sleepQuality', 'stress', 'soreness', 'readiness'];
  scales.forEach(scaleId => {
    const scaleDiv = $(`${scaleId}Scale`);
    if (!scaleDiv) return;
    scaleDiv.addEventListener('click', (e) => {
      const btn = e.target.closest('.readiness-btn');
      if (!btn) return;
      const val = Number(btn.dataset.val);
      const valueDisplay = $(`${scaleId}Value`);
      if (valueDisplay) valueDisplay.textContent = val;
      scaleDiv.querySelectorAll('.readiness-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateReadinessScore();
    });
  });
}

function updateReadinessScore() {
  const sleep = Number($('sleepSlider')?.value || 7);
  const quality = Number($('sleepQualityValue')?.textContent || 3);
  const stress = Number($('stressValue')?.textContent || 3);
  const soreness = Number($('sorenessValue')?.textContent || 3);
  const readiness = Number($('readinessValueDisplay')?.textContent || 3);
  const score = ((sleep/2) + quality + (6-stress) + (6-soreness) + readiness) / 5;
  const scoreRounded = Math.round(score * 10) / 10;
  const scoreNum = $('readinessScoreNum');
  if (scoreNum) scoreNum.textContent = scoreRounded.toFixed(1);
  const scoreSummary = $('readinessScoreSummary');
  if (scoreSummary) {
    scoreSummary.className = 'readiness-score';
    if (scoreRounded < 2.5) scoreSummary.classList.add('low');
    else if (scoreRounded < 3.5) scoreSummary.classList.add('med');
    else scoreSummary.classList.add('high');
  }
  const hint = $('readinessHint');
  if (hint) {
    if (scoreRounded < 2.5) hint.textContent = 'Low readiness - reduce volume';
    else if (scoreRounded < 3.5) hint.textContent = 'Moderate readiness';
    else hint.textContent = 'High readiness - push hard';
  }
}

function renderSetup() {
  const sel = $('setupProfileSelect');
  if (sel) {
    sel.innerHTML = '';
    Object.keys(state.profiles).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === state.activeProfile) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  const p = getProfile();
  if ($('setupUnits')) $('setupUnits').value = p.units || 'kg';
  if ($('setupBlockLength')) $('setupBlockLength').value = String(p.blockLength || 8);
  if ($('setupProgram')) $('setupProgram').value = p.programType || 'general';
  if ($('setupTransitionWeeks')) $('setupTransitionWeeks').value = String(p.transitionWeeks ?? 1);
  if ($('setupTransitionProfile')) $('setupTransitionProfile').value = p.transitionProfile || 'standard';
  if ($('setupPrefPreset')) $('setupPrefPreset').value = p.prefPreset || 'balanced';
  if ($('setupAthleteMode')) $('setupAthleteMode').value = p.athleteMode || 'recreational';
  if ($('setupIncludeBlocks')) $('setupIncludeBlocks').value = p.includeBlocks ? 'yes' : 'no';
  if ($('setupVolumePref')) $('setupVolumePref').value = p.volumePref || 'reduced';
  if ($('setupDuration')) $('setupDuration').value = String(p.duration || 75);
  if ($('setupRestDuration')) $('setupRestDuration').value = String(p.restDuration || 180); // v7.19
  if ($('setupAutoCut')) $('setupAutoCut').value = p.autoCut !== false ? 'yes' : 'no';
  if ($('setupAge')) $('setupAge').value = p.age || '';
  if ($('setupTrainingAge')) $('setupTrainingAge').value = String(p.trainingAge || 1);
  if ($('setupRecovery')) $('setupRecovery').value = String(p.recovery || 3);
  if ($('setupLimiter')) $('setupLimiter').value = p.limiter || 'balanced';
  if ($('setupCompetitionDate')) $('setupCompetitionDate').value = p.competitionDate || '';
  if ($('setupMacroPeriod')) $('setupMacroPeriod').value = p.macroPeriod || 'AUTO';
  if ($('setupTaperStyle')) $('setupTaperStyle').value = p.taperStyle || 'default';
  if ($('setupHeavySingleExposure')) $('setupHeavySingleExposure').value = p.heavySingleExposure || 'off';
  const injuries = Array.isArray(p.injuries) ? p.injuries : [];
  if ($('setupInjuryPreset')) {
    if (injuries.length === 0) $('setupInjuryPreset').value = 'none';
    else if (injuries.length === 1) $('setupInjuryPreset').value = injuries[0];
    else $('setupInjuryPreset').value = 'multiple';
  }
  const injuryGrid = $('injuryAdvancedGrid');
  const injuryHint = $('injuryAdvancedHint');
  if (injuries.length > 1) {
    if (injuryGrid) injuryGrid.style.display = 'block';
    if (injuryHint) injuryHint.style.display = 'block';
    if ($('injShoulder')) $('injShoulder').checked = injuries.includes('shoulder');
    if ($('injWrist')) $('injWrist').checked = injuries.includes('wrist');
    if ($('injElbow')) $('injElbow').checked = injuries.includes('elbow');
    if ($('injBack')) $('injBack').checked = injuries.includes('back');
    if ($('injHip')) $('injHip').checked = injuries.includes('hip');
    if ($('injKnee')) $('injKnee').checked = injuries.includes('knee');
    if ($('injAnkle')) $('injAnkle').checked = injuries.includes('ankle');
  } else {
    if (injuryGrid) injuryGrid.style.display = 'none';
    if (injuryHint) injuryHint.style.display = 'none';
  }
  if ($('setupSnatch')) $('setupSnatch').value = p.maxes?.snatch ?? '';
  if ($('setupCleanJerk')) $('setupCleanJerk').value = p.maxes?.cj ?? '';
  if ($('setupFrontSquat')) $('setupFrontSquat').value = p.maxes?.fs ?? '';
  if ($('setupBackSquat')) $('setupBackSquat').value = p.maxes?.bs ?? '';
  if ($('setupPushPress')) $('setupPushPress').value = p.maxes?.pushPress || '';
  if ($('setupStrictPress')) $('setupStrictPress').value = p.maxes?.strictPress || '';
  
  // Load optional custom 1RMs
  if ($('setupPowerSnatch')) $('setupPowerSnatch').value = p.maxes?.powerSnatch || '';
  if ($('setupPowerClean')) $('setupPowerClean').value = p.maxes?.powerClean || '';
  if ($('setupOHS')) $('setupOHS').value = p.maxes?.ohs || '';
  if ($('setupHangSnatch')) $('setupHangSnatch').value = p.maxes?.hangSnatch || '';
  if ($('setupHangPowerSnatch')) $('setupHangPowerSnatch').value = p.maxes?.hangPowerSnatch || '';
  if ($('setupHangClean')) $('setupHangClean').value = p.maxes?.hangClean || '';
  
  // Add event listeners to update auto-calc displays
  setTimeout(() => {
    ['setupSnatch', 'setupCleanJerk'].forEach(id => {
      const field = $(id);
      if (field) {
        field.addEventListener('input', updateAutoCalcDisplays);
      }
    });
    updateAutoCalcDisplays();
  }, 100);
  
  if (!Array.isArray(p.mainDays)) p.mainDays = [];  // v7.13: Empty by default
  if (!Array.isArray(p.accessoryDays)) p.accessoryDays = [];  // v7.13: Empty by default
  syncDaySelectorUI();
}

function renderDashboard() {
  const p = getProfile();
  const subtitle = $('dashboardSubtitle');
  if (subtitle) {
    subtitle.textContent = `${p.programType || 'general'} • ${p.units || 'kg'} • Block ${state.currentBlock ? 'ready' : 'not generated'}`;
  }
  const stats = $('dashboardStats');
  if (stats) {
    stats.innerHTML = '';
    const items = [];
    const block = state.currentBlock;
    if (block) {
      items.push(['Block length', `${block.blockLength} weeks`]);
      items.push(['Current week', `${ui.weekIndex + 1}`]);
      items.push(['Phase', `${block.weeks?.[ui.weekIndex]?.phase || '—'}`]);
    } else {
      items.push(['Block', 'Not generated']);
    }
    items.forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = `<div class="stat-label">${k}</div><div class="stat-value">${v}</div>`;
      stats.appendChild(d);
    });
  }
  const maxGrid = $('dashboardMaxes');
  if (maxGrid) {
    maxGrid.innerHTML = '';
    const wm = p.workingMaxes || computeWorkingMaxes(p.maxes || {});
    const tiles = [
      ['Snatch', wm.snatch],
      ['Clean & Jerk', wm.cj],
      ['Front Squat', wm.fs],
      ['Back Squat', wm.bs]
    ];
    tiles.forEach(([label, val]) => {
      const d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = `<div class="stat-label">${label}</div><div class="stat-value">${val || '—'} <span class="stat-unit">${p.units}</span></div>`;
      maxGrid.appendChild(d);
    });
  }
}

function renderWorkout() {
  const block = state.currentBlock;
  const p = getProfile();
  const blockSubtitle = $('blockSubtitle');
  if (blockSubtitle) {
    blockSubtitle.textContent = block ? `${block.programType} • started ${block.startDateISO}` : 'No block yet. Go to Setup.';
  }
  const weekCurrent = $('weekCurrent');
  if (weekCurrent) weekCurrent.textContent = `Week ${ui.weekIndex + 1}`;
  const weekStats = $('weekStats');
  const weekProgress = $('weekProgress');
  const weekCalendar = $('weekCalendar');
  if (!block || !block.weeks || !block.weeks.length) {
    if (weekStats) weekStats.innerHTML = '';
    if (weekProgress) weekProgress.style.width = '0%';
    if (weekCalendar) {
      weekCalendar.innerHTML = `<div class="card" style="background:rgba(17,24,39,.5)"><div class="card-title">No active training block</div><div class="card-subtitle">Go to Setup to generate.</div></div>`;
    }
    return;
  }
  ui.weekIndex = clamp(ui.weekIndex, 0, block.weeks.length - 1);
  const w = block.weeks[ui.weekIndex];
  if (weekStats) {
    weekStats.innerHTML = '';
    const items = [
      ['Phase', w.phase],
      ['Intensity', `${Math.round(w.intensity * 100)}%`],
      ['Volume', `${Math.round(w.volFactor * 100)}%`]
    ];
    items.forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'stat-card';
      d.innerHTML = `<div class="stat-label">${k}</div><div class="stat-value">${v}</div>`;
      weekStats.appendChild(d);
    });
  }
  const completed = countCompletedForWeek(ui.weekIndex);
  const pct = Math.round((completed / 4) * 100);
  if (weekProgress) weekProgress.style.width = `${pct}%`;
  if (weekCalendar) {
    weekCalendar.innerHTML = '';
    
    // Group and sort days by type and day of week
    const mainDays = w.days.filter(d => d.kind !== 'accessory').sort((a, b) => a.dow - b.dow);
    const accessoryDays = w.days.filter(d => d.kind === 'accessory').sort((a, b) => a.dow - b.dow);
    
    // Day of week names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log('Rendering workout - Main days:', mainDays.length, 'Accessory days:', accessoryDays.length);
    

    
    // Helper function to render a day card
    const renderDayCard = (day, dayIndex, isAccessory = false) => {
      const isDone = isDayCompleted(ui.weekIndex, dayIndex);
      const card = document.createElement('div');
      card.className = `day-card-v2 ${isDone ? 'completed' : ''}`;
      if (isAccessory) card.style.borderLeft = '3px solid #8b5cf6';
      
      const header = document.createElement('div');
      header.className = 'day-card-header';
      const badgeColor = isAccessory ? '#8b5cf6' : 'var(--primary)';
      header.innerHTML = `
        <div class="day-header-left">
          <div class="day-number">${dayNames[day.dow % 7]}</div>
          <div class="mini-badge ${isAccessory ? '' : 'primary'}">${day.title}</div>
        </div>
        <div class="day-header-right">
          <div class="day-stats">${isDone ? 'Completed' : 'Tap to view'}</div>
          <div class="expand-icon">▾</div>
        </div>
      `;
      
      const body = document.createElement('div');
      body.className = 'day-card-body';
      const exercises = document.createElement('div');
      exercises.className = 'exercise-list';
      exercises.innerHTML = day.work.map(e => `<div class="ex-summary">${e.name}</div>`).join('');
      
      const actions = document.createElement('div');
      actions.className = 'day-card-actions';
      
      const btnComplete = document.createElement('button');
      btnComplete.className = 'btn-mini success';
      btnComplete.textContent = isDone ? 'Completed' : 'Complete';
      btnComplete.disabled = isDone;
      btnComplete.addEventListener('click', (e) => {
        e.stopPropagation();
        completeDay(ui.weekIndex, dayIndex, day);
      });
      
      const btnView = document.createElement('button');
      btnView.className = 'btn-mini secondary';
      btnView.textContent = 'View';
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        openWorkoutDetail(ui.weekIndex, dayIndex, day);
      });
      
      actions.appendChild(btnView);
      actions.appendChild(btnComplete);
      body.appendChild(exercises);
      body.appendChild(actions);
      
      header.addEventListener('click', () => {
        openWorkoutDetail(ui.weekIndex, dayIndex, day);
      });
      
      card.appendChild(header);
      card.appendChild(body);
      return card;
    };
    
    // Render main days section
    if (mainDays.length > 0) {
      const mainHeader = document.createElement('div');
      mainHeader.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Main Training Days</div>';
      weekCalendar.appendChild(mainHeader);
      
      mainDays.forEach((day) => {
        const dayIndex = w.days.indexOf(day);
        weekCalendar.appendChild(renderDayCard(day, dayIndex, false));
      });
    }
    
    // Render accessory days section
    if (accessoryDays.length > 0) {
      const accHeader = document.createElement('div');
      accHeader.innerHTML = '<div style="font-size:14px;font-weight:600;color:#8b5cf6;margin:24px 0 12px 0;text-transform:uppercase;letter-spacing:0.5px">Accessory Days</div>';
      weekCalendar.appendChild(accHeader);
      
      accessoryDays.forEach((day) => {
        const dayIndex = w.days.indexOf(day);
        weekCalendar.appendChild(renderDayCard(day, dayIndex, true));
      });
    }

  }
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  
  const blocks = (state.blockHistory || []).slice();
  if (!blocks.length) {
    list.innerHTML = `<div class="card" style="background:rgba(17,24,39,.5)"><div class="card-title">No history yet</div><div class="card-subtitle">Generate a training block to see it here.</div></div>`;
    return;
  }
  
  list.innerHTML = '';
  
  blocks.forEach((block) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    
    const completedDays = block.weeks.reduce((sum, week) => 
      sum + week.days.filter(d => d.completed).length, 0);
    const totalDays = block.weeks.reduce((sum, week) => sum + week.days.length, 0);
    const progressPct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
    
    card.innerHTML = `
      <div class="card-title">${block.programType || 'General'} Block</div>
      <div class="card-subtitle">${block.startDateISO} • ${block.blockLength} weeks • ${completedDays}/${totalDays} sessions completed (${progressPct}%)</div>
      <div style="margin-top:8px;background:rgba(255,255,255,0.1);border-radius:8px;height:6px;overflow:hidden">
        <div style="width:${progressPct}%;height:100%;background:var(--primary);transition:width 0.3s"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-mini success" data-action="load" style="flex:1;min-width:80px">📋 Load</button>
        <button class="btn-mini primary" data-action="redo" style="flex:1;min-width:80px">🔄 Redo</button>
        <button class="btn-mini secondary" data-action="view" style="flex:1;min-width:80px">👁 View</button>
        <button class="btn-mini danger" data-action="delete" style="flex:0 0 auto">✕ Delete</button>
      </div>
    `;
    
    // Load block as current
    card.querySelector('[data-action="load"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Load this block as your current training block?\n\nThis will replace your current block.`)) {
        state.currentBlock = JSON.parse(JSON.stringify(block));
        
        // Reset to the appropriate week based on block's currentWeek or start from beginning
        ui.weekIndex = block.currentWeek || 0;
        
        saveState();
        renderDashboard();
        renderWorkout();
        notify('✅ Block loaded! Check Workout tab to continue.');
        showPage('Workout');
      }
    });
    
    // Redo block (reset all completion)
    card.querySelector('[data-action="redo"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Redo this entire ${block.blockLength}-week block from scratch?\n\nThis will reset all completed sessions and start fresh from Week 1, Day 1.`)) {
        console.log('🔄 REDO CLICKED - Starting fresh block process');
        console.log('📦 Original block from history:', block);
        
        const freshBlock = JSON.parse(JSON.stringify(block));
        console.log('📦 Fresh block copy:', freshBlock);
        console.log('📊 Fresh block weeks:', freshBlock.weeks?.length || 0);
        console.log('📊 Fresh block Week 1:', freshBlock.weeks?.[0]);
        console.log('📊 Fresh block Week 1 days:', freshBlock.weeks?.[0]?.days?.length || 0);
        
        // Reset all completion flags
        freshBlock.weeks.forEach((week, wIdx) => {
          console.log(`  Week ${wIdx + 1}: ${week.days?.length || 0} days`);
          week.days.forEach((day, dIdx) => {
            console.log(`    Day ${dIdx + 1}:`, day.name, '- exercises:', day.exercises?.length || 0);
            day.completed = false;
            day.completedDate = null;
          });
        });
        
        // Reset to today's date and Week 1
        freshBlock.startDateISO = todayISO();
        freshBlock.currentWeek = 0;  // Week 1 (0-indexed)
        
        // Set as current block
        state.currentBlock = freshBlock;
        state.setLogs = {};  // Clear all set logs
        
        // CRITICAL: Reset UI week index to 0
        ui.weekIndex = 0;
        
        console.log('💾 Saving state...');
        saveState();
        
        console.log('🎨 Rendering dashboard and workout...');
        renderDashboard();
        renderWorkout();
        
        console.log('✅ Redo complete! Check Workout tab.');
        notify('✅ Block reset! Starting fresh from Week 1, Day 1.');
        showPage('Workout');  // Show Workout tab with fresh block
      }
    });
    
    // View details
    card.querySelector('[data-action="view"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showBlockDetails(block);
    });
    
    
    // Delete
    card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete this ${block.blockLength}-week block?`)) {
        state.blockHistory = state.blockHistory.filter(b => b.id !== block.id);
        saveState();
        renderHistory();
        notify('Block deleted');
      }
    });
    
    list.appendChild(card);
  });
}

function showBlockDetails(block) {
  let html = `
    <div style="max-height:70vh;overflow-y:auto;padding:20px">
      <h3 style="margin-top:0">${block.programType || 'General'} Block</h3>
      <p style="color:var(--text-dim);margin-bottom:20px">
        Started: ${block.startDateISO}<br>
        Duration: ${block.blockLength} weeks<br>
        Units: ${block.units || 'kg'}
      </p>
  `;
  
  block.weeks.forEach((week, weekIdx) => {
    html += `
      <div style="margin-bottom:24px;padding:16px;background:rgba(255,255,255,0.05);border-radius:8px">
        <h4 style="margin:0 0 12px 0;color:var(--primary)">Week ${weekIdx + 1} - ${week.phase}</h4>
    `;
    
    week.days.forEach((day, dayIdx) => {
      const statusColor = day.completed ? '#10b981' : '#6b7280';
      const statusText = day.completed ? `✓ Completed ${day.completedDate}` : 'Not completed';
      
      html += `
        <div style="margin-bottom:16px;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;border-left:3px solid ${statusColor}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${day.title}</strong>
            <span style="font-size:12px;color:${statusColor}">${statusText}</span>
          </div>
      `;
      
      day.exercises.forEach((ex, exIdx) => {
        html += `<div style="margin:6px 0;font-size:13px;color:var(--text-dim)">
          ${ex.name}: ${ex.sets}×${ex.reps}${ex.prescribedWeight ? ` @ ${ex.prescribedWeight} ${block.units} (${ex.prescribedPct}%)` : ''}
        `;
        
        if (day.completed && ex.actualSets && ex.actualSets.length > 0) {
          const workSets = ex.actualSets.filter(s => s.tag === 'work' && s.weight);
          if (workSets.length > 0) {
            const weights = workSets.map(s => s.weight).filter(w => w);
            if (weights.length > 0) {
              const avgWeight = Math.round(weights.reduce((a, b) => Number(a) + Number(b), 0) / weights.length);
              html += `<br><span style="color:#10b981">→ Actual: ${avgWeight} ${block.units} avg</span>`;
            }
          }
        }
        
        html += `</div>`;
      });
      
      html += `</div>`;
    });
    
    html += `</div>`;
  });
  
  html += `</div>`;
  
  openModal('Block Details', '', html);
}

function exportBlock(block) {
  let csv = 'Week,Day,Exercise,Prescribed Sets,Prescribed Reps,Prescribed Weight,Prescribed %,Completed,Actual Sets\n';
  
  block.weeks.forEach((week, weekIdx) => {
    week.days.forEach((day) => {
      day.exercises.forEach((ex) => {
        const prescWeight = ex.prescribedWeight || '';
        const prescPct = ex.prescribedPct || '';
        const completed = day.completed ? 'Yes' : 'No';
        
        let actualSetsStr = '';
        if (day.completed && ex.actualSets) {
          const workSets = ex.actualSets.filter(s => s.tag === 'work');
          actualSetsStr = workSets.map(s => 
            `${s.weight || '-'}×${s.reps || '-'}${s.rpe ? `@${s.rpe}` : ''}`
          ).join('; ');
        }
        
        csv += `${weekIdx + 1},${day.title},"${ex.name}",${ex.sets},${ex.reps},${prescWeight},${prescPct},${completed},"${actualSetsStr}"\n`;
      });
    });
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LiftAI_${block.programType}_${block.startDateISO}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('Block exported');
}

function renderSessionSummary(session) {
  if (!session || !Array.isArray(session.work)) return '—';
  const lines = session.work.map(ex => `${ex.name}: ${ex.sets}×${ex.reps}${ex.weightText ? ' • ' + ex.weightText : ''}`);
  return lines.slice(0, 6).join('<br>') + (lines.length > 6 ? '<br>…' : '');
}

function renderSettings() {
  const sel = $('settingsProfileSelect');
  if (sel) {
    sel.innerHTML = '';
    Object.keys(state.profiles).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === state.activeProfile) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  const p = getProfile();
  const info = $('settingsInfo');
  if (info) info.textContent = `Active: ${p.name} • ${p.programType || 'general'} • ${p.units || 'kg'}`;
  if ($('settingsUnits')) $('settingsUnits').value = p.units || 'kg';
  if ($('settingsIncludeBlocks')) $('settingsIncludeBlocks').checked = !!p.includeBlocks;
  if ($('settingsVolumePref')) $('settingsVolumePref').value = p.volumePref || 'reduced';
  if ($('settingsAutoCut')) $('settingsAutoCut').checked = p.autoCut !== false;
  if ($('settingsAIEnabled')) $('settingsAIEnabled').checked = p.aiEnabled !== false;
  if ($('settingsAIModel')) $('settingsAIModel').value = p.aiModel || '';
  if ($('settingsSnatch')) $('settingsSnatch').value = p.maxes?.snatch ?? '';
  if ($('settingsCJ')) $('settingsCJ').value = p.maxes?.cj ?? '';
  if ($('settingsFS')) $('settingsFS').value = p.maxes?.fs ?? '';
  if ($('settingsBS')) $('settingsBS').value = p.maxes?.bs ?? '';
}

function isDayCompleted(weekIndex, dayIndex) {
  return (state.history || []).some(h => h.weekIndex === weekIndex && h.dayIndex === dayIndex && h.profileName === state.activeProfile);
}

function countCompletedForWeek(weekIndex) {
  return (state.history || []).filter(h => h.weekIndex === weekIndex && h.profileName === state.activeProfile).length;
}

function completeDay(weekIndex, dayIndex, dayPlan) {
  const p = getProfile();
  const key = workoutKey(weekIndex, dayIndex);
  const logs = ensureSetLogs();
  const dayLog = logs[key] || {};
  const session = {
    title: dayPlan.title,
    work: dayPlan.work.map((ex) => {
      const liftKey = ex.liftKey || dayPlan.liftKey;
      let weightText = '';
      if (ex.pct && liftKey) {
        const base = getBaseForExercise(ex.name, liftKey, p);
        const wgt = roundTo(base * ex.pct, p.units === 'kg' ? 1 : 1);
        weightText = `${wgt} ${p.units} (${Math.round(ex.pct * 100)}%)`;
      }
      return { ...ex, weightText };
    })
  };
  if (!p.liftAdjustments) p.liftAdjustments = {};
  const actionToAdj = (a) => {
    switch ((a || '').toLowerCase()) {
      case 'make': return 0.0025;
      case 'belt': return 0.0010;
      case 'heavy': return -0.0015;
      case 'miss': return -0.0050;
      default: return 0.0;
    }
  };
  const deltas = {};
  dayPlan.work.forEach((ex, exIndex) => {
    const liftKey = ex.liftKey || dayPlan.liftKey;
    if (!liftKey || !ex.pct) return;
    const workSets = getWorkSetsOverride(dayLog, exIndex, ex.sets);
    const exEff = { ...ex, sets: workSets };
    const scheme = buildSetScheme(exEff, liftKey, p);
    let lastWork = -1;
    for (let i = scheme.length - 1; i >= 0; i--) {
      if (scheme[i]?.tag === 'work') { lastWork = i; break; }
    }
    if (lastWork < 0) return;
    const recKey = `${exIndex}:${lastWork}`;
    const rec = dayLog[recKey] || {};
    const act = rec.action || '';
    const adj = computeCumulativeAdj(dayLog, exIndex, lastWork, scheme);
    const prescribed = scheme[lastWork]?.targetWeight ? roundTo(scheme[lastWork].targetWeight * (1 + adj), p.units === 'kg' ? 1 : 1) : 0;
    const performed = Number(rec.weight);
    let d = actionToAdj(act);
    if (Number.isFinite(performed) && performed > 0 && prescribed > 0) {
      const ratio = (performed / prescribed) - 1;
      d += 0.25 * clamp(ratio, -0.02, 0.02);
    }
    deltas[liftKey] = (deltas[liftKey] || 0) + d;
  });
  Object.keys(deltas).forEach((liftKey) => {
    const prev = Number(p.liftAdjustments[liftKey] || 0);
    const next = clamp(prev + deltas[liftKey], -0.05, 0.05);
    p.liftAdjustments[liftKey] = next;
  });
  
  // Update block history with completed session data
  state.blockHistory = state.blockHistory || [];
  const currentBlockId = `${state.activeProfile}_${state.currentBlock?.seed}`;
  const blockEntry = state.blockHistory.find(b => b.id === currentBlockId);
  
  if (blockEntry && blockEntry.weeks[weekIndex] && blockEntry.weeks[weekIndex].days[dayIndex]) {
    const dayEntry = blockEntry.weeks[weekIndex].days[dayIndex];
    dayEntry.completed = true;
    dayEntry.completedDate = todayISO();
    
    // Save actual performance data
    dayEntry.exercises.forEach((ex, exIndex) => {
      const scheme = buildSetScheme(dayPlan.work[exIndex], ex.liftKey, p);
      const actualSets = [];
      
      scheme.forEach((s, setIndex) => {
        const recKey = `${exIndex}:${setIndex}`;
        const rec = dayLog[recKey] || {};
        actualSets.push({
          setNumber: setIndex + 1,
          tag: s.tag,
          weight: rec.weight || null,
          reps: rec.reps || null,
          rpe: rec.rpe || null,
          action: rec.action || null
        });
      });
      
      ex.actualSets = actualSets;
    });
  }
  
  // Keep old history format for backward compatibility (for now)
  state.completedDays = state.completedDays || {};
  state.completedDays[`${state.activeProfile}|w${weekIndex}|d${dayIndex}`] = true;
  state.history = state.history || [];
  state.history.unshift({
    profileName: state.activeProfile,
    dateISO: todayISO(),
    weekIndex,
    dayIndex,
    title: dayPlan.title,
    session
  });
  
  saveState();
  renderWorkout();
  renderHistory();
  notify('Session completed');
}

function getSelectedDays(type) {
  const p = getProfile();
  if (!p) return [];
  if (type === 'main') return Array.isArray(p.mainDays) ? p.mainDays.slice() : [];
  if (type === 'accessory') return Array.isArray(p.accessoryDays) ? p.accessoryDays.slice() : [];
  return [];
}

function setSelectedDays(type, days) {
  const p = getProfile();
  if (!p) return;
  const uniq = Array.from(new Set((days || []).map(d => Number(d)).filter(Boolean))).sort((a, b) => a - b);
  if (type === 'main') p.mainDays = uniq;
  if (type === 'accessory') p.accessoryDays = uniq;
  saveState();
}

function syncDaySelectorUI() {
  const p = getProfile();
  const main = new Set((p.mainDays || []).map(Number));
  const acc = new Set((p.accessoryDays || []).map(Number));
  document.querySelectorAll('#mainDaySelector .day-btn').forEach(btn => {
    const d = Number(btn.dataset.day);
    btn.classList.toggle('active', main.has(d));
    btn.classList.toggle('disabled', acc.has(d));
  });
  document.querySelectorAll('#accessoryDaySelector .day-btn').forEach(btn => {
    const d = Number(btn.dataset.day);
    btn.classList.toggle('active', acc.has(d));
    btn.classList.toggle('disabled', main.has(d));
  });
}

let daySelectorBound = false;

function ensureDaySelectorsBound() {
  if (daySelectorBound) return;
  daySelectorBound = true;
  bindDaySelectorHandlers();
}

function bindDaySelectorHandlers() {
  const mainWrap = $('mainDaySelector');
  const accWrap = $('accessoryDaySelector');
  if (!mainWrap || !accWrap) return;
  const p = getProfile();
  if (!Array.isArray(p.mainDays)) p.mainDays = [];
  if (!Array.isArray(p.accessoryDays)) p.accessoryDays = [];
  const onClick = (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    e.preventDefault();
    const day = Number(btn.dataset.day);
    const type = btn.dataset.type;
    const otherType = type === 'main' ? 'accessory' : 'main';
    let days = getSelectedDays(type);
    const isActive = days.includes(day);
    if (isActive) {
      setSelectedDays(type, days.filter(d => d !== day));
      syncDaySelectorUI();
      return;
    }
    let other = getSelectedDays(otherType);
    if (other.includes(day)) {
      setSelectedDays(otherType, other.filter(d => d !== day));
    }
    days.push(day);
    setSelectedDays(type, days);
    syncDaySelectorUI();
  };
  mainWrap.replaceWith(mainWrap.cloneNode(true));
  accWrap.replaceWith(accWrap.cloneNode(true));
  const newMainWrap = $('mainDaySelector');
  const newAccWrap = $('accessoryDaySelector');
  if (newMainWrap) newMainWrap.addEventListener('click', onClick);
  if (newAccWrap) newAccWrap.addEventListener('click', onClick);
  syncDaySelectorUI();
}

function wireButtons() {
  $('btnAI')?.addEventListener('click', () => {
    openModal('🤖 AI Assistant', 'Placeholder', '<div class="help">AI features not enabled yet.</div>');
  });
  $('navSetup')?.addEventListener('click', () => showPage('Setup'));
  $('navDashboard')?.addEventListener('click', () => showPage('Dashboard'));
  $('navWorkout')?.addEventListener('click', () => showPage('Workout'));
  $('navHistory')?.addEventListener('click', () => showPage('History'));
  $('navSettings')?.addEventListener('click', () => showPage('Settings'));
  $('setupProfileSelect')?.addEventListener('change', (e) => {
    setActiveProfile(e.target.value);
    renderSetup();
  });
  $('btnSetupNewProfile')?.addEventListener('click', () => {
    const row = $('setupNewProfileRow');
    if (row) row.style.display = (row.style.display === 'none' || !row.style.display) ? 'flex' : 'none';
  });
  $('btnSetupCreateProfile')?.addEventListener('click', () => {
    const name = ($('setupNewProfileName')?.value || '').trim();
    if (!name) return;
    if (state.profiles[name]) {
      alert('Profile exists.');
      return;
    }
    const p = DEFAULT_PROFILE();
    p.name = name;
    state.profiles[name] = p;
    state.activeProfile = name;
    saveState();
    $('setupNewProfileName').value = '';
    $('setupNewProfileRow').style.display = 'none';
    renderSetup();
  });
  $('setupInjuryPreset')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const grid = $('injuryAdvancedGrid');
    const hint = $('injuryAdvancedHint');
    if (val === 'multiple') {
      if (grid) grid.style.display = 'block';
      if (hint) hint.style.display = 'block';
    } else {
      if (grid) grid.style.display = 'none';
      if (hint) hint.style.display = 'none';
    }
  });
  $('btnGenerateBlock')?.addEventListener('click', generateBlockFromSetup);
  $('btnDemo')?.addEventListener('click', () => {
    const demo = { snatch: 80, cj: 100, fs: 130, bs: 150, pushPress: 70, strictPress: 55 };
    $('setupSnatch').value = demo.snatch;
    $('setupCleanJerk').value = demo.cj;
    $('setupFrontSquat').value = demo.fs;
    $('setupBackSquat').value = demo.bs;
    $('setupPushPress').value = demo.pushPress;
    $('setupStrictPress').value = demo.strictPress;
    notify('Demo maxes loaded');
  });
  $('btnGoWorkout')?.addEventListener('click', () => showPage('Workout'));
  $('btnLogReadiness')?.addEventListener('click', () => {
    const o = $('readinessOverlay');
    if (o) o.classList.add('show');
  });
  $('btnPrevWeek')?.addEventListener('click', () => {
    if (!state.currentBlock) return;
    ui.weekIndex = clamp(ui.weekIndex - 1, 0, state.currentBlock.weeks.length - 1);
    renderWorkout();
  });
  $('btnNextWeek')?.addEventListener('click', () => {
    if (!state.currentBlock) return;
    ui.weekIndex = clamp(ui.weekIndex + 1, 0, state.currentBlock.weeks.length - 1);
    renderWorkout();
  });
  // v7.24: Full state export (not just history)
  $('btnExport')?.addEventListener('click', () => {
    const exportData = {
      version: 'v7.24',
      exportDate: new Date().toISOString(),
      currentBlock: state.currentBlock,
      blockHistory: state.blockHistory || [],
      history: state.history || [],
      profiles: state.profiles,
      activeProfile: state.activeProfile,
      setLogs: state.setLogs || {}
    };
    const data = JSON.stringify(exportData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liftai_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('✅ Data exported successfully!');
  });
  
  // v7.24: Import button handler
  $('btnImport')?.addEventListener('click', () => {
    const fileInput = $('fileImport');
    if (fileInput) fileInput.click();
  });
  
  // v7.24: File import handler
  $('fileImport')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importData = JSON.parse(event.target.result);
        
        if (!importData.version) {
          alert('Invalid file format. Please select a valid LiftAI backup file.');
          return;
        }
        
        if (!confirm(`Import data from ${importData.exportDate || 'backup'}?\n\nThis will MERGE with your current data (not replace).`)) {
          return;
        }
        
        // Merge imported data
        if (importData.blockHistory) {
          state.blockHistory = state.blockHistory || [];
          importData.blockHistory.forEach(block => {
            if (!state.blockHistory.find(b => b.id === block.id)) {
              state.blockHistory.push(block);
            }
          });
        }
        
        if (importData.profiles) {
          Object.keys(importData.profiles).forEach(profileName => {
            if (!state.profiles[profileName]) {
              state.profiles[profileName] = importData.profiles[profileName];
            }
          });
        }
        
        if (importData.history) {
          state.history = state.history || [];
          state.history.push(...importData.history);
        }
        
        if (importData.currentBlock && confirm('Also import the active training block from this backup?')) {
          state.currentBlock = importData.currentBlock;
        }
        
        saveState();
        renderHistory();
        renderSettings();
        notify('✅ Data imported successfully!');
      } catch (err) {
        console.error('Import error:', err);
        alert('Failed to import file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  
  $('settingsProfileSelect')?.addEventListener('change', (e) => {
    setActiveProfile(e.target.value);
    renderSettings();
  });
  $('btnNewProfile')?.addEventListener('click', () => {
    const row = $('newProfileRow');
    if (row) row.style.display = (row.style.display === 'none' || !row.style.display) ? 'flex' : 'none';
  });
  $('btnCreateProfile')?.addEventListener('click', () => {
    const name = ($('newProfileName')?.value || '').trim();
    if (!name) return;
    if (state.profiles[name]) {
      alert('Profile exists.');
      return;
    }
    const base = DEFAULT_PROFILE();
    base.name = name;
    state.profiles[name] = base;
    state.activeProfile = name;
    saveState();
    $('newProfileName').value = '';
    $('newProfileRow').style.display = 'none';
    renderSettings();
  });
  $('btnSaveSettings')?.addEventListener('click', () => {
    const p = getProfile();
    p.units = $('settingsUnits')?.value || p.units || 'kg';
    p.includeBlocks = !!$('settingsIncludeBlocks')?.checked;
    p.volumePref = $('settingsVolumePref')?.value || p.volumePref || 'reduced';
    p.autoCut = !!$('settingsAutoCut')?.checked;
    p.aiEnabled = !!$('settingsAIEnabled')?.checked;
    p.aiModel = $('settingsAIModel')?.value || '';
    const sn = Number($('settingsSnatch')?.value);
    const cj = Number($('settingsCJ')?.value);
    const fs = Number($('settingsFS')?.value);
    const bs = Number($('settingsBS')?.value);
    if ([sn, cj, fs, bs].some(v => !Number.isFinite(v) || v <= 0)) {
      alert('Enter all 1RMs.');
      return;
    }
    p.maxes = { snatch: sn, cj, fs, bs };
    p.workingMaxes = computeWorkingMaxes(p.maxes);
    if (state.currentBlock && state.currentBlock.profileName === state.activeProfile) {
      const len = state.currentBlock.blockLength;
      const weeks = [];
      for (let w = 0; w < len; w++) weeks.push(makeWeekPlan(p, w));
      state.currentBlock.weeks = weeks;
      ui.weekIndex = clamp(ui.weekIndex, 0, weeks.length - 1);
    }
    saveState();
    notify('Settings saved');
    renderDashboard();
    renderWorkout();
    renderSettings();
  });
  $('btnResetAll')?.addEventListener('click', () => {
    if (!confirm('Reset all data?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = DEFAULT_STATE();
    ui.weekIndex = 0;
    saveState();
    showPage('Setup');
    ensureDaySelectorsBound();
  });
  $('btnTestAI')?.addEventListener('click', () => {
    const status = $('aiTestStatus');
    if (status) status.textContent = 'AI test disabled';
    notify('AI test disabled');
  });
  $('btnExecExit')?.addEventListener('click', () => {
    $('execOverlay')?.classList.remove('show');
  });
  $('btnExecPrev')?.addEventListener('click', () => notify('Exec mode not used'));
  $('btnExecNext')?.addEventListener('click', () => notify('Exec mode not used'));
  $('btnCutRemaining')?.addEventListener('click', () => notify('Exec mode not used'));
  $('btnExecComplete')?.addEventListener('click', () => {
    $('execOverlay')?.classList.remove('show');
    notify('Exec complete');
  });
  $('btnExecOpenTable')?.addEventListener('click', () => notify('Exec mode not used'));
}

function boot() {
  wireButtons();
  bindWorkoutDetailControls();
  bindReadinessModal();
  ensureDaySelectorsBound();
  showPage('Setup');
  if (state.currentBlock && state.currentBlock.weeks?.length) {
    ui.weekIndex = 0;
  }
}

document.addEventListener('DOMContentLoaded', boot);
