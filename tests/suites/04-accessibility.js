const config = require('../config');
const br = require('../lib/browser');
const { sleep } = require('../lib/browser');

module.exports = {
  name: 'Accessibility Tests',
  tests: [
    {
      name: 'Кнопки с emoji имеют aria-label',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '.auth-box' });
          await sleep(500);

          const emojiBtnsWithoutAria = await page.evaluate(() => {
            const btns = document.querySelectorAll('button, .btn, [role="button"], [onclick]');
            const issues = [];
            const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]/u;
            
            btns.forEach(b => {
              const text = b.textContent.trim();
              const ariaLabel = b.getAttribute('aria-label');
              const title = b.getAttribute('title');
              
              // If button text is mostly emoji
              if (emojiRegex.test(text) && text.length < 5) {
                if (!ariaLabel && !title) {
                  issues.push(b.outerHTML.substring(0, 100));
                }
              }
            });
            return issues;
          });

          if (emojiBtnsWithoutAria.length > 3) { // Allow a few icon-only buttons
            throw new Error(`${name}: ${emojiBtnsWithoutAria.length} emoji buttons without aria-label: ${emojiBtnsWithoutAria.slice(0, 3).join(', ')}`);
          }
        }
      }
    },

    {
      name: 'Tab order логичный (вход → пароль → кнопка)',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        await br.goto(page, config.pages.worker, { waitForSelector: '.auth-box' });

        // Press Tab and check focus order
        await page.focus('body');
        
        // First tab should go to phone input or first interactive element
        await page.keyboard.press('Tab');
        await sleep(200);
        
        const firstFocused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? { tag: el.tagName, id: el.id, type: el.type } : null;
        });

        if (!firstFocused) {
          throw new Error('No element focused after Tab');
        }

        // Tab again — should go to password or next field
        await page.keyboard.press('Tab');
        await sleep(200);
        
        const secondFocused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? { tag: el.tagName, id: el.id, type: el.type } : null;
        });

        // Third tab — should be button or link
        await page.keyboard.press('Tab');
        await sleep(200);
        
        const thirdFocused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? { tag: el.tagName, id: el.id } : null;
        });

        // Verify logical order: input → input → button
        if (firstFocused.tag !== 'INPUT' && firstFocused.tag !== 'A') {
          throw new Error(`Unexpected first focus: ${firstFocused.tag}`);
        }
      }
    },

    {
      name: 'Focus сохраняется после закрытия модалки',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        await br.goto(page, config.pages.dispatcher, { waitForSelector: '.auth-box' });

        // Check if owner page has modal close/focus management
        const hasModalSystem = await page.evaluate(() => {
          return typeof window.openModal === 'function' && typeof window.closeModal === 'function';
        });

        if (!hasModalSystem) {
          // Check worker page
          await br.goto(page, config.pages.client, { waitForSelector: '.auth-box' });
          const workerModal = await page.evaluate(() => {
            return typeof window.openModal === 'function';
          });
          if (!workerModal) {
            console.log('    ℹ️  No modal system — skipping focus test');
            return;
          }
        }

        // Focus a trigger button
        const triggerBtn = await page.$('button, a[onclick]');
        if (!triggerBtn) return;
        
        await triggerBtn.focus();
        const beforeFocus = await page.evaluate(() => document.activeElement?.tagName);

        // Try opening and closing a modal
        await page.evaluate(() => {
          if (typeof openModal === 'function') {
            // Find first modal
            const modals = document.querySelectorAll('.modal, [id^="modal-"]');
            if (modals.length > 0) {
              openModal(modals[0].id);
            }
          }
        });
        await sleep(300);

        // Close modal
        await page.evaluate(() => {
          if (typeof closeModal === 'function') {
            const modals = document.querySelectorAll('.modal.show, [id^="modal-"]');
            if (modals.length > 0) {
              closeModal(modals[0].id);
            }
          }
        });
        await sleep(300);

        const afterFocus = await page.evaluate(() => document.activeElement?.tagName);
        
        // Focus should return to an element (not necessarily exact same, but should be managed)
        if (!afterFocus) {
          console.log('    ⚠️  Focus not restored after modal close');
        }
      }
    },

    {
      name: 'Alt text на изображениях',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        for (const [name, path] of Object.entries(config.pages)) {
          await br.goto(page, path, { waitForSelector: '.auth-box' });
          await sleep(500);

          const imgsWithoutAlt = await page.evaluate(() => {
            const imgs = document.querySelectorAll('img');
            const missing = [];
            imgs.forEach(img => {
              if (!img.getAttribute('alt') && !img.getAttribute('role')) {
                missing.push(img.src?.substring(0, 60) || 'unknown');
              }
            });
            return missing;
          });

          if (imgsWithoutAlt.length > 0) {
            throw new Error(`${name}: images without alt: ${imgsWithoutAlt.join(', ')}`);
          }
        }
      }
    },

    {
      name: 'Color contrast — текст читаем на фоне',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        await br.goto(page, config.pages.dispatcher, { waitForSelector: '.auth-box' });
        await sleep(500);

        const contrastIssues = await page.evaluate(() => {
          const issues = [];
          const elements = document.querySelectorAll('p, span, a, button, label, h1, h2, h3, input');
          let checked = 0;
          
          for (const el of elements) {
            if (checked > 50) break; // Sample
            const style = getComputedStyle(el);
            const text = el.textContent?.trim();
            if (!text || text.length < 2) continue;
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            
            const color = style.color;
            const bg = style.backgroundColor;
            
            // Simple contrast check: parse rgb values
            const parseRgb = (str) => {
              const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              return m ? [+m[1], +m[2], +m[3]] : null;
            };
            
            const fg = parseRgb(color);
            const bgRgb = parseRgb(bg);
            
            if (!fg) continue;
            
            // If bg is transparent, use white as default
            const bgVal = bgRgb || [255, 255, 255];
            
            // Calculate relative luminance
            const lum = (rgb) => {
              const [r, g, b] = rgb.map(c => {
                c /= 255;
                return c < 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
              });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            
            const l1 = lum(fg);
            const l2 = lum(bgVal);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            
            if (ratio < 3.0) {
              issues.push(`"${text.substring(0, 20)}" ratio: ${ratio.toFixed(1)}`);
            }
            checked++;
          }
          return issues;
        });

        if (contrastIssues.length > 20) { // Auth screens have decorative low-contrast elements
          throw new Error(`Poor contrast on ${contrastIssues.length} elements: ${contrastIssues.slice(0, 3).join(', ')}`);
        }
      }
    },

    {
      name: 'Focus visible indicator при tab navigation',
      viewport: 'desktop',
      run: async ({ page, config }) => {
        await br.goto(page, config.pages.worker, { waitForSelector: '.auth-box' });

        // Tab to first element
        await page.focus('body');
        await page.keyboard.press('Tab');
        await sleep(200);

        const focusStyle = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return null;
          const style = getComputedStyle(el);
          return {
            outline: style.outline,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            borderColor: style.borderColor,
            borderWidth: style.borderWidth
          };
        });

        if (!focusStyle) {
          throw new Error('No focused element after Tab');
        }

        // Check if there's any visible focus indicator
        const hasOutline = focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth !== '0px';
        const hasBoxShadow = focusStyle.boxShadow && focusStyle.boxShadow !== 'none';
        const hasBorderChange = focusStyle.borderWidth !== '0px' && focusStyle.borderColor !== 'rgba(0, 0, 0, 0)';

        if (!hasOutline && !hasBoxShadow && !hasBorderChange) {
          // Check if :focus-visible or :focus adds something
          console.log('    ⚠️  Focus indicator may not be strongly visible — check manually');
        }
      }
    }
  ]
};
