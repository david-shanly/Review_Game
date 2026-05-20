const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const directoryToWatch = __dirname;
let timeout = null;
const debounceMs = 5000; // Wait 5 seconds after the last change before pushing

console.log(`Watching for changes in ${directoryToWatch}...`);
console.log('Any saved changes will automatically be committed and pushed to GitHub.');

fs.watch(directoryToWatch, { recursive: true }, (eventType, filename) => {
  if (filename && filename.includes('.git')) return;
  if (filename && filename.includes('node_modules')) return;

  if (timeout) {
    clearTimeout(timeout);
  }

  timeout = setTimeout(() => {
    const timestamp = new Date().toLocaleString();
    console.log(`\nChange detected. Auto-pushing changes at ${timestamp}...`);

    exec('git add . && git commit -m "Auto-update from local changes" && git push origin main', (err, stdout, stderr) => {
      if (err) {
        // If there's nothing to commit, it throws an error we can safely ignore
        if (stdout.includes('nothing to commit')) {
          console.log('Nothing new to commit.');
        } else {
          console.error('Error during auto-push:', stderr || err.message);
        }
        return;
      }
      console.log('Successfully pushed changes to GitHub!');
      console.log(stdout);
    });
  }, debounceMs);
});
