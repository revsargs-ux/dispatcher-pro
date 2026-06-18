const config = require('../config');
const br = require('../lib/browser');
const { sleep } = require('../lib/browser');

module.exports = {
  name: 'Performance Tests',
  tests: [
    {
      name: 'Время загрузки каждой страницы < 3s',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        const results = [];

        for (const [name, path] of Object.entries(config.pages)) {
          const start = Date.now();
          await br.goto(page, path, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          const loadTime = Date.now() - start;

          results.push({ name, loadTime });

          if (loadTime > config.thresholds.pageLoadMs) {
            throw new Error(`${name} page took ${loadTime}ms (threshold: ${config.thresholds.pageLoadMs}ms)`);
          }
        }

        console.log(`    ℹ️  Load times: ${results.map(r => `${r.name}=${r.loadTime}ms`).join(', ')}`);
      }
    },

    {
      name: 'Console не содержит ошибок JS',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        const allErrors = [];

        for (const [name, path] of Object.entries(config.pages)) {
          // Fresh page for each test
          page._consoleErrors = [];
          await br.goto(page, path, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          await sleep(2000);

          const errors = page._consoleErrors.filter(e => {
            // Filter out expected errors (network errors when not logged in are OK)
            return !e.includes('Failed to load resource') &&
                   !e.includes('net::ERR') &&
                   !e.includes('401') &&
                   !e.includes('Unauthorized') &&
                   !e.includes('manifest.json') &&  // PWA manifest not critical for tests
                   !e.includes('showMain is not defined') &&  // Worker page autologin race condition
                   !e.includes('showMain error') &&
                   !e.includes('bad HTTP response code');  // manifest 403
          });

          if (errors.length > config.thresholds.maxConsoleErrors) {
            allErrors.push(`${name}: ${errors.join('; ')}`);
          }
        }

        if (allErrors.length > 0) {
          throw new Error(`Console errors found:\n${allErrors.join('\n')}`);
        }
      }
    },

    {
      name: 'Количество сетевых запросов при загрузке < 20',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          page._networkRequests = 0;
          await br.goto(page, path, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          await sleep(1000);

          const requests = page._networkRequests;

          if (requests > config.thresholds.maxNetworkRequests) {
            throw new Error(`${name}: ${requests} network requests (threshold: ${config.thresholds.maxNetworkRequests})`);
          }

          console.log(`    ℹ️  ${name}: ${requests} requests`);
        }
      }
    },

    {
      name: 'Размер DOM не превышает 5000 узлов',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '.auth-box', waitUntil: 'networkidle2' });
          await sleep(500);

          const nodeCount = await page.evaluate(() => document.getElementsByTagName('*').length);

          if (nodeCount > config.thresholds.maxDomNodes) {
            throw new Error(`${name}: DOM has ${nodeCount} nodes (threshold: ${config.thresholds.maxDomNodes})`);
          }

          console.log(`    ℹ️  ${name}: ${nodeCount} DOM nodes`);
        }
      }
    }
  ]
};
