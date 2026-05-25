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
       db.settings.gridCols = defaultData.settings.gridCols || 4;
    }
  } catch (err) {
    console.error("Failed to fetch default_quiz.json:", err);
  }

  saveDB();
  loadDB();
  
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
