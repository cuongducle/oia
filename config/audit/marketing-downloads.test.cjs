const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(new URL('../../apps/site/public/main.js', `file://${__filename}`), 'utf8');

async function resolveDownloads(release, navigator = {}) {
  const makeLink = (platform) => {
    const classes = new Set(['btn', 'btn-accent']);
    return {
      dataset: { dl: platform }, href: `initial-${platform}`, classes,
      classList: { toggle: (name, active) => active ? classes.add(name) : classes.delete(name) },
    };
  };
  const links = [makeLink('macArm64'), makeLink('win')];
  const notes = { macArm64: { textContent: '' }, win: { textContent: '' } };
  runInNewContext(source, {
    AbortController,
    setTimeout: () => 0,
    matchMedia: () => ({ matches: true }),
    navigator,
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
    window: { addEventListener() {} },
  });
  await new Promise(setImmediate);
  return {
    mac: { href: links[0].href, note: notes.macArm64.textContent, primary: links[0].classes.has('btn-accent') },
    win: { href: links[1].href, note: notes.win.textContent, primary: links[1].classes.has('btn-accent') },
  };
}

test('platform emphasis survives GitHub outage without hiding either download', async () => {
  for (const [navigator, expected] of [
    [{ platform: 'MacIntel', maxTouchPoints: 0 }, [true, false]],
    [{ platform: 'Win32' }, [false, true]],
    [{ userAgentData: { platform: 'Windows' } }, [false, true]],
    [{ platform: 'MacIntel', maxTouchPoints: 5 }, [true, true]],
    [{ platform: 'Linux armv8l' }, [true, true]],
    [{}, [true, true]],
  ]) {
    const { mac, win } = await resolveDownloads(null, navigator);
    assert.deepEqual([mac.primary, win.primary], expected);
    assert.match(mac.href, /arm64\.dmg$/);
    assert.match(win.href, /win-x64\.exe$/);
  }
});

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
