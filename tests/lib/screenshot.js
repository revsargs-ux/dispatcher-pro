const config = require('../config');
const fs = require('fs');
const path = require('path');

/**
 * Take a screenshot for error reporting
 */
async function onErrorShot(page, testName) {
  const dir = config.screenshotDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `error-${testName.replace(/\s+/g, '_')}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  } catch (e) {
    return null;
  }
}

/**
 * Take a baseline snapshot
 */
async function takeBaseline(page, name) {
  const dir = config.snapshotDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/**
 * Compare current screenshot with baseline (simple file existence check)
 */
async function compareWithBaseline(page, name) {
  const baselinePath = path.join(config.snapshotDir, `${name}.png`);
  const hasBaseline = fs.existsSync(baselinePath);
  
  const currentPath = path.join(config.snapshotDir, `${name}-current.png`);
  await page.screenshot({ path: currentPath, fullPage: true });

  if (!hasBaseline) {
    // First run — save as baseline
    fs.copyFileSync(currentPath, baselinePath);
    return { isNew: true, path: baselinePath };
  }

  return { isNew: false, path: currentPath, baseline: baselinePath };
}

module.exports = {
  onErrorShot,
  takeBaseline,
  compareWithBaseline
};
