/* Oia landing, vanilla JS, no external libraries.
   Everything guards its elements, so this file is also safe on the
   content pages (templates/) that only need the download resolver. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Download: resolve the latest release asset for this machine ----
     Assets are version-named, so we ask the GitHub API for the latest
     release and pick the file by OS/arch. Fallback constant keeps direct
     links working offline. No build step, bump it on every release. */
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
      return d?.architecture || null; // 'arm64' | 'x86' | null
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
      note = `${ver} · ${target.label} · ${mb(target.size)}`;
    } else if (isMac()) {
      const a = await arch();
      if (a === 'x86') {
        note = `${ver} · no Intel-Mac build yet, see all releases`;
      } else {
        target = rel.macArm64 || fb('macArm64');
        note = `${ver} · ${target.label} · ${mb(target.size)}`;
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

  /* ---- Hero: the prompt types itself and the banner repaints with it ---- */
  const frame = document.getElementById('artFrame');
  const promptEl = document.querySelector('#heroPrompt');
  const rbtns = [...document.querySelectorAll('.rbtn')];
  const prompts = [
    { pre: 'milk tea flash sale, ', hi: '20% off', art: 'p20', hold: 2800 },
    { pre: 'same banner, ', hi: 'make it 30% today', art: 'p30', hold: 3600 },
  ];
  const setArt = (art) => {
    if (!frame) return;
    frame.classList.toggle('show-p30', art === 'p30');
    rbtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.art === art)));
  };
  rbtns.forEach((b) => b.addEventListener('click', () => { dead = true; setArt(b.dataset.art); }));

  let dead = false;
  if (promptEl && !reduced) {
    const staticFallback = promptEl.innerHTML; // any failure restores the shipped markup
    const caret = document.createElement('span'); caret.className = 'tw-caret';
    const preNode = document.createTextNode('');
    const em = document.createElement('em');
    let pi = 0;
    const schedule = (ms, fn) => setTimeout(() => {
      if (dead) return;
      try { fn(); } catch { dead = true; promptEl.innerHTML = staticFallback; }
    }, ms);
    const erase = () => {
      if (em.textContent) { em.textContent = em.textContent.slice(0, -1); return schedule(16, erase); }
      em.classList.remove('pop');
      if (preNode.data) { preNode.data = preNode.data.slice(0, -1); return schedule(12, erase); }
      pi = (pi + 1) % prompts.length;
      schedule(350, typePre);
    };
    const typeHi = () => {
      const p = prompts[pi];
      if (em.textContent.length < p.hi.length) {
        em.textContent += p.hi[em.textContent.length];
        return schedule(42, typeHi);
      }
      em.classList.add('pop');
      setArt(p.art);
      schedule(p.hold, erase);
    };
    const typePre = () => {
      const p = prompts[pi];
      if (preNode.data.length < p.pre.length) {
        preNode.data += p.pre[preNode.data.length];
        return schedule(30, typePre);
      }
      schedule(260, typeHi);
    };
    try {
      promptEl.textContent = '';
      promptEl.append(preNode, em, caret);
      schedule(900, typePre);
    } catch { promptEl.innerHTML = staticFallback; }
  }

  /* ---- Demo loop video: lazy, motion-safe, paused off-screen ---- */
  (() => {
    const v = document.querySelector('.demo-loop');
    if (!v || reduced) return; // reduced motion: the poster frame stays
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      v.addEventListener('error', () => { v.removeAttribute('src'); v.load(); }, { once: true });
      v.querySelectorAll('source').forEach((s) => {
        if (!s.src) s.src = s.dataset.srcWebm || s.dataset.srcMp4 || '';
      });
      v.load();
      v.play().catch(() => {});
    };
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) start();
      else if (started) v.pause();
    }, { rootMargin: '200px' });
    io.observe(v);
  })();

  /* ---- BA slider: drag the real repaint back and forth ---- */
  (() => {
    const ba = document.getElementById('ba');
    if (!ba) return;
    const handle = ba.querySelector('.ba-handle');
    const set = (pct) => {
      pct = Math.max(4, Math.min(96, pct));
      ba.style.setProperty('--x', pct + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    const fromEvent = (e) => {
      const r = ba.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    let dragging = false, activePointer = null;
    ba.addEventListener('pointerdown', (e) => {
      dragging = true; activePointer = e.pointerId;
      try { ba.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
      fromEvent(e);
    });
    ba.addEventListener('pointermove', (e) => { if (dragging && e.pointerId === activePointer) fromEvent(e); });
    ba.addEventListener('pointerup', (e) => { if (e.pointerId === activePointer) { dragging = false; activePointer = null; } });
    ba.addEventListener('pointercancel', (e) => { if (e.pointerId === activePointer) { dragging = false; activePointer = null; } });
    handle.addEventListener('keydown', (e) => {
      const cur = parseFloat(getComputedStyle(ba).getPropertyValue('--x')) || 50;
      if (e.key === 'ArrowLeft') { set(cur - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(cur + 4); e.preventDefault(); }
    });
    if (!reduced) { /* one gentle nudge on first view, teaches the drag */
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const nudge = (t) => {
          const k = Math.min(1, (t - t0) / 1200);
          const ease = 1 - Math.pow(1 - k, 3);
          set(50 + Math.sin(ease * Math.PI * 2) * 13);
          if (k < 1) requestAnimationFrame(nudge); else set(50);
        };
        requestAnimationFrame(nudge);
      }, { threshold: .35 });
      io.observe(ba);
    }
  })();

  /* ---- Generic reveals ---- */
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
