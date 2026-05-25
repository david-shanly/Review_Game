const fs = require('fs');

// --- 1. index.html ---
let indexHtml = fs.readFileSync('index.html', 'utf8');
if (!indexHtml.includes('settings-grid-cols')) {
  indexHtml = indexHtml.replace(
    /<!-- Section 1: Grid Typography -->/,
    `<!-- Section 0: Grid Layout -->
      <div class="sidebar-section">
        <h4 class="sidebar-section-title">📐 Grid Layout</h4>
        <div class="premium-controls-wrapper">
          <div class="form-group" style="margin-bottom: 0;">
            <label for="settings-grid-cols">Number of Columns</label>
            <input type="number" id="settings-grid-cols" class="modern-input" value="4" min="1" max="10" step="1">
          </div>
        </div>
      </div>
      <hr class="sidebar-divider">

      <!-- Section 1: Grid Typography -->`
  );
  fs.writeFileSync('index.html', indexHtml);
}

// --- 2. style.css ---
let styleCss = fs.readFileSync('style.css', 'utf8');

styleCss = styleCss.replace(
  /(\.game-board-table \{\s*display: grid;\s*gap: 10px;\s*min-width: 360px;\s*width: 100%;)\s*\}/,
  `$1\n  grid-template-columns: 120px repeat(var(--cols, 4), 1fr);\n}`
);

styleCss = styleCss.replace(
  /(#admin-interactive-grid \{\s*width: 100%;\s*display: grid;\s*gap: 8px;\s*overflow-y: auto;\s*padding-right: 4px;)\s*\}/,
  `$1\n  grid-template-columns: 120px repeat(var(--cols, 4), 1fr);\n}`
);

fs.writeFileSync('style.css', styleCss);

// --- 3. app.js ---
let appJs = fs.readFileSync('app.js', 'utf8');

// Replace loadDB entirely
const newLoadDB = `
const defaultSettings = {
  subtractOnWrong: true,
  totalQuestions: 13,
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
  emojiMode: 'random',
  positiveEmojis: "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏",
  negativeEmojis: "🤔,😬,🙊,😅,🙈,🤷‍♂️,🤦‍♀️,🤨",
  gridQnColor: '#ffb700',
  gridQnColorDefault: true
};

function hydrateControlCenter(settings) {
  // Grid Layout
  const gridColsEl = document.getElementById('settings-grid-cols');
  if (gridColsEl) gridColsEl.value = settings.gridCols ?? 4;
  
  // Font Typography
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

  // Qn Label
  const qnColorEl = document.getElementById('settings-grid-qn-color');
  if (qnColorEl) qnColorEl.value = settings.gridQnColor ?? '#ffb700';
  
  const qnColorDefaultEl = document.getElementById('settings-grid-qn-color-default');
  if (qnColorDefaultEl) qnColorDefaultEl.checked = settings.gridQnColorDefault ?? true;

  // Toggles
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
  
  const videoFeedbackEl = document.getElementById('settings-play-video-feedback');
  if (videoFeedbackEl) videoFeedbackEl.checked = settings.playVideoFeedback ?? false;
  
  const customFeedbackEl = document.getElementById('settings-use-custom-feedback');
  if (customFeedbackEl) customFeedbackEl.checked = settings.useCustomFeedbackVideos ?? false;

  // Teams
  if (db.teams && db.teams.length >= 2) {
    const t1Name = document.getElementById('admin-team1-name');
    if (t1Name) t1Name.value = db.teams[0].name;
    const t2Name = document.getElementById('admin-team2-name');
    if (t2Name) t2Name.value = db.teams[1].name;
    // Note: We don't hydrate file inputs for logos due to browser security
  }
}

function loadSavedDB(parsed) {
  if (parsed && typeof parsed === 'object') {
    db = {
      settings: {
        ...defaultSettings,
        ...parsed.settings
      },
      questions: parsed.questions || [],
      teams: (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2)
        ? parsed.teams.map((t, i) => {
          let teamObj = typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : t;
          if (teamObj.useDefault === undefined) {
            teamObj.useDefault = (teamObj.name === DEFAULT_TEAMS[i].name && (teamObj.logo === DEFAULT_TEAMS[i].logo || !teamObj.logo));
          }
          return teamObj;
        })
        : [...DEFAULT_TEAMS],
    };
    
    hydrateControlCenter(db.settings);
    
    // Explicitly update CSS vars before render
    document.documentElement.style.setProperty('--cols', db.settings.gridCols);
    
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
      // Fallback
      db.settings = { ...defaultSettings };
      hydrateControlCenter(db.settings);
    }
  } else {
    // No local storage, default UI
    db.settings = { ...defaultSettings };
    hydrateControlCenter(db.settings);
  }
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
    
    // Completely overwrite questions
    db.questions = defaultData.questions;
    
    // ONLY override certain settings from default_quiz if they exist, but generally preserve UI
    if (defaultData.settings) {
       db.settings.totalQuestions = defaultData.settings.totalQuestions;
       db.settings.enableTieBreaker = defaultData.settings.enableTieBreaker;
       db.settings.gridCols = defaultData.settings.gridCols || 4;
    }
    
  } catch (err) {
    console.error("Failed to fetch default_quiz.json:", err);
  }

  saveDB(); // This commits the updated DB to local storage
  loadDB(); // This completely re-hydrates UI and re-renders via the standard order
  
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
}`;

appJs = appJs.replace(/function loadDB\(\) \{[\s\S]*?\} catch \(err\) \{\s*console\.error\("Failed to fetch default_quiz\.json[\s\S]*?setTimeout\(updateDashboardStatus, 3000\);\r?\n\s*\}\r?\n\}/, newLoadDB);

// Also need to rewrite importDatabase (around line 2838)
appJs = appJs.replace(
  /const parsed = JSON\.parse\(reader\.result\);\r?\n\s*if \(parsed && typeof parsed === 'object'\) \{\r?\n\s*db = \{[\s\S]*?\};\r?\n\s*saveDB\(\);\r?\n\s*loadDB\(\);/g,
  `const parsed = JSON.parse(reader.result);
      if (parsed && typeof parsed === 'object') {
        loadSavedDB(parsed);
        saveDB();`
);

// We need a helper to replace renderGameBoard and renderAdminGrid safely
function replaceFunction(code, funcName, newFuncStr) {
  const funcStart = \`function \${funcName}() {\`;
  let startIndex = code.indexOf(funcStart);
  if (startIndex === -1) {
    console.error("Could not find", funcStart);
    return code;
  }
  
  let openBraces = 0;
  let endIndex = -1;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex + funcStart.length - 1; i < code.length; i++) {
    const char = code[i];
    const prevChar = code[i - 1];

    if ((char === '"' || char === "'" || char === "\`") && prevChar !== '\\\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex !== -1) {
    return code.substring(0, startIndex) + newFuncStr + code.substring(endIndex + 1);
  }
  return code;
}

const renderGridHelpers = \`
function getTypeLabel(type) {
  switch (type) {
    case 'mcq': return 'MCQ';
    case 'fill_blank': return 'Fill in the Blanks';
    case 'fill': return 'Fill in the Blanks';
    case 'short': return 'Short Answer';
    case 'short_answer': return 'Short Answer';
    case 'long': return 'Long Answer';
    case 'long_answer': return 'Long Answer';
    default: return '';
  }
}

function renderAdminGrid() {
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  document.documentElement.style.setProperty('--cols', cols);

  const qCountEl = document.getElementById('admin-q-count');
  if (qCountEl) qCountEl.textContent = \\\`Questions added: \\\${db.questions.length}\\\`;

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / cols);

  // Column Labels
  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel); // Top left empty
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = \\\`Column \\\${c}\\\`;
    container.appendChild(colLabel);
  }

  let qn = 1;
  for (let r = 0; r < rows; r++) {
    // Determine row label
    let rowTypes = [];
    let isRowFull = true;
    for (let c = 0; c < cols; c++) {
      const cellQn = (r * cols) + c + 1;
      if (cellQn > total) {
        isRowFull = false;
        break;
      }
      const q = db.questions.find(x => x.qnIndex === cellQn);
      if (q) rowTypes.push(q.type);
      else isRowFull = false;
    }

    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    if (isRowFull && rowTypes.length > 0 && rowTypes.every(v => v === rowTypes[0])) {
      rowLabel.textContent = getTypeLabel(rowTypes[0]);
    } else {
      rowLabel.textContent = '';
    }
    container.appendChild(rowLabel);

    // Render Tiles
    for (let c = 0; c < cols; c++) {
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
      const q = db.questions.find(x => x.qnIndex === qn);
      const answered = playState.answeredCells[cId];
      const isPlayed = !!(playState.teams && playState.teams.length > 0 && answered);

      const cell = document.createElement('div');
      cell.className = \\\`board-cell \\\${q ? 'has-q' : ''} \\\${selectedAdminCellId === cId ? 'selected-edit' : ''} \\\${isPlayed ? 'cell-played-locked' : ''}\\\`;
      cell.dataset.cellId = cId;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', \\\`\\\${qnLabel(qn)}: \\\${q ? 'Edit question' : 'Add question'}\\\`);

      cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
      cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
      cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

      const labelEl = document.createElement('span');
      labelEl.className = 'cell-qn-label';
      let displayHtml = qnLabel(qn);
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \\\`(\\\${q.points})\\\`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = \\\`\\\${qnLabel(qn)}<br><span style="font-size:0.8em">(\\\${q.points})</span>\\\`;
      }

      if (isPlayed) {
        if (answered.cancelled) {
          labelEl.innerHTML = \\\`❌<br><span style="color:var(--color-cancel); font-size: 0.8em;">\\\${displayHtml}</span>\\\`;
        } else if (answered.teamIndex === -1) {
          cell.style.background = '#cbd5e1';
          cell.style.borderColor = '#475569';
          labelEl.innerHTML = \\\`❌<br><span style="color:#1e293b; font-size: 0.8em;">\\\${displayHtml}</span>\\\`;
        } else {
          const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
          cell.style.background = tColor.bg;
          cell.style.borderColor = tColor.border;
          labelEl.innerHTML = \\\`✔️<br><span style="color:\\\${tColor.text}; font-size: 0.8em;">\\\${displayHtml}</span>\\\`;
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
        if (isPlayed) return;
        playSound('click');
        openQuestionEditor(cId);
      });
      container.appendChild(cell);
      qn++;
    }
  }

  // Admin Tie Breaker
  if (db.settings.enableTieBreaker) {
    const qTb = db.questions.find(x => x.qnIndex === 'tiebreaker');
    const tbPlayed = !!(playState.teams && playState.teams.length > 0 && playState.answeredCells['q-tiebreaker']);
    
    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    rowLabel.textContent = 'TB';
    container.appendChild(rowLabel);

    const cell = document.createElement('div');
    cell.className = \\\`board-cell \\\${qTb ? 'has-q' : ''} \\\${selectedAdminCellId === 'q-tiebreaker' ? 'selected-edit' : ''} \\\${tbPlayed ? 'cell-played-locked' : ''}\\\`;
    
    // Explicit grid column logic
    const start = Math.ceil(cols / 2) + 1; // +1 to offset row labels
    cell.style.gridColumn = \\\`\\\${start} / span 2\\\`;
    cell.dataset.cellId = 'q-tiebreaker';

    const labelEl = document.createElement('span');
    labelEl.className = 'cell-qn-label';
    labelEl.innerHTML = 'TB';
    if (tbPlayed) labelEl.innerHTML = '✔️<br><span style="font-size:0.8em">TB</span>';
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
      if (tbPlayed) return;
      playSound('click');
      openQuestionEditor('q-tiebreaker');
    });

    container.appendChild(cell);
  }
}

function renderGameBoard() {
  const container = document.getElementById('game-board-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  document.documentElement.style.setProperty('--cols', cols);

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / cols);

  // Column Labels
  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel);
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = \\\`Column \\\${c}\\\`;
    container.appendChild(colLabel);
  }

  let qn = 1;
  for (let r = 0; r < rows; r++) {
    // Row label detection
    let rowTypes = [];
    let isRowFull = true;
    for (let c = 0; c < cols; c++) {
      const cellQn = (r * cols) + c + 1;
      if (cellQn > total) {
        isRowFull = false;
        break;
      }
      const q = db.questions.find(x => x.qnIndex === cellQn);
      if (q) rowTypes.push(q.type);
      else isRowFull = false;
    }

    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    if (isRowFull && rowTypes.length > 0 && rowTypes.every(v => v === rowTypes[0])) {
      rowLabel.textContent = getTypeLabel(rowTypes[0]);
    } else {
      rowLabel.textContent = '';
    }
    container.appendChild(rowLabel);

    // Render Tiles
    for (let c = 0; c < cols; c++) {
      if (qn > total) {
        const btn = document.createElement('button');
        btn.className = 'game-cell-btn';
        btn.disabled = true;
        btn.innerHTML = \\\`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>\\\`;
        container.appendChild(btn);
        qn++;
        continue;
      }

      const cId = cellId(qn);
      const q = db.questions.find(x => x.qnIndex === qn);
      const btn = document.createElement('button');
      btn.dataset.cellId = cId;
      btn.setAttribute('aria-label', qnLabel(qn));
      const answered = playState.answeredCells[cId];

      let displayHtml = qnLabel(qn);
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \\\`(\\\${q.points})\\\`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = \\\`\\\${qnLabel(qn)}<br><span style="font-size:0.8em">(\\\${q.points})</span>\\\`;
      }

      if (!q) {
        btn.className = 'game-cell-btn';
        btn.disabled = true;
        btn.innerHTML = \\\`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>\\\`;
      } else if (answered && answered.cancelled) {
        btn.className = 'game-cell-btn cell-cancelled';
        btn.disabled = true;
        btn.innerHTML = \\\`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">\\\${displayHtml}</span>\\\`;
      } else if (answered) {
        btn.className = 'game-cell-btn cell-answered';
        btn.disabled = true;
        const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
        if (answered.teamIndex === -1) {
          btn.className = 'game-cell-btn cell-wrong';
          btn.innerHTML = \\\`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">\\\${displayHtml}</span>\\\`;
        } else {
          const team = playState.teams[answered.teamIndex];
          const tName = team ? team.name : \\\`Team \\\${answered.teamIndex + 1}\\\`;
          btn.style.background = tColor.bg;
          btn.style.borderColor = tColor.border;
          btn.innerHTML = \\\`<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:\\\${tColor.text};">\\\${tName}</span>\\\`;
        }
      } else {
        btn.className = 'game-cell-btn';
        btn.innerHTML = \\\`<span class="cell-qn">\\\${displayHtml}</span>\\\`;
        btn.addEventListener('click', () => {
          if (!canInteract()) return;
          if (!db.questions.find(x => x.qnIndex === parseInt(btn.dataset.cellId.split('-')[1], 10))) return;
          playSound('click');
          if (document.getElementById('modal-overlay')) {
            showQuestionModal(btn.dataset.cellId);
          }
        });
      }
      container.appendChild(btn);
      qn++;
    }
  }

  if (db.settings.enableTieBreaker) {
    const qTb = db.questions.find(x => x.qnIndex === 'tiebreaker');
    const tbPlayed = playState.answeredCells['q-tiebreaker'];
    
    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    rowLabel.textContent = 'TB';
    container.appendChild(rowLabel);

    const btn = document.createElement('button');
    btn.dataset.cellId = 'q-tiebreaker';
    btn.setAttribute('aria-label', 'Tie Breaker');
    
    // Explicit grid logic from prompt
    const start = Math.ceil(cols / 2) + 1; // +1 to offset row label column
    btn.style.gridColumn = \\\`\\\${start} / span 2\\\`;

    let displayHtml = 'TB';
    if (qTb) {
      if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \\\`(\\\${qTb.points})\\\`;
      else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = 'TB';
      else displayHtml = \\\`TB<br><span style="font-size:0.8em">(\\\${qTb.points})</span>\\\`;
    }

    if (!qTb) {
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = \\\`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">TB</span>\\\`;
    } else if (tbPlayed && tbPlayed.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = \\\`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">\\\${displayHtml}</span>\\\`;
    } else if (tbPlayed) {
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[tbPlayed.teamIndex % TEAM_COLORS.length];
      if (tbPlayed.teamIndex === -1) {
        btn.className = 'game-cell-btn cell-wrong';
        btn.innerHTML = \\\`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">\\\${displayHtml}</span>\\\`;
      } else {
        const team = playState.teams[tbPlayed.teamIndex];
        const tName = team ? team.name : \\\`Team \\\${tbPlayed.teamIndex + 1}\\\`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = \\\`<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:\\\${tColor.text};">\\\${tName}</span>\\\`;
      }
    } else {
      btn.className = 'game-cell-btn tiebreaker-btn';
      btn.innerHTML = \\\`<span class="cell-qn">\\\${displayHtml}</span>\\\`;
      btn.addEventListener('click', () => {
        if (!canInteract()) return;
        if (!db.questions.find(x => x.qnIndex === 'tiebreaker')) return;
        playSound('click');
        if (document.getElementById('modal-overlay')) {
          showQuestionModal('q-tiebreaker');
        }
      });
    }

    container.appendChild(btn);
  }

  applyDynamicFont(false);
}
\`;

appJs = replaceFunction(appJs, 'renderAdminGrid', renderGridHelpers);
// Now remove the duplicate renderGameBoard since the helper injected both
appJs = replaceFunction(appJs, 'renderGameBoard', '');

fs.writeFileSync('app.js', appJs);

console.log('Update successful');
