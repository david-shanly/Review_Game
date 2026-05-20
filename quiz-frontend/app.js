/* ==========================================================================
   DANIEL QUIZ — COMPLETE GAME LOGIC
   ========================================================================== */

// ============================================================
// STATE
// ============================================================
let db = {
  grid: { columns: [100, 200, 300, 400, 500], rowsCount: 2 },
  settings: { subtractOnWrong: false },
  questions: [],
  teams: ['Boys', 'Girls']
};

let playState = {
  activeScreen: 'dashboard',
  teams: [
    { name: 'Boys', score: 0 },
    { name: 'Girls', score: 0 }
  ],
  currentTeamIndex: 0,
  originalTeamIndex: 0,
  isStealState: false,
  answeredCells: {},
  currentCellId: null,
  currentQuestion: null,
  stats: {} // Maps teamIndex to { correct: 0, attempts: 0 }
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
    this.color = ['#F3C623','#38BDF8','#FB7185','#10B981','#ffffff','#A78BFA'][Math.floor(Math.random() * 6)];
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
// SCREEN MANAGER
// ============================================================
const screens = {
  dashboard: document.getElementById('screen-dashboard'),
  admin:     document.getElementById('screen-admin'),
  game:      document.getElementById('screen-game'),
  winner:    document.getElementById('screen-winner')
};

function showScreen(id) {
  Object.keys(screens).forEach(k => screens[k].classList.remove('active'));
  screens[id].classList.add('active');
  playState.activeScreen = id;
  if (id === 'winner') startRain();
  else stopConfetti();
}

// ============================================================
// DATABASE (localStorage)
// ============================================================
function saveDB() {
  const dbToSave = { ...db };
  delete dbToSave.teams;
  localStorage.setItem('daniel_quiz_db', JSON.stringify(dbToSave));
  localStorage.setItem('daniel_quiz_teams', JSON.stringify(db.teams));
  updateDashboardStatus();
}

function loadDB() {
  const storedTeams = localStorage.getItem('daniel_quiz_teams');
  if (storedTeams) {
    try { db.teams = JSON.parse(storedTeams); } catch(e) {}
  }
  if (!db.teams || db.teams.length === 0) db.teams = ['Boys', 'Girls'];

  const stored = localStorage.getItem('daniel_quiz_db');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        const currentTeams = db.teams;
        db = parsed;
        db.teams = currentTeams;
        if (!db.grid) db.grid = { columns: [100,200,300,400,500], rowsCount: 2 };
        if (!db.settings) db.settings = { subtractOnWrong: false };
        if (!db.questions) db.questions = [];
      }
    } catch(e) { console.warn('DB load error, using defaults', e); }
  }
  const subEl = document.getElementById('settings-subtract');
  if (subEl) subEl.checked = !!db.settings.subtractOnWrong;
  updateDashboardStatus();
}

function updateDashboardStatus() {
  const statusDiv = document.getElementById('dashboard-status');
  const startBtn  = document.getElementById('btn-start-game');
  const count = db.questions.length;
  const cols  = db.grid.columns.length;
  const rows  = db.grid.rowsCount;
  if (count === 0) {
    statusDiv.innerHTML = `<div class="bold-text">⚠️ No questions configured yet!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">Open Admin Panel to set up your grid and add questions.</p>`;
    startBtn.disabled = true;
  } else {
    statusDiv.innerHTML = `<div class="bold-text cyan-text">✅ Ready to Play!</div>
      <p style="margin-top:6px;font-size:0.9rem;color:var(--color-text-muted);">
        Grid: <strong style="color:#fff">${cols}×${rows}</strong> &nbsp;|&nbsp;
        Questions loaded: <strong style="color:#fff">${count}</strong>
      </p>`;
    startBtn.disabled = false;
  }
}

// ============================================================
// THEME TOGGLE
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('daniel_quiz_theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================================
// ADMIN PANEL — GRID
// ============================================================
let selectedAdminCellId = null;

function syncGridInputs() {
  document.getElementById('grid-columns').value = db.grid.columns.join(',');
  document.getElementById('grid-rows').value = db.grid.rowsCount;
  updateGridHint();
}

function updateGridHint() {
  const colsVal = document.getElementById('grid-columns').value;
  const rowsVal = parseInt(document.getElementById('grid-rows').value, 10);
  const parsedCols = colsVal.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  const hint = document.getElementById('grid-calc-hint');
  if (parsedCols.length > 0 && !isNaN(rowsVal) && rowsVal > 0) {
    hint.textContent = `Creates a ${parsedCols.length}×${rowsVal} grid (${parsedCols.length * rowsVal} total slots)`;
  } else {
    hint.textContent = 'Invalid columns or rows configuration.';
  }
}

function autoCalcGridFromTotal() {
  const total = parseInt(document.getElementById('grid-total-questions').value, 10);
  if (isNaN(total) || total < 2) return;
  
  let colsCount = 5;
  let rowsCount = Math.ceil(total / colsCount);
  
  const colVals = [];
  for (let i = 1; i <= colsCount; i++) {
    colVals.push(i * 100);
  }
  
  document.getElementById('grid-columns').value = colVals.join(',');
  document.getElementById('grid-rows').value = rowsCount;
  updateGridHint();
}

function renderAdminGrid() {
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  const cols = db.grid.columns;
  const rows = db.grid.rowsCount;
  container.style.gridTemplateColumns = `repeat(${cols.length}, 1fr)`;

  // Stats
  document.getElementById('admin-grid-stats').textContent = `Grid: ${cols.length}×${rows} (${cols.length * rows} slots)`;
  document.getElementById('admin-q-count').textContent = `Questions: ${db.questions.length}`;

  // Data rows (no header row as requested)
  for (let r = 1; r <= rows; r++) {
    cols.forEach(pts => {
      const cellId = `${pts}-${r}`;
      const q = db.questions.find(x => x.cell === cellId);
      const cell = document.createElement('div');
      cell.className = `board-cell ${q ? 'has-q' : ''} ${selectedAdminCellId === cellId ? 'selected-edit' : ''}`;
      cell.dataset.cellId = cellId;

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'cell-pts';
      ptsSpan.textContent = q ? q.points : pts;
      cell.appendChild(ptsSpan);

      const tag = document.createElement('span');
      tag.className = 'cell-info-tag';
      tag.textContent = q ? (q.type === 'mcq' ? '🔘 MCQ' : '✏️ Fill') : '+ Add';
      cell.appendChild(tag);

      cell.addEventListener('click', () => {
        playSound('click');
        selectedAdminCellId = cellId;
        openQuestionEditor(cellId, pts);
      });
      container.appendChild(cell);
    });
  }
}

function openQuestionEditor(cellId, defaultPoints) {
  const q = db.questions.find(x => x.cell === cellId);
  document.getElementById('editor-cell-title').textContent = `Editing Cell [Column: ${cellId.split('-')[0]}, Row: ${cellId.split('-')[1]}]`;
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

    if (isMCQ) {
      q.options.forEach((opt, idx) => {
        document.getElementById(`opt-${idx}`).value = opt;
      });
      const correctIdx = q.options.indexOf(q.answer);
      if (correctIdx !== -1) {
        document.querySelector(`input[name="mcq-correct"][value="${correctIdx}"]`).checked = true;
      }
    } else {
      document.getElementById('q-fill-answer').value = q.answer;
    }
    document.getElementById('btn-delete-question').classList.remove('hidden');
  } else {
    document.getElementById('q-type').value = 'mcq';
    document.getElementById('q-text').value = '';
    document.getElementById('q-points').value = defaultPoints;
    
    document.getElementById('mcq-options-container').classList.remove('hidden');
    document.getElementById('fill-answer-container').classList.add('hidden');
    setMCQRequired(true);
    
    document.getElementById('btn-delete-question').classList.add('hidden');
  }
  
  document.getElementById('admin-question-editor').scrollIntoView({ behavior: 'smooth' });
}

function setMCQRequired(req) {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`opt-${i}`).required = req;
  }
  document.getElementById('q-fill-answer').required = !req;
}

// ============================================================
// GAME BOARD
// ============================================================
function renderGameBoard() {
  const container = document.getElementById('game-board-grid');
  container.innerHTML = '';
  const cols = db.grid.columns;
  const rows = db.grid.rowsCount;
  container.style.gridTemplateColumns = `repeat(${cols.length}, 1fr)`;

  // Cells (no header row as requested)
  for (let r = 1; r <= rows; r++) {
    cols.forEach(pts => {
      const cellId = `${pts}-${r}`;
      const q = db.questions.find(x => x.cell === cellId);
      const btn = document.createElement('button');
      btn.className = 'game-cell-btn';
      btn.dataset.cellId = cellId;

      const isAnswered = playState.answeredCells[cellId];
      const displayPts = q ? q.points : pts;

      if (!q) {
        btn.innerHTML = `<span class="cell-val" style="opacity:0.25;">—</span>`;
        btn.disabled = true;
      } else if (isAnswered) {
        const teamIndex = isAnswered.teamIndex;
        btn.disabled = true;
        
        const colors = [
          { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.45)', text: 'var(--color-boys)' },
          { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.45)', text: 'var(--color-girls)' },
          { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.45)', text: '#10B981' },
          { bg: 'rgba(243,198,35,0.15)', border: 'rgba(243,198,35,0.45)', text: '#F3C623' },
          { bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.45)', text: '#A78BFA' },
          { bg: 'rgba(252,165,165,0.15)', border: 'rgba(252,165,165,0.45)', text: '#FCA5A5' }
        ];
        
        const tColor = colors[teamIndex % colors.length] || { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: 'var(--color-text-muted)' };
        
        if (teamIndex === -1) {
          btn.style.background = 'rgba(255,255,255,0.04)';
          btn.style.borderColor = 'rgba(255,255,255,0.08)';
          btn.style.opacity = '0.5';
          btn.innerHTML = `<span class="cell-val" style="font-size:1.2rem; color:var(--color-text-muted);">–</span>
            <span class="cell-answered-tag" style="color:var(--color-text-muted);">Locked</span>`;
        } else {
          btn.style.background = tColor.bg;
          btn.style.borderColor = tColor.border;
          btn.style.opacity = '0.9';
          const team = playState.teams[teamIndex];
          const tName = team ? team.name : `Team ${teamIndex + 1}`;
          btn.innerHTML = `<span class="cell-val" style="font-size:1.2rem; color:${tColor.text};">${displayPts}</span>
            <span class="cell-answered-tag" style="color:${tColor.text}; font-weight:700;">✓ +${isAnswered.pointsWon} (${tName})</span>`;
        }
      } else {
        btn.innerHTML = `<span class="cell-val">${displayPts}</span>`;
        btn.addEventListener('click', () => {
          playSound('open');
          openQuestionModal(cellId, q);
        });
      }
      container.appendChild(btn);
    });
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
  turnDisplay.className = `turn-team`;
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
// SCORE UPDATE
// ============================================================
function updateScoreUI() {
  const container = document.getElementById('game-team-panels');
  if (!container) return;
  container.innerHTML = '';
  
  const icons = ['⚔️', '🌸', '🦁', '👑', '🔥', '💎'];
  
  playState.teams.forEach((team, i) => {
    const activeClass = (playState.currentTeamIndex === i) ? 'active-turn' : '';
    const panel = document.createElement('div');
    panel.className = `dynamic-team-panel glass-panel ${activeClass}`;
    panel.innerHTML = `
      <span class="team-icon">${icons[i % icons.length]}</span>
      <div class="team-details">
        <span class="team-label" style="text-transform:uppercase;">${team.name}</span>
        <span id="score-team-${i}" class="team-score">${team.score}</span>
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
    const activeClass = (playState.currentTeamIndex === team.index) ? 'active-item' : '';
    const div = document.createElement('div');
    div.className = `leaderboard-item ${activeClass}`;
    
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
function openQuestionModal(cellId, q) {
  playState.currentCellId = cellId;
  playState.currentQuestion = q;

  const overlay = document.getElementById('modal-overlay');

  document.getElementById('btn-modal-pass').style.display = playState.isStealState ? 'none' : 'inline-block';
  document.getElementById('modal-steal-label').classList.toggle('hidden', !playState.isStealState);

  // Header info
  document.getElementById('modal-cell-id').textContent = `${q.points} PTS`;
  const turnStatus = document.getElementById('modal-turn-status');
  const activeTeam = playState.teams[playState.currentTeamIndex];
  turnStatus.textContent = `${activeTeam.name.toUpperCase()}'S TURN`;
  turnStatus.className = `modal-turn-status`;
  turnStatus.style.color = 'var(--color-gold)';

  // Question text
  document.getElementById('modal-question-text').textContent = q.question;

  // MCQ vs Fill
  const mcqContainer  = document.getElementById('modal-mcq-container');
  const fillContainer = document.getElementById('modal-fill-container');
  const revealPanel   = document.getElementById('modal-reveal-panel');

  revealPanel.classList.add('hidden');

  if (q.type === 'mcq') {
    mcqContainer.classList.remove('hidden');
    fillContainer.classList.add('hidden');
    const optBtns = document.querySelectorAll('.option-btn');
    const letters = ['A','B','C','D'];
    optBtns.forEach((btn, i) => {
      btn.className = 'option-btn';
      btn.querySelector('.option-letter').textContent = letters[i];
      btn.querySelector('.option-val').textContent = q.options[i];
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
    fillInput.focus();
  }

  document.getElementById('modal-correct-answer-text').textContent = q.answer;
  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  playState.currentCellId = null;
  playState.currentQuestion = null;
}

function submitAnswer(isCorrect) {
  const q = playState.currentQuestion;
  if (!q) return;

  const cellId = playState.currentCellId;
  const teamIndex = playState.currentTeamIndex;
  const pts = q.points;

  document.getElementById('modal-correct-answer-text').textContent = q.answer;
  document.getElementById('modal-reveal-panel').classList.remove('hidden');

  if (isCorrect) {
    playSound('correct');
    triggerBurst();
    
    let won = pts;
    if (playState.isStealState) {
      won = Math.round(pts / 2);
    }
    
    playState.teams[teamIndex].score += won;
    playState.answeredCells[cellId] = { teamIndex: teamIndex, pointsWon: won };
    playState.stats[teamIndex].correct++;
    playState.stats[teamIndex].attempts++;
    
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
    playState.stats[teamIndex].attempts++;
    
    if (playState.isStealState) {
      playState.answeredCells[cellId] = { teamIndex: -1, pointsWon: 0 };
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
      playState.answeredCells[cellId] = { teamIndex: -1, pointsWon: 0 };
      
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
  if (fillInput) {
    fillInput.value = '';
    fillInput.focus();
  }

  const activeTeam = playState.teams[playState.currentTeamIndex];
  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.textContent = `${activeTeam.name.toUpperCase()}'S TURN`;

  document.getElementById('modal-steal-label').classList.remove('hidden');
  document.getElementById('btn-modal-pass').style.display = 'none';
}

// ============================================================
// GAME OVER CHECK
// ============================================================
function checkGameOver() {
  const totalCells = db.grid.columns.length * db.grid.rowsCount;
  const answeredCount = Object.keys(playState.answeredCells).length;
  const questionCells = db.questions.map(q => q.cell);
  const allQuestionsDone = questionCells.every(c => playState.answeredCells[c]);

  if (answeredCount >= totalCells || allQuestionsDone) {
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
    document.getElementById('winner-team-name').textContent = "Perfectly Matched!";
    document.getElementById('winner-team-name').style.color = 'var(--color-gold)';
    document.getElementById('winner-subtitle').textContent = "Top teams finished with equal scores! Great job everyone!";
  } else {
    document.getElementById('winner-badge').textContent = 'CHAMPION! 🏆';
    document.getElementById('winner-team-name').textContent = `${winner.name.toUpperCase()} WINS!`;
    document.getElementById('winner-team-name').style.color = 'var(--color-gold)';
    document.getElementById('winner-subtitle').textContent = `Congratulations to ${winner.name} on their incredible victory!`;
  }

  const standingsContainer = document.getElementById('winner-standings-container');
  if (standingsContainer) {
    standingsContainer.innerHTML = '';
    sorted.forEach((team, rank) => {
      const placeMedals = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place', '4th Place', '5th Place', '6th Place'];
      const medal = placeMedals[rank] || `${rank + 1}th Place`;
      const row = document.createElement('div');
      row.className = `standing-row ${rank === 0 ? 'first-place' : ''}`;
      row.innerHTML = `
        <span class="standing-place">${medal}</span>
        <span class="standing-name" style="font-weight:700;">${team.name}</span>
        <span class="standing-score" style="font-family:var(--font-display); font-weight:900;">${team.score} PTS</span>
      `;
      standingsContainer.appendChild(row);
    });
  }

  const statsDiv = document.getElementById('winner-stats');
  if (statsDiv) {
    let statsHtml = '';
    playState.teams.forEach((team, i) => {
      const stat = playState.stats[i] || { correct: 0, attempts: 0 };
      statsHtml += `<p>• <strong>${team.name}</strong>: ${stat.correct} correct out of ${stat.attempts} attempts</p>`;
    });
    statsDiv.innerHTML = statsHtml;
  }

  showScreen('winner');
}

// ============================================================
// RESET GAME STATE & TEAMS INPUTS
// ============================================================
function renderTeamInputs() {
  const container = document.getElementById('dynamic-team-inputs');
  if (!container) return;
  
  if (!db.teams || !Array.isArray(db.teams) || db.teams.length === 0) {
    db.teams = ['Boys', 'Girls'];
  }
  
  const countInput = document.getElementById('setup-team-count');
  if (countInput) {
    countInput.value = db.teams.length;
  }

  container.innerHTML = '';
  
  db.teams.forEach((name, i) => {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.style.marginBottom = '6px';
    div.innerHTML = `
      <label for="setup-team-name-${i}" style="font-size:0.8rem; margin-bottom:4px; color:var(--color-text-muted);">Team ${i + 1} Name</label>
      <input type="text" id="setup-team-name-${i}" value="${name}" required style="padding: 6px 10px; font-size:0.9rem; background: var(--color-bg-alt); border: 1px solid var(--color-border); color: #fff; width: 100%;">
    `;
    const input = div.querySelector('input');
    input.addEventListener('input', (e) => {
      db.teams[i] = e.target.value.trim() || `Team ${i + 1}`;
      saveDB();
    });
    container.appendChild(div);
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
    const defaultNames = ['Boys', 'Girls', 'Daniel Lions', 'Furnace Men', 'Belshazzars', 'Darius Army'];
    for (let i = currentLength; i < count; i++) {
      db.teams.push(defaultNames[i] || `Team ${i + 1}`);
    }
  } else if (count < currentLength) {
    db.teams = db.teams.slice(0, count);
  }
  
  saveDB();
  renderTeamInputs();
}

function setupTeamsFromInputs() {
  if (!db.teams || !Array.isArray(db.teams) || db.teams.length === 0) {
    db.teams = ['Boys', 'Girls'];
  }
  playState.teams = db.teams.map(name => ({ name: name, score: 0 }));
  playState.stats = {};
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

function resetPlayState() {
  playState.teams.forEach(t => t.score = 0);
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
// EVENT LISTENERS
// ============================================================

// --- Sound Toggle ---
document.getElementById('btn-sound-toggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-icon').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playSound('click');
});

// --- Dashboard buttons ---
document.getElementById('btn-go-admin').addEventListener('click', () => {
  playSound('click');
  syncGridInputs();
  renderAdminGrid();
  showScreen('admin');
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  playSound('open');
  setupTeamsFromInputs();
  resetPlayState();
  renderGameBoard();
  updateTurnUI();
  updateScoreUI();
  showScreen('game');
});

// --- Admin Panel ---
document.getElementById('btn-admin-back').addEventListener('click', () => {
  playSound('click');
  showScreen('dashboard');
});

document.getElementById('btn-update-grid').addEventListener('click', () => {
  playSound('click');
  const colsVal = document.getElementById('grid-columns').value;
  const rowsVal = parseInt(document.getElementById('grid-rows').value, 10);

  if (!colsVal.trim()) { alert('Please enter point columns!'); return; }
  const parsedCols = colsVal.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  if (parsedCols.length === 0) { alert('Invalid columns!'); return; }
  if (isNaN(rowsVal) || rowsVal < 1 || rowsVal > 15) { alert('Rows must be 1–15'); return; }

  const toRemove = db.questions.filter(q => {
    const parts = q.cell.split('-');
    return !parsedCols.includes(parseInt(parts[0])) || parseInt(parts[1]) > rowsVal;
  });

  if (toRemove.length > 0) {
    if (!confirm(`Updating the grid will remove ${toRemove.length} question(s) that no longer fit. Continue?`)) return;
  }

  db.grid.columns = parsedCols;
  db.grid.rowsCount = rowsVal;
  db.questions = db.questions.filter(q => !toRemove.includes(q));
  saveDB();
  document.getElementById('admin-question-editor').classList.add('hidden');
  selectedAdminCellId = null;
  renderAdminGrid();
});

document.getElementById('settings-subtract').addEventListener('change', e => {
  db.settings.subtractOnWrong = e.target.checked;
  saveDB();
});

document.getElementById('btn-export-json').addEventListener('click', () => {
  playSound('click');
  const a = document.createElement('a');
  const dbToExport = { ...db };
  delete dbToExport.teams;
  a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dbToExport, null, 2));
  a.download = `daniel_quiz_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

document.getElementById('btn-load-premade').addEventListener('click', async () => {
  playSound('click');
  const select = document.getElementById('premade-db-select');
  const filename = select.value;
  if (!filename) {
    alert('Please select a database to load.');
    return;
  }
  
  const countInput = document.getElementById('premade-db-count').value;
  const count = parseInt(countInput, 10);
  
  try {
    const res = await fetch(filename);
    if (!res.ok) throw new Error('Network response was not ok');
    const parsed = await res.json();
    
    if (parsed && typeof parsed === 'object') {
      const currentTeams = db.teams;
      db = parsed;
      db.teams = currentTeams;
      if (!db.questions) db.questions = [];
      
      // If user specified a limit
      if (!isNaN(count) && count > 0 && count < db.questions.length) {
        db.questions = db.questions.sort(() => 0.5 - Math.random()).slice(0, count);
        
        let colsCount = 5;
        if (count < 5) colsCount = count;
        const rowsCount = Math.ceil(count / colsCount) || 1;
        const colVals = [];
        for (let i = 1; i <= colsCount; i++) colVals.push(i * 100);
        db.grid = { columns: colVals, rowsCount: rowsCount };
        
        db.questions = db.questions.map((q, idx) => {
          const col = (idx % colsCount) + 1;
          const row = Math.floor(idx / colsCount) + 1;
          return { ...q, points: col * 100, cell: `${col * 100}-${row}` };
        });
      } else {
        if (!db.grid) db.grid = { columns: [100,200,300,400,500], rowsCount: 2 };
      }
      
      if (!db.settings) db.settings = { subtractOnWrong: false };
      saveDB();
      syncGridInputs();
      renderTeamInputs();
      document.getElementById('settings-subtract').checked = !!db.settings.subtractOnWrong;
      renderAdminGrid();
      document.getElementById('loaded-db-display').textContent = `Currently Loaded: ${select.options[select.selectedIndex].text}`;
      alert(`✅ Database '${filename}' loaded successfully!`);
    }
  } catch(err) {
    console.error(err);
    alert('❌ Failed to load pre-made database! Make sure you are running via a local server (e.g. npm run dev).');
  }
});

document.getElementById('import-json-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed && typeof parsed === 'object') {
        const currentTeams = db.teams;
        db = parsed;
        db.teams = currentTeams;
        if (!db.grid) db.grid = { columns: [100,200,300,400,500], rowsCount: 2 };
        if (!db.settings) db.settings = { subtractOnWrong: false };
        if (!db.questions) db.questions = [];
        saveDB();
        syncGridInputs();
        renderTeamInputs();
        document.getElementById('settings-subtract').checked = !!db.settings.subtractOnWrong;
        renderAdminGrid();
        document.getElementById('loaded-db-display').textContent = `Currently Loaded: Imported File (${file.name})`;
        alert('✅ Database imported successfully!');
      }
    } catch(err) { alert('❌ Invalid JSON file!'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-clear-db').addEventListener('click', () => {
  if (confirm('Are you sure you want to delete ALL questions?')) {
    db.questions = [];
    saveDB();
    selectedAdminCellId = null;
    document.getElementById('admin-question-editor').classList.add('hidden');
    renderAdminGrid();
    playSound('wrong');
  }
});

// --- Question Editor ---
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

  const type = document.getElementById('q-type').value;
  const text = document.getElementById('q-text').value.trim();
  const pts  = parseInt(document.getElementById('q-points').value, 10);
  let answer = '', options = [];

  if (type === 'mcq') {
    for (let i = 0; i < 4; i++) options.push(document.getElementById(`opt-${i}`).value.trim());
    const sel = document.querySelector('input[name="mcq-correct"]:checked');
    answer = options[parseInt(sel.value, 10)];
  } else {
    answer = document.getElementById('q-fill-answer').value.trim();
  }

  const existIdx = db.questions.findIndex(q => q.cell === selectedAdminCellId);
  const qObj = { id: existIdx !== -1 ? db.questions[existIdx].id : Date.now(), type, question: text, options, answer, points: pts, cell: selectedAdminCellId };

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
  db.questions = db.questions.filter(q => q.cell !== selectedAdminCellId);
  saveDB();
  document.getElementById('admin-question-editor').classList.add('hidden');
  selectedAdminCellId = null;
  renderAdminGrid();
});

// --- Modal Unified Buttons ---
document.getElementById('btn-modal-pass').addEventListener('click', handlePass);

document.getElementById('btn-modal-submit').addEventListener('click', () => {
  const q = playState.currentQuestion;
  if (!q) return;

  if (q.type === 'mcq') {
    const selBtn = document.querySelector('.option-btn.selected');
    if (!selBtn) {
      alert('Please select an option first!');
      return;
    }
    const val = selBtn.querySelector('.option-val').textContent;
    const isCorrect = (val === q.answer);
    submitAnswer(isCorrect);
  } else {
    const val = document.getElementById('modal-fill-input').value.trim();
    if (!val) {
      alert('Please type an answer first!');
      return;
    }
    const isCorrect = (val.toLowerCase() === q.answer.toLowerCase());
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

// --- Game screen buttons ---
document.getElementById('btn-end-game').addEventListener('click', () => {
  if (confirm('End the game now?')) {
    closeModal();
    endGame();
  }
});

document.getElementById('btn-game-back-admin').addEventListener('click', () => {
  if (confirm('Go back to Admin? Current game progress will be lost.')) {
    closeModal();
    syncGridInputs();
    renderAdminGrid();
    showScreen('admin');
  }
});

// --- Winner screen ---
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
const savedTheme = localStorage.getItem('daniel_quiz_theme') || 'dark';
applyTheme(savedTheme);

// Theme toggle button
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  playSound('click');
  toggleTheme();
});

// Dynamic team inputs live calculation and resizing
document.getElementById('setup-team-count').addEventListener('input', handleTeamCountChange);
document.getElementById('setup-team-count').addEventListener('change', handleTeamCountChange);

// Grid calculator live updates
document.getElementById('grid-total-questions').addEventListener('input', autoCalcGridFromTotal);
document.getElementById('grid-columns').addEventListener('input', updateGridHint);
document.getElementById('grid-rows').addEventListener('input', updateGridHint);

loadDB();
syncGridInputs();
renderAdminGrid();
renderTeamInputs();
updateScoreUI();
showScreen('dashboard');
