(function initNotif() {
  const notif = document.getElementById('notifBtn');
  if (!notif) return;

  let collapseTimer = null;
  let ready = false;

  function ringBell() {
    notif.classList.remove('ring');
    void notif.offsetWidth;
    notif.classList.add('ring');
  }

  function collapse() {
    clearTimeout(collapseTimer);
    notif.classList.remove('expanded');
  }

  function expand(opts = {}) {
    clearTimeout(collapseTimer);
    if (!ready) return;

    notif.classList.add('expanded');
    ringBell();

    if (!opts.noAutoCollapse) {
      collapseTimer = setTimeout(collapse, (opts.holdMs ?? 2400) + 700);
    }
  }

  requestAnimationFrame(() => {
    notif.classList.add('show');
    ready = true;

    requestAnimationFrame(() => {
      setTimeout(() => expand({ holdMs: 4500 }), 1200);
    });
  });

  notif.addEventListener('mouseenter', () => {
    clearTimeout(collapseTimer);
    expand({ noAutoCollapse: true });
  });

  notif.addEventListener('mouseleave', () => {
    if (notif.classList.contains('expanded')) {
      collapseTimer = setTimeout(collapse, 300);
    }
  });

  notif.addEventListener('click', () => expand({ holdMs: 3000 }));

  notif.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      expand({ holdMs: 3000 });
    }
  });

  window._notifExpand = expand;
  window._notifCollapse = collapse;
})();

document.addEventListener('DOMContentLoaded', () => {
  const sequence = [
    { el: document.getElementById('animDivider'), delay: 340 },
    { el: document.getElementById('mainCard'), delay: 420 },
    { el: document.getElementById('customCard1'), delay: 460 },
    { el: document.getElementById('customCard2'), delay: 520 },
    { el: document.getElementById('extraLinkCard'), delay: 538 },
    { el: document.getElementById('fpsConverterCard'), delay: 575 },
    { el: document.getElementById('moreInfoDivider'), delay: 615 },
    { el: document.getElementById('injectBadge'), delay: 650 },
  ];

  sequence.forEach(({ el, delay }) => {
    if (!el) return;
    setTimeout(() => el.classList.add('visible'), delay);
  });

  document.querySelectorAll('.social-btn').forEach((btn, i) => {
    setTimeout(() => btn.classList.add('visible'), 660 + i * 85);
  });
});

(function initStars() {
  const TILE_H = 2000;
  const COL_W = 160;
  const LAYERS = [
    { prop: '--stars-1', size: 1,   count: 29, seed: 101 },
    { prop: '--stars-2', size: 1.5, count: 10, seed: 202 },
    { prop: '--stars-3', size: 2,   count: 5,  seed: 303 },
  ];
  const cache = LAYERS.map(() => []);

  function columnShadows(layer, col) {
    let seed = layer.seed + col * 7919;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) rnd();
    const span = Math.max(1, COL_W - Math.ceil(layer.size));
    const out = [];
    for (let i = 0; i < layer.count; i++) {
      const x = col * COL_W + Math.floor(rnd() * span);
      const y = Math.floor(rnd() * TILE_H);
      out.push(`${x}px ${y}px #fff`);
    }
    return out;
  }

  let cols = 0;
  function build() {
    const w = Math.max(320, document.documentElement.clientWidth || window.innerWidth || 320);
    const need = Math.ceil(w / COL_W);
    if (need <= cols) return;
    const root = document.documentElement.style;
    LAYERS.forEach((layer, li) => {
      for (let c = cols; c < need; c++) cache[li][c] = columnShadows(layer, c);
      root.setProperty(layer.prop, cache[li].flat().join(','));
    });
    cols = need;
  }

  build();
  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 120); });
})();