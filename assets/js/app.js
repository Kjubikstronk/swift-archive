/* ═══════════════════════════════════════════════════════════════════════
   SWIFT ARCHIVE — runtime
   Renders everything from data/site.json, which the scheduled build rewrites.
   No framework: the page is exactly as old as the data it draws.
   ═══════════════════════════════════════════════════════════════════════ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Trim the catalogue boilerplate nobody wants to read on a card. */
const tidy = (t = '') =>
  t
    .replace(/\s*[-–—]\s*(Single|EP)$/i, '')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim() || t;

const fmtDate = (iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts) : '';

const dotted = (iso) => (iso ? iso.replace(/-/g, '.') : '');

const relative = (iso) => {
  if (!iso) return '';
  // floor, not round — rounding labelled anything past midday as "yesterday".
  const days = Math.floor((Date.now() - new Date(iso + 'T00:00:00')) / 864e5);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const y = (days / 365.25).toFixed(1).replace(/\.0$/, '');
  return `${y} years ago`;
};

/**
 * Cap a long list and add a "Show all" toggle. Collapsed items get `hidden`
 * so they stay out of tab order and the accessibility tree until revealed.
 */
function collapse(container, keep, label) {
  const items = [...container.children];
  if (items.length <= keep) return;

  const hide = (on) => items.forEach((el, i) => { if (i >= keep) el.hidden = on; });
  hide(true);

  const bar = document.createElement('div');
  bar.className = 'more';
  bar.innerHTML = `
    <button type="button" aria-expanded="false">
      <span>Show all ${items.length} ${esc(label)}</span>
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
    </button>
    <span class="more__line"></span>`;

  const btn = bar.querySelector('button');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    hide(open);
    btn.setAttribute('aria-expanded', String(!open));
    btn.querySelector('span').textContent = open
      ? `Show all ${items.length} ${label}`
      : 'Show less';
    if (open) container.scrollIntoView({ block: 'nearest' });
  });

  container.after(bar);
}

/* ─── boot ───────────────────────────────────────────────────────────── */

let DATA = null;

async function boot() {
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    console.error('Could not load data/site.json —', err);
    $$('[data-eras], [data-latest], [data-disco], [data-videos], [data-news], [data-timeline]')
      .forEach((el) => {
        el.innerHTML = '<p class="empty">Data unavailable — run <code>node build.js</code>, then reload.</p>';
      });
    return;
  }

  renderHero();
  renderEras();
  renderLatest();
  renderDiscography();
  renderCats();
  renderVideos();
  renderNews();
  renderTour();
  renderTimeline();
  renderFacts();
  renderFooter();

  initReveal();
  initAnchorReveal();
  initNav();
  initEraTakeover();
  initErasCollapse();
  initSparkles();
}

/* ─── hero ───────────────────────────────────────────────────────────── */

function renderHero() {
  const { latest, stats, generated } = DATA;

  if (latest?.art) {
    const img = $('[data-hero-art]');
    img.src = latest.art;
    img.addEventListener('load', () => img.classList.add('is-in'), { once: true });
    if (img.complete) img.classList.add('is-in');
  }

  const cells = [
    ['Eras', stats.eraCount, ''],
    ['Years in', stats.yearsSinceDebut, '+'],
    ['Releases', stats.releaseCount, ''],
    ['Cats', (DATA.cats || []).length, ''],
  ];

  $('[data-stats]').innerHTML = cells
    .map(([label, value, sup]) =>
      `<div><dd>${esc(value)}${sup ? `<span>${sup}</span>` : ''}</dd><dt>${esc(label)}</dt></div>`
    )
    .join('');

  const stamp = generated ? new Date(generated) : null;
  if (stamp) {
    $('[data-generated]').textContent =
      `updated ${relative(stamp.toISOString().slice(0, 10))}`;
    $('[data-generated-full]').textContent =
      `Last rebuild — ${stamp.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   THE ERAS
   ═══════════════════════════════════════════════════════════════════════ */

function renderEras() {
  const eras = DATA.eras || [];
  const host = $('[data-eras]');
  if (!eras.length) return void (host.innerHTML = '<p class="empty">No eras found.</p>');

  // Oldest first reads as a journey; the data arrives newest-first.
  const ordered = [...eras].reverse();

  host.innerHTML = ordered
    .map((e, i) => {
      const p = e.palette || {};
      const n = String(i + 1).padStart(2, '0');
      const swatches = [p.accent, p.glow, p.dim]
        .filter(Boolean)
        .map((c) => `<i style="background:${esc(c)}"></i>`)
        .join('');

      return `
      <article class="era" id="era-${esc(e.id)}" data-era="${esc(e.id)}"
               style="--era-accent:${esc(p.accent || 'currentColor')};--era-glow:${esc(p.glow || 'currentColor')}">
        <figure class="era__art">
          ${e.art ? `<img src="${esc(e.art)}" alt="${esc(e.name)} album cover" loading="lazy" decoding="async" width="1400" height="1400">` : ''}
        </figure>
        <div>
          <p class="era__no">Era ${n} / ${ordered.length}</p>
          <h3 class="era__name">${esc(e.name)}</h3>
          <p class="era__year">${esc(e.year)}</p>
          <p class="era__blurb">${esc(e.blurb || '')}</p>
          <div class="era__meta">
            ${e.trackCount ? `<span class="chip">${e.trackCount} tracks</span>` : ''}
            ${e.counts?.total ? `<span class="chip">${e.counts.total} releases</span>` : ''}
            ${e.url ? `<a class="chip" href="${esc(e.url)}" target="_blank" rel="noopener">Listen ↗</a>` : ''}
          </div>
          <div class="era__swatches" aria-hidden="true">${swatches}</div>
        </div>
      </article>`;
    })
    .join('');
}

/**
 * Swap the page's colour tokens as each era scrolls through the middle band
 * of the viewport. Six custom properties change; every rule that references
 * them follows automatically, which is why nothing else hardcodes a colour.
 */
function initEraTakeover() {
  const eras = DATA.eras || [];
  if (!eras.length || !('IntersectionObserver' in window)) return;

  const byId = new Map(eras.map((e) => [e.id, e]));
  const root = document.documentElement;

  const apply = (era) => {
    const p = era?.palette;
    if (!p) return;
    for (const [k, v] of Object.entries(p)) root.style.setProperty(`--${k}`, v);
    root.dataset.era = era.id;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
  };

  const io = new IntersectionObserver(
    (entries) => {
      // Whichever era occupies most of the band wins, so a fast scroll doesn't
      // leave the page tinted by whatever happened to fire last.
      const best = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) apply(byId.get(best.target.dataset.era));
    },
    { rootMargin: '-42% 0px -42% 0px', threshold: [0, 0.5, 1] }
  );

  $$('.era').forEach((el) => io.observe(el));

  // Above the rail no era intersects, so the page kept whichever palette fired
  // last — the hero rendered in Showgirl orange. An IntersectionObserver alone
  // doesn't fix it: it only fires on threshold *crossings*, so a page restored
  // mid-scroll and then scrolled to the top never gets an event. Checking the
  // scroll position directly is deterministic.
  const HOME = {
    bg: '#12172E', surface: '#1C2240', ink: '#ECEDFB',
    dim: '#A9AEDA', accent: '#7B7FD4', glow: '#A8ADFF',
  };
  const rail = $('#eras');
  if (!rail) return;

  let atHome = null;
  const checkHome = () => {
    const home = window.scrollY < rail.offsetTop - innerHeight * 0.5;
    if (home === atHome) return;
    atHome = home;
    if (home) apply({ id: 'home', palette: HOME });
  };

  addEventListener('scroll', checkHome, { passive: true });
  checkHome();
}

/**
 * On mobile, all twelve eras stacked ran to 8-10 screens before the page
 * reached anything else. Collapse behind a "Show all" toggle there — the
 * full scroll-through-every-era experience stays intact above 560px, where
 * scrolling through all twelve *is* the point of the page.
 *
 * Gated on the same 560px breakpoint the mobile era CSS already uses, and
 * re-evaluated on resize/rotate so a phone turned sideways past that width
 * gets the full rail without a reload.
 */
function initErasCollapse() {
  const rail = $('[data-eras]');
  if (!rail) return;

  const KEEP = 3;
  const mq = matchMedia('(max-width: 560px)');
  const items = () => [...rail.children];

  let bar = null;
  let expanded = false;

  const paint = () => {
    const els = items();
    const collapsedNow = mq.matches && !expanded;
    els.forEach((el, i) => { el.hidden = collapsedNow && i >= KEEP; });
    if (bar) bar.hidden = !mq.matches || els.length <= KEEP;
  };

  const ensureBar = () => {
    if (bar) return;
    const total = items().length;
    if (total <= KEEP) return;

    bar = document.createElement('div');
    bar.className = 'more';
    bar.innerHTML = `
      <button type="button" aria-expanded="false">
        <span>Show all ${total} eras</span>
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
      </button>
      <span class="more__line"></span>`;

    const btn = bar.querySelector('button');
    btn.addEventListener('click', () => {
      expanded = !expanded;
      paint();
      btn.setAttribute('aria-expanded', String(expanded));
      btn.querySelector('span').textContent = expanded ? 'Show less' : `Show all ${total} eras`;
      if (!expanded) rail.scrollIntoView({ block: 'nearest' });
    });

    // A rail child, not a sibling after it — that way the grid's own `gap`
    // spaces it consistently with the era cards instead of stacking its own
    // top margin on top of the gap.
    rail.appendChild(bar);
  };

  ensureBar();
  // Belt and braces: MediaQueryList's own 'change' event is the spec-correct
  // trigger and fires on real device rotation, but a plain window resize is
  // the more reliably-dispatched signal across environments (this browser
  // pane's own resize tool doesn't fire an mql 'change' event, only 'resize').
  // paint() re-reads mq.matches fresh each time, so either firing is enough.
  mq.addEventListener('change', paint);
  addEventListener('resize', paint, { passive: true });
  paint();
}

/* ─── latest ─────────────────────────────────────────────────────────── */

function renderLatest() {
  const r = DATA.latest;
  const host = $('[data-latest]');
  if (!r) return void (host.innerHTML = '<p class="empty">No release found.</p>');

  const fresh = (Date.now() - new Date(r.date + 'T00:00:00')) / 864e5 < 120;

  host.innerHTML = `
    <article class="latest__card">
      <div class="latest__art">
        ${fresh ? '<span class="badge">New</span>' : ''}
        <img src="${esc(r.art)}" alt="${esc(tidy(r.title))} cover art"
             width="1400" height="1400" fetchpriority="high" decoding="async">
      </div>
      <div>
        <p class="mono">${esc(fmtDate(r.date))} · ${esc(relative(r.date))}</p>
        <h3 class="latest__title">${esc(tidy(r.title))}</h3>
        <div class="era__meta">
          <span class="chip">${esc(r.kind || 'Release')}</span>
          ${r.trackCount ? `<span class="chip">${r.trackCount} track${r.trackCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        ${r.url ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">Listen<span aria-hidden="true">↗</span></a>` : ''}
      </div>
    </article>`;
}

/* ─── discography ────────────────────────────────────────────────────── */

function renderDiscography() {
  const releases = DATA.releases || [];
  $('[data-disco-count]').textContent = releases.length;

  const host = $('[data-disco]');
  host.innerHTML = releases
    .map(
      (r) => `
      <a class="rel" href="${esc(r.url || '#')}" target="_blank" rel="noopener" data-kind="${esc(r.kind)}">
        <div class="rel__art">
          <img src="${esc(r.artSmall || r.art)}" alt="${esc(tidy(r.title))} cover art"
               width="600" height="600" loading="lazy" decoding="async">
        </div>
        <h3 class="rel__title">${esc(tidy(r.title))}</h3>
        <p class="rel__year">${esc(dotted(r.date))}</p>
      </a>`
    )
    .join('');

  // Filtering and collapsing both want to own visibility, so one function
  // derives it from (activeKind, expanded). Letting each toggle `hidden`
  // independently made them undo one another.
  const CAP = 12;
  const bar = $('[data-filters]');
  const kinds = ['All', ...new Set(releases.map((r) => r.kind))];
  let activeKind = 'All';
  let expanded = false;

  bar.innerHTML = kinds
    .map((k, i) => `<button type="button" data-kind="${esc(k)}" aria-pressed="${i === 0}">${esc(k)}</button>`)
    .join('');

  const more = document.createElement('div');
  more.className = 'more';
  more.innerHTML = `
    <button type="button" aria-expanded="false">
      <span></span>
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
    </button>
    <span class="more__line"></span>`;
  host.after(more);

  const btn = more.querySelector('button');
  const btnLabel = btn.querySelector('span');

  const apply = () => {
    const cards = [...host.children];
    const matching = cards.filter((c) => activeKind === 'All' || c.dataset.kind === activeKind);
    cards.forEach((c) => { c.hidden = true; });
    (expanded ? matching : matching.slice(0, CAP)).forEach((c) => { c.hidden = false; });
    more.hidden = matching.length <= CAP;
    btn.setAttribute('aria-expanded', String(expanded));
    btnLabel.textContent = expanded ? 'Show less' : `Show all ${matching.length} releases`;
  };

  btn.addEventListener('click', () => {
    expanded = !expanded;
    apply();
    if (!expanded) host.scrollIntoView({ block: 'nearest' });
  });

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    activeKind = b.dataset.kind;
    expanded = false;
    $$('button', bar).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });

  apply();
}

/* ─── cats ───────────────────────────────────────────────────────────── */

/**
 * Hand-illustrated, not photographed. There's no legitimately free-to-use
 * photo of a celebrity's pet — every real image is press or Instagram
 * content, which is both a copyright problem and a fragile one (hotlinked
 * press photos vanish; this project's whole premise is that nothing here
 * breaks on its own). Vector art is also just less generic than the
 * paw-emoji placeholder this replaced.
 *
 * Each cat gets a distinct expression tied to their actual reputation: Olivia
 * bright and forward-facing (the one in the music videos), Meredith turned
 * three-quarters away with heavy-lidded eyes ("hates having her picture
 * taken" is a real Taylor quote), Benjamin mid-wink with a tongue-out blep.
 */
const CAT_PORTRAITS = {
  'Olivia Benson': `
    <svg viewBox="0 0 200 200" role="img" aria-label="Illustrated portrait of Olivia Benson, a cream Scottish Fold with bright amber eyes and a small pink collar">
      <defs>
        <radialGradient id="obFur" cx="50%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#F8E6C4"/>
          <stop offset="100%" stop-color="#D9B689"/>
        </radialGradient>
      </defs>
      <path d="M42 160 Q100 130 158 160 L166 200 L34 200 Z" fill="#E4C79A"/>
      <path d="M70 168 Q100 180 130 168 L128 178 Q100 188 72 178 Z" fill="#FF6B9D"/>
      <path d="M100 178 l6 10 l-6 6 l-6 -6 Z" fill="#FFE66D"/>
      <ellipse cx="64" cy="58" rx="16" ry="13" fill="#E4C79A" transform="rotate(-14 64 58)"/>
      <ellipse cx="136" cy="58" rx="16" ry="13" fill="#E4C79A" transform="rotate(14 136 58)"/>
      <circle cx="100" cy="106" r="60" fill="url(#obFur)"/>
      <ellipse cx="68" cy="122" rx="11" ry="6.5" fill="#E2A0A8" opacity="0.28"/>
      <ellipse cx="132" cy="122" rx="11" ry="6.5" fill="#E2A0A8" opacity="0.28"/>
      <circle cx="76" cy="104" r="12" fill="#C98A2E"/>
      <circle cx="76" cy="104" r="6" fill="#2B2117"/>
      <circle cx="72.5" cy="99.5" r="2.6" fill="#FFFFFF"/>
      <circle cx="80" cy="108" r="1.3" fill="#FFE66D"/>
      <circle cx="124" cy="104" r="12" fill="#C98A2E"/>
      <circle cx="124" cy="104" r="6" fill="#2B2117"/>
      <circle cx="120.5" cy="99.5" r="2.6" fill="#FFFFFF"/>
      <circle cx="128" cy="108" r="1.3" fill="#FFE66D"/>
      <path d="M94 128 Q100 123 106 128 Q100 134 94 128 Z" fill="#E2A0A8"/>
      <path d="M86 134 Q94 141 100 134 Q106 141 114 134" fill="none" stroke="#B98A5E" stroke-width="2" stroke-linecap="round"/>
      <g stroke="#B98A5E" stroke-width="1.4" opacity="0.55" stroke-linecap="round">
        <path d="M58 120 L26 112"/><path d="M58 128 L26 130"/>
        <path d="M142 120 L174 112"/><path d="M142 128 L174 130"/>
      </g>
      <path d="M40 50 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" fill="#FFE66D" opacity="0.9"/>
      <path d="M162 66 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#7FD8FF" opacity="0.85"/>
    </svg>`,

  'Meredith Grey': `
    <svg viewBox="0 0 200 200" role="img" aria-label="Illustrated portrait of Meredith Grey, a silver tabby Scottish Fold, turned away from the camera with half-closed eyes">
      <defs>
        <radialGradient id="mgFur" cx="42%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#C7CDD2"/>
          <stop offset="100%" stop-color="#8E959C"/>
        </radialGradient>
      </defs>
      <g transform="rotate(-5 100 100)">
        <path d="M46 158 Q100 132 154 158 L162 200 L38 200 Z" fill="#9AA1A8"/>
        <ellipse cx="66" cy="60" rx="15" ry="12" fill="#9BA3AA" transform="rotate(-18 66 60)"/>
        <ellipse cx="128" cy="56" rx="13" ry="10" fill="#9BA3AA" transform="rotate(14 128 56)"/>
        <circle cx="100" cy="108" r="58" fill="url(#mgFur)"/>
        <path d="M78 78 Q86 62 94 78" fill="none" stroke="#6E747C" stroke-width="3" stroke-linecap="round"/>
        <path d="M94 78 Q100 66 106 78" fill="none" stroke="#6E747C" stroke-width="3" stroke-linecap="round"/>
        <path d="M106 78 Q114 62 122 78" fill="none" stroke="#6E747C" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="72" cy="122" rx="10" ry="6" fill="#C98FA0" opacity="0.18"/>
        <ellipse cx="128" cy="122" rx="10" ry="6" fill="#C98FA0" opacity="0.18"/>
        <ellipse cx="78" cy="107" rx="9" ry="6" fill="#8E9B6E"/>
        <circle cx="75" cy="107" r="3.6" fill="#2B2E31"/>
        <circle cx="73" cy="104" r="1.4" fill="#F4F1EA" opacity="0.85"/>
        <path d="M68 101 Q78 94 88 100" fill="#8E959C"/>
        <ellipse cx="122" cy="105" rx="7" ry="5" fill="#8E9B6E"/>
        <circle cx="120" cy="105" r="2.8" fill="#2B2E31"/>
        <path d="M116 100 Q122 95 129 99" fill="#8E959C"/>
        <path d="M96 126 Q100 122 104 126 Q100 131 96 126 Z" fill="#C98FA0"/>
        <path d="M88 132 Q94 138 100 132 Q106 138 112 132" fill="none" stroke="#6E747C" stroke-width="2" stroke-linecap="round"/>
        <g stroke="#F4F1EA" stroke-width="1.4" opacity="0.7" stroke-linecap="round">
          <path d="M62 122 L30 116"/><path d="M62 128 L30 130"/>
          <path d="M138 120 L170 114"/><path d="M138 126 L170 128"/>
        </g>
      </g>
    </svg>`,

  'Benjamin Button': `
    <svg viewBox="0 0 200 200" role="img" aria-label="Illustrated portrait of Benjamin Button, a cream Ragdoll with seal-brown ears and blue eyes, mid-wink with his tongue out">
      <defs>
        <radialGradient id="bbFur" cx="50%" cy="30%" r="78%">
          <stop offset="0%" stop-color="#FBF4E6"/>
          <stop offset="72%" stop-color="#EFE4CF"/>
          <stop offset="100%" stop-color="#6B4A3A"/>
        </radialGradient>
      </defs>
      <path d="M40 162 Q100 128 160 162 L168 200 L32 200 Z" fill="#EFE4CF"/>
      <path d="M52 66 Q46 30 78 40 Q84 58 70 76 Q58 78 52 66 Z" fill="#6B4A3A" transform="rotate(-6 62 55)"/>
      <path d="M148 62 Q156 24 122 36 Q116 56 130 74 Q142 76 148 62 Z" fill="#6B4A3A" transform="rotate(8 138 50)"/>
      <path d="M62 40 l-4 -10 M70 36 l2 -11 M78 40 l6 -9" stroke="#8A6650" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="100" cy="110" r="60" fill="url(#bbFur)"/>
      <circle cx="76" cy="108" r="10" fill="#6FB8E0"/>
      <circle cx="76" cy="108" r="5" fill="#22303A"/>
      <circle cx="73" cy="104" r="2.2" fill="#FFFFFF"/>
      <path d="M114 106 Q124 100 134 106" fill="none" stroke="#3C2A20" stroke-width="3" stroke-linecap="round"/>
      <path d="M95 130 Q100 125 105 130 Q100 136 95 130 Z" fill="#A5674C"/>
      <path d="M88 136 Q94 143 100 136 Q106 143 112 136" fill="none" stroke="#8A6650" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="100" cy="144" rx="4" ry="5" fill="#F2A0A8"/>
      <g stroke="#8A6650" stroke-width="1.4" opacity="0.6" stroke-linecap="round">
        <path d="M60 124 L28 114"/><path d="M62 132 L30 138"/>
        <path d="M140 122 L172 110"/><path d="M138 130 L170 136"/>
      </g>
    </svg>`,
};

/* Personality-matched hues from the site's fixed rainbow tokens (--r1…--r6),
   not the scroll-driven era accent — a cat's spotlight colour shouldn't
   repaint every time the eras rail cycles past a new palette. */
const CAT_GLOW = {
  'Olivia Benson': 'var(--r2)',   // spotlight gold — she's the famous one
  'Meredith Grey': 'var(--r6)',   // moody violet — private, camera-shy
  'Benjamin Button': 'var(--r4)', // fresh green — the playful youngest
};

const slugify = (s = '') =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Instagram's embed renders a fixed header-photo-footer stack, and the
 * footer's height depends entirely on how long that post's caption is — a
 * longer caption pushes the photo into a smaller fraction of the total card,
 * so the one-size-fits-all crop that centres cleanly on a short-caption post
 * lands on background for a long-caption one. Each real post needs its own
 * vertical offset, calibrated once by eye; it doesn't drift afterward, since
 * Instagram renders the same fixed-width layout regardless of our own
 * container size.
 */
const IG_OFFSET = {
  'Meredith Grey': '-32%', // longer caption, more footer — window shifted up
};

const igOffset = (name) =>
  IG_OFFSET[name] ? `--ig-ty:${esc(IG_OFFSET[name])}` : '';

function renderCats() {
  const cats = DATA.cats || [];
  const host = $('[data-cats]');
  if (!cats.length) return void (host.innerHTML = '<p class="empty">No cats. Unacceptable.</p>');

  // Magazine-spread layout: one feature profile, two supporting mentions.
  // Whoever is flagged goes first regardless of curated.json's own order.
  const ordered = [...cats].sort((a, b) => (b.feature ? 1 : 0) - (a.feature ? 1 : 0));

  host.innerHTML = ordered
    .map((c) => {
      const portrait = CAT_PORTRAITS[c.name] || '';
      const glow = CAT_GLOW[c.name] || 'var(--glow)';
      return `
      <article class="cat${c.feature ? ' cat--feature' : ''}" style="--cat-glow:${esc(glow)}">
        <div class="cat__frame" data-cat-slug="${esc(slugify(c.name))}" style="${igOffset(c.name)}">${portrait}</div>
        <h3 class="cat__name">${esc(c.name)}</h3>
        ${c.caption ? `<p class="cat__caption">${esc(c.caption)}</p>` : ''}
        <p class="cat__meta">${esc(c.breed)} · since ${esc(c.since)}</p>
        <p class="cat__note">${esc(c.note)}</p>
        ${c.namedAfter ? `<p class="cat__after">Named after <b>${esc(c.namedAfter)}</b></p>` : ''}
      </article>`;
    })
    .join('');

  enhanceCatPortraits();
}

/**
 * Upgrades a cat's illustrated portrait to something real, in priority order:
 *
 *   1. A local photo dropped in assets/cats/<slug>.{jpg,jpeg,png,webp,avif} —
 *      the user's own image, their own rights call, exactly the moodboard
 *      pattern the Taemin sibling site uses. Same-origin, so nothing outside
 *      this site can ever block it.
 *   2. An Instagram embed, if `instagram` is set on that cat in
 *      content/curated.json to a real post URL. Uses Instagram's own
 *      sanctioned embed widget rather than a hotlinked copy of the image —
 *      except this depends on a live third-party script succeeding in each
 *      visitor's own browser, and ad-blockers and tracking-protection lists
 *      commonly block instagram.com's widget specifically. Confirmed live:
 *      it silently left three empty glowing circles on a real browser. So
 *      this is watched with a timeout and reverted to the illustration
 *      below if it doesn't produce a real embed in time — never left blank.
 *   3. The hand-illustrated portrait, kept in reserve rather than discarded,
 *      so step 2 has something to fall back to.
 */
async function enhanceCatPortraits() {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
  const probePhoto = (slug) =>
    new Promise((resolve) => {
      let i = 0;
      const tryNext = () => {
        if (i >= exts.length) return resolve(null);
        const src = `assets/cats/${slug}.${exts[i++]}`;
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = tryNext;
        img.src = src;
      };
      tryNext();
    });

  // `.forEach(async …)` does not wait for its callbacks — it fires all of
  // them and returns immediately, so `pendingInstagram` would still read
  // empty by the time it's checked below, and the whole function would exit
  // before ever calling kick() or arming the fallback timer. The blockquotes
  // still got inserted moments later (that part happened regardless), just
  // silently, with nothing left to process them or revert them. Confirmed
  // directly: waited 7.5s, three blank frames, no console error, because the
  // code that would have fixed either outcome had already returned.
  const results = await Promise.all(
    $$('.cat__frame').map(async (frame) => {
      const slug = frame.dataset.catSlug;
      const cat = (DATA.cats || []).find((c) => slugify(c.name) === slug);
      const fallback = frame.innerHTML; // the illustration, rendered synchronously

      const photo = await probePhoto(slug);
      if (photo) {
        frame.innerHTML = `<img src="${esc(photo)}" alt="${esc(cat?.name || '')}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">`;
        return null;
      }

      if (cat?.instagram) {
        frame.innerHTML = `
          <blockquote class="instagram-media" data-instgrm-permalink="${esc(cat.instagram)}"
                      data-instgrm-version="14" style="margin:0;width:100%;height:100%;border:0"></blockquote>`;
        return { frame, fallback };
      }
      return null;
    })
  );

  const pendingInstagram = results.filter(Boolean);
  if (!pendingInstagram.length) return;

  // embed.js only auto-scans blockquotes present at its own load time; these
  // were injected afterward, so it needs telling explicitly. Its own script
  // tag is async and may still be loading when we get here, hence the retry.
  let tries = 0;
  const kick = () => {
    if (window.instgrm?.Embeds) window.instgrm.Embeds.process();
    else if (++tries < 20) setTimeout(kick, 250);
  };
  kick();

  // Whether or not embed.js ever showed up: after 6s, anything that hasn't
  // actually become an iframe (blocked script, blocked network request,
  // whatever the cause) reverts to its illustration instead of sitting empty.
  setTimeout(() => {
    for (const { frame, fallback } of pendingInstagram) {
      if (!frame.querySelector('iframe')) frame.innerHTML = fallback;
    }
  }, 6000);
}

/* ─── videos ─────────────────────────────────────────────────────────── */

function renderVideos() {
  const vids = DATA.videos || [];
  const host = $('[data-videos]');
  if (!vids.length) return void (host.innerHTML = '<p class="empty">No videos found.</p>');

  host.innerHTML = vids
    .slice(0, 12)
    .map(
      (v) => `
      <a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">
        <div class="vid__thumb">
          <img src="${esc(v.thumb)}" alt="" width="480" height="270"
               loading="lazy" decoding="async" data-fallback="${esc(v.id)}">
          <span class="vid__play" aria-hidden="true">
            <span><svg viewBox="0 0 24 24" width="18" height="18" fill="#12101A"><path d="M8 5v14l11-7z"/></svg></span>
          </span>
        </div>
        <h3 class="vid__title">${esc(v.title)}</h3>
        <p class="rel__year">${esc(dotted(v.date))}</p>
      </a>`
    )
    .join('');

  // Wired here rather than as an inline `onerror`. An inline handler nests JS
  // inside an HTML attribute, and the browser entity-decodes before the JS
  // parses — an id containing a quote would break out of the string. Escaping
  // cannot fix a double context; the fix is not to create one.
  host.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.fallback) return;
    const id = img.dataset.fallback;
    delete img.dataset.fallback; // one retry, never a loop
    if (/^[\w-]{6,20}$/.test(id)) img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }, true); // capture: `error` on <img> does not bubble

  collapse(host, 6, 'videos');
}

/* ─── news ───────────────────────────────────────────────────────────── */

function renderNews() {
  const news = DATA.news || [];
  const host = $('[data-news]');
  if (!news.length) return void (host.innerHTML = '<li class="empty">No headlines right now.</li>');

  host.innerHTML = news
    .slice(0, 14)
    .map(
      (n) => `
      <li>
        <a href="${esc(n.url)}" target="_blank" rel="noopener">
          <span class="date">${esc(fmtDate(n.date, { month: 'short', day: '2-digit', year: '2-digit' }))}</span>
          <span class="head">${esc(n.title)}</span>
          <span class="outlet">${esc(n.outlet || '')}</span>
        </a>
      </li>`
    )
    .join('');

  collapse(host, 7, 'headlines');
}

/* ─── live ───────────────────────────────────────────────────────────── */

function renderTour() {
  const tour = DATA.tour || {};
  const host = $('[data-tour]');
  if (!host) return;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (tour.dates || [])
    .filter((d) => d.date && d.date >= today)
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const alerts = (tour.alerts || [])
    .map((a) => `<a class="chip" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label)} ↗</a>`)
    .join('');

  const wire = (DATA.tourNews || []).slice(0, 5);
  const wireBlock = wire.length
    ? `<div class="tour__wire">
         <h3 class="tour__wire-head"><span class="mono">Just announced</span></h3>
         <ul class="tour__wire-list">
           ${wire.map((n) => `
             <li><a href="${esc(n.url)}" target="_blank" rel="noopener">
               <span class="date">${esc(fmtDate(n.date, { month: 'short', day: '2-digit' }))}</span>
               <span class="head">${esc(n.title)}</span>
               <span class="outlet">${esc(n.outlet || '')}</span>
             </a></li>`).join('')}
         </ul>
       </div>`
    : '';

  if (!upcoming.length) {
    host.innerHTML = `
      <div class="tour__none">
        <p class="tour__none-lead">No dates announced right now.</p>
        <p class="tour__none-sub">
          Her tours sell out in minutes, so the useful move is an alert rather
          than refreshing a page. These three will tell you the moment something
          goes on sale.
        </p>
        <div class="tour__alerts">${alerts}</div>
      </div>
      ${wireBlock}`;
    return;
  }

  host.innerHTML = `
    <ol class="tour">
      ${upcoming.map((d) => `
        <li>
          <span class="tour__date">
            <span class="tour__day">${esc(fmtDate(d.date, { day: '2-digit' }))}</span>
            <span class="tour__mon">${esc(fmtDate(d.date, { month: 'short' }))}</span>
            <span class="tour__yr">${esc((d.date || '').slice(0, 4))}</span>
          </span>
          <span class="tour__where">
            <span class="tour__city">${esc(d.city || '')}${d.country ? `, ${esc(d.country)}` : ''}</span>
            <span class="tour__venue">${esc(d.venue || '')}${d.note ? ` · ${esc(d.note)}` : ''}</span>
          </span>
          ${d.url ? `<a class="btn btn--sm" href="${esc(d.url)}" target="_blank" rel="noopener">Tickets</a>` : '<span class="mono">TBA</span>'}
        </li>`).join('')}
    </ol>
    ${wireBlock}
    <div class="tour__alerts tour__alerts--after">
      <span class="mono">Get told about new dates</span>${alerts}
    </div>`;
}

/* ─── timeline ───────────────────────────────────────────────────────── */

function renderTimeline() {
  const items = [...(DATA.timeline || [])].reverse(); // newest first
  const host = $('[data-timeline]');
  host.innerHTML = items
    .map(
      (t) => `
      <li class="${t.highlight ? 'hl' : ''}">
        <span class="yr">${esc(t.year)}</span>
        <div class="body">
          <h3>${esc(t.title)}</h3>
          <p>${esc(t.body)}</p>
          ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}
        </div>
      </li>`
    )
    .join('');

  collapse(host, 7, 'milestones');
}

/* ─── facts ──────────────────────────────────────────────────────────── */

function renderFacts() {
  const facts = DATA.facts || [];
  if (!facts.length) return;

  const quote = $('[data-fact]');
  const count = $('[data-fact-count]');
  let i = Math.floor(Math.random() * facts.length);
  let timer;

  const label = () =>
    `${String(i + 1).padStart(2, '0')} / ${String(facts.length).padStart(2, '0')}`;

  const paint = () => {
    quote.classList.add('is-out');
    setTimeout(() => {
      quote.textContent = facts[i];
      count.textContent = label();
      quote.classList.remove('is-out');
    }, 400);
  };

  const go = (step) => {
    i = (i + step + facts.length) % facts.length;
    paint();
    clearInterval(timer);
    timer = setInterval(() => go(1), 9000);
  };

  $('[data-fact-next]').addEventListener('click', () => go(1));
  $('[data-fact-prev]').addEventListener('click', () => go(-1));

  quote.textContent = facts[i];
  count.textContent = label();
  timer = setInterval(() => go(1), 9000);
}

/* ─── footer ─────────────────────────────────────────────────────────── */

function renderFooter() {
  $('[data-links]').innerHTML = (DATA.links || [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
    .join('');
}

/* ─── behaviour ──────────────────────────────────────────────────────── */

function initReveal() {
  const targets = $$('[data-reveal]');
  if (!('IntersectionObserver' in window)) return targets.forEach((t) => t.classList.add('is-in'));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );
  targets.forEach((t) => io.observe(t));
}

/**
 * `content-visibility: auto` on every section (see the .section rule in
 * style.css) skips layout for anything off screen, which is what fixed the
 * fan's laptop lag. The cost: jumping to a fragment — a nav click, a shared
 * #cats link, browser back/forward — asks the browser to scroll to a target
 * whose real height it hasn't measured yet, so the landing position is
 * wrong. Confirmed directly: clicking "Cats" landed on the Eras section
 * instead, and it wasn't a distance thing — even the very first section
 * below the hero missed.
 *
 * Fix: force real layout on every section from the top down through
 * whichever one is being jumped to, immediately before the jump happens.
 * That's a few sections' worth of paint work at the moment of an actual
 * click, not the whole page on every load — the lag fix stays intact for
 * the common case of someone just scrolling down once.
 */
function initAnchorReveal() {
  const sections = $$('main > section');

  const revealThrough = (id) => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    for (let i = 0; i <= idx; i++) sections[i].style.contentVisibility = 'visible';
    return sections[idx];
  };

  // Changing style in a click handler and trusting the browser's own default
  // anchor-jump to pick it up doesn't work — confirmed directly, the jump
  // still landed on the pre-reveal (wrong, collapsed-height) position. The
  // native jump apparently doesn't re-check layout after handlers run, so the
  // scroll has to be taken over entirely rather than raced against it.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = revealThrough(id);
    if (!target) return;
    e.preventDefault();
    void target.offsetHeight; // force layout to actually apply before reading position
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', `#${id}`);
  });

  // A deep link straight to a fragment (page load, or browser back/forward)
  // needs the same reveal, but jumps instantly — animating a scroll the
  // instant the page appears reads as jank, not a feature.
  const jumpToHash = () => {
    if (!location.hash) return;
    const target = revealThrough(location.hash.slice(1));
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  jumpToHash();
  addEventListener('hashchange', jumpToHash);
}

function initNav() {
  const nav = $('#nav');
  let last = window.scrollY;

  addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--hidden', y > last && y > 400);
    last = y;
  }, { passive: true });

  const links = $$('.nav__links a');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) =>
          a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`)
        );
      }
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  sections.forEach((s) => spy.observe(s));
}

/* ═══════════════════════════════════════════════════════════════════════
   SPARKLES
   A drifting field of specks that brighten near the cursor and take their
   colour from the site's rainbow rather than any single era.
   ═══════════════════════════════════════════════════════════════════════ */

function initSparkles() {
  if (reduced) return;

  const cv = $('.sparkle');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: true });

  const RAINBOW = ['#FF6B9D', '#FFB03A', '#FFE66D', '#7FE7A4', '#7FD8FF', '#C79BFF'];

  /* Each speck is a dot plus a soft halo. Building that halo with
     createRadialGradient per speck per frame meant ~5,000 gradient objects a
     second, which is what made fans spin. Drawing each colour once into a
     small offscreen canvas and blitting it instead is visually identical and
     costs a fraction as much. */
  const SPRITE = 64;
  const sprites = RAINBOW.map((hue) => {
    const s = document.createElement('canvas');
    s.width = s.height = SPRITE;
    const c = s.getContext('2d');
    const g = c.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    g.addColorStop(0, hue);
    g.addColorStop(0.12, hue);
    g.addColorStop(1, 'transparent');
    c.fillStyle = g;
    c.fillRect(0, 0, SPRITE, SPRITE);
    return s;
  });

  let w = 0, h = 0, dpr = 1;
  let stars = [];
  const pointer = { x: -9999, y: -9999 };
  let raf = null;

  // Deliberately small and sparse. An earlier pass had ~250 specks at up to
  // 3.5px and it read as a snow globe. Glitter is a few points of light
  // catching, not weather.
  const spawn = () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 0.9 + 0.35,
    drift: Math.random() * 0.16 + 0.03,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.8 + 0.3,
    i: (Math.random() * RAINBOW.length) | 0,
  });

  const resize = () => {
    // 1.5 rather than 2. Soft glowing dots gain nothing from a retina
    // backing store, and it's ~45% fewer pixels to fill every frame.
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth;
    h = innerHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scale the count to the viewport so a phone isn't drawing a laptop's worth.
    const n = Math.round(Math.min(110, (w * h) / 16000));
    stars = Array.from({ length: n }, spawn);
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      s.y -= s.drift;
      s.x += Math.sin(t / 1400 + s.phase) * 0.18;
      if (s.y < -8) { s.y = h + 8; s.x = Math.random() * w; }

      // Twinkle, plus a boost for anything near the pointer.
      const tw = 0.35 + 0.65 * Math.sin((t / 420) * s.speed + s.phase);
      const near = Math.max(0, 1 - Math.hypot(s.x - pointer.x, s.y - pointer.y) / 190);

      const alpha = Math.max(0, Math.min(0.85, tw * 0.6 + near * 0.7));
      if (alpha <= 0.02) continue;
      const size = s.r * (1 + near * 1.4);

      // Dot plus halo in a single blit of the pre-rendered sprite.
      const d = size * 7;
      ctx.globalAlpha = alpha * 0.75;
      ctx.drawImage(sprites[s.i], s.x - d / 2, s.y - d / 2, d, d);

      // The cross-flare is what actually says "glitter", so it's reserved for
      // the few specks at the very top of their twinkle rather than most of them.
      if (alpha > 0.72) {
        ctx.globalAlpha = (alpha - 0.72) * 1.6;
        ctx.strokeStyle = RAINBOW[s.i];
        ctx.lineWidth = 0.6;
        const L = size * 4;
        ctx.beginPath();
        ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
        ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  };

  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; }, { passive: true });
  addEventListener('resize', resize, { passive: true });

  // Stop drawing while the tab is hidden — no reason to burn a phone battery
  // animating a canvas nobody is looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else if (!raf) raf = requestAnimationFrame(draw);
  });

  resize();
  raf = requestAnimationFrame(draw);
}

boot();
