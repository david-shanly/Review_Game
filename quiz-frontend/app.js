/* ==========================================================================
   REVIEW GAME - 2026 — COMPLETE GAME LOGIC
   Refined & production-ready
   ========================================================================== */

import { BIBLE_TEMPLATES } from './src/config/presets.js';

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_TEAMS = [
  { name: 'Boy', logo: 'boy.png' },
  { name: 'Girl', logo: 'girl.png' }
];

function assetPath(path) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http')) return path;
  if (path.startsWith('public/')) return path.substring(7);
  return path;
}

function isUnicodeOtherLanguage(str) {
  if (!str) return false;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 255) return true;
  }
  return false;
}

function parseEmojis(element) {
  if (window.twemoji && element) {
    try {
      window.twemoji.parse(element, { base: 'emojis/', folder: '', ext: '.svg' });
    } catch (e) {
      console.warn('Twemoji parse error:', e);
    }
  }
}

function updateTextAndCheckUnicode(element, text) {
  if (!element) return;
  element.textContent = text;
  if (isUnicodeOtherLanguage(text)) {
    element.style.setProperty('font-family', '"Noto Sans", "Noto Sans Malayalam", "Noto Sans Devanagari", sans-serif', 'important');
  } else {
    element.style.removeProperty('font-family');
  }
  parseEmojis(element);
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

const TEAM_ICONS = ['👦', '👧', '🦁', '👑', '🔥', '💎'];

// ============================================================
// STATE
// ============================================================
let db = {
  settings: {
    subtractOnWrong: true,
    totalQuestions: 12,
    gridCols: 4,
    powerupMode: 'random',
    randomPowerupsCount: 3,
    displayMode: 'QUESTION_POINTS',
    gridFont: 'none',
    applyFontToAll: false,
    playVideoFeedback: false,
    useCustomFeedbackVideos: false,
    enableTieBreaker: false,
    gridFontColor: '#000000',
    gridFontBold: false
  },
  questions: [], // each: { id, qnIndex, type, question, options, answer, points }
  teams: [...DEFAULT_TEAMS],
};



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
  powerups: {},
  powerupUsed: {
    secondChanceActive: false,
    secondChanceUsed: false,
    safetyNetActive: false,
    stealShieldActive: false,
    doublePointsActive: false,
    extraTimeActive: false,
    revealedCells: {}
  },
  practiceMode: false,
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

function playTrumpetNote(freq, start, duration, volume = 0.25) {
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  
  osc1.type = 'sawtooth';
  osc2.type = 'triangle';
  
  osc1.frequency.setValueAtTime(freq, start);
  osc2.frequency.setValueAtTime(freq + 1.5, start); // detune
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, start);
  filter.frequency.exponentialRampToValueAtTime(1600, start + 0.08);
  filter.frequency.exponentialRampToValueAtTime(900, start + duration);
  
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.03);
  gain.gain.setValueAtTime(volume, start + duration - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc1.start(start);
  osc2.start(start);
  osc1.stop(start + duration + 0.05);
  osc2.stop(start + duration + 0.05);
}

function playTrumpetFanfare() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  
  // Triumphant arpeggio: C4, E4, G4, C5 (hold)
  playTrumpetNote(261.63, now, 0.12, 0.15);
  playTrumpetNote(329.63, now + 0.12, 0.12, 0.15);
  playTrumpetNote(392.00, now + 0.24, 0.12, 0.15);
  playTrumpetNote(523.25, now + 0.36, 0.5, 0.2);
  
  // Harmony on top
  playTrumpetNote(659.25, now + 0.36, 0.5, 0.1);
  playTrumpetNote(783.99, now + 0.36, 0.5, 0.08);
}

function playWompWompNote(freqStart, freqEnd, start, duration, volume = 0.25) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freqStart, start);
  osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);
  
  // Frequency vibrato
  const vibrato = audioCtx.createOscillator();
  const vibratoGain = audioCtx.createGain();
  vibrato.frequency.value = 8;
  vibratoGain.gain.value = 10;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);
  
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freqStart * 1.5, start);
  filter.frequency.linearRampToValueAtTime(freqEnd * 1.2, start + duration);
  
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.05);
  gain.gain.setValueAtTime(volume, start + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  vibrato.start(start);
  osc.start(start);
  vibrato.stop(start + duration + 0.05);
  osc.stop(start + duration + 0.05);
}

function playWompWomp() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  
  // Comic womp womp slides
  playWompWompNote(349.23, 293.66, now, 0.32, 0.18);
  playWompWompNote(329.63, 261.63, now + 0.35, 0.32, 0.18);
  playWompWompNote(293.66, 220.00, now + 0.70, 0.32, 0.18);
  playWompWompNote(220.00, 146.83, now + 1.05, 0.55, 0.22);
}

function playCymbalCrash(time) {
  const duration = 1.8;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  
  const hpFilter = audioCtx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.setValueAtTime(4500, time);
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.12, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  
  source.connect(hpFilter);
  hpFilter.connect(gain);
  gain.connect(audioCtx.destination);
  
  source.start(time);
  source.stop(time + duration);
}

function playSnareCrack(time) {
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, time);
  oscGain.gain.setValueAtTime(0.2, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  
  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 0.16);
  
  const duration = 0.2;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  
  const bpFilter = audioCtx.createBiquadFilter();
  bpFilter.type = 'bandpass';
  bpFilter.frequency.setValueAtTime(1000, time);
  
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.22, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  
  source.connect(bpFilter);
  bpFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  
  source.start(time);
  source.stop(time + duration);
}

function playDrumroll(duration = 2.0) {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const now = audioCtx.currentTime;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, now);
  filter.Q.setValueAtTime(1.8, now);
  
  const hpFilter = audioCtx.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.setValueAtTime(120, now);

  const mainGain = audioCtx.createGain();
  mainGain.gain.setValueAtTime(0.01, now);
  mainGain.gain.linearRampToValueAtTime(0.16, now + 0.3);
  mainGain.gain.setValueAtTime(0.16, now + duration - 0.2);
  mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  
  const lfo = audioCtx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.setValueAtTime(22, now); // hits per second
  
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(0.1, now);
  
  const ampMod = audioCtx.createGain();
  ampMod.gain.setValueAtTime(0.1, now);
  
  lfo.connect(lfoGain);
  lfoGain.connect(ampMod.gain);
  
  noiseNode.connect(filter);
  filter.connect(hpFilter);
  hpFilter.connect(ampMod);
  ampMod.connect(mainGain);
  mainGain.connect(audioCtx.destination);
  
  lfo.start(now);
  noiseNode.start(now);
  lfo.stop(now + duration);
  noiseNode.stop(now + duration);
  
  const crashTime = now + duration - 0.15;
  playCymbalCrash(crashTime);
  playSnareCrack(crashTime);
}

function playPowerupChime() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  
  // Magical sweep: C5 to C6
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
  notes.forEach((freq, idx) => {
    const start = now + idx * 0.04;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function playTickSound(isAlert = false) {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isAlert ? 1400 : 900, now);
  
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function playSound(name) {
  if (!soundEnabled) return;
  switch (name) {
    case 'correct':
      playTrumpetFanfare();
      break;
    case 'wrong':
      playWompWomp();
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
    case 'powerup':
      playPowerupChime();
      break;
    case 'tick':
      playTickSound(false);
      break;
    case 'tick-alert':
      playTickSound(true);
      break;
    case 'drumroll':
      playDrumroll(2.2);
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

  // Toggle body overflow scrolling: enable on admin screen, disable on all other screens to prevent scrollbars caused by sub-pixel zoom rounding errors
  if (id === 'admin') {
    document.body.classList.add('admin-mode');
    document.body.style.overflowY = 'auto';
  } else {
    document.body.classList.remove('admin-mode');
    document.body.style.overflowY = 'hidden';
  }
  
  // Set html overflow to hidden as well for standard compliance
  document.documentElement.style.overflow = id === 'admin' ? 'auto' : 'hidden';

  if (id === 'admin') {
    const isGameActive = (playState.phase === 'live' && playState.teams && playState.teams.length > 0 && localStorage.getItem('review_game_playstate') !== null);
    const btnResume = document.getElementById('btn-admin-resume');
    if (btnResume) {
      btnResume.style.display = 'inline-flex';
      btnResume.innerHTML = isGameActive ? 'Resume Game' : 'Start Game';
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
    // User has an explicit custom DB file open — save to it
    saveDatabaseToFileHandle(window.customDatabaseFileHandle, db).catch(err => {
      console.error("Error saving to custom DB file handle", err);
      fallbackSaveDB();
    });
  } else {
    // Browser mode: always use localStorage as primary persistence.
    // We do NOT POST to /api/save-db because that would overwrite the
    // factory-default default_quiz.json with runtime state.
    fallbackSaveDB();
  }
}

function fallbackSaveDB() {
  localStorage.setItem('review_game_db', JSON.stringify(db));
  updateDashboardStatus();
}

function getDefaultColumnsForQuestionsCount(count) {
  if (count <= 4) return count;
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  if (count <= 9) return 3;
  if (count <= 10) return 5;
  if (count <= 12) return 4;
  if (count <= 15) return 5;
  if (count <= 16) return 4;
  if (count <= 20) return 5;
  if (count <= 24) return 6;
  if (count <= 25) return 5;
  if (count <= 30) return 6;
  return Math.ceil(Math.sqrt(count));
}

const defaultSettings = {
  powerupMode: 'random',
  randomPowerupsCount: 3,
  subtractOnWrong: true,
  totalQuestions: 12,
  displayMode: 'QUESTION_POINTS',
  gridFont: 'none',
  applyFontToAll: false,
  playVideoFeedback: false,
  enableTieBreaker: true,
  tiebreakerVisible: true,
  useCustomFeedbackVideos: false,
  gridFontColor: '#000000',
  gridFontBold: false,
  useDefaultFontColor: true,
  gridCols: 4,
  playEmojiFeedback: true,
  enableCustomPerQuestionEmoji: true,
  emojiMode: 'random',
  positiveEmojis: '👏,🎉,🌟,🙌,🏆,🤩,👍,👌,😊,👏',
  negativeEmojis: '😢,😭,🤦,📉,💔,🙈,😬',
  gridQnColor: '#1e3a8a',
  gridQnColorDefault: true,
  gridTileColor: '#ffffff',
  gridTileColorDefault: true,
  categories: [],
  showCategories: false,
  showLeaderboard: true,
  activePreset: '',
};

function renderCategoryInputs() {
  const container = document.getElementById('settings-categories-inputs');
  if (!container) return;
  container.innerHTML = '';

  const showCats = db.settings.showCategories ?? false;
  container.style.display = showCats ? 'flex' : 'none';
  if (!showCats) return;

  const cols = db.settings.gridCols || 4;
  if (!db.settings.categories) {
    db.settings.categories = [];
  }

  for (let c = 0; c < cols; c++) {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.marginBottom = '6px';

    const label = document.createElement('label');
    label.textContent = `Category ${c + 1}`;
    label.style.fontSize = '0.75rem';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modern-input';
    input.style.fontSize = '0.85rem';
    input.value = db.settings.categories[c] || `Category ${c + 1}`;
    input.dataset.colIndex = c;

    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.colIndex, 10);
      db.settings.categories[idx] = e.target.value;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  }
}

function renderCategoryHeaders() {
  const cols = db.settings.gridCols || 4;
  const categories = db.settings.categories || [];
  const showCats = db.settings.showCategories ?? false;

  // Update Game Board categories
  const gameCatContainer = document.getElementById('game-board-categories');
  if (gameCatContainer) {
    gameCatContainer.innerHTML = '';
    gameCatContainer.style.setProperty('--cols', cols);
    if (!showCats) {
      gameCatContainer.style.setProperty('display', 'none', 'important');
    } else {
      gameCatContainer.style.removeProperty('display');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'category-label-cell';
        cell.textContent = categories[c] || `Category ${c + 1}`;
        gameCatContainer.appendChild(cell);
      }
    }
  }

  // Update Admin grid categories
  const adminCatContainer = document.getElementById('admin-categories');
  if (adminCatContainer) {
    adminCatContainer.innerHTML = '';
    adminCatContainer.style.setProperty('--cols', cols);
    if (!showCats) {
      adminCatContainer.style.setProperty('display', 'none', 'important');
    } else {
      adminCatContainer.style.removeProperty('display');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'category-label-cell';
        cell.textContent = categories[c] || `Category ${c + 1}`;
        adminCatContainer.appendChild(cell);
      }
    }
  }
}

function hydrateControlCenter(settings) {
  // If there are custom power-ups, default mode should be manual (unless set to none)
  const hasCustomPowerups = db.questions.some(q => q.powerup && q.powerup !== 'none');
  if (hasCustomPowerups && settings.powerupMode !== 'manual' && settings.powerupMode !== 'none') {
    settings.powerupMode = 'manual';
    saveDB();
  }

  const gridFontEl = document.getElementById('settings-grid-font');
  if (gridFontEl) gridFontEl.value = settings.gridFont ?? 'Fredoka One';
  
  const fontColorEl = document.getElementById('settings-grid-font-color');
  if (fontColorEl) fontColorEl.value = settings.gridFontColor ?? '#000000';

  const totalQuestionsEl = document.getElementById('settings-total-questions');
  if (totalQuestionsEl) totalQuestionsEl.value = settings.totalQuestions ?? 12;

  const colsEl = document.getElementById('settings-columns');
  if (colsEl) colsEl.value = settings.gridCols ?? 4;
  
  const templateSelect = document.getElementById('settings-load-template');
  if (templateSelect) templateSelect.value = settings.activePreset ?? '';
  

  
  const defaultFontColorEl = document.getElementById('settings-grid-font-color-default');
  if (defaultFontColorEl) defaultFontColorEl.checked = settings.useDefaultFontColor ?? true;

  const qnColorEl = document.getElementById('settings-grid-qn-color');
  if (qnColorEl) qnColorEl.value = settings.gridQnColor ?? '#1e3a8a';
  
  const qnColorDefaultEl = document.getElementById('settings-grid-qn-color-default');
  if (qnColorDefaultEl) qnColorDefaultEl.checked = settings.gridQnColorDefault ?? true;

  const tileColorEl = document.getElementById('settings-grid-tile-color');
  if (tileColorEl) {
    tileColorEl.value = settings.gridTileColor || '#ffffff';
    tileColorEl.disabled = settings.gridTileColorDefault ?? true;
  }

  const tileColorDefaultEl = document.getElementById('settings-grid-tile-color-default');
  if (tileColorDefaultEl) {
    tileColorDefaultEl.checked = settings.gridTileColorDefault ?? true;
  }


  
  const subtractEl = document.getElementById('settings-subtract');
  if (subtractEl) subtractEl.checked = settings.subtractOnWrong ?? true;
  
  const tieBreakerEl = document.getElementById('settings-enable-tiebreaker');
  if (tieBreakerEl) tieBreakerEl.checked = settings.enableTieBreaker ?? true;
  
  const tbVisEl = document.getElementById('settings-tiebreaker-visible');
  if (tbVisEl) tbVisEl.checked = settings.tiebreakerVisible ?? true;
  
  const displayModeEl = document.getElementById('settings-display-mode');
  if (displayModeEl) displayModeEl.value = settings.displayMode ?? 'QUESTION_POINTS';

  const powerupModeEl = document.getElementById('settings-powerup-mode');
  if (powerupModeEl) powerupModeEl.value = settings.powerupMode ?? 'random';
  
  const powerupCountEl = document.getElementById('settings-powerup-count');
  if (powerupCountEl) {
    const totalQuestions = settings.totalQuestions ?? 12;
    powerupCountEl.max = totalQuestions;
    if ((settings.randomPowerupsCount ?? 3) > totalQuestions) {
      settings.randomPowerupsCount = totalQuestions;
      saveDB();
    }
    powerupCountEl.value = settings.randomPowerupsCount ?? 3;
  }

  const powerupCountGroup = document.getElementById('powerup-count-group');
  if (powerupCountGroup) {
    powerupCountGroup.style.display = (settings.powerupMode ?? 'random') === 'random' ? 'block' : 'none';
  }
  

  

  
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

  const showCategoriesEl = document.getElementById('settings-show-categories');
  if (showCategoriesEl) showCategoriesEl.checked = settings.showCategories ?? false;

  const showLeaderboardEl = document.getElementById('settings-show-leaderboard');
  if (showLeaderboardEl) showLeaderboardEl.checked = settings.showLeaderboard ?? true;

  if (db.teams && db.teams.length >= 2) {
    const t1Name = document.getElementById('admin-team1-name');
    if (t1Name) t1Name.value = db.teams[0].name;
    const t2Name = document.getElementById('admin-team2-name');
    if (t2Name) t2Name.value = db.teams[1].name;
  }

  renderCategoryInputs();
}

function loadSavedDB(parsed) {
  if (parsed && typeof parsed === 'object') {
    db = {
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        categories: (parsed.settings && Array.isArray(parsed.settings.categories)) ? [...parsed.settings.categories] : []
      },
      questions: (parsed.questions || []).map(q => {
        if (q.type === 'long' || q.type === 'long_answer') q.type = 'short_answer';
        if (q.questionType === 'long' || q.questionType === 'long_answer') q.questionType = 'short_answer';
        if (q.qnIndex !== 'tiebreaker' && q.qnIndex !== undefined && q.qnIndex !== null) {
          const parsedIdx = parseInt(q.qnIndex, 10);
          if (!isNaN(parsedIdx)) q.qnIndex = parsedIdx;
        }
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

    // Ensure totalQuestions covers the highest configured question index
    const maxIdx = db.questions.reduce((max, q) => {
      const idx = parseInt(q.qnIndex, 10);
      return (!isNaN(idx) && idx > max) ? idx : max;
    }, 0);
    if (maxIdx > db.settings.totalQuestions) {
      db.settings.totalQuestions = maxIdx;
    }
    
    db.settings.showCategories = false;
    hydrateControlCenter(db.settings);
    
    document.documentElement.style.setProperty('--cols', db.settings.gridCols || 4);
    
    renderGameBoard();
    renderAdminGrid();
    applySelectedFont();
  }
}

async function loadDB() {
  // ALWAYS load questions from default_quiz.json on startup.
  // This is the authoritative source of truth for quiz content and guarantees
  // the Daniel quiz is available every time the app opens.
  // User preferences (settings, team names) are then overlaid from localStorage.
  try {
    const response = await fetch('default_quiz.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const defaultData = await response.json();

    // Set questions from the JSON file (always)
    db.questions = (defaultData.questions || []).map(q => {
      if (q.type === 'long' || q.type === 'long_answer') q.type = 'short_answer';
      if (q.questionType === 'long' || q.questionType === 'long_answer') q.questionType = 'short_answer';
      if (q.qnIndex !== 'tiebreaker' && q.qnIndex !== undefined && q.qnIndex !== null) {
        const idx = parseInt(q.qnIndex, 10);
        if (!isNaN(idx)) q.qnIndex = idx;
      }
      if (q.qnIndex === 'tiebreaker') {
        if (q.type === 'tiebreaker') q.type = 'short_answer';
        if (q.questionType === 'tiebreaker') q.questionType = 'short_answer';
      }
      return q;
    });

    // Start with JSON settings as the base
    db.settings = {
      ...defaultSettings,
      ...(defaultData.settings || {}),
      categories: (defaultData.settings && Array.isArray(defaultData.settings.categories))
        ? [...defaultData.settings.categories] : []
    };

    // Set teams from JSON as the base
    if (defaultData.teams && Array.isArray(defaultData.teams) && defaultData.teams.length >= 2) {
      db.teams = defaultData.teams.slice(0, 2).map((t, i) => {
        let teamObj = typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : { ...t };
        if (teamObj.useDefault === undefined) {
          teamObj.useDefault = (teamObj.name === DEFAULT_TEAMS[i].name && (teamObj.logo === DEFAULT_TEAMS[i].logo || !teamObj.logo));
        }
        return teamObj;
      });
    } else {
      db.teams = [...DEFAULT_TEAMS];
    }
  } catch (err) {
    console.error('Failed to load default_quiz.json, using hardcoded defaults:', err);
    db.settings = { ...defaultSettings, categories: [] };
  }

  // Overlay saved USER PREFERENCES from localStorage (settings + teams only, NOT questions)
  // This preserves font, colour, and team name choices across sessions.
  const saved = localStorage.getItem('review_game_db');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        // Merge settings (user's saved preferences win over defaults)
        if (parsed.settings && typeof parsed.settings === 'object') {
          db.settings = {
            ...db.settings,
            ...parsed.settings,
            categories: Array.isArray(parsed.settings.categories)
              ? [...parsed.settings.categories] : db.settings.categories
          };
        }
        // Restore team names / logos if user customised them
        if (parsed.teams && Array.isArray(parsed.teams) && parsed.teams.length >= 2) {
          db.teams = parsed.teams.slice(0, 2).map((t, i) => {
            let teamObj = typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : { ...t };
            if (teamObj.useDefault === undefined) {
              teamObj.useDefault = (teamObj.name === DEFAULT_TEAMS[i].name && (teamObj.logo === DEFAULT_TEAMS[i].logo || !teamObj.logo));
            }
            return teamObj;
          });
        }
      }
    } catch (e) {
      console.warn('Could not parse saved preferences from localStorage:', e);
    }
  }

  if (!db.teams || !Array.isArray(db.teams) || db.teams.length < 2) {
    db.teams = [...DEFAULT_TEAMS];
  }

  // Ensure totalQuestions covers the highest configured question index
  const maxIdx = db.questions.reduce((max, q) => {
    const idx = parseInt(q.qnIndex, 10);
    return (!isNaN(idx) && idx > max) ? idx : max;
  }, 0);
  if (maxIdx > db.settings.totalQuestions) {
    db.settings.totalQuestions = maxIdx;
  }
  
  // Ensure category showing is defaulted to off state when loaded
  db.settings.showCategories = false;
  
  // Persist the merged state back to localStorage so it's ready for next session
  fallbackSaveDB();
  hydrateControlCenter(db.settings);
  applySelectedFont();
}


function updateDashboardStatus() {
  const statusDiv = document.getElementById('dashboard-status');
  const startBtn = document.getElementById('btn-start-game');
  const count = db.questions.length;

  if (count === 0) {
    statusDiv.innerHTML = `
      <div class="card-inner-layout">
        <div class="card-left-icon">
          <div class="card-outer-circle" style="border-color: #d97706; width: 44px; height: 44px;">
            <div class="card-inner-circle" style="background: white;">
              <span class="card-emoji" style="font-size: 1.2rem;">⚠️</span>
            </div>
          </div>
        </div>
        <div class="card-right-details">
          <span class="card-qn-title" style="font-size: 1.2rem !important; color: #1e293b !important;">No questions configured yet!</span>
          <span class="card-qn-points" style="font-size: 0.85rem !important; margin-top: 2px; color: var(--color-text-muted) !important;">You must add questions to the database before starting the game.</span>
        </div>
      </div>`;
    startBtn.disabled = false;
    startBtn.innerHTML = 'Go to Admin Panel';
  } else {
    statusDiv.innerHTML = `
      <div class="card-inner-layout">
        <div class="card-left-icon">
          <div class="card-outer-circle" style="border-color: #16a34a; width: 44px; height: 44px;">
            <div class="card-inner-circle" style="background: white;">
              <span class="card-emoji" style="font-size: 1.2rem;">✅</span>
            </div>
          </div>
        </div>
        <div class="card-right-details">
          <span class="card-qn-title" style="color: #15803d; font-size: 1.2rem !important;">Quiz ready!</span>
          <span class="card-qn-points" style="font-size: 0.85rem !important; margin-top: 2px; color: var(--color-text-muted) !important;">
            <strong style="color: var(--color-text-light);">${count}</strong> question${count !== 1 ? 's' : ''} added. Good to go!
          </span>
        </div>
      </div>`;
    startBtn.disabled = false;

    // Check if the game is already active
    const adminResumeBtn = document.getElementById('btn-admin-resume');
    const isGameActive = (playState.teams && playState.teams.length > 0 && playState.phase !== 'ended' && localStorage.getItem('review_game_playstate') !== null);
    if (isGameActive) {
      startBtn.innerHTML = 'Resume Game';
    } else {
      startBtn.innerHTML = 'Start Game!';
    }
    if (adminResumeBtn) {
      if (playState.activeScreen === 'admin') {
        adminResumeBtn.style.display = 'inline-flex';
        adminResumeBtn.innerHTML = isGameActive ? 'Resume Game' : 'Start Game';
      } else {
        adminResumeBtn.style.display = 'none';
      }
    }
  }
  parseEmojis(statusDiv);
  parseEmojis(startBtn);
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
            powerups: playState.powerups,
    powerupUsed: playState.powerupUsed,
    practiceMode: playState.practiceMode
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
        playState.teams = (parsed.teams ?? []).map(t => ({
          ...t
        }));
        const isPractice = parsed.practiceMode ?? false;
        if ((!playState.teams || playState.teams.length < 2) && !isPractice) {
          setupTeamsFromInputs();
        }
        playState.currentTeamIndex = parsed.currentTeamIndex ?? 0;
        playState.currentQuestionValue = parsed.currentQuestionValue ?? 0;
        playState.teamsAttemptedCount = parsed.teamsAttemptedCount ?? 0;
        playState.answeredCells = parsed.answeredCells ?? {};
        playState.currentCellId = parsed.currentCellId ?? null;
        playState.currentQuestion = parsed.currentQuestion ?? null;
        playState.stats = parsed.stats ?? {};
        playState.cancelLocked = parsed.cancelLocked ?? false;
        playState.powerups = parsed.powerups ?? {};
        playState.powerupUsed = parsed.powerupUsed ?? {
          secondChanceActive: false,
          secondChanceUsed: false,
          safetyNetActive: false,
          stealShieldActive: false,
          doublePointsActive: false,
          extraTimeActive: false,
          revealedCells: {}
        };
        playState.practiceMode = parsed.practiceMode ?? false;

                
        // Sync UIs
        updateGameStatusUI();
        updateScoreUI();
        renderGameBoard();
        updateTurnUI();

        // Clean up any stale modal/transitional states on load
        playState.gameState = 'IDLE';
        playState.currentCellId = null;
        playState.currentQuestion = null;
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
    
    db.questions = defaultData.questions || [];
    
    if (defaultData.settings) {
       db.settings = { ...defaultSettings, ...defaultData.settings, categories: (defaultData.settings.categories || []) };
    }
    if (defaultData.teams && Array.isArray(defaultData.teams) && defaultData.teams.length >= 2) {
      db.teams = defaultData.teams.slice(0, 2).map((t, i) => {
        let teamObj = typeof t === 'string' ? { name: t, logo: DEFAULT_TEAMS[i].logo } : t;
        if (teamObj.useDefault === undefined) {
          teamObj.useDefault = (teamObj.name === DEFAULT_TEAMS[i].name && (teamObj.logo === DEFAULT_TEAMS[i].logo || !teamObj.logo));
        }
        return teamObj;
      });
    }
  } catch (err) {
    console.error("Failed to fetch default_quiz.json:", err);
  }

  db.settings.showCategories = false;
  db.settings.activePreset = '';

  // Save only to localStorage — do NOT call saveDB() here as that would
  // POST to /api/save-db and overwrite default_quiz.json with runtime state.
  fallbackSaveDB();
  hydrateControlCenter(db.settings);
  applySelectedFont();
  
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  resetPlayState();
  saveGameState();
  updateGameStatusUI();
  renderAdminGrid();
  renderGameBoard();

  triggerAlert('SYSTEM', 'Questions loaded!', 'gain');
  const statusDiv = document.getElementById('dashboard-status');
  if (statusDiv) {
    statusDiv.innerHTML = `
      <div class="card-inner-layout">
        <div class="card-left-icon">
          <div class="card-outer-circle" style="border-color: #16a34a; width: 44px; height: 44px;">
            <div class="card-inner-circle" style="background: white;">
              <span class="card-emoji" style="font-size: 1.2rem;">✅</span>
            </div>
          </div>
        </div>
        <div class="card-right-details">
          <span class="card-qn-title" style="color: #15803d; font-size: 1.2rem !important;">Default Database Loaded!</span>
        </div>
      </div>`;
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
      parseEmojis(icon);
      icon.style.transform = 'rotate(0deg) scale(1)';
      icon.style.opacity = '1';
    }, 200);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applySelectedFont() {
  const sanitizeColor = (val, fallback) => {
    if (typeof val !== 'string') return fallback;
    const safePattern = /^#([0-9a-fA-F]{3,8})$|^(rgb|rgba|hsl|hsla)\([0-9a-fA-F%,\s\(\)\.\/\-\+]*\)$|^[a-zA-Z]+$/;
    const trimmed = val.trim();
    return safePattern.test(trimmed) ? trimmed : fallback;
  };

  const rawFont = db.settings.gridFont || 'Fredoka One';
  const font = rawFont.replace(/[^a-zA-Z0-9\s"'\-]/g, '').trim();
  const applyAll = !!db.settings.applyFontToAll;
  const useDefaultColor = db.settings.useDefaultFontColor !== false; // Default to true!
  const fontColor = sanitizeColor(db.settings.gridFontColor, '#ffffff');
  const fontBold = !!db.settings.gridFontBold;

  let styleEl = document.getElementById('dynamic-font-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-font-overrides';
    document.head.appendChild(styleEl);
  }

  let css = '';

  // 1. Font Family override — always include Noto Sans as final Unicode fallback
  if (font !== 'none') {
    css += `
      .board-cell, .game-cell-btn, .cell-qn, .cell-qn-label, .board-cell *, .game-cell-btn * {
        font-family: "${font}", "Fredoka One", "Noto Sans", "Noto Sans Malayalam", "Noto Sans Devanagari", "Nunito", sans-serif !important;
      }
    `;
  } else {
    // Even in 'none' mode, ensure Noto Sans is available as Unicode fallback
    css += `
      .board-cell, .game-cell-btn, .cell-qn, .cell-qn-label, .board-cell *, .game-cell-btn * {
        font-family: "Fredoka One", "Noto Sans", "Noto Sans Malayalam", "Noto Sans Devanagari", "Nunito", sans-serif !important;
      }
    `;
  }

  // 2. Font Color override — applies to card-qn-points and card-qn-title
  //    so the game board matches the admin board color exactly
  if (!useDefaultColor) {
    css += `
      .card-qn-points {
        color: ${fontColor} !important;
      }
    `;
  }

  const useDefaultQnColor = db.settings.useDefaultQnColor !== false;
  const qnFontColor = sanitizeColor(db.settings.gridQnColor, '#1e3a8a');

  if (!useDefaultQnColor) {
    css += `
      .card-qn-title {
        color: ${qnFontColor} !important;
      }
    `;
  }

  const useDefaultTileColor = db.settings.gridTileColorDefault !== false;
  if (!useDefaultTileColor) {
    const tileColor = sanitizeColor(db.settings.gridTileColor, '#ffffff');
    css += `
      .game-board-grid .game-cell-btn:not(.cell-answered):not(.cell-wrong):not(.cell-cancelled),
      .admin-interactive-grid .board-cell,
      #game-board-grid .game-cell-btn:not(.cell-answered):not(.cell-wrong):not(.cell-cancelled),
      #admin-interactive-grid .board-cell {
        background: ${tileColor} !important;
        background-color: ${tileColor} !important;
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

function renderAdminGrid() {
  renderCategoryHeaders();
  const container = document.getElementById('admin-interactive-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  document.documentElement.style.setProperty('--cols', cols);

  const qCountEl = document.getElementById('admin-q-count');
  if (qCountEl) qCountEl.textContent = `Questions added: ${db.questions.length}`;

  const slotsCountEl = document.getElementById('slots-count-display');
  if (slotsCountEl) {
    const totalQ = db.settings.totalQuestions || 12;
    const hasTB = db.settings.enableTieBreaker ? ' + 1 Tie Breaker' : '';
    slotsCountEl.textContent = `${totalQ} Questions${hasTB}`;
  }

  const questionsExcludingTB = db.questions.filter(x => x.qnIndex !== 'tiebreaker');
  const total = db.settings.totalQuestions || 12;
  const baseRows = Math.ceil(total / cols);
  const rows = baseRows + (db.settings.enableTieBreaker ? 1 : 0);
  container.style.setProperty('--cols', cols);
  container.style.setProperty('--rows', rows);

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

      const rowIndex = r;
      const label = qnLabel(qn);

      const cell = document.createElement('div');
      cell.className = `board-cell theme-row-${rowIndex % 5} ${q ? 'has-q' : ''} ${selectedAdminCellId === cId ? 'selected-edit' : ''} ${isPlayed ? 'cell-played-locked' : ''}`;
      cell.dataset.cellId = cId;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `${label}: ${q ? 'Edit question' : 'Add question'}`);

      cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
      cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
      cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

      if (isPlayed) {
        const tColor = answered.teamIndex >= 0 ? TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length] : null;
        let emoji = '✔️';
        let detailText = 'Played';
        let detailColor = '#64748b';
        let ribbonColor = '#64748b';
        let ribbonContent = '✔️';
        let bgStyle = '';
        let borderStyle = '';
        
        if (answered.cancelled) {
          emoji = '❌';
          detailText = 'Cancelled';
          detailColor = '#64748b';
          ribbonColor = '#64748b';
          ribbonContent = '❌';
          bgStyle = '#f1f5f9';
          borderStyle = '#cbd5e1';
        } else if (answered.teamIndex === -1) {
          emoji = '❌';
          detailText = 'Missed';
          detailColor = '#ef4444';
          ribbonColor = '#ef4444';
          ribbonContent = '0';
          bgStyle = 'rgba(239, 68, 68, 0.07)';
          borderStyle = '#fca5a5';
        } else {
          const team = playState.teams[answered.teamIndex];
          detailText = team ? team.name : 'Correct';
          detailColor = tColor ? tColor.text : '#10b981';
          ribbonColor = tColor ? tColor.text : '#10b981';
          ribbonContent = `+${q.points}`;
          bgStyle = tColor ? tColor.bg : '';
          borderStyle = tColor ? tColor.border : '';
        }

        if (bgStyle) cell.style.background = bgStyle;
        if (borderStyle) cell.style.borderColor = borderStyle;

        cell.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: ${ribbonColor};">
                <div class="card-inner-circle" style="background: white;">
                  <span class="card-emoji" style="color: ${detailColor};">${emoji}</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              <span class="card-qn-title" style="color: #94a3b8;">${label}</span>
              <span class="card-qn-points" style="color: ${detailColor}; font-weight: 800;">${detailText}</span>
              <div class="cell-badges" style="margin-top: 6px; display: flex; gap: 4px;"></div>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: ${ribbonColor};">${ribbonContent}</div>
        `;
        
        const badgesContainer = cell.querySelector('.cell-badges');
        if (q && badgesContainer) {
          const typeBadge = document.createElement('span');
          typeBadge.className = 'cell-info-tag type-tag';
          typeBadge.textContent = q.type.toUpperCase();
          badgesContainer.appendChild(typeBadge);
        }
      } else {
        let titleHtml = `<span class="card-qn-title">${label}</span>`;
        let pointsHtml = q ? '' : `<span class="card-qn-points" style="color: #94a3b8; font-style: italic;">Empty</span>`;
        
        if (db.settings.displayMode === 'POINTS_ONLY' && q) {
          titleHtml = `<span class="card-qn-title">(${q.points})</span>`;
          pointsHtml = '';
        } else if (db.settings.displayMode === 'QUESTION_ONLY') {
          titleHtml = `<span class="card-qn-title">${label}</span>`;
          pointsHtml = '';
        }

        const cardEmoji = q ? '📝' : '➕';
        const ribbonText = q ? q.points : '+';
        const ribbonBg = q ? 'var(--theme-color)' : '#94a3b8';

        cell.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="${q ? '' : 'border-style: dashed; border-color: #cbd5e1;'}; border-color: var(--theme-color, #cbd5e1);">
                <div class="card-inner-circle" style="${q ? '' : 'background: #f8fafc; border-color: #cbd5e1;'}">
                  <span class="card-emoji" style="${q ? '' : 'color: #94a3b8; font-size: 1.3rem;'}">${cardEmoji}</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              ${titleHtml}
              ${pointsHtml}
              <div class="cell-badges" style="margin-top: 6px; display: flex; gap: 4px;"></div>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: ${ribbonBg};">${ribbonText}</div>
        `;
        
        const badgesContainer = cell.querySelector('.cell-badges');
        if (q && badgesContainer) {
          const typeBadge = document.createElement('span');
          typeBadge.className = 'cell-info-tag type-tag';
          typeBadge.textContent = q.type.toUpperCase();
          badgesContainer.appendChild(typeBadge);
          
          if (q.hasCustomCorrectVideo || q.hasCustomWrongVideo) {
            const customBadge = document.createElement('span');
            customBadge.className = 'cell-info-tag has-custom-tag';
            customBadge.textContent = '★ Vid';
            badgesContainer.appendChild(customBadge);
          }
        }
      }

      cell.addEventListener('click', () => {
        if (playState.phase === 'live') {
           const answered = playState.answeredCells[cId];
           if (answered && !answered.cancelled) {
             triggerAlert('SYSTEM', 'Cannot edit an already answered question during a live game.', 'error');
             return;
           }
        }
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
    const tbPlayed = !!(playState.teams && playState.teams.length > 0 && playState.answeredCells['c-tiebreaker']);

    const cell = document.createElement('div');
    cell.className = `board-cell tiebreaker-cell ${qTb ? 'has-q' : ''} ${selectedAdminCellId === 'q-tiebreaker' ? 'selected-edit' : ''} ${tbPlayed ? 'cell-played-locked' : ''}`;
    
    cell.style.gridColumn = '1 / -1';
    cell.style.justifySelf = 'center';
    cell.style.width = 'calc(50% - 5px)';
    cell.dataset.cellId = 'q-tiebreaker';

    cell.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
    cell.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
    cell.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';

    // Set custom CSS properties for tiebreaker
    cell.style.setProperty('--theme-color', '#d97706'); // Orange/Amber
    cell.style.setProperty('--theme-border', '#f59e0b');
    cell.style.setProperty('--theme-bg-tint', 'rgba(217, 119, 6, 0.07)');
    cell.style.setProperty('--theme-glow', 'rgba(217, 119, 6, 0.15)');

    let titleHtml = '<span class="card-qn-title">TIE BREAKER</span>';
    let pointsHtml = qTb ? '' : `<span class="card-qn-points" style="color: #94a3b8; font-style: italic;">Empty</span>`;
    
    if (db.settings.displayMode === 'POINTS_ONLY' && qTb) {
      titleHtml = `<span class="card-qn-title">(${qTb.points})</span>`;
      pointsHtml = '';
    } else if (db.settings.displayMode === 'QUESTION_ONLY') {
      titleHtml = '<span class="card-qn-title">TIE BREAKER</span>';
      pointsHtml = '';
    }

    const cardEmoji = qTb ? '🔥' : '➕';
    const ribbonText = qTb ? qTb.points : '+';
    const ribbonBg = qTb ? 'var(--theme-color)' : '#94a3b8';

    if (tbPlayed) {
      const answered = playState.answeredCells['c-tiebreaker'];
      const tColor = answered.teamIndex >= 0 ? TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length] : null;
      let emoji = '✔️';
      let detailText = 'Played';
      let detailColor = '#64748b';
      let ribbonColor = '#64748b';
      let ribbonContent = '✔️';
      let bgStyle = '';
      let borderStyle = '';
      
      if (answered.cancelled) {
        emoji = '❌';
        detailText = 'Cancelled';
        detailColor = '#64748b';
        ribbonColor = '#64748b';
        ribbonContent = '❌';
        bgStyle = '#f1f5f9';
        borderStyle = '#cbd5e1';
      } else if (answered.teamIndex === -1) {
        emoji = '❌';
        detailText = 'Missed';
        detailColor = '#ef4444';
        ribbonColor = '#ef4444';
        ribbonContent = '0';
        bgStyle = 'rgba(239, 68, 68, 0.07)';
        borderStyle = '#fca5a5';
      } else {
        const team = playState.teams[answered.teamIndex];
        detailText = team ? team.name : 'Correct';
        detailColor = tColor ? tColor.text : '#10b981';
        ribbonColor = tColor ? tColor.text : '#10b981';
        ribbonContent = `+${qTb.points}`;
        bgStyle = tColor ? tColor.bg : '';
        borderStyle = tColor ? tColor.border : '';
      }

      if (bgStyle) cell.style.background = bgStyle;
      if (borderStyle) cell.style.borderColor = borderStyle;

      cell.innerHTML = `
        <div class="card-inner-layout">
          <div class="card-left-icon">
            <div class="card-outer-circle" style="border-color: ${ribbonColor};">
              <div class="card-inner-circle" style="background: white;">
                <span class="card-emoji" style="color: ${detailColor};">${emoji}</span>
              </div>
            </div>
          </div>
          <div class="card-right-details">
            <span class="card-qn-title" style="color: #94a3b8;">TIE BREAKER</span>
            <span class="card-qn-points" style="color: ${detailColor}; font-weight: 800;">${detailText}</span>
            <div class="cell-badges" style="margin-top: 6px; display: flex; gap: 4px;"></div>
          </div>
        </div>
        <div class="card-corner-ribbon" style="background: ${ribbonColor};">${ribbonContent}</div>
      `;
      
      const badgesContainer = cell.querySelector('.cell-badges');
      if (qTb && badgesContainer) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'cell-info-tag type-tag';
        typeBadge.textContent = qTb.type.toUpperCase();
        badgesContainer.appendChild(typeBadge);
      }
    } else {
      cell.innerHTML = `
        <div class="card-inner-layout">
          <div class="card-left-icon">
            <div class="card-outer-circle" style="${qTb ? '' : 'border-style: dashed; border-color: #cbd5e1;'}; border-color: var(--theme-color, #cbd5e1);">
              <div class="card-inner-circle" style="${qTb ? '' : 'background: #f8fafc; border-color: #cbd5e1;'}">
                <span class="card-emoji" style="${qTb ? '' : 'color: #94a3b8; font-size: 1.3rem;'}">${cardEmoji}</span>
              </div>
            </div>
          </div>
          <div class="card-right-details">
            ${titleHtml}
            ${pointsHtml}
            <div class="cell-badges" style="margin-top: 6px; display: flex; gap: 4px;"></div>
          </div>
        </div>
        <div class="card-corner-ribbon" style="background: ${ribbonBg};">${ribbonText}</div>
      `;
      
      const badgesContainer = cell.querySelector('.cell-badges');
      if (qTb && badgesContainer) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'cell-info-tag type-tag';
        typeBadge.textContent = qTb.type.toUpperCase();
        badgesContainer.appendChild(typeBadge);
      }
    }

    cell.addEventListener('click', () => {
      if (playState.phase === 'live') {
         const answered = playState.answeredCells['c-tiebreaker'];
         if (answered && !answered.cancelled) {
           triggerAlert('SYSTEM', 'Cannot edit an already answered question during a live game.', 'error');
           return;
         }
      }
      playSound('click');
      selectedAdminCellId = 'q-tiebreaker';
      renderAdminGrid();
      openQuestionEditor('tiebreaker');
    });

    container.appendChild(cell);
  }
  parseEmojis(container);
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

  const qPowerupEl = document.getElementById('q-powerup');
  if (qPowerupEl) qPowerupEl.value = q ? (q.powerup || 'none') : 'none';

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
  renderCategoryHeaders();
  const layoutContainer = document.querySelector('.game-layout-container');
  const topBar = document.querySelector('.game-top-bar');
  if (layoutContainer) {
    const showLb = db.settings.showLeaderboard !== false;
    layoutContainer.classList.toggle('hide-leaderboard', !showLb);
    if (topBar) topBar.classList.toggle('hide-leaderboard', !showLb);
  }
  const container = document.getElementById('game-board-grid');
  container.innerHTML = '';
  const cols = db.settings.gridCols || 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  const maxConfiguredIndex = db.questions.reduce((max, q) => {
    const idx = parseInt(q.qnIndex, 10);
    return (!isNaN(idx) && idx > max) ? idx : max;
  }, 0);
  const total = Math.max(1, maxConfiguredIndex);
  const activeQuestions = db.questions
    .filter(x => x.qnIndex !== 'tiebreaker' && !isNaN(parseInt(x.qnIndex, 10)) && parseInt(x.qnIndex, 10) <= total)
    .sort((a, b) => a.qnIndex - b.qnIndex);

  const baseRows = Math.ceil(activeQuestions.length / cols);
  
  // Decide whether to show TB to correctly size rows
  const tieQ = db.questions.find(x => x.qnIndex === 'tiebreaker');
  const validQuestions = activeQuestions;
  let allAnswered = true;
  for (const q of validQuestions) {
    if (!playState.answeredCells[cellId(q.qnIndex)]) {
      allAnswered = false;
      break;
    }
  }
  const isTied = (playState.teams.length > 1 && playState.teams[0].score === playState.teams[1].score);
  const showTb = (allAnswered || playState.forceTieBreaker) && isTied;
  const showTiebreakerCell = db.settings.enableTieBreaker && (showTb || db.settings.tiebreakerVisible !== false);

  const rows = baseRows + (showTiebreakerCell ? 1 : 0);
  container.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  container.style.setProperty('--cols', cols);
  container.style.setProperty('--rows', rows);

  activeQuestions.forEach((q) => {
    const cId = cellId(q.qnIndex);
    const btn = document.createElement('button');
    btn.dataset.cellId = cId;
    btn.setAttribute('aria-label', qnLabel(q.qnIndex));
    
    // Match the admin cell font family, color, and weight EXACTLY
    btn.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
    btn.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
    btn.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';
    const answered = playState.answeredCells[cId];

    const rowIndex = Math.floor((q.qnIndex - 1) / cols);
    const label = qnLabel(q.qnIndex);
    let titleHtml = `<span class="card-qn-title">${label}</span>`;
    let pointsHtml = '';
    
    if (db.settings.displayMode === 'POINTS_ONLY') {
      titleHtml = `<span class="card-qn-title">(${q.points})</span>`;
      pointsHtml = '';
    } else if (db.settings.displayMode === 'QUESTION_ONLY') {
      titleHtml = `<span class="card-qn-title">${label}</span>`;
      pointsHtml = '';
    }

    if (answered && answered.cancelled) {
      btn.className = `game-cell-btn cell-cancelled theme-row-${rowIndex % 5}`;
      btn.disabled = true;
      btn.innerHTML = `
        <div class="card-inner-layout">
          <div class="card-left-icon">
            <div class="card-outer-circle" style="border-color: #64748b;">
              <div class="card-inner-circle" style="background: white;">
                <span class="card-emoji" style="color: #64748b;">❌</span>
              </div>
            </div>
          </div>
          <div class="card-right-details">
            <span class="card-qn-title" style="color: #64748b; text-decoration: line-through;">${label}</span>
            <span class="card-qn-points" style="color: #64748b;">Cancelled</span>
          </div>
        </div>
        <div class="card-corner-ribbon" style="background: #64748b;">❌</div>
      `;
    } else if (answered) {
      const isWrong = answered.teamIndex === -1;
      btn.className = `game-cell-btn ${isWrong ? 'cell-wrong' : 'cell-answered'} theme-row-${rowIndex % 5}`;
      btn.disabled = true;
      const tColor = answered.teamIndex >= 0 ? TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length] : null;
      
      if (isWrong) {
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: #ef4444;">
                <div class="card-inner-circle" style="background: white;">
                  <span class="card-emoji" style="color: #ef4444;">❌</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              <span class="card-qn-title" style="color: #1e293b;">${label}</span>
              <span class="card-qn-points" style="color: #ef4444; font-weight: 800;">Missed</span>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: #ef4444;">0</div>
        `;
      } else {
        const team = playState.teams[answered.teamIndex];
        const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
        btn.style.setProperty('--theme-color', '#16a34a');
        btn.style.setProperty('--theme-border', 'rgba(34, 197, 94, 0.4)');
        btn.style.setProperty('--theme-bg', 'rgba(34, 197, 94, 0.1)');
        
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: #16a34a;">
                <div class="card-inner-circle" style="background: white;">
                  <span class="card-emoji" style="color: #16a34a;">✔️</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              <span class="card-qn-title" style="color: #1e293b;">${label}</span>
              <span class="card-qn-points" style="color: ${tColor.text}; font-weight: 800;">${tName}</span>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: ${tColor.text};">+${q.points}</div>
        `;
      }
    } else {
      btn.className = `game-cell-btn theme-row-${rowIndex % 5}`;
      btn.innerHTML = `
        <div class="card-inner-layout">
          <div class="card-left-icon">
            <div class="card-outer-circle">
              <div class="card-inner-circle">
                <span class="card-emoji">📝</span>
              </div>
            </div>
          </div>
          <div class="card-right-details">
            ${titleHtml}
            ${pointsHtml}
          </div>
        </div>
        <div class="card-corner-ribbon">${q.points}</div>
      `;
      
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
  });

  if (showTiebreakerCell) {
    const cId = 'c-tiebreaker';
    const btn = document.createElement('button');
    btn.dataset.cellId = cId;
    btn.className = 'game-cell-btn tiebreaker-cell';
    btn.style.gridColumn = '1 / -1';
    btn.style.justifySelf = 'center';
    btn.style.width = 'calc(50% - 5px)';
    
    // Match the admin cell font family, color, and weight EXACTLY
    btn.style.fontFamily = db.settings.gridFont || 'var(--font-display)';
    btn.style.color = db.settings.gridFontColor || 'var(--color-text-light)';
    btn.style.fontWeight = db.settings.gridFontBold ? '900' : 'normal';
    
    // Set custom CSS properties for tiebreaker
    btn.style.setProperty('--theme-color', '#d97706'); // Orange/Amber
    btn.style.setProperty('--theme-border', '#f59e0b');
    btn.style.setProperty('--theme-bg-tint', 'rgba(217, 119, 6, 0.07)');
    btn.style.setProperty('--theme-glow', 'rgba(217, 119, 6, 0.15)');

    let titleHtml = '<span class="card-qn-title">TIE BREAKER</span>';
    let pointsHtml = '';
    
    if (db.settings.displayMode === 'POINTS_ONLY' && tieQ) {
      titleHtml = `<span class="card-qn-title">(${tieQ.points})</span>`;
      pointsHtml = '';
    } else if (db.settings.displayMode === 'QUESTION_ONLY') {
      titleHtml = '<span class="card-qn-title">TIE BREAKER</span>';
      pointsHtml = '';
    }

    const answered = playState.answeredCells[cId];
    if (!tieQ) {
      btn.disabled = true;
      btn.innerHTML = `<span class="cell-qn" style="opacity:0.2; font-size:1rem;">—</span>`;
    } else if (answered && answered.cancelled) {
      btn.className = 'game-cell-btn cell-cancelled tiebreaker-cell';
      btn.disabled = true;
      btn.innerHTML = `
        <div class="card-inner-layout">
          <div class="card-left-icon">
            <div class="card-outer-circle" style="border-color: #64748b;">
              <div class="card-inner-circle" style="background: white;">
                <span class="card-emoji" style="color: #64748b;">❌</span>
              </div>
            </div>
          </div>
          <div class="card-right-details">
            <span class="card-qn-title" style="color: #64748b; text-decoration: line-through;">TIE BREAKER</span>
            <span class="card-qn-points" style="color: #64748b;">Cancelled</span>
          </div>
        </div>
        <div class="card-corner-ribbon" style="background: #64748b;">❌</div>
      `;
    } else if (answered) {
      const isWrong = answered.teamIndex === -1;
      btn.className = `game-cell-btn ${isWrong ? 'cell-wrong' : 'cell-answered'} tiebreaker-cell`;
      btn.disabled = true;
      const tColor = answered.teamIndex >= 0 ? TEAM_COLORS[answered.teamIndex % TEAM_COLORS.length] : null;
      if (isWrong) {
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: #ef4444;">
                <div class="card-inner-circle" style="background: white;">
                  <span class="card-emoji" style="color: #ef4444;">❌</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              <span class="card-qn-title" style="color: #1e293b;">TIE BREAKER</span>
              <span class="card-qn-points" style="color: #ef4444; font-weight: 800;">Missed</span>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: #ef4444;">0</div>
        `;
      } else {
        const team = playState.teams[answered.teamIndex];
        const tName = team ? team.name : `Team ${answered.teamIndex + 1}`;
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: ${tColor.text};">
                <div class="card-inner-circle" style="background: white;">
                  <span class="card-emoji">✔️</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              <span class="card-qn-title" style="color: #1e293b;">TIE BREAKER</span>
              <span class="card-qn-points" style="color: ${tColor.text}; font-weight: 800;">${tName}</span>
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: ${tColor.text};">+${tieQ.points}</div>
        `;
      }
    } else {
      if (isTied) {
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle">
                <div class="card-inner-circle">
                  <span class="card-emoji">🔥</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              ${titleHtml}
              ${pointsHtml}
            </div>
          </div>
          <div class="card-corner-ribbon">${tieQ.points}</div>
        `;
        btn.addEventListener('click', () => {
          if (!canInteract() || !canOpenCell()) return;
          playSound('open');
          openQuestionModal(cId, tieQ);
        });
      } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = `
          <div class="card-inner-layout">
            <div class="card-left-icon">
              <div class="card-outer-circle" style="border-color: #94a3b8;">
                <div class="card-inner-circle" style="background: #f1f5f9;">
                  <span class="card-emoji">🔒</span>
                </div>
              </div>
            </div>
            <div class="card-right-details">
              ${titleHtml}
              ${pointsHtml}
            </div>
          </div>
          <div class="card-corner-ribbon" style="background: #94a3b8;">🔒</div>
        `;
      }
    }
    container.appendChild(btn);
  }
  applySelectedFont();
  parseEmojis(container);
}

// ============================================================
// TURN SYSTEM
// ============================================================
function updateTurnUI() {
  const turnDisplay = document.getElementById('turn-display');
  const stealBanner = document.getElementById('steal-banner');
  if ((!playState.teams || !Array.isArray(playState.teams) || playState.teams.length < 2) && !playState.practiceMode) {
    setupTeamsFromInputs();
  }
  if (playState.currentTeamIndex >= playState.teams.length) {
    playState.currentTeamIndex = 0;
  }
  const activeTeam = playState.teams[playState.currentTeamIndex];
  if (!activeTeam) return;

  updateTextAndCheckUnicode(turnDisplay, activeTeam.name.toUpperCase());
  turnDisplay.style.color = 'var(--color-gold)';
  stealBanner.classList.toggle('hidden', true); // removed steal state banner

  const announcer = document.querySelector('.turn-announcer');
  if (announcer) {
    announcer.classList.remove('announcer-switched');
    void announcer.offsetWidth; // trigger reflow
    announcer.classList.add('announcer-switched');
  }

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
function animateValue(element, start, end, duration = 800) {
  if (start === end) {
    element.textContent = end;
    return;
  }
  const range = end - start;
  const startTime = performance.now();
  let lastValue = start;
  
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Easing out quadratic
    const easeProgress = progress * (2 - progress);
    const value = Math.round(start + range * easeProgress);
    
    if (value !== lastValue) {
      lastValue = value;
      playTone(700, 'sine', 0.012, 0.06);
    }
    
    element.textContent = value;
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = end;
    }
  }
  requestAnimationFrame(step);
}

function updateScoreUI(updatedTeamIndex = -1) {
  const container = document.getElementById('game-team-panels');
  if (!container) return;

  if ((!playState.teams || !Array.isArray(playState.teams) || playState.teams.length < 2) && !playState.practiceMode) {
    setupTeamsFromInputs();
  }

  const liveScoreContainer = document.getElementById('live-score-display');
  const isGameActive = playState.teams && playState.teams.length > 0 && localStorage.getItem('review_game_playstate') !== null;

  // In-place update of score elements inside sidebar setup cards
  const t1ScoreInput = document.getElementById('admin-team1-score');
  const t2ScoreInput = document.getElementById('admin-team2-score');

  if (t1ScoreInput) {
    t1ScoreInput.disabled = !isGameActive;
    t1ScoreInput.placeholder = isGameActive ? "Adjust points" : "No active game";
    if (isGameActive && playState.teams[0] && document.activeElement !== t1ScoreInput) {
      t1ScoreInput.value = playState.teams[0].score;
    } else if (!isGameActive) {
      t1ScoreInput.value = '';
    }
  }

  if (t2ScoreInput) {
    t2ScoreInput.disabled = !isGameActive;
    t2ScoreInput.placeholder = isGameActive ? "Adjust points" : "No active game";
    if (isGameActive && playState.teams[1] && document.activeElement !== t2ScoreInput) {
      t2ScoreInput.value = playState.teams[1].score;
    } else if (!isGameActive) {
      t2ScoreInput.value = '';
    }
  }

  // If children count matches playState.teams.length, update in-place to avoid recreation
  if (container.children.length === playState.teams.length) {
    playState.teams.forEach((team, i) => {
      const color = TEAM_COLORS[i % TEAM_COLORS.length];
      const isActive = playState.currentTeamIndex === i;
      const panel = container.children[i];
      
      // Update active turn classes
      panel.className = `dynamic-team-panel glass-panel ${isActive ? 'active-turn' : ''} team-card-${i}`;
      panel.style.borderColor = isActive ? 'var(--color-gold)' : color.border;

      const nameSpan = panel.querySelector('.team-label');
      if (nameSpan && nameSpan.textContent !== team.name) {
        updateTextAndCheckUnicode(nameSpan, team.name);
      }

      const logoSrc = assetPath(team.logo || (team.name === 'Boy' ? 'boy.png' : 'girl.png'));
      const defaultEmoji = TEAM_ICONS[i % TEAM_ICONS.length] || '🦁';
      const isEmoji = team.avatarType === 'emoji';

      const img = panel.querySelector('.team-logo-circular');
      const fallbackSpan = panel.querySelector('.team-logo-fallback');

      if (img && fallbackSpan) {
        if (isEmoji) {
          img.style.display = 'none';
          fallbackSpan.style.display = 'flex';
          fallbackSpan.textContent = team.avatarVal;
        } else {
          img.style.display = 'block';
          if (img.getAttribute('src') !== logoSrc) {
            img.src = logoSrc;
          }
          fallbackSpan.style.display = 'none';
          fallbackSpan.textContent = defaultEmoji;
        }
        parseEmojis(fallbackSpan);
      }
      
      // Animate score changes
      const scoreSpan = document.getElementById(`score-team-${i}`);
      if (scoreSpan) {
        const startScore = parseInt(scoreSpan.textContent, 10) || 0;
        if (startScore !== team.score) {
          animateValue(scoreSpan, startScore, team.score, 800);
        }
      }
    });
  } else {
    // Rebuild grid panels
    container.innerHTML = '';
    playState.teams.forEach((team, i) => {
      const color = TEAM_COLORS[i % TEAM_COLORS.length];
      const isActive = playState.currentTeamIndex === i;
      const panel = document.createElement('div');
      panel.className = `dynamic-team-panel glass-panel ${isActive ? 'active-turn' : ''} team-card-${i}`;
      panel.style.borderColor = isActive ? 'var(--color-gold)' : color.border;

      const logoSrc = assetPath(team.logo || (team.name === 'Boy' ? 'boy.png' : 'girl.png'));
      const defaultEmoji = TEAM_ICONS[i % TEAM_ICONS.length] || '🦁';
      
      const isEmoji = team.avatarType === 'emoji';
      const imgDisplay = isEmoji ? 'none' : 'block';
      const fallbackDisplay = isEmoji ? 'flex' : 'none';
      const fallbackText = isEmoji ? team.avatarVal : defaultEmoji;

      panel.innerHTML = `
        <div class="team-logo-container" style="position: relative; width: 5.2rem; height: 5.2rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <img src="${logoSrc}" class="team-logo-circular" alt="${team.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="display: ${imgDisplay}; width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
          <span class="team-logo-fallback" style="display: ${fallbackDisplay}; font-size: 2.6rem; line-height: 1; align-items: center; justify-content: center; background: ${color.bg}; border: 2px solid ${color.border}; border-radius: 50%; width: 100%; height: 100%;">${fallbackText}</span>
        </div>
        <div class="team-details">
          <span class="team-label">${team.name}</span>
          <span id="score-team-${i}" class="team-score" style="color:${color.text};">${team.score}</span>
        </div>
      `;
      container.appendChild(panel);
    });
  }

  // Handle live score display
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

        const fontOverride = isUnicodeOtherLanguage(team.name) ? 'style="font-family: \'Noto Sans\', \'Noto Sans Malayalam\', \'Noto Sans Devanagari\', sans-serif !important;"' : '';
        liveItem.innerHTML = `
          <span class="live-score-team-name" ${fontOverride}>${team.name}</span>
          <span id="live-score-val-${i}" class="live-score-value">${team.score}</span>
        `;
        liveScoreContainer.appendChild(liveItem);
      });
    } else {
      playState.teams.forEach((team, i) => {
        const valSpan = document.getElementById(`live-score-val-${i}`);
        const nameSpan = valSpan ? valSpan.previousElementSibling : null;
        if (nameSpan) updateTextAndCheckUnicode(nameSpan, team.name);
        if (valSpan) {
          const oldScore = parseInt(valSpan.textContent, 10) || 0;
          if (oldScore !== team.score) {
            animateValue(valSpan, oldScore, team.score, 800);
            
            const liveItem = document.getElementById(`live-score-item-${i}`);
            if (liveItem) {
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
  parseEmojis(container);
  if (liveScoreContainer) {
    parseEmojis(liveScoreContainer);
  }
}

function renderSidebarLeaderboard() {
  const list = document.getElementById('sidebar-leaderboard-list');
  if (!list) return;
  list.innerHTML = '';

  if ((!playState.teams || !Array.isArray(playState.teams) || playState.teams.length < 2) && !playState.practiceMode) {
    setupTeamsFromInputs();
  }

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
  parseEmojis(list);
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
  const isTiebreaker = playState.currentCellId === 'c-tiebreaker';
  const canPass = q && !isTiebreaker && (playState.teamsAttemptedCount < playState.teams.length - 1);

  if (btnPass) {
    if (canPass) {
      btnPass.style.display = 'inline-flex';
      btnPass.disabled = false;
      btnPass.innerHTML = `PASS`;
    } else {
      btnPass.style.display = 'none';
      btnPass.disabled = true;
    }
  }

  if (btnCancel) {
    btnCancel.disabled = !!playState.cancelLocked;
  }
}

function adjustWinnerCardFontSizeToFit() {
  const winnerScreen = document.getElementById('screen-winner');
  const winnerCard = document.querySelector('.winner-card');
  if (!winnerScreen || !winnerCard || !winnerScreen.classList.contains('active')) return;

  // Force initial layout pass
  winnerCard.offsetHeight;

  // Defer if elements are not yet laid out (height is 0)
  if (winnerScreen.clientHeight === 0 || winnerCard.clientHeight === 0) {
    requestAnimationFrame(adjustWinnerCardFontSizeToFit);
    return;
  }

  let scaleFactor = 1.0;
  winnerCard.style.setProperty('--winner-scale', scaleFactor);

  // Force reflow for the reset scale factor
  winnerCard.offsetHeight;

  const maxIterations = 40;
  let iterations = 0;
  const paddingBuffer = 40; // leaving a small buffer
  const testEl = document.getElementById('winner-team-name') || winnerCard.firstElementChild;

  // Decrease the scale factor until content fits within the winner screen card (no scrollbar)
  while (
    (winnerCard.scrollHeight > winnerCard.clientHeight ||
     winnerCard.scrollWidth > winnerCard.clientWidth) &&
    scaleFactor > 0.45 &&
    iterations < maxIterations
  ) {
    scaleFactor -= 0.02;
    winnerCard.style.setProperty('--winner-scale', scaleFactor);
    
    // Force layout update inside the loop so the scrollHeight updates synchronously
    if (testEl) testEl.offsetHeight;
    winnerCard.offsetHeight;
    
    iterations++;
  }
}


// ============================================================
// QUESTION MODAL
// ============================================================
function showQuestionContent(cId, q) {
  const turnSelector = document.getElementById('tiebreaker-turn-selector');
  const btnSubmit = document.getElementById('btn-modal-submit');
  const btnPass = document.getElementById('btn-modal-pass');
  const questionTextEl = document.getElementById('modal-question-text');
  const mcqContainer = document.getElementById('modal-mcq-container');
  const fillContainer = document.getElementById('modal-fill-container');
  const turnStatus = document.getElementById('modal-turn-status');
  const footer = document.querySelector('.modal-footer');
  
  if (footer) footer.style.display = 'flex';
  questionTextEl.style.display = 'block';

  if (cId === 'c-tiebreaker') {
    // Hide standard question details until a team is selected
    questionTextEl.style.display = 'none';
    mcqContainer.classList.add('hidden');
    fillContainer.classList.add('hidden');
    turnStatus.textContent = 'AWAITING HAND-RAISE';

    if (btnSubmit) btnSubmit.disabled = true;
    if (btnPass) btnPass.style.display = 'none';

    // Show hand-raise selection panel
    turnSelector.classList.remove('hidden');
    const buttonsGrid = document.getElementById('tiebreaker-selector-buttons');
    buttonsGrid.innerHTML = '';

    playState.teams.forEach((team, idx) => {
      const btn = document.createElement('button');
      btn.className = 'selector-team-btn';
      btn.textContent = team.name;
      btn.addEventListener('click', () => {
        playSound('click');
        playState.currentTeamIndex = idx;
        turnStatus.textContent = `${team.name.toUpperCase()} TURN`;

        // Hide selector, reveal question text and active submit button
        turnSelector.classList.add('hidden');
        questionTextEl.style.display = 'block';
        if (btnSubmit) btnSubmit.disabled = false;

        // Show proper question container
        if ((q.questionType || q.type) === 'mcq') {
          mcqContainer.classList.remove('hidden');
        } else {
          fillContainer.classList.remove('hidden');
          const fillInput = document.getElementById('modal-fill-input');
          setTimeout(() => fillInput.focus(), 100);
        }
        
      });
      buttonsGrid.appendChild(btn);
    });
  } else {
    // Normal question flow
    turnSelector.classList.add('hidden');
    
    const activeTeam = playState.teams[playState.currentTeamIndex];
    turnStatus.textContent = `${activeTeam.name.toUpperCase()} TURN`;

    if (btnSubmit) btnSubmit.disabled = false;
    
    // Hide pass button if in Practice Mode
    if (playState.practiceMode) {
      if (btnPass) btnPass.style.display = 'none';
    } else {
      if (btnPass) btnPass.style.display = 'inline-flex';
    }

    if ((q.questionType || q.type) === 'mcq') {
      mcqContainer.classList.remove('hidden');
      fillContainer.classList.add('hidden');
    } else {
      mcqContainer.classList.add('hidden');
      fillContainer.classList.remove('hidden');
      const fillInput = document.getElementById('modal-fill-input');
      setTimeout(() => fillInput.focus(), 100);
    }
  }


  
  fitModalText();
  requestAnimationFrame(fitModalText);
}

function fitModalText() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;

  const modal = overlay.querySelector('.modal-content');
  if (!modal || modal.clientHeight === 0) return;

  const questionText = document.getElementById('modal-question-text');
  const optionBtns = document.querySelectorAll('#modal-overlay .option-btn');
  const revealPanel = document.getElementById('modal-reveal-panel');
  const revealVal = document.getElementById('modal-correct-answer-text');

  // Reset to default CSS values
  if (questionText) questionText.style.fontSize = '';
  optionBtns.forEach(btn => {
    btn.style.fontSize = '';
    const valSpan = btn.querySelector('.option-val');
    if (valSpan) valSpan.style.fontSize = '';
  });
  if (revealPanel) revealPanel.style.fontSize = '';
  if (revealVal) revealVal.style.fontSize = '';

  // Get base computed pixel values
  const qBase = questionText ? parseFloat(window.getComputedStyle(questionText).fontSize) : 0;
  const optBases = Array.from(optionBtns).map(btn => {
    const valSpan = btn.querySelector('.option-val');
    return valSpan ? parseFloat(window.getComputedStyle(valSpan).fontSize) : parseFloat(window.getComputedStyle(btn).fontSize);
  });
  const revBase = revealPanel ? parseFloat(window.getComputedStyle(revealPanel).fontSize) : 0;
  const revValBase = revealVal ? parseFloat(window.getComputedStyle(revealVal).fontSize) : 0;

  let scale = 1.0;
  const minScale = 0.45; // Keep basic legibility
  const step = 0.02;

  // Helper check for any overflow (overall or container-level)
  const hasOverflow = () => {
    if (modal.scrollHeight > modal.clientHeight) return true;
    if (questionText && questionText.scrollHeight > questionText.clientHeight) return true;
    if (revealPanel && !revealPanel.classList.contains('hidden') && revealPanel.scrollHeight > revealPanel.clientHeight) return true;
    return false;
  };

  // Reduce font size progressively while any content overflows
  while (hasOverflow() && scale > minScale) {
    scale -= step;
    if (questionText && qBase) {
      questionText.style.fontSize = `${qBase * scale}px`;
    }
    optionBtns.forEach((btn, idx) => {
      const valSpan = btn.querySelector('.option-val');
      if (valSpan && optBases[idx]) {
        valSpan.style.fontSize = `${optBases[idx] * scale}px`;
      } else if (optBases[idx]) {
        btn.style.fontSize = `${optBases[idx] * scale}px`;
      }
    });
    if (revealPanel && revBase) {
      revealPanel.style.fontSize = `${revBase * scale}px`;
    }
    if (revealVal && revValBase) {
      revealVal.style.fontSize = `${revValBase * scale}px`;
    }
  }
}

function openQuestionModal(cId, q) {
  if (!transitionState('QUESTION_LOADING')) return;

  playState.currentCellId = cId;
  playState.currentQuestion = q;
  playState.teamsAttemptedCount = 0;
  playState.originalTeamIndex = playState.currentTeamIndex;
  playState.cancelLocked = false;

  // Sync manual powerup from database if in manual powerup mode
  if (db.settings.powerupMode === 'manual') {
    if (q && q.powerup && q.powerup !== 'none') {
      playState.powerups[cId] = q.powerup;
    } else {
      delete playState.powerups[cId];
    }
  }
  
  // Reset active powerups
  playState.powerupUsed.doublePointsActive = false;
  playState.powerupUsed.stealShieldActive = false;
  playState.powerupUsed.secondChanceActive = false;
  playState.powerupUsed.secondChanceUsed = false;
  playState.powerupUsed.safetyNetActive = false;

  // Double Points Power-up modifier
  if (cId !== 'c-tiebreaker' && playState.powerups[cId] === 'double_points') {
    playState.currentQuestionValue = q.points * 2;
    playState.powerupUsed.doublePointsActive = true;
  } else {
    playState.currentQuestionValue = q.points;
  }

  // Steal Shield Power-up modifier
  if (cId !== 'c-tiebreaker' && playState.powerups[cId] === 'steal_shield') {
    playState.powerupUsed.stealShieldActive = true;
  }

  // Second Chance Power-up activation
  if (cId !== 'c-tiebreaker' && (playState.powerups[cId] === 'second_chance' || playState.powerups[cId] === 'fifty_fifty')) {
    playState.powerupUsed.secondChanceActive = true;
  }

  // Safety Net Power-up activation
  if (cId !== 'c-tiebreaker' && (playState.powerups[cId] === 'safety_net' || playState.powerups[cId] === 'free_pass')) {
    playState.powerupUsed.safetyNetActive = true;
  }

  const overlay = document.getElementById('modal-overlay');
  const contentNode = document.querySelector('.modal-content');
  enableModalActionButtons();
  document.getElementById('modal-steal-label').classList.toggle('hidden', true);

  const qnIndex = q.qnIndex || parseInt(cId.replace('qn', ''), 10);
  document.getElementById('modal-cell-id').textContent = qnLabel(qnIndex);
  document.getElementById('modal-points-display').textContent = `${playState.currentQuestionValue} POINTS`;

  const turnStatus = document.getElementById('modal-turn-status');
  turnStatus.style.color = 'var(--color-gold)';
  turnStatus.style.borderColor = 'rgba(244,196,48,0.3)';

  const questionTextEl = document.getElementById('modal-question-text');
  updateTextAndCheckUnicode(questionTextEl, q.question);

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

  // Pre-initialize MCQ options if needed
  if ((q.questionType || q.type) === 'mcq') {
    const optBtns = document.querySelectorAll('.option-btn');
    const letters = ['A', 'B', 'C', 'D'];
    optBtns.forEach((btn, i) => {
      btn.className = 'option-btn';
      btn.disabled = false;
      btn.style.cursor = '';
      btn.style.opacity = '';
      btn.classList.remove('disabled-fifty-fifty');
      btn.querySelector('.option-letter').textContent = letters[i];
      const optValSpan = btn.querySelector('.option-val');
      if (optValSpan) {
        updateTextAndCheckUnicode(optValSpan, q.options ? q.options[i] : '');
      }
      btn.onclick = () => {
        if (!canInteract() || !canAnswer()) return;
        document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        playSound('click');
      };
    });
  } else {
    const fillInput = document.getElementById('modal-fill-input');
    fillInput.value = '';
    fillInput.disabled = false;
    fillInput.style.cursor = '';
    fillInput.style.borderColor = '';
  }

  const btnSubmit = document.getElementById('btn-modal-submit');
  updateTextAndCheckUnicode(document.getElementById('modal-correct-answer-text'), q.correctAnswer || q.answer);
  if (contentNode) contentNode.classList.remove('feedback-correct', 'feedback-wrong');
  const btnNext = document.getElementById('btn-modal-next');
  if (btnNext) {
    btnNext.style.display = 'none';
    btnNext.disabled = true;
  }
  if (btnSubmit) btnSubmit.style.display = 'inline-flex';

  overlay.classList.add('open');
  transitionState('AWAITING_FIRST_ANSWER');
  enableModalActionButtons();
  parseEmojis(overlay);

  // Check if we should reveal a hidden power-up first
  const pType = playState.powerups[cId];
  playState.powerupUsed.revealedCells = playState.powerupUsed.revealedCells || {};
  
  if (cId !== 'c-tiebreaker' && pType && !playState.powerupUsed.revealedCells[cId] && !playState.practiceMode) {
    // Stage 1: Power-up Reveal Mode
    turnStatus.textContent = "Choose Power Up";
    const powerupPanel = document.getElementById('powerup-reveal-panel');
    const card = document.getElementById('powerup-card');
    const continueBtn = document.getElementById('btn-powerup-continue');
    
    // Hide standard elements
    questionTextEl.style.display = 'none';
    mcqContainer.classList.add('hidden');
    fillContainer.classList.add('hidden');
    document.getElementById('tiebreaker-turn-selector').classList.add('hidden');
    const footer = document.querySelector('.modal-footer');
    if (footer) footer.style.display = 'none';
    
    // Configure power-up face
    const revealIcon = document.getElementById('powerup-reveal-icon');
    const revealName = document.getElementById('powerup-reveal-name');
    const revealDesc = document.getElementById('powerup-reveal-desc');
    
    card.classList.remove('flipped');
    continueBtn.style.opacity = '0';
    continueBtn.style.pointerEvents = 'none';
    
    if (pType === 'double_points') {
      revealIcon.textContent = '🌟';
      revealName.textContent = 'DOUBLE POINTS';
      revealDesc.textContent = 'Doubles the points for this question! High stakes, double potential!';
    } else if (pType === 'steal_shield') {
      revealIcon.textContent = '🛡️';
      revealName.textContent = 'STEAL SHIELD';
      revealDesc.textContent = 'Prevents the opposing team from stealing if you get it wrong!';
    } else if (pType === 'second_chance' || pType === 'fifty_fifty') {
      revealIcon.textContent = '🔄';
      revealName.textContent = 'SECOND CHANCE';
      revealDesc.textContent = 'Gives your team a free second attempt if your first answer is incorrect!';
    } else if (pType === 'safety_net' || pType === 'free_pass') {
      revealIcon.textContent = '🩹';
      revealName.textContent = 'SAFETY NET';
      revealDesc.textContent = 'If you answer wrong, you lose 0 points instead of the normal 50% point deduction!';
    }
    
    parseEmojis(powerupPanel);
    powerupPanel.classList.remove('hidden');
    
    setTimeout(() => {
      card.classList.add('flipped');
      playSound('powerup');
    }, 700);
    
    setTimeout(() => {
      continueBtn.style.opacity = '1';
      continueBtn.style.pointerEvents = 'auto';
      continueBtn.style.transition = 'opacity 0.4s ease';
    }, 1500);

    continueBtn.onclick = () => {
      playSound('click');
      powerupPanel.classList.add('hidden');
      
      // Stage 2: Question View
      showQuestionContent(cId, q);
            
      playState.powerupUsed.revealedCells[cId] = true;
      saveGameState();
    };
  } else {
    // Direct Question Mode (no power-up or already revealed)
    document.getElementById('powerup-reveal-panel').classList.add('hidden');
    showQuestionContent(cId, q);
    

  }
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
  videoContainer.className = 'feedback-video-container wrong';

  const video = document.createElement('video');
  video.src = finalSrc;
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
  skipBtn.style.borderRadius = '16px';
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
  videoContainer.className = 'feedback-video-container correct';

  const video = document.createElement('video');
  video.src = finalSrc;
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
  skipBtn.style.borderRadius = '16px';
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
  videoContainer.className = 'feedback-video-container winner';

  const video = document.createElement('video');
  video.src = finalSrc;
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
  skipBtn.style.borderRadius = '16px';
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
    if (points === 0) {
      triggerAlert(teamName, `0 Points Lost (Safety Net)`, 'info');
    } else {
      playState.teams[teamIndex].score -= points;
      // Show red danger alert immediately
      triggerAlert(teamName, `-${points} Points`, 'lose');
    }
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

  const templateSelect = document.getElementById('settings-load-template');
  if (templateSelect) {
    templateSelect.addEventListener('focus', () => {
      templateSelect.value = '';
    });
    templateSelect.addEventListener('blur', () => {
      templateSelect.value = db.settings.activePreset || '';
    });
    templateSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        loadBibleStoryTemplate(val);
      }
    });
  }

  const btnCsvTemplate = document.getElementById('btn-download-csv-template');
  if (btnCsvTemplate) {
    btnCsvTemplate.addEventListener('click', () => {
      const csvContent = "Question Number,Type,Question,Answer,Option A,Option B,Option C,Option D,Points,Powerup\n" +
                         "1,mcq,What did God use to make Eve?,A rib of Adam,A rib of Adam,Dust of the earth,A clay mold,A breath of life,200,double_points\n" +
                         "2,fill_blank,David defeated Goliath using a stone and a __________.,sling,,,,,300,safety_net\n" +
                         "3,short_answer,Who was swallowed by a great fish?,Jonah,,,,,500,none\n" +
                         "Tiebreaker,short_answer,How many days did Jesus fast in the wilderness?,40 days,,,,,1000,none";
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "bible_quiz_template.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerAlert('SYSTEM', 'CSV Template downloaded! Open it in Excel.', 'gain');
    });
  }

  const importCsvFile = document.getElementById('import-csv-file');
  if (importCsvFile) {
    importCsvFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const text = evt.target.result;
          const csvData = parseCSV(text);
          if (csvData.length <= 1) {
            triggerAlert('SYSTEM', 'CSV file is empty or invalid', 'lose');
            return;
          }
          
          const parsedQuestions = [];
          const headers = csvData[0].map(h => h.trim().toLowerCase());
          
          const qnNumIdx = headers.indexOf('question number');
          const typeIdx = headers.indexOf('type');
          const questionIdx = headers.indexOf('question');
          const answerIdx = headers.indexOf('answer');
          const optAIdx = headers.indexOf('option a');
          const optBIdx = headers.indexOf('option b');
          const optCIdx = headers.indexOf('option c');
          const optDIdx = headers.indexOf('option d');
          const pointsIdx = headers.indexOf('points');
          
          const powerupIdx = headers.indexOf('powerup');
          
          const subtractOnWrongIdx = headers.indexOf('subtract on wrong');
          const playVideoFeedbackIdx = headers.indexOf('play video feedback');
          const playEmojiFeedbackIdx = headers.indexOf('play emoji feedback');
          const enableTiebreakerIdx = headers.indexOf('enable tiebreaker');
          const showCategoriesIdx = headers.indexOf('show categories');
          const fontSelectedIdx = headers.indexOf('font selected');
          const team1NameIdx = headers.indexOf('team 1 name');
          const team1LogoIdx = headers.indexOf('team 1 logo');
          const team2NameIdx = headers.indexOf('team 2 name');
          const team2LogoIdx = headers.indexOf('team 2 logo');
          const cat1Idx = headers.indexOf('category 1');
          const cat2Idx = headers.indexOf('category 2');
          const cat3Idx = headers.indexOf('category 3');
          const cat4Idx = headers.indexOf('category 4');
          const cat5Idx = headers.indexOf('category 5');
          const cat6Idx = headers.indexOf('category 6');
          
          let colOffset = 0;
          if (typeIdx === -1) {
            const firstCell = csvData[1] && csvData[1][0] ? csvData[1][0].trim() : '';
            if (firstCell && (!isNaN(parseInt(firstCell, 10)) || firstCell.toLowerCase().includes('tie'))) {
              colOffset = 1;
            }
          }

          let indexCounter = 1;
          for (let r = 1; r < csvData.length; r++) {
            const row = csvData[r];
            if (row.length < 2 || !row.some(val => val.trim() !== '')) continue;
            
            const rawType = (typeIdx !== -1 ? row[typeIdx] : row[0 + colOffset]) || 'mcq';
            let type = rawType.trim().toLowerCase();
            
            const qnNumVal = (qnNumIdx !== -1 && row[qnNumIdx]) ? row[qnNumIdx].trim().toLowerCase() : '';
            const isTiebreaker = qnNumVal.includes('tiebreaker') || type.includes('tiebreaker');
            
            if (type.includes('tiebreaker')) type = 'short_answer';
            else if (type.includes('mcq') || type.includes('multiple')) type = 'mcq';
            else if (type.includes('blank') || type.includes('fill')) type = 'fill_blank';
            else type = 'short_answer';
            
            const questionText = (questionIdx !== -1 ? row[questionIdx] : row[1 + colOffset]) || '';
            const answerText = (answerIdx !== -1 ? row[answerIdx] : row[2 + colOffset]) || '';
            const pointsVal = parseInt((pointsIdx !== -1 ? row[pointsIdx] : row[7 + colOffset]) || '100', 10) || 100;
            
            const powerupRaw = (powerupIdx !== -1 ? row[powerupIdx] : (row[8 + colOffset] || 'none')) || 'none';
            let powerupVal = powerupRaw.trim().toLowerCase();
            if (powerupVal.includes('double')) powerupVal = 'double_points';
            else if (powerupVal.includes('shield') || powerupVal.includes('steal')) powerupVal = 'steal_shield';
            else if (powerupVal.includes('fifty') || powerupVal.includes('50') || powerupVal.includes('chance') || powerupVal.includes('second')) powerupVal = 'second_chance';
            else if (powerupVal.includes('time') || powerupVal.includes('extra')) powerupVal = 'extra_time';
            else if (powerupVal.includes('free') || powerupVal.includes('pass') || powerupVal.includes('safety') || powerupVal.includes('net')) powerupVal = 'safety_net';
            else powerupVal = 'none';
            
            let options = [];
            if (type === 'mcq') {
              const optA = (optAIdx !== -1 ? row[optAIdx] : row[3 + colOffset]) || '';
              const optB = (optBIdx !== -1 ? row[optBIdx] : row[4 + colOffset]) || '';
              const optC = (optCIdx !== -1 ? row[optCIdx] : row[5 + colOffset]) || '';
              const optD = (optDIdx !== -1 ? row[optDIdx] : row[6 + colOffset]) || '';
              options = [optA.trim(), optB.trim(), optC.trim(), optD.trim()].filter(o => o !== '');
            }
            
            parsedQuestions.push({
              id: isTiebreaker ? 'tiebreaker' : `q${indexCounter}`,
              qnIndex: isTiebreaker ? 'tiebreaker' : indexCounter,
              type: type,
              questionType: type,
              question: questionText.trim(),
              options: options,
              answer: answerText.trim(),
              points: pointsVal,
              powerup: powerupVal
            });
            if (!isTiebreaker) indexCounter++;
          }
          
          const hasTiebreaker = parsedQuestions.some(q => q.qnIndex === 'tiebreaker');
          if (!hasTiebreaker) {
            parsedQuestions.push({
              id: "tiebreaker",
              qnIndex: "tiebreaker",
              type: "short_answer",
              questionType: "short_answer",
              question: "What is the reward God has promised to those who overcome temptation?",
              options: [],
              answer: "Crown of Life",
              points: 1000
            });
          }
          
          db.questions = parsedQuestions;
          db.settings.totalQuestions = parsedQuestions.filter(q => q.qnIndex !== 'tiebreaker').length;
          db.settings.gridCols = getDefaultColumnsForQuestionsCount(db.settings.totalQuestions);
          db.settings.showCategories = false;
          db.settings.activePreset = '';
          
          // Extract settings from the first data row if present (Backwards Compatible)
          const firstRow = csvData[1];
          if (firstRow) {
            if (subtractOnWrongIdx !== -1 && firstRow[subtractOnWrongIdx]) {
              db.settings.subtractOnWrong = firstRow[subtractOnWrongIdx].trim().toLowerCase() === 'true';
            }
            if (playVideoFeedbackIdx !== -1 && firstRow[playVideoFeedbackIdx]) {
              db.settings.playVideoFeedback = firstRow[playVideoFeedbackIdx].trim().toLowerCase() === 'true';
            }
            if (playEmojiFeedbackIdx !== -1 && firstRow[playEmojiFeedbackIdx]) {
              db.settings.playEmojiFeedback = firstRow[playEmojiFeedbackIdx].trim().toLowerCase() === 'true';
            }
            if (enableTiebreakerIdx !== -1 && firstRow[enableTiebreakerIdx]) {
              db.settings.enableTieBreaker = firstRow[enableTiebreakerIdx].trim().toLowerCase() === 'true';
            }
            if (showCategoriesIdx !== -1 && firstRow[showCategoriesIdx]) {
              db.settings.showCategories = firstRow[showCategoriesIdx].trim().toLowerCase() === 'true';
            }
            if (fontSelectedIdx !== -1 && firstRow[fontSelectedIdx]) {
              db.settings.fontSelected = firstRow[fontSelectedIdx].trim();
            }
            
            // Extract teams
            if (db.teams && db.teams[0]) {
              if (team1NameIdx !== -1 && firstRow[team1NameIdx]) {
                db.teams[0].name = firstRow[team1NameIdx].trim();
              }
              if (team1LogoIdx !== -1 && firstRow[team1LogoIdx]) {
                db.teams[0].logo = firstRow[team1LogoIdx].trim();
              }
            }
            if (db.teams && db.teams[1]) {
              if (team2NameIdx !== -1 && firstRow[team2NameIdx]) {
                db.teams[1].name = firstRow[team2NameIdx].trim();
              }
              if (team2LogoIdx !== -1 && firstRow[team2LogoIdx]) {
                db.teams[1].logo = firstRow[team2LogoIdx].trim();
              }
            }
            
            // Extract categories
            const cats = [];
            const catIndices = [cat1Idx, cat2Idx, cat3Idx, cat4Idx, cat5Idx, cat6Idx];
            catIndices.forEach(idx => {
              if (idx !== -1 && firstRow[idx] !== undefined && firstRow[idx] !== null && firstRow[idx].trim() !== '') {
                cats.push(firstRow[idx].trim());
              }
            });
            if (cats.length > 0) {
              db.settings.categories = cats;
            }
          }
          
          fallbackSaveDB();
          hydrateControlCenter(db.settings);
          applySelectedFont();
          
          playState.phase = 'live';
          playState.gameState = 'IDLE';
          resetPlayState();
          saveGameState();
          updateGameStatusUI();
          renderAdminGrid();
          renderGameBoard();
          updateScoreUI();
          
          triggerAlert('SYSTEM', `Imported ${parsedQuestions.length - 1} questions from CSV!`, 'gain');
          
          const statusDiv = document.getElementById('dashboard-status');
          if (statusDiv) {
            statusDiv.innerHTML = `
              <div class="card-inner-layout">
                <div class="card-left-icon">
                  <div class="card-outer-circle" style="border-color: #16a34a; width: 44px; height: 44px;">
                    <div class="card-inner-circle" style="background: white;">
                      <span class="card-emoji" style="font-size: 1.2rem;">✅</span>
                    </div>
                  </div>
                </div>
                <div class="card-right-details">
                  <span class="card-qn-title" style="color: #15803d; font-size: 1.2rem !important;">CSV Imported successfully!</span>
                </div>
              </div>`;
            setTimeout(updateDashboardStatus, 3000);
          }
          
        } catch (err) {
          console.error("Error reading CSV file:", err);
          triggerAlert('SYSTEM', 'Failed to parse CSV file', 'lose');
        }
      };
      reader.readAsText(file);
      importCsvFile.value = '';
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


function showCustomConfirm(message, onConfirm, opts = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
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
  cancelBtn.style.borderRadius = '16px';
  cancelBtn.style.position = 'relative';
  cancelBtn.style.overflow = 'hidden';
  if (opts.cancelEmoji) {
    cancelBtn.style.paddingRight = '2.2rem';
    const ribbon = document.createElement('span');
    ribbon.className = 'btn-corner-ribbon';
    ribbon.textContent = opts.cancelEmoji;
    ribbon.style.position = 'absolute';
    ribbon.style.bottom = '0';
    ribbon.style.right = '0';
    ribbon.style.color = 'white';
    ribbon.style.fontFamily = 'var(--font-display)';
    ribbon.style.fontWeight = '900';
    ribbon.style.fontSize = '0.75rem';
    ribbon.style.padding = '4px 10px';
    ribbon.style.borderTopLeftRadius = '10px';
    ribbon.style.lineHeight = '1';
    ribbon.style.pointerEvents = 'none';
    ribbon.style.zIndex = '10';
    ribbon.style.boxShadow = '-2px -2px 6px rgba(0, 0, 0, 0.05)';
    ribbon.style.display = 'flex';
    ribbon.style.alignItems = 'center';
    ribbon.style.justifyContent = 'center';
    ribbon.style.background = opts.cancelRibbonBg || '#475569';
    cancelBtn.appendChild(ribbon);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = opts.confirmClass || 'btn btn-danger';
  confirmBtn.textContent = opts.confirmText || 'Yes';
  confirmBtn.style.padding = '12px 32px';
  confirmBtn.style.fontSize = '1.05rem';
  confirmBtn.style.borderRadius = '16px';
  confirmBtn.style.position = 'relative';
  confirmBtn.style.overflow = 'hidden';
  if (opts.confirmEmoji) {
    confirmBtn.style.paddingRight = '2.2rem';
    const ribbon = document.createElement('span');
    ribbon.className = 'btn-corner-ribbon';
    ribbon.textContent = opts.confirmEmoji;
    ribbon.style.position = 'absolute';
    ribbon.style.bottom = '0';
    ribbon.style.right = '0';
    confirmBtn.style.color = 'white';
    ribbon.style.fontFamily = 'var(--font-display)';
    ribbon.style.fontWeight = '900';
    ribbon.style.fontSize = '0.75rem';
    ribbon.style.padding = '4px 10px';
    ribbon.style.borderTopLeftRadius = '10px';
    ribbon.style.lineHeight = '1';
    ribbon.style.pointerEvents = 'none';
    ribbon.style.zIndex = '10';
    ribbon.style.boxShadow = '-2px -2px 6px rgba(0, 0, 0, 0.05)';
    ribbon.style.display = 'flex';
    ribbon.style.alignItems = 'center';
    ribbon.style.justifyContent = 'center';
    ribbon.style.background = opts.confirmRibbonBg || '#dc2626';
    confirmBtn.appendChild(ribbon);
  }

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

  const positiveEmojis = db.settings.positiveEmojis ? db.settings.positiveEmojis.split(',').map(e => e.trim()).filter(e => e) : '👏,🎉,🌟,🙌,🏆,🤩,👍,👌,😊,👏'.split(',');
  const negativeEmojis = db.settings.negativeEmojis ? db.settings.negativeEmojis.split(',').map(e => e.trim()).filter(e => e) : '😢,😭,🤦,📉,💔,🙈,😬'.split(',');
  
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
  parseEmojis(sticker);
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
    if (contentNode) {
      contentNode.classList.remove('feedback-wrong');
      contentNode.classList.add('feedback-correct');
    }

    updateTextAndCheckUnicode(document.getElementById('modal-correct-answer-text'), q.correctAnswer || q.answer);
    document.getElementById('modal-reveal-panel').classList.remove('hidden');
    fitModalText();

    const turnStatus = document.getElementById('modal-turn-status');
    turnStatus.textContent = "Correct Answer!";
    turnStatus.style.color = "var(--color-success)";
    turnStatus.style.borderColor = "var(--color-success)";

    playState.cancelLocked = true;
    const btnCancel = document.getElementById('btn-modal-cancel');
    if (btnCancel) btnCancel.disabled = true;

    saveGameState();
    if (cId !== 'c-tiebreaker' && playState.teamsAttemptedCount === 0) {
      switchTurn();
    }
    renderGameBoard();
    renderAdminGrid();
    enableNextButton();
    parseEmojis(document.getElementById('modal-overlay'));
  };

  if (isCorrect) {
    transitionState('RESOLVED');
    disableQuestionInputs();

    if (customCorrectVideoSrc) {
      playCorrectAnswerVideo(customCorrectVideoSrc, finalizeCorrect);
    } else if (db.settings.playVideoFeedback) {
      playCorrectAnswerVideo(finalizeCorrect);
    } else {
      playSound('correct');
      showEmojiFeedback(true, q, finalizeCorrect);
    }

  } else {
    // Intercept with Second Chance if active and not yet used, and it's the original team's attempt (teamsAttemptedCount === 0)
    if (cId !== 'c-tiebreaker' && playState.powerupUsed.secondChanceActive && !playState.powerupUsed.secondChanceUsed && playState.teamsAttemptedCount === 0) {
      playState.powerupUsed.secondChanceUsed = true;
      
      playTone(523.25, 'sine', 0.12, 0.25, 0); // C5
      playTone(659.25, 'sine', 0.15, 0.2, 0.12); // E5
      
      triggerAlert("SECOND CHANCE", "Second Chance activated! Try again.", "gain");
      
      // Reset inputs so the team can attempt again
      if ((q.questionType || q.type) === 'mcq') {
        const selBtn = document.querySelector('.option-btn.selected');
        document.querySelectorAll('.option-btn').forEach(btn => {
          if (selBtn && btn === selBtn) {
            btn.disabled = true;
            btn.style.opacity = '0.3';
            btn.style.cursor = 'not-allowed';
            btn.classList.add('disabled-second-chance');
          } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.classList.remove('disabled-second-chance');
          }
          btn.classList.remove('selected');
        });
      } else {
        const fillInput = document.getElementById('modal-fill-input');
        if (fillInput) {
          fillInput.disabled = false;
          fillInput.style.cursor = '';
          fillInput.style.borderColor = '';
          fillInput.value = '';
          fillInput.focus();
        }
      }
      
      const turnStatus = document.getElementById('modal-turn-status');
      turnStatus.textContent = "Second Chance! Try Again";
      turnStatus.style.color = "var(--color-gold)";
      turnStatus.style.borderColor = "var(--color-gold)";
      
      enableModalActionButtons();
      saveGameState();
      return;
    }

    if (playState.stats[teamIndex]) playState.stats[teamIndex].attempts++;

    if (cId === 'c-tiebreaker') {
      const isExhausted = playState.teamsAttemptedCount + 1 >= playState.teams.length;

      const finalizeWrongTiebreaker = () => {
        // No points deducted for wrong tie-breaker
        playState.teamsAttemptedCount++;

        if (!isExhausted) {
          switchTurn();
          
          const nextTeam = playState.teams[playState.currentTeamIndex];
          const turnStatus = document.getElementById('modal-turn-status');
          turnStatus.textContent = `${nextTeam.name.toUpperCase()} TURN (PASS)`;
          turnStatus.style.color = 'var(--color-gold)';
          turnStatus.style.borderColor = 'rgba(244,196,48,0.3)';

          // Reset question options/inputs for the second team
          if ((q.questionType || q.type) === 'mcq') {
            document.querySelectorAll('.option-btn').forEach(btn => {
              btn.classList.remove('selected');
              btn.disabled = false;
            });
          } else {
            const fillInput = document.getElementById('modal-fill-input');
            if (fillInput) {
              fillInput.value = '';
              fillInput.disabled = false;
              fillInput.focus();
            }
          }
          enableModalActionButtons();
          saveGameState();
          renderGameBoard();
          renderAdminGrid();
        } else {
          // Exhausted - both teams got it wrong
          transitionState('RESOLVED');
          disableQuestionInputs();

          playState.answeredCells[cId] = { teamIndex: -1, pointsWon: 0, cancelled: false };

          const turnStatus = document.getElementById('modal-turn-status');
          turnStatus.textContent = "Incorrect Answer";
          turnStatus.style.color = "var(--color-error)";
          turnStatus.style.borderColor = "var(--color-error)";

          const contentNode = document.querySelector('.modal-content');
          if (contentNode) {
            contentNode.classList.remove('feedback-correct');
            contentNode.classList.add('feedback-wrong');
          }

          document.getElementById('modal-correct-answer-text').textContent = q.correctAnswer || q.answer;
          document.getElementById('modal-reveal-panel').classList.remove('hidden');
          fitModalText();

          playState.cancelLocked = true;
          const btnCancel = document.getElementById('btn-modal-cancel');
          if (btnCancel) btnCancel.disabled = true;

          saveGameState();
          renderGameBoard();
          renderAdminGrid();
          enableNextButton();
          parseEmojis(document.getElementById('modal-overlay'));
        }
      };

      if (customWrongVideoSrc) {
        playWrongAnswerVideo(customWrongVideoSrc, finalizeWrongTiebreaker);
      } else if (db.settings.playVideoFeedback) {
        playWrongAnswerVideo(finalizeWrongTiebreaker);
      } else {
        playSound('wrong');
        showEmojiFeedback(false, q, finalizeWrongTiebreaker);
      }

    } else {
      // Normal question wrong answer logic
      let penalty = ptsToAward;
      if (playState.teamsAttemptedCount === 0) {
        if (playState.powerupUsed.safetyNetActive) {
          penalty = 0;
        } else {
          penalty = Math.floor(ptsToAward * 0.5);
        }
      }

      const isExhausted = playState.practiceMode || (playState.teamsAttemptedCount + 1 >= playState.teams.length) || playState.powerupUsed.stealShieldActive;

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
          if (playState.powerupUsed.stealShieldActive && !playState.practiceMode) {
            turnStatus.innerHTML = `❌ Incorrect Answer<br><span style="font-size:0.8rem; color:var(--color-gold);">🛡️ Steal Shield Active! Steal Blocked.</span>`;
            parseEmojis(turnStatus);
          } else {
            turnStatus.textContent = "Incorrect Answer";
          }
          turnStatus.style.color = "var(--color-error)";
          turnStatus.style.borderColor = "var(--color-error)";

          const contentNode = document.querySelector('.modal-content');
          if (contentNode) {
            contentNode.classList.remove('feedback-correct');
            contentNode.classList.add('feedback-wrong');
          }

          document.getElementById('modal-correct-answer-text').textContent = q.correctAnswer || q.answer;
          document.getElementById('modal-reveal-panel').classList.remove('hidden');
          fitModalText();

          playState.cancelLocked = true;
          const btnCancel = document.getElementById('btn-modal-cancel');
          if (btnCancel) btnCancel.disabled = true;

          saveGameState();
          renderGameBoard();
          renderAdminGrid();
          enableNextButton();
          parseEmojis(document.getElementById('modal-overlay'));
        }
      };

      if (customWrongVideoSrc) {
        playWrongAnswerVideo(customWrongVideoSrc, finalizeWrong);
      } else if (db.settings.playVideoFeedback) {
        playWrongAnswerVideo(finalizeWrong);
      } else {
        playSound('wrong');
        showEmojiFeedback(false, q, finalizeWrong);
      }
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
  parseEmojis(turnStatus);
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
  parseEmojis(turnStatus);
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
  if (playState.answeredCells['c-tiebreaker']) {
    endGame();
    return;
  }

  const maxConfiguredIndex = db.questions.reduce((max, q) => {
    const idx = parseInt(q.qnIndex, 10);
    return (!isNaN(idx) && idx > max) ? idx : max;
  }, 0);
  const total = Math.max(1, maxConfiguredIndex);
  const validQuestions = db.questions.filter(x => x.qnIndex !== 'tiebreaker' && !isNaN(parseInt(x.qnIndex, 10)) && parseInt(x.qnIndex, 10) <= total);
  
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
    if ((!playState.teams || !Array.isArray(playState.teams) || playState.teams.length < 2) && !playState.practiceMode) {
    setupTeamsFromInputs();
  }
  const sorted = playState.teams
    .map((t, idx) => ({ ...t, index: idx }))
    .sort((a, b) => b.score - a.score);

  const winner = sorted[0];
  const tie = sorted.length > 1 && sorted[0].score === sorted[1].score;



  const winnerCard = document.querySelector('.winner-card');
  winnerCard.classList.remove('winner-card-tie', 'winner-card-win');
  winnerCard.classList.add(tie ? 'winner-card-tie' : 'winner-card-win');

  if (tie) {
    document.getElementById('winner-badge').textContent = "IT'S A TIE! 🤝";
    updateTextAndCheckUnicode(document.getElementById('winner-team-name'), 'Perfectly Matched!');
    updateTextAndCheckUnicode(document.getElementById('winner-subtitle'), 'Both teams got an equal score! Good job!');
  } else {
    document.getElementById('winner-badge').textContent = 'CHAMPION! 🏆';
    updateTextAndCheckUnicode(document.getElementById('winner-team-name'), `${winner.name.toUpperCase()} WINS!`);
    updateTextAndCheckUnicode(document.getElementById('winner-subtitle'), `Congratulations to ${winner.name} on their incredible victory!`);
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
        row.className = `standing-row team-index-${team.index} ${rank === 0 ? 'first-place' : ''}`;
        const fontOverride = isUnicodeOtherLanguage(team.name) ? 'style="font-family: \'Noto Sans\', \'Noto Sans Malayalam\', \'Noto Sans Devanagari\', sans-serif !important;"' : '';
        row.innerHTML = `
          <span class="standing-place">${medal}</span>
          <span class="standing-team-name" ${fontOverride}>${team.name}</span>
          <span class="standing-points">${team.score} pts</span>
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
      adjustWinnerCardFontSizeToFit();
    });
  } else {
    playSound('correct');
    playState.phase = 'ended';
    saveGameState();
    updateDashboardStatus();
    showScreen('winner');
    adjustWinnerCardFontSizeToFit();
  }
  const winnerScreen = document.getElementById('screen-winner');
  if (winnerScreen) {
    parseEmojis(winnerScreen);
  }
}

// ============================================================
// TEAMS SETUP
// ============================================================
function setupTeamsFromInputs() {
  let sourceTeams = (db.teams && Array.isArray(db.teams) && db.teams.length >= 2) ? db.teams : DEFAULT_TEAMS;
  playState.teams = sourceTeams.slice(0, 2).map((t, idx) => {
    const isDef = !!t.useDefault;
    const defaultName = idx === 0 ? 'Boy' : 'Girl';
    const defaultLogo = idx === 0 ? 'boy.png' : 'girl.png';
    return {
      name: isDef ? defaultName : (t.name || defaultName),
      logo: isDef ? defaultLogo : (t.logo || defaultLogo),
      avatarType: isDef ? 'default' : (t.avatarType || 'default'),
      avatarVal: isDef ? '' : (t.avatarVal || ''),
      score: 0
    };
  });

  if (!playState.teams || !Array.isArray(playState.teams) || playState.teams.length < 2) {
    playState.teams = DEFAULT_TEAMS.map((t, idx) => ({
      name: t.name,
      logo: t.logo,
      score: 0,
      passesUsed: 0
    }));
  }

  playState.stats = {};
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
}

function assignRandomPowerups() {
  playState.powerups = {};
  playState.powerupUsed = {
    secondChanceActive: false,
    secondChanceUsed: false,
    safetyNetActive: false,
    stealShieldActive: false,
    doublePointsActive: false,
    extraTimeActive: false,
    revealedCells: {}
  };
  
  if (db.settings.powerupMode === 'none') {
    console.log("Power-ups are disabled (none).");
    return;
  }
  
  const hasCustomPowerups = db.questions.some(q => q.powerup && q.powerup !== 'none');
  const activeMode = (db.settings.powerupMode === 'manual' || hasCustomPowerups) ? 'manual' : 'random';
  
  if (activeMode === 'manual') {
    db.questions.forEach(q => {
      if (q.powerup && q.powerup !== 'none') {
        const qnId = cellId(q.qnIndex);
        playState.powerups[qnId] = q.powerup;
      }
    });
    console.log("Manual Power-ups assigned from questions:", playState.powerups);
  } else {
    // Choose random question cells from the available ones
    const totalQns = db.settings.totalQuestions || 12;
    const questionIndices = [];
    for (let i = 1; i <= totalQns; i++) {
      questionIndices.push(i);
    }
    
    // Shuffle array
    for (let i = questionIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIndices[i], questionIndices[j]] = [questionIndices[j], questionIndices[i]];
    }
    
    // Choose from active power-ups and shuffle them
    const powerupTypes = ['double_points', 'steal_shield', 'second_chance', 'safety_net'];
    for (let i = powerupTypes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [powerupTypes[i], powerupTypes[j]] = [powerupTypes[j], powerupTypes[i]];
    }

    // Take configured random count and assign different powerups
    const maxRandom = typeof db.settings.randomPowerupsCount === 'number' ? db.settings.randomPowerupsCount : 3;
    const numToAssign = Math.min(maxRandom, questionIndices.length);
    for (let k = 0; k < numToAssign; k++) {
      const qnId = `qn${questionIndices[k]}`;
      playState.powerups[qnId] = powerupTypes[k % powerupTypes.length];
    }
    console.log("Random Power-ups assigned:", playState.powerups);
  }
}

function resetPlayState() {
  playState.teams.forEach(t => { t.score = 0; });
  playState.currentTeamIndex = 0;
  playState.currentQuestionValue = 0;
  playState.teamsAttemptedCount = 0;
  playState.answeredCells = {};
  playState.currentCellId = null;
  playState.currentQuestion = null;
  playState.gameState = 'IDLE';
  playState.phase = 'live';
  playState.teams.forEach((t, i) => {
    playState.stats[i] = { correct: 0, attempts: 0 };
  });
  assignRandomPowerups();
}

function renderAvatarPickers() {
  const emojis = ['👦', '👧', '🦁', '🐑', '🕊️', '🐟', '🦅', '👑', '🔥', '💎'];
  [0, 1].forEach(teamIdx => {
    const pickerId = `team${teamIdx + 1}-avatar-picker`;
    const container = document.getElementById(pickerId);
    if (!container) return;
    container.innerHTML = '';
    
    const team = db.teams[teamIdx];
    const currentAvatarVal = (team && team.avatarType === 'emoji') ? team.avatarVal : '';
    
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avatar-emoji-btn ${currentAvatarVal === emoji ? 'selected' : ''}`;
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        playSound('click');
        
        // Clear default switch if it is checked
        const defaultCheckboxId = `admin-team${teamIdx + 1}-default`;
        const checkbox = document.getElementById(defaultCheckboxId);
        if (checkbox && checkbox.checked) {
          checkbox.checked = false;
          db.teams[teamIdx].useDefault = false;
          
          const nameInputId = `admin-team${teamIdx + 1}-name`;
          const logoInputId = `admin-team${teamIdx + 1}-logo`;
          const nameInput = document.getElementById(nameInputId);
          const logoInput = document.getElementById(logoInputId);
          if (nameInput) nameInput.disabled = false;
          if (logoInput) logoInput.disabled = false;
        }
        
        db.teams[teamIdx].avatarType = 'emoji';
        db.teams[teamIdx].avatarVal = emoji;
        saveDB();
        renderAvatarPickers();
        
        if (playState.teams[teamIdx]) {
          playState.teams[teamIdx].avatarType = 'emoji';
          playState.teams[teamIdx].avatarVal = emoji;
          saveGameState();
          updateScoreUI();
        } else {
          updateScoreUI();
        }
      });
      container.appendChild(btn);
    });
    parseEmojis(container);
  });
}

function loadBibleStoryTemplate(storyKey) {
  const template = BIBLE_TEMPLATES[storyKey];
  if (!template) return;
  
  db.questions = JSON.parse(JSON.stringify(template.questions)).map(q => {
    if (q.type === 'long' || q.type === 'long_answer') q.type = 'short_answer';
    if (q.questionType === 'long' || q.questionType === 'long_answer') q.questionType = 'short_answer';
    if (q.qnIndex === 'tiebreaker') {
      if (q.type === 'tiebreaker') q.type = 'short_answer';
      if (q.questionType === 'tiebreaker') q.questionType = 'short_answer';
    }
    return q;
  });
  
  db.settings.totalQuestions = db.questions.filter(q => q.qnIndex !== 'tiebreaker').length;
  db.settings.gridCols = getDefaultColumnsForQuestionsCount(db.settings.totalQuestions);
  db.settings.showCategories = false;
  db.settings.activePreset = storyKey;
  
  fallbackSaveDB();
  hydrateControlCenter(db.settings);
  applySelectedFont();
  
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  resetPlayState();
  saveGameState();
  updateGameStatusUI();
  renderAdminGrid();
  renderGameBoard();
  updateScoreUI();
  
  triggerAlert('SYSTEM', `${template.name} preset loaded!`, 'gain');
  
  const statusDiv = document.getElementById('dashboard-status');
  if (statusDiv) {
    statusDiv.innerHTML = `
      <div class="card-inner-layout">
        <div class="card-left-icon">
          <div class="card-outer-circle" style="border-color: #16a34a; width: 44px; height: 44px;">
            <div class="card-inner-circle" style="background: white;">
              <span class="card-emoji" style="font-size: 1.2rem;">✅</span>
            </div>
          </div>
        </div>
        <div class="card-right-details">
          <span class="card-qn-title" style="color: #15803d; font-size: 1.2rem !important;">${template.name} Loaded!</span>
        </div>
      </div>`;
    setTimeout(updateDashboardStatus, 3000);
  }
}



function parseCSV(text) {
  const lines = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(field);
        lines.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }
  if (field || row.length > 0) {
    row.push(field);
  }
  if (row.length > 0) {
    lines.push(row);
  }
  return lines;
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
  const soundIcon = document.getElementById('sound-icon');
  soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
  parseEmojis(soundIcon);
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
      const p = docEl.requestFullscreen();
      if (p && p.catch) p.catch(err => console.warn(err));
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(err => console.warn(err));
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

let currentZoomLevel = parseFloat(localStorage.getItem('quiz_zoom_level') || '0');

function updateZoomDisplay() {
  const display = document.getElementById('zoom-level-display');
  if (!display) return;
  
  const mappings = {
    '3': '200%',
    '2.5': '175%',
    '2': '150%',
    '1.5': '133%',
    '1': '120%',
    '0.5': '110%',
    '0': '100%',
    '-0.5': '90%',
    '-1': '80%',
    '-1.5': '67%',
    '-2': '50%',
    '-2.5': '33%',
    '-3': '25%'
  };
  
  const key = currentZoomLevel.toString();
  display.textContent = mappings[key] || `${Math.round(Math.pow(1.2, currentZoomLevel) * 100)}%`;
}

// Apply initial zoom level
updateZoomDisplay();
if (window.electronAPI) {
  window.electronAPI.setZoomLevel(currentZoomLevel);
}

document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
  playSound('click');
  if (currentZoomLevel < 3) {
    currentZoomLevel += 0.5;
    localStorage.setItem('quiz_zoom_level', currentZoomLevel);
    updateZoomDisplay();
    if (window.electronAPI) {
      window.electronAPI.setZoomLevel(currentZoomLevel);
    } else {
      applyDynamicScaling();
    }
  }
});

document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
  playSound('click');
  if (currentZoomLevel > -3) {
    currentZoomLevel -= 0.5;
    localStorage.setItem('quiz_zoom_level', currentZoomLevel);
    updateZoomDisplay();
    if (window.electronAPI) {
      window.electronAPI.setZoomLevel(currentZoomLevel);
    } else {
      applyDynamicScaling();
    }
  }
});

const updateFullscreenIcon = () => {
  const icon = document.getElementById('fullscreen-icon');
  if (icon) {
    const isFS = getFullscreenState();
    if (isFS) {
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"/></svg>`;
    } else {
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    }
  }
  applyDynamicScaling();
  setTimeout(applyDynamicScaling, 50);
  setTimeout(applyDynamicScaling, 150);
  setTimeout(applyDynamicScaling, 300);
  setTimeout(applyDynamicScaling, 600);
  setTimeout(applyDynamicScaling, 1000);
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
  if (document.body.classList.contains('admin-mode')) {
    document.body.classList.remove('sidebar-closed');
  }

  // Slide open the sidebar Control Center from the left side
  document.getElementById('left-sliding-sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('show');
});

// Close Sidebar listeners
document.getElementById('btn-close-sidebar')?.addEventListener('click', () => {
  playSound('click');
  if (document.body.classList.contains('admin-mode')) {
    document.body.classList.add('sidebar-closed');
  }
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
});

document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
  playSound('click');
  if (document.body.classList.contains('admin-mode')) {
    document.body.classList.add('sidebar-closed');
  }
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
});

// ============================================================
// EVENT LISTENERS — Dashboard
// ============================================================
document.getElementById('btn-start-game').addEventListener('click', () => {
  playSound('open');
  if (playState.teams && playState.teams.length > 0 && playState.phase !== 'ended' && localStorage.getItem('review_game_playstate') !== null && !playState.practiceMode) {
    // Resume existing game
        showScreen('game');
  } else {
    // Start fresh game
    playState.practiceMode = false;
    setupTeamsFromInputs();
    resetPlayState();
    playState.practiceMode = false;
    playState.phase = 'live';
    playState.gameState = 'IDLE';
            saveGameState();
    updateGameStatusUI();
    renderGameBoard();
    updateTurnUI();
    updateScoreUI();
    showScreen('game');
  }
});

document.getElementById('btn-start-practice').addEventListener('click', () => {
  playSound('open');
  playState.practiceMode = true;
  playState.teams = [{ name: 'Practice Mode', logo: 'logo.png', avatarType: 'emoji', avatarVal: '🎓', score: 0 }];
  resetPlayState();
  playState.practiceMode = true;
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  
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
  document.getElementById('left-sliding-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('show');
  updateDashboardStatus();
  showScreen('dashboard');
});

const btnAdminResume = document.getElementById('btn-admin-resume');
if (btnAdminResume) {
  btnAdminResume.addEventListener('click', () => {
    playSound('open');
    if (playState.teams && playState.teams.length > 0 && playState.phase !== 'ended' && localStorage.getItem('review_game_playstate') !== null) {
            showScreen('game');
    } else {
      setupTeamsFromInputs();
      resetPlayState();
      playState.phase = 'live';
      playState.gameState = 'IDLE';
                  saveGameState();
      updateGameStatusUI();
      renderGameBoard();
      updateTurnUI();
      updateScoreUI();
      showScreen('game');
    }
  });
}



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
      db.teams[teamIdx].avatarType = 'default';
      db.teams[teamIdx].avatarVal = '';
    } else {
      const currentVal = nameInput ? nameInput.value.trim() : '';
      db.teams[teamIdx].name = currentVal || defaultName;
    }

    saveDB();
    renderAvatarPickers();

    if (playState.teams[teamIdx]) {
      playState.teams[teamIdx].name = db.teams[teamIdx].name;
      playState.teams[teamIdx].logo = db.teams[teamIdx].logo;
      playState.teams[teamIdx].avatarType = db.teams[teamIdx].avatarType;
      playState.teams[teamIdx].avatarVal = db.teams[teamIdx].avatarVal;
      saveGameState();
      updateScoreUI();
      updateTurnUI();
    }
  });
};

setupDefaultTeamToggle(0, 'admin-team1-default', 'admin-team1-name', 'admin-team1-logo', 'Boy', 'boy.png');
setupDefaultTeamToggle(1, 'admin-team2-default', 'admin-team2-name', 'admin-team2-logo', 'Girl', 'girl.png');

async function saveDatabaseToFileHandle(handle, data) {
  const writable = await handle.createWritable();
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  await writable.write(content);
  await writable.close();
  triggerAlert("System", "Database saved directly to file!", "gain");
  updateDashboardStatus();
}

function showExportFormatSelector(onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  overlay.style.background = currentTheme === 'light' ? 'rgba(238, 243, 255, 0.7)' : 'rgba(0, 0, 0, 0.75)';
  overlay.style.backdropFilter = 'blur(12px)';
  overlay.style.zIndex = '10000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.25s ease';
  
  const content = document.createElement('div');
  content.className = 'confirm-card glass-panel';
  content.style.width = '90%';
  content.style.maxWidth = '480px';
  content.style.padding = '32px';
  content.style.borderRadius = 'var(--radius-sm)';
  content.style.textAlign = 'center';
  content.style.border = '2px solid var(--panel-border-active)';
  content.style.boxShadow = 'var(--card-shadow)';
  content.style.background = 'var(--panel-bg)';
  content.style.color = 'var(--color-text-light)';
  content.style.transform = 'scale(0.8)';
  content.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
  
  const icon = document.createElement('div');
  icon.textContent = '💾';
  icon.style.fontSize = '3.5rem';
  icon.style.marginBottom = '16px';
  
  const title = document.createElement('h3');
  title.textContent = 'Export Quiz Database';
  title.style.fontSize = '1.35rem';
  title.style.fontWeight = '700';
  title.style.color = 'var(--color-text-light)';
  title.style.marginBottom = '12px';
  title.style.fontFamily = 'var(--font-display)';
  title.style.letterSpacing = '1px';
  
  const desc = document.createElement('p');
  desc.textContent = 'Choose your preferred file format for saving the entire quiz database, including all questions, answers, teams, and game settings:';
  desc.style.fontSize = '0.95rem';
  desc.style.color = 'var(--color-text-muted)';
  desc.style.marginBottom = '28px';
  desc.style.lineHeight = '1.4';
  
  const actionsRow = document.createElement('div');
  actionsRow.style.display = 'flex';
  actionsRow.style.gap = '14px';
  actionsRow.style.justifyContent = 'center';
  actionsRow.style.width = '100%';
  
  const closeSelector = () => {
    overlay.style.opacity = '0';
    content.style.transform = 'scale(0.8)';
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 250);
  };

  const createRibbonButton = (text, btnClass, emoji, ribbonBg, onClick) => {
    const btn = document.createElement('button');
    btn.className = btnClass;
    btn.textContent = text;
    btn.style.padding = '12px 28px';
    btn.style.fontSize = '1.05rem';
    btn.style.borderRadius = '16px';
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.style.flex = '1';
    
    if (emoji) {
      btn.style.paddingRight = '2.2rem';
      const ribbon = document.createElement('span');
      ribbon.className = 'btn-corner-ribbon';
      ribbon.textContent = emoji;
      ribbon.style.position = 'absolute';
      ribbon.style.bottom = '0';
      ribbon.style.right = '0';
      ribbon.style.color = 'white';
      ribbon.style.fontFamily = 'var(--font-display)';
      ribbon.style.fontWeight = '900';
      ribbon.style.fontSize = '0.75rem';
      ribbon.style.padding = '4px 10px';
      ribbon.style.borderTopLeftRadius = '10px';
      ribbon.style.lineHeight = '1';
      ribbon.style.pointerEvents = 'none';
      ribbon.style.zIndex = '10';
      ribbon.style.boxShadow = '-2px -2px 6px rgba(0, 0, 0, 0.05)';
      ribbon.style.display = 'flex';
      ribbon.style.alignItems = 'center';
      ribbon.style.justifyContent = 'center';
      ribbon.style.background = ribbonBg || '#475569';
      btn.appendChild(ribbon);
    }
    
    btn.onclick = onClick;
    return btn;
  };
  
  const btnJson = createRibbonButton('Export JSON', 'btn btn-secondary', '💾', '#475569', () => {
    playSound('click');
    closeSelector();
    onSelect('json');
  });
  
  const btnCsv = createRibbonButton('Export CSV', 'btn btn-secondary', '📊', '#475569', () => {
    playSound('click');
    closeSelector();
    onSelect('csv');
  });
  
  actionsRow.appendChild(btnJson);
  actionsRow.appendChild(btnCsv);

  const cancelRow = document.createElement('div');
  cancelRow.style.display = 'flex';
  cancelRow.style.justifyContent = 'center';
  cancelRow.style.width = '100%';
  cancelRow.style.marginTop = '16px';

  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-secondary';
  btnCancel.textContent = 'Cancel';
  btnCancel.style.padding = '8px 28px';
  btnCancel.style.fontSize = '0.95rem';
  btnCancel.style.borderRadius = '12px';
  btnCancel.style.borderColor = 'rgba(255,255,255,0.12)';
  btnCancel.onclick = () => {
    playSound('click');
    closeSelector();
  };
  cancelRow.appendChild(btnCancel);
  
  content.appendChild(icon);
  content.appendChild(title);
  content.appendChild(desc);
  content.appendChild(actionsRow);
  content.appendChild(cancelRow);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      content.style.transform = 'scale(1)';
    });
  });
}

function generateCSVContent() {
  const headers = [
    "Question Number", "Type", "Question", "Answer", 
    "Option A", "Option B", "Option C", "Option D", 
    "Points", "Powerup", "Subtract On Wrong", "Play Video Feedback", 
    "Play Emoji Feedback", "Enable Tiebreaker", "Show Categories", 
    "Font Selected", "Team 1 Name", "Team 1 Logo", 
    "Team 2 Name", "Team 2 Logo", 
    "Category 1", "Category 2", "Category 3", "Category 4", "Category 5", "Category 6"
  ];
  
  const rows = [headers.join(',')];
  
  const escapeCSV = val => {
    if (val === undefined || val === null) return '';
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  
  db.questions.forEach(q => {
    const isTiebreaker = q.qnIndex === 'tiebreaker';
    const optA = q.options && q.options[0] ? q.options[0] : '';
    const optB = q.options && q.options[1] ? q.options[1] : '';
    const optC = q.options && q.options[2] ? q.options[2] : '';
    const optD = q.options && q.options[3] ? q.options[3] : '';
    
    const row = [
      isTiebreaker ? 'Tiebreaker' : q.qnIndex,
      q.type || q.questionType,
      q.question,
      q.answer,
      optA,
      optB,
      optC,
      optD,
      q.points,
      q.powerup || 'none',
      db.settings.subtractOnWrong ? 'true' : 'false',
      db.settings.playVideoFeedback ? 'true' : 'false',
      db.settings.playEmojiFeedback ? 'true' : 'false',
      db.settings.enableTieBreaker ? 'true' : 'false',
      db.settings.showCategories ? 'true' : 'false',
      db.settings.fontSelected || 'Outfit',
      db.teams && db.teams[0] ? db.teams[0].name : '',
      db.teams && db.teams[0] ? db.teams[0].logo || '' : '',
      db.teams && db.teams[1] ? db.teams[1].name : '',
      db.teams && db.teams[1] ? db.teams[1].logo || '' : '',
      db.settings.categories[0] || '',
      db.settings.categories[1] || '',
      db.settings.categories[2] || '',
      db.settings.categories[3] || '',
      db.settings.categories[4] || '',
      db.settings.categories[5] || ''
    ];
    
    rows.push(row.map(escapeCSV).join(','));
  });
  
  return rows.join('\n');
}

// Export DB
document.getElementById('btn-export-json').addEventListener('click', () => {
  playSound('click');
  showExportFormatSelector(async (format) => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      if (format === 'json') {
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: `review_game_${ts}.json`,
              types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
            });
            await saveDatabaseToFileHandle(handle, db);
            window.customDatabaseFileHandle = handle;
          } catch (err) {
            if (err.name !== 'AbortError') throw err;
          }
        } else {
          throw new Error("File System Access API not supported");
        }
      } else if (format === 'csv') {
        const csvContent = generateCSVContent();
        if (window.showSaveFilePicker) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: `review_game_${ts}.csv`,
              types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
            });
            await saveDatabaseToFileHandle(handle, csvContent);
          } catch (err) {
            if (err.name !== 'AbortError') throw err;
          }
        } else {
          throw new Error("File System Access API not supported");
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn("Fallback to download API", err);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        if (format === 'json') {
          a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
          a.download = `review_game_${ts}.json`;
        } else {
          const csvContent = generateCSVContent();
          a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
          a.download = `review_game_${ts}.csv`;
        }
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  });
});


// Import JSON
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
        loadSavedDB(parsed);
        saveDB();
        triggerAlert("SYSTEM", "Quiz Database imported successfully!", "gain");
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Invalid JSON file.', err);
        triggerAlert("SYSTEM", "Error importing quiz JSON file.", "lose");
      }
    }
  }
});

document.getElementById('import-json-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed && typeof parsed === 'object') {
        loadSavedDB(parsed);
        saveDB();
        triggerAlert("SYSTEM", "Quiz Database imported successfully!", "gain");
      }
    } catch (err) {
      console.error('Invalid JSON file.', err);
      triggerAlert("SYSTEM", "Error importing quiz JSON file.", "lose");
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});


// Reset game (not questions)
document.getElementById('btn-reset-game').addEventListener('click', () => {
  playSound('click');
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  playState.teams = []; // Clear active game teams to prevent resume until clicked Start
  resetPlayState();
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

  

  const powerup = document.getElementById('q-powerup') ? document.getElementById('q-powerup').value : 'none';

  const existIdx = db.questions.findIndex(q => q.qnIndex === qnIndex);
  const qObj = {
    id: existIdx !== -1 ? db.questions[existIdx].id : Date.now(),
    qnIndex,
    type,
    question: text,
    options,
    answer,
    points: pts,
    powerup,
    customCorrectEmoji: document.getElementById('q-emoji-correct') ? document.getElementById('q-emoji-correct').value.trim() : '',
    customWrongEmoji: document.getElementById('q-emoji-wrong') ? document.getElementById('q-emoji-wrong').value.trim() : ''
  };

  if (existIdx !== -1) db.questions[existIdx] = qObj;
  else db.questions.push(qObj);

  // If the admin saved a custom power-up, automatically switch the mode to manual
  if (powerup && powerup !== 'none') {
    db.settings.powerupMode = 'manual';
  }

  // Update playState.powerups if in manual mode
  if (db.settings.powerupMode === 'manual') {
    const qnId = cellId(qnIndex);
    if (powerup && powerup !== 'none') {
      playState.powerups[qnId] = powerup;
    } else {
      delete playState.powerups[qnId];
    }
    saveGameState();
  }

  // Auto-adjust total questions if a higher index is saved
  const qNum = parseInt(qnIndex, 10);
  if (!isNaN(qNum) && qNum > db.settings.totalQuestions) {
    db.settings.totalQuestions = qNum;
    const totInput = document.getElementById('settings-total-questions');
    if (totInput) totInput.value = qNum;
  }

  db.settings.activePreset = '';
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

  // Clean up playState.powerups if in manual mode
  if (db.settings.powerupMode === 'manual') {
    const qnId = cellId(qnIndex);
    delete playState.powerups[qnId];
    saveGameState();
  }

  await deleteVideoFromIndexedDB(qnIndex);
  await deleteVideoFromIndexedDB('q-' + qnIndex + '-correct');
  await deleteVideoFromIndexedDB('q-' + qnIndex + '-wrong');

  db.settings.activePreset = '';
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
          confirmEmoji: '🏆',
          confirmRibbonBg: '#d97706',
          cancelText: 'End Game Now',
          cancelClass: 'btn btn-danger',
          cancelEmoji: '🏁',
          cancelRibbonBg: '#991b1b',
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
          confirmEmoji: '🏁',
          confirmRibbonBg: '#991b1b',
          cancelText: 'Cancel',
          cancelEmoji: '❌',
          cancelRibbonBg: '#475569',
          subtext: 'You enabled the Tie Breaker feature, but the TIE BREAKER cell in the Admin Grid is empty. Please configure it first.',
          icon: '⚠️'
        }
      );
    }
  } else {
    showCustomConfirm(
      'Want to confirm ending the game?',
      () => {
        closeModal();
        playState.phase = 'ended';
        saveGameState();
        updateGameStatusUI();
        endGame();
      },
      {
        confirmText: 'Yes',
        confirmEmoji: '🏁',
        confirmRibbonBg: '#991b1b',
        cancelText: 'No',
        cancelEmoji: '❌',
        cancelRibbonBg: '#475569'
      }
    );
  }
});

document.getElementById('btn-resign-game').addEventListener('click', () => {
  if (!canInteract()) return;

  showCustomConfirm(
    'Want to confirm resigning the game?',
    () => {
      closeModal();
      playSound('cancel');
      resetPlayState();
      playState.teams = []; // Clear active game teams
      playState.phase = 'live';
      playState.gameState = 'IDLE';
            localStorage.removeItem('review_game_playstate');

      updateGameStatusUI();
      renderGameBoard();
      updateTurnUI();
      updateScoreUI();
      showScreen('dashboard');
    },
    {
      confirmText: 'Yes',
      confirmEmoji: '🏳️',
      confirmRibbonBg: '#475569',
      cancelText: 'No',
      cancelEmoji: '❌',
      cancelRibbonBg: '#475569'
    }
  );
});

// ============================================================
// EVENT LISTENERS — Winner Screen
// ============================================================
document.getElementById('btn-play-again').addEventListener('click', () => {
  if (!canInteract()) return;
  playSound('open');
  resetPlayState();
  playState.phase = 'live';
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
  applyTheme('light');
}

async function initApp() {
  await loadDB();

  // Clear any existing active gameplay state on load/reload to always start fresh on the dashboard
  localStorage.removeItem('review_game_playstate');

  // Explicitly reset playState variables to default values
  playState.phase = 'live';
  playState.gameState = 'IDLE';
  playState.teams = [];
  playState.currentTeamIndex = 0;
  playState.currentQuestionValue = 0;
  playState.teamsAttemptedCount = 0;
  playState.answeredCells = {};
  playState.currentCellId = null;
  playState.currentQuestion = null;
  playState.stats = {};

  renderAdminGrid();
  renderGameBoard();
  updateScoreUI();
  updateDashboardStatus();
  renderAvatarPickers();

  // Always start on the dashboard screen upon loading or reloading the application
  showScreen('dashboard');

  parseEmojis(document.body);
}

// Wait for DOM to be fully ready before calling initApp so every
// getElementById call inside it (dashboard-status, btn-start-game, etc.)
// is guaranteed to succeed.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp());
} else {
  // DOM already parsed (e.g. script loaded late or hot-reloaded by Vite)
  initApp();
}

// Admin Settings Listeners
document.addEventListener('DOMContentLoaded', () => {
  const totEl = document.getElementById('settings-total-questions');
  if (totEl) {
    totEl.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      db.settings.totalQuestions = val;

      // Automatically update default columns for this question count
      db.settings.gridCols = getDefaultColumnsForQuestionsCount(val);
      const colsInput = document.getElementById('settings-columns');
      if (colsInput) {
        colsInput.value = db.settings.gridCols;
      }

      // Update max on random powerup count and clamp it if needed
      const countEl = document.getElementById('settings-powerup-count');
      if (countEl) {
        countEl.max = val;
        let pVal = parseInt(countEl.value, 10);
        if (isNaN(pVal) || pVal < 0) pVal = 0;
        if (pVal > val) {
          pVal = val;
          countEl.value = pVal;
          db.settings.randomPowerupsCount = pVal;
        }
      }

      saveDB();
      renderCategoryInputs();
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
      renderCategoryInputs();
      renderAdminGrid();
      renderGameBoard();
    });
  }

  const showLeaderboardEl = document.getElementById('settings-show-leaderboard');
  if (showLeaderboardEl) {
    showLeaderboardEl.addEventListener('change', (e) => {
      db.settings.showLeaderboard = e.target.checked;
      saveDB();
      renderGameBoard();
    });
  }

  const tieBreakerEl = document.getElementById('settings-enable-tiebreaker');
  if (tieBreakerEl) {
    tieBreakerEl.addEventListener('change', (e) => {
      db.settings.enableTieBreaker = e.target.checked;
      saveDB();
      renderAdminGrid();
      renderGameBoard();
    });
  }

  const tbVisEl = document.getElementById('settings-tiebreaker-visible');
  if (tbVisEl) {
    tbVisEl.addEventListener('change', (e) => {
      db.settings.tiebreakerVisible = e.target.checked;
      saveDB();
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

  const powerupModeEl = document.getElementById('settings-powerup-mode');
  if (powerupModeEl) {
    powerupModeEl.addEventListener('change', (e) => {
      db.settings.powerupMode = e.target.value;
      const countGroup = document.getElementById('powerup-count-group');
      if (countGroup) {
        countGroup.style.display = e.target.value === 'random' ? 'block' : 'none';
      }
      assignRandomPowerups();
      saveGameState();
      saveDB();
    });
  }

  const powerupCountEl = document.getElementById('settings-powerup-count');
  if (powerupCountEl) {
    powerupCountEl.addEventListener('change', (e) => {
      let val = parseInt(e.target.value, 10);
      const maxAllowed = db.settings.totalQuestions || 12;
      if (isNaN(val) || val < 0) val = 0;
      if (val > maxAllowed) {
        val = maxAllowed;
        powerupCountEl.value = val;
      }
      db.settings.randomPowerupsCount = val;
      if (db.settings.powerupMode === 'random') {
        assignRandomPowerups();
        saveGameState();
      }
      saveDB();
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
    fontColorEl.addEventListener('input', (e) => {
      db.settings.gridFontColor = e.target.value;
      applySelectedFont();
    });
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
      if (e.target.checked && fontColorEl) {
        fontColorEl.value = '#000000';
        db.settings.gridFontColor = '#000000';
      }
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
    qnColorEl.addEventListener('input', (e) => {
      db.settings.gridQnColor = e.target.value;
      applySelectedFont();
    });
    qnColorEl.addEventListener('change', (e) => {
      db.settings.gridQnColor = e.target.value;
      saveDB();
    });
  }

  const qnColorDefEl = document.getElementById('settings-grid-qn-color-default');
  if (qnColorDefEl) {
    qnColorDefEl.addEventListener('change', (e) => {
      db.settings.useDefaultQnColor = e.target.checked;
      if (e.target.checked && qnColorEl) {
        qnColorEl.value = '#1e3a8a';
        db.settings.gridQnColor = '#1e3a8a';
      }
      if (qnColorEl) qnColorEl.disabled = e.target.checked;
      saveDB();
      applySelectedFont();
    });
  }

  const tileColorEl = document.getElementById('settings-grid-tile-color');
  if (tileColorEl) {
    tileColorEl.addEventListener('input', (e) => {
      db.settings.gridTileColor = e.target.value;
      applySelectedFont();
    });
    tileColorEl.addEventListener('change', (e) => {
      db.settings.gridTileColor = e.target.value;
      saveDB();
    });
  }

  const tileColorDefEl = document.getElementById('settings-grid-tile-color-default');
  if (tileColorDefEl) {
    tileColorDefEl.addEventListener('change', (e) => {
      db.settings.gridTileColorDefault = e.target.checked;
      if (e.target.checked && tileColorEl) {
        tileColorEl.value = '#ffffff';
        db.settings.gridTileColor = '#ffffff';
      }
      if (tileColorEl) tileColorEl.disabled = e.target.checked;
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

  const showCategoriesEl = document.getElementById('settings-show-categories');
  if (showCategoriesEl) {
    showCategoriesEl.addEventListener('change', (e) => {
      db.settings.showCategories = e.target.checked;
      saveDB();
      renderCategoryInputs();
      renderCategoryHeaders();
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
  const handleFeedbackVideoUpload = (type, file) => {
    if (!file) return;
    document.getElementById(`status-feedback-${type}`).textContent = "Saving custom video...";
    
    const reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        const dataUri = ev.target.result;
        await saveVideoToIndexedDB(`feedback-${type}`, dataUri);
        document.getElementById(`status-feedback-${type}`).textContent = `Custom video saved! (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
        document.getElementById(`btn-clear-feedback-${type}`).style.display = 'inline-block';
        triggerAlert('SYSTEM', `Custom ${type} video saved successfully!`, 'gain');
      } catch (err) {
        console.error('Failed to save feedback video', err);
        document.getElementById(`status-feedback-${type}`).textContent = 'Error saving video';
        triggerAlert('SYSTEM', 'Error saving custom video. File might be too large.', 'lose');
      }
    };
    reader.onerror = function () {
      document.getElementById(`status-feedback-${type}`).textContent = 'Error reading video';
      triggerAlert('SYSTEM', 'Error reading video file.', 'lose');
    };
    reader.readAsDataURL(file);
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
  // Scale based on a baseline resolution of 1500x844 (instead of 1920x1080) to make all items on all screens larger and bolder
  const baseW = 1500;
  const baseH = 844;

  const scaleX = window.innerWidth / baseW;
  const scaleY = window.innerHeight / baseH;

  // Use the smaller ratio so nothing gets clipped and it fits the viewport
  let scale = Math.min(scaleX, scaleY);

  const zoomFactor = Math.pow(1.2, currentZoomLevel);

  if (window.electronAPI) {
    // In Electron, Electron native zoom handles currentZoomLevel and changes dpr automatically.
    // We multiply by dpr to let native zoom scale the app correctly without fighting.
    const dpr = window.devicePixelRatio || 1;
    scale = scale * dpr;
  } else {
    // In standard browsers, we scale pure layout using the zoomFactor.
    // We do NOT multiply by dpr here because standard browsers automatically scale the layout
    // for OS display scaling (DPI), and multiplying by dpr would cause double-scaling (cutoffs).
    scale = scale * zoomFactor;
  }

  document.body.style.zoom = scale;

  if (typeof playState !== 'undefined' && playState.activeScreen === 'winner') {
    adjustWinnerCardFontSizeToFit();
  }
  
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay && modalOverlay.classList.contains('open')) {
    fitModalText();
    requestAnimationFrame(fitModalText);
    setTimeout(fitModalText, 50);
  }
}
window.addEventListener('resize', applyDynamicScaling);
window.addEventListener('load', applyDynamicScaling);
applyDynamicScaling(); // Apply immediately




// Append UI disable toggles
document.addEventListener('DOMContentLoaded', () => {
  const toggleDisable = (checkId, inputIds) => {
    const checkbox = document.getElementById(checkId);
    if (!checkbox) return;
    checkbox.addEventListener('change', (e) => {
      inputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = e.target.checked;
      });
    });
    // Trigger initially
    inputIds.forEach(id => {
      const input = document.getElementById(id);
      if (input) input.disabled = checkbox.checked;
    });
  };

  toggleDisable('admin-team1-default', ['admin-team1-name', 'admin-team1-logo']);
  toggleDisable('admin-team2-default', ['admin-team2-name', 'admin-team2-logo']);
  toggleDisable('settings-grid-font-color-default', ['settings-grid-font-color']);
  toggleDisable('settings-grid-qn-color-default', ['settings-grid-qn-color']);
  toggleDisable('settings-grid-tile-color-default', ['settings-grid-tile-color']);

  // Score Adjustment input listeners for live game corrections
  document.getElementById('admin-team1-score')?.addEventListener('input', e => {
    if (playState.teams && playState.teams[0]) {
      const val = parseInt(e.target.value, 10);
      playState.teams[0].score = isNaN(val) ? 0 : val;
      saveGameState();
      updateScoreUI();
    }
  });

  document.getElementById('admin-team2-score')?.addEventListener('input', e => {
    if (playState.teams && playState.teams[1]) {
      const val = parseInt(e.target.value, 10);
      playState.teams[1].score = isNaN(val) ? 0 : val;
      saveGameState();
      updateScoreUI();
    }
  });

  // About & Help modal toggle listeners
  const btnAboutToggle = document.getElementById('btn-about-toggle');
  const btnAboutClose = document.getElementById('btn-about-close');
  const btnAboutOk = document.getElementById('btn-about-ok');
  const aboutOverlay = document.getElementById('about-overlay');

  if (btnAboutToggle && aboutOverlay) {
    btnAboutToggle.addEventListener('click', () => {
      aboutOverlay.classList.add('open');
      playSound('click');
    });
  }

  const closeAbout = () => {
    if (aboutOverlay) {
      aboutOverlay.classList.remove('open');
      playSound('click');
    }
  };

  if (btnAboutClose) btnAboutClose.addEventListener('click', closeAbout);
  if (btnAboutOk) btnAboutOk.addEventListener('click', closeAbout);

  if (aboutOverlay) {
    aboutOverlay.addEventListener('click', (e) => {
      if (e.target === aboutOverlay) {
        closeAbout();
      }
    });
  }
});
