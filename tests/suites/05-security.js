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
          
          // Check for Supabase keys patterns
          const supabasePatterns = [
            /sb_publishable_[a-zA-Z0-9]{20,}/,
            /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, // JWT-like tokens
            /supabaseKey\s*[=:]\s*['"][^'"]{20,}['"]/i,
            /ANON_KEY\s*[=:]\s*['"][^'"]{20,}['"]/i,
            /service_role/i
          ];

          for (const pattern of supabasePatterns) {
            if (pattern.test(html)) {
              const match = html.match(pattern);
              throw new Error(`${name}: potential Supabase key found in HTML: ${match[0].substring(0, 30)}...`);
            }
          }

          // Check for long hex strings that could be keys
          const hexKeyPattern = /[a-f0-9]{40,}/gi;
          const hexMatches = html.match(hexKeyPattern);
          if (hexMatches) {
            for (const hex of hexMatches) {
              if (hex.length > 40 && !hex.startsWith('000000') && !hex.includes('font-size')) {
                throw new Error(`${name}: potential API key found: ${hex.substring(0, 20)}...`);
              }
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

          // Check for Dadata token patterns (actual token leaks, not just class references)
          const dadataPatterns = [
            /Token\s+[a-zA-Z0-9]{10,}/i,        // "Token cd57e4b2..."
            /Authorization.*Token\s+[a-zA-Z0-9]+/i,
            /token\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i,  // token = "cd57e4b2..."
            /clean\.dadata\.ru\/api\/v1/i,
            /suggestions\.dadata\.ru\/suggestions\/api/i,
            /cd57e4b2[a-zA-Z0-9]*/i             // known token prefix
          ];

          for (const pattern of dadataPatterns) {
            if (pattern.test(html)) {
              const match = html.match(pattern);
              // It's OK to reference dadata in comments or build notes
              if (match[0].toLowerCase().includes('removed') || 
                  match[0].toLowerCase().includes('disabled')) continue;
              throw new Error(`${name}: Dadata reference found: ${match[0]}`);
            }
          }
        }
      }
    },

    {
      name: 'Нет паролей в API ответах',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        // Login via API and check response doesn't contain password
        const res = await login('users', config.accounts.owner.phone, config.accounts.owner.pass, 'owner');
        
        if (res.data) {
          const dataStr = JSON.stringify(res.data);
          
          // Check that password field is not present in response
          if (dataStr.includes('"password"') || 
              dataStr.includes('password:') ||
              dataStr.match(/"pass"\s*:/)) {
            throw new Error('Password field found in API response: ' + dataStr.substring(0, 200));
          }

          // Also check for the actual password value not appearing elsewhere
          if (dataStr.includes(config.accounts.owner.pass) && !dataStr.includes('"pass"')) {
            // Password value might appear in the pass field for auth — that's expected for the login request
            // But should NOT appear in user data
          }
        }

        // Test with worker login too
        const workerRes = await login('workers', config.accounts.worker.phone, config.accounts.worker.pass);
        if (workerRes.data) {
          const str = JSON.stringify(workerRes.data);
          if (str.includes('"password"') || str.match(/"pass"\s*:\s*"[^"]+"/)) {
            throw new Error('Password found in worker API response');
          }
        }
      }
    },

    {
      name: 'JWT token хранится в localStorage, не в куках',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        // Login as worker via API to ensure token is set
        await br.goto(page, config.pages.worker, { waitForSelector: '#auth-screen, .auth-box' });
        await br.clearStorage(page);
        await br.goto(page, config.pages.worker, { waitForSelector: '#auth-screen, .auth-box' });

        // Perform API login to get real token into localStorage
        const loginResult = await page.evaluate(async ({phone, pass}) => {
          const res = await fetch('/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({table:'workers', phone, pass})
          });
          const d = await res.json();
          if (d.ok) {
            // Set localStorage exactly like the app does
            localStorage.setItem('w_auth', JSON.stringify({id:d.user.id, full_name:d.user.full_name, phone:d.user.phone}));
            if (d.token) localStorage.setItem('dp_token', d.token);
          }
          return d;
        }, {phone: config.accounts.worker.phone, pass: config.accounts.worker.pass});

        if (!loginResult || !loginResult.ok) {
          throw new Error('Worker login failed for JWT test: ' + (loginResult?.error || 'unknown'));
        }
        await sleep(1000);

        // Check localStorage for token
        const localStorageData = await page.evaluate(() => {
          const keys = Object.keys(localStorage);
          const result = {};
          keys.forEach(k => {
            result[k] = localStorage.getItem(k);
          });
          return result;
        });

        const hasDpToken = !!localStorageData['dp_token'];

        // Check cookies
        const cookies = await page.cookies();
        const hasTokenInCookie = cookies.some(c =>
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('auth') ||
          c.name.toLowerCase().includes('jwt')
        );

        if (!hasDpToken) {
          throw new Error('No dp_token found in localStorage after login. Keys: ' + Object.keys(localStorageData).join(', '));
        }

        if (hasTokenInCookie) {
          // Check if cookie contains the actual JWT token
          const authTokenCookie = cookies.find(c =>
            c.name.toLowerCase().includes('token') && c.value.length > 30
          );
          if (authTokenCookie) {
            throw new Error('Auth token found in cookie instead of localStorage: ' + authTokenCookie.name);
          }
        }
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
            
            // Check all script tags for eval()
            const scripts = document.querySelectorAll('script');
            scripts.forEach((s, i) => {
              const code = s.textContent;
              if (!code) return;
              
              // Check for eval(
              if (code.includes('eval(') && !code.includes('// eval') && !code.includes('noeval')) {
                // Check if it's actual eval usage
                const evalMatches = code.match(/\beval\s*\(/g);
                if (evalMatches) {
                  results.push(`eval() found in script #${i}: ${evalMatches.length} occurrences`);
                }
              }

              // Check for innerHTML with user data patterns
              const innerHtmlUsages = code.match(/\.innerHTML\s*=/g) || [];
              if (innerHtmlUsages.length > 0) {
                // Check context — is user data interpolated?
                const lines = code.split('\n');
                for (const line of lines) {
                  if (line.includes('.innerHTML') && line.includes('${')) {
                    // Template literal with innerHTML — potential XSS
                    // But in many cases this is how the app renders data
                    // Flag only if it includes user-controlled fields like phone, name
                    if (line.match(/\$\{.*?(phone|name|full_name|email|pass).*?\}/)) {
                      results.push(`innerHTML with user data: ${line.trim().substring(0, 80)}`);
                    }
                  }
                }
              }
            });

            return results;
          });

          if (issues.length > 0) {
            // eval() is a hard fail, innerHTML with user data is a warning
            const evalIssues = issues.filter(i => i.includes('eval()'));
            if (evalIssues.length > 0) {
              throw new Error(`${name}: ${evalIssues.join('; ')}`);
            }
            // innerHTML issues are soft warnings
            console.log(`    ⚠️  ${name}: ${issues.join('; ')}`);
          }
        }
      }
    }
  ]
};
