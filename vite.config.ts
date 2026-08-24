import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'telemetry-plugin',
      configureServer(server) {
        server.middlewares.use('/api/telemetry', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
              try {
                const dir = path.resolve(__dirname, 'telemetry');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir);
                fs.appendFileSync(path.join(dir, 'gameplay-sessions.jsonl'), body.trim() + '\n');
                res.statusCode = 200;
                res.end('ok');
              } catch(e) {
                res.statusCode = 500;
                res.end('fail');
              }
            });
          }
        });
      }
    }
  ],
})
