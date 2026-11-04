/* ---- Direct download: OS-detected installer, releases page as fallback ---- */
(() => {
  const V = "0.4.0";
  const BASE = `https://github.com/cuongducle/oia/releases/download/v${V}/`;
  const mac = navigator.userAgent.includes("Mac");
  const win = navigator.userAgent.includes("Windows");
  if (!mac && !win) return; // unknown OS: keep the releases-page link
  const file = mac ? `Oia-${V}-arm64.dmg` : `Oia-${V}-win-x64.exe`;
  document.querySelectorAll("a[data-dl]").forEach((a) => {
    a.href = BASE + file; // direct file — the browser handles the download
    a.title = `Download ${file}`;
  });
})();

/* activate motion styling only when GSAP actually loaded (CDN ok) */
if (!window.gsap){ document.documentElement.classList.remove('js'); }
else {
document.documentElement.classList.add('js');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 960px)').matches;

/* ---- Three.js film grain (Hermes teardown recipe) ---- */
(function grain(){
  if (reduced || !window.THREE) return;
  const cv = document.getElementById('grain-canvas');
  const renderer = new THREE.WebGLRenderer({canvas: cv, alpha:true});
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const mat = new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}},
    vertexShader:'void main(){gl_Position=vec4(position,1.0);}',
    fragmentShader:'uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uTime)*43758.5453);}void main(){vec2 c=gl_FragCoord.xy;float n=hash(c)*0.4+hash(c+vec2(1.0,0.0))*0.3+hash(c+vec2(0.0,1.0))*0.3;gl_FragColor=vec4(vec3(n),0.5);}'
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), mat));
  (function loop(t){ mat.uniforms.uTime.value = t*0.001; renderer.render(scene,cam); requestAnimationFrame(loop); })(0);
  addEventListener('resize',()=>renderer.setSize(innerWidth,innerHeight,false));
})();

/* ---- Ticker: clone the single HTML half for the seamless -50% loop ---- */
(() => {
  const track = document.querySelector('.ticker-track');
  if (track) [...track.children].forEach((c) => track.appendChild(c.cloneNode(true))); // full second half — the -50% loop needs it
})();

/* ---- Lenis smooth scroll + ScrollTrigger ---- */
if (window.Lenis && !reduced){
  const lenis = new Lenis({lerp:.1});
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t=>lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
}

gsap.registerPlugin(ScrollTrigger, Draggable);

/* ---- Hero entrance ---- */
if (!reduced){
  const split = new SplitType('.hero h1', {types:'chars'});
  gsap.from(split.chars, {yPercent:115, duration:.9, ease:'power4.out', stagger:.022, delay:.1});
  gsap.from('.board .tile, .board .chip', {opacity:0, scale:.88, duration:.8, ease:'back.out(1.6)', stagger:.07, delay:.5, clearProps:'opacity'});
  gsap.from('.arrow path', {strokeDasharray:200, strokeDashoffset:200, duration:.8, stagger:.15, delay:1.1, clearProps:'all'});
  gsap.from('.trust,.sub,.ctas', {opacity:0, y:16, duration:.7, stagger:.12, delay:.4});
}

/* ---- Draggable tiles: the product IS the demo ---- */
if (window.Draggable && !mobile){
  let top = 10;
  Draggable.create('.board .tile', {
    bounds:'#board',
    onDragStart(){
      this.target.style.zIndex = ++top + 20;
      this.target.classList.remove('drag-hint');
      gsap.fromTo(this.target, {scale:1}, {scale:1.04, duration:.18});
    },
    onDragEnd(){ gsap.to(this.target, {scale:1, duration:.25}); }
  });
}

/* ---- Scroll parallax: collage separates in depth ---- */
if (!reduced && !mobile){
  gsap.to('.t-festival', {yPercent:-16, ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
  gsap.to('.t-matcha',   {yPercent:-7,  ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
  gsap.to('.t-botanical',{yPercent:-22, ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
  gsap.to('.t-persp',    {yPercent:-28, ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
  gsap.to('.t-palette',  {yPercent:-12, ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
}

/* ---- Layers: pinned explode on scroll ---- */
if (!reduced && !mobile){
  const tl = gsap.timeline({
    scrollTrigger:{trigger:'#layers', start:'top top+=72', end:'+=55%', pin:true, scrub:.6}
  });
  tl.to('.card-photo', {x:-170, y:22, rotation:-8, scale:.96, ease:'power1.inOut'}, 0)
    .to('.card-copy',  {x:190, y:-84, rotation:6, borderColor:'rgba(124,92,255,1)', ease:'power1.inOut'}, 0);
  gsap.from('.c3', {opacity:0, y:12, stagger:.06, duration:.5, ease:'power2.out',
    scrollTrigger:{trigger:'.chips3', start:'top 92%'}});
} else {
  document.querySelector('.stack').classList.add('exploded');
}
/* exploded fallback styling (also end state target) */
const st = document.createElement('style');
st.textContent = '.stack.exploded .card-photo{transform:rotate(-6deg) translate(-120px,10px)} .stack.exploded .card-copy{transform:rotate(5deg) translate(150px,-60px);border-color:var(--accent)}';
document.head.appendChild(st);

/* ---- Custom cursor ---- */
(function cursor(){
  if (matchMedia('(pointer:coarse)').matches) return;
  const dot = document.getElementById('cdot'), ring = document.getElementById('cring');
  const dx = gsap.quickTo(dot,'x',{duration:.08}), dy = gsap.quickTo(dot,'y',{duration:.08});
  const rx = gsap.quickTo(ring,'x',{duration:.32,ease:'power3'}), ry = gsap.quickTo(ring,'y',{duration:.32,ease:'power3'});
  addEventListener('mousemove', e=>{ document.body.classList.add('cursor-on'); dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
  document.querySelectorAll('a,button,.tile,.ba').forEach(el=>{
    el.addEventListener('mouseenter',()=>ring.classList.add('big'));
    el.addEventListener('mouseleave',()=>ring.classList.remove('big'));
  });
})();

/* ---- Scroll progress bar ---- */
gsap.to('#progress',{scaleX:1,ease:'none',scrollTrigger:{trigger:document.body,start:'top top',end:'bottom bottom',scrub:.3}});

/* ---- Hero: idle float (images float inside draggable tiles, no drag conflict) ---- */
if (!reduced){
  document.querySelectorAll('.tile img, .t-persp .t1').forEach((el,i)=>{
    gsap.to(el,{y:gsap.utils.random(-9,-4),rotation:gsap.utils.random(-0.8,0.8),duration:gsap.utils.random(2.4,3.6),
      yoyo:true,repeat:-1,ease:'sine.inOut',delay:i*.3});
  });
}

/* ---- Hero: mouse parallax on UI chrome (chips/glow float; tiles stay draggable) ---- */
if (!reduced && !mobile){
  const board = document.querySelector('.board');
  const lay = [
    {el:'.chip-prompt',d:14},{el:'.chip-log',d:22},{el:'.arrow',d:10}
  ].map(o=>({...o,qx:gsap.quickTo(o.el,'x',{duration:.6}),qy:gsap.quickTo(o.el,'y',{duration:.6})}));
  board.addEventListener('mousemove',e=>{
    const r = board.getBoundingClientRect();
    const nx = (e.clientX-r.left)/r.width-.5, ny = (e.clientY-r.top)/r.height-.5;
    lay.forEach(o=>{ o.qx(nx*o.d*2); o.qy(ny*o.d); });
  });
  board.addEventListener('mouseleave',()=>lay.forEach(o=>{o.qx(0);o.qy(0);}));
}

/* ---- Section headlines drift (depth) ---- */
if (!reduced && !mobile){
  gsap.utils.toArray('section h2, .hero h1').forEach(h=>{
    gsap.fromTo(h,{xPercent:2.2},{xPercent:-2.2,ease:'none',
      scrollTrigger:{trigger:h,start:'top bottom',end:'bottom top',scrub:true}});
  });
}


/* ---- Editor frames: curtain + hover tilt ---- */
document.querySelectorAll('.editor-frame').forEach(ef=>{
  ScrollTrigger.create({trigger:ef,start:'top 85%',onEnter:()=>ef.classList.add('in'),once:true});
  if (!reduced && !mobile){
    ef.addEventListener('mousemove',e=>{
      const r = ef.getBoundingClientRect();
      gsap.to(ef,{rotationY:((e.clientX-r.left)/r.width-.5)*4,rotationX:-((e.clientY-r.top)/r.height-.5)*3,transformPerspective:1200,duration:.5});
    });
    ef.addEventListener('mouseleave',()=>gsap.to(ef,{rotationX:0,rotationY:0,duration:.7,ease:'elastic.out(1,.5)'}));
  }
});

/* ---- Workflow steps slide-in ---- */
if (!reduced){
  gsap.utils.toArray('.step').forEach((s,i)=>{
    gsap.from(s,{x:(i-1)*46,opacity:0,duration:.8,ease:'power3.out',
      scrollTrigger:{trigger:s,start:'top 86%'}});
  });
}

/* ---- Terminal: line-by-line boot ---- */
if (!reduced){
  const pre = document.querySelector('.term pre');
  if (pre){
    const rows = pre.innerHTML.trim().split('\n');
    pre.innerHTML = rows.map(r=>'<span class="trow" style="display:block">'+r+'</span>').join('');
    ScrollTrigger.create({trigger:'.term',start:'top 85%',once:true,onEnter:()=>{
      gsap.fromTo('.trow',{opacity:0,x:-10},{opacity:1,x:0,stagger:.55,duration:.35,ease:'power2.out'});
    }});
  }
}

/* ---- Hero prompt typewriter: the chip thinks in seller language ---- */
if (!reduced){
  const tw = document.querySelector('.chip-prompt .t');
  if (tw){
    const prompts = [
      {pre:'milk tea flash sale — ', hi:'20% off'},
      {pre:'halloween drop — ',      hi:'buy 2 get 1'},
      {pre:'livestream tonight — ',  hi:'free shipping'},
    ];
    const staticFallback = tw.innerHTML; // any failure restores the shipped markup — never a frozen half-word
    const caret = document.createElement('span'); caret.className = 'tw-caret';
    const preNode = document.createTextNode('');
    const em = document.createElement('em');
    let pi = 0, dead = false;
    const schedule = (ms, fn) => setTimeout(() => {
      if (dead) return;
      try { fn(); } catch { dead = true; tw.innerHTML = staticFallback; }
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
      if (em.textContent.length < p.hi.length){
        em.textContent += p.hi[em.textContent.length];
        return schedule(46, typeHi);
      }
      em.classList.add('pop');
      schedule(3000, erase);
    };
    const typePre = () => {
      const p = prompts[pi];
      if (preNode.data.length < p.pre.length){
        preNode.data += p.pre[preNode.data.length];
        return schedule(34, typePre);
      }
      schedule(260, typeHi);
    };
    try {
      tw.textContent = '';
      tw.append(preNode, em, caret);
      schedule(900, typePre);
    } catch { tw.innerHTML = staticFallback; }
  }
}

/* ---- Demo loop video: lazy, motion-safe, paused off-screen ---- */
(() => {
  const v = document.querySelector('.demo-loop');
  if (!v || reduced) return; // reduced motion: the poster frame stays, nothing autoplays
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
    try { ba.setPointerCapture(e.pointerId); } catch { /* pointer already released — move events still track */ }
    fromEvent(e);
  });
  ba.addEventListener('pointermove', (e) => { if (dragging && e.pointerId === activePointer) fromEvent(e); });
  ba.addEventListener('pointerup',    (e) => { if (e.pointerId === activePointer) { dragging = false; activePointer = null; } });
  ba.addEventListener('pointercancel',(e) => { if (e.pointerId === activePointer) { dragging = false; activePointer = null; } });
  handle.addEventListener('keydown', (e) => {
    // computed style — correct wherever --x lives (inline today, stylesheet tomorrow)
    const cur = parseFloat(getComputedStyle(ba).getPropertyValue('--x')) || 50;
    if (e.key === 'ArrowLeft')  { set(cur - 4); e.preventDefault(); }
    if (e.key === 'ArrowRight') { set(cur + 4); e.preventDefault(); }
  });
  if (!reduced){ /* one gentle nudge when it first scrolls into view — teaches the drag */
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
if (!reduced){
  gsap.utils.toArray('.reveal').forEach(el=>{
    gsap.to(el, {opacity:1, y:0, duration:.7, ease:'power2.out',
      scrollTrigger:{trigger:el, start:'top 88%'}});
  });
}

/* refresh all triggers after full load + fonts (pin spacers shift positions) */
addEventListener('load',()=>ScrollTrigger.refresh());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>ScrollTrigger.refresh());

}
