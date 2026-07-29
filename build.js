/**
 * SWIFT ARCHIVE — data builder.
 *
 * Hits every source, merges the results, buckets everything into eras,
 * writes data/site.json. No API keys. No dependencies. Node 18+.
 *
 * Design rule: this runs unattended on a schedule, so a source being down
 * must never blank out a section. Every fetch is wrapped, and anything that
 * fails falls back to whatever we already had on disk.
 *
 *   node build.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'data', 'site.json');

const SOURCES = {
  itunesArtist: '159260351',
  deezerArtist: '12246',
  youtubeChannel: 'UCqECaJ8Gagnn7YCbPEzWH6g',
  wikipediaPage: 'Taylor_Swift',
  newsQuery: 'Taylor Swift',
  showsQuery: 'Taylor Swift (concert OR tour OR festival OR tickets OR lineup)',
  debut: '2006-10-24',
};

const UA = 'SwiftArchive/1.0 (+https://github.com/) static-site-builder';

/* ── plumbing ─────────────────────────────────────────────────────────── */

const log = {
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  warn: (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m${m}\x1b[0m`),
};

async function grab(url, { as = 'json', timeout = 20000, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Accept: '*/*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = as === 'json' ? await res.json() : await res.text();
      return body;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Run a source, but never let it take the build down. */
async function source(name, fn, fallback) {
  try {
    const value = await fn();
    const n = Array.isArray(value) ? value.length : value ? 1 : 0;
    if (!n) throw new Error('empty result');
    log.ok(`${name} — ${Array.isArray(value) ? `${n} items` : 'ok'}`);
    return value;
  } catch (err) {
    log.warn(`${name} failed (${err.message}) — keeping previous data`);
    return fallback ?? (Array.isArray(fallback) ? [] : null);
  }
}

/* Minimal XML helpers. These feeds are well-formed and stable; pulling in a
   parser dependency would be more risk than it removes. */
const tags = (xml, tag) => [
  ...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')),
].map((m) => m[1]);

const tag1 = (xml, tag) => tags(xml, tag)[0] ?? '';

const attr = (xml, tag, name) =>
  xml.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`))?.[1] ?? '';

const clean = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const iso = (d) => {
  const t = new Date(d);
  return Number.isNaN(+t) ? null : t.toISOString().slice(0, 10);
};

/** Apple serves any square size off the same path. */
const art = (url, size) =>
  (url || '').replace(/\/\d+x\d+bb\.(jpg|png)/, `/${size}x${size}bb.$1`);

/**
 * Reduce a release title to something two catalogues can be matched on.
 *
 * This catalogue is unusually hostile. Apple alone returns `Midnights` four
 * times on one date, `The Life of a Showgirl` eight times, and `Red (Taylor's
 * Version)` twice — once with a curly apostrophe and once straight. Without
 * aggressive normalising the discography is 200 rows of near-duplicates.
 *
 * The one thing deliberately NOT collapsed is `(Taylor's Version)`. Those are
 * separate records that fans care about specifically, and folding them into
 * the originals would be wrong on the merits, not just cosmetically.
 */
const fingerprint = (title = '') =>
  title
    // Curly → straight first, or the apostrophe variants never match.
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s*[-–—]\s*(single|ep)$/i, '')
    // Edition suffixes. `taylor's version` is preserved on purpose.
    .replace(/\s*[\[(]\s*(video\s+)?deluxe[^\])]*[\])]/gi, '')
    .replace(/\s*[\[(][^\])]*\b(edition|version|remix(es)?|instrumental|acoustic|live|voice memo|demo|extended|clean|explicit)\b[^\])]*[\])]/gi,
      (m) => (/taylor's version/i.test(m) ? m : ''))
    // Bonus-content garnish Apple bolts onto the same record.
    .replace(/\s*\+\s*.*$/, '')
    .replace(/\s*:\s*the\s+anthology\b/gi, '')
    .replace(/\s*\btrack\s+by\s+track\b.*$/gi, '')
    .replace(/\s*\bfrom\s+["“]?[^"”]*["”]?\s*$/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();

/**
 * Releases nobody browses a fan site to find.
 *
 * Apple returns 51 remixes, mostly of two songs — six separate remixes of
 * "Opalite" alone. They bury the actual records and no one is scrolling a
 * discography to compare the Skream remix with the BUNT. remix. Dropped
 * outright rather than hidden behind a toggle.
 */
const isNoise = (r) => {
  const t = (r.title || '').toLowerCase();
  return /\bremix|instrumental|karaoke|a ?cappella|voice memo|\bstem[s]?\b|extended version/.test(t);
};

/** Secondary but still real — singles, live one-offs, chapter EPs. */
const isSideRelease = (r) => {
  const t = (r.title || '').toLowerCase();
  if (/\blive from|\bchapter\b|\bdemo\b|\bacoustic\b/.test(t)) return true;
  if (/\bfrom ["“]/.test(t)) return true; // soundtrack one-offs
  return (r.trackCount ?? 0) > 0 && r.trackCount <= 3;
};

/* ── sources ──────────────────────────────────────────────────────────── */

async function itunesReleases() {
  const r = await grab(
    `https://itunes.apple.com/lookup?id=${SOURCES.itunesArtist}&entity=album&limit=200&country=US`
  );
  return (r.results || [])
    .filter((x) => x.wrapperType === 'collection' && x.releaseDate)
    .map((x) => ({
      id: `itunes-${x.collectionId}`,
      title: x.collectionName,
      date: iso(x.releaseDate),
      trackCount: x.trackCount,
      art: art(x.artworkUrl100, 1400),
      artSmall: art(x.artworkUrl100, 600),
      url: x.collectionViewUrl,
      copyright: x.copyright || null,
      genre: x.primaryGenreName || null,
      via: 'apple',
    }));
}

async function deezerReleases() {
  const r = await grab(
    `https://api.deezer.com/artist/${SOURCES.deezerArtist}/albums?limit=100`
  );
  return (r.data || [])
    .filter((x) => x.release_date)
    .map((x) => ({
      id: `deezer-${x.id}`,
      title: x.title,
      date: iso(x.release_date),
      trackCount: x.nb_tracks || null,
      art: x.cover_xl || x.cover_big || null,
      artSmall: x.cover_big || x.cover_medium || null,
      url: x.link,
      recordType: x.record_type || null,
      via: 'deezer',
    }));
}

async function topSongs() {
  const r = await grab(
    `https://itunes.apple.com/lookup?id=${SOURCES.itunesArtist}&entity=song&limit=30&country=US`
  );
  return (r.results || [])
    .filter((x) => x.wrapperType === 'track' && x.trackName)
    .map((x) => ({
      title: x.trackName,
      album: x.collectionName,
      date: iso(x.releaseDate),
      art: art(x.artworkUrl100, 600),
      preview: x.previewUrl || null,
      url: x.trackViewUrl,
      ms: x.trackTimeMillis || null,
    }))
    .slice(0, 12);
}

async function videos() {
  const xml = await grab(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${SOURCES.youtubeChannel}`,
    { as: 'text' }
  );
  return tags(xml, 'entry').map((e) => {
    const id = clean(tag1(e, 'yt:videoId'));
    return {
      id,
      title: clean(tag1(e, 'title')),
      date: iso(clean(tag1(e, 'published'))),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumb:
        attr(e, 'media:thumbnail', 'url') ||
        `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      // Deliberately no view count. The feed carries one, but it ticks up
      // every few minutes, so storing it would make the "did anything
      // change?" check true on every single run and the scheduled job would
      // commit around the clock. Nothing renders it either.
    };
  });
}

async function news() {
  const xml = await grab(
    `https://news.google.com/rss/search?q=${encodeURIComponent(SOURCES.newsQuery)}&hl=en-US&gl=US&ceid=US:en`,
    { as: 'text' }
  );
  const seen = new Set();
  return tags(xml, 'item')
    .map((it) => {
      const raw = clean(tag1(it, 'title'));
      // Google appends " - Publisher" to every headline.
      const split = raw.lastIndexOf(' - ');
      return {
        title: split > 20 ? raw.slice(0, split) : raw,
        outlet: split > 20 ? raw.slice(split + 3) : clean(tag1(it, 'source')),
        date: iso(clean(tag1(it, 'pubDate'))),
        url: clean(tag1(it, 'link')),
      };
    })
    .filter((n) => {
      if (!n.title || !n.date) return false;
      const k = n.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 24);
}

/**
 * Live-show announcements, scraped out of the news wire.
 *
 * Every actual tour API is now closed: Bandsintown 403s without a registered
 * app_id, Songkick and Ticketmaster want keys, and both sites block scrapers.
 * MusicBrainz only carries historical award shows.
 *
 * But announcements get *reported*, and the news feed is already keyless — the
 * Romania and Poland festival dates both surfaced as articles first. So this
 * runs a second, show-shaped query and keeps the hits. It won't give exact
 * venue rows, but it means a new announcement lands on the site by itself,
 * which the curated list alone can't do.
 */
async function tourNews() {
  const q = encodeURIComponent(
    SOURCES.showsQuery
  );
  const xml = await grab(
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
    { as: 'text' }
  );

  // Only keep headlines that actually sound like a show announcement —
  // the query alone drags in album reviews and chart pieces.
  const relevant =
    /\b(concert|tour|festival|tickets?|lineup|line-up|perform|stage|live in|announce)/i;

  const seen = new Set();
  return tags(xml, 'item')
    .map((it) => {
      const raw = clean(tag1(it, 'title'));
      const cut = raw.lastIndexOf(' - ');
      return {
        title: cut > 20 ? raw.slice(0, cut) : raw,
        outlet: cut > 20 ? raw.slice(cut + 3) : clean(tag1(it, 'source')),
        date: iso(clean(tag1(it, 'pubDate'))),
        url: clean(tag1(it, 'link')),
      };
    })
    .filter((n) => {
      if (!n.title || !n.date || !relevant.test(n.title)) return false;
      const k = n.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6);
}

/**
 * Fetch the twelve era-defining albums by explicit id.
 *
 * The artist lookup caps at 200 results and her catalogue is bigger than that,
 * so the standard editions get truncated away — the first run came back with
 * remixes of the song "Lover" but no Lover album at all. Pinning the ids makes
 * the era covers deterministic instead of dependent on what survived the cut.
 *
 * One request for all twelve.
 */
async function eraAlbums(eras) {
  const ids = (eras || []).map((e) => e.albumId).filter(Boolean);
  if (!ids.length) return {};

  const r = await grab(
    `https://itunes.apple.com/lookup?id=${ids.join(',')}&entity=album&country=US`
  );

  const byId = new Map(
    (r.results || [])
      .filter((x) => x.wrapperType === 'collection')
      .map((x) => [String(x.collectionId), x])
  );

  const out = {};
  for (const e of eras) {
    const a = byId.get(String(e.albumId));
    if (!a) continue;
    out[e.id] = {
      id: `itunes-${a.collectionId}`,
      title: a.collectionName,
      date: iso(a.releaseDate),
      trackCount: a.trackCount,
      art: art(a.artworkUrl100, 1400),
      artSmall: art(a.artworkUrl100, 600),
      url: a.collectionViewUrl,
      genre: a.primaryGenreName || null,
      via: 'apple',
    };
  }
  return out;
}

async function bio() {
  const r = await grab(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${SOURCES.wikipediaPage}`
  );
  return {
    extract: r.extract || null,
    url: r.content_urls?.desktop?.page || null,
  };
}

/* ── merge ────────────────────────────────────────────────────────────── */

/**
 * Apple has better artwork and catches releases Deezer misses; Deezer catches
 * a few Apple misses. Prefer Apple on collision, fill gaps from Deezer.
 *
 * `known` is whatever the last run stored. Both catalogues vary by region —
 * "Press Your Number (Japanese Version)" shows up from Europe but not from a
 * US runner — so anything seen once is kept. Without that the release count
 * flips back and forth depending on where the job happened to run, and the
 * scheduler commits every time it does. A release is a historical fact; an
 * archive shouldn't drop one because a shop stopped listing it.
 */
function mergeReleases(apple, deezer, known = []) {
  const byKey = new Map();
  const key = (r) => `${fingerprint(r.title)}|${(r.date || '').slice(0, 4)}`;

  for (const r of apple) byKey.set(key(r), r);

  for (const r of deezer) {
    const k = key(r);
    let hit = byKey.get(k);

    // Fall back to a same-day fuzzy match: the catalogues format the same
    // release differently often enough that exact keys miss (e.g. Apple's
    // "Navillera, Pt. 1 (Original Television Soundtrack)" vs Deezer's
    // "Navillera OST Part 1"). Two distinct releases sharing a date *and* a
    // long title prefix effectively doesn't happen.
    if (!hit) {
      const fp = fingerprint(r.title);
      hit = [...byKey.values()].find((c) => {
        if (c.date !== r.date) return false;
        const cf = fingerprint(c.title);
        if (cf.startsWith(fp) || fp.startsWith(cf)) return true;
        let i = 0;
        while (i < Math.min(cf.length, fp.length) && cf[i] === fp[i]) i++;
        return i >= 8;
      });
    }

    if (hit) {
      hit.recordType ??= r.recordType;
      hit.deezerUrl = r.url;
    } else {
      byKey.set(k, r);
    }
  }

  // Re-add anything a previous run found that today's fetch didn't return.
  let remembered = 0;
  for (const r of known) {
    const k = key(r);
    if (!byKey.has(k)) {
      byKey.set(k, r);
      remembered++;
    }
  }
  if (remembered) log.ok(`${remembered} release(s) carried over from last run`);

  return [...byKey.values()]
    .filter((r) => r.date && r.art)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => ({
      ...r,
      kind: classify(r),
      year: r.date.slice(0, 4),
    }));
}

function classify(r) {
  const t = r.title.toLowerCase();
  if (/\bremix/.test(t)) return 'Remix';
  if (/instrumental|voice memo|karaoke/.test(t)) return 'Version';
  if (/taylor's version/.test(t)) return "Taylor's Version";
  if (/\bsingle\b/.test(t) || r.recordType === 'single' || (r.trackCount ?? 0) <= 3)
    return 'Single';
  if (/\bep\b/.test(t) || r.recordType === 'ep') return 'EP';
  return 'Album';
}

/* ── eras ─────────────────────────────────────────────────────────────── */

/**
 * Put every release into an era.
 *
 * Two rules, in order:
 *   1. Title match — catches the albums themselves and, importantly, the
 *      Taylor's Versions, which belong to the era they re-record rather than
 *      the year they came out. `1989 (Taylor's Version)` is a 1989 record.
 *   2. Date window — everything else falls into whichever era was current
 *      when it was released. This is what sweeps up the 115 singles and 51
 *      remixes without anyone hand-sorting them.
 *
 * Rule 1 has to run first or every Taylor's Version lands in the wrong decade.
 */
function bucketByEra(releases, eras, covers = {}) {
  if (!eras?.length) return { eras: [], unbucketed: releases.length };

  const windows = [...eras]
    .sort((a, b) => (a.released < b.released ? -1 : 1))
    .map((e, i, all) => ({
      ...e,
      from: e.released,
      until: all[i + 1]?.released ?? '9999-12-31',
    }));

  const matchers = windows.map((e) => ({
    id: e.id,
    re: e.match ? new RegExp(e.match, 'i') : null,
  }));

  const bucket = new Map(windows.map((e) => [e.id, []]));
  let unbucketed = 0;

  for (const r of releases) {
    const fp = fingerprint(r.title);

    let hit = matchers.find((m) => m.re && m.re.test(fp))?.id;

    if (!hit) {
      hit = windows.find((e) => r.date >= e.from && r.date < e.until)?.id;
    }
    // Anything predating the debut album — early singles, compilations.
    if (!hit && r.date < windows[0].from) hit = windows[0].id;

    if (hit) bucket.get(hit).push(r);
    else unbucketed++;
  }

  const out = windows.map((e) => {
    const all = bucket.get(e.id) ?? [];
    const main = all.filter((r) => !isSideRelease(r));

    // The cover comes from the pinned album id, fetched separately. Deriving
    // it from whatever the bucket happened to contain picked an EP for
    // folklore and a 2008 live recording for Lover.
    const cover = covers[e.id] ?? null;

    // Fall back to a bucket pick only if the pinned fetch failed.
    const fallback =
      main
        .filter((r) => r.kind === 'Album')
        .sort((a, b) => a.title.length - b.title.length)[0] ?? main[0] ?? null;

    const canonical = cover ?? fallback;

    return {
      ...e,
      art: canonical?.art ?? null,
      artSmall: canonical?.artSmall ?? null,
      canonicalTitle: canonical?.title ?? null,
      trackCount: canonical?.trackCount ?? null,
      url: canonical?.url ?? null,
      counts: { total: all.length, main: main.length, side: all.length - main.length },
      releases: main
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((r) => r.id),
    };
  });

  return { eras: out.reverse(), unbucketed }; // newest era first
}

/* ── main ─────────────────────────────────────────────────────────────── */

/**
 * Rewrite the social-preview tags in index.html so a link posted anywhere
 * shows the newest cover art and names the newest release. Idempotent —
 * each run replaces the same attributes.
 */
async function stampHtml(site) {
  const file = path.join(ROOT, 'index.html');
  const r = site.latest;
  if (!r) return;

  const clean = (t) =>
    t.replace(/\s*[-–—]\s*(Single|EP)$/i, '')
     .replace(/\s*[-–—]\s*The\s+\d+(st|nd|rd|th)\s+(Mini\s+)?Album\b.*$/i, '')
     .trim() || t;

  const title = clean(r.title);
  const desc =
    `Every era, every album, every cat. Latest release: ${title}, out ` +
    `${r.date}. A Taylor Swift archive that keeps its own discography, ` +
    `videos and news up to date on its own.`;

  const swap = (html, attr, key, value) =>
    html.replace(
      new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i'),
      (_, a, b) => a + value.replace(/"/g, '&quot;') + b
    );

  try {
    let html = await fs.readFile(file, 'utf8');
    const before = html;

    // og:image and twitter:image are deliberately NOT stamped here. They used
    // to carry the latest release's cover art, which meant the share card was
    // a third-party CDN URL that changed on every new release and would break
    // outright if Apple rotated it. They point at our own assets/img/og.jpg
    // instead, written once by stampSeo() so it tracks the domain.
    html = swap(html, 'property', 'og:description', desc);
    html = swap(html, 'name', 'description', desc);

    if (html !== before) {
      await fs.writeFile(file, html, 'utf8');
      log.ok('index.html — social tags stamped with latest release');
    }
  } catch (err) {
    log.warn(`could not stamp index.html (${err.message})`);
  }
}

/**
 * Write schema.org structured data into the page.
 *
 * This is the real modern equivalent of "tags": machine-readable facts a
 * search engine can trust, rather than keywords stuffed at a crawler.
 * `<meta name="keywords">` has been ignored by Google since 2009 and
 * stuffing is now a demotion signal, so it is deliberately absent.
 */
async function stampJsonLd(site, siteUrl) {
  const file = path.join(ROOT, 'index.html');
  const base = (siteUrl || '').replace(/\/+$/, '');

  // The twelve era-defining albums, not whatever the catalogue happened to
  // return. Filtering `releases` by kind pulled in things like "The More Lover
  // Chapter" — real EPs, but not what you want a search engine to think her
  // discography is.
  const albums = (site.eras || [])
    .filter((e) => e.art)
    .map((e) => ({
      '@type': 'MusicAlbum',
      name: e.name,
      datePublished: e.released,
      image: e.art,
      ...(e.url ? { url: e.url } : {}),
      ...(e.trackCount ? { numTracks: e.trackCount } : {}),
      albumReleaseType: 'https://schema.org/AlbumRelease',
    }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: 'Taylor Swift',
    alternateName: ['Taylor Alison Swift'],
    genre: ['Pop', 'Country', 'Folk', 'Alternative'],
    ...(base ? { url: base + '/' } : {}),
    ...(site.artist.bio ? { description: site.artist.bio } : {}),
    ...(site.latest?.art ? { image: site.latest.art } : {}),
    sameAs: [
      site.artist.bioUrl,
      ...site.links.map((l) => l.url),
    ].filter(Boolean),
    album: albums,
  };

  try {
    let html = await fs.readFile(file, 'utf8');
    const json = JSON.stringify(schema, null, 2);
    const next = html.replace(
      /(<script type="application\/ld\+json" data-schema>)[\s\S]*?(<\/script>)/,
      (_, a, b) => a + json + b
    );
    if (next !== html) {
      await fs.writeFile(file, next, 'utf8');
      log.ok(`structured data — MusicGroup + ${albums.length} albums`);
    }
  } catch (err) {
    log.warn(`could not write structured data (${err.message})`);
  }
}

/**
 * Generate sitemap.xml + robots.txt, and fill in canonical/og:url — but only
 * once the site actually has an address. Skipped silently while siteUrl is
 * blank so nothing ships with a placeholder domain baked in.
 */
async function stampSeo(site, siteUrl, lastmod) {
  if (!siteUrl) return;
  const base = siteUrl.replace(/\/+$/, '');

  // Only write when the bytes would actually differ, so re-running the build
  // doesn't churn files git would then want to commit.
  const put = async (name, body) => {
    const file = path.join(ROOT, name);
    try {
      if ((await fs.readFile(file, 'utf8')) === body) return false;
    } catch { /* not there yet */ }
    await fs.writeFile(file, body, 'utf8');
    return true;
  };

  // lastmod is when the content actually changed, not when the job happened
  // to run — using today's date would rewrite the sitemap every single day.
  const wrote = [];

  if (await put('sitemap.xml',
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`)) wrote.push('sitemap.xml');

  if (await put('robots.txt',
    `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`
  )) wrote.push('robots.txt');

  // Add canonical + og:url to the head if they aren't there yet.
  const file = path.join(ROOT, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const before = html;
  const canonical = `<link rel="canonical" href="${base}/">`;
  const ogUrl = `<meta property="og:url" content="${base}/">`;

  html = /rel="canonical"/.test(html)
    ? html.replace(/<link rel="canonical"[^>]*>/, canonical)
    : html.replace('<link rel="icon"', `${canonical}\n<link rel="icon"`);

  html = /og:url/.test(html)
    ? html.replace(/<meta property="og:url"[^>]*>/, ogUrl)
    : html.replace('<meta name="twitter:card"', `${ogUrl}\n<meta name="twitter:card"`);

  // The share card. Absolute because Open Graph consumers don't resolve
  // relative URLs, and rebuilt from `base` so moving domains can't strand it.
  const ogImage = `${base}/assets/img/og.jpg`;
  html = html.replace(
    /(<meta property="og:image" content=")[^"]*(")/,
    (_, a, b) => a + ogImage + b
  );
  html = html.replace(
    /(<meta name="twitter:image" content=")[^"]*(")/,
    (_, a, b) => a + ogImage + b
  );

  if (html !== before) {
    await fs.writeFile(file, html, 'utf8');
    wrote.push('canonical + og:url + og:image');
  }

  if (wrote.length) log.ok(`${wrote.join(', ')} → ${base}`);
}

/**
 * Read JSON tolerantly. Windows editors (Notepad, PowerShell's Set-Content)
 * happily write a UTF-8 BOM, which is invalid at the start of JSON and would
 * otherwise take the whole build down with a cryptic parse error.
 */
async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^﻿/, ''));
}

async function readPrevious() {
  try {
    return await readJson(OUT);
  } catch {
    return {};
  }
}

async function main() {
  console.log('\n\x1b[1m\x1b[7m  SWIFT ARCHIVE  \x1b[0m  building…');

  const prev = await readPrevious();
  const curated = await readJson(path.join(ROOT, 'content', 'curated.json'));

  log.step('Fetching sources');
  const [apple, deezer, songs, vids, press, shows, wiki] = await Promise.all([
    source('Apple Music  discography', itunesReleases, []),
    source('Deezer       discography', deezerReleases, []),
    source('Apple Music  top songs', topSongs, prev.songs ?? []),
    source('YouTube      uploads', videos, prev.videos ?? []),
    source('Google News  headlines', news, prev.news ?? []),
    source('Google News  show announcements', tourNews, prev.tourNews ?? []),
    source('Wikipedia    bio', bio, prev.bio ?? null),
  ]);

  const covers = await source(
    'Apple Music  era albums',
    () => eraAlbums(curated.eras),
    {}
  );

  log.step('Merging');
  let releases = mergeReleases(apple, deezer, prev.releases ?? []);
  if (!releases.length && prev.releases?.length) {
    log.warn('both discography sources failed — reusing previous');
    releases = prev.releases;
  }

  const beforeNoise = releases.length;
  releases = releases.filter((r) => !isNoise(r));
  log.ok(`${releases.length} releases (dropped ${beforeNoise - releases.length} remixes/instrumentals)`);

  const latest = releases[0] ?? null;

  log.step('Bucketing into eras');
  const { eras, unbucketed } = bucketByEra(releases, curated.eras, covers);
  log.ok(`${eras.length} eras, ${unbucketed} release(s) unplaced`);
  for (const e of eras) {
    log.ok(`  ${e.short.padEnd(12)} ${String(e.counts.main).padStart(3)} main + ${String(e.counts.side).padStart(3)} side`);
  }

  const now = new Date();
  const years = (from) =>
    Math.floor((now - new Date(from)) / (365.25 * 24 * 3600 * 1000));

  const site = {
    generated: new Date().toISOString(),
    artist: {
      name: 'Taylor Swift',
      full: 'Taylor Alison Swift',
      bio: wiki?.extract ?? prev.bio?.extract ?? null,
      bioUrl: wiki?.url ?? null,
    },
    stats: {
      yearsSinceDebut: years(SOURCES.debut),
      eraCount: eras.length,
      releaseCount: releases.length,
      albumCount: releases.filter((r) => r.kind === 'Album').length,
    },
    eras,
    cats: curated.cats ?? [],
    latest,
    releases,
    songs,
    videos: vids,
    news: press,
    bio: wiki ?? prev.bio ?? null,
    tour: curated.tour ?? null,
    tourNews: shows,
    timeline: curated.timeline,
    facts: curated.facts,
    links: curated.links,
  };

  // `generated` moves on every run, so compare everything *except* it. Without
  // this the scheduled job would commit four no-op changes a day forever.
  const substance = (o) => JSON.stringify({ ...o, generated: null });
  const changed = substance(site) !== substance(prev);

  log.step('Done');

  if (changed) {
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(site, null, 2), 'utf8');
    log.ok(`data/site.json — ${(JSON.stringify(site).length / 1024).toFixed(1)} kB`);
    if (latest) log.ok(`latest release: ${latest.title} (${latest.date})`);
  } else {
    log.ok('sources unchanged — data/site.json left alone');
  }

  // The stamped files derive from the fetched data *and* from curated.json,
  // so they get reconciled every run rather than only when a feed moved.
  // Editing siteUrl alone used to leave the sitemap and canonical tag
  // unwritten, because this used to sit behind the early return above.
  // Each of these is a no-op when the output already matches.
  const stamp = changed ? site.generated : (prev.generated ?? site.generated);
  await stampHtml(site);
  await stampJsonLd(site, curated.siteUrl);
  await stampSeo(site, curated.siteUrl, stamp.slice(0, 10));

  console.log('');
}

main().catch((err) => {
  console.error('\n\x1b[31mBuild failed:\x1b[0m', err);
  process.exit(1);
});
