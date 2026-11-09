/* Oia landing, vanilla JS. Content pages reuse the guarded download resolver. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Version-named release assets require resolution. Keep the fallback in sync. */
  const REPO = 'cuongducle/oia';
  const RELEASES = `https://github.com/${REPO}/releases`;
  const FALLBACK = {
    tag: 'v0.4.0',
    macArm64: { name: 'Oia-0.4.0-arm64.dmg', size: 314929408, label: 'macOS (Apple Silicon)' },
    win: { name: 'Oia-0.4.0-win-x64.exe', size: 279846189, label: 'Windows 64-bit' },
  };
  const mb = (b) => (b ? `${Math.round(b / 1048576)} MB` : '');
  const isIPadOS = () =>
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMac = () => !isIPadOS() && /Mac/.test(navigator.platform || navigator.userAgent);
  const isWin = () => /Win/.test(navigator.platform || navigator.userAgent);
  const arch = async () => {
    try {
      const d = await navigator.userAgentData?.getHighEntropyValues?.(['architecture']);
      return d?.architecture || null;
    } catch { return null; }
  };
  const latestAssets = async () => {
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) return null;
      const j = await r.json();
      const by = (re) => j.assets.find((a) => re.test(a.name));
      return {
        tag: j.tag_name || FALLBACK.tag,
        macArm64: by(/arm64\.dmg$/) || null,
        win: by(/win-x64\.exe$/) || null,
      };
    } catch { return null; }
  };
  (async () => {
    const links = [...document.querySelectorAll('a[data-dl]')];
    if (!links.length) return;
    const rel = (await latestAssets()) || { tag: FALLBACK.tag, macArm64: null, win: null };
    const fb = (k) => ({
      ...FALLBACK[k],
      url: `${RELEASES}/download/${rel.tag || FALLBACK.tag}/${FALLBACK[k].name}`,
    });
    let target = null;
    let ver = (rel.tag || FALLBACK.tag).replace(/^v/, '');
    let note = '';
    if (isWin()) {
      target = rel.win || fb('win');
      note = `${ver} · ${FALLBACK.win.label} · ${mb(target.size)}`;
    } else if (isMac()) {
      const a = await arch();
      if (a === 'x86') {
        note = `${ver} · no Intel-Mac build yet, see all releases`;
      } else {
        target = rel.macArm64 || fb('macArm64');
        note = `${ver} · ${FALLBACK.macArm64.label} · ${mb(target.size)}`;
      }
    } else {
      note = `${ver} · macOS 13+ (Apple Silicon) / Windows 10+`;
    }
    if (target?.browser_download_url || target?.url) {
      const href = target.browser_download_url || target.url;
      links.forEach((l) => { l.href = href; l.title = `Download ${target.name}`; });
    }
    document.querySelectorAll('[data-dl-ver]').forEach((el) => { el.textContent = note; });
  })();

  /* The example stays readable; only a deliberate choice changes the artwork. */
  const frame = document.getElementById('artFrame');
  const promptEl = document.getElementById('heroPrompt');
  const buttons = [...document.querySelectorAll('.rbtn')];
  buttons.forEach((button) => button.addEventListener('click', () => {
    if (!frame) return;
    const repaint = button.dataset.art === 'p30';
    frame.classList.toggle('show-p30', repaint);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    if (promptEl) {
      const offer = document.createElement('em');
      offer.textContent = repaint ? '30% off' : '20% off';
      promptEl.replaceChildren(document.createTextNode('matcha campaign, '), offer);
    }
  }));

  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }
})();
