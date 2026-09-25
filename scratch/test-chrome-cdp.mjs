import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-cdp-'));
console.log('Launching Chrome with temp profile:', tmpDir);

const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9333',
  `--user-data-dir=${tmpDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  'about:blank'
], { stdio: 'ignore' });

chromeProc.on('error', (err) => console.error('Chrome spawn error:', err));

async function main() {
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await fetch('http://127.0.0.1:9333/json/version');
      const data = await res.json();
      console.log('CDP Version:', data.Browser);
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch (e) {
      // waiting
    }
  }

  if (!wsUrl) {
    console.error('Failed to get webSocketDebuggerUrl');
    chromeProc.kill();
    return;
  }

  console.log('Connected to CDP! WebSocket URL:', wsUrl);
  chromeProc.kill();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

main().catch(console.error);
