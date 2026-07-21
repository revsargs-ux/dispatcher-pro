const puppeteer = require('puppeteer');
const config = require('../config');
const fs = require('fs');
const path = require('path');

/**
 * Launch a puppeteer browser instance
 */
async function launch() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--no-first-run'
    ],
    executablePath: undefined, // let puppeteer find it
    defaultViewport: null,
    timeout: config.timeouts.pageLoad
  });
  return browser;
}

/**
 * Create a new page with default settings
 */
async function newPage(browser, viewportName) {
  const page = await browser.newPage();

  const vp = config.viewports[viewportName] || config.viewports.desktop;
  await page.setViewport({ width: vp.width, height: vp.height });

  // Set reasonable defaults
  await page.setDefaultTimeout(config.timeouts.elementVisible);
  await page.setDefaultNavigationTimeout(config.timeouts.pageLoad);

  // Ignore cache for consistent tests
  await page.setCacheEnabled(false);

  // Collect console errors
  page._consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      page._consoleErrors.push(msg.text());
    }
  });

  // Collect network requests count
  page._networkRequests = 0;
  page.on('request', () => { page._networkRequests++; });

  return page;
}

/**
 * Enable check-version interception — returns the stub version so app doesn't reload.
 * Must be called BEFORE goto for pages that have check-version (owner, index).
 */
let _dpVerValue = 'test-version-e2e';

// Symbol key to store handler reference per page (avoid duplicate handlers)
const _intHandlerSym = Symbol('intHandlerSym');

async function interceptAppVersion(page, enabled) {
  const intercept = enabled === undefined ? true : enabled;
  // Remove previous handler if any (prevent duplicate listeners)
  const oldHandler = page[_intHandlerSym];
  if (oldHandler) {
    page.off('request', oldHandler);
    page[_intHandlerSym] = null;
  }
  if (!intercept) {
    await page.setRequestInterception(false);
    return;
  }
  const handler = (req) => {
    if (req.url().includes('/app-version')) {
      try { req.respond({ status: 200, contentType: 'text/plain', body: _dpVerValue }); } catch(e) {}
    } else {
      try { req.continue(); } catch(e) {}
    }
  };
  page[_intHandlerSym] = handler;
  page.on('request', handler);
  await page.setRequestInterception(true);
}

/**
 * Navigate to a page and wait for load
 */
async function goto(page, path, options = {}) {
  const url = config.baseUrl + path;
  const waitUntil = options.waitUntil || 'domcontentloaded';
  
  // Always ensure /app-version interception is active (harmless for pages without check-version)
  if (!page[_intHandlerSym]) {
    await interceptAppVersion(page, true);
  }
  
  // Go to about:blank first to clear any JS state
  if (options.clearBefore) {
    await page.goto('about:blank').catch(() => {});
    // Clear storage for the target origin via CDP (works before navigating there)
    const client = await page.target().createCDPSession();
    try {
      await client.send('Storage.clearDataForOrigin', {
        origin: config.baseUrl,
        storageTypes: 'all'
      });
    } catch(e) { /* fallback: clear on target page after goto */ }
    // Now navigate to app page (clean state, _dp_ver=null → check-version skips reload)
    await page.goto(url, { waitUntil, timeout: config.timeouts.pageLoad });
    if (options.waitForSelector) {
      const selectors = options.waitForSelector.split(',').map(s => s.trim());
      await page.waitForFunction((sels) => {
        return sels.some(s => !!document.querySelector(s));
      }, { timeout: options.timeout || 10000 }, selectors);
    }
    return;
  }
  
  // Normal navigation
  await page.goto(url, { waitUntil, timeout: config.timeouts.pageLoad });
  
  // Small settle time
  await new Promise(r => setTimeout(r, 200));
  
  if (options.waitForSelector) {
    const selectors = options.waitForSelector.split(',').map(s => s.trim());
    await page.waitForFunction((sels) => {
      return sels.some(s => !!document.querySelector(s));
    }, { timeout: options.timeout || 10000 }, selectors);
  }
}

/**
 * Fill an input by selector and value
 */
async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 5000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 30 });
}

/**
 * Fill an input by ID
 */
async function fillById(page, id, value) {
  await fill(page, '#' + id, value);
}

/**
 * Click an element and wait
 */
async function click(page, selector, options = {}) {
  await page.waitForSelector(selector, { visible: true, timeout: 5000 });
  await page.click(selector, options);
  if (options.waitFor) {
    await page.waitForSelector(options.waitFor, { visible: true, timeout: options.timeout || 5000 });
  }
}

/**
 * Click by onclick function name (for inline onclick handlers)
 */
async function clickByFunc(page, funcName) {
  const handle = await page.evaluateHandle((fn) => {
    const el = document.querySelector(`[onclick*="${fn}"]`);
    return el;
  }, funcName);
  const element = handle.asElement();
  if (element) {
    await element.click();
  } else {
    throw new Error(`Element with onclick="${funcName}" not found`);
  }
}

/**
 * Wait for a specific text to appear on the page
 */
async function waitForText(page, text, timeout = 5000) {
  await page.waitForFunction(
    (searchText) => document.body.innerText.includes(searchText),
    { timeout },
    text
  );
}

/**
 * Wait for element to be visible
 */
async function waitForVisible(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { visible: true, timeout });
}

/**
 * Check if element exists
 */
async function exists(page, selector) {
  const el = await page.$(selector);
  return !!el;
}

/**
 * Check if text is present on the page
 */
async function hasText(page, text) {
  return page.evaluate((searchText) => document.body.innerText.includes(searchText), text);
}

/**
 * Get element text
 */
async function getText(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  return page.evaluate(el => el.textContent, el);
}

/**
 * Clear localStorage and sessionStorage
 */
async function clearStorage(page) {
  await page.evaluate(() => {
    // Keep _dp_ver to avoid infinite reload loop (app checks & reloads)
    const ver = localStorage.getItem('_dp_ver');
    localStorage.clear();
    if (ver) localStorage.setItem('_dp_ver', ver);
    sessionStorage.clear();
  });
}

/**
 * Take a screenshot (for error or baseline)
 */
async function screenshot(page, name) {
  const dir = config.screenshotDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/**
 * Take a baseline snapshot
 */
async function snapshot(page, name) {
  const dir = config.snapshotDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filepath = path.join(dir, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

/**
 * Login as a specific role through the UI
 */
async function loginAs(page, role) {
  const account = config.accounts[role];
  const pagePath = role === 'dispatcher' ? config.pages.dispatcher : 
                   role === 'owner' ? config.pages.owner :
                   role === 'worker' ? config.pages.worker : config.pages.client;

  await goto(page, pagePath, { waitForSelector: '.auth-box' });
  await clearStorage(page);
  await goto(page, pagePath, { waitForSelector: '.auth-box' });

  // Determine input IDs based on page
  const phoneId = (role === 'worker' || role === 'client') ? 'phone-input' : 'auth-phone';
  const passId = (role === 'worker' || role === 'client') ? 'pass-input' : 'auth-pass';
  const loginFunc = (role === 'worker' || role === 'client') ? 'login()' : 'doLogin()';

  await fillById(page, phoneId, account.phone);
  await fillById(page, passId, account.pass);
  
  // Click login button
  const loginBtn = await page.$(`[onclick*="${loginFunc.replace('()', '')}"]`);
  if (loginBtn) {
    await loginBtn.click();
  } else {
    // Fallback: find button in auth-box
    const btn = await page.$('.auth-box button');
    if (btn) await btn.click();
  }

  // Wait for navigation/main screen
  await page.waitForFunction(
    () => {
      const authScreen = document.querySelector('.auth-screen');
      return !authScreen || getComputedStyle(authScreen).display === 'none';
    },
    { timeout: 10000 }
  ).catch(() => {});

  // Give time for data to load
  await sleep(2000);
}

/**
 * Close browser safely
 */
async function close(browser) {
  if (browser) {
    try { await browser.close(); } catch (e) {}
  }
}

/**
 * Sleep/wait helper (replaces deprecated page.waitForTimeout)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  launch,
  sleep,
  newPage,
  goto,
  fill,
  fillById,
  click,
  clickByFunc,
  waitForText,
  waitForVisible,
  exists,
  hasText,
  getText,
  clearStorage,
  screenshot,
  snapshot,
  loginAs,
  interceptAppVersion,
  close
};
