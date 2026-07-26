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
  initNav();
  initEraTakeover();
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

function renderCats() {
  const cats = DATA.cats || [];
  const host = $('[data-cats]');
  if (!cats.length) return void (host.innerHTML = '<p class="empty">No cats. Unacceptable.</p>');

  const paws = ['🐈', '🐈‍⬛', '🐱'];

  host.innerHTML = cats
    .map(
      (c, i) => `
      <article class="cat">
        <p class="cat__paw" aria-hidden="true">${paws[i % paws.length]}</p>
        <h3 class="cat__name">${esc(c.name)}</h3>
        <p class="cat__meta">${esc(c.breed)} · since ${esc(c.since)}</p>
        <p class="cat__note">${esc(c.note)}</p>
        ${c.namedAfter ? `<p class="cat__after">Named after ${esc(c.namedAfter)}</p>` : ''}
      </article>`
    )
    .join('');
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
