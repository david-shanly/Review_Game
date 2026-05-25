import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

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
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
