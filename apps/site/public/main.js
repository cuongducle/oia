/* Oia landing, vanilla JS. Content pages reuse the guarded download resolver. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Version-named release assets require resolution. Keep the fallback in sync. */
  const REPO = 'cuongducle/oia';
  const RELEASES = `https://github.com/${REPO}/releases`;
  const FALLBACK = {
    tag: 'v0.6.1',
    macArm64: { name: 'Oia-0.6.1-arm64.dmg', size: 433574780, label: 'macOS (Apple Silicon)' },
    win: { name: 'Oia-0.6.1-win-x64.exe', size: 419234278, label: 'Windows 64-bit' },
  };
  const mb = (b) => (b ? `${Math.round(b / 1048576)} MiB` : '');
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const preferred = /Windows|Win32|Win64/i.test(platform) ? 'win'
    : /Mac/i.test(platform) && !(navigator.maxTouchPoints > 1) ? 'macArm64' : null;
  if (preferred) {
    document.querySelectorAll('a[data-dl]').forEach((link) => {
      const secondary = link.dataset.dl !== preferred;
      link.classList.toggle('btn-accent', !secondary);
      link.classList.toggle('btn-ghost', secondary);
    });
  }
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
    for (const key of ['macArm64', 'win']) {
      const target = rel[key] || FALLBACK[key];
      const tag = rel[key] ? rel.tag : FALLBACK.tag;
      const href = target.browser_download_url || `${RELEASES}/download/${tag}/${target.name}`;
      links.filter((link) => link.dataset.dl === key).forEach((link) => {
        link.href = href;
        link.title = `Download ${target.name}`;
      });
      const note = `${FALLBACK[key].label} · ${mb(target.size)} · ${tag}`;
      document.querySelectorAll(`[data-dl-ver="${key}"]`).forEach((el) => { el.textContent = note; });
    }
  })();

  /* The example stays readable; only a deliberate choice changes the artwork. */
  const frame = document.getElementById('artFrame');
  const buttons = [...document.querySelectorAll('.rbtn')];
  buttons.forEach((button) => button.addEventListener('click', () => {
    if (!frame) return;
    const repaint = button.dataset.art === 'p30';
    frame.classList.toggle('show-p30', repaint);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  }));

  const openLinkedDetails = () => {
    const hash = window.location?.hash;
    if (!hash) return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (target?.tagName === 'DETAILS') target.open = true;
  };
  openLinkedDetails();
  window.addEventListener('hashchange', openLinkedDetails);

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
