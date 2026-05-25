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
  const gridColsEl = document.getElementById('settings-grid-cols');
  if (gridColsEl) gridColsEl.value = settings.gridCols ?? 4;
  
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
      db.settings = { ...defaultSettings };
      hydrateControlCenter(db.settings);
    }
  } else {
    db.settings = { ...defaultSettings };
    hydrateControlCenter(db.settings);
  }
}
