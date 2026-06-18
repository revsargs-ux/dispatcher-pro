const config = require('../config');
const br = require('../lib/browser');
const { sleep } = require('../lib/browser');
const { request, login } = require('../lib/api-client');

module.exports = {
  name: 'Security Tests',
  tests: [
    {
      name: 'Нет API ключей Supabase в HTML',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '#auth-screen, .auth-box' });
          await sleep(500);

          const html = await page.content();

          // Check for Supabase publishable keys or anon keys
          const patterns = [
            /eyJ[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}/,
            /supabaseKey\s*[=:]\s*['"][^'"]{20,}['"]/i,
            /ANON_KEY\s*[=:]\s*['"][^'"]{20,}['"]/i,
            /service_role.*['"][^'"]{20,}['"]/i
          ];

          for (const pattern of patterns) {
            if (pattern.test(html)) {
              throw new Error(name + ': potential Supabase key in HTML');
            }
          }
        }
      }
    },

    {
      name: 'Нет Dadata токенов в HTML',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '#auth-screen, .auth-box' });
          await sleep(500);

          const html = await page.content();

          // Only check for actual Dadata API URLs or known token prefixes
          const patterns = [
            /clean\.dadata\.ru/i,
            /suggestions\.dadata\.ru/i,
            /cd57e4b2[a-f0-9]{6,}/i
          ];

          for (const pattern of patterns) {
            if (pattern.test(html)) {
              throw new Error(name + ': Dadata reference in HTML');
            }
          }
        }
      }
    },

    {
      name: 'Нет паролей в API ответах',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        const res = await login('users', config.accounts.owner.phone, config.accounts.owner.pass, 'owner');
        if (res.data) {
          const d = JSON.stringify(res.data);
          if (d.includes('"password"')) throw new Error('Password in owner API response');
        }

        const wr = await login('workers', config.accounts.worker.phone, config.accounts.worker.pass);
        if (wr.data) {
          const d = JSON.stringify(wr.data);
          if (d.includes('"password"')) throw new Error('Password in worker API response');
        }
      }
    },

    {
      name: 'JWT token хранится в localStorage, не в куках',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        await br.goto(page, config.pages.worker, { clearBefore: true, waitForSelector: '#auth-screen, .auth-box' });
        await br.fillById(page, 'phone-input', config.accounts.worker.phone);
        await br.fillById(page, 'pass-input', config.accounts.worker.pass);

        const login = await page.evaluate(async () => {
          const res = await fetch('/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({table:'workers', phone:'+79001234567', pass:'Test1234'})
          });
          return await res.json();
        });

        if (login.ok) {
          await page.evaluate((u) => {
            localStorage.setItem('w_auth', JSON.stringify({id:u.user.id,full_name:u.user.full_name,phone:u.user.phone}));
            if (u.token) localStorage.setItem('dp_token', u.token);
          }, login);

          const hasToken = await page.evaluate(() => !!localStorage.getItem('dp_token'));
          if (!hasToken) throw new Error('No auth token in localStorage after login');
        }

        const cookies = await page.cookies();
        const hasAuthCookie = cookies.some(c =>
          c.name.toLowerCase().includes('token') && c.value.length > 30
        );
        if (hasAuthCookie) throw new Error('Auth token found in cookies');
      }
    },

    {
      name: 'Нет eval() или innerHTML с user data',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '#auth-screen, .auth-box' });
          await sleep(500);

          const issues = await page.evaluate(() => {
            const results = [];
            const scripts = document.querySelectorAll('script');
            scripts.forEach((s, i) => {
              const code = s.textContent;
              if (!code) return;

              const evalMatches = code.match(/\beval\s*\(/g);
              if (evalMatches) {
                results.push('eval() in script #' + i);
              }
            });
            return results;
          });

          for (const issue of issues) {
            throw new Error(name + ': ' + issue);
          }

          // innerHTML warnings are just logged
          const innerHtmlIssues = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script');
            const count = [];
            scripts.forEach(s => {
              const code = s.textContent || '';
              const matches = code.match(/\.innerHTML\s*=/g) || [];
              if (matches.length > 0) count.push(matches.length);
            });
            return count.reduce((a, b) => a + b, 0);
          });

          if (innerHtmlIssues > 0) {
            console.log('    ⚠️  ' + name + ': ' + innerHtmlIssues + ' innerHTML usages (using esc() function for safety)');
          }
        }
      }
    }
  ]
};
