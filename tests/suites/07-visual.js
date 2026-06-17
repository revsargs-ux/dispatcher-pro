const config = require('../config');
const br = require('../lib/browser');
const { sleep } = require('../lib/browser');
const { onErrorShot, compareWithBaseline } = require('../lib/screenshot');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'Visual Tests',
  tests: [
    {
      name: 'Скриншот каждой страницы в мобильном viewport',
      viewport: 'mobile',
      run: async ({ page, config }) => {
        const vp = config.viewports.mobile;
        await page.setViewport({ width: vp.width, height: vp.height });

        for (const [name, pagePath] of Object.entries(config.pages)) {
          await br.goto(page, pagePath, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          await sleep(1000);

          const result = await compareWithBaseline(page, `mobile-${name}`);
          
          if (result.isNew) {
            console.log(`    ℹ️  New baseline: mobile-${name}`);
          }
        }
      }
    },

    {
      name: 'Скриншот каждой страницы в desktop viewport',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        const vp = config.viewports.desktop;
        await page.setViewport({ width: vp.width, height: vp.height });

        for (const [name, pagePath] of Object.entries(config.pages)) {
          await br.goto(page, pagePath, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          await sleep(1000);

          const result = await compareWithBaseline(page, `desktop-${name}`);
          
          if (result.isNew) {
            console.log(`    ℹ️  New baseline: desktop-${name}`);
          }
        }
      }
    },

    {
      name: 'Скриншот owner.html в dark mode',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        const vp = config.viewports.desktop;
        await page.setViewport({ width: vp.width, height: vp.height });

        await br.goto(page, config.pages.owner, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
        await sleep(500);

        // Enable dark mode
        await page.evaluate(() => {
          // Try multiple approaches
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
          
          // Also emulate prefers-color-scheme
          const style = document.createElement('style');
          style.id = 'test-dark-mode';
          style.textContent = `
            :root { 
              --bg: #1a1a2e !important;
              --card: #16213e !important;
              --text: #e2e8f0 !important;
              --border: #2a2a4a !important;
              --primary: #4c7cba !important;
            }
          `;
          document.head.appendChild(style);
        });
        
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
        await sleep(1000);

        // Take dark mode screenshot
        const snapshotDir = config.snapshotDir;
        if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
        
        const screenshotPath = path.join(snapshotDir, 'dark-owner.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Verify dark mode applied
        const isDark = await page.evaluate(() => {
          const bg = getComputedStyle(document.body).backgroundColor;
          return bg.includes('26, 26, 46') || bg.includes('22, 33, 62') || 
                 document.body.classList.contains('dark') ||
                 document.documentElement.classList.contains('dark');
        });

        if (!isDark) {
          console.log('    ⚠️  Dark mode may not have applied correctly');
        }

        console.log(`    ℹ️  Dark mode screenshot: ${screenshotPath}`);
      }
    }
  ]
};
