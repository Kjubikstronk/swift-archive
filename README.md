# Swift Archive

A Taylor Swift archive organised by era. Discography, videos, news and shows keep
themselves current without anyone touching the repo.

**[swiftarchive.online](https://swiftarchive.online/)**

## Eras

The organising idea is that a nineteen year discography is unusable as a flat list.
Everything the builder collects gets bucketed into an era by release date, starting
from the debut on 24 October 2006, so a release, a video and a piece of news about the
same period sit together rather than in three separate reverse-chronological lists.

## How it works

`build.js` is plain Node with native fetch. No dependencies, no API keys, no build
step beyond running the file. It hits the sources, merges what comes back, buckets it
into eras and writes `data/site.json`, which the page reads:

| Source | Used for |
|---|---|
| iTunes | releases and artwork |
| Deezer | cross-check on the discography |
| YouTube | latest videos |
| Wikipedia | biography and era context |
| News and shows queries | recent coverage, tours and festival dates |

The one design rule is that a source being down must never blank a section. Every
fetch is wrapped, and anything that fails falls back to whatever is already on disk.
A site that quietly loses its video list because a scheduled run got rate-limited is
worse than a site showing yesterday's videos.

## The schedule

A GitHub Action runs `build.js` every six hours and commits only if something actually
moved.

```yaml
- cron: '17 */6 * * *'
```

The `:17` is deliberate. GitHub's scheduler is best-effort and queues hardest on the
hour, where every cron in the world piles up. Running on the hour drifted between 45
minutes and nearly 3 hours late. An odd minute gets picked up close to on time.

`build.js` leaves files untouched when nothing substantive changed, so an empty diff
genuinely means there was no news, and the repo does not fill with noise commits.

## Running it

```bash
node build.js     # refresh data/site.json
```

Node 18 or newer, for native fetch. Then open `index.html`.
