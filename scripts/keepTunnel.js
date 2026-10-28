const { execSync, spawn } = require('child_process');

function runTunnel() {
  console.log('[Tunnel] Launching localtunnel on port 3001...');
  const child = spawn('npx', ['-y', 'localtunnel', '--port', '3001', '--subdomain', 'dlb-auto-marketing'], {
    shell: true,
    stdio: 'inherit'
  });

  child.on('close', (code) => {
    console.log(`[Tunnel] Process exited with code ${code}. Reconnecting in 3 seconds...`);
    setTimeout(runTunnel, 3000);
  });

  child.on('error', (err) => {
    console.error('[Tunnel] Error:', err);
    setTimeout(runTunnel, 3000);
  });
}

runTunnel();
