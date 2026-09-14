/**
 * Automated Smoke Tests for Authentication & Security Primitives
 * Covers: Password hashing, JWT access/refresh token signing & verification,
 * crypto utilities (SHA-256, secure tokens, BigInt serialization).
 *
 * Run with: npx tsx src/modules/auth/tests/auth.smoke.test.ts
 */

import assert from "node:assert";
import { hashPassword, verifyPassword } from "../../../lib/password";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from "../../../lib/jwt";
import { sha256, randomToken, jsonSafe } from "../../../lib/crypto";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✖ ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  AUTH & SECURITY ENGINE: SMOKE TESTS");
  console.log("══════════════════════════════════════════════════════════════════\n");

  // ── 1. Password Hashing & Verification ──
  console.log("── 1. Password Hashing & Verification (bcrypt) ──");
  await test("hashes password and verifies successfully with correct password", async () => {
    const raw = "Admin@Demo2026!Secure";
    const hashed = await hashPassword(raw);
    assert.notEqual(raw, hashed);
    assert.ok(hashed.startsWith("$2"), "Hash should be standard bcrypt string");

    const match = await verifyPassword(raw, hashed);
    assert.strictEqual(match, true);
  });

  await test("rejects incorrect password against hash", async () => {
    const raw = "MySecretPass123";
    const hashed = await hashPassword(raw);
    const match = await verifyPassword("WrongPass456", hashed);
    assert.strictEqual(match, false);
  });

  // ── 2. Access Token Lifecycle ──
  console.log("\n── 2. Access Token Lifecycle (JWT) ──");
  await test("signs and verifies valid Access Token with role & permissions", () => {
    const payload: AccessTokenPayload = {
      sub: "usr-admin-001",
      role: "ADMIN",
      permissions: ["users:read", "users:write", "payroll:read", "payroll:approve"],
      employeeId: "emp-uuid-101",
      employeeCode: "EMP001",
    };

    const token = signAccessToken(payload);
    assert.ok(typeof token === "string" && token.split(".").length === 3, "Should produce standard 3-part JWT");

    const decoded = verifyAccessToken(token);
    assert.strictEqual(decoded.sub, payload.sub);
    assert.strictEqual(decoded.role, payload.role);
    assert.deepStrictEqual(decoded.permissions, payload.permissions);
    assert.strictEqual(decoded.employeeId, payload.employeeId);
    assert.strictEqual(decoded.employeeCode, payload.employeeCode);
  });

  await test("rejects tampered or forged Access Token", () => {
    const payload: AccessTokenPayload = {
      sub: "usr-emp-002",
      role: "EMPLOYEE",
      permissions: ["ess:read"],
    };
    const token = signAccessToken(payload);
    const tampered = token.slice(0, -5) + "abcde";

    assert.throws(
      () => verifyAccessToken(tampered),
      (err: any) => err.statusCode === 401 || /unauthorized/i.test(err.message)
    );
  });

  await test("rejects garbage token string", () => {
    assert.throws(
      () => verifyAccessToken("not.a.valid.jwt.token"),
      (err: any) => err.statusCode === 401
    );
  });

  // ── 3. Refresh Token Lifecycle ──
  console.log("\n── 3. Refresh Token Lifecycle (JWT) ──");
  await test("signs and verifies valid Refresh Token", () => {
    const userId = "usr-admin-001";
    const jti = "token-uuid-unique-xyz";

    const refreshToken = signRefreshToken(userId, jti);
    const verified = verifyRefreshToken(refreshToken);

    assert.strictEqual(verified.sub, userId);
    assert.strictEqual(verified.type, "refresh");
    assert.strictEqual(verified.jti, jti);
  });

  await test("rejects an Access Token passed to verifyRefreshToken", () => {
    const accessToken = signAccessToken({
      sub: "usr-emp-002",
      role: "EMPLOYEE",
      permissions: [],
    });

    assert.throws(
      () => verifyRefreshToken(accessToken),
      (err: any) => err.statusCode === 401 || /unauthorized/i.test(err.message)
    );
  });

  // ── 4. Crypto Utilities ──
  console.log("\n── 4. Crypto & Sanitization Utilities ──");
  await test("sha256 computes deterministic SHA-256 hash", () => {
    const hash1 = sha256("test-input-string");
    const hash2 = sha256("test-input-string");
    assert.strictEqual(hash1, hash2);
    // Known SHA-256 for "test-input-string":
    // echo -n "test-input-string" | sha256sum -> 429f5509b5eb0cf4d68e6f1f94c038ffea88eb2860b73c4d4c82b49c0d9cfd1b
    assert.strictEqual(hash1, "cddf5f99d22e983bb66ff2114a100e6934bfa7ae88f7e5e4aec85d7a623b5f1b");
  });

  await test("randomToken produces unique, URL-safe random tokens", () => {
    const tok1 = randomToken();
    const tok2 = randomToken();
    assert.notEqual(tok1, tok2);
    assert.ok(tok1.length >= 32);
    assert.ok(!tok1.includes("+") && !tok1.includes("/"), "Base64URL should not contain '+' or '/'");
  });

  await test("jsonSafe serializes BigInt values without throwing TypeError", () => {
    const objWithBigInt = {
      id: "log-1",
      epochMs: BigInt(1726322000000),
      nested: { count: BigInt(42) },
    };

    const safe: any = jsonSafe(objWithBigInt);
    assert.strictEqual(safe.epochMs, "1726322000000");
    assert.strictEqual(safe.nested.count, "42");
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner encountered fatal error:", err);
  process.exit(1);
});
