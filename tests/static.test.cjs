const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const entries = ['index.html', 'games/skuf-fizruk.html', 'games/записывайте.html', 'games/контр страйк 3.html', 'games/popov/index.html', 'games/zhan-na-grani/index.html', 'games/zhan-na-grani/dev.html', 'games/between-classes/index.html'];

test('catalog and game HTML reference existing local resources', () => {
  for (const name of entries) {
    const html = fs.readFileSync(path.join(root, name), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const [, link] of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
      if (/^(?:[a-z]+:|#|\/\/)/i.test(link)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), decodeURIComponent(link.split(/[?#]/)[0]))), `${name}: ${link}`);
    }
  }
});

test('inline and external game JavaScript parses', () => {
  for (const name of entries) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script, { filename: name });
  }
  for (const name of ['games/popov/game.js', 'games/popov/data.js', 'games/zhan-na-grani/src/game.js', 'games/zhan-na-grani/src/vendor/pixi.js', 'games/between-classes/game.js']) {
    new vm.Script(fs.readFileSync(path.join(root, name), 'utf8'), { filename: name });
  }
});

test('all Popov data resources exist and have valid WebP container headers', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'games/popov/data.js'), 'utf8'), context);
  function walk(value) {
    if (typeof value === 'string' && value.startsWith('assets/game/')) {
      const bytes = fs.readFileSync(path.join(root, 'games/popov', value));
      assert.ok(value.endsWith('.webp'), value);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  }
  walk(context.window.GAME_DATA);
});

test('standalone Zhan HTML and development entry match their checked-in sources', () => {
  execFileSync(process.env.PYTHON || 'python3', ['games/zhan-na-grani/tools/build.py', '--check'], { cwd: root });
});
