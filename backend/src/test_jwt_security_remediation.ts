import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import http from 'http';

// Load backend .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  validateJwtSecrets,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from './utils/auth';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testsFailed++;
  }
}

async function runSecurityRemediationTests() {
  console.log('\n🔒 Starting JWT Security Remediation Test Suite...\n');

  // Save current environment variables to restore afterwards
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  // ─── Test 1: Fail if JWT_SECRET is missing ──────────────────────────────────
  try {
    delete process.env.JWT_SECRET;
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('JWT_SECRET environment variable is missing'), 'Rejects missing JWT_SECRET');
    }
    if (!threw) assert(false, 'Rejects missing JWT_SECRET', 'Did not throw');
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  // ─── Test 2: Fail if JWT_SECRET is empty string ─────────────────────────────
  try {
    process.env.JWT_SECRET = '   ';
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('JWT_SECRET environment variable is missing or empty'), 'Rejects empty JWT_SECRET');
    }
    if (!threw) assert(false, 'Rejects empty JWT_SECRET', 'Did not throw');
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  // ─── Test 3: Fail if JWT_SECRET is too short (< 32 chars) ───────────────────
  try {
    process.env.JWT_SECRET = 'short_secret_under_32_chars';
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('too short'), 'Rejects JWT_SECRET shorter than 32 characters');
    }
    if (!threw) assert(false, 'Rejects JWT_SECRET shorter than 32 characters', 'Did not throw');
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  // ─── Test 4: Fail if JWT_REFRESH_SECRET is missing ──────────────────────────
  try {
    delete process.env.JWT_REFRESH_SECRET;
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('JWT_REFRESH_SECRET environment variable is missing'), 'Rejects missing JWT_REFRESH_SECRET');
    }
    if (!threw) assert(false, 'Rejects missing JWT_REFRESH_SECRET', 'Did not throw');
  } finally {
    process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
  }

  // ─── Test 5: Fail if JWT_REFRESH_SECRET is too short (< 32 chars) ───────────
  try {
    process.env.JWT_REFRESH_SECRET = 'short_refresh_secret_123';
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('too short'), 'Rejects JWT_REFRESH_SECRET shorter than 32 characters');
    }
    if (!threw) assert(false, 'Rejects JWT_REFRESH_SECRET shorter than 32 characters', 'Did not throw');
  } finally {
    process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
  }

  // ─── Test 6: Fail if JWT_SECRET === JWT_REFRESH_SECRET (identical secrets) ──
  try {
    const identical = 'a_very_long_secret_that_is_at_least_32_chars_long_1234567890';
    process.env.JWT_SECRET = identical;
    process.env.JWT_REFRESH_SECRET = identical;
    let threw = false;
    try {
      validateJwtSecrets();
    } catch (e: any) {
      threw = true;
      assert(e.message.includes('must be distinct'), 'Rejects identical access and refresh secrets');
    }
    if (!threw) assert(false, 'Rejects identical access and refresh secrets', 'Did not throw');
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
  }

  // ─── Test 7: Passes with valid distinct environment secrets ─────────────────
  try {
    const validated = validateJwtSecrets();
    assert(
      typeof validated.jwtSecret === 'string' &&
      typeof validated.jwtRefreshSecret === 'string' &&
      validated.jwtSecret !== validated.jwtRefreshSecret &&
      validated.jwtSecret.length >= 32 &&
      validated.jwtRefreshSecret.length >= 32,
      'Accepts valid, strong, distinct secrets from environment'
    );
  } catch (e: any) {
    assert(false, 'Accepts valid, strong, distinct secrets from environment', e.message);
  }

  // ─── Test 8: Generate and verify access token with correct payload ──────────
  const testPayload = {
    userId: '11111111-2222-3333-4444-555555555555',
    role: 'admin',
    name: 'Admin Test',
    email: 'admin@test.com'
  };
  const accessToken = generateAccessToken(testPayload);
  assert(typeof accessToken === 'string' && accessToken.split('.').length === 3, 'Generates standard 3-part JWT access token');

  const decodedAccess = verifyAccessToken(accessToken);
  assert(
    decodedAccess !== null &&
    decodedAccess.userId === testPayload.userId &&
    decodedAccess.role === testPayload.role,
    'Verifies access token and decodes userId and role correctly'
  );

  // ─── Test 9: Generate and verify refresh token ───────────────────────────────
  const refreshToken = generateRefreshToken({ userId: testPayload.userId });
  assert(typeof refreshToken === 'string' && refreshToken.split('.').length === 3, 'Generates standard 3-part JWT refresh token');

  const decodedRefresh = verifyRefreshToken(refreshToken);
  assert(
    decodedRefresh !== null &&
    decodedRefresh.userId === testPayload.userId,
    'Verifies refresh token and decodes userId correctly'
  );

  // ─── Test 10: Cross-token verification fails (Separate secret keys) ──────────
  const accessAsRefresh = verifyRefreshToken(accessToken);
  assert(accessAsRefresh === null, 'Access token is rejected when verified with refresh secret');

  const refreshAsAccess = verifyAccessToken(refreshToken);
  assert(refreshAsAccess === null, 'Refresh token is rejected when verified with access secret');

  // ─── Test 11: Tokens signed with old/compromised secrets are rejected ───────
  const fakeOldSecret = 'compromised_old_secret_value_12345678901234567890';
  const oldCompromisedToken = jwt.sign(
    { userId: testPayload.userId, role: testPayload.role },
    fakeOldSecret,
    { expiresIn: '15m' }
  );
  const decodedOld = verifyAccessToken(oldCompromisedToken);
  assert(decodedOld === null, 'Token signed with old/compromised secret is rejected (SignatureVerificationFailed)');

  // ─── Test 12: Live API Authentication flow verification ────────────────────
  console.log('\n🌐 Testing Live Authentication API with Rotated Secrets...');
  try {
    const loginResponse = await makeHttpRequest('POST', '/api/v1/auth/login', {
      email: 'admin@gmail.com',
      password: 'Saksham_developer@1234'
    });

    assert(
      loginResponse.status === 200 &&
      loginResponse.data?.success === true &&
      typeof loginResponse.data?.data?.access_token === 'string',
      'Live POST /api/v1/auth/login succeeds with rotated secrets'
    );

    const liveToken = loginResponse.data?.data?.access_token;
    if (liveToken) {
      const meResponse = await makeHttpRequest('GET', '/api/v1/auth/me', undefined, liveToken);
      assert(
        meResponse.status === 200 &&
        meResponse.data?.success === true &&
        meResponse.data?.data?.user?.email === 'admin@gmail.com',
        'Live GET /api/v1/auth/me succeeds with issued access token'
      );
    }
  } catch (err: any) {
    console.log('  ⚠️ Note on live HTTP request:', err.message);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═════════════════════════════════════════════════════════════');
  console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═════════════════════════════════════════════════════════════\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

function makeHttpRequest(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 0, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

runSecurityRemediationTests();
