/* ==========================================================================
   REVIEW GAME GROUP C - 2026 — COMPLETE GAME LOGIC
   Refined & production-ready
   ========================================================================== */

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_TEAMS = [
  { name: 'Lion', logo: 'lion.png' },
  { name: 'Lioness', logo: 'lioness.png' }
];

function assetPath(path) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http')) return path;
  if (path.startsWith('public/')) return path.substring(7);
  return path;
}

// Team colour palette (cycling)
const TEAM_COLORS = [
  { bg: 'rgba(56,217,245,0.14)', border: 'rgba(56,217,245,0.45)', text: 'var(--color-team1)' },
  { bg: 'rgba(255,107,157,0.14)', border: 'rgba(255,107,157,0.45)', text: 'var(--color-team2)' },
  { bg: 'rgba(126,232,162,0.14)', border: 'rgba(126,232,162,0.45)', text: 'var(--color-team3)' },
  { bg: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.45)', text: 'var(--color-team4)' },
  { bg: 'rgba(251,165,116,0.14)', border: 'rgba(251,165,116,0.45)', text: 'var(--color-team5)' },
  { bg: 'rgba(244,114,182,0.14)', border: 'rgba(244,114,182,0.45)', text: 'var(--color-team6)' },
];

const TEAM_ICONS = ['⚔️', '🌸', '🦁', '👑', '🔥', '💎'];

// ============================================================
// STATE
// ============================================================
let db = {
  settings: {
    subtractOnWrong: true,
    totalQuestions: 12,
    displayMode: 'QUESTION_POINTS',
    timerDuration: 10,
    enableTimer: true,
    gridFont: 'none',
    applyFontToAll: false,
    playVideoFeedback: false,
    useCustomFeedbackVideos: false,
    enableTieBreaker: false,
    gridFontColor: '#ffffff',
    gridFontBold: false
  },
  questions: [], // each: { id, qnIndex, type, question, options, answer, points }
  teams: [...DEFAULT_TEAMS],
};

let gameTimerInterval = null;
let gameTimerEndTime = null;
let gameTimerAlertShown = false;

function startGameTimer() {}

function clearGameTimer() {}

let playState = {
  activeScreen: 'dashboard',
  gameState: 'IDLE', // IDLE | QUESTION_LOADING | AWAITING_FIRST_ANSWER | AWAITING_STEAL | RESOLVED
  phase: 'live',   // live | ended
  teams: [],           // [{ name, score }]
  currentTeamIndex: 0,
  currentQuestionValue: 0,
  teamsAttemptedCount: 0,
  answeredCells: {},   // { "qn1": { teamIndex, pointsWon, cancelled } }
  currentCellId: null,
  currentQuestion: null,
  stats: {},           // { teamIndex: { correct, attempts } }
};

let lastClickTime = 0;
function canInteract() {
  const now = Date.now();
  if (now - lastClickTime < 300) return false;
  lastClickTime = now;
  return true;
}

function transitionState(newState) {
  const validTransitions = {
    'IDLE': ['QUESTION_LOADING'],
    'QUESTION_LOADING': ['AWAITING_FIRST_ANSWER', 'IDLE'],
    'AWAITING_FIRST_ANSWER': ['RESOLVED', 'AWAITING_STEAL', 'IDLE'],
    'AWAITING_STEAL': ['RESOLVED', 'IDLE'],
    'RESOLVED': ['IDLE']
  };
  if (validTransitions[playState.gameState] && validTransitions[playState.gameState].includes(newState)) {
    playState.gameState = newState;
    return true;
  }
  console.warn(`Invalid state transition from ${playState.gameState} to ${newState}`);
  return false;
}

function canOpenCell() { return playState.gameState === 'IDLE' && playState.phase !== 'ended'; }
function canAnswer() { return playState.gameState === 'AWAITING_FIRST_ANSWER' || playState.gameState === 'AWAITING_STEAL'; }


// ============================================================
// AUDIO (Web Audio API)
// ============================================================
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, type, duration, gainVal, startDelay = 0) {
  if (!soundEnabled) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime + startDelay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(gainVal, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}


function playSound(name) {
  if (!soundEnabled) return;
  switch (name) {
    case 'correct':
      playTone(523, 'triangle', 0.12, 0.4, 0);
      playTone(659, 'triangle', 0.12, 0.4, 0.1);
      playTone(784, 'triangle', 0.12, 0.4, 0.2);
      playTone(1047, 'sine', 0.25, 0.35, 0.32);
      break;
    case 'wrong':
      playTone(220, 'sawtooth', 0.18, 0.3, 0);
      playTone(180, 'sawtooth', 0.18, 0.3, 0.2);
      break;
    case 'cancel':
      playTone(300, 'sawtooth', 0.12, 0.25, 0);
      playTone(220, 'sawtooth', 0.18, 0.2, 0.14);
      break;
    case 'pass':
      playTone(700, 'sine', 0.1, 0.25, 0);
      playTone(500, 'sine', 0.15, 0.2, 0.12);
      break;
    case 'click':
      playTone(800, 'sine', 0.04, 0.2);
      break;
    case 'open':
      playTone(400, 'triangle', 0.08, 0.2, 0);
      playTone(600, 'triangle', 0.1, 0.2, 0.1);
      break;
  }
}

// ============================================================
// CONFETTI
// ============================================================
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiParticles = [];
let confettiRaf = null;

function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class ConfettiParticle {
  constructor(x, y, burst = false) {
    this.x = x; this.y = y;
    this.size = Math.random() * 9 + 5;
    this.color = ['#F4C430', '#38D9F5', '#FF6B9D', '#7EE8A2', '#ffffff', '#A78BFA'][Math.floor(Math.random() * 6)];
    if (burst) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 5;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    } else {
      this.vx = Math.random() * 2 - 1;
      this.vy = Math.random() * 3 + 1.5;
    }
    this.rotation = Math.random() * Math.PI;
    this.rotSpeed = Math.random() * 0.15 - 0.075;
    this.opacity = 1;
    this.gravity = 0.14;
    this.burst = burst;
  }
  update() {
    this.x += this.vx;
    this.vy += this.gravity;
    this.y += this.vy;
    this.rotation += this.rotSpeed;
    if (this.burst) this.opacity -= 0.014;
  }
  draw() {
    confettiCtx.save();
    confettiCtx.translate(this.x, this.y);
    confettiCtx.rotate(this.rotation);
    confettiCtx.globalAlpha = Math.max(0, this.opacity);
    confettiCtx.fillStyle = this.color;
    confettiCtx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    confettiCtx.restore();
  }
}

function confettiLoop() {
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  if (playState.activeScreen === 'winner' && confettiParticles.length < 200) {
    confettiParticles.push(new ConfettiParticle(Math.random() * confettiCanvas.width, -12));
  }
  confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 20 && p.opacity > 0);
  confettiParticles.forEach(p => { p.update(); p.draw(); });
  if (confettiParticles.length > 0 || playState.activeScreen === 'winner') {
    confettiRaf = requestAnimationFrame(confettiLoop);
  } else {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiRaf = null;
  }
}

function triggerBurst() {
  for (let i = 0; i < 100; i++) {
    confettiParticles.push(new ConfettiParticle(confettiCanvas.width / 2, confettiCanvas.height / 3, true));
  }
  if (!confettiRaf) confettiLoop();
}

function startRain() {
  confettiParticles = [];
  if (!confettiRaf) confettiLoop();
}

function stopConfetti() {
  if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null; }
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles = [];
}

// ============================================================
// CELL ID HELPERS
// ============================================================
function cellId(qnIndex) {
  return `qn${qnIndex}`;
}

function qnLabel(qnIndex) {
  if (qnIndex === 'tiebreaker') return 'TIE BREAKER';
  return `Q${qnIndex}`;
}

// ============================================================
// SCREEN MANAGER
// ============================================================
const screens = {
  dashboard: document.getElementById('screen-dashboard'),
  admin: document.getElementById('screen-admin'),
  game: document.getElementById('screen-game'),
  winner: document.getElementById('screen-winner'),
};

function showScreen(id) {
  Object.keys(screens).forEach(k => screens[k].classList.remove('active'));
  screens[id].classList.add('active');
  playState.activeScreen = id;
  if (id === 'winner') startRain();
  else stopConfetti();

  if (id === 'admin') {
    const isGameActive = (playState.phase === 'live' && playState.teams && playState.teams.length > 0);
    const btnResume = document.getElementById('btn-admin-resume');
    if (btnResume) {
      btnResume.style.display = isGameActive ? 'inline-flex' : 'none';
    }
  }

  // Toggle header buttons visibility based on screen
  const hamburgerBtn = document.getElementById('btn-hamburger-menu');
  if (hamburgerBtn) {
    hamburgerBtn.style.display = id === 'admin' ? 'inline-block' : 'none';
  }
  const settingsBtn = document.getElementById('btn-go-admin-float');
  if (settingsBtn) {
    settingsBtn.style.display = id === 'admin' ? 'none' : 'inline-block';
  }
  
  if (typeof applyDynamicScaling === 'function') {
    applyDynamicScaling();
  }
}

// IndexedDB for large media assets (videos) to bypass localStorage quota limits
const DB_NAME = 'BibleQuizVideoDB';
const STORE_NAME = 'videos';
let idbInstance = null;

function getIndexedDB() {
  return new Promise((resolve, reject) => {
    if (idbInstance) return resolve(idbInstance);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => {
      idbInstance = e.target.result;
      resolve(idbInstance);
    };
    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function saveVideoToIndexedDB(qnIndex, base64Data) {
  try {
    const dbInstance = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(base64Data, `video-${qnIndex}`);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Failed to save video to IndexedDB', err);
  }
}

async function getVideoFromIndexedDB(qnIndex) {
  try {
    const dbInstance = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(`video-${qnIndex}`);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Failed to get video from IndexedDB', err);
    return null;
  }
}

async function deleteVideoFromIndexedDB(qnIndex) {
  try {
    const dbInstance = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(`video-${qnIndex}`);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Failed to delete video from IndexedDB', err);
  }
}

async function clearAllVideosFromIndexedDB() {
  try {
    const dbInstance = await getIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Failed to clear videos from IndexedDB', err);
  }
}

// ============================================================
// PERSISTENCE (localStorage)
// ============================================================
function saveDB() {
  if (db.settings.enableCustomPerQuestionEmoji === false) {
    db.questions.forEach(q => {
      delete q.customCorrectEmoji;
      delete q.customWrongEmoji;
    });
  }
  
  if (window.customDatabaseFileHandle) {
    saveDatabaseToFileHandle(window.customDatabaseFileHandle, db).catch(err => {
      console.error("Error saving to custom DB file handle", err);
      fallbackSaveDB();
    });
  } else {
    // If default DB, send via POST to save-db endpoint
    fetch('/api/save-db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(db, null, 2)
    }).then(res => {
      if (!res.ok) throw new Error('Failed to save to /api/save-db');
      fallbackSaveDB(); // Still save to localStorage just in case
    }).catch(err => {
      console.warn("Could not save to default_quiz.json (probably not in dev mode), falling back to localStorage", err);
      fallbackSaveDB();
    });
  }
}

function fallbackSaveDB() {
  localStorage.setItem('review_game_db', JSON.stringify(db));
  updateDashboardStatus();
}

const defaultSettings = {
  subtractOnWrong: true,
  totalQuestions: 12,
  displayMode: 'QUESTION_NUMBER',
  timerDuration: 10,
  enableTimer: true,
  gridFont: 'Fredoka One',
  applyFontToAll: false,
  playVideoFeedback: false,
  enableTieBreaker: true,
  useCustomFeedbackVideos: false,
  gridFontColor: '#ffffff',
  gridFontBold: false,
  useDefaultFontColor: true,
  gridCols: 4,
  playEmojiFeedback: true,
  enableCustomPerQuestionEmoji: true,
  emojiMode: 'random',
  positiveEmojis: "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏",
  negativeEmojis: "🤔,😬,🙊,😅,🙈,🤷‍♂️,🤦‍♀️,🤨",
  gridQnColor: '#ffb700',
  gridQnColorDefault: true,
  gridTileColor: '#ffffff',
  gridTileColorDefault: true
};

function hydrateControlCenter(settings) {
  const gridFontEl = document.getElementById('settings-grid-font');
  if (gridFontEl) gridFontEl.value = settings.gridFont ?? 'Fredoka One';
  
  const fontColorEl = document.getElementById('settings-grid-font-color');
  if (fontColorEl) fontColorEl.value = settings.gridFontColor ?? '#ffffff';
  
  const fontBoldEl = document.getElementById('settings-grid-font-bold-btn');
  if (fontBoldEl) {
    if (settings.gridFontBold) fontBoldEl.classList.add('active');
    else fontBoldEl.classList.remove('active');
  }
  
  const defaultFontColorEl = document.getElementById('settings-grid-font-color-default');
  if (defaultFontColorEl) defaultFontColorEl.checked = settings.useDefaultFontColor ?? true;

  const qnColorEl = document.getElementById('settings-grid-qn-color');
  if (qnColorEl) qnColorEl.value = settings.gridQnColor ?? '#ffb700';
  
  const qnColorDefaultEl = document.getElementById('settings-grid-qn-color-default');
  if (qnColorDefaultEl) qnColorDefaultEl.checked = settings.gridQnColorDefault ?? true;

  const tileColorEl = document.getElementById('settings-grid-tile-color');
  const tileColorDefEl = document.getElementById('settings-grid-tile-color-default');
  if (tileColorEl) tileColorEl.value = settings.gridTileColor || '#ffffff';
  if (tileColorDefEl) tileColorDefEl.checked = settings.gridTileColorDefault !== false;
  if (tileColorEl && tileColorDefEl) tileColorEl.disabled = tileColorDefEl.checked;

  const applyAllEl = document.getElementById('settings-font-apply-all');
  if (applyAllEl) applyAllEl.checked = settings.applyFontToAll ?? false;
  
  const subtractEl = document.getElementById('settings-subtract');
  if (subtractEl) subtractEl.checked = settings.subtractOnWrong ?? true;
  
  const tieBreakerEl = document.getElementById('settings-enable-tiebreaker');
  if (tieBreakerEl) tieBreakerEl.checked = settings.enableTieBreaker ?? true;
  
  const displayModeEl = document.getElementById('settings-display-mode');
  if (displayModeEl) displayModeEl.value = settings.displayMode ?? 'QUESTION_NUMBER';
  
  const timerDurationEl = document.getElementById('settings-timer-duration');
  if (timerDurationEl) timerDurationEl.value = settings.timerDuration ?? 10;
  
  const enableTimerEl = document.getElementById('settings-enable-timer');
  if (enableTimerEl) enableTimerEl.checked = settings.enableTimer ?? true;
  
  const emojiFeedbackEl = document.getElementById('settings-play-emoji-feedback');
  if (emojiFeedbackEl) emojiFeedbackEl.checked = settings.playEmojiFeedback ?? true;
  
  const emojiModeEl = document.getElementById('settings-emoji-mode');
  if (emojiModeEl) emojiModeEl.value = settings.emojiMode ?? 'random';
  
  const customEmojiEl = document.getElementById('settings-enable-custom-emoji');
  if (customEmojiEl) customEmojiEl.checked = settings.enableCustomPerQuestionEmoji ?? true;
  
  const videoFeedbackEl = document.getElementById('settings-play-video-feedback');
  if (videoFeedbackEl) videoFeedbackEl.checked = settings.playVideoFeedback ?? false;
  
  const customFeedbackEl = document.getElementById('settings-use-custom-feedback');
  if (customFeedbackEl) customFeedbackEl.checked = settings.useCustomFeedbackVideos ?? false;

  if (db.teams && db.teams.length >= 2) {
    const t1Name = document.getElementById('admin-team1-name');
    if (t1Name) t1Name.value = db.teams[0].name;
    const t2Name = document.getElementById('admin-team2-name');
    if (t2Name) t2Name.value = db.teams[1].name;
  }
}

function loadSavedDB(parsed) {
  if (parsed && typeof parsed === 'object') {
    db = {
      settings: {
        ...defaultSettings,
        ...parsed.settings
      },
      questions: (parsed.questions || []).map(q => {
        if (q.type === 'long' || q.type === 'long_answer') q.type = 'short_answer';
        if (q.questionType === 'long' || q.questionType === 'long_answer') q.questionType = 'short_answer';
        return q;
      }),
      teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
        ? parsed.teams.slice(0, 2).map((t, i) => {
          let teamObj = typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : t;
          if (teamObj.useDefault === undefined) {
            teamObj.useDefault = (teamObj.name === DEFAULT_TEAMS[i].name && (teamObj.logo === DEFAULT_TEAMS[i].logo || !teamObj.logo));
          }
          return teamObj;
        })
        : [...DEFAULT_TEAMS],
    };
    
    hydrateControlCenter(db.settings);
    
    document.documentElement.style.setProperty('--cols', 4);
    
    renderGameBoard();
    renderAdminGrid();
    applyDynamicFont();
  }
}

function loadDB() {
  const stored = localStorage.getItem('review_game_db');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      loadSavedDB(parsed);
    } catch (err) {
      console.error('Failed to parse DB from localStorage', err);
      db.settings = { ...defaultSettings };
      hydrateControlCenter(db.settings);
      loadDefaultQuiz();
    }
  } else {
    db.settings = { ...defaultSettings };
    hydrateControlCenter(db.settings);
    loadDefaultQuiz();
  }
}


function updateDashboardStatus() {
  const statusDiv = document.getElementById('dashboard-status');
  const startBtn = document.getElementById('btn-start-game');
  const count = db.questions.length;

  if (count === 0) {
    statusDiv.innerHTML = `
      <div class="bold-text">⚠️ No questions configured yet!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">You must add questions to the database before starting the game.</p>`;
    startBtn.disabled = false;
    startBtn.innerHTML = '⚙️ Go to Admin Panel';
  } else {
    statusDiv.innerHTML = `
      <div class="bold-text" style="color:var(--color-success);">✅ Quiz ready!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">
        <strong style="color:var(--color-text-light);">${count}</strong> question${count !== 1 ? 's' : ''} added. Good to go!
      </p>`;
    startBtn.disabled = false;

    // Check if the game is already active
    const adminResumeBtn = document.getElementById('btn-admin-resume');
    if (playState.teams && playState.teams.length > 0 && playState.phase !== 'ended') {
      startBtn.innerHTML = '▶️ Resume Game';
      if (adminResumeBtn) {
        adminResumeBtn.style.display = 'inline-block';
        adminResumeBtn.innerHTML = '▶️ Resume Game';
      }
    } else {
      startBtn.innerHTML = '🎮 Start Game!';
      if (adminResumeBtn) {
        adminResumeBtn.style.display = 'none';
      }
    }
  }
}

// ============================================================
// GAMEPLAY STATE PERSISTENCE (localStorage)
// ============================================================
function saveGameState() {
  if (playState.teams.length === 0) {
    localStorage.removeItem('review_game_playstate');
    return;
  }
  localStorage.setItem('review_game_playstate', JSON.stringify({
    phase: playState.phase,
    gameState: playState.gameState,
    teams: playState.teams,
    currentTeamIndex: playState.currentTeamIndex,
    currentQuestionValue: playState.currentQuestionValue,
    teamsAttemptedCount: playState.teamsAttemptedCount,
    answeredCells: playState.answeredCells,
    currentCellId: playState.currentCellId,
    currentQuestion: playState.currentQuestion,
    stats: playState.stats,
    cancelLocked: playState.cancelLocked,
    timerEndTime: gameTimerEndTime,
    timerAlertShown: gameTimerAlertShown
  }));
}

function loadGameState() {
  const stored = localStorage.getItem('review_game_playstate');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        playState.phase = parsed.phase === 'ended' ? 'ended' : 'live';
        playState.gameState = parsed.gameState ?? 'IDLE';
        playState.teams = parsed.teams ?? [];
        playState.currentTeamIndex = parsed.currentTeamIndex ?? 0;
        playState.currentQuestionValue = parsed.currentQuestionValue ?? 0;
        playState.teamsAttemptedCount = parsed.teamsAttemptedCount ?? 0;
        playState.answeredCells = parsed.answeredCells ?? {};
        playState.currentCellId = parsed.currentCellId ?? null;
        playState.currentQuestion = parsed.currentQuestion ?? null;
        playState.stats = parsed.stats ?? {};
        playState.cancelLocked = parsed.cancelLocked ?? false;

        gameTimerEndTime = parsed.timerEndTime ?? null;
        gameTimerAlertShown = parsed.timerAlertShown ?? false;

        // Sync UIs
        updateGameStatusUI();
        updateScoreUI();
        renderGameBoard();
        updateTurnUI();

        // If there was an active screen or if we are in game/winner screens
        if (playState.phase === 'ended') {
          showScreen('winner');
          endGame();
        } else if (playState.phase === 'live') {
          showScreen('game');
          if (playState.teams && playState.teams.length > 0) {
            startGameTimer();
          }
          // If a question was open, reopen it
          if (playState.currentCellId && playState.currentQuestion && (playState.gameState === 'AWAITING_FIRST_ANSWER' || playState.gameState === 'AWAITING_STEAL')) {
            const cId = playState.currentCellId;
            const q = playState.currentQuestion;
            const gState = playState.gameState;
            const qVal = playState.currentQuestionValue;
            const attempts = playState.teamsAttemptedCount;
            const cLocked = playState.cancelLocked;

            playState.gameState = 'IDLE';
            openQuestionModal(cId, q);

            playState.gameState = gState;
            playState.currentQuestionValue = qVal;
            playState.teamsAttemptedCount = attempts;
            playState.cancelLocked = cLocked;

            if (playState.gameState === 'AWAITING_STEAL') {
              const stealPts = playState.currentQuestionValue;
              document.getElementById('modal-points-display').textContent = `${stealPts} POINTS - STEAL`;

              const turnStatus = document.getElementById('modal-turn-status');
              const nextTeamIndex = playState.currentTeamIndex;
              turnStatus.innerHTML = `❌ Wrong Answer<br><span style="font-size:0.8rem;">Passed to ${playState.teams[nextTeamIndex].name}</span>`;
              turnStatus.style.color = "var(--color-error)";
              turnStatus.style.borderColor = "var(--color-error)";

              const passBtn = document.getElementById('btn-modal-pass');
              if (passBtn) passBtn.style.display = 'none';
            }

            const btnCancel = document.getElementById('btn-modal-cancel');
            if (btnCancel && cLocked) {
              btnCancel.disabled = true;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load play state:', e);
    }
  }
}

function updateGameStatusUI() {
  const badge = document.getElementById('game-status-badge');
  if (!badge) return;

  badge.classList.remove('badge-live', 'badge-ended');

  if (playState.phase === 'live') {
    badge.textContent = '🟢 LIVE';
    badge.classList.add('badge-live');
  } else if (playState.phase === 'ended') {
    badge.textContent = '🏁 ENDED';
    badge.classList.add('badge-ended');
  }
}

async function runCountdown() {
  const overlay = document.getElementById('countdown-overlay');
  const numEl = overlay ? overlay.querySelector('.countdown-number') : null;
  if (!overlay || !numEl) return;
  overlay.classList.remove('hidden');

  for (let i = 3; i > 0; i--) {
    numEl.textContent = i;
    playTone(600, 'sine', 0.08, 0.2);

    numEl.style.animation = 'none';
    void numEl.offsetHeight; // trigger reflow
    numEl.style.animation = 'countdownPulse 1s ease-in-out';

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  overlay.classList.add('hidden');
}




async function loadDefaultQuiz() {
  try {
    await clearAllVideosFromIndexedDB();
  } catch (err) {
    console.error("Failed to clear IndexedDB custom videos:", err);
  }

  try {
    const response = await fetch('default_quiz.json');
    if (!response.ok) throw new Error('Network response was not ok');
    const defaultData = await response.json();
    
    db.questions = defaultData.questions;
    
    if (defaultData.settings) {
       db.settings.totalQuestions = defaultData.settings.totalQuestions;
       db.settings.enableTieBreaker = defaultData.settings.enableTieBreaker;
    }
  } catch (err) {
    console.error("Failed to fetch default_quiz.json:", err);
  }

  saveDB();
  fallbackSaveDB();
  loadSavedDB(db);
  
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  resetPlayState();
  saveGameState();
  updateGameStatusUI();

  triggerAlert('SYSTEM', 'Questions loaded!', 'gain');
  const statusDiv = document.getElementById('dashboard-status');
  if (statusDiv) {
    statusDiv.innerHTML = '<div class="bold-text" style="color:var(--color-success);">✅ Default Database Loaded!</div>';
    setTimeout(updateDashboardStatus, 3000);
  }
}


// ============================================================
// THEME
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('review_game_theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
    icon.style.transform = 'rotate(90deg) scale(0.5)';
    icon.style.opacity = '0';
    setTimeout(() => {
      icon.textContent = theme === 'light' ? '☀️' : '🌙';
      icon.style.transform = 'rotate(0deg) scale(1)';
      icon.style.opacity = '1';
    }, 200);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applySelectedFont() {
  const font = db.settings.gridFont || 'Fredoka One';
  const applyAll = !!db.settings.applyFontToAll;
  const useDefaultColor = db.settings.useDefaultFontColor !== false; // Default to true!
  const fontColor = db.settings.gridFontColor || '#ffffff';
  const fontBold = !!db.settings.gridFontBold;

  let styleEl = document.getElementById('dynamic-font-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-font-overrides';
    document.head.appendChild(styleEl);
  }

  let css = '';

  // 1. Font Family override
  if (font !== 'none') {
    if (applyAll) {
      css += `
        body, html, input, button, select, textarea, .logo-text, .cell-qn, .cell-qn-label, .option-btn, .winner-team-name, .hero-title, .turn-team {
          font-family: "${font}", "Fredoka One", "Nunito", sans-serif !important;
        }
      `;
    } else {
      css += `
        .board-cell, .game-cell-btn, .cell-qn, .cell-qn-label, .board-cell *, .game-cell-btn * {
          font-family: "${font}", "Fredoka One", "Nunito", sans-serif !important;
        }
      `;
    }
  }

  // 2. Font Color override (applies STRICTLY to grid cell text elements when not default)
  if (!useDefaultColor) {
    css += `
      #game-board-grid .game-cell-btn,
      #game-board-grid .game-cell-btn *:not(.cell-qn-label),
      #admin-interactive-grid .board-cell,
      #admin-interactive-grid .board-cell *:not(.cell-qn-label) {
        color: ${fontColor} !important;
      }
    `;
  }

  const useDefaultQnColor = db.settings.useDefaultQnColor !== false;
  const qnFontColor = db.settings.gridQnColor || '#ffb700';

  if (!useDefaultQnColor) {
    css += `
      .qn-only-text {
        color: ${qnFontColor} !important;
      }
    `;
  }



  // 3. Font Weight override (bold or normal) - STRICTLY confined to grid cells
  if (fontBold) {
    css += `
      #game-board-grid .game-cell-btn,
      #game-board-grid .game-cell-btn *,
      #admin-interactive-grid .board-cell,
      #admin-interactive-grid .board-cell * {
        font-weight: 900 !important;
      }
    `;
  }

  styleEl.innerHTML = css;
}

// ============================================================
// ADMIN — GRID
// ============================================================
let selectedAdminCellId = null;

function getTypeLabel(type) {
  switch (type) {
    case 'mcq': return 'MCQ';
    case 'fill_blank': return 'Fill in the Blanks';
    case 'fill': return 'Fill in the Blanks';
    case 'short': return 'Short Answer';
    case 'short_answer': return 'Short Answer';
    default: return '';
  }
}

function renderAdminGrid() {
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  document.documentElement.style.setProperty('--cols', cols);

  const qCountEl = document.getElementById('admin-q-count');
  if (qCountEl) qCountEl.textContent = `Questions added: ${db.questions.filter(x => x.qnIndex !== 'tiebreaker').length}`;

  const questionsExcludingTB = db.questions.filter(x => x.qnIndex !== 'tiebreaker');
  const total = db.settings.totalQuestions;
  const baseRows = Math.ceil(total / cols);
  const rows = baseRows + (db.settings.enableTieBreaker ? 1 : 0);
  container.style.setProperty('--cols', cols);
  container.style.setProperty('--rows', rows);

  // Column labels removed

  let qn = 1;
  for (let r = 0; r < baseRows; r++) {
    // Row labels removed

    for (let c = 0; c < cols; c++) {
      const currentQn = qn; // Capture for closure
      if (qn > total) {
        const cell = document.createElement('div');
        cell.className = 'board-cell cell-disabled';
        cell.style.opacity = '0.2';
        cell.innerHTML = '<span class="cell-qn-label">—</span>';
        container.appendChild(cell);
        qn++;
        continue;
      }

      const cId = cellId(qn);
      const q = questionsExcludingTB.find(x => x.qnIndex === qn);
      const answered = playState.answeredCells[cId];
      const isPlayed = !!(playState.teams && playState.teams.length > 0 && answered);

      const cell = document.createElement('div');
      cell.className = `board-cell ${q ? 'has-q' : ''} ${selectedAdminCellId === cId ? 'selected-edit' : ''} ${isPlayed ? 'cell-played-locked' : ''}`;
      cell.dataset.cellId = cId;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `${qnLabel(qn)}: ${q ? 'Edit question' : 'Add question'}`);

      cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
      cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
      cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

      const labelEl = document.createElement('span');
      labelEl.className = 'cell-qn-label';
      let displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span>`;
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = `(${q.points})`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span>`;
        else displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span><br><span style="font-size:0.8em">(${q.points})</span>`;
      }

      if (isPlayed) {
        if (answered.cancelled) {
          labelEl.innerHTML = `❌<br><span style="color:var(--color-cancel); font-size: 0.8em;">${displayHtml}</span>`;
        } else if (answered.teamIndex === -1) {
          cell.style.background = '#cbd5e1';
          cell.style.borderColor = '#475569';
          labelEl.innerHTML = `❌<br><span style="color:#1e293b; font-size: 0.8em;">${displayHtml}</span>`;
        } else {
          const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
          cell.style.background = tColor.bg;
          cell.style.borderColor = tColor.border;
          labelEl.innerHTML = `✔️<br><span style="color:${tColor.text}; font-size: 0.8em;">${displayHtml}</span>`;
        }
      } else {
        labelEl.innerHTML = displayHtml;
      }
      cell.appendChild(labelEl);

      const badges = document.createElement('div');
      badges.className = 'cell-badges';

      if (q) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'cell-info-tag type-tag';
        typeBadge.textContent = q.type.toUpperCase();
        badges.appendChild(typeBadge);
      }

      if (q && (q.hasCustomCorrectVideo || q.hasCustomWrongVideo)) {
        const customBadge = document.createElement('span');
        customBadge.className = 'cell-info-tag has-custom-tag';
        customBadge.textContent = '★ Cust. Vid';
        badges.appendChild(customBadge);
      }
      cell.appendChild(badges);

      cell.addEventListener('click', () => {
        
        playSound('click');
        selectedAdminCellId = cId;
        renderAdminGrid();
        openQuestionEditor(currentQn);
      });
      container.appendChild(cell);
      qn++;
    }
  }

  if (db.settings.enableTieBreaker) {
    const qTb = db.questions.find(x => x.qnIndex === 'tiebreaker');
    const tbPlayed = !!(playState.teams && playState.teams.length > 0 && playState.answeredCells['q-tiebreaker']);
    
    // TB row label removed

    const cell = document.createElement('div');
    cell.className = `board-cell ${qTb ? 'has-q' : ''} ${selectedAdminCellId === 'q-tiebreaker' ? 'selected-edit' : ''} ${tbPlayed ? 'cell-played-locked' : ''}`;
    
    // mathematically center tiebreaker in a 4-col grid
    cell.style.gridColumn = '1 / -1';
    cell.style.justifySelf = 'center';
    cell.style.width = 'calc(50% - 5px)';
    cell.dataset.cellId = 'q-tiebreaker';

    cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
    cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
    cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

    const labelEl = document.createElement('span');
    labelEl.className = 'cell-qn-label';
    labelEl.innerHTML = '<span class="qn-only-text">TB</span>';
    if (tbPlayed) labelEl.innerHTML = `✔️<br><span class="qn-only-text" style="font-size:0.8em">TB</span>`;
    cell.appendChild(labelEl);

    if (qTb) {
      const badges = document.createElement('div');
      badges.className = 'cell-badges';
      const typeBadge = document.createElement('span');
      typeBadge.className = 'cell-info-tag type-tag';
      typeBadge.textContent = qTb.type.toUpperCase();
      badges.appendChild(typeBadge);
      cell.appendChild(badges);
    }

    cell.addEventListener('click', () => {
      
      playSound('click');
      selectedAdminCellId = 'q-tiebreaker';
      renderAdminGrid();
      openQuestionEditor('tiebreaker');
    });

    container.appendChild(cell);
  }
}




function toggleQuestionEditorEmojiInputs() {
  const container = document.getElementById('per-question-emoji-options');
  if (container) {
    if (db.settings.playVideoFeedback || db.settings.enableCustomPerQuestionEmoji === false) {
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
    }
  }
  const perQVideo = document.getElementById('per-question-video-options');
  if (perQVideo) {
    perQVideo.style.display = db.settings.playEmojiFeedback !== false ? 'none' : 'block';
  }
}

async function openQuestionEditor(qnIndex) {
  const adminScreen = document.getElementById('screen-admin');
  if (adminScreen) adminScreen.classList.add('form-open');

  const cId = cellId(qnIndex);
  const q = db.questions.find(x => String(x.qnIndex) === String(qnIndex));
  document.getElementById('editor-cell-title').textContent = `📝 Editing ${qnLabel(qnIndex)}`;
  document.getElementById('admin-question-editor').classList.remove('hidden');

    const form = document.getElementById('question-form');
  form.reset();

  const statusEl = document.getElementById('q-video-status');
  const clearBtn = document.getElementById('btn-clear-q-video');
  const correctStatusEl = document.getElementById('q-video-correct-status');
  const correctClearBtn = document.getElementById('btn-clear-q-video-correct');
  const wrongStatusEl = document.getElementById('q-video-wrong-status');
  const wrongClearBtn = document.getElementById('btn-clear-q-video-wrong');

  
  

  const qEmojiCorrect = document.getElementById('q-emoji-correct');
  const qEmojiWrong = document.getElementById('q-emoji-wrong');
  if (qEmojiCorrect) qEmojiCorrect.value = q ? (q.customCorrectEmoji || '') : '';
  if (qEmojiWrong) qEmojiWrong.value = q ? (q.customWrongEmoji || '') : '';

  toggleQuestionEditorEmojiInputs();

  if (q) {
    document.getElementById('q-type').value = q.questionType || (q.type === 'fill' ? 'fill_blank' : 'mcq');
  const qPointsEl = document.getElementById('q-points');
  if (qPointsEl) qPointsEl.value = q ? q.points : 100;
    document.getElementById('q-text').value = q.question;
    document.getElementById('q-points').value = q.points;

    const isMCQ = (q.questionType || q.type) === 'mcq';
    document.getElementById('mcq-options-container').classList.toggle('hidden', !isMCQ);
    document.getElementById('fill-answer-container').classList.toggle('hidden', isMCQ);
    setMCQRequired(isMCQ);

    if (isMCQ && q.options) {
      q.options.forEach((opt, idx) => {
        const el = document.getElementById(`opt-${idx}`);
        if (el) el.value = opt;
      });
      const correctIdx = q.options.indexOf(q.answer);
      if (correctIdx !== -1) {
        const radio = document.querySelector(`input[name="mcq-correct"][value="${correctIdx}"]`);
        if (radio) radio.checked = true;
      }
    } else {
      document.getElementById('q-fill-answer').value = q.answer || '';
    }

  // Load Main Question Video
    if (q.video) {
      if (statusEl) statusEl.textContent = "⌛ Loading custom video...";
      try {
        const storedVideo = await getVideoFromIndexedDB(qnIndex);
        if (storedVideo) {
          currentUploadedVideoBase64 = storedVideo;
          if (statusEl) statusEl.textContent = "✅ Custom video attached";
          if (clearBtn) clearBtn.style.display = 'inline-flex';
        }
      } catch (err) {
        console.error("Error reading video from IndexedDB:", err);
      }
    }

    // Load Correct Answer Video
    if (q.hasCustomCorrectVideo) {
      if (correctStatusEl) correctStatusEl.textContent = "⌛ Loading...";
      try {
        const storedVid = await getVideoFromIndexedDB('q-' + qnIndex + '-correct');
        if (storedVid) {
          currentUploadedCorrectVideo = storedVid;
          if (correctStatusEl) correctStatusEl.textContent = "✅ Custom video attached";
          if (correctClearBtn) correctClearBtn.style.display = 'inline-flex';
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Load Wrong Answer Video
    if (q.hasCustomWrongVideo) {
      if (wrongStatusEl) wrongStatusEl.textContent = "⌛ Loading...";
      try {
        const storedVid = await getVideoFromIndexedDB('q-' + qnIndex + '-wrong');
        if (storedVid) {
          currentUploadedWrongVideo = storedVid;
          if (wrongStatusEl) wrongStatusEl.textContent = "✅ Custom video attached";
          if (wrongClearBtn) wrongClearBtn.style.display = 'inline-flex';
        }
      } catch (err) {
        console.error(err);
      }
    }


    document.getElementById('btn-delete-question').style.display = 'inline-flex';
  } else {
    document.getElementById('q-type').value = 'fill';
    document.getElementById('q-text').value = '';
    document.getElementById('q-points').value = 100;
    document.getElementById('mcq-options-container').classList.add('hidden');
    document.getElementById('fill-answer-container').classList.remove('hidden');
    setMCQRequired(false);

    if (statusEl) statusEl.textContent = "No video selected";
    if (clearBtn) clearBtn.style.display = 'none';

    document.getElementById('btn-delete-question').style.display = 'none';
  }

  document.getElementById('admin-question-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeQuestionEditor() {
  document.getElementById('admin-question-editor').classList.add('hidden');
  const adminScreen = document.getElementById('screen-admin');
  if (adminScreen) adminScreen.classList.remove('form-open');
}

function setMCQRequired(req) {
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`opt-${i}`);
    if (el) el.required = req;
  }
  const fillEl = document.getElementById('q-fill-answer');
  if (fillEl) fillEl.required = !req;
}

// ============================================================
// GAME BOARD
// ============================================================
function renderGameBoard() {
  const container = document.getElementById('game-board-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const total = db.settings.totalQuestions;
  const baseRows = Math.ceil(total / cols);
  const rows = baseRows + (db.settings.enableTieBreaker ? 1 : 0);
  container.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;

  for (let qn = 1; qn <= total; qn++) {
    const cId = cellId(qn);
    const q = db.questions.find(x => x.qnIndex === qn);
    const btn = document.createElement('button');
    btn.dataset.cellId = cId;

    btn.setAttribute('aria-label', qnLabel(qn));
    const answered = playState.answeredCells[cId];

    let displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span>`;
    if (q) {
      if (db.settings.displayMode === 'POINTS_ONLY') {
        displayHtml = `(${q.points})`;
      } else if (db.settings.displayMode === 'QUESTION_ONLY') {
        displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span>`;
      } else {
        displayHtml = `<span class="qn-only-text">${qnLabel(qn)}</span><br><span style="font-size:0.8em">(${q.points})</span>`;
      }
    }

    if (!q) {
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
    } else if (answered && answered.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">${displayHtml}</span>`;
    } else if (answered) {
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
      if (answered.teamIndex === -1) {
        btn.className = 'game-cell-btn cell-wrong';
        btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">${displayHtml}</span>`;
      } else {
        const team = playState.teams[answered.teamIndex];
        const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = `<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔</span><span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
      }
    } else {
      btn.className = 'game-cell-btn';
      btn.innerHTML = `<span class="cell-qn" style="text-align:center; line-height:1.2;">${displayHtml}</span>`;
      btn.addEventListener('click', (e) => {
        if (!canInteract() || !canOpenCell()) return;
        
        // Ripple effect
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        
        const activeTeam = playState.teams[playState.currentTeamIndex];
        const tColor = activeTeam ? TEAM_COLORS[playState.currentTeamIndex % TEAM_COLORS.length] : null;
        if (tColor) ripple.style.background = tColor.bg;
        
        btn.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
          playSound('open');
          openQuestionModal(cId, q);
        }, 400); // Wait for ripple animation
      });
    }
    container.appendChild(btn);
  }

  if (db.settings.enableTieBreaker) {
    const validQuestions = db.questions.filter(x => typeof x.qnIndex === 'number' && x.qnIndex <= total);
    let allAnswered = true;
    for (const q of validQuestions) {
      if (!playState.answeredCells[cellId(q.qnIndex)]) {
        allAnswered = false;
        break;
      }
    }
    const isTied = (playState.teams.length > 1 && playState.teams[0].score === playState.teams[1].score);
    
    if (validQuestions.length > 0 && (allAnswered || playState.forceTieBreaker) && isTied) {
      const tieQ = db.questions.find(x => x.qnIndex === 'tiebreaker');
      const cId = 'c-tiebreaker';
      const btn = document.createElement('button');
      btn.dataset.cellId = cId;
      btn.className = 'game-cell-btn';
      btn.style.gridColumn = '1 / -1';
      btn.style.justifySelf = 'center';
      btn.style.width = 'calc(50% - 5px)';
      btn.style.borderColor = 'var(--color-gold)';
      btn.style.boxShadow = '0 0 15px rgba(244, 196, 48, 0.4)';
      
      let displayHtml = '<span class="qn-only-text">TIE BREAKER</span>';
      if (db.settings.displayMode === 'POINTS_ONLY' && tieQ) {
        displayHtml = `(${tieQ.points})`;
      } else if (db.settings.displayMode !== 'QUESTION_ONLY' && tieQ) {
        displayHtml = `<span class="qn-only-text">TIE BREAKER</span><br><span style="font-size:0.8em">(${tieQ.points})</span>`;
      }

      const answered = playState.answeredCells[cId];
      if (!tieQ) {
        btn.disabled = true;
        btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
      } else if (answered && answered.cancelled) {
        btn.className = 'game-cell-btn cell-cancelled';
        btn.disabled = true;
        btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">${displayHtml}</span>`;
      } else if (answered) {
        btn.className = 'game-cell-btn cell-answered';
        btn.disabled = true;
        const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
        if (answered.teamIndex === -1) {
          btn.className = 'game-cell-btn cell-wrong';
          btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">${displayHtml}</span>`;
        } else {
          const team = playState.teams[answered.teamIndex];
          const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
          btn.style.background = tColor.bg;
          btn.style.borderColor = tColor.border;
          btn.innerHTML = `<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔</span><span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
        }
      } else {
        btn.innerHTML = `<span class="cell-qn" style="color:var(--color-gold); font-size:1.1rem; text-align:center; line-height:1.2;">${displayHtml}</span>`;
        btn.addEventListener('click', () => {
          if (!canInteract() || !canOpenCell()) return;
          playSound('open');
          openQuestionModal(cId, tieQ);
        });
      }
      container.appendChild(btn);
    }
  }
  applySelectedFont();
}

// ============================================================
// TURN SYSTEM
// ============================================================
function updateTurnUI() {
  const turnDisplay = document.getElementById('turn-display');
  const stealBanner = document.getElementById('steal-banner');
  const activeTeam = playState.teams[playState.currentTeamIndex];
  if (!activeTeam) return;

  turnDisplay.textContent = activeTeam.name.toUpperCase();
  turnDisplay.style.color = 'var(--color-gold)';
  stealBanner.classList.toggle('hidden', true); // removed steal state banner

  const panels = document.querySelectorAll('.dynamic-team-panel');
  panels.forEach((panel, i) => {
    panel.classList.toggle('active-turn', i === playState.currentTeamIndex);
  });
}

function switchTurn() {
  playState.currentTeamIndex = (playState.currentTeamIndex + 1) % playState.teams.length;
  updateTurnUI();
}

// ============================================================
// SCORE UI
// ============================================================
// ============================================================
// SCORE DROP VISUAL FEEDBACK
// ============================================================
function updateScoreUI(updatedTeamIndex = -1) {
  const container = document.getElementById('game-team-panels');
  if (!container) return;
  container.innerHTML = '';

  const liveScoreContainer = document.getElementById('live-score-display');

  playState.teams.forEach((team, i) => {
    const color = TEAM_COLORS[i % TEAM_COLORS.length];
    const isActive = playState.currentTeamIndex === i;
    const panel = document.createElement('div');
    panel.className = `dynamic-team-panel glass-panel ${isActive ? 'active-turn' : ''}`;
    panel.style.borderColor = isActive ? 'var(--color-gold)' : color.border;

    const logoSrc = assetPath(team.logo || (team.name === 'Lion' ? 'lion.png' : 'lioness.png'));
    panel.innerHTML = `
      <img src="${logoSrc}" class="team-logo-circular" alt="${team.name}" />
      <div class="team-details">
        <span class="team-label">${team.name}</span>
        <span id="score-team-${i}" class="team-score" style="color:${color.text};">${team.score}</span>
      </div>
    `;
    container.appendChild(panel);
  });

  // Re-render or update live score display
  if (liveScoreContainer) {
    if (liveScoreContainer.children.length !== playState.teams.length) {
      liveScoreContainer.innerHTML = '';
      playState.teams.forEach((team, i) => {
        const color = TEAM_COLORS[i % TEAM_COLORS.length];
        const liveItem = document.createElement('div');
        liveItem.className = 'live-score-item';
        liveItem.id = `live-score-item-${i}`;
        liveItem.style.setProperty('--team-bg', color.bg);
        liveItem.style.setProperty('--team-border', color.border);
        liveItem.style.setProperty('--team-color', color.text);

        liveItem.innerHTML = `
          <span class="live-score-team-name">${team.name}</span>
          <span id="live-score-val-${i}" class="live-score-value">${team.score}</span>
        `;
        liveScoreContainer.appendChild(liveItem);
      });
    } else {
      playState.teams.forEach((team, i) => {
        const valSpan = document.getElementById(`live-score-val-${i}`);
        const nameSpan = valSpan ? valSpan.previousElementSibling : null;
        if (nameSpan) nameSpan.textContent = team.name;
        if (valSpan) {
          const oldScore = parseInt(valSpan.textContent, 10);
          valSpan.textContent = team.score;

          if (i === updatedTeamIndex || oldScore !== team.score) {
            const liveItem = document.getElementById(`live-score-item-${i}`);
            if (liveItem) {
              // Apply live score animation queue protection (force reflow)
              liveItem.classList.remove('score-updated');
              void liveItem.offsetWidth;
              liveItem.classList.add('score-updated');
            }
          }
        }
      });
    }
  }

  renderSidebarLeaderboard();
}

function renderSidebarLeaderboard() {
  const list = document.getElementById('sidebar-leaderboard-list');
  if (!list) return;
  list.innerHTML = '';

  const sorted = playState.teams
    .map((t, idx) => ({ ...t, index: idx }))
    .sort((a, b) => b.score - a.score);

  sorted.forEach((team, rank) => {
    const isActive = playState.currentTeamIndex === team.index;
    const div = document.createElement('div');
    div.className = `leaderboard-item ${isActive ? 'active-item' : ''}`;

    let medal = `${rank + 1}`;
    if (rank === 0) medal = '🥇';
    else if (rank === 1) medal = '🥈';
    else if (rank === 2) medal = '🥉';

    div.innerHTML = `
      <span class="leaderboard-rank">${medal}</span>
      <span class="leaderboard-name">${team.name}</span>
      <span class="leaderboard-score">${team.score}</span>
    `;
    list.appendChild(div);
  });
}

// ============================================================
// QUESTION MODAL HELPERS & DOUBLE CLICK PROTECTION
// ============================================================
function disableModalActionButtons() {
  const btnSubmit = document.getElementById('btn-modal-submit');
  const btnPass = document.getElementById('btn-modal-pass');
  const btnCancel = document.getElementById('btn-modal-cancel');

  if (btnSubmit) btnSubmit.disabled = true;
  if (btnPass) btnPass.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
}

function enableModalActionButtons() {
  const btnSubmit = document.getElementById('btn-modal-submit');
  const btnPass = document.getElementById('btn-modal-pass');
  const btnCancel = document.getElementById('btn-modal-cancel');

  if (btnSubmit) btnSubmit.disabled = false;

  const q = playState.currentQuestion;
  const canPass = q && (playState.teamsAttemptedCount < playState.teams.length - 1);
  if (btnPass) {
    btnPass.style.display = canPass ? 'inline-flex' : 'none';
    btnPass.disabled = !canPass;
  }

  if (btnCancel) {
    btnCancel.disabled = !!playState.cancelLocked;
  }
}

// ============================================================
// QUESTION MODAL
// ============================================================
function openQuestionModal(cId, q) {
  if (!transitionState('QUESTION_LOADING')) return;
  playState.currentCellId = cId;
  playState.currentQuestion = q;
  playState.currentQuestionValue = q.points;
  playState.teamsAttemptedCount = 0;
  playState.originalTeamIndex = playState.currentTeamIndex;
  playState.cancelLocked = false;

  const overlay = document.getElementById('modal-overlay');
  enableModalActionButtons();
  document.getElementById('modal-steal-label').classList.toggle('hidden', true);

  const qnIndex = q.qnIndex || parseInt(cId.replace('qn', ''), 10);
  document.getElementById('modal-cell-id').textContent = qnLabel(qnIndex);
  document.getElementById('modal-points-display').textContent = `${q.points} POINTS`;

  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.style.color = 'var(--color-gold)';
  turnStatus.style.borderColor = 'rgba(244,196,48,0.3)';
  const activeTeam = playState.teams[playState.currentTeamIndex];
  turnStatus.textContent = `${activeTeam.name.toUpperCase()} TURN`;

  document.getElementById('modal-question-text').textContent = q.question;

  const mcqContainer = document.getElementById('modal-mcq-container');
  const fillContainer = document.getElementById('modal-fill-container');
  const revealPanel = document.getElementById('modal-reveal-panel');
  revealPanel.classList.add('hidden');

  // Reset correct answer reveal button inside fill container
  const btnShowCorrectAnswer = document.getElementById('btn-show-correct-answer');
  if (btnShowCorrectAnswer) {
    btnShowCorrectAnswer.disabled = false;
    btnShowCorrectAnswer.style.cursor = '';
  }

  if ((q.questionType || q.type) === 'mcq') {
    mcqContainer.classList.remove('hidden');
    fillContainer.classList.add('hidden');
    const optBtns = document.querySelectorAll('.option-btn');
    const letters = ['A', 'B', 'C', 'D'];
    optBtns.forEach((btn, i) => {
      btn.className = 'option-btn';
      btn.disabled = false;
      btn.style.cursor = '';
      btn.querySelector('.option-letter').textContent = letters[i];
      btn.querySelector('.option-val').textContent = q.options ? q.options[i] : '';
      btn.onclick = () => {
        if (!canInteract() || !canAnswer()) return;
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        playSound('click');
      };
    });
  } else {
    mcqContainer.classList.add('hidden');
    fillContainer.classList.remove('hidden');
    const fillInput = document.getElementById('modal-fill-input');
    fillInput.value = '';
    fillInput.disabled = false;
    fillInput.style.cursor = '';
    fillInput.style.borderColor = '';
    setTimeout(() => fillInput.focus(), 100);
  }

  document.getElementById('modal-correct-answer-text').textContent = q.correctAnswer || q.answer;
  const contentNode = document.querySelector('.modal-content');
  contentNode.classList.remove('feedback-correct', 'feedback-wrong');
  const btnNext = document.getElementById('btn-modal-next');
  if (btnNext) {
    btnNext.style.display = 'none';
    btnNext.disabled = true;
  }
  const btnSubmit = document.getElementById('btn-modal-submit');
  if (btnSubmit) btnSubmit.style.display = 'inline-flex';

  overlay.classList.add('open');

  transitionState('AWAITING_FIRST_ANSWER');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  playState.currentCellId = null;
  playState.currentQuestion = null;
  playState.currentQuestionValue = 0;
  playState.teamsAttemptedCount = 0;
  playState.originalTeamIndex = playState.currentTeamIndex;
  playState.cancelLocked = false;
  if (playState.phase !== 'ended') playState.gameState = 'IDLE';
}

// ============================================================
// CANCEL QUESTION
// ============================================================
function cancelQuestion() {
  const cId = playState.currentCellId;
  if (!cId) return;

  playSound('cancel');
  transitionState('RESOLVED');
  playState.answeredCells[cId] = { teamIndex: -2, pointsWon: 0, cancelled: true };
  document.getElementById('modal-turn-status').textContent = "Question Cancelled";
  updateTurnUI();
  saveGameState();
  renderGameBoard();
  renderAdminGrid();
  enableNextButton();
  disableQuestionInputs();
}

function disableQuestionInputs() {
  // Disable MCQ buttons
  const optBtns = document.querySelectorAll('.option-btn');
  optBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.cursor = 'not-allowed';
  });

  // Disable Fill-in-the-blank input
  const fillInput = document.getElementById('modal-fill-input');
  if (fillInput) {
    fillInput.disabled = true;
    fillInput.style.cursor = 'not-allowed';
  }

  // Disable "Correct Answer" reveal button
  const revealBtn = document.getElementById('btn-show-correct-answer');
  if (revealBtn) {
    revealBtn.disabled = true;
    revealBtn.style.cursor = 'not-allowed';
  }
}

async function playWrongAnswerVideo(videoSrc, onClosed) {
  if (typeof videoSrc === 'function') {
    onClosed = videoSrc;
    videoSrc = null;
  }

  let finalSrc = videoSrc;
  if (!finalSrc || finalSrc === 'wrong_answer_video.mp4') {
    if (db.settings.useCustomFeedbackVideos) {
      const customData = await getVideoFromIndexedDB('feedback-wrong');
      if (customData) finalSrc = customData;
    }
  }
  finalSrc = finalSrc || 'wrong_answer_video.mp4';

  const overlay = document.createElement('div');
  overlay.className = 'wrong-answer-video-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0, 0, 0, 0.95)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backdropFilter = 'blur(12px)';

  const videoContainer = document.createElement('div');
  videoContainer.style.position = 'relative';
  videoContainer.style.maxWidth = '85%';
  videoContainer.style.maxHeight = '75%';
  videoContainer.style.borderRadius = '24px';
  videoContainer.style.overflow = 'hidden';
  videoContainer.style.border = '6px solid #ff4d4d';
  videoContainer.style.boxShadow = '0 0 50px rgba(255, 77, 77, 0.6)';
  videoContainer.style.background = '#000';

  const video = document.createElement('video');
  video.src = finalSrc;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.autoplay = true;
  video.controls = false;

  const skipBtn = document.createElement('button');
  skipBtn.textContent = '⏭️ Skip Video';
  skipBtn.style.marginTop = '24px';
  skipBtn.style.padding = '14px 36px';
  skipBtn.style.fontSize = '1.3rem';
  skipBtn.style.fontWeight = '800';
  skipBtn.style.color = '#fff';
  skipBtn.style.background = 'rgba(255, 77, 77, 0.2)';
  skipBtn.style.border = '3px solid #ff4d4d';
  skipBtn.style.borderRadius = 'var(--radius-pill)';
  skipBtn.style.cursor = 'pointer';
  skipBtn.style.transition = 'all 0.2s';
  skipBtn.style.boxShadow = '0 0 15px rgba(255, 77, 77, 0.3)';

  skipBtn.onmouseover = () => {
    skipBtn.style.background = '#ff4d4d';
    skipBtn.style.boxShadow = '0 0 25px rgba(255, 77, 77, 0.8)';
    skipBtn.style.transform = 'scale(1.05)';
  };
  skipBtn.onmouseout = () => {
    skipBtn.style.background = 'rgba(255, 77, 77, 0.2)';
    skipBtn.style.boxShadow = '0 0 15px rgba(255, 77, 77, 0.3)';
    skipBtn.style.transform = 'scale(1)';
  };

  const closeOverlay = () => {
    video.pause();
    overlay.remove();
    if (onClosed) onClosed();
  };

  video.onended = closeOverlay;
  skipBtn.onclick = closeOverlay;

  setTimeout(() => {
    if (overlay.parentNode) {
      closeOverlay();
    }
  }, 12000); // 12 seconds fallback

  videoContainer.appendChild(video);
  overlay.appendChild(videoContainer);
  overlay.appendChild(skipBtn);
  document.body.appendChild(overlay);

  video.play().catch(err => {
    console.warn('Autoplay failed, showing play button', err);
    video.controls = true;
    const playPrompt = document.createElement('div');
    playPrompt.textContent = '▶️ Play Video';
    playPrompt.style.position = 'absolute';
    playPrompt.style.inset = '0';
    playPrompt.style.background = 'rgba(0,0,0,0.5)';
    playPrompt.style.color = '#fff';
    playPrompt.style.fontSize = '2rem';
    playPrompt.style.fontWeight = 'bold';
    playPrompt.style.display = 'flex';
    playPrompt.style.alignItems = 'center';
    playPrompt.style.justifyContent = 'center';
    playPrompt.style.cursor = 'pointer';
    playPrompt.onclick = () => {
      video.play();
      playPrompt.remove();
    };
    videoContainer.appendChild(playPrompt);
  });
}

async function playCorrectAnswerVideo(videoSrc, onClosed) {
  if (typeof videoSrc === 'function') {
    onClosed = videoSrc;
    videoSrc = null;
  }

  let finalSrc = videoSrc;
  if (!finalSrc || finalSrc === 'correct_answer_video.mp4') {
    if (db.settings.useCustomFeedbackVideos) {
      const customData = await getVideoFromIndexedDB('feedback-correct');
      if (customData) finalSrc = customData;
    }
  }
  finalSrc = finalSrc || 'correct_answer_video.mp4';

  const overlay = document.createElement('div');
  overlay.className = 'correct-answer-video-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0, 0, 0, 0.95)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backdropFilter = 'blur(12px)';

  const videoContainer = document.createElement('div');
  videoContainer.style.position = 'relative';
  videoContainer.style.maxWidth = '85%';
  videoContainer.style.maxHeight = '75%';
  videoContainer.style.borderRadius = '24px';
  videoContainer.style.overflow = 'hidden';
  videoContainer.style.border = '6px solid var(--color-success)';
  videoContainer.style.boxShadow = '0 0 50px rgba(74, 222, 128, 0.6)';
  videoContainer.style.background = '#000';

  const video = document.createElement('video');
  video.src = finalSrc;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.autoplay = true;
  video.controls = false;

  const skipBtn = document.createElement('button');
  skipBtn.textContent = '⏭️ Skip Video';
  skipBtn.style.marginTop = '24px';
  skipBtn.style.padding = '14px 36px';
  skipBtn.style.fontSize = '1.3rem';
  skipBtn.style.fontWeight = '800';
  skipBtn.style.color = '#fff';
  skipBtn.style.background = 'rgba(74, 222, 128, 0.2)';
  skipBtn.style.border = '3px solid var(--color-success)';
  skipBtn.style.borderRadius = 'var(--radius-pill)';
  skipBtn.style.cursor = 'pointer';
  skipBtn.style.transition = 'all 0.2s';
  skipBtn.style.boxShadow = '0 0 15px rgba(74, 222, 128, 0.3)';

  skipBtn.onmouseover = () => {
    skipBtn.style.background = 'var(--color-success)';
    skipBtn.style.boxShadow = '0 0 25px rgba(74, 222, 128, 0.8)';
    skipBtn.style.transform = 'scale(1.05)';
  };
  skipBtn.onmouseout = () => {
    skipBtn.style.background = 'rgba(74, 222, 128, 0.2)';
    skipBtn.style.boxShadow = '0 0 15px rgba(74, 222, 128, 0.3)';
    skipBtn.style.transform = 'scale(1)';
  };

  const closeOverlay = () => {
    video.pause();
    overlay.remove();
    if (onClosed) onClosed();
  };

  video.onended = closeOverlay;
  skipBtn.onclick = closeOverlay;

  setTimeout(() => {
    if (overlay.parentNode) {
      closeOverlay();
    }
  }, 12000); // 12 seconds fallback

  videoContainer.appendChild(video);
  overlay.appendChild(videoContainer);
  overlay.appendChild(skipBtn);
  document.body.appendChild(overlay);

  video.play().catch(err => {
    console.warn('Autoplay failed, showing play button', err);
    video.controls = true;
    const playPrompt = document.createElement('div');
    playPrompt.textContent = '▶️ Play Video';
    playPrompt.style.position = 'absolute';
    playPrompt.style.inset = '0';
    playPrompt.style.background = 'rgba(0,0,0,0.5)';
    playPrompt.style.color = '#fff';
    playPrompt.style.fontSize = '2rem';
    playPrompt.style.fontWeight = 'bold';
    playPrompt.style.display = 'flex';
    playPrompt.style.alignItems = 'center';
    playPrompt.style.justifyContent = 'center';
    playPrompt.style.cursor = 'pointer';
    playPrompt.onclick = () => {
      video.play();
      playPrompt.remove();
    };
    videoContainer.appendChild(playPrompt);
  });
}

async function playWinnerScreenVideo(onClosed) {
  let finalSrc = 'winner_screen_video.mp4';
  if (db.settings.useCustomFeedbackVideos) {
    const customData = await getVideoFromIndexedDB('feedback-winner');
    if (customData) finalSrc = customData;
  }

  const overlay = document.createElement('div');
  overlay.className = 'winner-video-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0, 0, 0, 0.95)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.backdropFilter = 'blur(12px)';

  const videoContainer = document.createElement('div');
  videoContainer.style.position = 'relative';
  videoContainer.style.maxWidth = '85%';
  videoContainer.style.maxHeight = '75%';
  videoContainer.style.borderRadius = '24px';
  videoContainer.style.overflow = 'hidden';
  videoContainer.style.border = '6px solid var(--color-gold)';
  videoContainer.style.boxShadow = '0 0 50px rgba(244, 196, 48, 0.6)';
  videoContainer.style.background = '#000';

  const video = document.createElement('video');
  video.src = finalSrc;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.autoplay = true;
  video.controls = false;

  const skipBtn = document.createElement('button');
  skipBtn.textContent = '⏭️ Skip Video';
  skipBtn.style.marginTop = '24px';
  skipBtn.style.padding = '14px 36px';
  skipBtn.style.fontSize = '1.3rem';
  skipBtn.style.fontWeight = '800';
  skipBtn.style.color = '#000';
  skipBtn.style.background = 'var(--color-gold)';
  skipBtn.style.border = '3px solid var(--color-gold-dark)';
  skipBtn.style.borderRadius = 'var(--radius-pill)';
  skipBtn.style.cursor = 'pointer';
  skipBtn.style.transition = 'all 0.2s';
  skipBtn.style.boxShadow = '0 0 15px rgba(244, 196, 48, 0.3)';

  skipBtn.onmouseover = () => {
    skipBtn.style.background = 'var(--color-gold-light)';
    skipBtn.style.boxShadow = '0 0 25px rgba(244, 196, 48, 0.8)';
    skipBtn.style.transform = 'scale(1.05)';
  };
  skipBtn.onmouseout = () => {
    skipBtn.style.background = 'var(--color-gold)';
    skipBtn.style.boxShadow = '0 0 15px rgba(244, 196, 48, 0.3)';
    skipBtn.style.transform = 'scale(1)';
  };

  const closeOverlay = () => {
    video.pause();
    overlay.remove();
    if (onClosed) onClosed();
  };

  video.onended = closeOverlay;
  skipBtn.onclick = closeOverlay;

  setTimeout(() => {
    if (overlay.parentNode) {
      closeOverlay();
    }
  }, 90000); // 90 seconds fallback for a longer winner video

  videoContainer.appendChild(video);
  overlay.appendChild(videoContainer);
  overlay.appendChild(skipBtn);
  document.body.appendChild(overlay);

  video.play().catch(err => {
    console.warn('Autoplay failed, showing play button', err);
    video.controls = true;
    const playPrompt = document.createElement('div');
    playPrompt.textContent = '▶️ Play Video';
    playPrompt.style.position = 'absolute';
    playPrompt.style.inset = '0';
    playPrompt.style.background = 'rgba(0,0,0,0.5)';
    playPrompt.style.color = '#fff';
    playPrompt.style.fontSize = '2rem';
    playPrompt.style.fontWeight = 'bold';
    playPrompt.style.display = 'flex';
    playPrompt.style.alignItems = 'center';
    playPrompt.style.justifyContent = 'center';
    playPrompt.style.cursor = 'pointer';
    playPrompt.onclick = () => {
      video.play();
      playPrompt.remove();
    };
    videoContainer.appendChild(playPrompt);
  });
}

// ============================================================
// SCORING ENGINE
// ============================================================

function applyScore(teamIndex, points, isPenalty = false, bypassStateCheck = false) {
  if (!bypassStateCheck && playState.gameState !== 'AWAITING_FIRST_ANSWER' && playState.gameState !== 'AWAITING_STEAL') {
    console.warn('Blocked invalid score attempt: not in scoring state');
    return;
  }

  if (isPenalty && !db.settings.subtractOnWrong) return;

  const teamName = playState.teams[teamIndex].name;

  if (isPenalty) {
    playState.teams[teamIndex].score -= points;
    // Show red danger alert immediately
    triggerAlert(teamName, `-${points} Points`, 'lose');
  } else {
    playState.teams[teamIndex].score += points;
    // Show green success alert immediately
    triggerAlert(teamName, `+${points} Points`, 'gain');
  }
}



function enableNextButton() {
  const btnNext = document.getElementById('btn-modal-next');
  const btnSubmit = document.getElementById('btn-modal-submit');
  const btnPass = document.getElementById('btn-modal-pass');
  if (btnPass) btnPass.style.display = 'none';
  if (btnSubmit) btnSubmit.style.display = 'none';
  if (btnNext) {
    btnNext.style.display = 'inline-flex';
    btnNext.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnLoadDef = document.getElementById('btn-load-default');
  if (btnLoadDef) btnLoadDef.addEventListener('click', loadDefaultQuiz);

  const btnNext = document.getElementById('btn-modal-next');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (!canInteract()) return;
      closeModal();
      saveGameState();
      renderGameBoard();
      checkGameOver();
    });
  }
});

// ============================================================
// SUBMIT / PASS
// ============================================================
function triggerAlert(teamName, text, type) {
  const alertEl = document.createElement('div');
  alertEl.className = `score-alert ${type === 'gain' ? 'alert-gain' : 'alert-lose'}`;

  const teamSpan = document.createElement('span');
  teamSpan.className = 'alert-team';
  teamSpan.textContent = teamName;

  const textSpan = document.createElement('span');
  textSpan.textContent = text;

  alertEl.appendChild(teamSpan);
  alertEl.appendChild(textSpan);

  document.body.appendChild(alertEl);

  // Auto-dismiss
  setTimeout(() => alertEl.remove(), 2600);
}

function queueScoreAlert(teamName, text, type) {
  setTimeout(() => triggerAlert(teamName, text, type), 2300);
}

function showCustomConfirm(message, onConfirm, opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  overlay.style.background = currentTheme === 'light' ? 'rgba(238, 243, 255, 0.7)' : 'rgba(0, 0, 0, 0.75)';

  overlay.style.backdropFilter = 'blur(12px)';
  overlay.style.zIndex = '10000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.25s ease';

  const card = document.createElement('div');
  card.className = 'confirm-card glass-panel';
  card.style.width = '90%';
  card.style.maxWidth = '460px';
  card.style.padding = '32px';
  card.style.borderRadius = 'var(--radius-sm)';
  card.style.textAlign = 'center';
  card.style.border = '2px solid var(--panel-border-active)';
  card.style.boxShadow = 'var(--card-shadow)';
  card.style.background = 'var(--panel-bg)';
  card.style.color = 'var(--color-text-light)';
  card.style.transform = 'scale(0.8)';
  card.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';

  const icon = document.createElement('div');
  icon.textContent = opts.icon || '⚠️';
  icon.style.fontSize = '3.5rem';
  icon.style.marginBottom = '16px';

  const text = document.createElement('h3');
  text.textContent = message;
  text.style.fontSize = '1.35rem';
  text.style.fontWeight = '700';
  text.style.color = 'var(--color-text-light)';
  text.style.marginBottom = '12px';
  text.style.fontFamily = 'var(--font-display)';

  const subtext = document.createElement('p');
  subtext.textContent = opts.subtext || 'This action cannot be undone.';
  subtext.style.fontSize = '0.95rem';
  subtext.style.color = 'var(--color-text-muted)';
  subtext.style.marginBottom = '28px';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '14px';
  actions.style.justifyContent = 'center';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = opts.cancelClass || 'btn btn-secondary';
  cancelBtn.textContent = opts.cancelText || 'No';
  cancelBtn.style.padding = '12px 28px';
  cancelBtn.style.fontSize = '1.05rem';
  cancelBtn.style.borderRadius = 'var(--radius-pill)';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = opts.confirmClass || 'btn btn-danger';
  confirmBtn.textContent = opts.confirmText || 'Yes';
  confirmBtn.style.padding = '12px 32px';
  confirmBtn.style.fontSize = '1.05rem';
  confirmBtn.style.borderRadius = 'var(--radius-pill)';

  const close = (confirmed) => {
    overlay.style.opacity = '0';
    card.style.transform = 'scale(0.8)';
    setTimeout(() => {
      overlay.remove();
      if (confirmed) {
        onConfirm();
      } else if (opts.onCancel) {
        opts.onCancel();
      }
    }, 250);
  };

  cancelBtn.onclick = () => {
    playSound('click');
    close(false);
  };

  confirmBtn.onclick = () => {
    playSound('click');
    close(true);
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  card.appendChild(icon);
  card.appendChild(text);
  card.appendChild(subtext);
  card.appendChild(actions);

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    card.style.transform = 'scale(1)';
  });
}



async function resolveAnswer(isCorrect) {
  const q = playState.currentQuestion;
  if (!q || !canAnswer()) return;

  const cId = playState.currentCellId;
  const teamIndex = playState.currentTeamIndex;
  const ptsToAward = playState.currentQuestionValue;

  // Asynchronously fetch the custom video from IndexedDB if metadata flag is true
  let customCorrectVideoSrc = null;
  if (q.hasCustomCorrectVideo) {
    try {
      customCorrectVideoSrc = await getVideoFromIndexedDB('q-' + q.qnIndex + '-correct');
    } catch (err) {
      console.error(err);
    }
  }

  let customWrongVideoSrc = null;
  if (q.hasCustomWrongVideo) {
    try {
      customWrongVideoSrc = await getVideoFromIndexedDB('q-' + q.qnIndex + '-wrong');
    } catch (err) {
      console.error(err);
    }
  }

function showEmojiFeedback(isCorrect, q, callback) {
  if (db.settings.playEmojiFeedback === false) {
    if (callback) callback();
    return;
  }

  const positiveEmojis = db.settings.positiveEmojis ? db.settings.positiveEmojis.split(',').map(e => e.trim()).filter(e => e) : ['👏', '🎉', '🌟', '🙌', '💯', '🏆', '🤩', '👍', '👌', '😊', '👏'];
  const negativeEmojis = db.settings.negativeEmojis ? db.settings.negativeEmojis.split(',').map(e => e.trim()).filter(e => e) : ['😢', '😭', '🤦', '📉', '💔', '🙈', '😬', '💀'];
  
  let emoji = null;
  if (q && db.settings.enableCustomPerQuestionEmoji !== false) {
    if (isCorrect && q.customCorrectEmoji) emoji = q.customCorrectEmoji;
    if (!isCorrect && q.customWrongEmoji) emoji = q.customWrongEmoji;
  }
  
  if (!emoji) {
    const emojiArray = isCorrect ? positiveEmojis : negativeEmojis;
    const mode = db.settings.emojiMode || 'random';
    
    if (mode === 'random') {
      const randomIndex = Math.floor(Math.random() * emojiArray.length);
      emoji = emojiArray[randomIndex];
    } else {
      const safeIndex = q ? (parseInt(q.qnIndex) || 1) : 1;
      emoji = emojiArray[safeIndex % emojiArray.length];
    }
  }
  
  const fbOverlay = document.createElement('div');
  fbOverlay.style.position = 'fixed';
  fbOverlay.style.top = '0';
  fbOverlay.style.left = '0';
  fbOverlay.style.right = '0';
  fbOverlay.style.bottom = '0';
  fbOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  fbOverlay.style.zIndex = '999999';
  fbOverlay.style.display = 'flex';
  fbOverlay.style.justifyContent = 'center';
  fbOverlay.style.alignItems = 'center';
  fbOverlay.style.opacity = '0';
  fbOverlay.style.transition = 'opacity 0.2s';
  fbOverlay.style.pointerEvents = 'none'; // Ensure it doesn't trap clicks
  
  const sticker = document.createElement('div');
  sticker.textContent = emoji;
  sticker.style.fontSize = '15rem';
  sticker.style.lineHeight = '1';
  sticker.style.textAlign = 'center';
  sticker.style.margin = '0';
  sticker.style.padding = '0';
  sticker.style.transformOrigin = 'center center';
  sticker.style.transform = 'scale(0) rotate(-45deg)';
  sticker.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  sticker.style.filter = 'drop-shadow(0 10px 30px rgba(0,0,0,0.8))';
  
  fbOverlay.appendChild(sticker);
  document.body.appendChild(fbOverlay);
  
  // Trigger animations
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fbOverlay.style.opacity = '1';
      sticker.style.transform = 'scale(1) rotate(0deg)';
    });
  });
  
  // End animation
  setTimeout(() => {
    sticker.style.transform = 'scale(0.5) translateY(-200px)';
    sticker.style.opacity = '0';
    sticker.style.transition = 'all 0.3s ease-in';
    fbOverlay.style.opacity = '0';
    
    setTimeout(() => {
      if (fbOverlay.parentNode) {
        fbOverlay.parentNode.removeChild(fbOverlay);
      }
      if (callback) callback();
    }, 300);
  }, 1700);
}



  const finalizeCorrect = () => {
    applyScore(teamIndex, ptsToAward, false, true); // Safe scoring via controlled engine
    triggerBurst();
    updateScoreUI(teamIndex);

    playState.answeredCells[cId] = { teamIndex, pointsWon: ptsToAward, cancelled: false };
    if (playState.stats[teamIndex]) {
      playState.stats[teamIndex].correct++;
      playState.stats[teamIndex].attempts++;
    }

    const contentNode = document.querySelector('.modal-content');
    contentNode.classList.remove('feedback-wrong');
    contentNode.classList.add('feedback-correct');

    document.getElementById('modal-correct-answer-text').textContent = q.correctAnswer || q.answer;
    document.getElementById('modal-reveal-panel').classList.remove('hidden');

    const turnStatus = document.getElementById('modal-turn-status');
    turnStatus.textContent = "Correct Answer!";
    turnStatus.style.color = "var(--color-success)";
    turnStatus.style.borderColor = "var(--color-success)";

    playState.cancelLocked = true;
    const btnCancel = document.getElementById('btn-modal-cancel');
    if (btnCancel) btnCancel.disabled = true;

    saveGameState();
    if (playState.teamsAttemptedCount === 0) {
      switchTurn();
    }
    renderGameBoard();
    renderAdminGrid();
    enableNextButton();
  };

  if (isCorrect) {
    transitionState('RESOLVED');
    disableQuestionInputs();

    if (customCorrectVideoSrc) {
      playCorrectAnswerVideo(customCorrectVideoSrc, finalizeCorrect);
    } else {
      playSound('correct');
      showEmojiFeedback(true, q, finalizeCorrect);
    }

  } else {
    if (playState.stats[teamIndex]) playState.stats[teamIndex].attempts++;

    let penalty = ptsToAward;
    if (playState.teamsAttemptedCount === 0) {
      penalty = Math.floor(ptsToAward * 0.5);
    }

    const isExhausted = playState.teamsAttemptedCount + 1 >= playState.teams.length;

    const finalizeWrong = () => {
      applyScore(teamIndex, penalty, true, true);
      updateScoreUI(); // Update all to reflect new scores
      
      playState.teamsAttemptedCount++;
      
      if (!isExhausted) {
        playState.currentQuestionValue = ptsToAward - penalty;
        transitionState('AWAITING_STEAL');
        switchTurn();
        saveGameState();
        renderGameBoard();
        renderAdminGrid();
        startStealPhase();
      } else {
        transitionState('RESOLVED');
        disableQuestionInputs();

        playState.answeredCells[cId] = { teamIndex: -1, pointsWon: 0, cancelled: false };

        const turnStatus = document.getElementById('modal-turn-status');
        turnStatus.textContent = "Incorrect Answer";
        turnStatus.style.color = "var(--color-error)";
        turnStatus.style.borderColor = "var(--color-error)";

        const contentNode = document.querySelector('.modal-content');
        contentNode.classList.remove('feedback-correct');
        contentNode.classList.add('feedback-wrong');

        document.getElementById('modal-correct-answer-text').textContent = q.correctAnswer || q.answer;
        document.getElementById('modal-reveal-panel').classList.remove('hidden');

        playState.cancelLocked = true;
        const btnCancel = document.getElementById('btn-modal-cancel');
        if (btnCancel) btnCancel.disabled = true;

        saveGameState();
        renderGameBoard();
        renderAdminGrid();
        enableNextButton();
      }
    };

    if (customWrongVideoSrc) {
      playWrongAnswerVideo(customWrongVideoSrc, finalizeWrong);
    } else {
      playSound('wrong');
      showEmojiFeedback(false, q, finalizeWrong);
    }
  }
}

function startStealPhase() {
  const stealPts = playState.currentQuestionValue;
  document.getElementById('modal-points-display').textContent = `${stealPts} POINTS - STEAL`;

  // Disable previously selected option if any
  document.querySelectorAll('.option-btn.selected').forEach(btn => btn.disabled = true);

  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.innerHTML = `❌ Wrong Answer<br><span style="font-size:0.8rem;">Passed to ${playState.teams[playState.currentTeamIndex].name}</span>`;
  turnStatus.style.color = "var(--color-error)";
  turnStatus.style.borderColor = "var(--color-error)";
  turnStatus.style.textAlign = "center";

  const contentNode = document.querySelector('.modal-content');
  contentNode.classList.remove('feedback-correct');
  contentNode.classList.add('feedback-wrong');
  setTimeout(() => contentNode.classList.remove('feedback-wrong'), 600);

  document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
  const fillInput = document.getElementById('modal-fill-input');
  if (fillInput) { fillInput.value = ''; fillInput.focus(); }

  // Re-enable action buttons for steal team
  enableModalActionButtons();

  updateScoreUI();
  updateTurnUI();
}

function submitAnswer(isCorrect) {
  resolveAnswer(isCorrect);
}

function handlePass() {
  if (!canAnswer()) return;
  const q = playState.currentQuestion;
  if (!q || playState.teamsAttemptedCount >= playState.teams.length - 1) return;
  playSound('pass');

  playState.teamsAttemptedCount++;
  
  playState.currentQuestionValue = Math.floor(playState.currentQuestionValue * 0.5);
  
  transitionState('AWAITING_STEAL');
  switchTurn();
  saveGameState();
  renderGameBoard();
  renderAdminGrid();

  const stealPts = playState.currentQuestionValue;
  document.getElementById('modal-points-display').textContent = `${stealPts} POINTS - STEAL`;

  document.querySelectorAll('.option-btn.selected').forEach(btn => btn.disabled = true);
  document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
  const fillInput = document.getElementById('modal-fill-input');
  if (fillInput) { fillInput.value = ''; fillInput.focus(); }

  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.innerHTML = `⏭️ Passed<br><span style="font-size:0.8rem;">To ${playState.teams[playState.currentTeamIndex].name}</span>`;
  turnStatus.style.color = "var(--color-gold)";
  turnStatus.style.borderColor = "var(--color-gold)";
  turnStatus.style.textAlign = "center";

  enableModalActionButtons();
  updateScoreUI();
  updateTurnUI();
}

// ============================================================
// GAME OVER CHECK
// ============================================================
function checkGameOver() {
  

  const total = db.settings.totalQuestions;
  const validQuestions = db.questions.filter(x => typeof x.qnIndex === 'number' && x.qnIndex <= total);
  
  const allMainAnswered = validQuestions.length > 0 && validQuestions.every(q => {
    return !!playState.answeredCells[cellId(q.qnIndex)];
  });

  if (!allMainAnswered && !playState.forceTieBreaker) return;

  const isTied = (playState.teams.length > 1 && playState.teams[0].score === playState.teams[1].score);
  
  if (db.settings.enableTieBreaker && isTied) {
    const tieQ = db.questions.find(x => x.qnIndex === 'tiebreaker');
    if (tieQ) {
      if (playState.answeredCells['c-tiebreaker']) {
        endGame();
      }
      return;
    }
  }

  endGame();
}

function endGame() {
  clearGameTimer();
  const sorted = playState.teams
    .map((t, idx) => ({ ...t, index: idx }))
    .sort((a, b) => b.score - a.score);

  const winner = sorted[0];
  const tie = sorted.length > 1 && sorted[0].score === sorted[1].score;

  if (tie) {
    document.getElementById('winner-badge').textContent = "IT'S A TIE! 🤝";
    document.getElementById('winner-team-name').textContent = 'Perfectly Matched!';
    document.getElementById('winner-subtitle').textContent = 'Both teams got an equal score! Good job!';
  } else {
    document.getElementById('winner-badge').textContent = 'CHAMPION! 🏆';
    document.getElementById('winner-team-name').textContent = `${winner.name.toUpperCase()} WINS!`;
    document.getElementById('winner-subtitle').textContent = `Congratulations to ${winner.name} on their incredible victory!`;
  }

  const standingsContainer = document.getElementById('winner-standings-container');
  if (standingsContainer) {
    standingsContainer.innerHTML = '';
    if (tie) {
      standingsContainer.style.display = 'none';
    } else {
      standingsContainer.style.display = 'flex';
      const placeMedals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '4th Place', '5th Place', '6th Place'];
      sorted.forEach((team, rank) => {
        const medal = placeMedals[rank] || `${rank + 1}th Place`;
        const row = document.createElement('div');
        row.className = `standing-row ${rank === 0 ? 'first-place' : ''}`;
        row.innerHTML = `
          <span class="standing-place">${medal}</span>
          <span style="font-weight:800;">${team.name}</span>
          <span style="font-family:var(--font-display); font-size:1.2rem;">${team.score} pts</span>
        `;
        standingsContainer.appendChild(row);
      });
    }
  }

  const statsDiv = document.getElementById('winner-stats');
  if (statsDiv) {
    let html = '';
    if (tie) {
      statsDiv.style.display = 'none';
    } else {
      statsDiv.style.display = 'block';
      playState.teams.forEach((team, i) => {
        const stat = playState.stats[i] || { correct: 0, attempts: 0 };
        html += `<p>• <strong>${team.name}</strong>: ${stat.correct} correct out of ${stat.attempts} attempts</p>`;
      });
    }
    statsDiv.innerHTML = html;
  }

  // Play winner screen video, then show winner screen
  if (db.settings.playVideoFeedback) {
    playWinnerScreenVideo(() => {
      playState.phase = 'ended';
      saveGameState();
      updateDashboardStatus();
      showScreen('winner');
    });
  } else {
    playSound('correct');
    playState.phase = 'ended';
    saveGameState();
    updateDashboardStatus();
    showScreen('winner');
  }
}

// ============================================================
// TEAMS SETUP
// ============================================================
function setupTeamsFromInputs() {
  playState.teams = db.teams.slice(0, 2).map((t, idx) => {
    const isDef = !!t.useDefault;
    const defaultName = idx === 0 ? 'Lion' : 'Lioness';
    const defaultLogo = idx === 0 ? 'lion.png' : 'lioness.png';
    return {
      name: isDef ? defaultName : (t.name || defaultName),
      logo: isDef ? defaultLogo : (t.logo || defaultLogo),
      score: 0
    };
  });
  playState.stats = {};
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

function resetPlayState() {
  playState.teams.forEach(t => { t.score = 0; });
  playState.currentTeamIndex = 0;
  playState.currentQuestionValue = 0;
  playState.teamsAttemptedCount = 0;
  playState.answeredCells = {};
  playState.currentCellId = null;
  playState.currentQuestion = null;
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

// ============================================================
// EVENT LISTENERS — Header Controls
// ============================================================
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  playSound('click');
  toggleTheme();
});

document.getElementById('btn-sound-toggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-icon').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playSound('click');
});

let isElectronFS = true; // Electron starts in fullscreen by default!
if (window.electronAPI) {
  window.electronAPI.isFullscreen().then(state => {
    isElectronFS = state;
    updateFullscreenIcon();
  });
  window.electronAPI.onFullscreenChange(state => {
    isElectronFS = state;
    updateFullscreenIcon();
  });
}

function getFullscreenState() {
  if (window.electronAPI) {
    return isElectronFS;
  }
  return !!(document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement);
}

function toggleFullscreen() {
  if (window.electronAPI) {
    window.electronAPI.toggleFullscreen();
    return;
  }

  const docEl = document.documentElement;
  const isFS = getFullscreenState();

  if (!isFS) {
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(err => console.warn(err));
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.warn(err));
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

document.getElementById('btn-fullscreen-toggle')?.addEventListener('click', () => {
  playSound('click');
  toggleFullscreen();
});

const updateFullscreenIcon = () => {
  const icon = document.getElementById('fullscreen-icon');
  if (icon) {
    const isFS = getFullscreenState();
    icon.src = isFS ? 'exit_fullscreen.png' : 'fullscreen.png';
  }
};

document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
document.addEventListener('MSFullscreenChange', updateFullscreenIcon);

// Floating admin gear button (in main app header actions)
document.getElementById('btn-go-admin-float')?.addEventListener('click', () => {
  playSound('click');
  renderAdminGrid();
  showScreen('admin');
});

// Control Center hamburger settings button (only inside Admin screen, left side)
document.getElementById('btn-hamburger-menu')?.addEventListener('click', () => {
  playSound('click');

  // Slide open the sidebar Control Center from the left side
  document.getElementById('left-sliding-sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('show');
});

// Close Sidebar listeners
document.getElementById('btn-close-sidebar')?.addEventListener('click', () => {
  playSound('click');

document.getElementById('btn-admin-save-db')?.addEventListener('click', () => {
  playSound('click');
  document.getElementById('btn-export-json').click();
});
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
});

document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
  playSound('click');
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
});

// ============================================================
// EVENT LISTENERS — Dashboard
// ============================================================
document.getElementById('btn-start-game').addEventListener('click', () => {
  playSound('open');
  if (playState.teams && playState.teams.length > 0 && playState.phase !== 'ended') {
    // Resume existing game
    showScreen('game');
  } else {
    // Start fresh game
    setupTeamsFromInputs();
    resetPlayState();
    playState.phase = 'live';
    playState.gameState = 'IDLE';
    const minutes = db.settings.timerDuration ?? 10;
    gameTimerEndTime = Date.now() + minutes * 60 * 1000;
    gameTimerAlertShown = false;
    startGameTimer();
    saveGameState();
    updateGameStatusUI();
    renderGameBoard();
    updateTurnUI();
    updateScoreUI();
    showScreen('game');
  }
});

// ============================================================
// EVENT LISTENERS — Admin Panel
// ============================================================
document.getElementById('btn-admin-back').addEventListener('click', () => {
  playSound('click');
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
  updateDashboardStatus();
  showScreen('dashboard');
});

const btnAdminResume = document.getElementById('btn-admin-resume');
if (btnAdminResume) {
  btnAdminResume.addEventListener('click', () => {
    playSound('open');
    showScreen('game');
  });
}

document.getElementById('settings-subtract').addEventListener('change', e => {
  db.settings.subtractOnWrong = e.target.checked;
  saveDB();
});

// Admin Team Setup Event Listeners
document.getElementById('admin-team1-name')?.addEventListener('input', e => {
  if (db.teams[0] && db.teams[0].useDefault) return; // Prevent edits if using default!
  const newName = e.target.value.trim() || 'Team 1';
  db.teams[0].name = newName;
  saveDB();
  if (playState.teams[0]) {
    playState.teams[0].name = newName;
    saveGameState();
    updateScoreUI();
    updateTurnUI();
  }
});
document.getElementById('admin-team2-name')?.addEventListener('input', e => {
  if (db.teams[1] && db.teams[1].useDefault) return; // Prevent edits if using default!
  const newName = e.target.value.trim() || 'Team 2';
  db.teams[1].name = newName;
  saveDB();
  if (playState.teams[1]) {
    playState.teams[1].name = newName;
    saveGameState();
    updateScoreUI();
    updateTurnUI();
  }
});

function handleLogoUpload(e, teamIndex) {
  if (db.teams[teamIndex] && db.teams[teamIndex].useDefault) return; // Prevent upload if using default!
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (ev) {
    db.teams[teamIndex].logo = ev.target.result;
    saveDB();
    if (playState.teams[teamIndex]) {
      playState.teams[teamIndex].logo = ev.target.result;
      saveGameState();
      updateScoreUI();
    }
  };
  reader.readAsDataURL(file);
}

document.getElementById('admin-team1-logo')?.addEventListener('change', e => handleLogoUpload(e, 0));
document.getElementById('admin-team2-logo')?.addEventListener('change', e => handleLogoUpload(e, 1));

// Setup Default Team Toggles helper
const setupDefaultTeamToggle = (teamIdx, defaultCheckboxId, nameInputId, logoInputId, defaultName, defaultLogo) => {
  const checkbox = document.getElementById(defaultCheckboxId);
  if (!checkbox) return;
  checkbox.addEventListener('change', e => {
    playSound('click');
    const checked = e.target.checked;
    db.teams[teamIdx].useDefault = checked;

    const nameInput = document.getElementById(nameInputId);
    const logoInput = document.getElementById(logoInputId);

    if (nameInput) nameInput.disabled = checked;
    if (logoInput) logoInput.disabled = checked;

    if (checked) {
      if (nameInput) nameInput.value = defaultName;
      if (logoInput) logoInput.value = ''; // Reset file input selection
      db.teams[teamIdx].name = defaultName;
      db.teams[teamIdx].logo = defaultLogo;
    } else {
      const currentVal = nameInput ? nameInput.value.trim() : '';
      db.teams[teamIdx].name = currentVal || defaultName;
      // logo stays default until they upload a custom one or restore existing
    }

    saveDB();

    if (playState.teams[teamIdx]) {
      playState.teams[teamIdx].name = db.teams[teamIdx].name;
      playState.teams[teamIdx].logo = db.teams[teamIdx].logo;
      saveGameState();
      updateScoreUI();
      updateTurnUI();
    }
  });
};

setupDefaultTeamToggle(0, 'admin-team1-default', 'admin-team1-name', 'admin-team1-logo', 'Lion', 'lion.png');
setupDefaultTeamToggle(1, 'admin-team2-default', 'admin-team2-name', 'admin-team2-logo', 'Lioness', 'lioness.png');

async function saveDatabaseToFileHandle(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
  triggerAlert("System", "Database saved directly to file!", "gain");
  updateDashboardStatus();
}

// Export JSON
document.getElementById('btn-export-json').addEventListener('click', async () => {
  playSound('click');
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: `review_game_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      await saveDatabaseToFileHandle(handle, db);
      window.customDatabaseFileHandle = handle;
    } else {
      throw new Error("File System Access API not supported");
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn("Fallback to download API", err);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
      a.download = `review_game_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }
});

// Import JSON
document.getElementById('import-json-file').addEventListener('click', async (e) => {
  if (window.showOpenFilePicker) {
    e.preventDefault(); // Stop default file input behavior
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      window.customDatabaseFileHandle = fileHandle; // Retain handle for writing back
      
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        db = {
          settings: {
            subtractOnWrong: parsed.settings?.subtractOnWrong ?? true,
            totalQuestions: parsed.settings?.totalQuestions ?? 12,
            displayMode: parsed.settings?.displayMode ?? 'QUESTION_NUMBER',
            
            gridFont: parsed.settings?.gridFont ?? 'Fredoka One',
            applyFontToAll: parsed.settings?.applyFontToAll ?? false,
            playVideoFeedback: parsed.settings?.playVideoFeedback ?? false,
            playEmojiFeedback: parsed.settings?.playEmojiFeedback !== false,
            enableCustomPerQuestionEmoji: parsed.settings?.enableCustomPerQuestionEmoji ?? true,
            emojiMode: parsed.settings?.emojiMode ?? 'random',
            positiveEmojis: parsed.settings?.positiveEmojis ?? "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏",
            negativeEmojis: parsed.settings?.negativeEmojis ?? "😢,😭,🤦,📉,💔,🙈,😬,💀",
            useCustomFeedbackVideos: parsed.settings?.useCustomFeedbackVideos ?? false,
            gridFontColor: parsed.settings?.gridFontColor ?? '#ffffff',
            gridFontBold: parsed.settings?.gridFontBold ?? false,
            gridTileColor: parsed.settings?.gridTileColor ?? '#ffffff',
            gridTileColorDefault: parsed.settings?.gridTileColorDefault ?? true
          },
          questions: parsed.questions || [],
          teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
            ? parsed.teams.slice(0, 2)
            : [...DEFAULT_TEAMS],
        };
        saveDB();
        document.getElementById('settings-subtract').checked = !!db.settings.subtractOnWrong;
        document.getElementById('settings-total-questions').value = db.settings.totalQuestions;
        const colsEl = document.getElementById('settings-columns');
        if (colsEl) colsEl.value = db.settings.gridCols || 4;
        document.getElementById('settings-display-mode').value = db.settings.displayMode;
        const timerEl = document.getElementById('settings-timer-duration');
        if (timerEl) timerEl.value = db.settings.timerDuration ?? 10;
        const fontEl = document.getElementById('settings-grid-font');
        if (fontEl) fontEl.value = db.settings.gridFont ?? 'Fredoka One';
        const fontColorEl = document.getElementById('settings-grid-font-color');
        if (fontColorEl) fontColorEl.value = db.settings.gridFontColor ?? '#ffffff';
        const fontBoldEl = document.getElementById('settings-grid-font-bold');
        if (fontBoldEl) fontBoldEl.checked = !!db.settings.gridFontBold;
        const applyAllEl = document.getElementById('settings-font-apply-all');
        if (applyAllEl) applyAllEl.checked = !!db.settings.applyFontToAll;
        const videoFeedbackEl = document.getElementById('settings-play-video-feedback');
        if (videoFeedbackEl) {
          videoFeedbackEl.checked = !!db.settings.playVideoFeedback;
          document.getElementById('video-feedback-options').style.display = videoFeedbackEl.checked ? 'flex' : 'none';
        }
        const customFeedbackEl = document.getElementById('settings-use-custom-feedback');
        if (customFeedbackEl) {
          customFeedbackEl.checked = !!db.settings.useCustomFeedbackVideos;
          document.getElementById('custom-video-uploads').style.display = customFeedbackEl.checked ? 'flex' : 'none';
        }

        const emojiFeedbackEl = document.getElementById('settings-play-emoji-feedback');
        if (emojiFeedbackEl) {
          emojiFeedbackEl.checked = db.settings.playEmojiFeedback !== false;
          const emojiOpts = document.getElementById('emoji-feedback-options');
          if (emojiOpts) emojiOpts.style.display = emojiFeedbackEl.checked ? 'flex' : 'none';
        }
        
        const emojiModeEl = document.getElementById('settings-emoji-mode');
        if (emojiModeEl) emojiModeEl.value = db.settings.emojiMode || 'random';
        
        if (customEmojiEl) {
          customEmojiEl.checked = db.settings.enableCustomPerQuestionEmoji ?? true;
          toggleQuestionEditorEmojiInputs();
        }
        
        const posEmojiEl = document.getElementById('settings-positive-emojis');
        if (posEmojiEl) posEmojiEl.value = db.settings.positiveEmojis || "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏";
        
        const negEmojiEl = document.getElementById('settings-negative-emojis');
        if (negEmojiEl) negEmojiEl.value = db.settings.negativeEmojis || "😢,😭,🤦,📉,💔,🙈,😬,💀";

        applySelectedFont();
        renderAdminGrid();
        renderGameBoard();
      }
    } catch (err) {
      console.error('Invalid JSON file.', err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Save Settings
document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  playSound('click');
  saveDB();
  triggerAlert('SYSTEM', 'All changes and game state saved successfully!', 'gain');
});

// Reset game (not questions)
document.getElementById('btn-reset-game').addEventListener('click', () => {
  playSound('click');
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  playState.teams = []; // Clear active game teams to prevent resume until clicked Start
  resetPlayState();
  clearGameTimer();
  localStorage.removeItem('review_game_playstate');
  updateGameStatusUI();
  updateDashboardStatus();
  renderGameBoard();
  updateScoreUI();

  // Show premium success notification
  triggerAlert('SYSTEM', 'Game successfully reset!', 'gain');

  showScreen('dashboard');
});

// Clear all questions
document.getElementById('btn-clear-db').addEventListener('click', async () => {
  playSound('wrong');
  db.questions = [];

  try {
    await clearAllVideosFromIndexedDB();
  } catch (err) {
    console.error("Failed to clear all custom videos from IndexedDB:", err);
  }

  saveDB();
  selectedAdminCellId = null;
  closeQuestionEditor();
  renderAdminGrid();
  renderGameBoard();

  // Show premium success notification
  triggerAlert('SYSTEM', 'All questions cleared!', 'gain');
});

// ============================================================
// EVENT LISTENERS — Question Editor
// ============================================================
document.getElementById('btn-close-editor').addEventListener('click', () => {
  playSound('click');
  closeQuestionEditor();
  selectedAdminCellId = null;
  renderAdminGrid();
});

document.getElementById('q-type').addEventListener('change', e => {
  const isMCQ = e.target.value === 'mcq';
  document.getElementById('mcq-options-container').classList.toggle('hidden', !isMCQ);
  document.getElementById('fill-answer-container').classList.toggle('hidden', isMCQ);
  setMCQRequired(isMCQ);
});

document.getElementById('question-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!selectedAdminCellId) return;
  playSound('correct');

  const rawId = selectedAdminCellId.toString().replace('qn', '');
  const qnIndex = rawId === 'tiebreaker' ? 'tiebreaker' : parseInt(rawId, 10);
  const type = document.getElementById('q-type').value;
  const text = document.getElementById('q-text').value.trim();
  const pts = parseInt(document.getElementById('q-points').value, 10) || 100;
  let answer = '', options = [];

  if (type === 'mcq') {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`opt-${i}`);
      options.push(el ? el.value.trim() : '');
    }
    const sel = document.querySelector('input[name="mcq-correct"]:checked');
    answer = sel ? options[parseInt(sel.value, 10)] : options[0];
  } else {
    answer = document.getElementById('q-fill-answer').value.trim();
  }

  

  const existIdx = db.questions.findIndex(q => q.qnIndex === qnIndex);
  const qObj = {
    id: existIdx !== -1 ? db.questions[existIdx].id : Date.now(),
    qnIndex,
    type,
    question: text,
    options,
    answer,
    points: pts,
        customCorrectEmoji: document.getElementById('q-emoji-correct') ? document.getElementById('q-emoji-correct').value.trim() : '',
    customWrongEmoji: document.getElementById('q-emoji-wrong') ? document.getElementById('q-emoji-wrong').value.trim() : ''
  };

  if (existIdx !== -1) db.questions[existIdx] = qObj;
  else db.questions.push(qObj);

  saveDB();
  closeQuestionEditor();
  selectedAdminCellId = null;
  renderAdminGrid();
  renderGameBoard();
});

document.getElementById('btn-delete-question').addEventListener('click', async () => {
  if (!selectedAdminCellId) return;
  playSound('wrong');
  const rawId = selectedAdminCellId.toString().replace('qn', '');
  const qnIndex = rawId === 'tiebreaker' ? 'tiebreaker' : parseInt(rawId, 10);
  db.questions = db.questions.filter(q => q.qnIndex !== qnIndex);

  await deleteVideoFromIndexedDB(qnIndex);
  await deleteVideoFromIndexedDB('q-' + qnIndex + '-correct');
  await deleteVideoFromIndexedDB('q-' + qnIndex + '-wrong');

  saveDB();
  closeQuestionEditor();
  selectedAdminCellId = null;
  renderAdminGrid();
  renderGameBoard();
});

// ============================================================
// EVENT LISTENERS — Question Modal
// ============================================================
// Show Correct Answer Autofill Helper click handler
const btnShowCorrectAnswer = document.getElementById('btn-show-correct-answer');
if (btnShowCorrectAnswer) {
  btnShowCorrectAnswer.addEventListener('click', () => {
    if (!canInteract()) return;
    const q = playState.currentQuestion;
    if (!q) return;

    const fillInput = document.getElementById('modal-fill-input');
    if (fillInput) {
      fillInput.value = q.correctAnswer || q.answer;
      fillInput.focus();
      fillInput.select();

      // Trigger reveal-highlight animation
      fillInput.classList.remove('reveal-highlight');
      void fillInput.offsetWidth;
      fillInput.classList.add('reveal-highlight');
    }

    // Lock cancel button
    playState.cancelLocked = true;
    const btnCancel = document.getElementById('btn-modal-cancel');
    if (btnCancel) {
      btnCancel.disabled = true;
    }

    playSound('click');
  });
}

document.getElementById('btn-modal-cancel').addEventListener('click', () => {
  if (!canInteract()) return;
  disableModalActionButtons();
  cancelQuestion();
});

document.getElementById('btn-modal-pass').addEventListener('click', () => {
  if (!canInteract()) return;
  disableModalActionButtons();
  handlePass();
});

document.getElementById('btn-modal-submit').addEventListener('click', () => {
  if (!canInteract()) return;

  const q = playState.currentQuestion;
  if (!q) return;

  disableModalActionButtons();

  if ((q.questionType || q.type) === 'mcq') {
    const selBtn = document.querySelector('.option-btn.selected');
    if (!selBtn) {
      enableModalActionButtons();
      return;
    }
    const val = selBtn.querySelector('.option-val').textContent;
    submitAnswer(val === q.answer);
  } else {
    const val = document.getElementById('modal-fill-input').value.trim();
    if (!val) {
      enableModalActionButtons();
      return;
    }
    const normalize = str => str.toLowerCase().replace(/[\s.,&/|-]/g, '');
    
    // Check if it's an exact match after stripping punctuation and spaces
    // Or if the admin provided multiple options separated by `||` (e.g., "Option 1 || Option 2")
    const possibleAnswers = (q.correctAnswer || q.answer).split('||').map(s => normalize(s));
    const isCorrect = possibleAnswers.includes(normalize(val));
    
    submitAnswer(isCorrect);
  }
});

// Enter key submits fill-in
document.getElementById('modal-fill-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-modal-submit').click();
  }
});

// ============================================================
// EVENT LISTENERS — Game Screen
// ============================================================
document.getElementById('btn-end-game').addEventListener('click', () => {
  if (!canInteract()) return;

  const t1 = playState?.teams?.[0];
  const t2 = playState?.teams?.[1];
  const isTied = (t1 && t2 && t1.score === t2.score);
  const tieQ = db.questions.find(x => x.qnIndex === 'tiebreaker');
  
  if (isTied && db.settings.enableTieBreaker) {
    if (tieQ) {
      showCustomConfirm(
        'Scores are exactly tied!',
        () => {
          closeModal();
          triggerAlert("SYSTEM", "Tie Breaker has been forced!", "info");
          playState.forceTieBreaker = true;
          renderGameBoard();
        },
        {
          confirmText: 'Play Tie Breaker',
          confirmClass: 'btn btn-primary',
          cancelText: 'End Game Now',
          cancelClass: 'btn btn-danger',
          icon: '🏆',
          subtext: 'Do you want to play the Tie Breaker question or end the game immediately?',
          onCancel: () => {
            closeModal();
            playState.phase = 'ended';
            saveGameState();
            updateGameStatusUI();
            endGame();
          }
        }
      );
    } else {
      showCustomConfirm(
        'Scores are tied, but no Tie Breaker question is configured!',
        () => {
          closeModal();
          playState.phase = 'ended';
          saveGameState();
          updateGameStatusUI();
          endGame();
        },
        {
          confirmText: 'End Game Anyway',
          cancelText: 'Cancel',
          subtext: 'You enabled the Tie Breaker feature, but the TIE BREAKER cell in the Admin Grid is empty. Please configure it first.',
          icon: '⚠️'
        }
      );
    }
  } else {
    showCustomConfirm('Want to confirm ending the game?', () => {
      closeModal();
      playState.phase = 'ended';
      saveGameState();
      updateGameStatusUI();
      endGame();
    });
  }
});

document.getElementById('btn-resign-game').addEventListener('click', () => {
  if (!canInteract()) return;

  showCustomConfirm('Want to confirm resigning the game?', () => {
    closeModal();
    playSound('cancel');
    resetPlayState();
    playState.teams = []; // Clear active game teams
    playState.phase = 'live';
    playState.gameState = 'IDLE';
    clearGameTimer();
    localStorage.removeItem('review_game_playstate');

    updateGameStatusUI();
    renderGameBoard();
    updateTurnUI();
    updateScoreUI();
    showScreen('dashboard');
  });
});

// ============================================================
// EVENT LISTENERS — Winner Screen
// ============================================================
document.getElementById('btn-play-again').addEventListener('click', () => {
  if (!canInteract()) return;
  playSound('open');
  resetPlayState();
  playState.phase = 'live';
  const minutes = db.settings.timerDuration ?? 10;
  gameTimerEndTime = Date.now() + minutes * 60 * 1000;
  gameTimerAlertShown = false;
  startGameTimer();
  saveGameState();
  updateGameStatusUI();
  renderGameBoard();
  updateTurnUI();
  updateScoreUI();
  showScreen('game');
});

document.getElementById('btn-winner-home').addEventListener('click', () => {
  if (!canInteract()) return;
  playSound('click');
  playState.teams = []; // Clear active game teams
  clearGameTimer();
  localStorage.removeItem('review_game_playstate');
  showScreen('dashboard');
});

// ============================================================
// INIT
// ============================================================

// Apply saved theme or system preference
const savedTheme = localStorage.getItem('review_game_theme');
if (savedTheme) {
  applyTheme(savedTheme);
} else {
  applyTheme('dark');
}

// Load saved data
loadDB();
loadGameState();
renderAdminGrid();
updateScoreUI();

if (playState.phase !== 'ended') {
  playState.phase = 'live';
  showScreen('dashboard');
}

// Admin Settings Listeners
document.addEventListener('DOMContentLoaded', () => {
  const totEl = document.getElementById('settings-total-questions');
  if (totEl) {
    totEl.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      db.settings.totalQuestions = val;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });
  }

  const colsEl = document.getElementById('settings-columns');
  if (colsEl) {
    colsEl.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      db.settings.gridCols = val;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });
  }


  const modeEl = document.getElementById('settings-display-mode');
  if (modeEl) {
    modeEl.addEventListener('change', (e) => {
      db.settings.displayMode = e.target.value;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });
  }

  const timerEl = document.getElementById('settings-timer-duration');
  if (timerEl) {
    timerEl.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      db.settings.timerDuration = val;
      saveDB();
    });
  }

  const enableTimerEl = document.getElementById('settings-enable-timer');
  if (enableTimerEl) {
    enableTimerEl.addEventListener('change', (e) => {
      db.settings.enableTimer = e.target.checked;
      saveDB();
      if (!db.settings.enableTimer) {
        clearGameTimer();
      } else {
        if (playState.phase === 'live' && playState.teams && playState.teams.length > 0) {
          const minutes = db.settings.timerDuration ?? 10;
          gameTimerEndTime = Date.now() + minutes * 60 * 1000;
          gameTimerAlertShown = false;
          startGameTimer();
        }
      }
    });
  }
  const highContrastEl = document.getElementById('settings-high-contrast');
  if (highContrastEl) {
    highContrastEl.addEventListener('change', (e) => {
      db.settings.highContrast = e.target.checked;
      saveDB();
      document.body.classList.toggle('high-contrast', !!db.settings.highContrast);
    });
  }

  const fontEl = document.getElementById('settings-grid-font');
  if (fontEl) {
    fontEl.addEventListener('change', (e) => {
      db.settings.gridFont = e.target.value;
      saveDB();
      applySelectedFont();
    });
  }

  const fontColorEl = document.getElementById('settings-grid-font-color');
  if (fontColorEl) {
    fontColorEl.addEventListener('change', (e) => {
      db.settings.gridFontColor = e.target.value;
      saveDB();
      applySelectedFont();
    });
  }

  const fontColorDefEl = document.getElementById('settings-grid-font-color-default');
  if (fontColorDefEl) {
    fontColorDefEl.addEventListener('change', (e) => {
      db.settings.useDefaultFontColor = e.target.checked;
      if (fontColorEl) fontColorEl.disabled = e.target.checked;
      saveDB();
      applySelectedFont();
    });
  }

  const fontBoldBtn = document.getElementById('settings-grid-font-bold-btn');
  if (fontBoldBtn) {
    fontBoldBtn.addEventListener('click', () => {
      playSound('click');
      db.settings.gridFontBold = !db.settings.gridFontBold;
      fontBoldBtn.classList.toggle('active', db.settings.gridFontBold);
      saveDB();
      applySelectedFont();
    });
  }

  const qnColorEl = document.getElementById('settings-grid-qn-color');
  if (qnColorEl) {
    qnColorEl.addEventListener('change', (e) => {
      db.settings.gridQnColor = e.target.value;
      saveDB();
      applySelectedFont();
    });
  }

  const qnColorDefEl = document.getElementById('settings-grid-qn-color-default');
  if (qnColorDefEl) {
    qnColorDefEl.addEventListener('change', (e) => {
      db.settings.useDefaultQnColor = e.target.checked;
      if (qnColorEl) qnColorEl.disabled = e.target.checked;
      saveDB();
      applySelectedFont();
    });
  }

  const applyAllEl = document.getElementById('settings-font-apply-all');
  if (applyAllEl) {
    applyAllEl.addEventListener('change', (e) => {
      db.settings.applyFontToAll = e.target.checked;
      saveDB();
      applySelectedFont();
    });
  }

  const videoFeedbackEl = document.getElementById('settings-play-video-feedback');
  if (videoFeedbackEl) {
    videoFeedbackEl.addEventListener('change', (e) => {
      db.settings.playVideoFeedback = e.target.checked;
      document.getElementById('video-feedback-options').style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        const emojiEl = document.getElementById('settings-play-emoji-feedback');
        if (emojiEl && emojiEl.checked) {
          emojiEl.checked = false;
          db.settings.playEmojiFeedback = false;
          const emojiOpts = document.getElementById('emoji-feedback-options');
          if (emojiOpts) emojiOpts.style.display = 'none';
        }
      }
      saveDB();
    });
  }

  const emojiFeedbackEl = document.getElementById('settings-play-emoji-feedback');
  if (emojiFeedbackEl) {
    emojiFeedbackEl.addEventListener('change', (e) => {
      db.settings.playEmojiFeedback = e.target.checked;
      const emojiOpts = document.getElementById('emoji-feedback-options');
      if (emojiOpts) emojiOpts.style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        const videoEl = document.getElementById('settings-play-video-feedback');
        if (videoEl && videoEl.checked) {
          videoEl.checked = false;
          db.settings.playVideoFeedback = false;
          const videoOpts = document.getElementById('video-feedback-options');
          if (videoOpts) videoOpts.style.display = 'none';
        }
      }
      saveDB();
    });
  }

  const emojiModeEl = document.getElementById('settings-emoji-mode');
  if (emojiModeEl) {
    emojiModeEl.addEventListener('change', (e) => {
      db.settings.emojiMode = e.target.value;
      saveDB();
    });
  }

  const customEmojiEl = document.getElementById('settings-enable-custom-emoji');
  if (customEmojiEl) {
    customEmojiEl.addEventListener('change', (e) => {
      db.settings.enableCustomPerQuestionEmoji = e.target.checked;
      saveDB();
      toggleQuestionEditorEmojiInputs();
    });
  }

  const posEmojiEl = document.getElementById('settings-positive-emojis');
  if (posEmojiEl) {
    posEmojiEl.addEventListener('change', (e) => {
      db.settings.positiveEmojis = e.target.value;
      saveDB();
    });
  }

  const negEmojiEl = document.getElementById('settings-negative-emojis');
  if (negEmojiEl) {
    negEmojiEl.addEventListener('change', (e) => {
      db.settings.negativeEmojis = e.target.value;
      saveDB();
    });
  }

  const customFeedbackEl = document.getElementById('settings-use-custom-feedback');
  if (customFeedbackEl) {
    customFeedbackEl.addEventListener('change', (e) => {
      db.settings.useCustomFeedbackVideos = e.target.checked;
      document.getElementById('custom-video-uploads').style.display = e.target.checked ? 'flex' : 'none';
      saveDB();
    });
  }

  // File Upload Handlers for Custom Feedback Videos
  const handleFeedbackVideoUpload = async (type, file) => {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const base64Str = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      const mime = file.type || 'video/mp4';
      const dataUri = `data:${mime};base64,${base64Str}`;
      await saveVideoToIndexedDB(`feedback-${type}`, dataUri);
      document.getElementById(`status-feedback-${type}`).textContent = `Custom video saved! (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
      document.getElementById(`btn-clear-feedback-${type}`).style.display = 'inline-block';
      triggerAlert('SYSTEM', `Custom ${type} video saved successfully!`, 'gain');
    } catch (err) {
      console.error('Failed to read/save feedback video', err);
      triggerAlert('SYSTEM', 'Error saving custom video. File might be too large.', 'lose');
    }
  };

  ['correct', 'wrong', 'winner'].forEach(type => {
    const inputEl = document.getElementById(`upload-feedback-${type}`);
    const clearBtn = document.getElementById(`btn-clear-feedback-${type}`);

    if (inputEl) {
      inputEl.addEventListener('change', (e) => {
        handleFeedbackVideoUpload(type, e.target.files[0]);
        e.target.value = ''; // reset
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await deleteVideoFromIndexedDB(`feedback-${type}`);
        document.getElementById(`status-feedback-${type}`).textContent = 'No video selected';
        clearBtn.style.display = 'none';
        triggerAlert('SYSTEM', `Custom ${type} video cleared.`, 'gain');
      });
    }

    // Check if video exists to show clear button initially
    getVideoFromIndexedDB(`feedback-${type}`).then(data => {
      if (data) {
        const statusEl = document.getElementById(`status-feedback-${type}`);
        if (statusEl) statusEl.textContent = 'Custom video stored';
        if (clearBtn) clearBtn.style.display = 'inline-block';
      }
    });
  });

  // Collapsible Advanced Utilities Drawer Toggle
  const toggleDrawerBtn = document.getElementById('btn-toggle-utility-drawer');
  const drawerContent = document.getElementById('admin-utility-drawer');
  const drawerArrow = document.getElementById('utility-drawer-arrow');
  const utilityBar = document.querySelector('.admin-grid-utility-bar');

  if (toggleDrawerBtn && drawerContent) {
    toggleDrawerBtn.addEventListener('click', () => {
      playSound('click');
      const isExpanded = drawerContent.classList.toggle('expanded');
      if (utilityBar) utilityBar.classList.toggle('expanded', isExpanded);

      if (isExpanded) {
        drawerContent.style.maxHeight = drawerContent.scrollHeight + "px";
        if (drawerArrow) drawerArrow.style.transform = 'rotate(180deg)';
      } else {
        drawerContent.style.maxHeight = '0';
        if (drawerArrow) drawerArrow.style.transform = 'rotate(0deg)';
      }
    });
  }

  // Question Editor custom video upload
  const videoInput = document.getElementById('q-video-file');
  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('q-video-status');
      if (statusEl) statusEl.textContent = "Loading video...";

      const reader = new FileReader();
      reader.onload = function (ev) {
        currentUploadedVideoBase64 = ev.target.result;
        if (statusEl) statusEl.textContent = `✅ Loaded: ${file.name}`;
        const clearBtn = document.getElementById('btn-clear-q-video');
        if (clearBtn) clearBtn.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });
  }

  const clearVideoBtn = document.getElementById('btn-clear-q-video');
  if (clearVideoBtn) {
    clearVideoBtn.addEventListener('click', () => {
      currentUploadedVideoBase64 = null;
      const fileInput = document.getElementById('q-video-file');
      if (fileInput) fileInput.value = '';
      const statusEl = document.getElementById('q-video-status');
      if (statusEl) statusEl.textContent = 'No video selected';
      clearVideoBtn.style.display = 'none';
    });
  }

  // Question Editor - Correct Video Upload
  const videoCorrectInput = document.getElementById('q-video-correct-file');
  if (videoCorrectInput) {
    videoCorrectInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('q-video-correct-status');
      if (statusEl) statusEl.textContent = "Loading video...";

      const reader = new FileReader();
      reader.onload = function (ev) {
        currentUploadedCorrectVideo = ev.target.result;
        if (statusEl) statusEl.textContent = `✅ Loaded: ${file.name}`;
        const clearBtn = document.getElementById('btn-clear-q-video-correct');
        if (clearBtn) clearBtn.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });
  }

  const clearCorrectVideoBtn = document.getElementById('btn-clear-q-video-correct');
  if (clearCorrectVideoBtn) {
    clearCorrectVideoBtn.addEventListener('click', () => {
      currentUploadedCorrectVideo = null;
      const fileInput = document.getElementById('q-video-correct-file');
      if (fileInput) fileInput.value = '';
      const statusEl = document.getElementById('q-video-correct-status');
      if (statusEl) statusEl.textContent = 'No video selected';
      clearCorrectVideoBtn.style.display = 'none';
    });
  }

  // Question Editor - Wrong Video Upload
  const videoWrongInput = document.getElementById('q-video-wrong-file');
  if (videoWrongInput) {
    videoWrongInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('q-video-wrong-status');
      if (statusEl) statusEl.textContent = "Loading video...";

      const reader = new FileReader();
      reader.onload = function (ev) {
        currentUploadedWrongVideo = ev.target.result;
        if (statusEl) statusEl.textContent = `✅ Loaded: ${file.name}`;
        const clearBtn = document.getElementById('btn-clear-q-video-wrong');
        if (clearBtn) clearBtn.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });
  }

  const clearWrongVideoBtn = document.getElementById('btn-clear-q-video-wrong');
  if (clearWrongVideoBtn) {
    clearWrongVideoBtn.addEventListener('click', () => {
      currentUploadedWrongVideo = null;
      const fileInput = document.getElementById('q-video-wrong-file');
      if (fileInput) fileInput.value = '';
      const statusEl = document.getElementById('q-video-wrong-status');
      if (statusEl) statusEl.textContent = 'No video selected';
      clearWrongVideoBtn.style.display = 'none';
    });
  }
});

// Dynamic Scaling Engine
function applyDynamicScaling() {
  if (getFullscreenState()) {
    document.body.style.zoom = 1;
    return;
  }
  const screenW = window.screen.width || 1920;
  const screenH = window.screen.height || 1080;

  // Base scale off inner size vs full screen resolution
  const scaleX = window.innerWidth / screenW;
  const scaleY = window.innerHeight / screenH;

  // Use the smaller ratio so nothing gets clipped
  const scale = Math.min(scaleX, scaleY);
  document.body.style.zoom = scale;
}
window.addEventListener('resize', applyDynamicScaling);
window.addEventListener('load', applyDynamicScaling);



