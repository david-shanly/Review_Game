/* ==========================================================================
   VBS GROUP C QUIZ — COMPLETE GAME LOGIC
   Refined & production-ready
   ========================================================================== */

// ============================================================
// CONSTANTS
// ============================================================
const TOTAL_QUESTIONS = 20;
const GRID_COLS = 4; // 4 columns × 5 rows = 20 cells
const GRID_ROWS = 5;
const DEFAULT_TEAMS = ['Boy', 'Girl'];

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
  settings: { subtractOnWrong: false },
  questions: [], // each: { id, qnIndex (1-20), type, question, options, answer, points }
  teams: [...DEFAULT_TEAMS],
};

let playState = {
  activeScreen: 'dashboard',
  teams: [],           // [{ name, score }]
  currentTeamIndex: 0,
  originalTeamIndex: 0,
  isStealState: false,
  answeredCells: {},   // { "qn1": { teamIndex, pointsWon, cancelled } }
  currentCellId: null,
  currentQuestion: null,
  stats: {},           // { teamIndex: { correct, attempts } }
};

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
}

// ============================================================
// PERSISTENCE (localStorage)
// ============================================================
function saveDB() {
  localStorage.setItem('vbs_quiz_db', JSON.stringify(db));
  updateDashboardStatus();
}

function loadDB() {
  const stored = localStorage.getItem('vbs_quiz_db');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        db = {
          settings: parsed.settings || { subtractOnWrong: false },
          questions: parsed.questions || [],
          teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
            ? parsed.teams
            : [...DEFAULT_TEAMS],
        };
      }
    } catch (e) {
      console.warn('VBS Quiz: DB load error, using defaults', e);
    }
  }

  // Sync UI
  const subEl = document.getElementById('settings-subtract');
  if (subEl) subEl.checked = !!db.settings.subtractOnWrong;
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
// THEME
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vbs_quiz_theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
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

  // Update question count badge
  document.getElementById('admin-q-count').textContent = `Questions added: ${db.questions.length}`;

  for (let qn = 1; qn <= TOTAL_QUESTIONS; qn++) {
    const cId = cellId(qn);
    const q = db.questions.find(x => x.qnIndex === qn);
    const cell = document.createElement('div');
    cell.className = `board-cell ${q ? 'has-q' : ''} ${selectedAdminCellId === cId ? 'selected-edit' : ''}`;
    cell.dataset.cellId = cId;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${qnLabel(qn)}: ${q ? 'Edit question' : 'Add question'}`);

    const labelEl = document.createElement('span');
    labelEl.className = 'cell-qn-label';
    labelEl.textContent = qnLabel(qn);
    cell.appendChild(labelEl);

    const tagEl = document.createElement('span');
    tagEl.className = 'cell-info-tag';
    tagEl.textContent = q ? (q.type === 'mcq' ? '🔘 MCQ' : '✏️ Fill') : '+ Add';
    cell.appendChild(tagEl);

    cell.addEventListener('click', () => {
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

  for (let qn = 1; qn <= TOTAL_QUESTIONS; qn++) {
    const cId = cellId(qn);
    const q = db.questions.find(x => x.qnIndex === qn);
    const btn = document.createElement('button');
    btn.dataset.cellId = cId;
    btn.setAttribute('aria-label', qnLabel(qn));

    const answered = playState.answeredCells[cId];

    if (!q) {
      // No question — empty slot
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
    } else if (answered && answered.cancelled) {
      // Cancelled
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel);">${qnLabel(qn)}</span>`;
    } else if (answered) {
      // Answered
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
      if (answered.teamIndex === -1) {
        // Wrong / no winner
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
        btn.style.opacity = '0.5';
        btn.innerHTML = `<span class="cell-qn" style="font-size:1rem; opacity:0.5;">✗</span><span class="cell-answered-tag" style="color:var(--color-text-muted);">${qnLabel(qn)}</span>`;
      } else {
        const team = playState.teams[answered.teamIndex];
        const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = `
          <span class="cell-qn" style="color:${tColor.text}; font-size:1.4rem;">✓</span>
          <span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
      }
    } else {
      // Available
      btn.className = 'game-cell-btn';
      btn.innerHTML = `<span class="cell-qn">${qnLabel(qn)}</span>`;
      btn.addEventListener('click', () => {
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
  stealBanner.classList.toggle('hidden', !playState.isStealState);

  const panels = document.querySelectorAll('.dynamic-team-panel');
  panels.forEach((panel, i) => {
    panel.classList.toggle('active-turn', i === playState.currentTeamIndex);
  });
}

function switchTurn() {
  playState.currentTeamIndex = (playState.currentTeamIndex + 1) % playState.teams.length;
  playState.isStealState = false;
  updateTurnUI();
}

// ============================================================
// SCORE UI
// ============================================================
function updateScoreUI() {
  const container = document.getElementById('game-team-panels');
  if (!container) return;
  container.innerHTML = '';

  playState.teams.forEach((team, i) => {
    const color = TEAM_COLORS[i % TEAM_COLORS.length];
    const isActive = playState.currentTeamIndex === i;
    const panel = document.createElement('div');
    panel.className = `dynamic-team-panel glass-panel ${isActive ? 'active-turn' : ''}`;
    panel.style.borderColor = isActive ? 'var(--color-gold)' : color.border;

    panel.innerHTML = `
      <span class="team-icon">${TEAM_ICONS[i % TEAM_ICONS.length]}</span>
      <div class="team-details">
        <span class="team-label">${team.name}</span>
        <span id="score-team-${i}" class="team-score" style="color:${color.text};">${team.score}</span>
      </div>
    `;
    container.appendChild(panel);
  });

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
// QUESTION MODAL
// ============================================================
function openQuestionModal(cId, q) {
  playState.currentCellId = cId;
  playState.currentQuestion = q;

  const overlay = document.getElementById('modal-overlay');

  document.getElementById('btn-modal-pass').style.display = playState.isStealState ? 'none' : 'inline-flex';
  document.getElementById('modal-steal-label').classList.toggle('hidden', !playState.isStealState);

  // Header
  const qnIndex = q.qnIndex || parseInt(cId.replace('qn', ''), 10);
  document.getElementById('modal-cell-id').textContent = qnLabel(qnIndex);
  const turnStatus = document.getElementById('modal-turn-status');
  const activeTeam = playState.teams[playState.currentTeamIndex];
  turnStatus.textContent = `${activeTeam.name.toUpperCase()}'S TURN`;

  // Question text
  document.getElementById('modal-question-text').textContent = q.question;

  // Answer containers
  const mcqContainer  = document.getElementById('modal-mcq-container');
  const fillContainer = document.getElementById('modal-fill-container');
  const revealPanel   = document.getElementById('modal-reveal-panel');
  revealPanel.classList.add('hidden');

  if (q.type === 'mcq') {
    mcqContainer.classList.remove('hidden');
    fillContainer.classList.add('hidden');
    const optBtns = document.querySelectorAll('.option-btn');
    const letters = ['A', 'B', 'C', 'D'];
    optBtns.forEach((btn, i) => {
      btn.className = 'option-btn';
      btn.querySelector('.option-letter').textContent = letters[i];
      btn.querySelector('.option-val').textContent = q.options ? q.options[i] : '';
      btn.onclick = () => {
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
    fillInput.style.borderColor = '';
    setTimeout(() => fillInput.focus(), 100);
  }

  document.getElementById('modal-correct-answer-text').textContent = q.answer;
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  playState.currentCellId = null;
  playState.currentQuestion = null;
}

// ============================================================
// CANCEL QUESTION
// ============================================================
function cancelQuestion() {
  const cId = playState.currentCellId;
  const q = playState.currentQuestion;
  if (!cId) return;

  playSound('cancel');
  playState.answeredCells[cId] = { teamIndex: -2, pointsWon: 0, cancelled: true };
  closeModal();
  renderGameBoard();
  checkGameOver();
}

// ============================================================
// SUBMIT / PASS
// ============================================================
function submitAnswer(isCorrect) {
  const q = playState.currentQuestion;
  if (!q) return;

  const cId = playState.currentCellId;
  const teamIndex = playState.currentTeamIndex;
  const pts = q.points;

  document.getElementById('modal-correct-answer-text').textContent = q.answer;
  document.getElementById('modal-reveal-panel').classList.remove('hidden');

  if (isCorrect) {
    playSound('correct');
    triggerBurst();

    let won = pts;
    if (playState.isStealState) won = Math.round(pts / 2);

    playState.teams[teamIndex].score += won;
    playState.answeredCells[cId] = { teamIndex, pointsWon: won, cancelled: false };
    if (playState.stats[teamIndex]) playState.stats[teamIndex].correct++;
    if (playState.stats[teamIndex]) playState.stats[teamIndex].attempts++;

    updateScoreUI();

    setTimeout(() => {
      closeModal();
      if (playState.isStealState) {
        playState.isStealState = false;
        playState.currentTeamIndex = (playState.originalTeamIndex + 1) % playState.teams.length;
      } else {
        switchTurn();
      }
      renderGameBoard();
      checkGameOver();
    }, 1800);

  } else {
    playSound('wrong');
    if (playState.stats[teamIndex]) playState.stats[teamIndex].attempts++;

    if (playState.isStealState) {
      playState.answeredCells[cId] = { teamIndex: -1, pointsWon: 0, cancelled: false };
      playState.isStealState = false;
      playState.currentTeamIndex = (playState.originalTeamIndex + 1) % playState.teams.length;
      updateScoreUI();
      setTimeout(() => {
        closeModal();
        updateTurnUI();
        renderGameBoard();
        checkGameOver();
      }, 1800);
    } else {
      if (db.settings.subtractOnWrong) {
        playState.teams[teamIndex].score = Math.max(0, playState.teams[teamIndex].score - pts);
      }
      playState.answeredCells[cId] = { teamIndex: -1, pointsWon: 0, cancelled: false };
      updateScoreUI();
      setTimeout(() => {
        closeModal();
        switchTurn();
        renderGameBoard();
        checkGameOver();
      }, 1800);
    }
  }
}

function handlePass() {
  const q = playState.currentQuestion;
  if (!q) return;
  playSound('pass');

  playState.originalTeamIndex = playState.currentTeamIndex;
  playState.isStealState = true;
  playState.currentTeamIndex = (playState.currentTeamIndex + 1) % playState.teams.length;

  updateTurnUI();

  document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
  const fillInput = document.getElementById('modal-fill-input');
  if (fillInput) { fillInput.value = ''; fillInput.focus(); }

  const activeTeam = playState.teams[playState.currentTeamIndex];
  document.getElementById('modal-turn-status').textContent = `${activeTeam.name.toUpperCase()}'S TURN`;
  document.getElementById('modal-steal-label').classList.remove('hidden');
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
function renderTeamInputs() {
  const container = document.getElementById('dynamic-team-inputs');
  if (!container) return;

  // Ensure teams array is valid
  if (!db.teams || !Array.isArray(db.teams) || db.teams.length < 2) {
    db.teams = [...DEFAULT_TEAMS];
  }

  // Sync count input
  const countInput = document.getElementById('setup-team-count');
  if (countInput) countInput.value = db.teams.length;

  container.innerHTML = '';
  db.teams.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'team-input-row';
    row.innerHTML = `
      <label for="setup-team-name-${i}">Team ${i + 1}</label>
      <input type="text" id="setup-team-name-${i}" 
        value="${name}" 
        placeholder="${DEFAULT_TEAMS[i] || `Team ${i + 1}`}"
        autocomplete="off">
    `;
    const input = row.querySelector('input');
    input.addEventListener('input', (e) => {
      db.teams[i] = e.target.value; // Store raw value (may be empty)
      saveDB();
    });
    container.appendChild(row);
  });
}

function handleTeamCountChange() {
  const countInput = document.getElementById('setup-team-count');
  if (!countInput) return;
  let count = parseInt(countInput.value, 10);
  if (isNaN(count) || count < 2) count = 2;
  if (count > 6) count = 6;
  countInput.value = count;

  const currentLength = db.teams.length;
  if (count > currentLength) {
    const extraDefaults = ['Boy', 'Girl', 'Team 3', 'Team 4', 'Team 5', 'Team 6'];
    for (let i = currentLength; i < count; i++) {
      db.teams.push(extraDefaults[i] || `Team ${i + 1}`);
    }
  } else if (count < currentLength) {
    db.teams = db.teams.slice(0, count);
  }

  saveDB();
  renderTeamInputs();
}

function setupTeamsFromInputs() {
  // Read all team name inputs; fallback to defaults if empty
  const resolvedNames = db.teams.map((rawName, i) => {
    const trimmed = (rawName || '').trim();
    return trimmed.length > 0 ? trimmed : (DEFAULT_TEAMS[i] || `Team ${i + 1}`);
  });

  playState.teams = resolvedNames.map(name => ({ name, score: 0 }));
  playState.stats = {};
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

function resetPlayState() {
  playState.teams.forEach(t => { t.score = 0; });
  playState.currentTeamIndex = 0;
  playState.originalTeamIndex = 0;
  playState.isStealState = false;
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

document.getElementById('settings-subtract').addEventListener('change', e => {
  db.settings.subtractOnWrong = e.target.checked;
  saveDB();
});

document.getElementById('setup-team-count').addEventListener('input', handleTeamCountChange);
document.getElementById('setup-team-count').addEventListener('change', handleTeamCountChange);

// Export JSON
document.getElementById('btn-export-json').addEventListener('click', () => {
  playSound('click');
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
  a.download = `vbs_quiz_${ts}.json`;
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
          settings: parsed.settings || { subtractOnWrong: false },
          questions: parsed.questions || [],
          teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
            ? parsed.teams
            : [...DEFAULT_TEAMS],
        };
        saveDB();
        renderTeamInputs();
        document.getElementById('settings-subtract').checked = !!db.settings.subtractOnWrong;
        renderAdminGrid();
        alert('✅ Quiz imported successfully!');
      }
    } catch (err) {
      alert('❌ Invalid JSON file. Please check the file and try again.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Reset game scores (not questions)
document.getElementById('btn-reset-game').addEventListener('click', () => {
  if (confirm('Reset all team scores and question states? Questions will be kept.')) {
    playSound('click');
    setupTeamsFromInputs();
    resetPlayState();
    updateDashboardStatus();
    renderGameBoard();
    alert('✅ Game reset! Scores and progress cleared.');
  }
});

// Clear all questions
document.getElementById('btn-clear-db').addEventListener('click', () => {
  if (confirm('Delete ALL questions? This cannot be undone.')) {
    db.questions = [];
    saveDB();
    selectedAdminCellId = null;
    document.getElementById('admin-question-editor').classList.add('hidden');
    renderAdminGrid();
    playSound('wrong');
  }
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
});

document.getElementById('btn-delete-question').addEventListener('click', () => {
  if (!selectedAdminCellId) return;
  if (!confirm('Delete this question?')) return;
  playSound('wrong');
  const qnIndex = parseInt(selectedAdminCellId.replace('qn', ''), 10);
  db.questions = db.questions.filter(q => q.qnIndex !== qnIndex);
  saveDB();
  document.getElementById('admin-question-editor').classList.add('hidden');
  selectedAdminCellId = null;
  renderAdminGrid();
});

// ============================================================
// EVENT LISTENERS — Question Modal
// ============================================================
document.getElementById('btn-modal-cancel').addEventListener('click', () => {
  if (confirm('Cancel this question? The tile will be marked as cancelled.')) {
    cancelQuestion();
  }
});

document.getElementById('btn-modal-pass').addEventListener('click', handlePass);

document.getElementById('btn-modal-submit').addEventListener('click', () => {
  const q = playState.currentQuestion;
  if (!q) return;

  if (q.type === 'mcq') {
    const selBtn = document.querySelector('.option-btn.selected');
    if (!selBtn) { alert('Please select an option first!'); return; }
    const val = selBtn.querySelector('.option-val').textContent;
    submitAnswer(val === q.answer);
  } else {
    const val = document.getElementById('modal-fill-input').value.trim();
    if (!val) { alert('Please type an answer first!'); return; }
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
  if (confirm('End the game now and see the results?')) {
    closeModal();
    endGame();
  }
});

document.getElementById('btn-game-back-admin').addEventListener('click', () => {
  if (confirm('Go back to Admin? Current game progress will be preserved.')) {
    closeModal();
    renderAdminGrid();
    showScreen('admin');
  }
});

// ============================================================
// EVENT LISTENERS — Winner Screen
// ============================================================
document.getElementById('btn-play-again').addEventListener('click', () => {
  playSound('open');
  resetPlayState();
  renderGameBoard();
  updateTurnUI();
  updateScoreUI();
  showScreen('game');
});

document.getElementById('btn-winner-home').addEventListener('click', () => {
  playSound('click');
  showScreen('dashboard');
});

// ============================================================
// INIT
// ============================================================

// Apply saved theme
const savedTheme = localStorage.getItem('vbs_quiz_theme') || 'dark';
applyTheme(savedTheme);

// Load saved data
loadDB();
renderAdminGrid();
renderTeamInputs();
updateScoreUI();
showScreen('dashboard');
