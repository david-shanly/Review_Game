const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

const quizJson = fs.readFileSync('public/default_quiz.json', 'utf8');
const quizData = JSON.parse(quizJson);
quizData.teams = [
  { name: "Lion", logo: "lion.png" },
  { name: "Lioness", logo: "lioness.png" }
];

const newDataStr = `const data = ${JSON.stringify(quizData, null, 2)};\n  db = data;`;

appJs = appJs.replace(/const data = \{[\s\S]*?\};\r?\n\s*db = data;/, newDataStr);

fs.writeFileSync('app.js', appJs);
console.log('Update successful');
