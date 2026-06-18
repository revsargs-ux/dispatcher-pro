#!/usr/bin/env node

/**
 * E2E Test Runner for Dispatcher.PRO
 * 
 * Usage:
 *   node run.js                    — run all suites
 *   node run.js --suite=01-auth    — run specific suite
 *   node run.js --quick            — only auth + shift + security
 *   node run.js --screenshot-only  — only visual tests
 */

const config = require('./config');
const reporter = require('./lib/reporter');
const br = require('./lib/browser');
const { ensureTestAccounts, cleanupTestData } = require('./lib/api-client');
const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const suiteArg = args.find(a => a.startsWith('--suite='))?.split('=')[1];
const quickMode = args.includes('--quick');
const screenshotOnly = args.includes('--screenshot-only');

// Suite files in order
const allSuiteFiles = [
  '01-auth.js',
  '02-shift-lifecycle.js',
  '03-ux-audit.js',
  '04-accessibility.js',
  '05-security.js',
  '06-performance.js',
  '07-visual.js'
];

const quickSuiteFiles = [
  '01-auth.js',
  '02-shift-lifecycle.js',
  '05-security.js'
];

const visualSuiteFiles = [
  '07-visual.js'
];

// Determine which suites to run
let suiteFiles;
if (screenshotOnly) {
  suiteFiles = visualSuiteFiles;
} else if (quickMode) {
  suiteFiles = quickSuiteFiles;
} else if (suiteArg) {
  // Find matching suite file
  const match = allSuiteFiles.find(f => f.includes(suiteArg) || f === suiteArg);
  if (match) {
    suiteFiles = [match];
  } else {
    console.error(`Suite not found: ${suiteArg}`);
    console.error('Available suites:', allSuiteFiles.join(', '));
    process.exit(1);
  }
} else {
  suiteFiles = allSuiteFiles;
}

// Ensure screenshot dir exists
if (!fs.existsSync(config.screenshotDir)) {
  fs.mkdirSync(config.screenshotDir, { recursive: true });
}

async function runTest(page, test, suite) {
  const startTime = Date.now();
  
  try {
    // Set viewport
    const vp = config.viewports[test.viewport] || config.viewports.desktop;
    await page.setViewport({ width: vp.width, height: vp.height });
    
    // Run with timeout
    const timeoutMs = config.timeouts.testTimeout;
    await Promise.race([
      test.run({ page, config, reporter }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    const duration = Date.now() - startTime;
    reporter.pass(test.name, duration);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Take error screenshot
    try {
      const shotPath = await br.screenshot(page, test.name.replace(/\s+/g, '_'));
      reporter.info(`Screenshot saved: ${shotPath}`);
    } catch (e) {}
    
    reporter.fail(test.name, error, duration);
  }
}

async function runSuite(browser, suite) {
  reporter.setSuite(suite.name);

  for (const test of suite.tests) {
    // Silent delay tests — execute without reporting
    if (test._silent) {
      if (typeof test.run === 'function') await test.run({ page: null, config, reporter });
      continue;
    }

    if (!test.run || typeof test.run !== 'function') {
      reporter.skip(test.name, 'No run function defined');
      continue;
    }

    // Each test gets a fresh page
    const page = await br.newPage(browser, test.viewport);
    
    try {
      await runTest(page, test, suite);
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Dispatcher.PRO — E2E Test Runner                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Mode: ${quickMode ? 'Quick' : screenshotOnly ? 'Screenshots Only' : 'Full'}`);
  console.log(`  Suites: ${suiteFiles.join(', ')}`);
  console.log(`  Base URL: ${config.baseUrl}\n`);

  // Ensure test accounts exist
  console.log('  Setting up test accounts...');
  try {
    const accountStatus = await ensureTestAccounts();
    console.log(`  ✅ Existing: ${accountStatus.existing.join(', ') || 'none'}`);
    console.log(`  ✅ Created: ${accountStatus.created.join(', ') || 'none'}\n`);
  } catch (e) {
    console.log(`  ⚠️  Account setup warning: ${e.message}\n`);
  }

  // Launch browser
  let browser;
  try {
    browser = await br.launch();
    console.log('  🌐 Browser launched\n');
  } catch (e) {
    console.error(`  ❌ Failed to launch browser: ${e.message}`);
    process.exit(1);
  }

  // Run suites
  try {
    for (const suiteFile of suiteFiles) {
      const suitePath = path.join(__dirname, 'suites', suiteFile);
      
      if (!fs.existsSync(suitePath)) {
        console.log(`  ⚠️  Suite file not found: ${suiteFile}`);
        continue;
      }

      const suite = require(suitePath);
      await runSuite(browser, suite);
    }
  } catch (error) {
    console.error(`\n  ❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  } finally {
    await br.close(browser);
  }

  // Cleanup test data
  console.log('\n  🧹 Cleaning up test data...');
  try {
    const cleanup = await cleanupTestData();
    cleanup.deleted.forEach(d => console.log(`  ✅ Cleaned ${d.table}: ${d.count} rows`));
    if (cleanup.errors.length) console.log(`  ⚠️  Cleanup warnings: ${cleanup.errors.length}`);
  } catch (e) {
    console.log(`  ⚠️  Cleanup error: ${e.message}`);
  }

  // Write reports
  await reporter.writeReport();

  // Print summary and exit
  const exitCode = reporter.getExitCode();
  if (exitCode === 0) {
    console.log('  ✅ All tests passed!\n');
  } else {
    console.log('  ❌ Some tests failed. See report.json/report.md for details.\n');
  }

  process.exit(exitCode);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});

// Run
main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
