const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

function replaceFunction(code, funcName, newFuncStr) {
  const funcStart = "function " + funcName + "() {";
  let startIndex = code.indexOf(funcStart);
  if (startIndex === -1 && funcName === "loadDefaultQuiz") {
     startIndex = code.indexOf("async function loadDefaultQuiz() {");
  }
  if (startIndex === -1) {
    console.error("Could not find", funcName);
    return code;
  }
  
  let openBraces = 0;
  let endIndex = -1;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i];
    const prevChar = code[i - 1];

    if ((char === '"' || char === "'" || char === String.fromCharCode(96)) && prevChar !== '\\\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex !== -1) {
    return code.substring(0, startIndex) + newFuncStr + code.substring(endIndex + 1);
  }
  return code;
}

const loadDBStr = fs.readFileSync('temp_loadDB.js', 'utf8');
const loadDefaultQuizStr = fs.readFileSync('temp_loadDefaultQuiz.js', 'utf8');
const importStr = fs.readFileSync('temp_importDatabase.js', 'utf8');
const gridHelpersStr = fs.readFileSync('temp_renderGridHelpers.js', 'utf8');

appJs = replaceFunction(appJs, 'loadDB', loadDBStr);
appJs = replaceFunction(appJs, 'loadDefaultQuiz', loadDefaultQuizStr);
appJs = replaceFunction(appJs, 'renderAdminGrid', gridHelpersStr);
appJs = replaceFunction(appJs, 'renderGameBoard', '');

appJs = appJs.replace(
  /document\.getElementById\('import-json-file'\)\.addEventListener\('change', e => \{[\s\S]*?e\.target\.value = '';\r?\n\s*\};\r?\n\s*reader\.readAsText\(file\);\r?\n\}\);/,
  importStr
);

appJs = appJs.replace(/const GRID_COLS = 5; \/\/ 5 columns fixed\r?\n/, '');

fs.writeFileSync('app.js', appJs);

console.log("Update applied via node script");
