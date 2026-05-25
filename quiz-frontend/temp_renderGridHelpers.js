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
  if (qCountEl) qCountEl.textContent = `Questions added: ${db.questions.filter(x => x.qnIndex !== 'tiebreaker').length}`;

  const questionsExcludingTB = db.questions.filter(x => x.qnIndex !== 'tiebreaker');
  const total = db.settings.totalQuestions;
  const rows = Math.ceil(total / cols);

  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel);
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = `Column ${c}`;
    container.appendChild(colLabel);
  }

  let qn = 1;
  for (let r = 0; r < rows; r++) {
    let rowTypes = [];
    let isRowFull = true;
    for (let c = 0; c < cols; c++) {
      const cellQn = (r * cols) + c + 1;
      if (cellQn > total) {
        isRowFull = false;
        break;
      }
      const q = questionsExcludingTB.find(x => x.qnIndex === cellQn);
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
      let displayHtml = qnLabel(qn);
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = `(${q.points})`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = `${qnLabel(qn)}<br><span style="font-size:0.8em">(${q.points})</span>`;
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
        if (isPlayed) return;
        playSound('click');
        openQuestionEditor(cId);
      });
      container.appendChild(cell);
      qn++;
    }
  }

  if (db.settings.enableTieBreaker) {
    const qTb = db.questions.find(x => x.qnIndex === 'tiebreaker');
    const tbPlayed = !!(playState.teams && playState.teams.length > 0 && playState.answeredCells['q-tiebreaker']);
    
    const rowLabel = document.createElement('div');
    rowLabel.className = 'grid-row-label';
    rowLabel.textContent = '';
    container.appendChild(rowLabel);

    const cell = document.createElement('div');
    cell.className = `board-cell ${qTb ? 'has-q' : ''} ${selectedAdminCellId === 'q-tiebreaker' ? 'selected-edit' : ''} ${tbPlayed ? 'cell-played-locked' : ''}`;
    
    const start = Math.ceil(cols / 2) + 1; 
    cell.style.gridColumn = `${start} / span 2`;
    cell.dataset.cellId = 'q-tiebreaker';

    cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
    cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
    cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

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
  const questionsExcludingTB = db.questions.filter(x => x.qnIndex !== 'tiebreaker');
  const rows = Math.ceil(total / cols);

  const emptyLabel = document.createElement('div');
  container.appendChild(emptyLabel);
  for (let c = 1; c <= cols; c++) {
    const colLabel = document.createElement('div');
    colLabel.className = 'grid-col-label';
    colLabel.textContent = `Column ${c}`;
    container.appendChild(colLabel);
  }

  let qn = 1;
  for (let r = 0; r < rows; r++) {
    let rowTypes = [];
    let isRowFull = true;
    for (let c = 0; c < cols; c++) {
      const cellQn = (r * cols) + c + 1;
      if (cellQn > total) {
        isRowFull = false;
        break;
      }
      const q = questionsExcludingTB.find(x => x.qnIndex === cellQn);
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
        btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
        container.appendChild(btn);
        qn++;
        continue;
      }

      const cId = cellId(qn);
      const q = questionsExcludingTB.find(x => x.qnIndex === qn);
      const btn = document.createElement('button');
      btn.dataset.cellId = cId;
      btn.setAttribute('aria-label', qnLabel(qn));
      const answered = playState.answeredCells[cId];

      let displayHtml = qnLabel(qn);
      if (q) {
        if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = `(${q.points})`;
        else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = qnLabel(qn);
        else displayHtml = `${qnLabel(qn)}<br><span style="font-size:0.8em">(${q.points})</span>`;
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
          btn.innerHTML = `<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
        }
      } else {
        btn.className = 'game-cell-btn';
        btn.innerHTML = `<span class="cell-qn">${displayHtml}</span>`;
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
    rowLabel.textContent = '';
    container.appendChild(rowLabel);

    const btn = document.createElement('button');
    btn.dataset.cellId = 'q-tiebreaker';
    btn.setAttribute('aria-label', 'Tie Breaker');
    
    const start = Math.ceil(cols / 2) + 1;
    btn.style.gridColumn = `${start} / span 2`;

    let displayHtml = 'TB';
    if (qTb) {
      if (db.settings.displayMode === 'POINTS_ONLY') displayHtml = `(${qTb.points})`;
      else if (db.settings.displayMode === 'QUESTION_ONLY') displayHtml = 'TB';
      else displayHtml = `TB<br><span style="font-size:0.8em">(${qTb.points})</span>`;
    }

    if (!qTb) {
      btn.className = 'game-cell-btn';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">TB</span>`;
    } else if (tbPlayed && tbPlayed.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled';
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-cancel); text-align:center; line-height:1.2;">${displayHtml}</span>`;
    } else if (tbPlayed) {
      btn.className = 'game-cell-btn cell-answered';
      btn.disabled = true;
      const tColor = TEAM_COLORS[tbPlayed.teamIndex % TEAM_COLORS.length];
      if (tbPlayed.teamIndex === -1) {
        btn.className = 'game-cell-btn cell-wrong';
        btn.innerHTML = `<span class="cell-qn" style="font-size:2.8rem;">❌</span><span class="cell-answered-tag" style="color:var(--color-text-muted); text-align:center; line-height:1.2;">${displayHtml}</span>`;
      } else {
        const team = playState.teams[tbPlayed.teamIndex];
        const tName = team ? team.name : `Team ${tbPlayed.teamIndex + 1}`;
        btn.style.background = tColor.bg;
        btn.style.borderColor = tColor.border;
        btn.innerHTML = `<span class="cell-qn" style="color:var(--color-success); font-size:2.8rem; font-weight:900;">✔️</span><span class="cell-answered-tag" style="color:${tColor.text};">${tName}</span>`;
      }
    } else {
      btn.className = 'game-cell-btn tiebreaker-btn';
      btn.innerHTML = `<span class="cell-qn">${displayHtml}</span>`;
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
