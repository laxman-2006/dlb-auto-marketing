const fs = require('fs');
const path = require('path');

const authDir = path.join(__dirname, '..', 'data', 'baileys_auth');
if (fs.existsSync(authDir)) {
  const files = fs.readdirSync(authDir).filter(f => f.startsWith('session-'));
  let closed = 0;
  for (const f of files) {
    try {
      const c = fs.readFileSync(path.join(authDir, f), 'utf8');
      if (c.includes('"closed":') && !c.includes('"closed":-1')) {
        console.log('Closed session found:', f);
        closed++;
      }
    } catch (e) {}
  }
  console.log(`Total session files: ${files.length}, Closed sessions: ${closed}`);
} else {
  console.log('Auth dir does not exist');
}
