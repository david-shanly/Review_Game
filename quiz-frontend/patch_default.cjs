const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

const startIndex = appJs.indexOf('const data = {');
const endIndex = appJs.indexOf('  };\n  db = data;', startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  const quizJson = fs.readFileSync('public/default_quiz.json', 'utf8');
  
  // Parse and re-add teams since public/default_quiz.json might not have teams
  const quizData = JSON.parse(quizJson);
  quizData.teams = [
    { name: "Lion", logo: "lion.png" },
    { name: "Lioness", logo: "lioness.png" }
  ];
  
  const newDataStr = `const data = ${JSON.stringify(quizData, null, 2)}`;
  appJs = appJs.substring(0, startIndex) + newDataStr + appJs.substring(endIndex + 4); // +4 for '  };'
  fs.writeFileSync('app.js', appJs);
  console.log('Update successful');
} else {
  console.log('Could not find data block in loadDefaultQuiz', startIndex, endIndex);
}
