const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');

// 1. Emojis
appJs = appJs.replace(/db\.settings\.positiveEmojis \|\| "[^"]+"/g, `db.settings.positiveEmojis || "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏"`);
appJs = appJs.replace(/parsed\.settings\?\.positiveEmojis \?\? "[^"]+"/g, `parsed.settings?.positiveEmojis ?? "👏,🎉,🌟,🙌,💯,🏆,🤩,👍,👌,😊,👏"`);
appJs = appJs.replace(/parsed\.settings\?\.negativeEmojis \?\? "[^"]+"/g, `parsed.settings?.negativeEmojis ?? "😢,😭,🤦,📉,💔,🙈,😬,💀"`);

appJs = appJs.replace(
  /const positiveEmojis = db\.settings\.positiveEmojis \? db\.settings\.positiveEmojis\.split\(\',\/\)\.map\(e => e\.trim\(\)\)\.filter\(e => e\) \: \[\'[^\]]+\];/g,
  `const positiveEmojis = db.settings.positiveEmojis ? db.settings.positiveEmojis.split(',').map(e => e.trim()).filter(e => e) : ['👏', '🎉', '🌟', '🙌', '💯', '🏆', '🤩', '👍', '👌', '😊', '👏'];`
);

// Fallback exact replace for positive/negative arrays if regex failed
appJs = appJs.replace(
  /const positiveEmojis = .*?;/g,
  `const positiveEmojis = db.settings.positiveEmojis ? db.settings.positiveEmojis.split(',').map(e => e.trim()).filter(e => e) : ['👏', '🎉', '🌟', '🙌', '💯', '🏆', '🤩', '👍', '👌', '😊', '👏'];`
);

appJs = appJs.replace(
  /const negativeEmojis = .*?;/g,
  `const negativeEmojis = db.settings.negativeEmojis ? db.settings.negativeEmojis.split(',').map(e => e.trim()).filter(e => e) : ['😢', '😭', '🤦', '📉', '💔', '🙈', '😬', '💀'];`
);


// 2. Fix switchTurn logic in three places
appJs = appJs.replace(
  /document\.getElementById\('modal-turn-status'\)\.textContent = "Question Cancelled";\r?\n\s*switchTurn\(\);/,
  `document.getElementById('modal-turn-status').textContent = "Question Cancelled";\n  if (!playState.hasPassed && !playState.stealAttempted) {\n    switchTurn();\n  }`
);

appJs = appJs.replace(
  /saveGameState\(\);\r?\n\s*switchTurn\(\);\r?\n\s*enableNextButton\(\);\r?\n\s*\};\r?\n\r?\n\s*if \(isCorrect\) \{/,
  `saveGameState();\n    if (!playState.hasPassed && !playState.stealAttempted) {\n      switchTurn();\n    }\n    enableNextButton();\n  };\n\n  if (isCorrect) {`
);

appJs = appJs.replace(
  /saveGameState\(\);\r?\n\s*switchTurn\(\);\r?\n\s*enableNextButton\(\);\r?\n\s*\};\r?\n\r?\n\s*if \(customWrongVideoSrc\) \{/,
  `saveGameState();\n        if (!playState.hasPassed && !playState.stealAttempted) {\n          switchTurn();\n        }\n        enableNextButton();\n      };\n\n      if (customWrongVideoSrc) {`
);

fs.writeFileSync('app.js', appJs);

let indexHtml = fs.readFileSync('index.html', 'utf8');
indexHtml = indexHtml.replace('Deduct 50 points on wrong answer', 'Deduct 50% on wrong answer');
fs.writeFileSync('index.html', indexHtml);
