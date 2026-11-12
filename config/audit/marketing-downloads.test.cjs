const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(new URL('../../site/main.js', `file://${__filename}`), 'utf8');
async function resolveDownload(platform, release) {
  const link = {};
  const note = {};
  runInNewContext(source, {
    AbortController,
    setTimeout: () => 0,
    matchMedia: () => ({ matches: true }),
    navigator: { platform, userAgent: platform, maxTouchPoints: 0 },
    fetch: async () => {
      if (release === null) throw new Error('GitHub is unavailable');
      return { ok: true, json: async () => release };
    },
    document: {
      querySelectorAll: (selector) => selector === 'a[data-dl]' ? [link] : selector === '[data-dl-ver]' ? [note] : [],
      getElementById: () => null,
    },
    window: {},
  });
  await new Promise(setImmediate);
  return { link, note };
}

test('GitHub outage retains exact v0.6.1 filenames and verified sizes on both platforms', async () => {
  for (const [platform, name, size] of [
    ['MacIntel', 'Oia-0.6.1-arm64.dmg', '413'],
    ['Win32', 'Oia-0.6.1-win-x64.exe', '400'],
  ]) {
    const { link, note } = await resolveDownload(platform, null);
    assert.equal(link.href, `https://github.com/cuongducle/oia/releases/download/v0.6.1/${name}`);
    assert.match(note.textContent, new RegExp(`0\\.6\\.1.*${size} MiB`));
  }
});

test('a newer release missing the platform never mixes its tag with an old fallback filename', async () => {
  const { link, note } = await resolveDownload('Win32', { tag_name: 'v9.9.9', assets: [] });
  assert.equal(link.href, 'https://github.com/cuongducle/oia/releases/download/v0.6.1/Oia-0.6.1-win-x64.exe');
  assert.match(note.textContent, /^0\.6\.1/);
});

test('complete latest release resolves its real asset instead of pinning downloads to v0.6.1', async () => {
  const asset = { name: 'Oia-9.9.9-win-x64.exe', size: 104857600, browser_download_url: 'https://github.com/cuongducle/oia/releases/download/v9.9.9/Oia-9.9.9-win-x64.exe' };
  const { link, note } = await resolveDownload('Win32', { tag_name: 'v9.9.9', assets: [asset] });
  assert.equal(link.href, asset.browser_download_url);
  assert.match(note.textContent, /^9\.9\.9.*100 MiB/);
});

test('unsupported platforms keep the releases-page link instead of choosing a wrong installer', async () => {
  const { link, note } = await resolveDownload('Linux x86_64', null);
  assert.equal(link.href, undefined);
  assert.match(note.textContent, /macOS 13\+.*Windows 10\+/);
});
