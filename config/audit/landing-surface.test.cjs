const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { fileURLToPath } = require('node:url');

const source = readFileSync(new URL('../../apps/site/public/main.js', `file://${__filename}`), 'utf8');

function builtPages() {
  const dist = fileURLToPath(new URL('../../apps/site/dist/', `file://${__filename}`));
  const pages = [];
  (function walk(directory, relative) {
    for (const entry of readdirSync(directory)) {
      if (statSync(`${directory}/${entry}`).isDirectory()) walk(`${directory}/${entry}`, `${relative}${entry}/`);
      else if (entry.endsWith('.html')) pages.push(`${relative}${entry}`.replace(/index\.html$/, ''));
    }
  })(dist, '/');
  return pages;
}

test('every built page shares one top bar; only the landing pair carries the language switch', () => {
  const pages = builtPages().filter(path => path !== '/404.html');
  assert.ok(pages.length >= 25, `expected the built site to keep growing, saw ${pages.length} pages`);
  const withSwitch = [];
  for (const path of pages) {
    const file = path.endsWith('/') ? `${path}index.html` : path;
    const html = readFileSync(fileURLToPath(new URL(`../../apps/site/dist${file}`, `file://${__filename}`)), 'utf8');
    assert.match(html, /<nav[^>]*class="[^"]*siteNav/, `${path}: no shared nav`);
    for (const needle of ['templates/', 'blog/', '#product', '#faq', 'href="#download"']) {
      assert.ok(html.includes(needle), `${path}: nav/link drift, missing ${needle}`);
    }
    const download = html.match(/<a class="btn btn-accent" href="#download">([^<]+)<\/a>/);
    assert.ok(['Download', 'Tải ứng dụng'].includes(download?.[1]), `${path}: unexpected nav CTA ${download?.[1]}`);
    if (html.includes('language-switch')) withSwitch.push(path);
  }
  assert.deepEqual(withSwitch.sort(), ['/', '/vi/'], 'language switch belongs to the landing pair only');
});

test('blog posts build with article metadata and land in the sitemap', () => {
  const posts = ['change-sale-price-without-redesigning', 'livestream-overlay-safe-zones', 'tet-sale-banner-checklist'];
  const sitemap = readFileSync(fileURLToPath(new URL('../../apps/site/dist/sitemap.xml', `file://${__filename}`)), 'utf8');
  assert.ok(sitemap.includes('https://oia.solutions/blog/'));
  for (const slug of posts) {
    const html = readFileSync(fileURLToPath(new URL(`../../apps/site/dist/blog/${slug}/index.html`, `file://${__filename}`)), 'utf8');
    assert.ok(html.includes(`rel="canonical" href="https://oia.solutions/blog/${slug}/"`));
    assert.ok(html.includes('"@type":"BlogPosting"'));
    assert.ok(html.includes('data-dl="macArm64"') && html.includes('main.js'));
    assert.ok(sitemap.includes(`https://oia.solutions/blog/${slug}/`));
  }
});

test('EN and VI builds preserve their locale, relative base and direct downloads without JavaScript', () => {
  for (const [locale, path, base, label] of [
    ['en', 'index.html', '', 'Download for Windows'],
    ['vi', 'vi/index.html', '../', 'Tải cho Windows'],
  ]) {
    const html = readFileSync(new URL(`../../apps/site/dist/${path}`, `file://${__filename}`), 'utf8');
    assert.match(html, new RegExp(`<html lang="${locale}"`));
    assert.ok(html.includes(`rel="canonical" href="https://oia.solutions/${locale === 'vi' ? 'vi/' : ''}"`));
    for (const [language, route] of [['en', ''], ['vi', 'vi/'], ['x-default', '']]) {
      assert.ok(html.includes(`hreflang="${language}" href="https://oia.solutions/${route}"`));
    }
    assert.ok(html.includes(`src="${base}main.js"`));
    assert.ok(html.includes(`href="${base}visual-landing.css"`));
    assert.ok(html.includes(`src="${base}assets/template-walkthrough-${locale}.vtt"`));
    assert.ok(html.includes(label));
    for (const platform of ['macArm64', 'win']) {
      const links = [...html.matchAll(new RegExp(`<a[^>]+data-dl="${platform}"[^>]*>`, 'g'))];
      assert.equal(links.length, 2);
      links.forEach(([anchor]) => assert.match(anchor, /href="https:\/\/github.com\/cuongducle\/oia\/releases\/download\/[^"\s]+\.(?:dmg|exe)"/));
    }
    assert.equal((html.match(/class="download-details"/g) || []).length, 2);
    assert.ok(!html.includes('id="cost-faq" open'));
    assert.ok(html.includes('id="workflow"'));
  }
});

test('saved-artwork controls switch images and selection without network requests', () => {
  const frameClasses = new Set();
  const buttons = ['p20', 'p30'].map(art => ({ dataset: { art }, addEventListener(_, fn) { this.click = fn; }, setAttribute(name, value) { this[name] = value; } }));
  runInNewContext(source, {
    matchMedia: () => ({ matches: true }), navigator: {}, window: { addEventListener() {} },
    AbortController, setTimeout: () => 0,
    fetch: () => { throw new Error('Saved comparison must not call AI or a server'); },
    document: {
      querySelectorAll: selector => selector === '.rbtn' ? buttons : [],
      getElementById: id => id === 'artFrame' ? { classList: { toggle(name, active) { active ? frameClasses.add(name) : frameClasses.delete(name); } } } : null,
    },
  });
  buttons[1].click();
  assert.ok(frameClasses.has('show-p30'));
  assert.equal(buttons[1]['aria-pressed'], 'true');
  buttons[0].click();
  assert.ok(!frameClasses.has('show-p30'));
  assert.equal(buttons[1]['aria-pressed'], 'false');
});

test('direct FAQ and developer links open their disclosures; malformed fragments do not crash', () => {
  const cost = { tagName: 'DETAILS', open: false };
  const developer = { tagName: 'DETAILS', open: false };
  const location = { hash: '#cost-faq' };
  let hashchange;
  runInNewContext(source, {
    matchMedia: () => ({ matches: true }), navigator: {}, AbortController, setTimeout: () => 0,
    document: { querySelectorAll: () => [], getElementById: id => ({ 'cost-faq': cost, oss: developer })[id] || null },
    window: { location, addEventListener(_, fn) { hashchange = fn; } },
  });
  assert.equal(cost.open, true);
  assert.equal(developer.open, false);
  location.hash = '#oss';
  hashchange();
  assert.equal(developer.open, true);
  location.hash = '#%E0%A4';
  assert.doesNotThrow(() => hashchange());
  location.hash = '#missing';
  assert.doesNotThrow(() => hashchange());
});
