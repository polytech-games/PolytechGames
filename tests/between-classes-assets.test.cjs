const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../games/between-classes/assets/walk');

test('every walking character has a readable RGBA PNG sprite sheet', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'generation-prompts.json'), 'utf8'));
  const ids = manifest.outputs.map(item => item.id);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8);
  for (const id of ids) {
    const bytes = fs.readFileSync(path.join(root, `${id}.png`));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), id);
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', id);
    assert.ok(bytes.readUInt32BE(16) >= 3 * 128, `${id}: sheet width`);
    assert.ok(bytes.readUInt32BE(20) >= 4 * 128, `${id}: sheet height`);
    assert.equal(bytes[24], 8, `${id}: expected 8-bit channels`);
    assert.equal(bytes[25], 6, `${id}: transparency requires RGBA`);
  }
});
