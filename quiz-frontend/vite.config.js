import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

function saveDbPlugin() {
  return {
    name: 'save-db-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-db', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const filePath = path.resolve(__dirname, 'public/default_quiz.json');
              fs.writeFileSync(filePath, body, 'utf8');
              
              // Run git commit and push to sync with GitHub
              const repoRoot = path.resolve(__dirname, '..');
              const cmd = 'git add quiz-frontend/public/default_quiz.json && git commit -m "Update default quiz database from Control Center" && git push';
              
              exec(cmd, { cwd: repoRoot }, (gitErr, stdout, stderr) => {
                res.setHeader('Content-Type', 'application/json');
                if (gitErr) {
                  console.error('Git push failed:', gitErr);
                  console.error('stderr:', stderr);
                  res.end(JSON.stringify({ success: true, gitSuccess: false, error: stderr || gitErr.message }));
                } else {
                  console.log('Git push succeeded:', stdout);
                  res.end(JSON.stringify({ success: true, gitSuccess: true }));
                }
              });
            } catch (err) {
              console.error(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end('Method Not Allowed');
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [saveDbPlugin()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
