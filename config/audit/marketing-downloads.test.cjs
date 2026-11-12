const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(new URL('../../apps/site/public/main.js', `file://${__filename}`), 'utf8');

async function resolveDownloads(release) {
  const links = [
    { dataset: { dl: 'macArm64' }, href: 'initial-mac' },
    { dataset: { dl: 'win' }, href: 'initial-win' },
  ];
  const notes = { macArm64: { textContent: '' }, win: { textContent: '' } };
  runInNewContext(source, {
    AbortController,
    setTimeout: () => 0,
    matchMedia: () => ({ matches: true }),
    navigator: {},
    fetch: async () => {
      if (release === null) throw new Error('GitHub is unavailable');
      return { ok: true, json: async () => release };
    },
    document: {
      querySelectorAll: (selector) => {
        if (selector === 'a[data-dl]') return links;
        for (const [key, el] of Object.entries(notes)) {
          if (selector === `[data-dl-ver="${key}"]`) return [el];
        }
        return [];
      },
      getElementById: () => null,
    },
    window: {},
  });
  await new Promise(setImmediate);
  return {
    mac: { href: links[0].href, note: notes.macArm64.textContent },
    win: { href: links[1].href, note: notes.win.textContent },
  };
}

test('GitHub outage keeps both platform buttons on exact v0.6.1 fallback files', async () => {
  const { mac, win } = await resolveDownloads(null);
  assert.equal(mac.href, 'https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-arm64.dmg');
  assert.equal(mac.note, 'macOS (Apple Silicon) · 413 MiB · v0.6.1');
  assert.equal(win.href, 'https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe');
  assert.equal(win.note, 'Windows 64-bit · 400 MiB · v0.6.1');
});

test('a complete newer release moves both buttons to its real assets', async () => {
  const release = {
    tag_name: 'v9.9.9',
    assets: [
      { name: 'Oia-9.9.9-arm64.dmg', size: 104857600, browser_download_url: 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-arm64.dmg' },
      { name: 'Oia-9.9.9-win-x64.exe', size: 209715200, browser_download_url: 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-win-x64.exe' },
    ],
  };
  const { mac, win } = await resolveDownloads(release);
  assert.equal(mac.href, 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-arm64.dmg');
  assert.match(mac.note, /^macOS \(Apple Silicon\) · 100 MiB · v9\.9\.9$/);
  assert.equal(win.href, 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-win-x64.exe');
  assert.match(win.note, /^Windows 64-bit · 200 MiB · v9\.9\.9$/);
});

test('a newer release missing one platform never mixes its tag into that fallback link', async () => {
  const release = {
    tag_name: 'v9.9.9',
    assets: [
      { name: 'Oia-9.9.9-arm64.dmg', size: 104857600, browser_download_url: 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-arm64.dmg' },
    ],
  };
  const { mac, win } = await resolveDownloads(release);
  assert.equal(mac.href, 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-arm64.dmg');
  assert.equal(win.href, 'https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe');
  assert.match(win.note, /v0\.6\.1$/);
});
