// app.js - Gotham Grit Application Controller
import batAudio from './audio.js';
import { supabase } from './supabase.js';

// --- CONFIGURATION & QUOTES ---
const BATMAN_QUOTES = [
  { text: "Why do we fall? So that we can learn to pick ourselves up.", author: "Alfred Pennyworth" },
  { text: "It's not who I am underneath, but what I do that defines me.", author: "Batman" },
  { text: "I am vengeance. I am the night. I am Batman!", author: "Batman" },
  { text: "The night is darkest just before the dawn. And I promise you, the dawn is coming.", author: "Harvey Dent" },
  { text: "You either die a hero or you live long enough to see yourself become the villain.", author: "Harvey Dent" },
  { text: "A hero can be anyone. Even a man doing something as simple and reassuring as putting a coat around a young boy's shoulders...", author: "Batman" },
  { text: "Everything's impossible until somebody does it.", author: "Batman" },
  { text: "Sometimes the truth isn't good enough, sometimes people deserve more. Sometimes people deserve to have their faith rewarded.", author: "Batman" },
  { text: "I wear a mask. And that mask, it's not to hide who I am, but to create what I am.", author: "Batman" },
  { text: "If you make yourself more than just a man, if you devote yourself to an ideal, then you become something else entirely.", author: "Henri Ducard" }
];

const TERMINAL_QUOTES = [
  { text: "Fear is a tool. When that light hits the sky, it's not just a call-out. It's a warning.", author: "Batman" },
  { text: "I have one power. I never give up.", author: "Batman" },
  { text: "A hero is someone who gets up, even when they can't.", author: "Batman" },
  { text: "We fall so that we can learn to pick ourselves up.", author: "Alfred Pennyworth" },
  { text: "The training is nothing. The will is everything. The will to act.", author: "Henri Ducard" },
  { text: "It's not about what I want, it's about what is fair!", author: "Harvey Dent" },
  { text: "Criminals are a superstitious cowardly lot. So my disguise must be able to strike terror into their hearts.", author: "Bruce Wayne" },
  { text: "If you're good at something, never do it for free.", author: "The Joker" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius (Batcomputer Archives)" },
  { text: "Endure, Master Wayne. Take it. They'll hate you for it, but that's the point of Batman.", author: "Alfred Pennyworth" },
  { text: "You can't save Gotham alone. But you can start.", author: "James Gordon" },
  { text: "A hero can be anyone, even someone doing something as simple as reassuring a young boy.", author: "Batman" }
];

// --- ARMORY CHALLENGE DATA ---
const ARMORY_ITEMS = [
  { id: 'grapple', name: 'Grapple Hook', icon: 'fa-link', targetStreak: 3, desc: 'Traverse Gotham\'s skylines swiftly.', lore: 'Grapple Hook: Custom motorized gas-powered winch designed to scale building facades instantly.' },
  { id: 'batarang', name: 'Batarang', icon: 'fa-location-crosshairs', targetStreak: 5, desc: 'Non-lethal ranged throwing weapon.', lore: 'Batarang: Symmetrical wing design crafted for precise targeting and distraction tactics.' },
  { id: 'batmobile', name: 'Batmobile', icon: 'fa-car-rear', targetStreak: 7, desc: 'Armored urban interceptor vehicle.', lore: 'Batmobile: High-speed tactical transport featuring heavy shielding and turbojet thrusters.' },
  { id: 'batwing', name: 'The Batwing', icon: 'fa-jet-fighter-upward', targetStreak: 15, desc: 'Stealth tactical aerial cruiser.', lore: 'The Batwing: Vertical-takeoff fighter jet loaded with radar-shrouding carbon composites.' },
  { id: 'batsuit', name: 'Batsuit Mk II', icon: 'fa-user-shield', targetStreak: 30, desc: 'Reinforced carbon-fiber armor.', lore: 'Batsuit Mk II: Light-weight weave resistant to ballistic impact, featuring integrated visor HUD feed.' }
];

// --- STATE MANAGEMENT ---
let state = {
  tasks: [], // Array of { id, text, completed, category }
  streak: 0,
  totalSecured: 0,
  lastCompletedDate: null,
  lastOpenedDate: null,
  soundMuted: false,
  history: {}, // Key: "YYYY-MM-DD", Value: 'completed' | 'failed' | { status: '...', tasks: [] }
  skills: {
    mind: { xp: 0, level: 1 },
    body: { xp: 0, level: 1 },
    discipline: { xp: 0, level: 1 },
    career: { xp: 0, level: 1 }
  }
};

let currentUser = null; // Store current authenticated user

function getHistoryStatus(dateStr) {
  if (!state.history || !state.history[dateStr]) return null;
  const entry = state.history[dateStr];
  return typeof entry === 'string' ? entry : entry.status;
}

// Initialize State
async function loadState() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('gotham_state')
    .select('state_data')
    .eq('id', currentUser.id)
    .single();

  if (data && data.state_data) {
    try {
      state = { ...state, ...data.state_data };
      if (!state.history) state.history = {};
      if (state.maxStreak === undefined) state.maxStreak = 0;
      state.maxStreak = Math.max(state.maxStreak, state.streak || 0);
      if (!state.skills) {
        state.skills = {
          mind: { xp: 0, level: 1 },
          body: { xp: 0, level: 1 },
          discipline: { xp: 0, level: 1 },
          career: { xp: 0, level: 1 }
        };
      }
    } catch (e) {
      console.error("Error parsing state data...", e);
    }
  } else {
    // No data yet, initialize the default in the DB
    saveState();
  }

  // Handle muted state sync in audio controller
  batAudio.muted = state.soundMuted;
  updateSoundButtonUI();

  // Reset/Uncheck habits daily
  const todayStr = getTodayString();
  if (state.lastOpenedDate && state.lastOpenedDate !== todayStr) {
    // Log previous day status in history before clearing it
    const prevDateStr = state.lastOpenedDate;
    const tasksYesterday = getTasksForDate(prevDateStr);
    const totalTasksYesterday = tasksYesterday.length;
    const completedTasksYesterday = tasksYesterday.filter(t => t.completed).length;
    
    if (totalTasksYesterday > 0) {
      const histStatus = completedTasksYesterday === totalTasksYesterday ? 'completed' : 'failed';
      state.history[prevDateStr] = {
        status: histStatus,
        tasks: tasksYesterday.map(t => ({ text: t.text, completed: t.completed, category: t.category }))
      };
    }
    
    // Check if they maintained their streak yesterday
    const yesterdayStr = getYesterdayString(todayStr);
    if (state.lastCompletedDate !== yesterdayStr && state.lastCompletedDate !== todayStr) {
      state.streak = 0; // missed completing tasks yesterday, streak broken
    } else if (prevDateStr === yesterdayStr && getHistoryStatus(yesterdayStr) === 'failed') {
      state.streak = 0; // missed completing tasks yesterday, streak broken
    }
    
    // Filter out past one-off tasks and uncheck remaining daily/future tasks
    state.tasks = state.tasks.filter(task => {
      // Keep if it's a daily habit
      if (!task.frequency || task.frequency === 'daily') return true;
      // Keep if it's a one-off task targeted for today or the future
      return task.targetDate && task.targetDate >= todayStr;
    });

    // Uncheck habits for the new day
    state.tasks.forEach(task => {
      task.completed = false;
    });
    state.lastOpenedDate = todayStr;
    saveState();
  } else if (!state.lastOpenedDate) {
    state.lastOpenedDate = todayStr;
    saveState();
  }
}

async function saveState() {
  if (!currentUser) return;
  const { error } = await supabase
    .from('gotham_state')
    .upsert({ 
      id: currentUser.id, 
      state_data: state, 
      updated_at: new Date().toISOString() 
    });
  
  if (error) {
    console.error("Error saving state to Supabase:", error);
  }
}

// --- UTILITIES ---
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTomorrowString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayString(todayStr) {
  const d = new Date(todayStr);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTasksForDate(dateStr) {
  // Legacy tasks without frequency are treated as daily
  return state.tasks.filter(t => !t.frequency || t.frequency === 'daily' || t.targetDate === dateStr);
}

function calculateRank(total) {
  if (total >= 50) return "THE DARK KNIGHT";
  if (total >= 25) return "CAPED CRUSADER";
  if (total >= 12) return "GOTHAM PROTECTOR";
  if (total >= 4) return "VIGILANTE";
  return "RECRUIT";
}

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const btnEnterCave = document.getElementById('btn-enter-cave');
const loginBtnSound = document.getElementById('btn-login-sound');
const loginSoundIcon = document.getElementById('login-sound-icon');
const loginSoundText = document.getElementById('login-sound-text');
const userProfile = document.getElementById('user-profile');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const btnLogout = document.getElementById('btn-logout');
const btnHardReset = document.getElementById('btn-hard-reset');

const todoForm = document.getElementById('todo-form');
const taskInput = document.getElementById('task-input');
const todoList = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');
const taskCounter = document.getElementById('task-counter');
const syncPercentage = document.getElementById('sync-percentage');
const syncLabel = document.getElementById('sync-label');

const fillStop1 = document.getElementById('fill-stop-1');
const fillStop2 = document.getElementById('fill-stop-2');
const logoContainer = document.getElementById('logo-container');

const btnSound = document.getElementById('btn-sound');
const btnReboot = document.getElementById('btn-reboot');
const soundIcon = document.getElementById('sound-icon');
const soundText = document.getElementById('sound-text');

const streakValue = document.getElementById('streak-value');
const securedValue = document.getElementById('secured-value');
const maxStreakValue = document.getElementById('max-streak-value');

const quoteText = document.getElementById('quote-text');
const quoteAuthor = document.getElementById('quote-author');
const quoteContainer = document.getElementById('quote-container');

// Terminal Quote Feed Selectors
const terminalQuoteText = document.getElementById('terminal-quote-text');
const terminalQuoteAuthor = document.getElementById('terminal-quote-author');
const terminalQuoteContainer = document.getElementById('terminal-quote-container');

const celebrationCanvas = document.getElementById('celebration-canvas');
const celebrationOverlay = document.getElementById('celebration-overlay');
const btnOverlayClose = document.getElementById('btn-overlay-close');
const overlayQuoteText = document.getElementById('overlay-quote-text');

// Day Report Overlay
const dayReportOverlay = document.getElementById('day-report-overlay');
const dayReportTitle = document.getElementById('day-report-title');
const dayReportStatus = document.getElementById('day-report-status');
const btnDayReportClose = document.getElementById('btn-day-report-close');

// Calendar & Timer Elements
const btnPrevMonth = document.getElementById('btn-prev-month');
const btnNextMonth = document.getElementById('btn-next-month');
const calendarMonthYear = document.getElementById('calendar-month-year');
const calendarDaysGrid = document.getElementById('calendar-days-grid');
const patrolCountdown = document.getElementById('patrol-countdown');

// Armory Elements
const armoryGrid = document.getElementById('armory-grid');
const armoryUnlocksCount = document.getElementById('armory-unlocks-count');

// Skills & Category elements
const taskFrequencySelect = document.getElementById('task-frequency');
const taskCategorySelect = document.getElementById('task-category');
const skillsContainer = document.getElementById('skills-container');

// Mission Report Elements
const mrObjectives = document.getElementById('mr-objectives');
const mrXp = document.getElementById('mr-xp');
const mrStats = document.getElementById('mr-stats');
const mrStreak = document.getElementById('mr-streak');

// Analytics Elements
const analyticsTotalDays = document.getElementById('analytics-total-days');
const analyticsSuccessDays = document.getElementById('analytics-success-days');
const analyticsWinRate = document.getElementById('analytics-win-rate');
const analyticsTotalXp = document.getElementById('analytics-total-xp');

// --- RENDERING OBJECTIVES ---
function renderTasks() {
  todoList.innerHTML = '';
  
  const todayTasks = getTasksForDate(getTodayString());
  
  if (todayTasks.length === 0) {
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
    
    todayTasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item';
      li.dataset.id = task.id;
      
      const badgeMap = {
        mind: '<span class="task-badge badge-mind">🧠 MIND</span>',
        body: '<span class="task-badge badge-body">⚡ BODY</span>',
        discipline: '<span class="task-badge badge-discipline">🛡️ DISCIPLINE</span>',
        career: '<span class="task-badge badge-career">💻 CAREER</span>'
      };
      const badgeHtml = badgeMap[task.category] || badgeMap['discipline'];
      
      li.innerHTML = `
        <label class="task-checkbox-container">
          <input type="checkbox" ${task.completed ? 'checked' : ''}>
          <span class="bat-checkbox"></span>
          <span class="task-text">${badgeHtml}${escapeHTML(task.text)}</span>
        </label>
        <button class="btn-delete-task" title="ABORT OBJECTIVE">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      
      // Checkbox event
      const checkbox = li.querySelector('input');
      checkbox.addEventListener('change', (e) => {
        toggleTask(task.id, e.target.checked);
      });
      
      // Delete button event
      const btnDelete = li.querySelector('.btn-delete-task');
      btnDelete.addEventListener('click', () => {
        deleteTask(task.id, li);
      });
      
      todoList.appendChild(li);
    });
  }
  
  updateProgressHUD();
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// --- TASK INTERACTIONS ---
function addTask(text) {
  const category = taskCategorySelect ? taskCategorySelect.value : 'discipline';
  const frequency = taskFrequencySelect ? taskFrequencySelect.value : 'daily';
  
  let targetDate = null;
  if (frequency === 'today') {
    targetDate = getTodayString();
  } else if (frequency === 'tomorrow') {
    targetDate = getTomorrowString();
  }
  
  const newTask = {
    id: Date.now().toString(),
    text: text.trim(),
    completed: false,
    category: category,
    frequency: frequency,
    targetDate: targetDate
  };
  
  state.tasks.push(newTask);
  saveState();
  
  batAudio.playClick();
  renderTasks();
}

function toggleTask(id, completed) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    const wasCompleted = task.completed;
    task.completed = completed;
    
    const category = task.category || 'discipline';
    
    if (completed && !wasCompleted) {
      state.totalSecured++;
      batAudio.playCheck();
      
      // Earn XP (+25 XP)
      if (!state.skills) {
        state.skills = { mind: { xp: 0, level: 1 }, body: { xp: 0, level: 1 }, discipline: { xp: 0, level: 1 }, career: { xp: 0, level: 1 } };
      }
      let skillObj = state.skills[category];
      skillObj.xp += 25;
      const xpNeeded = skillObj.level * 100;
      if (skillObj.xp >= xpNeeded) {
        skillObj.xp -= xpNeeded;
        skillObj.level++;
        triggerLevelUpEffect(category, skillObj.level);
      }
    } else if (!completed && wasCompleted) {
      state.totalSecured = Math.max(0, state.totalSecured - 1);
      batAudio.playUncheck();
      
      // Deduct XP on uncheck
      if (state.skills && state.skills[category]) {
        let skillObj = state.skills[category];
        skillObj.xp -= 25;
        if (skillObj.xp < 0) {
          if (skillObj.level > 1) {
            skillObj.level--;
            skillObj.xp = (skillObj.level * 100) + skillObj.xp;
          } else {
            skillObj.xp = 0;
          }
        }
      }

      // Revert streak if we unchecked today's completed status
      const todayStr = getTodayString();
      if (state.lastCompletedDate === todayStr) {
        state.streak = Math.max(0, state.streak - 1);
        state.lastCompletedDate = getYesterdayString(todayStr);
      }
    }
    
    saveState();
    updateProgressHUD();
    
    // Check if Vengeance Protocol is triggered (100% completion)
    checkVengeanceProtocol();
  }
}

function deleteTask(id, element) {
  batAudio.playWarning();
  
  // Slide item out before deleting
  element.style.opacity = '0';
  element.style.transform = 'translateX(-20px) scaleY(0)';
  element.style.transition = 'all 0.3s ease';
  
  setTimeout(() => {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
    renderTasks();
    checkVengeanceProtocol();
  }, 250);
}

// --- PROGRESS & HUD SYNC ---
function updateProgressHUD() {
  const todayTasks = getTasksForDate(getTodayString());
  const total = todayTasks.length;
  const completed = todayTasks.filter(t => t.completed).length;
  
  // Counters
  taskCounter.textContent = `${completed}/${total} SECURED`;
  securedValue.textContent = `${state.totalSecured} SECURED`;
  streakValue.textContent = `${state.streak} ${state.streak === 1 ? 'DAY' : 'DAYS'}`;
  if (maxStreakValue) {
    maxStreakValue.textContent = `${state.maxStreak || 0} ${(state.maxStreak || 0) === 1 ? 'DAY' : 'DAYS'}`;
  }
  
  // Percentage & Label
  const ratio = total > 0 ? completed / total : 0;
  const percentage = Math.round(ratio * 100);
  
  syncPercentage.textContent = `${percentage}%`;
  
  if (total === 0) {
    syncLabel.textContent = "SYSTEM CORE STANDBY";
  } else if (percentage === 100) {
    syncLabel.textContent = "VENGEANCE PROTOCOL SECURED";
  } else if (percentage > 50) {
    syncLabel.textContent = "BAT-CORE INTEGRITY HIGH";
  } else {
    syncLabel.textContent = "BAT-CORE SYNCING...";
  }
  
  // Update today's history entry in real-time
  const todayStr = getTodayString();
  if (total > 0) {
    const histStatus = completed === total ? 'completed' : 'failed';
    state.history[todayStr] = {
      status: histStatus,
      tasks: todayTasks.map(t => ({ text: t.text, completed: t.completed, category: t.category }))
    };
  } else {
    // If no tasks, today has no activity status
    delete state.history[todayStr];
  }
  saveState();
  
  // Bat Logo Fill Update
  // We use a slight 2% feather offset to create a premium glow gradient line
  const stopVal1 = Math.max(0, percentage - 1);
  const stopVal2 = percentage;
  
  fillStop1.setAttribute('offset', `${stopVal1}%`);
  fillStop2.setAttribute('offset', `${stopVal2}%`);
  
  // Glow intensity
  if (percentage > 0) {
    logoContainer.classList.add('bat-glow-active');
  } else {
    logoContainer.classList.remove('bat-glow-active');
  }

  // Refresh calendar, and skills views
  renderCalendar();
  renderSkills();
  renderAnalytics();
}

// --- THE VENGEANCE PROTOCOL Celebration ---
let particlesActive = false;
let batParticles = [];

class FlyingBat {
  constructor(canvas) {
    this.canvas = canvas;
    this.reset(true);
  }
  
  reset(fromBottom = false) {
    this.x = Math.random() * this.canvas.width;
    this.y = fromBottom 
      ? this.canvas.height + Math.random() * 100 
      : Math.random() * this.canvas.height;
    this.size = 12 + Math.random() * 24;
    this.speedX = -2.5 + Math.random() * 5;
    this.speedY = -(3 + Math.random() * 6);
    this.wingSpeed = 0.2 + Math.random() * 0.2;
    this.wingPhase = Math.random() * Math.PI * 2;
    this.opacity = 0.4 + Math.random() * 0.6;
  }
  
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.wingPhase += this.wingSpeed;
    
    // Flutter drift
    this.speedX += (Math.random() - 0.5) * 0.5;
    this.speedX = Math.max(-5, Math.min(5, this.speedX));
    
    // Reset if out of bounds
    if (this.y < -50 || this.x < -50 || this.x > this.canvas.width + 50) {
      this.reset(true);
    }
  }
  
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 179, 0, ${this.opacity * 0.95})`;
    ctx.shadowColor = 'rgba(255, 179, 0, 0.8)';
    ctx.shadowBlur = 10;
    
    const x = this.x;
    const y = this.y;
    const size = this.size;
    const wingFactor = Math.sin(this.wingPhase);
    const wingWidth = size * Math.max(0.2, Math.abs(wingFactor));
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Curved wing silhouette
    ctx.quadraticCurveTo(x - wingWidth * 0.5, y - size * 0.4, x - wingWidth, y - size * 0.1);
    ctx.quadraticCurveTo(x - wingWidth * 0.6, y + size * 0.1, x - size * 0.2, y + size * 0.3);
    ctx.quadraticCurveTo(x - size * 0.1, y + size * 0.2, x, y + size * 0.6); // tail
    
    ctx.quadraticCurveTo(x + size * 0.1, y + size * 0.2, x + size * 0.2, y + size * 0.3);
    ctx.quadraticCurveTo(x + wingWidth * 0.6, y + size * 0.1, x + wingWidth, y - size * 0.1);
    ctx.quadraticCurveTo(x + wingWidth * 0.5, y - size * 0.4, x, y);
    
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function initBatCanvas() {
  celebrationCanvas.width = window.innerWidth;
  celebrationCanvas.height = window.innerHeight;
  
  batParticles = [];
  // Spawn 45 bats
  for (let i = 0; i < 45; i++) {
    batParticles.push(new FlyingBat(celebrationCanvas));
  }
}

function runCelebrationLoop() {
  if (!particlesActive) return;
  
  const ctx = celebrationCanvas.getContext('2d');
  ctx.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
  
  batParticles.forEach(bat => {
    bat.update();
    bat.draw(ctx);
  });
  
  requestAnimationFrame(runCelebrationLoop);
}

function triggerCelebration() {
  // Calculate Mission Report stats
  const todayTasks = getTasksForDate(getTodayString());
  const total = todayTasks.length;
  const xpEarned = total * 25;
  
  const categoryCounts = { mind: 0, body: 0, discipline: 0, career: 0 };
  todayTasks.forEach(t => {
    if (t.completed && t.category) {
      categoryCounts[t.category]++;
    }
  });

  let statsHtml = '';
  if (categoryCounts.mind > 0) statsHtml += `<span class="stat-gain-badge mind">+${categoryCounts.mind} Mind</span>`;
  if (categoryCounts.body > 0) statsHtml += `<span class="stat-gain-badge body">+${categoryCounts.body} Body</span>`;
  if (categoryCounts.discipline > 0) statsHtml += `<span class="stat-gain-badge discipline">+${categoryCounts.discipline} Discipline</span>`;
  if (categoryCounts.career > 0) statsHtml += `<span class="stat-gain-badge career">+${categoryCounts.career} Career</span>`;
  
  if (!statsHtml) statsHtml = '--';

  // Populate Mission Report
  if (mrObjectives) mrObjectives.textContent = total;
  if (mrXp) mrXp.textContent = xpEarned;
  if (mrStats) mrStats.innerHTML = statsHtml;
  if (mrStreak) mrStreak.textContent = `${state.streak} DAYS`;

  // 1. Audio synth triggers
  batAudio.playVengeanceSound();
  
  // 2. Setup text-to-speech voice
  speakBatmanVoice();
  
  // 3. Canvas animation start
  celebrationCanvas.style.display = 'block';
  particlesActive = true;
  initBatCanvas();
  runCelebrationLoop();
  
  // 4. Glitch Overlay activation
  if (overlayQuoteText) {
    // overlayQuoteText.textContent is now removed or not used since we replaced the HTML with the dashboard.
    // We can just skip setting it.
  }
  celebrationOverlay.style.display = 'flex';
  setTimeout(() => {
    celebrationOverlay.classList.add('visible');
  }, 50);
}

function stopCelebration() {
  particlesActive = false;
  celebrationCanvas.style.display = 'none';
  celebrationOverlay.classList.remove('visible');
  setTimeout(() => {
    celebrationOverlay.style.display = 'none';
  }, 800);
}

// Synth voice configuration for deep intimidating modulator effect
function speakBatmanVoice() {
  if ('speechSynthesis' in window) {
    // Cancel active speaker
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance("I am vengeance. I am the night. I am Batman!");
    
    // Fetch system voices
    const voices = window.speechSynthesis.getVoices();
    
    // Prefer a deeper english voice if available
    let chosenVoice = null;
    const deepVoiceKeywords = ['google uk english male', 'microsoft david', 'male', 'en-us', 'en-gb'];
    
    for (const key of deepVoiceKeywords) {
      chosenVoice = voices.find(v => v.name.toLowerCase().includes(key) && v.lang.startsWith('en'));
      if (chosenVoice) break;
    }
    
    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }
    
    // Make it sound dark and robotic / modulating
    utterance.pitch = 0.55;  // Low pitch
    utterance.rate = 0.75;   // Slower delivery
    utterance.volume = 1.0;
    
    window.speechSynthesis.speak(utterance);
  }
}

// Check if all objectives are completed
function checkVengeanceProtocol() {
  const todayTasks = getTasksForDate(getTodayString());
  const total = todayTasks.length;
  const completed = todayTasks.filter(t => t.completed).length;
  
  if (total > 0 && completed === total) {
    const todayStr = getTodayString();
    
    // Check if they completed all tasks today already (to prevent double streak counting)
    if (state.lastCompletedDate !== todayStr) {
      // Calculate streak
      const yesterdayStr = getYesterdayString(todayStr);
      if (state.lastCompletedDate === yesterdayStr) {
        state.streak++;
      } else {
        state.streak = 1; // start new streak
      }
      
      if (state.maxStreak === undefined) state.maxStreak = 0;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
      
      state.lastCompletedDate = todayStr;
      saveState();
      updateProgressHUD();
    }
    
    // Trigger flying bats and vocal overlays immediately inside the user gesture
    triggerCelebration();
  }
}

// --- UTILITY CONTROLS ---
function updateSoundButtonUI() {
  const isMuted = state.soundMuted;
  if (soundIcon && soundText && btnSound) {
    if (isMuted) {
      soundIcon.className = "fa-solid fa-volume-xmark cmd-icon";
      soundText.textContent = "SOUND OFF";
      btnSound.classList.remove('active');
    } else {
      soundIcon.className = "fa-solid fa-volume-high cmd-icon";
      soundText.textContent = "SOUND ON";
      btnSound.classList.add('active');
    }
  }
  if (loginSoundIcon && loginSoundText && loginBtnSound) {
    if (isMuted) {
      loginSoundIcon.className = "fa-solid fa-volume-xmark";
      loginSoundText.textContent = "SOUND OFF";
      loginBtnSound.classList.add('muted');
    } else {
      loginSoundIcon.className = "fa-solid fa-volume-high";
      loginSoundText.textContent = "SOUND ON";
      loginBtnSound.classList.remove('muted');
    }
  }
}

function displayRandomQuote() {
  const randIndex = Math.floor(Math.random() * BATMAN_QUOTES.length);
  const quote = BATMAN_QUOTES[randIndex];
  
  // Fade out effect
  quoteText.style.opacity = '0';
  quoteAuthor.style.opacity = '0';
  quoteText.style.transition = 'opacity 0.3s ease';
  quoteAuthor.style.transition = 'opacity 0.3s ease';
  
  setTimeout(() => {
    quoteText.textContent = `"${quote.text}"`;
    quoteAuthor.textContent = `— ${quote.author}`;
    quoteText.style.opacity = '1';
    quoteAuthor.style.opacity = '1';
  }, 300);
}

function displayTerminalQuote() {
  if (!terminalQuoteText || !terminalQuoteAuthor) return;
  const randIndex = Math.floor(Math.random() * TERMINAL_QUOTES.length);
  const quote = TERMINAL_QUOTES[randIndex];
  
  // Fade out effect
  terminalQuoteText.style.opacity = '0';
  terminalQuoteAuthor.style.opacity = '0';
  terminalQuoteText.style.transition = 'opacity 0.3s ease';
  terminalQuoteAuthor.style.transition = 'opacity 0.3s ease';
  
  setTimeout(() => {
    terminalQuoteText.textContent = `"${quote.text}"`;
    terminalQuoteAuthor.textContent = `— ${quote.author}`;
    terminalQuoteText.style.opacity = '1';
    terminalQuoteAuthor.style.opacity = '1';
  }, 300);
}

// --- WINDOW EVENTS & INITIALIZATION ---

// Task Form Submit
todoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = taskInput.value;
  if (text.trim()) {
    addTask(text);
    taskInput.value = '';
  }
});

// Handle clicks on empty state suggested missions and the initiate patrol button
document.addEventListener('click', (e) => {
  const pill = e.target.closest('.mission-pill');
  if (pill) {
    const text = pill.dataset.mission;
    const category = pill.dataset.category;
    if (text) {
      if (taskCategorySelect) {
        taskCategorySelect.value = category;
      }
      addTask(text);
    }
  }

  const initiateBtn = e.target.closest('#btn-initiate-patrol');
  if (initiateBtn) {
    if (taskInput) {
      taskInput.focus();
      taskInput.classList.add('pulse-highlight');
      setTimeout(() => {
        taskInput.classList.remove('pulse-highlight');
      }, 1000);
    }
  }
});

// Sound Toggle Button
btnSound.addEventListener('click', () => {
  const isMuted = batAudio.toggleMute();
  state.soundMuted = isMuted;
  saveState();
  updateSoundButtonUI();
  batAudio.playClick();
});

// Reboot Button (Confirms wipe of completed objectives or full system)
btnReboot.addEventListener('click', () => {
  batAudio.playWarning();
  const confirmWipe = confirm("SYS WARNING: DO YOU WISH TO PURGE COMPLETED OBJECTIVES FROM YOUR LOGS?");
  if (confirmWipe) {
    // Keep uncompleted, discard completed for today
    state.tasks = state.tasks.filter(t => {
      const isToday = !t.frequency || t.frequency === 'daily' || t.targetDate === getTodayString();
      if (isToday) {
        return !t.completed;
      }
      return true; // Keep tasks not for today
    });
    saveState();
    renderTasks();
  }
});

// Close Overlay Button
btnOverlayClose.addEventListener('click', () => {
  batAudio.playClick();
  stopCelebration();
});

if (btnDayReportClose) {
  btnDayReportClose.addEventListener('click', () => {
    dayReportOverlay.style.display = 'none';
    batAudio.playClick();
  });
}

// Click quote panel to cycle quotes
quoteContainer.addEventListener('click', () => {
  batAudio.playClick();
  displayRandomQuote();
});

// Click terminal quote panel to cycle quotes
if (terminalQuoteContainer) {
  terminalQuoteContainer.addEventListener('click', () => {
    batAudio.playClick();
    displayTerminalQuote();
  });
}

// Window resize for particles canvas
window.addEventListener('resize', () => {
  if (particlesActive) {
    celebrationCanvas.width = window.innerWidth;
    celebrationCanvas.height = window.innerHeight;
  }
});

// Setup voices array update for Speech Synthesis (required on chrome/safari)
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    // forces voice index loads
  };
}

// --- CALENDAR & TIMER PATROL CONTROLLER ---
let currentCalDate = new Date();

function applyHistoryClass(element, dateStr) {
  const status = getHistoryStatus(dateStr);
  if (status) {
    if (status === 'completed') {
      element.classList.add('completed');
      element.title = "Patrol Secured 🦇";
    } else if (status === 'failed') {
      element.classList.add('failed');
      element.title = "Patrol Missed ⚠️";
    }
  }
}

function showDayReport(dateStr) {
  const todayStr = getTodayString();
  if (dateStr > todayStr) {
    batAudio.playWarning();
    return;
  }
  
  if (dayReportTitle) {
    dayReportTitle.textContent = `PATROL LOG: ${dateStr}`;
  }
  
  const tasksList = document.getElementById('day-report-tasks-list');
  if (tasksList) tasksList.innerHTML = '';
  
  if (dayReportStatus) {
    const entry = state.history && state.history[dateStr] ? state.history[dateStr] : null;
    const status = getHistoryStatus(dateStr);
    
    if (status) {
      if (status === 'completed') {
        dayReportStatus.textContent = 'SECURED';
        dayReportStatus.style.color = 'var(--color-yellow)';
      } else {
        dayReportStatus.textContent = 'MISSED';
        dayReportStatus.style.color = '#ff3333';
      }
      
      if (tasksList && typeof entry === 'object' && entry.tasks) {
        entry.tasks.forEach(t => {
          const li = document.createElement('li');
          li.style.padding = '8px 0';
          li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
          li.style.color = t.completed ? 'var(--color-text-main)' : 'var(--color-text-muted)';
          li.style.display = 'flex';
          li.style.alignItems = 'center';
          li.style.gap = '10px';
          li.style.fontFamily = 'var(--font-ui)';
          li.style.fontSize = '0.9rem';
          li.innerHTML = `<i class="fa-solid ${t.completed ? 'fa-check' : 'fa-xmark'}" style="color: ${t.completed ? 'var(--color-yellow)' : '#ff3333'}; width: 16px; text-align: center;"></i> <span>${t.text}</span>`;
          tasksList.appendChild(li);
        });
      }
    } else {
      dayReportStatus.textContent = 'NO ACTIVITY';
      dayReportStatus.style.color = 'var(--color-text-main)';
    }
  }
  
  if (dayReportOverlay) {
    dayReportOverlay.style.display = 'flex';
  }
  batAudio.playClick();
}

function renderCalendar() {
  if (!calendarMonthYear || !calendarDaysGrid) return;

  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  calendarMonthYear.textContent = `${monthNames[month]} ${year}`;

  calendarDaysGrid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const startDayIndex = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevTotalDays = new Date(year, month, 0).getDate();

  // Trails from previous month
  for (let i = startDayIndex - 1; i >= 0; i--) {
    const dayNum = prevTotalDays - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.textContent = dayNum;
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => showDayReport(dateStr));
    applyHistoryClass(cell, dateStr);
    calendarDaysGrid.appendChild(cell);
  }

  // Days in current month
  const todayStr = getTodayString();
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    cell.textContent = day;
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => showDayReport(dateStr));

    if (dateStr === todayStr) {
      cell.classList.add('today');
    }

    applyHistoryClass(cell, dateStr);
    calendarDaysGrid.appendChild(cell);
  }

  // Trails for next month
  const cellsRendered = startDayIndex + totalDays;
  const nextDaysNeeded = (7 - (cellsRendered % 7)) % 7;
  for (let day = 1; day <= nextDaysNeeded; day++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.textContent = day;
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => showDayReport(dateStr));
    applyHistoryClass(cell, dateStr);
    calendarDaysGrid.appendChild(cell);
  }
}

function startPatrolCountdown() {
  function update() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);

    const diff = midnight - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (patrolCountdown) {
      patrolCountdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }

  update();
  setInterval(update, 1000);
}

// Calendar Navigation
btnPrevMonth.addEventListener('click', () => {
  batAudio.playClick();
  currentCalDate.setMonth(currentCalDate.getMonth() - 1);
  renderCalendar();
});

btnNextMonth.addEventListener('click', () => {
  batAudio.playClick();
  currentCalDate.setMonth(currentCalDate.getMonth() + 1);
  renderCalendar();
});

// Warm up and resume AudioContext on first user interaction to satisfy browser security
const warmUpAudio = () => {
  batAudio.init();
  document.removeEventListener('click', warmUpAudio);
  document.removeEventListener('touchstart', warmUpAudio);
  document.removeEventListener('keydown', warmUpAudio);
};
document.addEventListener('click', warmUpAudio);
document.addEventListener('touchstart', warmUpAudio);
document.addEventListener('keydown', warmUpAudio);

// --- BATCAVE ARMORY CONTROLLER ---
function renderArmory() {
  if (!armoryGrid || !armoryUnlocksCount) return;

  armoryGrid.innerHTML = '';
  let unlockedCount = 0;

  ARMORY_ITEMS.forEach(item => {
    const isUnlocked = state.streak >= item.targetStreak;
    if (isUnlocked) unlockedCount++;

    const card = document.createElement('div');
    card.className = `armory-item ${isUnlocked ? 'unlocked' : 'locked'}`;
    
    card.innerHTML = `
      <div class="lock-badge"><i class="fa-solid ${isUnlocked ? 'fa-lock-open' : 'fa-lock'}"></i></div>
      <div class="armory-icon-box">
        <i class="fa-solid ${item.icon}"></i>
      </div>
      <div class="armory-name">${item.name}</div>
      <div class="armory-desc">${item.desc}</div>
      <div class="armory-status">${isUnlocked ? 'SECURED' : `STREAK: ${state.streak}/${item.targetStreak}D`}</div>
    `;

    // Click handler for unlocked lore readings on console HUD
    if (isUnlocked) {
      card.addEventListener('click', () => {
        batAudio.playCheck(); // futuristic chime confirmation
        
        // Render gadget data in top quote box
        quoteText.style.opacity = '0';
        quoteAuthor.style.opacity = '0';
        quoteText.style.transition = 'opacity 0.3s ease';
        quoteAuthor.style.transition = 'opacity 0.3s ease';
        
        setTimeout(() => {
          quoteText.textContent = `"${item.lore}"`;
          quoteAuthor.textContent = `— BATCOMPUTER ARMORY LOG // UNLOCKED`;
          quoteText.style.opacity = '1';
          quoteAuthor.style.opacity = '1';
        }, 300);
      });
    }

    armoryGrid.appendChild(card);
  });

  armoryUnlocksCount.textContent = `${unlockedCount}/5 SECURED`;
}

// --- VIGILANTE SKILL TREE CONTROLLER ---
function renderSkills() {
  if (!skillsContainer) return;

  skillsContainer.innerHTML = '';

  const skillNames = {
    mind: { name: '🧠 Mind', desc: 'Reading, studying, and learning', color: 'fill-mind' },
    body: { name: '⚡ Body', desc: 'Workout, fitness, and running', color: 'fill-body' },
    discipline: { name: '🛡️ Discipline', desc: 'Consistency, habits, and focus', color: 'fill-discipline' },
    career: { name: '💻 Career', desc: 'Coding, projects, and work', color: 'fill-career' }
  };

  if (!state.skills) {
    state.skills = {
      mind: { xp: 0, level: 1 },
      body: { xp: 0, level: 1 },
      discipline: { xp: 0, level: 1 },
      career: { xp: 0, level: 1 }
    };
  }

  Object.keys(state.skills).forEach(key => {
    const skill = state.skills[key];
    const meta = skillNames[key];
    const xpNeeded = skill.level * 100;
    const progressPercent = Math.min(100, (skill.xp / xpNeeded) * 100);

    const skillRow = document.createElement('div');
    skillRow.className = 'skill-row';
    skillRow.innerHTML = `
      <div class="skill-meta">
        <span class="skill-name">${meta.name}</span>
        <span class="skill-level">Lvl ${skill.level}</span>
      </div>
      <div class="skill-bar-bg" title="${meta.desc}">
        <div class="skill-bar-fill ${meta.color}" style="width: ${progressPercent}%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.65rem; margin-top: 1px;">
        <span class="skill-xp-text">${meta.desc}</span>
        <span class="skill-xp-text">${skill.xp} / ${xpNeeded} XP</span>
      </div>
    `;

    skillsContainer.appendChild(skillRow);
  });
}

function triggerLevelUpEffect(category, newLevel) {
  // Plays level-up beeps
  batAudio.playClick();
  setTimeout(() => {
    batAudio.playCheck();
  }, 100);

  // Flash Level Up in top console HUD
  const catNames = { mind: 'MIND', body: 'BODY', discipline: 'DISCIPLINE', career: 'CAREER' };
  const name = catNames[category] || 'VIGILANTE';
  
  quoteText.style.opacity = '0';
  quoteAuthor.style.opacity = '0';
  quoteText.style.transition = 'opacity 0.3s ease';
  quoteAuthor.style.transition = 'opacity 0.3s ease';

  setTimeout(() => {
    quoteText.textContent = `CRITICAL ALERT // VIGILANTE SKILLS LOG: YOUR ${name} ATTRIBUTE HAS LEVELED UP TO LEVEL ${newLevel}!`;
    quoteAuthor.textContent = `— BATCOMPUTER TRAINING MODULE // LEVEL SECURED`;
    quoteText.style.opacity = '1';
    quoteAuthor.style.opacity = '1';
  }, 300);
}

// --- OVERALL HISTORY ANALYTICS CONTROLLER ---
function renderAnalytics() {
  if (!analyticsTotalDays) return;

  const dates = Object.keys(state.history);
  const totalDays = dates.length;
  
  let successDays = 0;
  dates.forEach(d => {
    if (getHistoryStatus(d) === 'completed') {
      successDays++;
    }
  });

  const winRate = totalDays > 0 ? Math.round((successDays / totalDays) * 100) : 0;

  let totalXp = 0;
  if (state.skills) {
    Object.keys(state.skills).forEach(key => {
      const s = state.skills[key];
      // Total XP includes past levels (level - 1) * 100 + current xp
      totalXp += ((s.level - 1) * 100) + s.xp;
    });
  }

  analyticsTotalDays.textContent = totalDays;
  analyticsSuccessDays.textContent = successDays;
  analyticsWinRate.textContent = `${winRate}%`;
  analyticsTotalXp.textContent = totalXp;
}

// --- AUTH & STARTUP LOGIC ---
async function initApp() {
  // Check active session
  const { data: { session } } = await supabase.auth.getSession();
  
  // Listen for auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      await handleAuthChange(session);
    } else if (event === 'SIGNED_OUT') {
      await handleAuthChange(null);
    }
  });
  
  await handleAuthChange(session);
}

// --- LOGIN BACKGROUND PARTICLES ---
let loginParticlesActive = false;
let loginParticlesList = [];
let loginParticlesCanvas = null;
let loginParticlesCtx = null;
let resizeListener = null;

class LoginParticle {
  constructor(canvas) {
    this.canvas = canvas;
    this.reset();
    this.y = Math.random() * canvas.height;
  }
  
  reset() {
    this.x = Math.random() * this.canvas.width;
    this.y = this.canvas.height + Math.random() * 20;
    this.size = 1 + Math.random() * 2.2;
    this.speedX = -0.4 + Math.random() * 0.8;
    this.speedY = -(0.3 + Math.random() * 0.9);
    this.opacity = 0.15 + Math.random() * 0.45;
    this.color = Math.random() > 0.45 ? 'rgba(255, 179, 0, ' : 'rgba(226, 232, 240, ';
  }
  
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    
    if (this.y < -10 || this.x < -10 || this.x > this.canvas.width + 10) {
      this.reset();
    }
  }
  
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color + this.opacity + ')';
    ctx.fill();
  }
}

function initLoginParticles() {
  loginParticlesCanvas = document.getElementById('login-particles');
  if (!loginParticlesCanvas) return;
  
  loginParticlesCtx = loginParticlesCanvas.getContext('2d');
  
  const resizeCanvas = () => {
    if (loginParticlesCanvas) {
      loginParticlesCanvas.width = window.innerWidth;
      loginParticlesCanvas.height = window.innerHeight;
    }
  };
  resizeCanvas();
  
  if (!resizeListener) {
    resizeListener = resizeCanvas;
    window.addEventListener('resize', resizeListener);
  }
  
  loginParticlesList = [];
  for (let i = 0; i < 55; i++) {
    loginParticlesList.push(new LoginParticle(loginParticlesCanvas));
  }
  
  if (!loginParticlesActive) {
    loginParticlesActive = true;
    runLoginParticlesLoop();
  }
}

function runLoginParticlesLoop() {
  if (!loginParticlesActive || !loginParticlesCtx || !loginParticlesCanvas) return;
  
  loginParticlesCtx.clearRect(0, 0, loginParticlesCanvas.width, loginParticlesCanvas.height);
  
  loginParticlesList.forEach(particle => {
    particle.update();
    particle.draw(loginParticlesCtx);
  });
  
  requestAnimationFrame(runLoginParticlesLoop);
}

function stopLoginParticles() {
  loginParticlesActive = false;
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener);
    resizeListener = null;
  }
}

// Choice Selection for Login Random Quote
function displayLoginRandomQuote() {
  const loginQuoteText = document.getElementById('login-quote-text');
  const loginQuoteAuthor = document.getElementById('login-quote-author');
  if (!loginQuoteText || !loginQuoteAuthor) return;
  
  const randIndex = Math.floor(Math.random() * BATMAN_QUOTES.length);
  const quote = BATMAN_QUOTES[randIndex];
  
  loginQuoteText.textContent = `"${quote.text}"`;
  loginQuoteAuthor.textContent = `— ${quote.author}`;
}

async function handleAuthChange(session) {
  // Always load state so that the mute preference is retrieved and synced immediately
  loadState();

  if (session) {
    currentUser = session.user;
    // User is logged in
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    userProfile.style.display = 'flex';
    
    stopLoginParticles();
    
    // Set user profile info
    const userMetadata = session.user.user_metadata;
    userAvatar.src = userMetadata.avatar_url || 'https://via.placeholder.com/32?text=B';
    userName.textContent = userMetadata.full_name || 'VIGILANTE';
    
    renderTasks();
    displayRandomQuote();
    displayTerminalQuote();
    startPatrolCountdown();
    renderCalendar();
    renderArmory();
    renderSkills();
    renderAnalytics();
  } else {
    currentUser = null;
    // User is not logged in
    dashboardView.style.display = 'none';
    loginView.style.display = 'flex';
    userProfile.style.display = 'none';
    
    displayLoginRandomQuote();
    initLoginParticles();
  }
}

// Bind Auth & Login Sound Buttons
if (btnEnterCave) {
  btnEnterCave.addEventListener('click', async () => {
    batAudio.playClick();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) console.error("Error logging in:", error.message);
  });
}

if (loginBtnSound) {
  loginBtnSound.addEventListener('click', () => {
    const isMuted = batAudio.toggleMute();
    state.soundMuted = isMuted;
    saveState();
    updateSoundButtonUI();
    batAudio.playClick();
  });
}

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error logging out:", error.message);
  });
}

if (btnHardReset) {
  btnHardReset.addEventListener('click', async () => {
    if (confirm("SYS WARNING: THIS WILL PURGE ALL YOUR PROGRESS AND OBJECTIVES. INITIATE COMPLETE CLEAN?")) {
      state = {
        tasks: [],
        streak: 0,
        totalSecured: 0,
        lastCompletedDate: null,
        lastOpenedDate: null,
        soundMuted: false,
        history: {},
        skills: {
          mind: { xp: 0, level: 1 },
          body: { xp: 0, level: 1 },
          discipline: { xp: 0, level: 1 },
          career: { xp: 0, level: 1 }
        }
      };
      await saveState();
      window.location.reload();
    }
  });
}

// Start the app
initApp();

