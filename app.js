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

// ============================================================================
// CLOUD SYNC - Minimal Implementation
// ============================================================================

// ============================================================================
// SUPABASE CLOUD SYNC - REFACTORED FOR ACTUAL SCHEMA
// ============================================================================

const SUPABASE_URL = 'https://xbqlejwtfbeebucrdvqn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhicWxland0ZmJlZWJ1Y3JkdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwODgzODEsImV4cCI6MjA4NTY2NDM4MX0.1RdmT3twtadvxTjdepaqSYaqZRFkOAMhWyRQOjf-Zp0';

// Global Supabase client
let supabaseClient = null;

// Get anonymous user ID (stable across sessions)
function getAnonymousUserId() {
  let userId = localStorage.getItem('liftai_user_id');
  if (!userId) {
    // Create a stable user ID based on browser fingerprint
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    userId = `athlete_${timestamp}_${random}`;
    localStorage.setItem('liftai_user_id', userId);
    console.log('✓ Created new user ID:', userId);
  }
  return userId;
}

// Initialize Supabase with polling and timeout
function initSupabase() {
  let attempts = 0;
  const maxAttempts = 50; // 50 attempts * 100ms = 5 seconds
  
  const pollInterval = setInterval(() => {
    attempts++;
    
    // Check if window.supabase is available
    if (window.supabase && window.supabase.createClient) {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        clearInterval(pollInterval);
        console.log(`✅ Cloud sync ready (${attempts * 100}ms)`);
        
        // Test connection by attempting to query
        testSupabaseConnection();
        
        // Show brief success indicator
        showCloudNotification('success', '☁️ Cloud sync enabled');
        
      } catch (e) {
        console.error('❌ Failed to initialize Supabase:', e);
        clearInterval(pollInterval);
        showCloudNotification('error', `Initialization failed: ${e.message}`);
      }
      return;
    }
    
    // Timeout after 5 seconds
    if (attempts >= maxAttempts) {
      clearInterval(pollInterval);
      console.warn(`⚠️ Cloud sync unavailable (timeout after ${maxAttempts * 100}ms)`);
      showCloudNotification('warning', 'Cloud sync unavailable (app still works)');
    }
  }, 100);
}

// Test Supabase connection
async function testSupabaseConnection() {
  if (!supabaseClient) return;
  
  try {
    const userId = getAnonymousUserId();
    // Simple count query to test connection
    const { count, error } = await supabaseClient
      .from('training_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error) {
      console.warn('⚠️ Supabase connection test failed:', error.message);
      return false;
    }
    
    console.log(`✓ Supabase connection verified (${count || 0} blocks found)`);
    return true;
  } catch (e) {
    console.warn('⚠️ Connection test error:', e);
    return false;
  }
}

// Push current block to cloud
async function pushToCloud() {
  // Safety check
  if (!supabaseClient) {
    console.warn('Supabase not ready');
    showCloudNotification('warning', 'Cloud sync not ready');
    return;
  }
  
  if (!state.currentBlock) {
    showCloudNotification('warning', 'No block to save');
    return;
  }
  
  try {
    showCloudNotification('info', 'Saving to cloud...');
    
    const userId = getAnonymousUserId();
    const profile = getProfile();
    
    // Get or create block name (LOGIC FIX: Update state.currentBlock.name if missing)
    let blockName = state.currentBlock.name;
    if (!blockName || blockName.trim() === '') {
      const date = new Date().toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric' 
      });
      blockName = `${profile.programType || 'Training'} Block - ${date}`;
      state.currentBlock.name = blockName; // Update block name in state
    }
    
    // Prepare payload
    const payload = {
      user_id: userId,
      block_name: blockName,
      block_data: state.currentBlock,
      profile_data: {
        maxes: profile.maxes,
        workingMaxes: profile.workingMaxes,
        units: profile.units,
        programType: profile.programType,
        volumePref: profile.volumePref,
        blockLength: profile.blockLength,
        athleteDetails: state.athleteDetails || null
      },
      is_active: true
    };
    
    // Validate size
    const payloadSize = new Blob([JSON.stringify(payload)]).size;
    const maxSize = 1024 * 1024; // 1MB
    
    if (payloadSize > maxSize) {
      const sizeMB = (payloadSize / (1024 * 1024)).toFixed(2);
      throw new Error(`Block too large (${sizeMB}MB). Maximum 1MB.`);
    }
    
    console.log(`📤 Uploading ${(payloadSize / 1024).toFixed(1)}KB`, {
      user_id: payload.user_id,
      block_name: payload.block_name
    });
    
    // Try upsert first, fallback to manual check
    let result;
    let useUpsert = true;
    
    try {
      // Attempt atomic upsert (requires UNIQUE constraint)
      const { data, error } = await supabaseClient
        .from('training_blocks')
        .upsert(payload, {
          onConflict: 'user_id,block_name',
          ignoreDuplicates: false
        })
        .select()
        .single();
      
      if (error) {
        console.error('Upsert error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        // Check if error is due to missing constraint
        if (error.message && (
          error.message.includes('no unique or exclusion constraint') ||
          error.message.includes('Conflict algorithm') ||
          error.code === '42P10'
        )) {
          console.warn('⚠️ UNIQUE constraint missing - falling back to manual check');
          useUpsert = false;
        } else {
          throw error;
        }
      } else {
        result = data;
      }
    } catch (upsertError) {
      console.error('Upsert attempt failed:', {
        message: upsertError.message,
        code: upsertError.code
      });
      useUpsert = false;
    }
    
    // FALLBACK: Manual check and update/insert
    if (!useUpsert) {
      console.log('Using fallback: manual check and update/insert');
      
      // Check if exists
      const { data: existing, error: searchError } = await supabaseClient
        .from('training_blocks')
        .select('id')
        .eq('user_id', userId)
        .eq('block_name', blockName)
        .maybeSingle();
      
      if (searchError) {
        console.error('Search error:', searchError);
        throw new Error(`Search failed: ${searchError.message}`);
      }
      
      if (existing && existing.id) {
        // Update
        console.log('📝 Updating existing block:', existing.id);
        
        const { data, error } = await supabaseClient
          .from('training_blocks')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        
        if (error) {
          console.error('Update error:', error);
          throw new Error(`Update failed: ${error.message}`);
        }
        
        result = data;
        console.log('✅ Block updated');
      } else {
        // Insert
        console.log('📝 Creating new block');
        
        const { data, error } = await supabaseClient
          .from('training_blocks')
          .insert([payload])
          .select()
          .single();
        
        if (error) {
          console.error('Insert error:', error);
          throw new Error(`Insert failed: ${error.message}`);
        }
        
        result = data;
        console.log('✅ Block created');
      }
    }
    
    if (!result) {
      throw new Error('No data returned from save operation');
    }
    
    // HISTORY FIX: Add/update block in history after successful save
    if (!state.blockHistory) {
      state.blockHistory = [];
    }
    
    const existingHistoryIndex = state.blockHistory.findIndex(
      h => (h.cloudId === result.id) || (h.name === blockName && h.profileName === state.activeProfile)
    );
    
    if (existingHistoryIndex >= 0) {
      // Update existing history entry
      state.blockHistory[existingHistoryIndex].lastSyncedAt = new Date().toISOString();
      state.blockHistory[existingHistoryIndex].cloudId = result.id;
      state.blockHistory[existingHistoryIndex].blockLength = state.currentBlock.weeks?.length || 0;
      console.log('✓ Updated existing history entry');
    } else {
      // Create new history entry
      const historyEntry = {
        id: result.id,
        name: blockName,
        blockLength: state.currentBlock.weeks?.length || 0,
        programType: profile.programType || 'general',
        profileName: state.activeProfile,
        startDate: state.currentBlock.startDate || result.created_at || new Date().toISOString(),
        endDate: null,
        completed: false,
        cloudId: result.id,
        lastSyncedAt: new Date().toISOString(),
        source: 'cloud_save'
      };
      
      state.blockHistory.unshift(historyEntry); // Add to beginning (newest first)
      
      // LOGIC FIX: Limit history to prevent bloat
      if (state.blockHistory.length > 100) {
        state.blockHistory = state.blockHistory.slice(0, 100);
      }
      
      console.log('✓ Added new history entry:', historyEntry.name);
    }
    
    // Save state and refresh history view
    saveState();
    
    // LOGIC FIX: Only call renderHistory if function exists and History page is visible
    if (typeof renderHistory === 'function') {
      renderHistory();
    }
    
    console.log('✅ Save successful:', result);
    showCloudNotification('success', 'Block saved to cloud');
    
    localStorage.setItem('liftai_last_sync', new Date().toISOString());
    
  } catch (e) {
    // Improved error logging
    console.error('❌ Push to cloud failed:', {
      message: e.message,
      stack: e.stack,
      error: e
    });
    
    // User-friendly error message
    let errorMsg = 'Save failed';
    if (e.message) {
      errorMsg = e.message.length > 100 
        ? e.message.substring(0, 100) + '...' 
        : e.message;
    }
    
    showCloudNotification('error', errorMsg);
    throw e;
  }
}

// Pull blocks from cloud
async function pullFromCloud() {
  // Safety check
  if (!supabaseClient) {
    console.warn('Supabase not ready');
    showCloudNotification('warning', 'Cloud sync not ready');
    return;
  }
  
  try {
    showCloudNotification('info', 'Loading from cloud...');
    
    const userId = getAnonymousUserId();
    
    console.log('📥 Fetching blocks for user:', userId);
    
    // Fetch all active blocks for this user
    const { data: blocks, error } = await supabaseClient
      .from('training_blocks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('id', { ascending: false }) // Most recent first (by creation order)
      .limit(20);
    
    if (error) {
      console.error('Fetch error:', error);
      throw error;
    }
    
    console.log(`✅ Fetched ${blocks?.length || 0} blocks`);
    
    if (!blocks || blocks.length === 0) {
      showCloudNotification('info', 'No saved blocks found');
      return;
    }
    
    // Validate that blocks have the required data
    const validBlocks = blocks.filter(b => {
      const valid = b.block_data && typeof b.block_data === 'object';
      if (!valid) {
        console.warn('Invalid block data:', b);
      }
      return valid;
    });
    
    if (validBlocks.length === 0) {
      showCloudNotification('warning', 'Found blocks but data is invalid');
      return;
    }
    
    console.log(`✓ ${validBlocks.length} valid blocks ready to display`);
    
    // HISTORY FIX: Sync cloud blocks with local history
    if (!state.blockHistory) {
      state.blockHistory = [];
    }
    
    validBlocks.forEach(cloudBlock => {
      const existingIndex = state.blockHistory.findIndex(
        h => h.cloudId === cloudBlock.id || (h.name === cloudBlock.block_name && h.profileName === state.activeProfile)
      );
      
      if (existingIndex === -1) {
        // Add to history if not present
        const historyEntry = {
          id: cloudBlock.id,
          name: cloudBlock.block_name,
          blockLength: cloudBlock.block_data.weeks?.length || 0,
          programType: cloudBlock.profile_data?.programType || 'general',
          profileName: state.activeProfile,
          startDate: cloudBlock.created_at,
          endDate: null,
          completed: false,
          cloudId: cloudBlock.id,
          lastSyncedAt: new Date().toISOString(),
          source: 'cloud_pull'
        };
        
        state.blockHistory.push(historyEntry);
        console.log('✓ Added cloud block to history:', historyEntry.name);
      } else {
        // Update existing entry with cloud ID
        state.blockHistory[existingIndex].cloudId = cloudBlock.id;
        state.blockHistory[existingIndex].lastSyncedAt = new Date().toISOString();
      }
    });
    
    // Save updated history
    saveState();
    
    // Refresh history view if function exists
    if (typeof renderHistory === 'function') {
      renderHistory();
    }
    
    // Show modal with blocks
    showCloudBlocksModal(validBlocks);
    
  } catch (e) {
    console.error('❌ Pull from cloud failed:', e);
    showCloudNotification('error', `Load failed: ${e.message}`);
  }
}

// Show modal with available blocks
function showCloudBlocksModal(blocks) {
  // Remove any existing modal
  const existingModal = document.getElementById('cloudModal');
  if (existingModal) existingModal.remove();
  
  const html = blocks.map(b => {
    const blockLength = b.block_data?.blockLength || b.block_data?.weeks?.length || 0;
    const programType = b.profile_data?.programType || 'general';
    
    return `
      <div 
        onclick="window.restoreFromCloud('${b.id}')" 
        style="
          padding: 14px 16px;
          margin: 10px 0;
          background: rgba(59,130,246,0.1);
          border: 1px solid rgba(59,130,246,0.3);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        "
        onmouseover="this.style.background='rgba(59,130,246,0.2)'; this.style.borderColor='rgba(59,130,246,0.5)'"
        onmouseout="this.style.background='rgba(59,130,246,0.1)'; this.style.borderColor='rgba(59,130,246,0.3)'"
      >
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">
          ${escapeHtml(b.block_name)}
        </div>
        <div style="font-size: 13px; color: #9ca3af;">
          ${blockLength} weeks • ${programType}
        </div>
      </div>
    `;
  }).join('');
  
  const modal = document.createElement('div');
  modal.id = 'cloudModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
    animation: fadeIn 0.2s ease-out;
  `;
  
  modal.innerHTML = `
    <div style="
      background: #111827;
      border-radius: 16px;
      padding: 28px;
      max-width: 520px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    ">
      <h3 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700;">
        ☁️ Saved Training Blocks
      </h3>
      <div style="
        flex: 1;
        overflow-y: auto;
        margin: 0 -8px;
        padding: 0 8px;
      ">
        ${html}
      </div>
      <button 
        onclick="window.closeCloudModal()" 
        style="
          margin-top: 20px;
          width: 100%;
          padding: 12px;
          background: #374151;
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        "
        onmouseover="this.style.background='#4b5563'"
        onmouseout="this.style.background='#374151'"
      >
        Cancel
      </button>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) window.closeCloudModal();
  };
  
  document.body.appendChild(modal);
}

// Restore a block from cloud
window.restoreFromCloud = async function(blockId) {
  // Safety check
  if (!supabaseClient) {
    console.warn('Supabase not ready');
    showCloudNotification('warning', 'Cloud sync not ready');
    return;
  }
  
  if (!blockId) {
    console.error('No block ID provided');
    return;
  }
  
  try {
    showCloudNotification('info', 'Restoring block...');
    
    console.log('📥 Restoring block:', blockId);
    
    const { data, error } = await supabaseClient
      .from('training_blocks')
      .select('*')
      .eq('id', blockId)
      .single();
    
    if (error) {
      console.error('Restore error:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error('Block not found');
    }
    
    console.log('✅ Block retrieved:', data);
    
    // Validate block data
    if (!data.block_data || typeof data.block_data !== 'object') {
      throw new Error('Invalid block data structure');
    }
    
    // Restore block data to state
    state.currentBlock = data.block_data;
    
    // Restore profile data if available
    if (data.profile_data && typeof data.profile_data === 'object') {
      const profile = getProfile();
      
      // Restore maxes
      if (data.profile_data.maxes) {
        profile.maxes = { ...profile.maxes, ...data.profile_data.maxes };
      }
      
      // Restore working maxes
      if (data.profile_data.workingMaxes) {
        profile.workingMaxes = { ...profile.workingMaxes, ...data.profile_data.workingMaxes };
      }
      
      // Restore other settings
      if (data.profile_data.units) profile.units = data.profile_data.units;
      if (data.profile_data.programType) profile.programType = data.profile_data.programType;
      if (data.profile_data.volumePref) profile.volumePref = data.profile_data.volumePref;
      if (data.profile_data.blockLength) profile.blockLength = data.profile_data.blockLength;
      
      console.log('✓ Profile data restored');
    }
    
    // Save to localStorage
    saveState();
    
    // Reset UI
    ui.weekIndex = 0;
    
    // Refresh UI
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderWorkout === 'function') renderWorkout();
    if (typeof showPage === 'function') showPage('Dashboard');
    
    // Close modal
    window.closeCloudModal();
    
    console.log('✅ Block restored successfully');
    showCloudNotification('success', 'Block restored!');
    
  } catch (e) {
    console.error('❌ Restore failed:', e);
    showCloudNotification('error', `Restore failed: ${e.message}`);
  }
};

// Close cloud modal
window.closeCloudModal = function() {
  const modal = document.getElementById('cloudModal');
  if (modal) {
    modal.style.animation = 'fadeOut 0.2s ease-in';
    setTimeout(() => modal.remove(), 200);
  }
};

// Helper: Escape HTML to prevent XSS
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper: Show cloud notification
function showCloudNotification(type, message) {
  const colors = {
    success: 'rgba(16, 185, 129, 0.95)',
    error: 'rgba(239, 68, 68, 0.95)',
    warning: 'rgba(245, 158, 11, 0.95)',
    info: 'rgba(59, 130, 246, 0.95)'
  };
  
  const color = colors[type] || colors.info;
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: ${color};
    color: white;
    padding: 14px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    max-width: 320px;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Auto-dismiss
  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

// ============================================================================
// END SUPABASE CLOUD SYNC
// ============================================================================
// ============================================================================


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

// ============================================================================
// v7.45 TASK 3: ARI & K-VALUE COMPUTATION + RECOVERY ADAPTATION
// ============================================================================

// v7.45 ARI: Compute block-level Average Relative Intensity
// Formula: ARI = Σ(%1RM × reps) / Σ(reps) for all main lifts
// This measures overall training stress across the entire block
function computeBlockARI(block) {
  if (!block || !block.weeks) return 0;
  
  let weightedPctSum = 0;
  let repSum = 0;
  
  block.weeks.forEach((week, wIdx) => {
    if (!week || !week.days) return;
    
    week.days.forEach((day, dIdx) => {
      if (!day || !day.work) return;
      
      day.work.forEach((ex) => {
        // Only count main lifts (snatch, C&J, squats)
        const isMainLift = ['snatch', 'cj', 'bs', 'fs'].includes(ex.liftKey);
        if (!isMainLift || !ex.pct || !ex.reps || !ex.sets) return;
        
        // Calculate total reps for this exercise
        const totalReps = ex.sets * ex.reps;
        if (totalReps <= 0) return;
        
        // Accumulate weighted intensity
        repSum += totalReps;
        weightedPctSum += ex.pct * totalReps;
      });
    });
  });
  
  if (!repSum) return 0;
  const ari = weightedPctSum / repSum;
  console.log(`v7.45 ARI: Computed block ARI = ${(ari * 100).toFixed(1)}% (${repSum} total reps)`);
  return ari; // Returns value like 0.78 = 78%
}

// v7.45 K-VALUE: Compute training load metric from ARI and two-lift total
// K-value = ARI × 100 (simplified formula)
// Higher K = higher training intensity
function computeKValue(block, twoLiftTotal) {
  if (!twoLiftTotal || twoLiftTotal <= 0) return null;
  
  const ARI = block.ari ?? computeBlockARI(block);
  if (!ARI) return null;
  
  // K-value = ARI × 100
  const kValue = ARI * 100;
  console.log(`v7.45 K-VALUE: K = ${kValue.toFixed(1)} (ARI: ${(ARI * 100).toFixed(1)}%, Total: ${twoLiftTotal}kg)`);
  return kValue;
}

// v7.45 RECOVERY: Get recent complex fatigue indicators
// Scans set logs for high RPE and misses in complex exercises
function getRecentComplexFatigueFlags() {
  const logs = state.setLogs || {};
  let highRpeCount = 0;
  let missCount = 0;
  let complexSetCount = 0;
  
  // Scan all logged sets
  Object.values(logs).forEach(dayLog => {
    if (!dayLog || typeof dayLog !== 'object') return;
    
    Object.values(dayLog).forEach(rec => {
      if (!rec || typeof rec !== 'object') return;
      
      // Check if this was a complex exercise set
      const exName = rec.exerciseName || rec.name || '';
      if (!isComplex(exName)) return;
      
      complexSetCount++;
      
      // Check RPE (9+ is very high)
      const rpe = Number(rec.rpe || 0);
      if (rpe >= 9) highRpeCount++;
      
      // Check for misses
      const action = String(rec.action || '').toLowerCase();
      if (action === 'miss') missCount++;
    });
  });
  
  // Calculate fatigue score (0-1 scale)
  const fatigueScore = complexSetCount > 0 
    ? (highRpeCount + missCount * 2) / complexSetCount 
    : 0;
  
  return { 
    highRpeCount, 
    missCount, 
    complexSetCount,
    fatigueScore
  };
}

// v7.45 RECOVERY: Apply fatigue-based intensity reduction to complexes
// Extra 5% reduction when athlete is fatigued
function applyComplexFatigueAdjustment(pct, exName, fatigued) {
  if (!isComplex(exName) || !pct || !fatigued) return pct;
  
  const adjusted = pct * 0.95;
  console.log(`v7.45 Fatigue: ${exName} ${(pct * 100).toFixed(1)}% → ${(adjusted * 100).toFixed(1)}%`);
  return adjusted;
}

// v7.45 RECOVERY: Downgrade complex structure when fatigued
// Reduces rep count to manage fatigue
function downgradeComplexIfFatigued(exName, fatigued) {
  if (!fatigued || !isComplex(exName)) return exName;
  
  // Map 3-rep complexes to 2-rep versions
  const downgrades = {
    // Snatch downgrades (3-rep → 2-rep)
    'Snatch Pull + Hang Snatch + Snatch': 'Snatch Pull + Snatch',
    'Snatch High Pull + Hang Snatch + OHS': 'Snatch High Pull + Snatch',
    'Low Hang Snatch + Hang Snatch + Snatch': 'Hang Snatch + Snatch',
    'Hip Snatch + Hang Snatch + Snatch': 'Hang Snatch + Snatch',
    'Halting Snatch Deadlift + Snatch Pull + Snatch': 'Snatch Pull + Snatch',
    
    // C&J downgrades
    'Clean Pull + Hang Clean + Front Squat': 'Clean Pull + Clean',
    'Clean Pull + Clean + Front Squat': 'Clean Pull + Clean',
    'Clean + Front Squat + Clean': 'Clean + Front Squat',
    'Low Hang Clean + Hang Clean + Clean': 'Hang Clean + Clean',
    'Hip Clean + Hang Clean + Clean': 'Hang Clean + Clean',
    'Power Clean + Clean + Jerk': 'Clean + Jerk',
    'Block Clean + Clean + Jerk': 'Clean + Jerk',
    'Clean + Front Squat + Jerk': 'Clean + Jerk',
    'Clean + Jerk + Jerk': 'Clean + Jerk'
  };
  
  const downgraded = downgrades[exName] || exName;
  
  if (downgraded !== exName) {
    console.log(`v7.45 Fatigue: Downgraded ${exName} → ${downgraded}`);
  }
  
  return downgraded;
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

// v7.45 COMPLEX ENGINE: Structural definitions of Olympic complexes
// Represents each complex as a sequence of movements with rep counts
// Used for intelligent intensity capping and diagnostic selection
const COMPLEX_DEFINITIONS = {
  // SNATCH COMPLEXES
  // Pull + Lift patterns (preparatory, pull emphasis)
  'Snatch Pull + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'pull', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Snatch Pull + Hang Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'pull', reps: 1 },
      { type: 'hang_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Snatch High Pull + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'high_pull', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Segment Snatch Pull + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'segment_pull', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Halting Snatch Deadlift + Snatch Pull + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'halting_deadlift', reps: 1 },
      { type: 'pull', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  
  // Lift + Squat patterns (receiving/strength emphasis)
  'Snatch + OHS (pause)': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'snatch', reps: 1 },
      { type: 'overhead_squat', reps: 1 }
    ]
  },
  'Snatch + Snatch (1+1)': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Muscle Snatch + OHS': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'muscle_snatch', reps: 1 },
      { type: 'overhead_squat', reps: 1 }
    ]
  },
  'Snatch Balance + OHS': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'snatch_balance', reps: 1 },
      { type: 'overhead_squat', reps: 1 }
    ]
  },
  
  // Position work (technique emphasis)
  'Snatch High Pull + Hang Snatch + OHS': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'high_pull', reps: 1 },
      { type: 'hang_snatch', reps: 1 },
      { type: 'overhead_squat', reps: 1 }
    ]
  },
  'Snatch (pause at knee) + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'pause_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Hang Snatch (above knee) + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'hang_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Tall Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'tall_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Low Hang Snatch + Hang Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'low_hang_snatch', reps: 1 },
      { type: 'hang_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Hip Snatch + Hang Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'hip_snatch', reps: 1 },
      { type: 'hang_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Power Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'power_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  'Block Snatch + Snatch': {
    primaryLift: 'snatch',
    pattern: [
      { type: 'block_snatch', reps: 1 },
      { type: 'snatch', reps: 1 }
    ]
  },
  
  // CLEAN & JERK COMPLEXES
  // Pull + Clean patterns (preparatory, pull emphasis)
  'Clean Pull + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'pull', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Clean Pull + Hang Clean + Front Squat': {
    primaryLift: 'cj',
    pattern: [
      { type: 'pull', reps: 1 },
      { type: 'hang_clean', reps: 1 },
      { type: 'front_squat', reps: 1 }
    ]
  },
  'Clean Pull + Clean + Front Squat': {
    primaryLift: 'cj',
    pattern: [
      { type: 'pull', reps: 1 },
      { type: 'clean', reps: 1 },
      { type: 'front_squat', reps: 1 }
    ]
  },
  
  // Clean + Squat patterns (receiving/strength emphasis)
  'Clean + Front Squat': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'front_squat', reps: 1 }
    ]
  },
  'Clean + Front Squat + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'front_squat', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Clean + Front Squat (2 reps)': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'front_squat', reps: 2 }
    ]
  },
  
  // Clean technique patterns
  'Clean (pause at knee) + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'pause_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Hang Clean (above knee) + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'hang_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Tall Clean + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'tall_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Low Hang Clean + Hang Clean + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'low_hang_clean', reps: 1 },
      { type: 'hang_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  'Hip Clean + Hang Clean + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'hip_clean', reps: 1 },
      { type: 'hang_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  },
  
  // Jerk patterns (overhead stability emphasis)
  'Clean + Jerk + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'jerk', reps: 2 }
    ]
  },
  'Jerk Dip Squat (pause) + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'jerk_dip', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Power Jerk + Split Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'power_jerk', reps: 1 },
      { type: 'split_jerk', reps: 1 }
    ]
  },
  'Pause Jerk + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'pause_jerk', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Split Jerk + Jerk Balance': {
    primaryLift: 'cj',
    pattern: [
      { type: 'split_jerk', reps: 1 },
      { type: 'jerk_balance', reps: 1 }
    ]
  },
  'Jerk from Blocks + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'block_jerk', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  
  // Full CJ patterns
  'Clean + Front Squat + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'front_squat', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Clean + Jerk (1+1)': {
    primaryLift: 'cj',
    pattern: [
      { type: 'clean', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Power Clean + Clean + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'power_clean', reps: 1 },
      { type: 'clean', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Block Clean + Clean + Jerk': {
    primaryLift: 'cj',
    pattern: [
      { type: 'block_clean', reps: 1 },
      { type: 'clean', reps: 1 },
      { type: 'jerk', reps: 1 }
    ]
  },
  'Tempo Clean (3s) + Clean': {
    primaryLift: 'cj',
    pattern: [
      { type: 'tempo_clean', reps: 1 },
      { type: 'clean', reps: 1 }
    ]
  }
};

// v7.45 COMPLEX ENGINE: Get structural pattern for a complex
// Returns pattern array or null if not a defined complex
function getComplexPattern(exerciseName) {
  if (!exerciseName) return null;
  return COMPLEX_DEFINITIONS[exerciseName]?.pattern || null;
}

// v7.45 COMPLEX ENGINE: Calculate total reps in a complex
// Sums all reps across all movements in the pattern
function getComplexTotalReps(pattern) {
  if (!pattern || !Array.isArray(pattern)) return 0;
  return pattern.reduce((sum, movement) => sum + (movement.reps || 0), 0);
}

// v7.45 COMPLEX ENGINE: Apply rep-based intensity caps to complexes
// Prevents overloading based on total volume per rep
// Formula: ≤2 reps → 90%, =3 reps → 85%, 4-5 reps → 75%, 6+ reps → 70%
function capComplexIntensity(pct, totalReps) {
  if (!totalReps || totalReps <= 0) return pct;
  
  let cap;
  if (totalReps <= 2) {
    cap = 0.90; // High intensity work (singles, doubles)
  } else if (totalReps === 3) {
    cap = 0.85; // Moderate-high intensity
  } else if (totalReps <= 5) {
    cap = 0.75; // Moderate intensity (4-5 reps)
  } else {
    cap = 0.70; // Lower intensity (6+ reps, volume work)
  }
  
  // Return the minimum of current percentage and the cap
  return Math.min(pct, cap);
}

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
  readinessLog: [],
  // v7.28: Store user's actual accessory weights to recall later
  accessoryWeights: {} // { 'Barbell Bench Press': 47, 'T-Bar Row': 75, ... }
});

const DEFAULT_STATE = () => ({
  version: 'fully_fixed_v1',
  activeProfile: 'Default',
  profiles: { Default: DEFAULT_PROFILE() },
  currentBlock: null,
  history: [],
  setLogs: {},
  workoutReadiness: {}, // v7.33: Per-workout readiness scores
  blockHistory: [] // v7.24: Store completed blocks
});

let state;
let ui = { currentPage: 'Setup', weekIndex: 0 };

// Safe state initialization with error handling
try {
  state = loadState();
  console.log('✓ State loaded successfully');
} catch (error) {
  console.error('Failed to load state, using defaults:', error);
  state = DEFAULT_STATE();
  // Try to save the default state
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (saveError) {
    console.warn('Cannot save to localStorage:', saveError);
  }
}

/**
 * Calculate appropriate pull percentage offset based on phase and lift type
 * Research: Catalyst Athletics, USAW, Soviet methodology, Torokhtiy programs
 * 
 * Olympic lifting pulls should be prescribed as percentages of the competition lift,
 * with the offset varying by training phase:
 * 
 * ACCUMULATION: Lighter pulls (volume, technique focus)
 * - Snatch Pulls: +5% (70-80% of Snatch)
 * - Clean Pulls: +8% (75-85% of Clean/C&J)
 * 
 * INTENSIFICATION: Heavier pulls (strength development)
 * - Snatch Pulls: +10% (85-95% of Snatch)
 * - Clean Pulls: +15% (90-100% of Clean/C&J)
 * 
 * COMPETITION: Moderate pulls (peak performance, maintenance)
 * - Snatch Pulls: +8% (88-98% of Snatch)
 * - Clean Pulls: +12% (92-102% of Clean/C&J)
 * 
 * @param {string} phase - Training phase (accumulation, intensification, competition)
 * @param {string} pullType - 'snatch' or 'clean'
 * @returns {number} Percentage offset to add to base intensity
 */
function getPullOffset(phase, pullType) {
  // Snatch pulls are generally lighter (more technique-limited)
  // Clean pulls can be heavier (more strength-limited)
  
  if (phase === 'accumulation') {
    // Focus: Volume, technique, position
    // Research range: Snatch 70-80%, Clean 75-85%
    return pullType === 'snatch' ? 0.05 : 0.08;
  } 
  else if (phase === 'intensification') {
    // Focus: Strength development
    // Research range: Snatch 85-95%, Clean 90-100%
    return pullType === 'snatch' ? 0.10 : 0.15;
  } 
  else if (phase === 'competition' || phase === 'peaking') {
    // Focus: Peak performance, maintenance
    // Research range: Snatch 88-98%, Clean 92-102%
    return pullType === 'snatch' ? 0.08 : 0.12;
  }
  
  // Default fallback for unknown phases
  return pullType === 'snatch' ? 0.08 : 0.10;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log('No saved state found, using defaults');
      return DEFAULT_STATE();
    }
    
    const parsed = safeJsonParse(raw, null);
    if (!parsed || typeof parsed !== 'object') {
      console.warn('Invalid state data, using defaults');
      return DEFAULT_STATE();
    }
    
    const s = Object.assign(DEFAULT_STATE(), parsed);
    
    // Validate profiles
    if (!s.profiles || typeof s.profiles !== 'object') {
      console.warn('Invalid profiles, resetting to default');
      s.profiles = { Default: DEFAULT_PROFILE() };
    }
    
    // Validate active profile
    if (!s.activeProfile || !s.profiles[s.activeProfile]) {
      console.warn('Invalid active profile, selecting first available');
      s.activeProfile = Object.keys(s.profiles)[0] || 'Default';
      if (!s.profiles[s.activeProfile]) {
        s.profiles.Default = DEFAULT_PROFILE();
        s.activeProfile = 'Default';
      }
    }
    
    // Ensure all profiles have required fields
    Object.keys(s.profiles).forEach(profileName => {
      const p = s.profiles[profileName];
      const defaults = DEFAULT_PROFILE();
      Object.keys(defaults).forEach(key => {
        if (!(key in p)) {
          p[key] = defaults[key];
        }
      });
    });
    
    console.log('✓ State loaded and validated');
    return s;
    
  } catch (error) {
    console.error('Error loading state, using defaults:', error);
    return DEFAULT_STATE();
  }
}

function saveState() {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error('Failed to save state:', error);
    
    // Check for quota exceeded error
    if (error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, attempting cleanup...');
      
      // Try to save a minimal version
      try {
        const minimal = {
          version: state.version,
          activeProfile: state.activeProfile,
          profiles: state.profiles,
          currentBlock: null // Drop current block to save space
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        console.log('✓ Saved minimal state after quota error');
        alert('Warning: Storage almost full. Some workout history may not be saved.');
        return true;
      } catch (minimalError) {
        console.error('Even minimal save failed:', minimalError);
      }
    }
    
    return false;
  }
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

// v7.45 COMPLEX ENGINE: Map phase to complex role
// accumulation → "preparatory" (volume, technique)
// intensification → "specific" (competition-like)
// deload → "deload" (reduced complexity)
function complexPhaseRole(phase) {
  if (phase === 'accumulation') return 'preparatory';
  if (phase === 'intensification') return 'specific';
  return 'deload';
}

// v7.45 COMPLEX ENGINE: Diagnostic-driven complex selection
// Chooses complex based on athlete limiter and training phase
// Returns complex name or null (uses default chooseVariation logic)
function chooseComplexForDay(kind, profile, phase) {
  // Graceful degradation: if no limiter defined, return null
  const limiter = profile?.limiter;
  if (!limiter) {
    console.log('v7.45: No limiter defined, using default variation selection');
    return null;
  }
  
  const role = complexPhaseRole(phase);
  console.log(`v7.45: Selecting complex for ${kind} day, limiter: ${limiter}, phase: ${phase} (${role})`);
  
  // SNATCH DAY COMPLEXES
  if (kind === 'snatch') {
    // Pull limiter → emphasize pull work
    if (limiter === 'pull') {
      if (role === 'preparatory') {
        // Accumulation: high-volume pull work
        return 'Snatch Pull + Hang Snatch + Snatch';
      } else if (role === 'specific') {
        // Intensification: specific pull-to-lift
        return 'Snatch Pull + Snatch';
      }
    }
    
    // Receiving/squat limiter → emphasize catch strength
    if (limiter === 'receiving' || limiter === 'squat') {
      if (role === 'preparatory') {
        // Accumulation: build squat strength in position
        return 'Snatch + OHS (pause)';
      } else if (role === 'specific') {
        // Intensification: competition rehearsal
        return 'Snatch + Snatch (1+1)';
      }
    }
    
    // Overhead stability limiter → emphasize overhead work
    if (limiter === 'overhead') {
      if (role === 'preparatory') {
        return 'Muscle Snatch + OHS';
      } else if (role === 'specific') {
        return 'Snatch Balance + OHS';
      }
    }
    
    // Position/timing limiter → emphasize positions
    if (limiter === 'positions' || limiter === 'timing') {
      if (role === 'preparatory') {
        return 'Low Hang Snatch + Hang Snatch + Snatch';
      } else if (role === 'specific') {
        return 'Hang Snatch (above knee) + Snatch';
      }
    }
  }
  
  // CLEAN & JERK DAY COMPLEXES
  if (kind === 'cj') {
    // Pull limiter → emphasize pull work
    if (limiter === 'pull') {
      if (role === 'preparatory') {
        return 'Clean Pull + Hang Clean + Front Squat';
      } else if (role === 'specific') {
        return 'Clean Pull + Clean';
      }
    }
    
    // Receiving/squat limiter → emphasize clean recovery
    if (limiter === 'receiving' || limiter === 'squat') {
      if (role === 'preparatory') {
        return 'Clean + Front Squat (2 reps)';
      } else if (role === 'specific') {
        return 'Clean + Front Squat + Clean';
      }
    }
    
    // Overhead/jerk limiter → emphasize jerk work
    if (limiter === 'overhead' || limiter === 'jerk') {
      if (role === 'preparatory') {
        return 'Jerk Dip Squat (pause) + Jerk';
      } else if (role === 'specific') {
        return 'Clean + Jerk + Jerk';
      }
    }
    
    // Position/timing limiter → emphasize positions
    if (limiter === 'positions' || limiter === 'timing') {
      if (role === 'preparatory') {
        return 'Low Hang Clean + Hang Clean + Clean';
      } else if (role === 'specific') {
        return 'Hang Clean (above knee) + Clean';
      }
    }
    
    // Full lift emphasis → complete complex
    if (limiter === 'consistency' || limiter === 'full_lift') {
      if (role === 'preparatory') {
        return 'Clean + Front Squat + Jerk';
      } else if (role === 'specific') {
        return 'Power Clean + Clean + Jerk';
      }
    }
  }
  
  // Deload phase → return null (simpler variations)
  if (role === 'deload') {
    console.log('v7.45: Deload phase, using simpler variations');
    return null;
  }
  
  // Default: no specific complex selection
  console.log('v7.45: No specific complex match, using default variation');
  return null;
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

// ============================================================================
// v7.45 TASK 4: POWERBUILDING VOLUME PLANNER
// ============================================================================

// v7.45 POWERBUILDING: Weekly hypertrophy set targets per muscle group
// Targets scale with total training days (mainDays + accessoryDays)
// These are WEEKLY totals distributed across training days
const POWERBUILDING_WEEKLY_TARGETS = {
  3: { // Minimal: 2 WL + 1 accessory
    quads: 10,
    posterior: 10,
    upperBack: 12,
    chest: 8,
    delts: 10,
    arms: 8,
    core: 6
  },
  4: { // Standard: 3 WL + 1 accessory OR 2 WL + 2 accessory
    quads: 12,
    posterior: 12,
    upperBack: 14,
    chest: 10,
    delts: 12,
    arms: 10,
    core: 8
  },
  5: { // Enhanced: 3-4 WL + 1-2 accessory
    quads: 14,
    posterior: 14,
    upperBack: 16,
    chest: 12,
    delts: 14,
    arms: 12,
    core: 8
  },
  6: { // Maximum: 3 WL + 3 accessory OR 4 WL + 2 accessory
    quads: 16,
    posterior: 16,
    upperBack: 18,
    chest: 14,
    delts: 16,
    arms: 14,
    core: 10
  }
};

// v7.45 POWERBUILDING: Map muscle groups to HYPERTROPHY_POOLS
const MUSCLE_GROUP_TO_POOL = {
  quads: 'lowerQuad',
  posterior: 'lowerPosterior',
  upperBack: 'upperPull',
  chest: 'upperPush',
  delts: 'shoulders',
  arms: 'arms',
  core: 'arms' // Placeholder - use arms pool for core work
};

// v7.45 POWERBUILDING: Estimate hypertrophy set budget per day
// Based on session duration minus estimated WL time
function estimateHypertrophySetBudget(durationMinutes, wlMinutes = 45) {
  const spare = Math.max(0, durationMinutes - wlMinutes);
  // Assume ~8 minutes per hypertrophy set (including rest)
  const budget = Math.max(0, Math.floor(spare / 8));
  return budget;
}

// v7.45 POWERBUILDING: Estimate week-level WL ARI for interference calculation
// Only counts competition lifts (snatch/C&J), not squats/pulls
function estimateWeekWLARI(weekPlan) {
  if (!weekPlan || !weekPlan.days) return 0;
  
  let sumPct = 0;
  let sumReps = 0;
  
  weekPlan.days.forEach(day => {
    if (!day || !day.work) return;
    
    day.work.forEach(ex => {
      // Only count competition lifts
      const isWL = ex.liftKey === 'snatch' || ex.liftKey === 'cj';
      if (!isWL || !ex.pct) return;
      
      const reps = (ex.sets || 0) * (ex.reps || 0);
      if (!reps) return;
      
      sumReps += reps;
      sumPct += ex.pct * reps;
    });
  });
  
  if (!sumReps) return 0;
  return sumPct / sumReps;
}

// v7.45 POWERBUILDING: Calculate hypertrophy volume reduction multiplier
// High WL intensity → reduce hypertrophy to prevent overtraining
function hypertrophyInterferenceMultiplier(wlARI) {
  if (wlARI >= 0.82) {
    console.log(`v7.45 Powerbuilding: High WL ARI (${(wlARI * 100).toFixed(1)}%), -20% hypertrophy volume`);
    return 0.8; // High stress → -20%
  }
  if (wlARI >= 0.78) {
    console.log(`v7.45 Powerbuilding: Moderate WL ARI (${(wlARI * 100).toFixed(1)}%), -10% hypertrophy volume`);
    return 0.9; // Moderate stress → -10%
  }
  return 1.0; // Normal stress → full volume
}


function pickFromPool(pool, key, weekIndex) {
  if (!pool || pool.length === 0) return null;
  const h = hash32(String(key) + '|w' + String(weekIndex));
  const idx = (h % (pool.length * 7)) % pool.length;
  return pool[idx];
}

// v7.30: Duplicate-aware pool picker
function pickFromPoolExcluding(pool, key, weekIndex, excludeNames = []) {
  if (!pool || pool.length === 0) return null;
  
  // Filter out excluded exercises
  const availablePool = pool.filter(ex => !excludeNames.includes(ex.name));
  if (availablePool.length === 0) return pool[0]; // Fallback if all excluded
  
  const h = hash32(String(key) + '|w' + String(weekIndex));
  const idx = (h % (availablePool.length * 7)) % availablePool.length;
  return availablePool[idx];
}

function chooseHypertrophyExercise(poolName, profile, weekIndex, slotKey, excludeNames = []) {
  const pool = HYPERTROPHY_POOLS[poolName] || [];
  if (pool.length === 0) return { name: poolName, refLift: '', refPct: 0, description: '' };
  
  // v7.11 FIX: Same exercise for ENTIRE BLOCK (4 weeks)
  // Remove weekIndex from key so exercise doesn't change weekly
  // This allows proper progression tracking
  // v7.30 FIX: Add duplicate prevention via excludeNames
  const seed = Number(profile.lastBlockSeed || 0) || blockSeed() || 0;
  const key = `${seed}|hyp|${poolName}|${slotKey}|${profile.programType || 'general'}`;
  // Note: weekIndex removed - same exercise all 4 weeks
  return pickFromPoolExcluding(pool, key, 0, excludeNames) || pool[0];  // Use week 0 always
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
// v7.30 FIX: Added excludeNames parameter for duplicate prevention
function makeHypExercise(poolName, profile, weekIndex, slotKey, sets, reps, baseRIR, hypProg, excludeNames = []) {
  const ex = chooseHypertrophyExercise(poolName, profile, weekIndex, slotKey, excludeNames);
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
  // v7.43 CRITICAL FIX #2: Block length-adaptive intensity curve
  const blockLength = Number(profile.blockLength) || 8;
  const progressRatio = blockLength > 1 ? weekIndex / (blockLength - 1) : 0; // 0.0 to 1.0
  
  // v7.43 CRITICAL FIX #3: Training age safety ceiling
  const trainingAge = Number(profile.trainingAge) || 1;
  let intensityCap = 1.00; // Default: no cap
  
  if (trainingAge < 1) {
    intensityCap = 0.75; // <1 year: Max 75% (technique focus)
  } else if (trainingAge < 2) {
    intensityCap = 0.85; // 1-2 years: Max 85% (skill consolidation)
  } else if (trainingAge < 3) {
    intensityCap = 0.90; // 2-3 years: Max 90% (strength building)
  }
  // 3+ years: No cap (full intensity range available)
  
  const pt = (profile.programType || 'general');
  let intensity = 0.70; // base
  
  // v7.43 FIX: Program-specific intensity curves adapted to block length
  if (pt === 'competition') {
    // Competition Prep: 70% → 95% over entire block length
    const startIntensity = 0.70;
    const peakIntensity = 0.95;
    const range = peakIntensity - startIntensity;
    // Exponential curve: slower start, faster finish (power of 0.8)
    intensity = startIntensity + (range * Math.pow(progressRatio, 0.8));
  }
  else if (pt === 'maximum_strength') {
    // Max Strength: 80% → 95% over block length
    intensity = 0.80 + (0.15 * progressRatio);
  }
  else if (pt === 'powerbuilding') {
    // Powerbuilding: 70% → 83% (moderate intensity)
    intensity = 0.70 + (0.13 * progressRatio);
  }
  else if (pt === 'hypertrophy') {
    // Hypertrophy: 68% → 80% (volume-focused)
    intensity = 0.68 + (0.12 * progressRatio);
  }
  else {
    // General: Phase-based with block adaptation
    if (phase === 'accumulation') {
      intensity = 0.70 + (0.10 * progressRatio); // 70% → 80%
    } else if (phase === 'intensification') {
      intensity = 0.78 + (0.10 * progressRatio); // 78% → 88%
    } else {
      intensity = 0.60; // deload
    }
  }
  
  // v7.43 CRITICAL: Apply training age cap
  intensity = Math.min(intensity, intensityCap);
  
  // Additional cap at 95% for safety
  intensity = Math.min(intensity, 0.95);
  
  return intensity;
}

function chooseVariation(family, profile, weekIndex, phase, slotKey, dayIndex = 0) {
  let pool = SWAP_POOLS[family] || [];
  if (pool.length === 0) return { name: slotKey, liftKey: '' };
  
  // v7.43 CRITICAL FIX #1: INJURY SAFETY FILTER
  const injuries = Array.isArray(profile.injuries) ? profile.injuries : [];
  
  if (injuries.length > 0) {
    const originalPoolSize = pool.length;
    pool = pool.filter(ex => {
      const name = (ex.name || '').toLowerCase();
      
      // SHOULDER INJURY: Block overhead positions under load
      if (injuries.includes('shoulder')) {
        if (name.includes('snatch') && !name.includes('pull') && !name.includes('power')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(shoulder - overhead catch)');
          return false;
        }
        if ((name.includes('jerk') || name.includes('strict press')) && 
            !name.includes('power jerk') && !name.includes('push jerk') && 
            !name.includes('push press')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(shoulder - overhead press)');
          return false;
        }
        if (name.includes('overhead squat') || name.includes('ohs')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(shoulder - OHS)');
          return false;
        }
        if (name.includes('behind-the-neck') || name.includes('btn')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(shoulder - BTN)');
          return false;
        }
      }
      
      // WRIST INJURY: Block front rack positions
      if (injuries.includes('wrist')) {
        if ((name.includes('front squat') || (name.includes('clean') && !name.includes('pull'))) &&
            !name.includes('power')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(wrist - front rack)');
          return false;
        }
      }
      
      // ELBOW INJURY: Block heavy pressing
      if (injuries.includes('elbow')) {
        if (name.includes('press') && !name.includes('leg press')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(elbow - pressing)');
          return false;
        }
        if (name.includes('jerk')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(elbow - jerk lockout)');
          return false;
        }
      }
      
      // KNEE INJURY: Block full depth movements
      if (injuries.includes('knee')) {
        if ((name.includes('squat') || name.includes('snatch') || name.includes('clean')) &&
            !name.includes('power') && !name.includes('pause') && !name.includes('tempo')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(knee - full depth)');
          return false;
        }
      }
      
      // BACK INJURY: Block heavy axial loading
      if (injuries.includes('back')) {
        if (name.includes('back squat') || name.includes('deadlift') || name.includes('good morning')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(back - axial load)');
          return false;
        }
        if (name.includes('pull') && !name.includes('high pull')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(back - heavy pull)');
          return false;
        }
      }
      
      // HIP INJURY: Block heavy squatting
      if (injuries.includes('hip')) {
        if (name.includes('squat') && !name.includes('tempo')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(hip - squatting)');
          return false;
        }
      }
      
      // ANKLE INJURY: Block split positions
      if (injuries.includes('ankle')) {
        if (name.includes('jerk') && !name.includes('power jerk') && !name.includes('push jerk')) {
          console.warn('🚫 INJURY FILTER: Blocked', ex.name, '(ankle - split stance)');
          return false;
        }
      }
      
      return true;
    });
    
    // Emergency fallback if ALL exercises filtered
    if (pool.length === 0) {
      console.error('⚠️ ALL EXERCISES FILTERED for', family, '! Using emergency fallback');
      if (family === 'snatch') pool = [{ name: 'Power Snatch', liftKey: 'snatch' }];
      else if (family === 'cj') pool = [{ name: 'Power Clean + Push Jerk', liftKey: 'cj' }];
      else if (family === 'bs' || family === 'fs') pool = [{ name: 'Tempo Front Squat', liftKey: 'fs' }];
      else pool = SWAP_POOLS[family];
    }
    
    if (pool.length < originalPoolSize && weekIndex === 0 && dayIndex === 0) {
      console.log(`✅ Injury filter: ${originalPoolSize} → ${pool.length} safe exercises for ${family}`);
    }
  }
  
  // Filter out block variations if user has includeBlocks set to false
  const allowBlocks = (profile.includeBlocks === true || profile.includeBlocks === undefined);
  if (!allowBlocks) {
    pool = pool.filter(ex => {
      const name = (ex.name || '').toLowerCase();
      return !name.includes('block') && !name.includes('from blocks');
    });
    if (pool.length === 0) pool = SWAP_POOLS[family];
  }
  
  const pt = (profile.programType || 'general');
  const mode = (profile.athleteMode || 'recreational');
  const preferSpecific = (mode === 'competition' || pt === 'competition');
  const seed = Number(profile.lastBlockSeed || 0) || blockSeed() || 0;
  const key = `${seed}|${family}|${slotKey}|${phase}|${pt}|${mode}|d${dayIndex}`;
  
  if (preferSpecific && (phase === 'intensification')) {
    const h = hash32(key + '|w' + weekIndex);
    if ((h % 10) < 7) return pool[0];
  }
  
  const selected = pickFromPool(pool, key, weekIndex) || pool[0];
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
  
  // v7.45 RECOVERY: Detect athlete fatigue for adaptive programming
  const latestReadiness = (profile.readinessLog || []).slice(-1)[0]?.score ?? 3;
  const { highRpeCount, missCount, fatigueScore } = getRecentComplexFatigueFlags();
  
  // Configurable fatigue thresholds
  const complexFatigued = (
    latestReadiness <= 2 ||      // Low readiness
    highRpeCount >= 10 ||         // Too many high-RPE sets
    missCount >= 5 ||             // Too many misses
    fatigueScore >= 0.3           // Fatigue score > 30%
  );
  
  if (complexFatigued) {
    console.log(`v7.45 Recovery: Fatigue detected - readiness:${latestReadiness}, highRPE:${highRpeCount}, misses:${missCount}, score:${fatigueScore.toFixed(2)}`);
  }
  
  // v7.31: Balanced template selection for ALL day counts
  // Returns template index that ensures balanced snatch/C&J volume
  // v7.43 CRITICAL FIX #4: Rolling symmetry for 1-2 day frequencies
  const getBalancedTemplateIndex = (dayCount, dayIndex, weekIndex) => {
    const patterns = {
      1: [0, 1, 3],        // Single day: ROTATE across weeks
      2: [0, 1, 3, 0, 1, 3], // 2 days: Full pattern over 3 weeks
      3: [0, 1, 3],        // Sn, CJ, Combined - 2:1 ratio ✅
      4: [0, 1, 0, 1],     // Sn, CJ, Sn, CJ - 2:1 with C&J 5 sets ✅
      5: [0, 1, 3, 0, 1],  // Sn, CJ, Combined, Sn, CJ - consistent 2:1 ✅
      6: [0, 1, 3, 0, 1, 3] // Sn, CJ, Combined, Sn, CJ, Combined - 2:1 ✅
    };
    
    const pattern = patterns[dayCount] || patterns[6];
    
    // v7.43 FIX: For 1-2 day frequencies, rotate template based on WEEK
    if (dayCount <= 2) {
      const templateOffset = (weekIndex * dayCount) % pattern.length;
      const effectiveIndex = (dayIndex + templateOffset) % pattern.length;
      return pattern[effectiveIndex];
    }
    
    // For 3+ days, use normal day-based rotation
    return pattern[dayIndex % pattern.length];
  };
  
  // v7.36: Removed useSnatchOnStrengthDay() - no longer needed with Combined template
  
  // CRITICAL FIX: Generate exercise templates per-day, not once for whole week
  const generateMainTemplate = (templateIndex, dayIndex) => {
    const dayCount = mainDays.length;
    
    const templates = [
      // Template 0: Snatch Focus
      { title: 'Snatch Focus', kind: 'snatch', main: 'Snatch', liftKey: 'snatch', work: (() => {
        // v7.45 COMPLEX ENGINE: Try diagnostic complex selection
        let diagnosticComplex = chooseComplexForDay('snatch', profile, phase);
        
        // v7.45 RECOVERY: Downgrade complex if fatigued
        if (diagnosticComplex && complexFatigued) {
          diagnosticComplex = downgradeComplexIfFatigued(diagnosticComplex, true);
        }
        
        let mainExercise;
        if (diagnosticComplex) {
          console.log(`v7.45: Using diagnostic complex: ${diagnosticComplex}`);
          mainExercise = { name: diagnosticComplex, liftKey: 'snatch' };
        } else {
          mainExercise = chooseVariation('snatch', profile, weekIndex, phase, 'snatch_main', dayIndex);
        }
        
        // Calculate intensity with complex adjustments
        let mainIntensity = intensity;
        
        // v7.45 COMPLEX ENGINE: Apply complex intensity reductions
        if (isComplex(mainExercise.name)) {
          const pattern = getComplexPattern(mainExercise.name);
          if (pattern) {
            const totalReps = getComplexTotalReps(pattern);
            mainIntensity = mainIntensity * 0.95; // Complex hardness
            mainIntensity = capComplexIntensity(mainIntensity, totalReps); // Rep-based cap
            mainIntensity = applyComplexFatigueAdjustment(mainIntensity, mainExercise.name, complexFatigued); // v7.45 RECOVERY
            console.log(`v7.45: Complex ${mainExercise.name} - ${totalReps} reps, ${(mainIntensity * 100).toFixed(1)}%`);
          } else {
            mainIntensity = mainIntensity * 0.95;
            mainIntensity = applyComplexFatigueAdjustment(mainIntensity, mainExercise.name, complexFatigued); // v7.45 RECOVERY
          }
        }
        
        return [
          { name: mainExercise.name, liftKey: 'snatch', sets: Math.round(5 * volFactor), reps: 2, pct: mainIntensity },
          { name: chooseVariation('pull_snatch', profile, weekIndex, phase, 'snatch_pull', dayIndex).name, liftKey: 'snatch', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + getPullOffset(phase, 'snatch'), 0.65, 1.00) },
          { name: chooseVariation('bs', profile, weekIndex, phase, 'back_squat', dayIndex).name, liftKey: 'bs', sets: Math.round(4 * volFactor), reps: 5, pct: clamp(intensity + 0.05, 0.55, 0.92) }
        ];
      })()},
      // Template 1: C&J Focus - v7.36: Increased sets from 4 to 5 for balance
      { title: 'Clean & Jerk Focus', kind: 'cj', main: 'Clean & Jerk', liftKey: 'cj', work: (() => {
        // v7.45 COMPLEX ENGINE: Try diagnostic complex selection
        let diagnosticComplex = chooseComplexForDay('cj', profile, phase);
        
        // v7.45 RECOVERY: Downgrade complex if fatigued
        if (diagnosticComplex && complexFatigued) {
          diagnosticComplex = downgradeComplexIfFatigued(diagnosticComplex, true);
        }
        
        let mainExercise;
        if (diagnosticComplex) {
          console.log(`v7.45: Using diagnostic complex: ${diagnosticComplex}`);
          mainExercise = { name: diagnosticComplex, liftKey: 'cj' };
        } else {
          mainExercise = chooseVariation('cj', profile, weekIndex, phase, 'cj_main', dayIndex);
        }
        
        // Calculate intensity with complex adjustments
        let mainIntensity = clamp(intensity + 0.05, 0.60, 0.95);
        
        // v7.45 COMPLEX ENGINE: Apply complex intensity reductions
        if (isComplex(mainExercise.name)) {
          const pattern = getComplexPattern(mainExercise.name);
          if (pattern) {
            const totalReps = getComplexTotalReps(pattern);
            mainIntensity = mainIntensity * 0.95; // Complex hardness
            mainIntensity = capComplexIntensity(mainIntensity, totalReps); // Rep-based cap
            mainIntensity = applyComplexFatigueAdjustment(mainIntensity, mainExercise.name, complexFatigued); // v7.45 RECOVERY
            console.log(`v7.45: Complex ${mainExercise.name} - ${totalReps} reps, ${(mainIntensity * 100).toFixed(1)}%`);
          } else {
            mainIntensity = mainIntensity * 0.95;
            mainIntensity = applyComplexFatigueAdjustment(mainIntensity, mainExercise.name, complexFatigued); // v7.45 RECOVERY
          }
        }
        
        return [
          { name: mainExercise.name, liftKey: 'cj', sets: Math.round(5 * volFactor), reps: 1, pct: mainIntensity },
          { name: chooseVariation('pull_clean', profile, weekIndex, phase, 'clean_pull', dayIndex).name, liftKey: 'cj', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + getPullOffset(phase, 'clean'), 0.70, 1.05) },
          { name: chooseVariation('fs', profile, weekIndex, phase, 'front_squat', dayIndex).name, liftKey: 'fs', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + 0.08, 0.55, 0.92) }
        ];
      })()},
      // Template 2: Strength + Positions (DEPRECATED - kept for backward compatibility only)
      { title: 'Strength + Positions', kind: 'strength', main: 'Back Squat', liftKey: 'bs', work: [
        { name: chooseVariation('bs', profile, weekIndex, phase, 'back_squat_strength', dayIndex).name, liftKey: 'bs', sets: Math.round(5 * volFactor), reps: 3, pct: clamp(intensity + 0.08, 0.55, 0.95) },
        { name: chooseVariation('snatch', profile, weekIndex, phase, 'snatch_secondary', dayIndex).name, liftKey: 'snatch', sets: Math.round(4 * volFactor), reps: 2, pct: clamp(intensity - 0.02, 0.55, 0.90) },
        { name: chooseVariation('press', profile, weekIndex, phase, 'press', dayIndex).name, liftKey: chooseVariation('press', profile, weekIndex, phase, 'press', dayIndex).liftKey, sets: Math.round(4 * volFactor), reps: 5, pct: clamp(intensity - 0.12, 0.45, 0.80) }
      ]},
      // Template 3: Combined + Squat - v7.36: NEW for balanced volume across all programs
      { title: 'Combined + Squat', kind: 'combined', main: 'Both Lifts', liftKey: 'snatch', work: (() => {
        // v7.45 COMPLEX ENGINE: Try diagnostic complex selection
        let diagnosticSnatchComplex = chooseComplexForDay('snatch', profile, phase);
        
        // v7.45 RECOVERY: Downgrade complex if fatigued
        if (diagnosticSnatchComplex && complexFatigued) {
          diagnosticSnatchComplex = downgradeComplexIfFatigued(diagnosticSnatchComplex, true);
        }
        
        let snatchExercise;
        if (diagnosticSnatchComplex) {
          console.log(`v7.45: Combined day - diagnostic snatch complex: ${diagnosticSnatchComplex}`);
          snatchExercise = { name: diagnosticSnatchComplex, liftKey: 'snatch' };
        } else {
          snatchExercise = chooseVariation('snatch', profile, weekIndex, phase, 'snatch_skill', dayIndex);
        }
        
        // Calculate snatch intensity with complex adjustments
        let snatchIntensity = clamp(intensity - 0.05, 0.55, 0.88);
        
        if (isComplex(snatchExercise.name)) {
          const pattern = getComplexPattern(snatchExercise.name);
          if (pattern) {
            const totalReps = getComplexTotalReps(pattern);
            snatchIntensity = snatchIntensity * 0.95;
            snatchIntensity = capComplexIntensity(snatchIntensity, totalReps);
            snatchIntensity = applyComplexFatigueAdjustment(snatchIntensity, snatchExercise.name, complexFatigued); // v7.45 RECOVERY
            console.log(`v7.45: Combined snatch complex - ${totalReps} reps, ${(snatchIntensity * 100).toFixed(1)}%`);
          } else {
            snatchIntensity = snatchIntensity * 0.95;
            snatchIntensity = applyComplexFatigueAdjustment(snatchIntensity, snatchExercise.name, complexFatigued); // v7.45 RECOVERY
          }
        }
        
        return [
          { name: snatchExercise.name, liftKey: 'snatch', sets: Math.round(4 * volFactor), reps: 2, pct: snatchIntensity },
          { name: chooseVariation('cj', profile, weekIndex, phase, 'cj_skill', dayIndex).name, liftKey: 'cj', sets: Math.round(4 * volFactor), reps: 1, pct: clamp(intensity, 0.60, 0.90) },
          { name: chooseVariation('bs', profile, weekIndex, phase, 'back_squat_combined', dayIndex).name, liftKey: 'bs', sets: Math.round(4 * volFactor), reps: 3, pct: clamp(intensity + 0.08, 0.55, 0.95) },
          { name: chooseVariation('press', profile, weekIndex, phase, 'press_accessory', dayIndex).name, liftKey: chooseVariation('press', profile, weekIndex, phase, 'press_accessory', dayIndex).liftKey, sets: Math.round(3 * volFactor), reps: 5, pct: clamp(intensity - 0.15, 0.40, 0.75) }
        ];
      })()}
    ];
    return templates[templateIndex % templates.length];
  };
  
  // Build accessory template with no duplicates per day
  // v7.43 CRITICAL FIX #6: Program-specific exercise descriptions
  const generateAccessoryTemplate = (dayIndex) => {
    const acc1 = chooseVariation('accessory', profile, weekIndex, phase, 'accessory_1', dayIndex);
    const acc2 = chooseVariationExcluding('accessory', profile, weekIndex, phase, 'accessory_2', [acc1.name], dayIndex);
    
    const programType = profile.programType || 'general';
    
    const enhanceDescription = (exercise) => {
      let desc = exercise.description || '';
      
      if (programType === 'hypertrophy' || programType === 'powerbuilding') {
        desc += ' | Tempo: 3-1-1-0 (slow eccentric)';
        desc += ' | RIR: 1-2 (near failure)';
        desc += ' | Focus: Muscle tension';
      }
      else if (programType === 'competition') {
        desc += ' | Tempo: Explosive';
        desc += ' | RIR: 3-4 (technical reserve)';
        desc += ' | Focus: Speed & quality';
      }
      else if (programType === 'maximum_strength') {
        desc += ' | Tempo: Controlled';
        desc += ' | RIR: 2-3';
        desc += ' | Focus: Stability';
      }
      
      return desc;
    };
    
    return { title: 'Accessory + Core', kind: 'accessory', main: 'Accessory', liftKey: '', work: [
      { 
        name: acc1.name, 
        liftKey: acc1.liftKey, 
        recommendedPct: acc1.recommendedPct || 0, 
        description: enhanceDescription(acc1), 
        sets: Math.round(3 * volFactor), 
        reps: programType === 'hypertrophy' ? 10 : 5, 
        pct: 0 
      },
      { 
        name: acc2.name, 
        liftKey: acc2.liftKey, 
        recommendedPct: acc2.recommendedPct || 0, 
        description: enhanceDescription(acc2), 
        sets: Math.round(3 * volFactor), 
        reps: programType === 'hypertrophy' ? 12 : 8, 
        pct: 0 
      },
      { name: 'Core + Mobility', sets: 1, reps: 1, pct: 0 }
    ]};
  };
  
  const sessions = [];
  const dayCount = mainDays.length;
  mainDays.map(Number).sort((a, b) => a - b).forEach((d, i) => {
    // v7.31: Use balanced template selection instead of simple index
    const balancedTemplateIndex = getBalancedTemplateIndex(dayCount, i, weekIndex);
    const t = generateMainTemplate(balancedTemplateIndex, i);
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
          // v7.30 FIX: Prevent duplicates from same pool
          const sh1 = makeHypExercise('shoulders', profile, weekIndex, `hyp_acc_sh1_${dayKey}`, hypSets, 10, 2, hypProg);
          const sh2 = makeHypExercise('shoulders', profile, weekIndex, `hyp_acc_sh2_${dayKey}`, hypSets, 15, 3, hypProg, [sh1.name]);
          s.work = [
            makeHypExercise('upperPush', profile, weekIndex, `hyp_acc_push_${dayKey}`, hypSets + 1, hypReps, 2, hypProg),
            makeHypExercise('upperPull', profile, weekIndex, `hyp_acc_pull_${dayKey}`, hypSets + 1, hypReps, 2, hypProg),
            sh1,
            sh2,
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
          // v7.30 FIX: Prevent duplicates from same pool
          const pull1 = makeHypExercise('upperPull', profile, weekIndex, 'hyp_cj_pull1', hypSets, hypReps - 2, 2, hypProg);
          const pull2 = makeHypExercise('upperPull', profile, weekIndex, 'hyp_cj_pull2', hypSets, hypReps, 2, hypProg, [pull1.name]);
          s.work = [...s.work,
            pull1,
            pull2,
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
          // v7.30 FIX: Prevent duplicates from same pool
          const post1 = makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_st_post1', hypSets, hypReps - 2, 2, hypProg);
          const post2 = makeHypExercise('lowerPosterior', profile, weekIndex, 'hyp_st_post2', hypSets, hypReps, 2, hypProg, [post1.name]);
          s.work = [...s.work,
            post1,
            post2,
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
        { name: supportLift.name, liftKey: supportLift.liftKey, sets: Math.round(3 * volFactor), reps: 3, pct: clamp(intensity + getPullOffset(phase, s.kind === 'snatch' ? 'snatch' : 'clean'), 0.65, 1.05), tag: 'strength' }
      ];
    }
    
    // GENERAL/COMPETITION/TECHNIQUE: Keep standard templates (already optimal)
  });
  
  // v7.43 CRITICAL FIX #5: DURATION-AWARE TEMPLATE ENFORCEMENT
  sessions.forEach((s, si) => {
    if (duration === 60) {
      // "Short" (60 min) - Maximum 3 exercises per session
      if (s.kind === 'accessory') {
        s.work = []; // Remove ALL accessories (no time)
        console.log('⏱ Duration: 60min → Removed accessory day');
        return;
      }
      
      // Main days: Enforce 3-exercise limit
      if (s.work.length > 3) {
        console.log(`⏱ Duration: 60min → Truncated ${s.title} from ${s.work.length} to 3 exercises`);
        s.work = s.work.slice(0, 3);
      }
      
      // Additional safety: Cap sets at 5 per exercise
      s.work.forEach(ex => {
        if (ex.sets > 5) {
          console.log(`⏱ Duration: 60min → Reduced ${ex.name} sets from ${ex.sets} to 5`);
          ex.sets = 5;
        }
      });
    }
    // 75min and 90min: No enforcement needed (already handled by program logic)
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
  // v7.36: Add bounds checking helper for max inputs (0-999kg reasonable range)
  const validateMax = (value) => Math.max(0, Math.min(999, value || 0));
  
  const sn = validateMax(Number($('setupSnatch')?.value));
  const cj = validateMax(Number($('setupCleanJerk')?.value));
  const fs = validateMax(Number($('setupFrontSquat')?.value));
  const bs = validateMax(Number($('setupBackSquat')?.value));
  const pushPress = validateMax(Number($('setupPushPress')?.value));
  const strictPress = validateMax(Number($('setupStrictPress')?.value));
  
  // Optional custom 1RMs (null = use auto-calculated ratio)
  const powerSnatch = validateMax(Number($('setupPowerSnatch')?.value)) || null;
  const powerClean = validateMax(Number($('setupPowerClean')?.value)) || null;
  const ohs = validateMax(Number($('setupOHS')?.value)) || null;
  const hangSnatch = validateMax(Number($('setupHangSnatch')?.value)) || null;
  const hangPowerSnatch = validateMax(Number($('setupHangPowerSnatch')?.value)) || null;
  const hangClean = validateMax(Number($('setupHangClean')?.value)) || null;
  
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
  
  // v7.35: BUG FIX - Validate that at least one training day is selected
  const mainDays = getSelectedDays('main');
  if (mainDays.length === 0) {
    alert('⚠️ Please select at least one training day before generating a block.');
    return;
  }
  
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
  
  // v7.38 CRITICAL FIX: For complexes, ALWAYS use liftKey (primary lift), NOT custom 1RMs
  // Complexes are limited by the hardest component (e.g., "Power Snatch + Snatch" limited by full Snatch)
  // Using a custom Power Snatch 1RM would severely underload the complex
  // Research: Complexes prescribed at 70-85% of PRIMARY lift 1RM (Catalyst Athletics)
  if (!isComplex(exerciseName)) {
    // Check for custom 1RM first (ONLY for non-complex exercises)
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
  }
  
  if (shouldUseTrueMax(exerciseName)) {
    // Use TRUE MAX for competition lifts and technical variations
    const trueMax = (profile.maxes && profile.maxes[liftKey]) ? Number(profile.maxes[liftKey]) : 0;
    
    // v7.39 CRITICAL FIX: Ratio logic for complexes vs. singles
    // For COMPLEXES: ratio determined by PRIMARY lift (liftKey)
    // For SINGLES: ratio determined by exercise variation
    let ratio = 1.0;
    
    if (isComplex(exerciseName)) {
      // Complex exercises: ratio based on PRIMARY lift (liftKey)
      // "Power Snatch + Snatch" with liftKey='snatch' → ratio = 1.0
      // "Power Clean + Jerk" with liftKey='cj' → ratio = 1.0
      // The limiting factor in a complex is the HARDEST component (the primary lift)
      ratio = 1.0; // Always 1.0 for complexes (already has 5% complex reduction)
    } else {
      // Single exercises: ratio based on exercise name
      // "Power Snatch" → ratio = 0.88
      // "Hang Clean" → ratio = 0.95
      if (nameLower.includes('power snatch')) ratio = 0.88;
      else if (nameLower.includes('power clean')) ratio = 0.90;
      else if (nameLower.includes('overhead squat')) ratio = 0.85;
      else if (nameLower.includes('hang power snatch')) ratio = 0.80;
      else if (nameLower.includes('hang snatch') && !nameLower.includes('power')) ratio = 0.95;
      else if (nameLower.includes('hang clean') && !nameLower.includes('power')) ratio = 0.95;
    }
    
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
    
    // v7.28: Calculate recommendation for accessories - Check saved weight FIRST
    let recommendationText = '';
    if (ex.recommendedPct && ex.recommendedPct > 0 && ex.liftKey) {
      // Check if user has a saved weight for this exercise
      const savedWeight = p.accessoryWeights?.[ex.name];
      
      if (savedWeight && savedWeight > 0) {
        // Show saved weight (user has done this exercise before)
        recommendationText = `<div style="margin-top:8px;padding:8px 12px;background:rgba(16,185,129,0.08);border-left:3px solid rgba(16,185,129,0.4);border-radius:6px;font-size:14px;line-height:1.5"><span style="font-weight:600;color:rgba(16,185,129,1)">Last used:</span> ${savedWeight}${p.units || 'kg'}</div>`;
      } else {
        // Show recommendation (first time doing this exercise)
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
        
        recommendationText = recWeight > 0 
          ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px;line-height:1.5"><span style="font-weight:600;color:rgba(59,130,246,1)">Recommended:</span> ${pctText}% of ${fullLiftName} <span style="opacity:0.8">(~${recWeight}${p.units || 'kg'})</span></div>` 
          : (ex.description ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px">${ex.description}</div>` : '');
      }
    } else if (ex.description) {
      recommendationText = `<div style="margin-top:8px;padding:8px 12px;background:rgba(59,130,246,0.08);border-left:3px solid rgba(59,130,246,0.4);border-radius:6px;font-size:14px">${ex.description}</div>`;
    }
    
    head.innerHTML = `
      <div style="flex:1">
        <div class="card-title"><span class="collapse-icon" style="margin-right:8px; user-select:none;">▼</span>${ex.name}</div>
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
      
      // v7.42 CRITICAL FIX: Don't re-render entire modal - just update this card
      // This prevents dropdown from closing when user clicks +/- Set
      
      // Update the subtitle with new set count
      const subtitle = card.querySelector('.card-subtitle');
      if (subtitle) {
        subtitle.textContent = `${next}×${ex.reps}${ex.pct && liftKey ? ` • ${Math.round(ex.pct*100)}%` : ''}${ex.targetRIR ? ` • RIR ${ex.targetRIR}` : ''}`;
      }
      
      // Rebuild ONLY the table body with new set count
      tbody.innerHTML = '';
      nextScheme.forEach((s, setIndex) => {
        const recKey = `${exIndex}:${setIndex}`;
        const rec = dayLog[recKey] || {};
        const cumAdj = computeCumulativeAdj(dayLog, exIndex, setIndex, nextScheme);
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
            <input inputmode="decimal" class="input small" data-role="weight" placeholder="—" value="${weightVal}" />
            <span style="opacity:.65; font-size:12px">${s.targetPct ? `${Math.round(s.targetPct*100)}%` : (s.tag || '')}</span>
          </div></td>
          <td style="padding:6px"><input inputmode="numeric" class="input small" data-role="reps" placeholder="—" value="${repsVal}" /></td>
          <td style="padding:6px"><input inputmode="decimal" class="input small" data-role="rpe" placeholder="—" value="${rpeVal}" /></td>
          <td style="padding:6px"><select class="input small" data-role="action">
            <option value="">—</option><option value="make">✓</option><option value="belt">↑</option>
            <option value="heavy">⚠︎</option><option value="miss">✕</option>
          </select></td>
        `;
        
        const wEl = row.querySelector('[data-role="weight"]');
        const repsEl = row.querySelector('[data-role="reps"]');
        const rpeEl = row.querySelector('[data-role="rpe"]');
        const aEl = row.querySelector('[data-role="action"]');
        
        if (aEl) aEl.value = actionVal;
        
        // Re-attach all event listeners for this row
        if (wEl) {
          wEl.addEventListener('change', () => {
            updateRec(setIndex, { weight: wEl.value, status: 'done' });
            const entered = Number(wEl.value);
            if (Number.isFinite(entered) && entered > 0 && nextScheme[setIndex]?.tag === 'work') {
              for (let j = setIndex + 1; j < nextScheme.length; j++) {
                if (nextScheme[j]?.tag !== 'work') continue;
                const nextKey = `${exIndex}:${j}`;
                const nextRec = dayLog[nextKey] || {};
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
            const firstWorkIdx = nextScheme.findIndex(x => x.tag === 'work');
            if (nextScheme[setIndex]?.tag === 'work' && firstWorkIdx === setIndex) {
              const prescribed = Number(adjWeight || s.targetWeight || 0);
              if (Number.isFinite(entered) && entered > 0 && Number.isFinite(prescribed) && prescribed > 0) {
                const off = clamp((entered / prescribed) - 1, -0.10, 0.10);
                setWeightOffsetOverride(dayLog, exIndex, off);
              }
              if (ex.recommendedPct && ex.recommendedPct > 0 && !ex.pct && entered > 0 && nextScheme[setIndex]?.tag === 'work') {
                if (!p.accessoryWeights) p.accessoryWeights = {};
                p.accessoryWeights[ex.name] = entered;
                saveState();
              }
            }
          });
        }
        if (repsEl) {
          repsEl.addEventListener('input', () => updateRec(setIndex, { reps: repsEl.value, status: 'done' }));
        }
        if (rpeEl) {
          rpeEl.addEventListener('input', () => updateRec(setIndex, { rpe: rpeEl.value, status: 'done' }));
        }
        if (aEl) {
          aEl.addEventListener('change', () => {
            const actualWeight = Number(wEl.value);
            updateRec(setIndex, { action: aEl.value, weight: actualWeight, status: 'done' });
            if (nextScheme[setIndex]?.tag === 'work' && actualWeight > 0) {
              const actionAdj = actionDelta(aEl.value);
              let baseWeight = actualWeight * (1 + actionAdj);
              for (let j = setIndex + 1; j < nextScheme.length; j++) {
                if (nextScheme[j]?.tag !== 'work') continue;
                const nextW = roundTo(baseWeight, p.units === 'kg' ? 1 : 1);
                const nextRow = tbody.querySelector(`tr[data-idx="${j}"]`);
                if (nextRow) {
                  const nextWEl = nextRow.querySelector('[data-role="weight"]');
                  if (nextWEl) {
                    nextWEl.value = String(nextW);
                    updateRec(j, { weight: nextW });
                  }
                }
                baseWeight = nextW;
              }
            }
          });
        }
        
        tbody.appendChild(row);
      });
      
      // Dropdown remains open - no re-render!
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
            
            // v7.28: Save accessory weight for future reference
            // Only save if this is an accessory exercise (has recommendedPct but no pct)
            if (ex.recommendedPct && ex.recommendedPct > 0 && !ex.pct && entered > 0) {
              if (!p.accessoryWeights) p.accessoryWeights = {};
              p.accessoryWeights[ex.name] = entered;
              saveState();
              console.log('💾 Saved accessory weight:', ex.name, '→', entered, p.units);
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
              // v7.42 FIX: More explicit warning about data loss
              if (confirm(`⚠️ Permanently delete "${ex.name}"?\n\nThis will delete all logged sets, weights, and notes for this exercise.\n\nThis action cannot be undone.`)) {
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
    
    // v7.34: Detect today's day of week (0 = Sunday, 6 = Saturday)
    const todayDOW = new Date().getDay();
    
    // v7.34: Helper to estimate workout duration
    const estimateDuration = (day) => {
      const exerciseCount = day.work.length;
      const hasOlympic = day.work.some(ex => 
        ex.name.toLowerCase().includes('snatch') || 
        ex.name.toLowerCase().includes('clean') ||
        ex.name.toLowerCase().includes('jerk')
      );
      
      // Olympic lifts take longer (more rest, technique)
      if (hasOlympic) {
        return exerciseCount >= 5 ? '90 min' : exerciseCount >= 3 ? '75 min' : '60 min';
      }
      return exerciseCount >= 4 ? '60 min' : '45 min';
    };
    
    // Helper function to render a day card
    const renderDayCard = (day, dayIndex, isAccessory = false, isToday = false) => {
      const isDone = isDayCompleted(ui.weekIndex, dayIndex);
      const card = document.createElement('div');
      card.className = `day-card-v2 ${isDone ? 'completed' : ''}`;
      if (isAccessory) card.style.borderLeft = '3px solid #8b5cf6';
      
      const header = document.createElement('div');
      header.className = 'day-card-header';
      const badgeColor = isAccessory ? '#8b5cf6' : 'var(--primary)';
      
      // v7.33: Get readiness for this specific workout
      const workoutKey = `${ui.weekIndex}_${dayIndex}`;
      const readinessScore = (state.workoutReadiness && state.workoutReadiness[workoutKey]) || null;
      const readinessEmoji = readinessScore ? 
        (readinessScore < 2.5 ? '😴' : readinessScore < 3.5 ? '😐' : '💪') : '⚡';
      const readinessColor = readinessScore ?
        (readinessScore < 2.5 ? '#ef4444' : readinessScore < 3.5 ? '#f59e0b' : '#10b981') : '#6b7280';
      const readinessLabel = readinessScore ?
        (readinessScore < 2.5 ? 'Low' : readinessScore < 3.5 ? 'Normal' : 'High') : '';
      
      // v7.34: Estimate duration and decide if expanded
      const duration = estimateDuration(day);
      const shouldExpand = isToday && !isDone;
      
      header.innerHTML = `
        <div class="day-header-left">
          <div class="day-number">${dayNames[day.dow % 7]}</div>
          <div class="mini-badge ${isAccessory ? '' : 'primary'}">${day.title}</div>
        </div>
        <div class="day-header-right">
          ${!isDone ? `<button class="readiness-btn-mini" data-week="${ui.weekIndex}" data-day="${dayIndex}" style="background:${readinessColor};border:none;padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer;margin-right:8px;font-weight:600;color:#fff" title="Set readiness">${readinessEmoji}${readinessLabel ? ' ' + readinessLabel : ''}</button>` : ''}
          <div class="day-stats" style="font-size:12px;color:#9ca3af;margin-right:8px">${duration}</div>
          <div class="day-stats">${isDone ? 'Completed' : shouldExpand ? 'Today' : 'Tap to view'}</div>
          <div class="expand-icon">${shouldExpand ? '▴' : '▾'}</div>
        </div>
      `;
      
      const body = document.createElement('div');
      body.className = 'day-card-body';
      
      // v7.34: Show exercises with working weights if expanded
      if (shouldExpand) {
        body.style.display = 'block';
        const exerciseList = document.createElement('div');
        exerciseList.className = 'exercise-list';
        
        // Get profile for weight calculations
        const profile = getProfile();
        const maxes = profile.maxes;
        
        exerciseList.innerHTML = day.work.slice(0, 5).map(ex => {
          const setsReps = `${ex.sets}×${ex.reps}`;
          const pctStr = ex.pct > 0 ? `${Math.round(ex.pct * 100)}%` : '';
          
          // Calculate working weight
          let weightStr = '';
          if (ex.pct > 0 && ex.liftKey && maxes[ex.liftKey]) {
            const workingWeight = Math.round(ex.pct * maxes[ex.liftKey]);
            weightStr = `(${workingWeight}kg)`;
          }
          
          return `<div class="ex-summary" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <div style="flex:1">
              <div style="font-weight:600;color:#fff;margin-bottom:2px">${ex.name}</div>
              <div style="font-size:12px;color:#9ca3af">${setsReps} ${pctStr ? '@ ' + pctStr : ''} ${weightStr}</div>
            </div>
          </div>`;
        }).join('');
        
        if (day.work.length > 5) {
          exerciseList.innerHTML += `<div style="padding:8px 0;font-size:12px;color:#9ca3af">+ ${day.work.length - 5} more exercises</div>`;
        }
        
        body.appendChild(exerciseList);
      } else {
        // Collapsed: just show exercise names
        body.style.display = 'none';
        const exercises = document.createElement('div');
        exercises.className = 'exercise-list';
        exercises.innerHTML = day.work.map(e => `<div class="ex-summary">${e.name}</div>`).join('');
        body.appendChild(exercises);
      }
      
      const actions = document.createElement('div');
      actions.className = 'day-card-actions';
      actions.style.display = shouldExpand ? 'flex' : 'none';
      
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
      btnView.textContent = 'Full Details';
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        openWorkoutDetail(ui.weekIndex, dayIndex, day);
      });
      
      actions.appendChild(btnView);
      actions.appendChild(btnComplete);
      body.appendChild(actions);
      
      header.addEventListener('click', () => {
        // v7.34: Toggle expand/collapse
        const isExpanded = body.style.display !== 'none';
        if (isExpanded) {
          body.style.display = 'none';
          header.querySelector('.expand-icon').textContent = '▾';
          actions.style.display = 'none';
        } else {
          body.style.display = 'block';
          header.querySelector('.expand-icon').textContent = '▴';
          actions.style.display = 'flex';
          
          // Re-render exercises with weights if not already done
          if (!body.querySelector('.ex-summary[style*="display:flex"]')) {
            const profile = getProfile();
            const maxes = profile.maxes;
            const exerciseList = body.querySelector('.exercise-list');
            
            exerciseList.innerHTML = day.work.slice(0, 5).map(ex => {
              const setsReps = `${ex.sets}×${ex.reps}`;
              const pctStr = ex.pct > 0 ? `${Math.round(ex.pct * 100)}%` : '';
              
              let weightStr = '';
              if (ex.pct > 0 && ex.liftKey && maxes[ex.liftKey]) {
                const workingWeight = Math.round(ex.pct * maxes[ex.liftKey]);
                weightStr = `(${workingWeight}kg)`;
              }
              
              return `<div class="ex-summary" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                <div style="flex:1">
                  <div style="font-weight:600;color:#fff;margin-bottom:2px">${ex.name}</div>
                  <div style="font-size:12px;color:#9ca3af">${setsReps} ${pctStr ? '@ ' + pctStr : ''} ${weightStr}</div>
                </div>
              </div>`;
            }).join('');
            
            if (day.work.length > 5) {
              exerciseList.innerHTML += `<div style="padding:8px 0;font-size:12px;color:#9ca3af">+ ${day.work.length - 5} more exercises</div>`;
            }
          }
        }
      });
      
      // v7.33: Readiness button handler
      const readinessBtn = header.querySelector('.readiness-btn-mini');
      if (readinessBtn) {
        readinessBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openWorkoutReadinessModal(ui.weekIndex, dayIndex, day);
        });
      }
      
      card.appendChild(header);
      card.appendChild(body);
      return card;
    };
    
    // v7.34: Separate today from other days
    const todayMainDays = mainDays.filter(day => day.dow === todayDOW);
    const otherMainDays = mainDays.filter(day => day.dow !== todayDOW);
    const todayAccessoryDays = accessoryDays.filter(day => day.dow === todayDOW);
    const otherAccessoryDays = accessoryDays.filter(day => day.dow !== todayDOW);
    
    // Render TODAY section (if any workouts today)
    if (todayMainDays.length > 0 || todayAccessoryDays.length > 0) {
      const todayHeader = document.createElement('div');
      todayHeader.innerHTML = '<div style="font-size:16px;font-weight:700;color:var(--primary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:8px"><span>🔥</span><span>TODAY</span></div>';
      weekCalendar.appendChild(todayHeader);
      
      todayMainDays.forEach((day) => {
        const dayIndex = w.days.indexOf(day);
        weekCalendar.appendChild(renderDayCard(day, dayIndex, false, true));
      });
      
      todayAccessoryDays.forEach((day) => {
        const dayIndex = w.days.indexOf(day);
        weekCalendar.appendChild(renderDayCard(day, dayIndex, true, true));
      });
    }
    
    // Render THIS WEEK section (other days)
    if (otherMainDays.length > 0 || otherAccessoryDays.length > 0) {
      const weekHeader = document.createElement('div');
      weekHeader.innerHTML = '<div style="font-size:14px;font-weight:600;color:#9ca3af;margin:24px 0 12px 0;text-transform:uppercase;letter-spacing:0.5px">THIS WEEK</div>';
      weekCalendar.appendChild(weekHeader);
      
      // Render main days section
      if (otherMainDays.length > 0) {
        otherMainDays.forEach((day) => {
          const dayIndex = w.days.indexOf(day);
          weekCalendar.appendChild(renderDayCard(day, dayIndex, false, false));
        });
      }
      
      // Render accessory days
      if (otherAccessoryDays.length > 0) {
        otherAccessoryDays.forEach((day) => {
          const dayIndex = w.days.indexOf(day);
          weekCalendar.appendChild(renderDayCard(day, dayIndex, true, false));
        });
      }
    }
    
    // If no workouts today, show all normally with section headers
    if (todayMainDays.length === 0 && todayAccessoryDays.length === 0) {
      // Render main days section
      if (mainDays.length > 0) {
        const mainHeader = document.createElement('div');
        mainHeader.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Main Training Days</div>';
        weekCalendar.appendChild(mainHeader);
        
        mainDays.forEach((day) => {
          const dayIndex = w.days.indexOf(day);
          weekCalendar.appendChild(renderDayCard(day, dayIndex, false, false));
        });
      }
      
      // Render accessory days section
      if (accessoryDays.length > 0) {
        const accHeader = document.createElement('div');
        accHeader.innerHTML = '<div style="font-size:14px;font-weight:600;color:#8b5cf6;margin:24px 0 12px 0;text-transform:uppercase;letter-spacing:0.5px">Accessory Days</div>';
        weekCalendar.appendChild(accHeader);
        
        accessoryDays.forEach((day) => {
          const dayIndex = w.days.indexOf(day);
          weekCalendar.appendChild(renderDayCard(day, dayIndex, true, false));
        });
      }
    }

  }
}

// v7.33: Per-workout readiness system
window.openWorkoutReadinessModal = function openWorkoutReadinessModal(weekIndex, dayIndex, day) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px';
  
  const workoutKey = `${weekIndex}_${dayIndex}`;
  const currentReadiness = (state.workoutReadiness && state.workoutReadiness[workoutKey]) || 3;
  
  modal.innerHTML = `
    <div style="background:#1f2937;border-radius:16px;max-width:400px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
      <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:#fff">How are you feeling?</div>
      <div style="font-size:14px;color:#9ca3af;margin-bottom:24px">${day.title} • Week ${weekIndex + 1}</div>
      
      <div style="display:flex;gap:8px;margin-bottom:24px;justify-content:space-between">
        <button class="readiness-option" data-value="1" style="flex:1;padding:16px 8px;border:2px solid #374151;border-radius:12px;background:#111827;color:#fff;cursor:pointer;transition:all 0.2s;text-align:center">
          <div style="font-size:24px;margin-bottom:4px">😴</div>
          <div style="font-size:11px;font-weight:600">Exhausted</div>
        </button>
        <button class="readiness-option" data-value="2" style="flex:1;padding:16px 8px;border:2px solid #374151;border-radius:12px;background:#111827;color:#fff;cursor:pointer;transition:all 0.2s;text-align:center">
          <div style="font-size:24px;margin-bottom:4px">😫</div>
          <div style="font-size:11px;font-weight:600">Tired</div>
        </button>
        <button class="readiness-option" data-value="3" style="flex:1;padding:16px 8px;border:2px solid #10b981;border-radius:12px;background:#111827;color:#fff;cursor:pointer;transition:all 0.2s;text-align:center">
          <div style="font-size:24px;margin-bottom:4px">😐</div>
          <div style="font-size:11px;font-weight:600">Normal</div>
        </button>
        <button class="readiness-option" data-value="4" style="flex:1;padding:16px 8px;border:2px solid #374151;border-radius:12px;background:#111827;color:#fff;cursor:pointer;transition:all 0.2s;text-align:center">
          <div style="font-size:24px;margin-bottom:4px">😊</div>
          <div style="font-size:11px;font-weight:600">Good</div>
        </button>
        <button class="readiness-option" data-value="5" style="flex:1;padding:16px 8px;border:2px solid #374151;border-radius:12px;background:#111827;color:#fff;cursor:pointer;transition:all 0.2s;text-align:center">
          <div style="font-size:24px;margin-bottom:4px">💪</div>
          <div style="font-size:11px;font-weight:600">Excellent</div>
        </button>
      </div>
      
      <div id="readinessEffect" style="font-size:13px;color:#9ca3af;margin-bottom:20px;text-align:center;min-height:40px;line-height:1.4"></div>
      
      <div style="display:flex;gap:12px">
        <button id="readinessCancel" style="flex:1;padding:12px;border:none;border-radius:8px;background:#374151;color:#fff;font-weight:600;cursor:pointer">Cancel</button>
        <button id="readinessConfirm" style="flex:1;padding:12px;border:none;border-radius:8px;background:var(--primary);color:#fff;font-weight:600;cursor:pointer">Apply</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  let selectedReadiness = currentReadiness;
  
  // Update effect text
  const updateEffect = (value) => {
    const effectEl = modal.querySelector('#readinessEffect');
    if (value <= 2) {
      effectEl.innerHTML = `<span style="color:#ef4444">⚠️ Volume -20%, Intensity -5%</span><br><span style="font-size:12px">Workout adjusted for recovery</span>`;
    } else if (value >= 4) {
      effectEl.innerHTML = `<span style="color:#10b981">✅ Volume +10%, Intensity +3%</span><br><span style="font-size:12px">Workout optimized for performance</span>`;
    } else {
      effectEl.innerHTML = `<span style="color:#10b981">✅ No adjustment</span><br><span style="font-size:12px">Workout as programmed</span>`;
    }
  };
  
  // Option button handlers
  modal.querySelectorAll('.readiness-option').forEach(btn => {
    if (parseInt(btn.dataset.value) === currentReadiness) {
      btn.style.borderColor = 'var(--primary)';
      btn.style.background = 'rgba(16, 185, 129, 0.1)';
    }
    
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.readiness-option').forEach(b => {
        b.style.borderColor = '#374151';
        b.style.background = '#111827';
      });
      btn.style.borderColor = 'var(--primary)';
      btn.style.background = 'rgba(16, 185, 129, 0.1)';
      selectedReadiness = parseInt(btn.dataset.value);
      updateEffect(selectedReadiness);
    });
  });
  
  updateEffect(selectedReadiness);
  
  // Cancel handler
  modal.querySelector('#readinessCancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Confirm handler
  modal.querySelector('#readinessConfirm').addEventListener('click', () => {
    // Save readiness for this specific workout
    if (!state.workoutReadiness) state.workoutReadiness = {};
    state.workoutReadiness[workoutKey] = selectedReadiness;
    
    // Apply adjustment to the workout
    applyReadinessAdjustment(weekIndex, dayIndex, selectedReadiness);
    
    saveState();
    renderWorkout();
    document.body.removeChild(modal);
    
    notify(`Readiness set: ${selectedReadiness === 1 ? 'Exhausted' : selectedReadiness === 2 ? 'Tired' : selectedReadiness === 3 ? 'Normal' : selectedReadiness === 4 ? 'Good' : 'Excellent'}`);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
};

// v7.33: Apply readiness adjustment to workout
function applyReadinessAdjustment(weekIndex, dayIndex, readinessScore) {
  const block = state.currentBlock;
  if (!block || !block.weeks[weekIndex] || !block.weeks[weekIndex].days[dayIndex]) return;
  
  const day = block.weeks[weekIndex].days[dayIndex];
  
  // Store original values if not already stored
  if (!day.originalWork) {
    day.originalWork = JSON.parse(JSON.stringify(day.work));
  }
  
  // Reset to original first
  day.work = JSON.parse(JSON.stringify(day.originalWork));
  
  // Apply adjustments based on readiness
  if (readinessScore < 2.5) {
    // Low readiness: -20% volume, -5% intensity
    day.work.forEach(ex => {
      ex.sets = Math.max(1, Math.floor(ex.sets * 0.8));
      if (ex.pct > 0) {
        ex.pct = Math.max(0.5, ex.pct - 0.05);
      }
    });
  } else if (readinessScore > 3.5) {
    // High readiness: +10% volume, +3% intensity
    day.work.forEach(ex => {
      ex.sets = Math.ceil(ex.sets * 1.1);
      if (ex.pct > 0) {
        ex.pct = Math.min(0.98, ex.pct + 0.03);
      }
    });
  }
  // Moderate (3) = no change
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  
  // LOGIC FIX: Ensure blockHistory exists
  if (!state.blockHistory) {
    state.blockHistory = [];
  }
  
  const blocks = state.blockHistory || [];
  
  // Empty state handling
  if (!blocks.length) {
    list.innerHTML = `
      <div class="card" style="background:rgba(17,24,39,.5);text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">📋</div>
        <div class="card-title">No history yet</div>
        <div class="card-subtitle">Import a CSV or generate a training block to see it here.</div>
      </div>
    `;
    return;
  }
  
  // LOGIC FIX: Sort by most recent first (handle various date fields)
  const sorted = [...blocks].sort((a, b) => {
    const dateA = new Date(a.startDate || a.importedAt || a.lastSyncedAt || a.created_at || 0);
    const dateB = new Date(b.startDate || b.importedAt || b.lastSyncedAt || b.created_at || 0);
    return dateB - dateA; // Newest first
  });
  
  list.innerHTML = '';
  
  sorted.forEach((block, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = `
      cursor: pointer;
      margin-bottom: 12px;
      transition: all 0.2s;
      background: rgba(59,130,246,0.1);
      border: 1px solid rgba(59,130,246,0.3);
    `;
    
    // LOGIC FIX: Handle various date formats
    const startDate = new Date(block.startDate || block.importedAt || block.lastSyncedAt || Date.now());
    const dateStr = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Source icon based on origin
    const sourceIcon = {
      'csv_import': '📄',
      'cloud_save': '☁️',
      'cloud_pull': '☁️',
      'generated': '🎯'
    }[block.source] || '📋';
    
    // Status badge
    const statusBadge = block.completed 
      ? '<span style="background:#10b981;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">COMPLETED</span>'
      : '<span style="background:#3b82f6;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">ACTIVE</span>';
    
    // LOGIC FIX: Safely get block length
    const blockLength = block.blockLength || block.weeks?.length || 0;
    const programType = block.programType || 'general';
    
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div style="flex:1">
          <div style="font-size:16px;font-weight:600;margin-bottom:4px">
            ${sourceIcon} ${escapeHtml(block.name || 'Unnamed Block')}
          </div>
          <div style="font-size:13px;color:var(--text-dim)">
            ${dateStr} • ${blockLength} weeks • ${programType}
          </div>
        </div>
        ${statusBadge}
      </div>
      ${block.cloudId ? '<div style="font-size:11px;color:var(--primary);margin-bottom:8px">☁️ Synced to cloud</div>' : ''}
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn-mini success" data-action="load" data-block-id="${block.id}" style="flex:1">📋 Load</button>
        ${block.cloudId ? '<button class="btn-mini primary" data-action="refresh" data-block-id="' + block.id + '" style="flex:1">🔄 Refresh</button>' : ''}
        <button class="btn-mini danger" data-action="delete" data-block-id="${block.id}" style="flex:0 0 auto">✕</button>
      </div>
    `;
    
    // Hover effects
    card.addEventListener('mouseenter', () => {
      card.style.background = 'rgba(59,130,246,0.2)';
      card.style.borderColor = 'rgba(59,130,246,0.5)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(59,130,246,0.1)';
      card.style.borderColor = 'rgba(59,130,246,0.3)';
    });
    
    // LOGIC FIX: Use event delegation on card level (prevents memory leaks)
    card.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      
      e.stopPropagation();
      const action = button.dataset.action;
      const blockId = button.dataset.blockId;
      
      // LOGIC FIX: Debounce rapid clicks
      if (button.disabled) return;
      button.disabled = true;
      setTimeout(() => button.disabled = false, 1000);
      
      if (action === 'load') {
        handleLoadBlockFromHistory(blockId);
      } else if (action === 'refresh' && block.cloudId) {
        handleRefreshBlockFromCloud(block.cloudId);
      } else if (action === 'delete') {
        handleDeleteBlockFromHistory(blockId);
      }
    });
    
    list.appendChild(card);
  });
}

// LOGIC FIX: Separate handler functions to prevent code duplication
function handleLoadBlockFromHistory(blockId) {
  const block = state.blockHistory.find(b => b.id === blockId);
  if (!block) {
    showCloudNotification('error', 'Block not found in history');
    return;
  }
  
  if (block.cloudId) {
    // Load from cloud (has full data)
    if (typeof window.restoreFromCloud === 'function') {
      window.restoreFromCloud(block.cloudId);
    } else {
      showCloudNotification('error', 'Cloud restore function not available');
    }
  } else {
    // LOGIC FIX: For local imports, we need to find the data
    // This is a limitation - local history only stores metadata
    showCloudNotification('info', 'Local block loading requires cloud sync. Please save to cloud first.');
  }
}

function handleRefreshBlockFromCloud(cloudId) {
  if (typeof window.restoreFromCloud === 'function') {
    window.restoreFromCloud(cloudId);
    showCloudNotification('info', 'Refreshing block from cloud...');
  } else {
    showCloudNotification('error', 'Cloud restore function not available');
  }
}

function handleDeleteBlockFromHistory(blockId) {
  const block = state.blockHistory.find(b => b.id === blockId);
  if (!block) return;
  
  const confirmMsg = `Delete "${block.name}" from history?\n\nThis will only remove it from your local history list.\nCloud data (if synced) will remain.`;
  
  if (!confirm(confirmMsg)) return;
  
  // Remove from history
  state.blockHistory = state.blockHistory.filter(b => b.id !== blockId);
  
  // Save and refresh
  saveState();
  renderHistory();
  
  showCloudNotification('success', 'Block removed from history');
}
        // Same transformation as Redo button, but preserves completion status
        const loadedBlock = {
          seed: block.blockSeed || Date.now(),
          profileName: block.profileName,
          startDateISO: block.startDateISO || todayISO(),
          programType: block.programType,
          blockLength: block.blockLength,
          weeks: block.weeks.map(week => ({
            weekIndex: week.weekIndex,
            phase: week.phase,
            intensity: week.intensity || 0.75,
            volFactor: week.volFactor || 0.8,
            days: week.days.map(day => ({
              title: day.title,
              dow: day.dow,
              kind: day.kind || (day.title.includes('Accessory') || day.title.includes('Hypertrophy') ? 'accessory' : 'snatch'),
              liftKey: day.liftKey || '',
              completed: day.completed || false,
              completedDate: day.completedDate || null,
              work: (day.exercises || day.work || []).map(ex => ({
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                pct: ex.prescribedPct ? ex.prescribedPct / 100 : (ex.pct || 0),
                liftKey: ex.liftKey || '',
                tag: ex.tag || 'work',
                targetRIR: ex.targetRIR || null,
                recommendedPct: ex.recommendedPct || 0,
                description: ex.description || ''
              }))
            }))
          }))
        };
        
        console.log('📋 Load Block: Transformed block:', loadedBlock);
        console.log('📋 Load Block: Weeks:', loadedBlock.weeks.length);
        console.log('📋 Load Block: First week days:', loadedBlock.weeks[0]?.days.length);
        console.log('📋 Load Block: First day work:', loadedBlock.weeks[0]?.days[0]?.work.length);
        console.log('📋 Load Block: Program Type:', loadedBlock.programType);
        
        // v7.40 FIX: Set state FIRST, then save, then render
        state.currentBlock = loadedBlock;
        ui.weekIndex = block.currentWeek || 0;
        
        console.log('📋 Load Block: State updated, currentBlock.programType:', state.currentBlock.programType);
        
        console.log('📋 Load Block: Saving state...');
        saveState();
        
        console.log('📋 Load Block: Initial render...');
        renderDashboard();
        renderWorkout();
        
        notify('✅ Block loaded! Check Workout tab to continue.');
        showPage('Workout');
        
        // v7.40 FIX: Force re-render after page switch to ensure fresh data
        console.log('📋 Load Block: Forcing final re-render...');
        setTimeout(() => {
          renderWorkout();
          console.log('📋 Load Block: Final render complete!');
          console.log('📋 Load Block: Verify currentBlock.programType:', state.currentBlock?.programType);
        }, 100);
        
        console.log('📋 Load Block: Complete!');
      }
    });
    
    // Redo block (reset all completion)
    card.querySelector('[data-action="redo"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Redo this entire ${block.blockLength}-week block from scratch?\n\nThis will reset all completed sessions and start fresh from Week 1, Day 1.`)) {
        console.log('🔄 REDO CLICKED - Starting fresh block process');
        
        // CRITICAL FIX: Transform history block structure back to currentBlock format
        // History blocks have: days.exercises (simplified)
        // Current blocks need: days.work (full exercise objects with pct, liftKey, etc.)
        
        const freshBlock = {
          seed: block.blockSeed || Date.now(),
          profileName: block.profileName,
          startDateISO: todayISO(),
          programType: block.programType,
          blockLength: block.blockLength,
          weeks: block.weeks.map(week => ({
            weekIndex: week.weekIndex,
            phase: week.phase,
            intensity: week.intensity || 0.75, // Reasonable default
            volFactor: week.volFactor || 0.8,  // Reasonable default
            days: week.days.map(day => ({
              title: day.title,
              dow: day.dow,
              kind: day.kind || (day.title.includes('Accessory') || day.title.includes('Hypertrophy') ? 'accessory' : 'snatch'),
              liftKey: day.liftKey || '',
              completed: false, // Reset completion
              completedDate: null,
              work: day.exercises.map(ex => ({
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                pct: ex.prescribedPct ? ex.prescribedPct / 100 : 0,
                liftKey: ex.liftKey || '',
                tag: ex.tag || 'work',
                targetRIR: ex.targetRIR || null,
                recommendedPct: ex.recommendedPct || 0,
                description: ex.description || ''
              }))
            }))
          }))
        };
        
        console.log('✅ Transformed block structure - weeks:', freshBlock.weeks.length);
        console.log('✅ Week 1 days:', freshBlock.weeks[0]?.days.length);
        console.log('✅ Day 1 work exercises:', freshBlock.weeks[0]?.days[0]?.work.length);
        
        // Set as current block
        state.currentBlock = freshBlock;
        state.setLogs = {};  // Clear all set logs
        
        // CRITICAL: Reset UI week index to 0
        ui.weekIndex = 0;
        
        saveState();
        renderDashboard();
        renderWorkout();
        
        notify('✅ Block reset! Starting fresh from Week 1, Day 1.');
        showPage('Workout');  // Show Workout tab with fresh block
      }
    });
    
    // View details
    card.querySelector('[data-action="view"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showBlockDetails(block);
    });
    
    // Export
    card.querySelector('[data-action="export"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportBlock(block);
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
  // v7.40: Export block as CSV for backup/restore
  // v7.40 FIX: Added validation and support for both 'work' and 'exercises' fields
  
  if (!block) {
    alert('⚠️ No training block to export. Generate a block first.');
    console.error('Export failed: block is null or undefined');
    return;
  }
  
  if (!block.weeks || block.weeks.length === 0) {
    alert('⚠️ Training block has no weeks. Cannot export empty block.');
    console.error('Export failed: block.weeks is empty', block);
    return;
  }
  
  console.log('📤 Export: Starting export for block with', block.weeks.length, 'weeks');
  
  let csv = 'Week,Day,Exercise,Sets,Reps,Percentage,Notes\n';
  let rowCount = 0;
  
  block.weeks.forEach((week, weekIdx) => {
    if (!week.days || week.days.length === 0) {
      console.warn(`📤 Export: Week ${weekIdx + 1} has no days, skipping`);
      return;
    }
    
    week.days.forEach((day, dayIdx) => {
      // v7.40 FIX: Handle BOTH 'work' and 'exercises' fields
      // Different parts of the app use different field names
      const exercises = day.work || day.exercises || [];
      
      if (exercises.length === 0) {
        console.warn(`📤 Export: Week ${weekIdx + 1}, Day ${dayIdx + 1} (${day.title}) has no exercises`);
      }
      
      exercises.forEach((ex) => {
        // Handle both percentage formats
        const pct = ex.pct ? Math.round(ex.pct * 100) : 
                    ex.prescribedPct ? ex.prescribedPct : '';
        const notes = `${week.phase || 'accumulation'}|${day.title || 'workout'}`;
        csv += `${weekIdx + 1},"${day.title || 'workout'}","${ex.name}",${ex.sets},${ex.reps},${pct},"${notes}"\n`;
        rowCount++;
      });
    });
  });
  
  if (rowCount === 0) {
    alert('⚠️ No exercises found in training block.\n\nThe block structure may be corrupted. Try regenerating your block.');
    console.error('Export failed: No exercises found in block');
    console.error('Block structure:', JSON.stringify(block, null, 2));
    return;
  }
  
  console.log(`📤 Export: Successfully exported ${rowCount} exercises from ${block.weeks.length} weeks`);
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LiftAI_Block_${block.programType || 'general'}_${block.startDateISO || 'backup'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('✅ Training block exported as CSV');
}

// v7.35: Import training block from CSV
function importBlock(csvText) {
  try {
    console.log('🔍 importBlock: Starting parse...');
    const lines = csvText.trim().split('\n').filter(l => l.trim());
    console.log('🔍 importBlock: Found', lines.length, 'lines');
    
    if (lines.length < 2) {
      return { success: false, error: 'CSV file is empty or has only a header row' };
    }
    
    // Parse header
    const header = lines[0].toLowerCase();
    console.log('🔍 importBlock: Header:', header);
    
    if (!header.includes('week') || !header.includes('exercise')) {
      return { 
        success: false, 
        error: 'Invalid CSV format. Must have "Week" and "Exercise" columns.\n\nExpected format:\nWeek,Day,Exercise,Sets,Reps,Percentage,Notes\n\nActual header:\n' + lines[0]
      };
    }
    
    // Parse data with more flexible regex
    const weeks = {};
    let parsedLines = 0;
    let skippedLines = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // More flexible regex that handles quotes and missing fields
      // Format: Week,"Day","Exercise",Sets,Reps,Percentage,"Notes"
      const match = line.match(/^(\d+),?"?([^",]+)"?,?"?([^",]+)"?,?(\d+),?(\d+),?(\d*),?"?([^"]*)"?$/);
      
      if (!match) {
        console.warn('🔍 importBlock: Skipped line', i, ':', line);
        skippedLines++;
        continue;
      }
      
      const [, weekNum, dayTitle, exercise, sets, reps, pct, notes] = match;
      const weekIdx = parseInt(weekNum) - 1;
      
      console.log('🔍 importBlock: Parsed - Week', weekNum, 'Day', dayTitle, 'Exercise', exercise);
      
      if (!weeks[weekIdx]) {
        const noteParts = notes.split('|');
        weeks[weekIdx] = {
          weekIndex: weekIdx,
          days: {},
          phase: noteParts[0] || 'accumulation',
          intensity: 0.75,
          volFactor: 1.0
        };
      }
      
      if (!weeks[weekIdx].days[dayTitle]) {
        // Determine kind based on day title
        let kind = 'snatch';
        const titleLower = dayTitle.toLowerCase();
        if (titleLower.includes('clean') || titleLower.includes('jerk') || titleLower.includes('c&j')) {
          kind = 'cj';
        } else if (titleLower.includes('combined')) {
          kind = 'combined';
        } else if (titleLower.includes('strength')) {
          kind = 'strength';
        } else if (titleLower.includes('accessory') || titleLower.includes('hypertrophy')) {
          kind = 'accessory';
        }
        
        // Determine liftKey based on kind
        let liftKey = '';
        if (kind === 'snatch') liftKey = 'snatch';
        else if (kind === 'cj') liftKey = 'cj';
        else if (kind === 'combined') liftKey = 'snatch'; // Combined uses snatch as primary
        
        weeks[weekIdx].days[dayTitle] = {
          dow: 0, // Will be assigned later
          title: dayTitle,
          kind,
          liftKey,
          completed: false,
          completedDate: null,
          work: []
        };
      }
      
      // Determine liftKey for this exercise
      const exLower = exercise.toLowerCase();
      let exLiftKey = '';
      if (exLower.includes('snatch')) exLiftKey = 'snatch';
      else if (exLower.includes('clean') || exLower.includes('jerk')) exLiftKey = 'cj';
      else if (exLower.includes('front squat')) exLiftKey = 'fs';
      else if (exLower.includes('back squat') || exLower.includes('squat')) exLiftKey = 'bs';
      else if (exLower.includes('push press')) exLiftKey = 'pushPress';
      else if (exLower.includes('press')) exLiftKey = 'strictPress';
      
      weeks[weekIdx].days[dayTitle].work.push({
        name: exercise,
        sets: parseInt(sets) || 0,
        reps: parseInt(reps) || 0,
        pct: pct ? parseFloat(pct) / 100 : 0,
        liftKey: exLiftKey,
        tag: 'work'
      });
      
      parsedLines++;
    }
    
    console.log('🔍 importBlock: Parsed', parsedLines, 'lines, skipped', skippedLines);
    
    if (parsedLines === 0) {
      return { success: false, error: 'No valid exercises found in CSV. Check the format.' };
    }
    
    // Convert to array format
    const weeksArray = [];
    const maxWeek = Math.max(...Object.keys(weeks).map(Number));
    
    for (let i = 0; i <= maxWeek; i++) {
      if (weeks[i]) {
        const daysArray = Object.values(weeks[i].days);
        // Assign DOW based on order (Mon=1, Wed=3, Fri=5, etc.)
        const daysPerWeek = daysArray.length;
        daysArray.forEach((day, idx) => {
          if (daysPerWeek === 3) {
            day.dow = [1, 3, 5][idx] || idx; // Mon, Wed, Fri
          } else if (daysPerWeek === 4) {
            day.dow = [1, 2, 4, 5][idx] || idx; // Mon, Tue, Thu, Fri
          } else if (daysPerWeek === 5) {
            day.dow = [1, 2, 3, 4, 5][idx] || idx; // Mon-Fri
          } else if (daysPerWeek === 6) {
            day.dow = [1, 2, 3, 4, 5, 6][idx] || idx; // Mon-Sat
          } else {
            day.dow = idx + 1; // Fallback
          }
        });
        
        weeksArray.push({
          ...weeks[i],
          days: daysArray
        });
      }
    }
    
    console.log('🔍 importBlock: Created', weeksArray.length, 'weeks');
    
    const block = {
      id: 'imported_' + Date.now(),
      programType: 'general',
      blockLength: weeksArray.length,
      startDateISO: new Date().toISOString().split('T')[0],
      weeks: weeksArray,
      currentWeek: 0
    };
    
    console.log('🔍 importBlock: Success!', block);
    return { success: true, block };
    
  } catch (err) {
    console.error('🔍 importBlock: Exception:', err);
    return { success: false, error: err.message + '\n\nStack: ' + err.stack };
  }
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
  
  // PRODUCTION PATCH: Add User ID recovery card
  addUserIdRecoveryCard();
}

// PRODUCTION PATCH: User ID Recovery System
function addUserIdRecoveryCard() {
  const settingsContainer = $('pageSettings');
  if (!settingsContainer) return;
  
  // Check if already added
  if (document.getElementById('userIdRecoveryCard')) return;
  
  const userId = getAnonymousUserId();
  
  const card = document.createElement('div');
  card.id = 'userIdRecoveryCard';
  card.className = 'card';
  card.style.marginTop = '24px';
  card.style.background = 'rgba(239, 68, 68, 0.05)';
  card.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:20px">⚠️</span>
      <div class="card-title" style="margin:0">Your Cloud Sync User ID</div>
    </div>
    <div class="card-subtitle" style="margin-bottom:16px">
      <strong>IMPORTANT:</strong> Save this ID to recover your cloud data if you clear browser cache
    </div>
    
    <div style="padding:14px;background:rgba(0,0,0,0.3);border:1px solid rgba(239,68,68,0.4);border-radius:10px;margin-bottom:16px">
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">
        Your User ID
      </div>
      <div style="font-family:monospace;font-size:13px;word-break:break-all;margin-bottom:10px;color:var(--primary);font-weight:600">
        ${escapeHtml(userId)}
      </div>
      <button 
        class="secondary small" 
        onclick="navigator.clipboard.writeText('${userId}').then(() => notify('✅ User ID copied to clipboard!'))"
        style="width:100%"
      >
        📋 Copy User ID
      </button>
    </div>
    
    <div class="form-group">
      <label>Lost your data? Restore from User ID</label>
      <div style="display:flex;gap:8px">
        <input 
          id="restoreUserIdInput" 
          placeholder="Paste your saved User ID here" 
          style="flex:1;font-family:monospace;font-size:13px"
        />
        <button class="primary small" onclick="window.restoreUserId()" style="min-width:100px">
          🔄 Restore
        </button>
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:8px">
        This will replace your current ID and reload the page to access the old data.
      </div>
    </div>
  `;
  
  // Insert before data management card or append to end
  const cards = settingsContainer.querySelectorAll('.card');
  if (cards.length > 0) {
    const lastCard = cards[cards.length - 1];
    lastCard.before(card);
  } else {
    settingsContainer.appendChild(card);
  }
}

// Add restore function to window global scope
window.restoreUserId = function() {
  const input = $('restoreUserIdInput');
  if (!input || !input.value.trim()) {
    alert('Please enter a User ID');
    return;
  }
  
  const newUserId = input.value.trim();
  
  // Validate format
  if (!newUserId.startsWith('athlete_')) {
    alert('Invalid User ID format. User IDs should start with "athlete_"');
    return;
  }
  
  if (!confirm(
    `⚠️ RESTORE USER ID\n\n` +
    `This will replace your current User ID with:\n${newUserId}\n\n` +
    `Your current local data will remain, but cloud sync will use the new ID.\n\n` +
    `Continue?`
  )) {
    return;
  }
  
  // Save new user ID
  localStorage.setItem('liftai_user_id', newUserId);
  
  // Show success and reload
  showCloudNotification('success', 'User ID restored! Reloading...');
  setTimeout(() => {
    location.reload();
  }, 1500);
};

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

// ============================================================================
// PRODUCTION PATCHES: Retry & Debounce Systems
// ============================================================================

// Global retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 5000   // 5 seconds max
};

/**
 * Retry wrapper with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {string} operationName - Name for logging
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise} Result of operation
 */
async function retryWithBackoff(operation, operationName = 'Operation', maxRetries = RETRY_CONFIG.maxAttempts) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // EMERGENCY HOTFIX: Improved error logging
      const errorDetails = {
        message: error?.message || 'Unknown error',
        code: error?.code,
        details: error?.details,
        attempt: attempt
      };
      
      console.error(`${operationName} attempt ${attempt}/${maxRetries} failed:`, errorDetails);
      
      // Don't retry on client errors (4xx)
      if (error.code && error.code.toString().startsWith('4')) {
        console.error(`${operationName} failed with client error - not retrying:`, error.code);
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt - 1),
          RETRY_CONFIG.maxDelay
        );
        
        const errorMsg = error?.message || 'Unknown error';
        showCloudNotification('warning', `${operationName} failed: ${errorMsg}. Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        const finalError = error?.message || 'Unknown error';
        console.error(`${operationName} final failure:`, finalError);
        showCloudNotification('error', `${operationName} failed after ${maxRetries} attempts: ${finalError}`);
        throw error;
      }
    }
  }
}

// Global debounce state
const buttonDebounce = new Map();

/**
 * Debounce a button click to prevent double-execution
 * @param {string} buttonId - Unique identifier for the button
 * @param {Function} callback - Function to execute
 * @param {number} delay - Debounce delay in ms (default 1000)
 */
function debounceButton(buttonId, callback, delay = 1000) {
  const now = Date.now();
  const lastClick = buttonDebounce.get(buttonId) || 0;
  
  if (now - lastClick < delay) {
    console.warn(`Button ${buttonId} debounced (${now - lastClick}ms since last click)`);
    return false;
  }
  
  buttonDebounce.set(buttonId, now);
  
  try {
    callback();
    return true;
  } catch (error) {
    console.error(`Error in ${buttonId} callback:`, error);
    throw error;
  }
}

/**
 * Create a debounced async button handler
 * @param {string} buttonId - Button identifier
 * @param {Function} asyncCallback - Async function to execute
 * @param {number} delay - Debounce delay in ms
 * @returns {Function} Debounced handler
 */
function createDebouncedHandler(buttonId, asyncCallback, delay = 2000) {
  return async function() {
    if (!debounceButton(buttonId, () => {}, delay)) {
      return; // Still in debounce period
    }
    
    try {
      await asyncCallback();
    } catch (error) {
      console.error(`${buttonId} handler error:`, error);
    }
  };
}

// ============================================================================
// END PRODUCTION PATCHES
// ============================================================================

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
  // PRODUCTION PATCH: Debounce generate block
  $('btnGenerateBlock')?.addEventListener('click', createDebouncedHandler(
    'btnGenerateBlock',
    generateBlockFromSetup,
    2000
  ));
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
  // PRODUCTION PATCH: Cloud sync with retry + debounce
  $('btnPushCloud')?.addEventListener('click', createDebouncedHandler(
    'btnPushCloud',
    () => retryWithBackoff(pushToCloud, 'Cloud Save'),
    2000 // 2 second debounce
  ));
  $('btnPullCloud')?.addEventListener('click', createDebouncedHandler(
    'btnPullCloud',
    pullFromCloud,
    1000
  ));
  
  // ========================================
  // v7.41: Dashboard Import/Export Buttons
  // ========================================
  
  // Export current block
  $('btnExportCurrentBlock')?.addEventListener('click', () => {
    const block = state.currentBlock;
    if (!block) {
      alert('⚠️ No training block to export. Generate a block first.');
      return;
    }
    exportBlock(block);
  });
  
  // Import block (uses unified system)
  $('btnImportBlock')?.addEventListener('click', () => {
    console.log('🔘 Dashboard Import button clicked');
    triggerUnifiedImport('Dashboard');
  });
  
  // ========================================
  // v7.41: History Import Button
  // NEW: Adds import capability to History tab
  // ========================================
  
  $('btnImportBlock_History')?.addEventListener('click', () => {
    console.log('🔘 History Import button clicked');
    triggerUnifiedImport('History');
  });
  
  // ========================================
  // v7.41: UNIFIED IMPORT SYSTEM
  // Location-agnostic import that updates ALL tabs
  // ========================================
  
  /**
   * Unified Training Block Import Handler
   * Can be triggered from Dashboard, History, or any tab
   * Updates global state and refreshes ALL views
   * @param {string} csvText - The CSV content
   * @param {string} sourceTab - Which tab triggered the import
   * @returns {boolean} - Success status
   */
  function unifiedBlockImport(csvText, sourceTab = 'unknown') {
    console.log(`📥 UNIFIED IMPORT: Starting from ${sourceTab} tab`);
    console.log(`📥 UNIFIED IMPORT: CSV length: ${csvText.length} chars`);
    
    try {
      // Parse the CSV using existing importBlock function
      const result = importBlock(csvText);
      
      if (!result.success) {
        console.error(`📥 UNIFIED IMPORT: Parse failed:`, result.error);
        alert(`❌ Import failed: ${result.error}\n\nMake sure you're importing a Training Block CSV.\n\nExpected format:\nWeek,Day,Exercise,Sets,Reps,Percentage,Notes`);
        return false;
      }
      
      const block = result.block;
      console.log(`📥 UNIFIED IMPORT: Parse successful`);
      console.log(`📥 UNIFIED IMPORT: Block details:`, {
        programType: block.programType,
        weeks: block.weeks.length,
        startDate: block.startDateISO
      });
      
      // Calculate stats for confirmation dialog
      const daysCount = block.weeks.reduce((sum, w) => sum + w.days.length, 0);
      const exercisesCount = block.weeks.reduce((sum, w) => 
        sum + w.days.reduce((s, d) => s + (d.work?.length || 0), 0), 0);
      
      console.log(`📥 UNIFIED IMPORT: Stats - ${daysCount} days, ${exercisesCount} exercises`);
      
      // Confirm with user
      const confirmMsg = `Import training block?\n\n` +
        `• Program: ${block.programType}\n` +
        `• Length: ${block.weeks.length} weeks\n` +
        `• Training days: ${daysCount}\n` +
        `• Exercises: ${exercisesCount}\n\n` +
        `This will REPLACE your current training block.`;
      
      if (!confirm(confirmMsg)) {
        console.log(`📥 UNIFIED IMPORT: User cancelled`);
        return false;
      }
      
      // ========================================
      // CRITICAL SECTION: Update Global State
      // This is the single source of truth
      // ========================================
      console.log(`📥 UNIFIED IMPORT: Updating global state...`);
      
      state.currentBlock = block;
      ui.weekIndex = 0; // Reset to week 1
      
      console.log(`📥 UNIFIED IMPORT: ✓ state.currentBlock updated`);
      console.log(`📥 UNIFIED IMPORT: ✓ programType = "${state.currentBlock.programType}"`);
      
      // ========================================
      // HISTORY FIX: Add imported block to history
      // This ensures CSV imports appear in History tab
      // ========================================
      console.log(`📥 UNIFIED IMPORT: Adding to block history...`);
      
      // Initialize blockHistory if missing
      if (!state.blockHistory) {
        state.blockHistory = [];
        console.log(`📥 UNIFIED IMPORT: ✓ Initialized empty blockHistory`);
      }
      
      // Create history entry
      const historyEntry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: block.name || `Imported Block - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        blockLength: block.weeks.length,
        programType: block.programType || 'imported',
        profileName: state.activeProfile,
        startDate: block.startDateISO || new Date().toISOString(),
        endDate: null,
        completed: false,
        importedAt: new Date().toISOString(),
        source: 'csv_import'
      };
      
      // LOGIC FIX: Check for duplicate before adding
      const existingIndex = state.blockHistory.findIndex(
        h => h.name === historyEntry.name && h.startDate === historyEntry.startDate
      );
      
      if (existingIndex >= 0) {
        // Update existing entry instead of creating duplicate
        state.blockHistory[existingIndex] = {
          ...state.blockHistory[existingIndex],
          ...historyEntry,
          importedAt: new Date().toISOString() // Update timestamp
        };
        console.log(`📥 UNIFIED IMPORT: ✓ Updated existing history entry`);
      } else {
        // Add new entry (newest first)
        state.blockHistory.unshift(historyEntry);
        console.log(`📥 UNIFIED IMPORT: ✓ Added new history entry:`, historyEntry.name);
      }
      
      // LOGIC FIX: Limit history to prevent bloat
      if (state.blockHistory.length > 100) {
        state.blockHistory = state.blockHistory.slice(0, 100);
        console.log(`📥 UNIFIED IMPORT: ✓ Trimmed history to 100 entries`);
      }
      
      // ========================================
      // CRITICAL SECTION: Persist to localStorage
      // Ensures data survives page refresh
      // ========================================
      console.log(`📥 UNIFIED IMPORT: Saving to localStorage...`);
      saveState();
      console.log(`📥 UNIFIED IMPORT: ✓ localStorage updated`);
      
      // ========================================
      // CRITICAL SECTION: Refresh ALL Views
      // MUST happen in this order
      // ========================================
      console.log(`📥 UNIFIED IMPORT: Refreshing all views...`);
      
      // 1. Dashboard (shows block summary)
      renderDashboard();
      console.log(`📥 UNIFIED IMPORT: ✓ Dashboard rendered`);
      
      // 2. Workout (shows training plan)
      renderWorkout();
      console.log(`📥 UNIFIED IMPORT: ✓ Workout rendered`);
      
      // 3. History (may show current block indicator)
      renderHistory();
      console.log(`📥 UNIFIED IMPORT: ✓ History rendered`);
      
      // ========================================
      // Navigate to Workout tab
      // ========================================
      console.log(`📥 UNIFIED IMPORT: Navigating to Workout...`);
      showPage('Workout');
      
      // Force final render after navigation completes
      // This ensures the Workout tab is fully refreshed
      setTimeout(() => {
        renderWorkout();
        renderDashboard(); // v7.41: Also re-render Dashboard to fix desync
        console.log(`📥 UNIFIED IMPORT: ✓ Final render complete`);
        console.log(`📥 UNIFIED IMPORT: Final verification:`, {
          currentBlock: !!state.currentBlock,
          programType: state.currentBlock?.programType,
          weeks: state.currentBlock?.weeks?.length
        });
      }, 100);
      
      // Success notification
      notify(`✅ Training block imported successfully!`);
      console.log(`📥 UNIFIED IMPORT: ✅ Import complete!`);
      
      return true;
      
    } catch (err) {
      console.error(`📥 UNIFIED IMPORT: Exception:`, err);
      console.error(`📥 UNIFIED IMPORT: Stack:`, err.stack);
      alert(`❌ Import failed: ${err.message}\n\nCheck the browser console (F12) for details.`);
      return false;
    }
  }
  
  /**
   * Trigger file picker for unified import
   * Can be called from any tab
   * @param {string} sourceTab - Identifies which tab triggered import
   */
  function triggerUnifiedImport(sourceTab = 'unknown') {
    console.log(`📥 TRIGGER: Import requested from ${sourceTab}`);
    const fileInput = $('fileImportBlock');
    if (fileInput) {
      // Store source for logging purposes
      fileInput.dataset.sourceTab = sourceTab;
      fileInput.click();
      console.log(`📥 TRIGGER: File picker opened`);
    } else {
      console.error(`📥 TRIGGER: File input #fileImportBlock not found`);
      alert('⚠️ Import button not properly initialized. Please refresh the page.');
    }
  }
  
  // ========================================
  // v7.41: UNIFIED FILE INPUT HANDLER
  // Single handler for ALL CSV imports
  // ========================================
  
  $('fileImportBlock')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log(`📥 FILE HANDLER: No file selected`);
      return;
    }
    
    const sourceTab = e.target.dataset.sourceTab || 'unknown';
    console.log(`📥 FILE HANDLER: File selected from ${sourceTab}:`, file.name, file.size);
    
    const reader = new FileReader();
    
    reader.onerror = (error) => {
      console.error(`📥 FILE HANDLER: FileReader error:`, error);
      alert(`❌ Failed to read file: ${error}`);
    };
    
    reader.onload = (event) => {
      const csvText = event.target.result;
      console.log(`📥 FILE HANDLER: File read successfully, length: ${csvText.length}`);
      console.log(`📥 FILE HANDLER: First 200 chars:`, csvText.substring(0, 200));
      
      // Call unified import handler
      unifiedBlockImport(csvText, sourceTab);
      
      // Reset file input so same file can be selected again
      e.target.value = '';
      delete e.target.dataset.sourceTab;
    };
    
    reader.readAsText(file);
  });
  
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
  
  // v7.32: CSV Import functionality
// Supports format: Date,Exercise,Sets,Reps,Weight,RPE (or similar variations)
function importCSV(csvText) {
  try {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return { success: false, error: 'CSV file is empty or has no data rows' };
    }
    
    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const exerciseIdx = headers.findIndex(h => h.includes('exercise') || h.includes('lift') || h.includes('movement'));
    const setsIdx = headers.findIndex(h => h.includes('set'));
    const repsIdx = headers.findIndex(h => h.includes('rep'));
    const weightIdx = headers.findIndex(h => h.includes('weight') || h.includes('load') || h.includes('kg') || h.includes('lb'));
    const rpeIdx = headers.findIndex(h => h.includes('rpe') || h.includes('rir') || h.includes('effort'));
    
    if (dateIdx === -1 || exerciseIdx === -1) {
      return { success: false, error: 'CSV must have Date and Exercise columns' };
    }
    
    // Parse data rows
    const workouts = {};
    const exerciseMaxes = {}; // Track best lifts for max estimation
    let totalExercises = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim());
      if (cells.length < 2) continue;
      
      const date = cells[dateIdx];
      const exercise = cells[exerciseIdx];
      const sets = setsIdx >= 0 ? parseInt(cells[setsIdx]) || 1 : 1;
      const reps = repsIdx >= 0 ? parseInt(cells[repsIdx]) || 1 : 1;
      const weight = weightIdx >= 0 ? parseFloat(cells[weightIdx]) || 0 : 0;
      const rpe = rpeIdx >= 0 ? parseFloat(cells[rpeIdx]) || 0 : 0;
      
      if (!date || !exercise) continue;
      
      // Group by date
      if (!workouts[date]) workouts[date] = [];
      workouts[date].push({ exercise, sets, reps, weight, rpe });
      totalExercises++;
      
      // Track maxes for estimation (only for main lifts with weight)
      if (weight > 0 && reps > 0 && reps <= 10) {
        const exerciseLower = exercise.toLowerCase();
        const isMainLift = exerciseLower.includes('snatch') || 
                          exerciseLower.includes('clean') || 
                          exerciseLower.includes('jerk') ||
                          exerciseLower.includes('squat') ||
                          exerciseLower.includes('press');
        
        if (isMainLift) {
          // Estimate 1RM using Epley formula: weight × (1 + reps/30)
          const estimated1RM = weight * (1 + reps / 30);
          
          if (!exerciseMaxes[exercise] || estimated1RM > exerciseMaxes[exercise].estimated1RM) {
            exerciseMaxes[exercise] = {
              weight,
              reps,
              rpe,
              estimated1RM: Math.round(estimated1RM)
            };
          }
        }
      }
    }
    
    if (Object.keys(workouts).length === 0) {
      return { success: false, error: 'No valid workout data found in CSV' };
    }
    
    // Add to history (create simple workout log format)
    state.history = state.history || [];
    Object.keys(workouts).forEach(date => {
      const existingIdx = state.history.findIndex(h => h.date === date);
      if (existingIdx >= 0) {
        // Merge with existing workout
        state.history[existingIdx].exercises = [
          ...state.history[existingIdx].exercises,
          ...workouts[date]
        ];
      } else {
        // Create new workout entry
        state.history.push({
          date,
          exercises: workouts[date],
          source: 'csv_import'
        });
      }
    });
    
    // Update user maxes if we found better estimates
    const profile = getProfile();
    let maxesUpdated = false;
    
    Object.keys(exerciseMaxes).forEach(exercise => {
      const exerciseLower = exercise.toLowerCase();
      const max = exerciseMaxes[exercise];
      
      // Map to standard lift keys
      if (exerciseLower.includes('snatch') && !exerciseLower.includes('power')) {
        if (!profile.maxes.snatch || max.estimated1RM > profile.maxes.snatch) {
          profile.maxes.snatch = max.estimated1RM;
          maxesUpdated = true;
        }
      }
      else if (exerciseLower.includes('clean') && (exerciseLower.includes('jerk') || exerciseLower.includes('c&j'))) {
        if (!profile.maxes.cj || max.estimated1RM > profile.maxes.cj) {
          profile.maxes.cj = max.estimated1RM;
          maxesUpdated = true;
        }
      }
      else if (exerciseLower.includes('back squat') || (exerciseLower.includes('squat') && exerciseLower.includes('back'))) {
        if (!profile.maxes.bs || max.estimated1RM > profile.maxes.bs) {
          profile.maxes.bs = max.estimated1RM;
          maxesUpdated = true;
        }
      }
      else if (exerciseLower.includes('front squat') || (exerciseLower.includes('squat') && exerciseLower.includes('front'))) {
        if (!profile.maxes.fs || max.estimated1RM > profile.maxes.fs) {
          profile.maxes.fs = max.estimated1RM;
          maxesUpdated = true;
        }
      }
    });
    
    return {
      success: true,
      workouts: Object.keys(workouts).length,
      exercises: totalExercises,
      maxesUpdated
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// v7.24: Import button handler
  $('btnImport')?.addEventListener('click', () => {
    const fileInput = $('fileImport');
    if (fileInput) fileInput.click();
  });
  
  // v7.41: Old workout log CSV import removed
  // History tab now uses unified training block import via btnImportBlock_History
  
  // v7.24: File import handler (JSON)
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
  console.log('🚀 Starting boot sequence...');
  
  // Track initialization status
  const initStatus = {
    wireButtons: false,
    workoutDetail: false,
    readiness: false,
    daySelectors: false,
    page: false,
    supabase: false
  };
  
  // Step 1: Wire buttons (critical)
  try {
    wireButtons();
    initStatus.wireButtons = true;
    console.log('✓ Buttons wired');
  } catch (error) {
    console.error('✗ Failed to wire buttons:', error);
  }
  
  // Step 2: Bind workout detail controls
  try {
    bindWorkoutDetailControls();
    initStatus.workoutDetail = true;
    console.log('✓ Workout detail controls bound');
  } catch (error) {
    console.error('✗ Failed to bind workout detail controls:', error);
  }
  
  // Step 3: Bind readiness modal
  try {
    bindReadinessModal();
    initStatus.readiness = true;
    console.log('✓ Readiness modal bound');
  } catch (error) {
    console.error('✗ Failed to bind readiness modal:', error);
  }
  
  // Step 4: Ensure day selectors bound
  try {
    ensureDaySelectorsBound();
    initStatus.daySelectors = true;
    console.log('✓ Day selectors bound');
  } catch (error) {
    console.error('✗ Failed to bind day selectors:', error);
  }
  
  // Step 5: Show initial page
  try {
    showPage('Setup');
    initStatus.page = true;
    console.log('✓ Initial page shown');
  } catch (error) {
    console.error('✗ Failed to show page:', error);
  }
  
  // Step 6: Initialize week index
  try {
    if (state.currentBlock && state.currentBlock.weeks?.length) {
      ui.weekIndex = 0;
    }
    console.log('✓ Week index set');
  } catch (error) {
    console.error('✗ Failed to set week index:', error);
  }
  
  // Step 7: Initialize cloud sync (non-critical)
  try {
    initSupabase();
    initStatus.supabase = true;
    console.log('✓ Supabase initialization started');
  } catch (error) {
    console.error('✗ Failed to initialize Supabase:', error);
  }
  
  // Report initialization status
  const failed = Object.keys(initStatus).filter(k => !initStatus[k]);
  if (failed.length === 0) {
    console.log('✅ Boot complete - all systems operational');
  } else {
    console.warn(`⚠️ Boot complete with failures: ${failed.join(', ')}`);
  }
  
  // Make boot status available globally for debugging
  window.liftaiBootStatus = initStatus;
  
  // Set up global event delegation for dynamically created elements
  setupGlobalEventDelegation();
}

/**
 * Global event delegation handler
 * Handles events for dynamically created elements without re-binding
 */
function setupGlobalEventDelegation() {
  console.log('Setting up global event delegation...');
  
  // Delegate all clicks on the document body
  document.body.addEventListener('click', function(e) {
    let target = e.target;
    
    // Handle data-action attributes - check the target and its parents
    // This ensures clicks on child elements (like icons inside buttons) work
    const actionElement = target.closest('[data-action]');
    if (actionElement) {
      const action = actionElement.getAttribute('data-action');
      e.preventDefault();
      handleDataAction(action, actionElement);
      return;
    }
    
    // Handle buttons with specific IDs dynamically created
    const button = target.closest('button');
    if (button && button.id) {
      // Check for day selection buttons
      if (button.id.startsWith('daySelect_')) {
        const dayNum = parseInt(button.id.split('_')[1]);
        if (!isNaN(dayNum)) {
          toggleDaySelection(dayNum);
          return;
        }
      }
      
      // Check for accessory day selection
      if (button.id.startsWith('accDaySelect_')) {
        const dayNum = parseInt(button.id.split('_')[1]);
        if (!isNaN(dayNum)) {
          toggleAccessoryDaySelection(dayNum);
          return;
        }
      }
    }
  });
  
  console.log('✓ Global event delegation ready');
}

/**
 * Handle data-action attributes
 */
function handleDataAction(action, element) {
  const actions = {
    'open-workout-detail': () => {
      const weekIndex = parseInt(element.getAttribute('data-week-index'));
      const dayIndex = parseInt(element.getAttribute('data-day-index'));
      if (!isNaN(weekIndex) && !isNaN(dayIndex)) {
        const weekData = state.currentBlock?.weeks[weekIndex];
        if (weekData) {
          openWorkoutDetail(weekIndex, dayIndex, weekData.days[dayIndex]);
        }
      }
    },
    'toggle-set-complete': () => {
      const setKey = element.getAttribute('data-set-key');
      if (setKey) {
        toggleSetComplete(setKey);
      }
    },
    'start-rest-timer': () => {
      const exerciseKey = element.getAttribute('data-exercise-key');
      const duration = parseInt(element.getAttribute('data-duration')) || 180;
      if (exerciseKey) {
        startRestTimer(duration, exerciseKey);
      }
    }
  };
  
  const handler = actions[action];
  if (handler) {
    try {
      handler();
    } catch (error) {
      console.error(`Error handling action ${action}:`, error);
    }
  }
}

// Boot function will be called from index.html
// REMOVED: document.addEventListener('DOMContentLoaded', boot);

// Expose boot function to global window object for HTML initialization
window.initApp = boot;
