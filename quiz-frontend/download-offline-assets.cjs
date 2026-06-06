const https = require('https');
const fs = require('fs');
const path = require('path');

const EMOJIS = [
  '🦁', '⚔️', '🌸', '👑', '🔥', '💎', '✔️', '❌', '👏', '🎉',
  '🌟', '🙌', '🏆', '🤩', '👍', '👌', '😊', '😢', '😭', '🤦',
  '📉', '💔', '🙈', '😬', '⚙️', '⚠️', '🗑️', '🔄', '▶️', '⏮️',
  '⏭️', '📝', '🥇', '🥈', '🥉', '🤝',
  '🐑', '🕊️', '🐟', '🦅', '🐋', '🐫', '🐝', '👦', '👧'
];

const PUBLIC_DIR = path.join(__dirname, 'public');
const EMOJIS_DIR = path.join(PUBLIC_DIR, 'emojis');

if (!fs.existsSync(EMOJIS_DIR)) {
  fs.mkdirSync(EMOJIS_DIR, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function toCodePoint(unicodeSurrogates) {
  const r = [];
  let c = 0, i = 0, p = 0;
  while (i < unicodeSurrogates.length) {
    c = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
      p = 0;
    } else if (0xD800 <= c && c <= 0xDBFF) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join('-');
}

async function run() {
  console.log('Downloading twemoji.min.js...');
  try {
    await download(
      'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js',
      path.join(PUBLIC_DIR, 'twemoji.min.js')
    );
    console.log('Successfully downloaded twemoji.min.js');
  } catch (err) {
    console.error('Failed to download twemoji.min.js:', err);
  }

  for (const emoji of EMOJIS) {
    const cp = toCodePoint(emoji);
    const cpNoFe0f = cp.replace(/-fe0f/g, '');
    const targets = [cp, cpNoFe0f];
    let success = false;
    for (const t of targets) {
      const url = `https://raw.githubusercontent.com/twitter/twemoji/v14.0.2/assets/svg/${t}.svg`;
      const dest = path.join(EMOJIS_DIR, `${t}.svg`);
      try {
        await download(url, dest);
        console.log(`Downloaded emoji ${emoji} (${t}.svg)`);
        success = true;
        if (t !== cp) {
          fs.copyFileSync(dest, path.join(EMOJIS_DIR, `${cp}.svg`));
        }
        break;
      } catch (err) {
        // Try next
      }
    }
    if (!success) {
      console.warn(`Could not download emoji ${emoji} (code points: ${cp})`);
    }
  }
  console.log('Done!');
}

run();
