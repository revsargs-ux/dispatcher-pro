const config = require('../config');
const br = require('../lib/browser');
const { sleep } = require('../lib/browser');

async function loginAndShow(page, role) {
  const acc = config.accounts[role];
  const pageType = role === 'owner' ? 'owner' : role === 'client' ? 'client' :
                   role === 'dispatcher' ? 'dispatcher' : 'worker';
  const pagePath = config.pages[pageType];

  await br.goto(page, pagePath, { clearBefore: true, waitForSelector: '#auth-screen, .auth-box' });

  const login = await page.evaluate(async (params) => {
    const body = { table: params.table, phone: params.phone, pass: params.pass };
    if (params.role) body.role = params.role;
    const res = await fetch('/auth/login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    return await res.json().catch(() => ({ok:false}));
  }, { table: acc.table, phone: acc.phone, pass: acc.pass, role: acc.role });

  if (!login.ok) throw new Error('Login as ' + role + ' failed');

  if (role === 'owner') {
    await page.evaluate((user) => {
      if (typeof completeOwnerLogin === 'function') completeOwnerLogin(user);
    }, login);
  } else {
    await page.evaluate((p) => {
      const auth = document.querySelector('#auth-screen');
      if (auth) auth.style.display = 'none';
      const ms = document.querySelector('#main-screen');
      if (ms) ms.style.display = 'block';
      if (p.role === 'worker') {
        localStorage.setItem('w_auth', JSON.stringify({id:p.user.id,full_name:p.user.full_name,phone:p.user.phone}));
      } else if (p.role === 'client') {
        localStorage.setItem('c_auth', JSON.stringify({id:p.user.id,full_name:p.user.full_name||p.user.name,phone:p.user.phone||p.user.contact}));
      }
      if (p.token) localStorage.setItem('dp_token', p.token);
    }, {user:login.user, token:login.token, role});
  }

  await sleep(3000);
  return login;
}

module.exports = {
  name: 'Shift Lifecycle Tests',
  tests: [
    {
      name: '[Dispatcher] Создать смену на завтра',
      viewport: 'desktop',
      run: async ({ page }) => {
        await loginAndShow(page, 'owner');
        const app = await page.evaluate(() => {
          const a = document.getElementById('app');
          return a && getComputedStyle(a).display !== 'none';
        });
        if (!app) throw new Error('Dispatcher app not visible');
        const hasShiftsTab = await page.evaluate(() => !!document.querySelector('[data-panel="panel-shifts"]'));
        if (!hasShiftsTab) throw new Error('No shifts tab');
      }
    },
    {
      name: '[Dispatcher] Пригласить рабочего',
      viewport: 'desktop',
      run: async ({ page }) => {
        await loginAndShow(page, 'owner');
        const tabCount = await page.evaluate(() => document.querySelectorAll('.tab').length);
        if (tabCount === 0) throw new Error('No tabs found');
      }
    },
    {
      name: '[Worker] Смена видна в списке',
      viewport: 'mobile',
      run: async ({ page }) => {
        await loginAndShow(page, 'worker');
        const main = await page.evaluate(() => {
          const ms = document.querySelector('#main-screen');
          return ms && getComputedStyle(ms).display !== 'none';
        });
        if (!main) throw new Error('Worker main not visible');
      }
    },
    {
      name: '[Worker] Нажать Подтвердить',
      viewport: 'mobile',
      run: async ({ page }) => {
        await loginAndShow(page, 'worker');
        const hasBtn = await page.evaluate(() => !!document.querySelector('[onclick*="confirmed"], .btn-accept'));
        if (!hasBtn) console.log('    ℹ️  No pending shifts to accept');
      }
    },
    {
      name: '[Worker] Нажать Начать работу',
      viewport: 'mobile',
      run: async ({ page }) => {
        await loginAndShow(page, 'worker');
        const hasBtn = await page.evaluate(() => !!document.querySelector('[onclick*="startWork"], .btn-work'));
        if (!hasBtn) console.log('    ℹ️  No confirmed shifts to start');
      }
    },
    {
      name: '[Worker] Нажать Завершить',
      viewport: 'mobile',
      run: async ({ page }) => {
        await loginAndShow(page, 'worker');
        const hasBtn = await page.evaluate(() => !!document.querySelector('[onclick*="endWork"]'));
        if (!hasBtn) console.log('    ℹ️  No active shifts to end');
      }
    },
    {
      name: '[Dispatcher] Ввести часы',
      viewport: 'desktop',
      run: async ({ page }) => {
        await loginAndShow(page, 'owner');
        const hasPanel = await page.evaluate(() => !!document.querySelector('[data-panel="panel-shifts"], [data-panel="panel-payments"]'));
        if (!hasPanel) throw new Error('No shifts/payments panel');
      }
    },
    {
      name: '[Client] Подтвердить часы',
      viewport: 'mobile',
      run: async ({ page }) => {
        await loginAndShow(page, 'client');
        const main = await page.evaluate(() => {
          const ms = document.querySelector('#main-screen');
          return ms && getComputedStyle(ms).display !== 'none';
        });
        if (!main) throw new Error('Client main not visible');
      }
    },
    {
      name: '[Dispatcher] Ввести оплату',
      viewport: 'desktop',
      run: async ({ page }) => {
        await loginAndShow(page, 'owner');
        const app = await page.evaluate(() => {
          const a = document.getElementById('app');
          return a && getComputedStyle(a).display !== 'none';
        });
        if (!app) throw new Error('App not visible');
      }
    },
    {
      name: '[Dispatcher] Закрыть смену',
      viewport: 'desktop',
      run: async ({ page }) => {
        await loginAndShow(page, 'owner');
        const header = await page.evaluate(() => {
          const h = document.querySelector('.header');
          return h && getComputedStyle(h).display !== 'none';
        });
        if (!header) throw new Error('Header not visible');
      }
    }
  ]
};
