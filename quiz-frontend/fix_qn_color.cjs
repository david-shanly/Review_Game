const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

// 1. Replace data in loadDefaultQuiz
const startIndex = appJs.indexOf('const data = {');
const endIndex = appJs.indexOf('db.settings = data.settings;', startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const quizJson = fs.readFileSync('public/default_quiz.json', 'utf8');
  const newDataStr = `const data = ${quizJson};\n\n  `;
  appJs = appJs.substring(0, startIndex) + newDataStr + appJs.substring(endIndex);
}

// 2. Add dynamic grid color logic in applyDynamicFont
appJs = appJs.replace(
  /\/\/ 3\. Font Weight override/,
  `// 2.5 Grid QN Label Color Override
  const gridQnColorEl = document.getElementById('settings-grid-qn-color');
  const gridQnColorDefaultEl = document.getElementById('settings-grid-qn-color-default');
  
  const qnColor = gridQnColorEl ? gridQnColorEl.value : '#ffb700';
  const useDefaultQnColor = gridQnColorDefaultEl ? gridQnColorDefaultEl.checked : true;

  if (!useDefaultQnColor) {
    css += \`
      #game-board-grid .cell-qn-label,
      #admin-interactive-grid .cell-qn-label {
        color: \${qnColor} !important;
      }
    \`;
  }

  // 3. Font Weight override`
);

// 3. Add event listeners for gridQnColor in setupSettingsEventHandlers
appJs = appJs.replace(
  /document\.getElementById\('settings-grid-font-color-default'\)\.addEventListener\('change', e => \{/,
  `document.getElementById('settings-grid-qn-color').addEventListener('input', e => {
    document.getElementById('settings-grid-qn-color-default').checked = false;
    db.settings.gridQnColor = e.target.value;
    db.settings.gridQnColorDefault = false;
    saveDB();
    applyDynamicFont();
  });
  document.getElementById('settings-grid-qn-color-default').addEventListener('change', e => {
    db.settings.gridQnColorDefault = e.target.checked;
    saveDB();
    applyDynamicFont();
  });\n\n  $&`
);

// 4. Initialize gridQnColor inputs in setupSettingsEventHandlers
appJs = appJs.replace(
  /if \(fontColorDefaultEl\) fontColorDefaultEl\.checked = db\.settings\.gridFontColorDefault !== false;/,
  `$&
    const qnColorEl = document.getElementById('settings-grid-qn-color');
    const qnColorDefaultEl = document.getElementById('settings-grid-qn-color-default');
    if (qnColorEl) qnColorEl.value = db.settings.gridQnColor || '#ffb700';
    if (qnColorDefaultEl) qnColorDefaultEl.checked = db.settings.gridQnColorDefault !== false;`
);

fs.writeFileSync('app.js', appJs);

let indexHtml = fs.readFileSync('index.html', 'utf8');

indexHtml = indexHtml.replace(
  /<div class="form-group-checkbox default-color-toggle">\s*<input type="checkbox" id="settings-grid-font-color-default">\s*<label for="settings-grid-font-color-default">Default Color<\/label>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class="form-group-checkbox"/,
  `<div class="form-group-checkbox default-color-toggle">
              <input type="checkbox" id="settings-grid-font-color-default">
              <label for="settings-grid-font-color-default">Default Color</label>
            </div>
          </div>
          
          <label style="margin-top: 12px; display: block;">Qn Label Formatting</label>
          <div class="typography-format-row">
            <div class="color-picker-wrapper" title="Choose Qn Label Color">
              <input type="color" id="settings-grid-qn-color" value="#ffb700">
            </div>
            <div class="form-group-checkbox default-color-toggle">
              <input type="checkbox" id="settings-grid-qn-color-default" checked>
              <label for="settings-grid-qn-color-default">Default Gold</label>
            </div>
          </div>
        </div>

        <div class="form-group-checkbox"`
);

fs.writeFileSync('index.html', indexHtml);
