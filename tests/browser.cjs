/* Optional browser checks. No browser dependencies are needed to play the games.
 * PLAYWRIGHT_MODULE=/path/to/playwright-core CHROMIUM_PATH=/usr/bin/chromium node tests/browser.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

async function main() {
  // Serve under a subdirectory, like GitHub Pages, to catch absolute-path regressions.
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/PolytechGamesBackup/')) throw Error('Wrong base path');
      const file = path.resolve(root, decodeURIComponent(url.pathname.slice('/PolytechGamesBackup/'.length)) || 'index.html');
      if (!file.startsWith(root + path.sep)) throw Error('Outside project');
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    });
    const bases = process.env.BROWSER_SUITE === 'mobile' ? [] : [pathToFileURL(root + '/').href, `http://127.0.0.1:${server.address().port}/PolytechGamesBackup/`];
    for (const base of bases) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(15000);
      const errors = [], missing = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) missing.push(r.url()); });
      // Verify the games work offline, with optional Google Fonts unavailable.
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
      const go = file => page.goto(new URL(file, base).href);
      const visible = s => page.locator(s).first().waitFor({ state: 'visible' });
      const hidden = s => page.locator(s).waitFor({ state: 'hidden' });
      const exit = async s => { await page.locator(s).click(); await page.waitForURL(new URL('index.html', base).href); };
      const unchanged = async s => {
        const before = await page.locator(s).textContent();
        await page.waitForTimeout(1200);
        assert.equal(await page.locator(s).textContent(), before, `${s} changed while paused`);
      };

      await go('index.html');
      assert.equal(await page.locator('a.item').count(), 6);
      for (const image of await page.locator('img').all()) {
        assert.equal(await image.evaluate(img => img.complete && img.naturalWidth > 0), true);
      }
      await page.locator('a.item[href*="popov"]').click();
      await page.locator('#btn-start').click();
      await page.locator('#btn-menu').click();
      await visible('#menu');
      await page.waitForTimeout(2500);
      assert.equal(await page.locator('#day-card').evaluate(e => e.classList.contains('show')), true);
      await page.locator('#btn-resume').click();
      await hidden('#day-card');
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      const text = await page.locator('#dialog-text').textContent();
      await page.keyboard.press('Control');
      await page.waitForTimeout(600);
      assert.equal(await page.locator('#dialog-text').textContent(), text);
      await page.locator('#btn-resume').click();
      await page.locator('[data-ctl="skip"]').click();
      await visible('.card.show');
      await page.locator('[data-ctl="skip"]').click();
      await page.keyboard.press('Escape');
      await page.locator('#btn-to-title').click();
      await visible('#title-screen');
      await page.locator('#btn-start').click();
      await page.keyboard.press('Escape');
      await exit('#btn-exit');

      await go('games/skuf-fizruk.html');
      await page.locator('#startBtn').click();
      await page.keyboard.down('w');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await visible('#pauseScreen');
      assert.equal(await page.evaluate(() => keys.size), 0);
      await page.keyboard.up('w');
      await unchanged('#timer');
      await page.locator('#resumeBtn').click();
      assert.equal(await page.evaluate(() => state), 'playing');
      await page.evaluate(() => endGame());
      await page.locator('#restartBtn').click();
      assert.ok(await page.evaluate(() => timeLeft > 58));
      await page.keyboard.press('Escape');
      await exit('#exitBtn');

      await go('games/записывайте.html');
      await page.locator('#startBtn').click();
      await page.locator('#pauseBtn').click();
      await unchanged('#timerText');
      await page.locator('#resumeBtn').click();
      await hidden('#cardPause');
      await page.keyboard.press('Escape');
      await page.locator('#restartPauseBtn').click();
      assert.equal(await page.locator('#timerText').textContent(), '1:40');
      await page.keyboard.press('Escape');
      await exit('#exitBtn');

      await go('games/контр страйк 3.html');
      await page.locator('#vsBtn').click();
      await page.keyboard.down('w');
      await page.mouse.down();
      await page.evaluate(() => { mouseDX = 20; mouseDY = 10; window.dispatchEvent(new Event('blur')); });
      await visible('#pause');
      assert.deepEqual(await page.evaluate(() => [Object.keys(keys).length, shooting, aiming, mouseL, mouseDX, mouseDY]), [0, false, false, false, 0, 0]);
      const positions = await page.evaluate(() => players.map(p => [p.posX, p.posY]));
      await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(() => players.map(p => [p.posX, p.posY])), positions);
      await page.keyboard.up('w');
      await page.mouse.up();
      await page.locator('#resumeBtn').click();
      await page.waitForFunction(() => state === 'playing');
      await page.keyboard.press('Escape');
      await exit('#exitBtn');

      for (const file of ['index.html', 'dev.html']) {
        await go('games/zhan-na-grani/' + file);
        await page.getByRole('button', { name: /Начать пару/ }).click();
        await page.getByRole('button', { name: /Пропустить/ }).click();
        await visible('.hud');
        await page.keyboard.press('Escape');
        await visible('.pause-panel');
        await unchanged('.hud');
        await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
        await hidden('.pause-panel');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'В главное меню', exact: true }).click();
        await page.getByRole('button', { name: /Начать пару/ }).click();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'К списку игр', exact: true }).click();
        await page.waitForURL(new URL('index.html', base).href);
      }
      assert.deepEqual(errors, [], 'Browser errors');
      assert.deepEqual(missing, [], 'Missing resources');
      console.log(`PASS: catalog and five game lifecycles via ${base.startsWith('file:') ? 'file://' : 'HTTP subdirectory'}`);
      await page.close();
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await mobile.goto(pathToFileURL(path.join(root, 'games/popov/index.html')).href);
    await mobile.locator('#btn-start').tap();
    await mobile.locator('#day-card').waitFor({ state: 'hidden' });
    assert.ok(await mobile.locator('#dialog-text').evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 18));
    await mobile.locator('[data-ctl="skip"]').tap();
    await mobile.locator('.card.show').first().waitFor();
    await mobile.locator('[data-ctl="skip"]').tap();
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await mobile.setViewportSize(viewport);
      await mobile.waitForTimeout(250);
      const dimensions = await mobile.locator('.card').evaluateAll(cards => cards.map(c => {
        const r = c.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right, left: r.left };
      }));
      const cardPanel = await mobile.locator('#cards').boundingBox();
      assert.ok(cardPanel.height >= 76, 'At least one complete question card must fit');
      assert.ok(dimensions.every(r => r.height >= 44 && r.width <= viewport.width && r.left >= 0 && r.right <= viewport.width));
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await mobile.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `popov-${viewport.width}x${viewport.height}.png`) });
      }
    }
    await mobile.locator('.card').first().tap();
    await mobile.locator('#btn-menu').tap();
    await mobile.locator('#btn-resume').tap();
    console.log('PASS: Popov touch layout at 390×844, 320×568 and 844×390');
    await mobile.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
