# VBS Group C Quiz - Project Outline

## Overview
An interactive, standalone Bible quiz game application designed for Vacation Bible School (VBS) children. The app features a competitive game board, a scoring system with customizable team names and logos, dynamic animations (confetti, score dropping), programmatic sound effects, and an admin panel for question management.

## Tech Stack
- **Frontend Core**: HTML5, CSS3 (Custom CSS variables, glassmorphism UI), Vanilla JavaScript (ES6 Modules).
- **Audio & Animation**: Web Audio API (programmatic sound generation), HTML5 Canvas API (custom confetti particle engine).
- **Build Tool**: Vite (bundling and local development server).
- **Packaging (Optional)**: Electron & Electron-Builder (Windows desktop executable), Capacitor (Android app wrapping).
- **Storage**: Browser `localStorage` (persists settings, questions, and team stats locally without a backend database).

## Project Structure
```text
Daniel Quiz/
├── quiz-frontend/
│   ├── public/              # Static assets directly served by Vite
│   │   ├── icon.png         # Main app logo
│   │   ├── lion.png         # Default team 1 logo
│   │   └── lioness.png      # Default team 2 logo
│   ├── index.html           # Main UI structure (Dashboard, Game Board, Admin Panel, Winner Screen)
│   ├── style.css            # Stylesheets (Light/Dark themes, responsive layouts, animations)
│   ├── app.js               # Core game logic (State management, UI rendering, Turn system, Audio)
│   ├── package.json         # Project metadata, scripts, and dependencies (Vite, Electron, Capacitor)
│   ├── vite.config.js       # Vite configuration
│   ├── electron-main.cjs    # Electron main process entry point (if building desktop app)
│   └── electron-builder.json# Electron build configuration
└── README.md                # Project outline and documentation
```

## Core Features & Mechanics

### 1. Game State Management
- Maintains state for teams, scores, active turn, current question, and answered cells.
- Data is automatically saved and loaded to `localStorage` under the `vbs_quiz_db` key.

### 2. UI Screens (Managed via DOM classes)
- **Dashboard**: Start screen, verifies if quiz questions are loaded.
- **Admin Panel**: 
  - Manage game rules (e.g., negative scoring toggle).
  - Configure teams (Names, Custom Logos).
  - Add/Edit 20 questions (Multiple Choice or Fill-in-the-blank).
  - Import/Export quiz questions as JSON files.
  - Reset or clear game state.
- **Game Board**: 
  - 4x5 grid of clickable question cells.
  - Real-time leaderboard.
  - Turn indicator.
- **Winner Screen**: Final standings, team stats, and endless confetti rain.

### 3. Gameplay Loop
- Two teams take turns selecting questions from the grid.
- Questions appear in a modal (MCQ options or text input).
- **Correct Answer**: Triggers success sound, confetti burst, awards points, cell marked with team colors.
- **Incorrect Answer (Attempt 1)**: Wrong sound plays, score is penalized (if enabled), question "Passes" to the other team for half points.
- **Incorrect Answer (Attempt 2)**: Wrong sound plays, score penalized again, correct answer revealed, cell disabled.
- **Cancel/Pass**: Questions can be skipped or cancelled without penalty.

### 4. Scoring & Point Rules
- **Base Points**: Each question has a configurable point value (e.g., 100 points).
- **First Attempt Correct**: The active team receives 100% of the question's point value.
- **First Attempt Incorrect**: 
  - If "Negative Scoring" is enabled in the Admin Panel, the active team loses 50% of the point value.
  - The question immediately "Passes" to the opposing team.
- **Second Attempt Correct (Steal)**: The opposing team receives 50% of the question's point value.
- **Second Attempt Incorrect (Failed Steal)**:
  - If "Negative Scoring" is enabled, the opposing team also loses 50% of the point value.
  - The question ends, the correct answer is revealed, and no points are awarded.
- **Manual Pass / Cancel**: Bypasses the question with no penalty to either team.

### 5. Dynamic Theme Engine
- Supports "Light Mode" and "Dark Mode".
- Driven by CSS variables (`data-theme="light"` / `data-theme="dark"` on `<html>` tag).

### 6. Programmatic Audio Engine
- Custom oscillators built with Web Audio API.
- Generates sounds mathematically rather than relying on external mp3 files.
- Sounds: `correct`, `wrong`, `cancel`, `pass`, `click`, `open`.

## UI & Design Details
The interface is built entirely using **Vanilla HTML and CSS3** without frontend frameworks. It employs a modern **Glassmorphism** aesthetic (`backdrop-filter: blur()`, semi-transparent panels, floating cards, soft drop shadows). 

### Color Palette (Dynamic Theme)
The application uses CSS variables to instantly switch between themes:
- **Dark Theme (Cinematic / Default)**: Deep space-blue gradients (`#07112B` to `#0D1B3E`) with semi-transparent navy panels (`rgba(14, 28, 65, 0.78)`). Accents use vibrant, glowing Gold (`#F4C430`).
- **Light Theme (Clean / Bright)**: Soft icy-blue gradients (`#E4ECFF` to `#FAFCFF`) with frosted white panels (`rgba(255, 255, 255, 0.92)`). Accents use deeper Gold (`#C8900A`) for contrast.
- **Team Colors**: Cycles through distinct neon/pastel shades (Cyan, Pink, Green, Purple, Orange) depending on the team index.

### The Four Screens
The interface is a Single Page Application (SPA) where screens are toggled by applying the `.active` CSS class.
1. **Dashboard (`#screen-dashboard`)**: The landing page. Features a bouncing logo, a "Start Quiz" button, and a status check that warns the user if no questions are loaded yet.
2. **Admin Panel (`#screen-admin`)**: A two-column layout. The left sidebar contains game rule toggles, team configuration (names/logos), and JSON data import/export. The right side features a clickable 20-cell grid and a dynamic form to create/edit Multiple Choice or Fill-in-the-blank questions.
3. **Game Board (`#screen-game`)**: The main arena. Features a top bar showing the active turn and team scores. The layout is split between a central 4x5 interactive question grid and a live updating Sidebar Leaderboard. Clicking a grid cell opens the **Question Modal** overlay for answering.
4. **Winner Screen (`#screen-winner`)**: Triggered when the game ends. Displays the champion team name, a ranked list of standings, and activates an endless loop of HTML5 Canvas Confetti.

## Deep Dive: Implementation Details

### 1. State Structure (`app.js`)
The application logic separates persistent configuration from transient gameplay state:
- **`db` (Persistent Setup)**: Stored in `localStorage`.
  - `settings`: Object containing global flags like `subtractOnWrong`.
  - `questions`: Array of objects. Each question defines: `{ id, qnIndex (1-20), type ('mcq' | 'fill'), question, options (Array of 4 if mcq), answer, points }`.
  - `teams`: Array of team definitions: `{ name, logo }`.
- **`playState` (Volatile Gameplay)**: Reset at the start of each game.
  - `activeScreen`: Tracks the current DOM screen ID.
  - `teams`: Array tracking live team objects `{ name, score }`.
  - `answeredCells`: Dictionary tracking cell statuses. e.g., `"qn1": { teamIndex, pointsWon, cancelled }`.
  - `stats`: Dictionary tracking `correct` and `attempts` counts per `teamIndex`.
  - `hasPassed`: Boolean indicating if the current question is on its second attempt (steal).

### 2. Modal & Interaction Flow
When a grid cell is clicked on the Game Board:
1. The `playState.currentCellId` and `playState.currentQuestion` are set.
2. The UI checks the `question.type` to display either a 4-button MCQ grid or a text input field for 'fill-in-the-blank'.
3. The Modal overlay (`#modal-overlay`) slides in using CSS transforms.
4. If answered correctly, DOM classes `.feedback-correct` are applied to the modal, triggering visual gold borders, the success audio oscillator plays, and `triggerBurst()` is fired for confetti.

### 3. CSS Animations & Visual Feedback
- **Hardware Acceleration**: Animations like `.screen` transitions, `logoFloat`, and `startPulse` utilize `transform` and `opacity` properties to ensure smooth 60fps rendering without layout thrashing.
- **Micro-interactions**: Buttons feature active states (`transform: scale(0.95)`) and hover states with enhanced `box-shadow` to simulate depth.
- **Score Drop Visual**: A floating temporary DOM element (`−X pts`) is generated dynamically and animated upwards (`animation: scoreDrop`) to provide immediate visual feedback when a team loses points.

### 4. Confetti Physics Engine
- Built entirely on a single HTML `<canvas id="confetti-canvas">`.
- Implements a custom `ConfettiParticle` class with velocity (`vx`, `vy`), gravity (`0.14`), rotation (`rotSpeed`), and opacity fading for bursts. 
- Uses `requestAnimationFrame` for a highly performant rendering loop that continuously clears and redraws particle rectangles.

## Areas for Optimization (For AI/ChatGPT Refactoring)
- **Code Organization**: `app.js` is quite large (1100+ lines); could be refactored into smaller, focused modules (e.g., `audio.js`, `ui.js`, `state.js`, `confetti.js`).
- **State Reactivity**: Currently relies on manual DOM updates after state changes. Could implement a lightweight proxy-based reactive state or a custom event bus to decouple logic from the UI.
- **CSS Architecture**: Consolidate redundant styles or extract reusable utility classes.
- **Accessibility (a11y)**: Improve keyboard navigation, screen reader support (ARIA roles), and focus management within modals.
