import { YouTubeService } from '../src/services/youtubeService';
import { db } from '../src/db/database';
import { initSocialAndVideoSchema } from '../src/db/socialVideoSchema';
import { config } from '../src/config/env';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING YOUTUBE OAUTH 2.0 & INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Database Schema
  initSocialAndVideoSchema();
  const scheduleColumns = db.prepare("PRAGMA table_info(social_schedules)").all() as any[];
  const colNames = scheduleColumns.map(c => c.name);
  assert(colNames.includes('youtube_video_id'), 'social_schedules has youtube_video_id column');
  assert(colNames.includes('youtube_video_url'), 'social_schedules has youtube_video_url column');

  // 2. Encryption & Decryption
  const sampleToken = '1//04gFakeRefreshTokenForTestingOnly_SuperSecret1234567890';
  const encrypted = YouTubeService.encryptToken(sampleToken);
  assert(encrypted !== sampleToken && encrypted.includes(':'), 'Token is securely encrypted with IV and Auth Tag');

  const decrypted = YouTubeService.decryptToken(encrypted);
  assert(decrypted === sampleToken, 'Encrypted token decrypts back to original value accurately');

  const tampered = encrypted.slice(0, -4) + 'ffff';
  const tamperedResult = YouTubeService.decryptToken(tampered);
  assert(tamperedResult === '', 'Tampered ciphertext fails authentication tag check and returns empty string');

  // 3. OAuth 2.0 Auth URL Generation & CSRF Protection
  const originalClientId = config.google.clientId;
  const originalClientSecret = config.google.clientSecret;
  config.google.clientId = 'test-mock-client-id.apps.googleusercontent.com';
  config.google.clientSecret = 'test-mock-secret';

  try {
    const { url, state } = YouTubeService.generateAuthUrl();
    assert(typeof url === 'string' && url.includes('accounts.google.com'), 'Auth URL targets accounts.google.com');
    assert(url.includes('access_type=offline'), 'Auth URL requests access_type=offline');
    assert(url.includes('prompt=consent'), 'Auth URL forces prompt=consent to ensure refresh token is provided');
    assert(url.includes(encodeURIComponent('https://www.googleapis.com/auth/youtube.upload')), 'Auth URL requests youtube.upload scope');
    assert(url.includes(encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')), 'Auth URL requests youtube.readonly scope');
    assert(url.includes(`state=${state}`), 'Auth URL embeds CSRF state parameter');

    // Test state validation
    assert(YouTubeService.validateOAuthState(state) === true, 'Valid state returns true on first validation');
    assert(YouTubeService.validateOAuthState(state) === false, 'State token is one-time use (replay attack blocked)');
    assert(YouTubeService.validateOAuthState('fake_unregistered_state') === false, 'Unregistered state fails validation');
  } finally {
    config.google.clientId = originalClientId;
    config.google.clientSecret = originalClientSecret;
  }

  // 4. Connection Status
  const status = YouTubeService.getConnectionStatus();
  assert(typeof status.connected === 'boolean', 'getConnectionStatus returns valid boolean connected flag');
  assert(typeof status.channelName === 'string', 'getConnectionStatus returns channelName');

  // 5. Test Live HTTP Endpoints on port 3001
  try {
    const res = await fetch('http://localhost:3001/api/social/youtube/status');
    const json = await res.json();
    assert(res.ok && json.success === true, 'GET /api/social/youtube/status returns 200 OK');
  } catch (err: any) {
    console.warn('Backend server test skipped if not currently listening:', err.message);
  }

  try {
    const res = await fetch('http://localhost:3001/api/social/youtube/callback', { redirect: 'manual' });
    assert(res.status === 302, 'GET /api/social/youtube/callback with missing params redirects (302) to settings with error');
  } catch (err: any) {
    console.warn('Callback test skipped if server not responding:', err.message);
  }

  console.log(`\n====================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
}

runTests().catch(console.error);
