const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

// 1. Remove GRID_COLS constant
appJs = appJs.replace(/const GRID_COLS = 5; \/\/ 5 columns fixed\r?\n/, '');

// 2. Add getTypeLabel helper
if (!appJs.includes('function getTypeLabel')) {
  appJs += `
function getTypeLabel(type) {
  switch (type) {
    case 'mcq': return 'MCQ';
    case 'fill_blank': return 'Fill in the Blanks';
    case 'fill': return 'Fill in the Blanks';
    case 'short_answer': return 'Short Answer';
    case 'long_answer': return 'Long Answer';
    default: return '';
  }
}
`;
}

// 3. Rewrite loadDefaultQuiz
const loadDefaultQuizCode = `async function loadDefaultQuiz() {
  try {
    await clearAllVideosFromIndexedDB();
  } catch (err) {
    console.error("Failed to clear IndexedDB custom videos on loading defaults:", err);
  }

  try {
    const response = await fetch('default_quiz.json');
    if (!response.ok) throw new Error('Network response was not ok');
    const defaultData = await response.json();
    
    db.questions = defaultData.questions;
    db.settings.totalQuestions = defaultData.settings.totalQuestions;
    if (db.settings.gridCols === undefined) db.settings.gridCols = 5;
    
  } catch (err) {
    console.error("Failed to fetch default_quiz.json, falling back to local static JSON block:", err);
    // Keep local static block logic here or just rely on fetch
  }

  saveDB();
  loadDB();
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  resetPlayState();
  saveGameState();
  updateGameStatusUI();
  renderAdminGrid();

  triggerAlert('SYSTEM', 'Questions loaded!', 'gain');
  const statusDiv = document.getElementById('dashboard-status');
  if (statusDiv) {
    statusDiv.innerHTML = '<div class="bold-text" style="color:var(--color-success);">✅ Default Database Loaded!</div>';
    setTimeout(updateDashboardStatus, 3000);
  }
}`;
appJs = appJs.replace(/async function loadDefaultQuiz\(\) \{[\s\S]*?setTimeout\(updateDashboardStatus, 3000\);\r?\n\s*\}\r?\n\}/, loadDefaultQuizCode);

// 4. Update setupSettingsEventHandlers
appJs = appJs.replace(
  /const qnColorDefaultEl = document\.getElementById\('settings-grid-qn-color-default'\);/,
  `$&
    const gridColsEl = document.getElementById('settings-grid-cols');
    if (gridColsEl) gridColsEl.value = db.settings.gridCols || 5;
    if (gridColsEl) {
      gridColsEl.addEventListener('change', e => {
        db.settings.gridCols = parseInt(e.target.value, 10) || 5;
        saveDB();
        renderGameBoard();
        renderAdminGrid();
      });
    }`
);

// 5. Replace renderAdminGrid
const renderAdminGridCode = `function renderAdminGrid() {
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 5;
  container.style.gridTemplateColumns = \`120px repeat(\${cols}, 1fr)\`;

  document.getElementById('admin-q-count').textContent = \`Questions added: \${db.questions.length}\`;

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / cols);

  // Column Labels
  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel);
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = \`Column \${c}\`;
    container.appendChild(colLabel);
  }

  // Grid Cells & Row Labels
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

    // Cells
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
      cell.className = \`board-cell \${q ? 'has-q' : ''} \${selectedAdminCellId === cId ? 'selected-edit' : ''} \${isPlayed ? 'cell-played-locked' : ''}\`;
      cell.dataset.cellId = cId;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', \`\${qnLabel(qn)}: \${q ? 'Edit question' : 'Add question'}\`);

      cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
      cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
      cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

      const labelEl = document.createElement('span');
      labelEl.className = 'cell-qn-label';
      let displayHtml = qnLabel(qn);
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \`(\${q.points})\`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = \`\${qnLabel(qn)}<br><span style="font-size:0.8em">(\${q.points})</span>\`;
      }

      if (isPlayed) {
        if (answered.cancelled) {
          labelEl.innerHTML = \`❌<br><span style="color:var(--color-cancel); font-size: 0.8em;">\${displayHtml}</span>\`;
        } else if (answered.teamIndex === -1) {
          cell.style.background = '#cbd5e1';
          cell.style.borderColor = '#475569';
          labelEl.innerHTML = \`❌<br><span style="color:#1e293b; font-size: 0.8em;">\${displayHtml}</span>\`;
        } else {
          const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
          cell.style.background = tColor.bg;
          cell.style.borderColor = tColor.border;
          labelEl.innerHTML = \`✔️<br><span style="color:\${tColor.text}; font-size: 0.8em;">\${displayHtml}</span>\`;
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

    const tbContainer = document.createElement('div');
    tbContainer.className = 'tiebreaker-container';
    tbContainer.style.gridColumn = \`2 / span \${cols}\`;

    const cell = document.createElement('div');
    cell.className = \`board-cell \${qTb ? 'has-q' : ''} \${selectedAdminCellId === 'q-tiebreaker' ? 'selected-edit' : ''} \${tbPlayed ? 'cell-played-locked' : ''}\`;
    cell.style.width = \`calc((100% / \${cols}) * 2 - 10px)\`;
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

    tbContainer.appendChild(cell);
    container.appendChild(tbContainer);
  }
}`;

appJs = appJs.replace(/function renderAdminGrid\(\) \{[\s\S]*?\/\/ Admin Tie Breaker[\s\S]*?\}\s*\}\s*\}/, renderAdminGridCode);

// 6. Replace renderGameBoard
const renderGameBoardCode = `function renderGameBoard() {
  const container = document.getElementById('game-board-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 5;
  container.style.gridTemplateColumns = \`120px repeat(\${cols}, 1fr)\`;

  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / cols);

  // Column Labels
  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel);
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = \`Column \${c}\`;
    container.appendChild(colLabel);
  }

  // Grid Cells & Row Labels
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

    for (let c = 0; c < cols; c++) {
      if (qn > total) {
        const btn = document.createElement('button');
        btn.className = 'game-cell-btn';
        btn.disabled = true;
        btn.innerHTML = \`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">-</span>\`;
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
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \`(\${q.points})\`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = \`\${qnLabel(qn)}<br><span style="font-size:0.8em">(\${q.points})</span>\`;
      }

      if (!q) {
        btn.className = 'game-cell-btn';
        btn.disabled = true;
        btn.innerHTML = \`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">-</span>\`;
      } else if (answered && answered.cancelled) {
        btn.className = 'game-cell-btn cell-cancelled';
        btn.disabled = true;
        btn.innerHTML = \`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">\${displayHtml}</span>\`;
      } else if (answered) {
        btn.className = 'game-cell-btn cell-answered';
        btn.disabled = true;
        const tColor = TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length];
        if (answered.teamIndex === -1) {
          btn.className = 'game-cell-btn cell-wrong';
          btn.innerHTML = \`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">\${displayHtml}</span>\`;
        } else {
          const team = playState.teams[answered.teamIndex];
          const tName = team ? team.name : \`Team \${answered.teamIndex + 1}\`;
          btn.style.background = tColor.bg;
          btn.style.borderColor = tColor.border;
          btn.innerHTML = \`<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:\${tColor.text};">\${tName}</span>\`;
        }
      } else {
        btn.className = 'game-cell-btn';
        btn.innerHTML = \`<span class="cell-qn">\${displayHtml}</span>\`;
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

  // Tie Breaker
  if (db.settings.enableTieBreaker) {
    const qTb = db.questions.find(x => x.qnIndex === 'tiebreaker');
    const tbPlayed = playState.answeredCells['q-tiebreaker'];
    
    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    rowLabel.textContent = 'TB';
    container.appendChild(rowLabel);

    const tbContainer = document.createElement('div');
    tbContainer.className = 'tiebreaker-container';
    tbContainer.style.gridColumn = \`2 / span \${cols}\`;

    const btn = document.createElement('button');
    btn.dataset.cellId = 'q-tiebreaker';
    btn.setAttribute('aria-label', 'Tie Breaker');
    btn.style.width = \`calc((100% / \${cols}) * 2 - 10px)\`;

    let displayHtml = 'TB';
    if (qTb) {
      if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = \`(\${qTb.points})\`;
      else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = 'TB';
      else displayHtml = \`TB<br><span style="font-size:0.8em">(\${qTb.points})</span>\`;
    }

    if (!qTb) {
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = \`<span class="cell-qn" style="opacity:0.2; font-size:1rem;">TB</span>\`;
    } else if (tbPlayed && tbPlayed.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = \`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">\${displayHtml}</span>\`;
    } else if (tbPlayed) {
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[tbPlayed.teamIndex % TEAM_COLORS.length];
      if (tbPlayed.teamIndex === -1) {
        btn.className = 'game-cell-btn cell-wrong';
        btn.innerHTML = \`<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">\${displayHtml}</span>\`;
      } else {
        const team = playState.teams[tbPlayed.teamIndex];
        const tName = team ? team.name : \`Team \${tbPlayed.teamIndex + 1}\`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = \`<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:\${tColor.text};">\${tName}</span>\`;
      }
    } else {
      btn.className = 'game-cell-btn tiebreaker-btn';
      btn.innerHTML = \`<span class="cell-qn">\${displayHtml}</span>\`;
      btn.addEventListener('click', () => {
        if (!canInteract()) return;
        if (!db.questions.find(x => x.qnIndex === 'tiebreaker')) return;
        playSound('click');
        if (document.getElementById('modal-overlay')) {
          showQuestionModal('q-tiebreaker');
        }
      });
    }

    tbContainer.appendChild(btn);
    container.appendChild(tbContainer);
  }

  applyDynamicFont(false);
}`;

appJs = appJs.replace(/function renderGameBoard\(\) \{[\s\S]*?applyDynamicFont\(false\);\r?\n\}/, renderGameBoardCode);

fs.writeFileSync('app.js', appJs);

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
            <input type="number" id="settings-grid-cols" class="modern-input" value="5" min="1" max="10" step="1">
          </div>
        </div>
      </div>
      <hr class="sidebar-divider">

      <!-- Section 1: Grid Typography -->`
  );
  fs.writeFileSync('index.html', indexHtml);
}

let styleCss = fs.readFileSync('style.css', 'utf8');
if (!styleCss.includes('.grid-col-label')) {
  styleCss += `\n
/* Grid Labels */
.grid-col-label {
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--color-gold);
  padding: 8px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.grid-row-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--color-text);
  padding-right: 12px;
  text-align: right;
  opacity: 0.8;
}

.tiebreaker-container {
  display: flex;
  justify-content: center;
  width: 100%;
}
`;
  fs.writeFileSync('style.css', styleCss);
}
