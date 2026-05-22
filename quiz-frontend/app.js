/* ==========================================================================
   REVIEW GAME GROUP C - 2026 — COMPLETE GAME LOGIC
   Refined & production-ready
   ========================================================================== */

// ============================================================
// CONSTANTS
// ============================================================
const GRID_COLS = 5; // 5 columns fixed
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
  settings: { subtractOnWrong: true, totalQuestions: 20, displayMode: 'QUESTION_POINTS' },
  questions: [], // each: { id, qnIndex, type, question, options, answer, points }
  teams: [...DEFAULT_TEAMS],
};

let gameTimerInterval = null;
let gameTimerEndTime = null;
let gameTimerAlertShown = false;

function startGameTimer() {
  clearInterval(gameTimerInterval);
  const display = document.getElementById('game-timer-display');
  if (display) display.style.display = 'flex';
  
  gameTimerInterval = setInterval(() => {
    if (!gameTimerEndTime || playState.phase !== 'live') {
       clearInterval(gameTimerInterval);
       if (playState.phase !== 'live' && display) display.style.display = 'none';
       return;
    }
    const now = Date.now();
    let left = Math.max(0, gameTimerEndTime - now);
    
    if (left <= 60000 && !gameTimerAlertShown && left > 0) {
      gameTimerAlertShown = true;
      triggerAlert('SYSTEM', '1 Minute Remaining!', 'lose');
      saveGameState();
    }
    
    if (left === 0) {
      clearInterval(gameTimerInterval);
      if (display) display.textContent = 'Time Left: 00:00';
      closeModal();
      endGame();
      return;
    }
    
    const totalSecs = Math.floor(left / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    if (display) {
      display.textContent = `Time Left: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

function clearGameTimer() {
  clearInterval(gameTimerInterval);
  gameTimerEndTime = null;
  gameTimerAlertShown = false;
  const display = document.getElementById('game-timer-display');
  if (display) display.style.display = 'none';
}

let playState = {
  activeScreen: 'dashboard',
  gameState: 'IDLE', // IDLE | QUESTION_LOADING | AWAITING_FIRST_ANSWER | AWAITING_STEAL | RESOLVED
  phase: 'live',   // live | ended
  teams: [],           // [{ name, score }]
  currentTeamIndex: 0,
  hasPassed: false,
  stealAttempted: false,
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
    this.color = ['#F4C430','#38D9F5','#FF6B9D','#7EE8A2','#ffffff','#A78BFA'][Math.floor(Math.random() * 6)];
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
  return `Qn${qnIndex}`;
}

// ============================================================
// SCREEN MANAGER
// ============================================================
const screens = {
  dashboard: document.getElementById('screen-dashboard'),
  admin:     document.getElementById('screen-admin'),
  game:      document.getElementById('screen-game'),
  winner:    document.getElementById('screen-winner'),
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
}

// ============================================================
// PERSISTENCE (localStorage)
// ============================================================
function saveDB() {
  localStorage.setItem('review_game_db', JSON.stringify(db));
  updateDashboardStatus();
}

function loadDB() {
  const stored = localStorage.getItem('review_game_db');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        db = {
          settings: {
            subtractOnWrong: parsed.settings?.subtractOnWrong ?? true,
            totalQuestions: parsed.settings?.totalQuestions ?? 20,
            displayMode: parsed.settings?.displayMode ?? 'QUESTION_POINTS'
          },
          questions: parsed.questions || [],
          teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
            ? parsed.teams.map((t, i) => typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : t)
            : [...DEFAULT_TEAMS],
        };
      }
    } catch (e) {
      console.warn('Review Game: DB load error, using defaults', e);
    }
  }

  // Populate Admin Inputs
  const t1Name = document.getElementById('admin-team1-name');
  if (t1Name) t1Name.value = db.teams[0].name;
  const t2Name = document.getElementById('admin-team2-name');
  if (t2Name) t2Name.value = db.teams[1].name;

  // Sync UI
  const subEl = document.getElementById('settings-subtract');
  if (subEl) subEl.checked = !!db.settings.subtractOnWrong;
  const totEl = document.getElementById('settings-total-questions');
  if (totEl) totEl.value = db.settings.totalQuestions;
  const modeEl = document.getElementById('settings-display-mode');
  if (modeEl) modeEl.value = db.settings.displayMode;
  updateDashboardStatus();
}

function updateDashboardStatus() {
  const statusDiv = document.getElementById('dashboard-status');
  const startBtn  = document.getElementById('btn-start-game');
  const count = db.questions.length;

  if (count === 0) {
    statusDiv.innerHTML = `
      <div class="bold-text">⚠️ No questions configured yet!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">Open the Admin Panel (⚙️) to add questions.</p>`;
    startBtn.disabled = true;
  } else {
    statusDiv.innerHTML = `
      <div class="bold-text" style="color:var(--color-success);">✅ Quiz ready!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">
        <strong style="color:var(--color-text-light);">${count}</strong> question${count !== 1 ? 's' : ''} added. Good to go!
      </p>`;
    startBtn.disabled = false;
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
    hasPassed: playState.hasPassed,
    stealAttempted: playState.stealAttempted,
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
        playState.hasPassed = parsed.hasPassed ?? false;
        playState.stealAttempted = parsed.stealAttempted ?? parsed.currentQuestion?.stealAttempted ?? false;
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
            const hPassed = playState.hasPassed;
            const sAttempted = playState.stealAttempted;
            const cLocked = playState.cancelLocked;
            
            playState.gameState = 'IDLE';
            openQuestionModal(cId, q);
            
            playState.gameState = gState;
            playState.hasPassed = hPassed;
            playState.stealAttempted = sAttempted;
            playState.cancelLocked = cLocked;
            
            if (playState.gameState === 'AWAITING_STEAL') {
              const stealPts = Math.floor(q.points / 2);
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




function loadDefaultQuiz() {
  const data = {
  "settings": {
    "subtractOnWrong": true,
    "totalQuestions": 20,
    "displayMode": "QUESTION_NUMBER"
  },
  "questions": [
    {
      "id": "q1",
      "qnIndex": 1,
      "type": "mcq",
      "question": "What new name was given to Daniel in Babylon?",
      "options": [
        "Belteshazzar",
        "Shadrach",
        "Meshach",
        "Abednego"
      ],
      "answer": "Belteshazzar",
      "points": 100
    },
    {
      "id": "q2",
      "qnIndex": 2,
      "type": "fill",
      "question": "What did Daniel and his friends refuse to consume?",
      "options": [],
      "answer": "The king's food and wine",
      "points": 100
    },
    {
      "id": "q3",
      "qnIndex": 3,
      "type": "mcq",
      "question": "How many days did Daniel ask to be tested on a diet of vegetables and water?",
      "options": [
        "7 days",
        "10 days",
        "12 days",
        "40 days"
      ],
      "answer": "10 days",
      "points": 100
    },
    {
      "id": "q4",
      "qnIndex": 4,
      "type": "mcq",
      "question": "What was the statue's head made of in Nebuchadnezzar's dream?",
      "options": [
        "Silver",
        "Bronze",
        "Iron",
        "Gold"
      ],
      "answer": "Gold",
      "points": 200
    },
    {
      "id": "q5",
      "qnIndex": 5,
      "type": "fill",
      "question": "What hit the statue and smashed it to pieces in the dream?",
      "options": [],
      "answer": "A stone cut out without hands",
      "points": 200
    },
    {
      "id": "q6",
      "qnIndex": 6,
      "type": "mcq",
      "question": "Who were thrown into the fiery furnace for refusing to bow to the golden image?",
      "options": [
        "Daniel and his friends",
        "Shadrach, Meshach, Abednego",
        "The wise men of Babylon",
        "The king's guards"
      ],
      "answer": "Shadrach, Meshach, Abednego",
      "points": 100
    },
    {
      "id": "q7",
      "qnIndex": 7,
      "type": "mcq",
      "question": "How many men did the king see walking in the fiery furnace?",
      "options": [
        "Two",
        "Three",
        "Four",
        "Five"
      ],
      "answer": "Four",
      "points": 100
    },
    {
      "id": "q8",
      "qnIndex": 8,
      "type": "fill",
      "question": "What happened to Nebuchadnezzar when he became too proud?",
      "options": [],
      "answer": "He lived like a wild animal",
      "points": 300
    },
    {
      "id": "q9",
      "qnIndex": 9,
      "type": "mcq",
      "question": "Which king saw the handwriting on the wall during a great feast?",
      "options": [
        "Nebuchadnezzar",
        "Belshazzar",
        "Darius",
        "Cyrus"
      ],
      "answer": "Belshazzar",
      "points": 200
    },
    {
      "id": "q10",
      "qnIndex": 10,
      "type": "mcq",
      "question": "What were the words written on the wall?",
      "options": [
        "Mene, Mene, Tekel, Upharsin",
        "Holy, Holy, Holy",
        "Babylon is Fallen",
        "Repent and Believe"
      ],
      "answer": "Mene, Mene, Tekel, Upharsin",
      "points": 200
    },
    {
      "id": "q11",
      "qnIndex": 11,
      "type": "mcq",
      "question": "Which king threw Daniel into the lions' den?",
      "options": [
        "Nebuchadnezzar",
        "Belshazzar",
        "Darius",
        "Cyrus"
      ],
      "answer": "Darius",
      "points": 100
    },
    {
      "id": "q12",
      "qnIndex": 12,
      "type": "fill",
      "question": "Why was Daniel thrown into the lions' den?",
      "options": [],
      "answer": "For praying to God",
      "points": 100
    },
    {
      "id": "q13",
      "qnIndex": 13,
      "type": "mcq",
      "question": "How did God protect Daniel in the lions' den?",
      "options": [
        "He made the lions sleep",
        "He sent an angel to shut their mouths",
        "He gave Daniel a sword",
        "He blinded the lions"
      ],
      "answer": "He sent an angel to shut their mouths",
      "points": 100
    },
    {
      "id": "q14",
      "qnIndex": 14,
      "type": "mcq",
      "question": "What was the first beast Daniel saw in his vision of the four beasts?",
      "options": [
        "A bear",
        "A leopard",
        "A lion with eagle's wings",
        "A terrifying beast with iron teeth"
      ],
      "answer": "A lion with eagle's wings",
      "points": 300
    },
    {
      "id": "q15",
      "qnIndex": 15,
      "type": "mcq",
      "question": "Which angel came to explain Daniel's visions to him?",
      "options": [
        "Michael",
        "Gabriel",
        "Raphael",
        "Lucifer"
      ],
      "answer": "Gabriel",
      "points": 200
    },
    {
      "id": "q16",
      "qnIndex": 16,
      "type": "fill",
      "question": "How many weeks were decreed in Daniel's vision of the future?",
      "options": [],
      "answer": "70 weeks",
      "points": 400
    },
    {
      "id": "q17",
      "qnIndex": 17,
      "type": "mcq",
      "question": "Who is the 'Prince' that stands watch over Daniel's people?",
      "options": [
        "Gabriel",
        "Michael",
        "The King of Persia",
        "The King of Greece"
      ],
      "answer": "Michael",
      "points": 300
    },
    {
      "id": "q18",
      "qnIndex": 18,
      "type": "mcq",
      "question": "What did King Nebuchadnezzar do when Shadrach, Meshach, and Abednego survived the fire?",
      "options": [
        "He executed his guards",
        "He praised their God and promoted them",
        "He banished them from Babylon",
        "He ignored the miracle"
      ],
      "answer": "He praised their God and promoted them",
      "points": 200
    },
    {
      "id": "q19",
      "qnIndex": 19,
      "type": "fill",
      "question": "In what city did Daniel serve under multiple kings?",
      "options": [],
      "answer": "Babylon",
      "points": 100
    },
    {
      "id": "q20",
      "qnIndex": 20,
      "type": "mcq",
      "question": "What did Daniel do three times a day, facing Jerusalem?",
      "options": [
        "Ate vegetables",
        "Sang hymns",
        "Prayed and gave thanks to God",
        "Offered a sacrifice"
      ],
      "answer": "Prayed and gave thanks to God",
      "points": 100
    }
  ],
  "teams": [
    {
      "name": "Lion",
      "logo": "lion.png"
    },
    {
      "name": "Lioness",
      "logo": "lioness.png"
    }
  ]
};
  db = data;
  saveDB();
  loadDB();
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  resetPlayState();
  saveGameState();
  updateGameStatusUI();
  renderAdminGrid();
  
  // Flash a quick success message on the status board instead of a blocking alert
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

// ============================================================
// ADMIN — GRID
// ============================================================
let selectedAdminCellId = null;

function renderAdminGrid() {
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;

  document.getElementById('admin-q-count').textContent = `Questions added: ${db.questions.length}`;

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / GRID_COLS);
  const totalCells = rows * GRID_COLS;

  for (let qn = 1; qn <= totalCells; qn++) {
    const cId = cellId(qn);
    const q = db.questions.find(x => x.qnIndex === qn);
    const cell = document.createElement('div');
    
    if (qn > total) {
      cell.className = 'board-cell cell-disabled';
      cell.style.opacity = '0.2';
      cell.innerHTML = '<span class="cell-qn-label">—</span>';
      container.appendChild(cell);
      continue;
    }

    const answered = playState.answeredCells[cId];
    const isPlayed = !!(playState.teams && playState.teams.length > 0 && answered);

    cell.className = `board-cell ${q ? 'has-q' : ''} ${selectedAdminCellId === cId ? 'selected-edit' : ''} ${isPlayed ? 'cell-played-locked' : ''}`;
    cell.dataset.cellId = cId;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${qnLabel(qn)}: ${q ? 'Edit question' : 'Add question'}`);

    const labelEl = document.createElement('span');
    labelEl.className = 'cell-qn-label';
    if (db.settings.displayMode === 'POINTS_ONLY') {
      labelEl.textContent = q ? q.points : qnLabel(qn);
    } else if (db.settings.displayMode === 'QUESTION_ONLY') {
      labelEl.textContent = qnLabel(qn);
    } else {
      labelEl.innerHTML = q ? `${qnLabel(qn)}<br><span style="font-size:0.8em">${q.points}</span>` : qnLabel(qn);
    }
    cell.appendChild(labelEl);

    const tagEl = document.createElement('span');
    tagEl.className = 'cell-info-tag';
    if (isPlayed) {
      tagEl.textContent = '🔒 Played';
      tagEl.style.color = 'var(--color-danger)';
      tagEl.style.fontWeight = 'bold';
    } else {
      tagEl.textContent = q ? (q.type === 'mcq' ? '🔘 MCQ' : '✏️ Fill') : '+ Add';
    }
    cell.appendChild(tagEl);

    cell.addEventListener('click', () => {
      if(!canInteract()) return;
      if (isPlayed) {
        playSound('wrong');
        triggerAlert("ADMIN", `Qn ${qn} has already been played and cannot be changed!`, "lose");
        return;
      }
      playSound('click');
      selectedAdminCellId = cId;
      openQuestionEditor(qn);
      renderAdminGrid();
    });
    container.appendChild(cell);
  }
}

function openQuestionEditor(qnIndex) {
  const cId = cellId(qnIndex);
  const q = db.questions.find(x => x.qnIndex === qnIndex);
  document.getElementById('editor-cell-title').textContent = `📝 Editing ${qnLabel(qnIndex)}`;
  document.getElementById('admin-question-editor').classList.remove('hidden');

  const form = document.getElementById('question-form');
  form.reset();

  if (q) {
    document.getElementById('q-type').value = q.type;
    document.getElementById('q-text').value = q.question;
    document.getElementById('q-points').value = q.points;

    const isMCQ = q.type === 'mcq';
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
    document.getElementById('btn-delete-question').style.display = 'inline-flex';
  } else {
    document.getElementById('q-type').value = 'fill';
    document.getElementById('q-text').value = '';
    document.getElementById('q-points').value = 100;
    document.getElementById('mcq-options-container').classList.add('hidden');
    document.getElementById('fill-answer-container').classList.remove('hidden');
    setMCQRequired(false);
    document.getElementById('btn-delete-question').style.display = 'none';
  }

  document.getElementById('admin-question-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  container.style.gridTemplateColumns = `repeat(${GRID_COLS}, 1fr)`;

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / GRID_COLS);
  const totalCells = rows * GRID_COLS;

  for (let qn = 1; qn <= totalCells; qn++) {
    const cId = cellId(qn);
    const q = db.questions.find(x => x.qnIndex === qn);
    const btn = document.createElement('button');
    btn.dataset.cellId = cId;
    
    if (qn > total) {
      btn.className = 'game-cell-btn cell-disabled';
      btn.disabled = true;
      btn.style.opacity = '0.2';
      btn.innerHTML = `<span class="cell-qn">—</span>`;
      container.appendChild(btn);
      continue;
    }

    btn.setAttribute('aria-label', qnLabel(qn));
    const answered = playState.answeredCells[cId];
    
    let displayHtml = qnLabel(qn);
    if (q) {
      if (db.settings.displayMode === 'POINTS_ONLY') {
        displayHtml = q.points;
      } else if (db.settings.displayMode === 'QUESTION_ONLY') {
        displayHtml = qnLabel(qn);
      } else {
        displayHtml = `${qnLabel(qn)}<br><span style="font-size:0.8em">${q.points}</span>`;
      }
    }

    if (!q) {
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
    } else if (answered && answered.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="font-size: 2.5rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">${displayHtml}</span>`;
    } else if (answered) {
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
      if (answered.teamIndex === -1) {
        btn.style.background = 'rgba(128, 128, 128, 0.2)';
        btn.style.borderColor = 'rgba(128, 128, 128, 0.4)';
        btn.style.opacity = '0.75';
        btn.innerHTML = `<span class="cell-qn" style="font-size: 2.5rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">${displayHtml}</span>`;
      } else {
        const team = playState.teams[answered.teamIndex];
        const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = `<span class="cell-qn" style="color:var(--color-success); font-size: 2.5rem; font-weight: bold;">✔</span><span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
      }
    } else {
      btn.className = 'game-cell-btn';
      btn.innerHTML = `<span class="cell-qn" style="text-align:center; line-height:1.2;">${displayHtml}</span>`;
      btn.addEventListener('click', () => {
        if (!canInteract() || !canOpenCell()) return;
        playSound('open');
        openQuestionModal(cId, q);
      });
    }
    container.appendChild(btn);
  }
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
  playState.hasPassed = false;
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
  const canPass = q && !playState.hasPassed && !playState.stealAttempted;
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
  playState.hasPassed = false;
  playState.stealAttempted = false;
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

  const mcqContainer  = document.getElementById('modal-mcq-container');
  const fillContainer = document.getElementById('modal-fill-container');
  const revealPanel   = document.getElementById('modal-reveal-panel');
  revealPanel.classList.add('hidden');

  // Reset correct answer reveal button inside fill container
  const btnShowCorrectAnswer = document.getElementById('btn-show-correct-answer');
  if (btnShowCorrectAnswer) {
    btnShowCorrectAnswer.disabled = false;
    btnShowCorrectAnswer.style.cursor = '';
  }

  if (q.type === 'mcq') {
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

  document.getElementById('modal-correct-answer-text').textContent = q.answer;
  const contentNode = document.querySelector('.modal-content');
  contentNode.classList.remove('feedback-correct', 'feedback-wrong');
  const btnNext = document.getElementById('btn-modal-next');
  if(btnNext) {
    btnNext.style.display = 'none';
    btnNext.disabled = true;
  }
  const btnSubmit = document.getElementById('btn-modal-submit');
  if(btnSubmit) btnSubmit.style.display = 'inline-flex';
  
  overlay.classList.add('open');
  
  transitionState('AWAITING_FIRST_ANSWER');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  playState.currentCellId = null;
  playState.currentQuestion = null;
  playState.hasPassed = false;
  playState.stealAttempted = false;
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
  saveGameState();
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

function playWrongAnswerVideo(onClosed) {
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
  video.src = 'worng_answer_cartoon.mp4';
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

function playCorrectAnswerVideo(onClosed) {
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
  video.src = 'correct_answer.mp4';
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

function showCustomConfirm(message, onConfirm) {
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
  icon.textContent = '⚠️';
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
  subtext.textContent = 'This action cannot be undone.';
  subtext.style.fontSize = '0.95rem';
  subtext.style.color = 'var(--color-text-muted)';
  subtext.style.marginBottom = '28px';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '14px';
  actions.style.justifyContent = 'center';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'No';
  cancelBtn.style.padding = '12px 28px';
  cancelBtn.style.fontSize = '1.05rem';
  cancelBtn.style.borderRadius = 'var(--radius-pill)';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.textContent = 'Yes';
  confirmBtn.style.padding = '12px 32px';
  confirmBtn.style.fontSize = '1.05rem';
  confirmBtn.style.borderRadius = 'var(--radius-pill)';

  const close = (confirmed) => {
    overlay.style.opacity = '0';
    card.style.transform = 'scale(0.8)';
    setTimeout(() => {
      overlay.remove();
      if (confirmed) onConfirm();
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



function resolveAnswer(isCorrect) {
  const q = playState.currentQuestion;
  if (!q || !canAnswer()) return;

  const cId = playState.currentCellId;
  const teamIndex = playState.currentTeamIndex;
  const pts = playState.hasPassed ? Math.floor(q.points / 2) : q.points;

  if (isCorrect) {
    transitionState('RESOLVED');
    playSound('correct');
    disableQuestionInputs();

    applyScore(teamIndex, pts, false, true); // Safe scoring via controlled engine
    triggerBurst();
    updateScoreUI(teamIndex);
    saveGameState();

    playState.answeredCells[cId] = { teamIndex, pointsWon: pts, cancelled: false };
    if (playState.stats[teamIndex]) {
      playState.stats[teamIndex].correct++;
      playState.stats[teamIndex].attempts++;
    }

    const contentNode = document.querySelector('.modal-content');
    contentNode.classList.remove('feedback-wrong');
    contentNode.classList.add('feedback-correct');

    document.getElementById('modal-correct-answer-text').textContent = q.answer;
    document.getElementById('modal-reveal-panel').classList.remove('hidden');
    
    const turnStatus = document.getElementById('modal-turn-status');
    turnStatus.textContent = "Correct Answer!";
    turnStatus.style.color = "var(--color-success)";
    turnStatus.style.borderColor = "var(--color-success)";

    playState.cancelLocked = true;
    const btnCancel = document.getElementById('btn-modal-cancel');
    if (btnCancel) btnCancel.disabled = true;

    saveGameState();
    switchTurn();
    enableNextButton();

  } else {
    playSound('wrong');
    if (playState.stats[teamIndex]) playState.stats[teamIndex].attempts++;

    if (!playState.hasPassed && !playState.stealAttempted) {
      // First wrong -> Penalize and Steal
      const penalty = Math.floor(q.points / 2);
      
      playWrongAnswerVideo(() => {
        applyScore(teamIndex, penalty, true, true); // Safe scoring via controlled engine
        updateScoreUI(teamIndex);
        saveGameState();
      });

      transitionState('AWAITING_STEAL');

      playState.stealAttempted = true;
      saveGameState();
      startStealPhase();
    } else {
      // Second wrong -> Penalize and Resolve
      
      playWrongAnswerVideo(() => {
        applyScore(teamIndex, pts, true, true); // Safe scoring via controlled engine
        updateScoreUI(teamIndex);
        saveGameState();
      });

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

      document.getElementById('modal-correct-answer-text').textContent = q.answer;
      document.getElementById('modal-reveal-panel').classList.remove('hidden');

      playState.cancelLocked = true;
      const btnCancel = document.getElementById('btn-modal-cancel');
      if (btnCancel) btnCancel.disabled = true;

      saveGameState();
      switchTurn();
      enableNextButton();
    }
  }
}

function startStealPhase() {
  playState.hasPassed = true;
  const nextTeamIndex = (playState.currentTeamIndex + 1) % playState.teams.length;
  playState.currentTeamIndex = nextTeamIndex;

  const q = playState.currentQuestion;
  const stealPts = Math.floor(q.points / 2);
  document.getElementById('modal-points-display').textContent = `${stealPts} POINTS - STEAL`;
  
  // Disable previously selected option if any
  document.querySelectorAll('.option-btn.selected').forEach(btn => btn.disabled = true);

  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.innerHTML = `❌ Wrong Answer<br><span style="font-size:0.8rem;">Passed to ${playState.teams[nextTeamIndex].name}</span>`;
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
  if (!q || playState.hasPassed || playState.stealAttempted) return;
  playSound('pass');

  playState.stealAttempted = true;
  transitionState('AWAITING_STEAL');
  saveGameState();
  startStealPhase();
  
  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.style.color = "var(--color-gold)";
  turnStatus.style.borderColor = "var(--color-gold)";

  document.getElementById('btn-modal-pass').style.display = 'none';
}

// ============================================================
// GAME OVER CHECK
// ============================================================
function checkGameOver() {
  const allAnsweredOrCancelled = db.questions.every(q => {
    const cId = cellId(q.qnIndex);
    return !!playState.answeredCells[cId];
  });
  if (allAnsweredOrCancelled && db.questions.length > 0) {
    endGame();
  }
}

function endGame() {
  clearGameTimer();
  playState.phase = 'ended';
  saveGameState();
  const sorted = playState.teams
    .map((t, idx) => ({ ...t, index: idx }))
    .sort((a, b) => b.score - a.score);

  const winner = sorted[0];
  const tie = sorted.length > 1 && sorted[0].score === sorted[1].score;

  if (tie) {
    document.getElementById('winner-badge').textContent = "IT'S A TIE! 🤝";
    document.getElementById('winner-team-name').textContent = 'Perfectly Matched!';
    document.getElementById('winner-subtitle').textContent = 'Top teams finished with equal scores! Great job everyone!';
  } else {
    document.getElementById('winner-badge').textContent = 'CHAMPION! 🏆';
    document.getElementById('winner-team-name').textContent = `${winner.name.toUpperCase()} WINS!`;
    document.getElementById('winner-subtitle').textContent = `Congratulations to ${winner.name} on their incredible victory!`;
  }

  const standingsContainer = document.getElementById('winner-standings-container');
  if (standingsContainer) {
    standingsContainer.innerHTML = '';
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

  const statsDiv = document.getElementById('winner-stats');
  if (statsDiv) {
    let html = '';
    playState.teams.forEach((team, i) => {
      const stat = playState.stats[i] || { correct: 0, attempts: 0 };
      html += `<p>• <strong>${team.name}</strong>: ${stat.correct} correct out of ${stat.attempts} attempts</p>`;
    });
    statsDiv.innerHTML = html;
  }

  showScreen('winner');
}

// ============================================================
// TEAMS SETUP
// ============================================================
function setupTeamsFromInputs() {
  playState.teams = db.teams.map(t => ({ name: t.name, logo: t.logo, score: 0 }));
  playState.stats = {};
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

function resetPlayState() {
  playState.teams.forEach(t => { t.score = 0; });
  playState.currentTeamIndex = 0;
  playState.hasPassed = false;
  playState.stealAttempted = false;
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

document.getElementById('btn-fullscreen-toggle')?.addEventListener('click', () => {
  playSound('click');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Fullscreen error: ${err.message}`);
    });
  } else {
    document.exitFullscreen().catch(err => {
      console.warn(`Exit fullscreen error: ${err.message}`);
    });
  }
});

document.addEventListener('fullscreenchange', () => {
  const icon = document.getElementById('fullscreen-icon');
  if (icon) {
    icon.src = document.fullscreenElement ? 'exit_fullscreen.png' : 'fullscreen.png';
  }
});

// Floating admin button (in header)
document.getElementById('btn-go-admin-float').addEventListener('click', () => {
  playSound('click');
  renderAdminGrid();
  showScreen('admin');
});

// ============================================================
// EVENT LISTENERS — Dashboard
// ============================================================
document.getElementById('btn-start-game').addEventListener('click', () => {
  playSound('open');
  setupTeamsFromInputs();
  resetPlayState();
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  gameTimerEndTime = Date.now() + 10 * 60 * 1000;
  gameTimerAlertShown = false;
  startGameTimer();
  saveGameState();
  updateGameStatusUI();
  renderGameBoard();
  updateTurnUI();
  updateScoreUI();
  showScreen('game');
});

// ============================================================
// EVENT LISTENERS — Admin Panel
// ============================================================
document.getElementById('btn-admin-back').addEventListener('click', () => {
  playSound('click');
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
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
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

// Save Game Board
const btnSaveGame = document.getElementById('btn-save-game-board');
if (btnSaveGame) {
  btnSaveGame.addEventListener('click', () => {
    playSound('click');
    saveDB();
    if (playState.phase === 'live') {
      saveGameState();
    }
    renderGameBoard();
    alert('Game Board Saved Successfully!');
  });
}

// Export JSON
document.getElementById('btn-export-json').addEventListener('click', () => {
  playSound('click');
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
  a.download = `review_game_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Import JSON
document.getElementById('import-json-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed && typeof parsed === 'object') {
        db = {
          settings: {
            subtractOnWrong: parsed.settings?.subtractOnWrong ?? true,
            totalQuestions: parsed.settings?.totalQuestions ?? 20,
            displayMode: parsed.settings?.displayMode ?? 'QUESTION_NUMBER'
          },
          questions: parsed.questions || [],
          teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
            ? parsed.teams
            : [...DEFAULT_TEAMS],
        };
        saveDB();
        document.getElementById('settings-subtract').checked = !!db.settings.subtractOnWrong;
        document.getElementById('settings-total-questions').value = db.settings.totalQuestions;
        document.getElementById('settings-display-mode').value = db.settings.displayMode;
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

// Reset game (not questions)
document.getElementById('btn-reset-game').addEventListener('click', () => {
  showCustomConfirm('Are you sure you want to reset the game? This will clear all scores, progress, and timer.', () => {
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
    showScreen('dashboard');
  });
});

// Clear all questions
document.getElementById('btn-clear-db').addEventListener('click', () => {
  showCustomConfirm('Clear all questions? This cannot be undone unless you import or reload a saved quiz.', () => {
    db.questions = [];
    saveDB();
    selectedAdminCellId = null;
    document.getElementById('admin-question-editor').classList.add('hidden');
    renderAdminGrid();
    renderGameBoard();
    playSound('wrong');
  });
});

// ============================================================
// EVENT LISTENERS — Question Editor
// ============================================================
document.getElementById('btn-close-editor').addEventListener('click', () => {
  playSound('click');
  document.getElementById('admin-question-editor').classList.add('hidden');
  selectedAdminCellId = null;
  renderAdminGrid();
});

document.getElementById('q-type').addEventListener('change', e => {
  const isMCQ = e.target.value === 'mcq';
  document.getElementById('mcq-options-container').classList.toggle('hidden', !isMCQ);
  document.getElementById('fill-answer-container').classList.toggle('hidden', isMCQ);
  setMCQRequired(isMCQ);
});

document.getElementById('question-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!selectedAdminCellId) return;
  playSound('correct');

  const qnIndex = parseInt(selectedAdminCellId.replace('qn', ''), 10);
  const type = document.getElementById('q-type').value;
  const text = document.getElementById('q-text').value.trim();
  const pts  = parseInt(document.getElementById('q-points').value, 10) || 100;
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
  };

  if (existIdx !== -1) db.questions[existIdx] = qObj;
  else db.questions.push(qObj);

  saveDB();
  document.getElementById('admin-question-editor').classList.add('hidden');
  selectedAdminCellId = null;
  renderAdminGrid();
  renderGameBoard();
});

document.getElementById('btn-delete-question').addEventListener('click', () => {
  if (!selectedAdminCellId) return;
  playSound('wrong');
  const qnIndex = parseInt(selectedAdminCellId.replace('qn', ''), 10);
  db.questions = db.questions.filter(q => q.qnIndex !== qnIndex);
  saveDB();
  document.getElementById('admin-question-editor').classList.add('hidden');
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
      fillInput.value = q.answer;
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

  if (q.type === 'mcq') {
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
    submitAnswer(val.toLowerCase() === q.answer.toLowerCase());
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
  
  showCustomConfirm('Want to confirm ending the game?', () => {
    closeModal();
    playState.phase = 'ended';
    saveGameState();
    updateGameStatusUI();
    endGame();
  });
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
  playState.gameState = 'IDLE';
  gameTimerEndTime = Date.now() + 10 * 60 * 1000;
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
  
  const modeEl = document.getElementById('settings-display-mode');
  if (modeEl) {
    modeEl.addEventListener('change', (e) => {
      db.settings.displayMode = e.target.value;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });
  }
});
