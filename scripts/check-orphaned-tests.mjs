#!/usr/bin/env node

/**
 * check-orphaned-tests.mjs
 *
 * Scans the repository for test files (*.test.ts, *.spec.ts, etc.) and
 * verifies that each test file is matched by at least one test runner
 * (Jest or Playwright). Fails if any orphaned test files are discovered.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SEARCH_DIRS = ['packages', 'tools'];
const TEST_FILE_REGEX = /\.(test|spec)\.[jt]sx?$/;

// Patterns explicitly ignored by Jest (derived from jest.config.js)
const JEST_IGNORE_PATTERNS = [
  /\/node_modules\//,
  /\/e2e\//,
  /\.e2e\.test\.[jt]sx?$/,
  /MockLedgerTransport\.ts$/,
  /[/\\]__tests__[/\\]__mocks__[/\\]/,
  /[/\\]__tests__[/\\]setup\.ts$/,
  /[/\\]mock-webauthn\.ts$/,
];

// Patterns matched by Playwright (derived from playwright.config.ts)
const PLAYWRIGHT_MATCH_PATTERNS = [
  /\.e2e\.test\.[jt]sx?$/,
  /[/\\]e2e[/\\].*\.(test|spec)\.[jt]sx?$/,
];

// Helpers or mocks that match test file naming but are known helpers
const EXCLUDED_NON_TEST_FILES = [
  /[/\\]__mocks__[/\\]/,
  /[/\\]setup\.ts$/,
];

function findTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && TEST_FILE_REGEX.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkOrphans() {
  console.log('🔍 Checking for orphaned test files in repository...');

  const allTestFiles = [];
  for (const searchDir of SEARCH_DIRS) {
    const targetPath = path.join(rootDir, searchDir);
    allTestFiles.push(...findTestFiles(targetPath));
  }

  const orphanedFiles = [];
  let jestCount = 0;
  let playwrightCount = 0;

  for (const file of allTestFiles) {
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');

    // Skip known mock or setup files that are not test suites
    if (EXCLUDED_NON_TEST_FILES.some((pattern) => pattern.test(relativePath))) {
      continue;
    }

    const isIgnoredByJest = JEST_IGNORE_PATTERNS.some((pattern) =>
      pattern.test(relativePath)
    );
    const isMatchedByJest = !isIgnoredByJest;

    const isMatchedByPlaywright = PLAYWRIGHT_MATCH_PATTERNS.some((pattern) =>
      pattern.test(relativePath)
    );

    if (isMatchedByJest) {
      jestCount++;
    }
    if (isMatchedByPlaywright) {
      playwrightCount++;
    }

    if (!isMatchedByJest && !isMatchedByPlaywright) {
      orphanedFiles.push(relativePath);
    }
  }

  console.log(`📊 Total test files found: ${allTestFiles.length}`);
  console.log(`   - Claimed by Jest: ${jestCount}`);
  console.log(`   - Claimed by Playwright: ${playwrightCount}`);

  if (orphanedFiles.length > 0) {
    console.error('\n❌ ERROR: Found orphaned test files that no test runner picks up:');
    for (const orphan of orphanedFiles) {
      console.error(`   - ${orphan}`);
    }
    console.error('\nPlease update jest.config.js or playwright.config.ts or rename the files.\n');
    process.exit(1);
  }

  console.log('\n✅ All test files are properly matched by at least one test runner!\n');
}

checkOrphans();
