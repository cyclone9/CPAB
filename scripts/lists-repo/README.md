# CPAB-Lists

[English](README.md) | [فارسی](README.fa.md)

The filter lists that CPAB - CyClone Power Ad Blocker uses, each as its own file with its source, credit and licence, plus CPAB's own rules. CPAB is a browser extension; its site is https://cpab.cyclone9.dev/ and its family page is https://cyclone9.dev/cpab.

## What is here

```
README.md, README.fa.md, LICENSE   # LICENSE is GPLv3, for cpab-own.txt, cpab-exceptions.txt and cpab-leaks.txt
SOURCES.md                         # generated: every list with attribution, homepage, source URL, licence, snapshot date or commit, SHA-256
cpab-own.txt                       # CPAB's own rules, written by hand from reports
cpab-exceptions.txt                # domains the "Exceptions for Iranian sites" switch allows, each with a dated reason
cpab-leaks.txt                     # CPAB's own data-leak list, written by hand, each entry with a public source
sources/<name>/<name>.txt          # an unmodified snapshot of each list CPAB uses
sources/<name>/meta.json           # where it came from and when
sources/<name>/LICENSE.txt         # the licence text, where the licence needs a copy
sources/<name>/<name>.json         # same as the .txt snapshot, for lists that are JSON (the Leakfa data-leak list)
```

Only PersianBlocker's snapshot is changed: its parts are joined into one file, each under a `! ==== name ====` line, and its hosts-file part is rewritten to `||domain^` rules. Its `meta.json` and `SOURCES.md` say so.

## The lists are not CPAB's

Every list under `sources/` belongs to its authors and keeps its own licence. They are never merged: one file per list, so each file's licence stays true. `SOURCES.md` has the attribution, homepage, source URL, licence, snapshot date or commit and SHA-256 of each one, and is the place to check a licence.

| Group | Lists |
|---|---|
| Ads | EasyList, AdGuard Base, PersianBlocker |
| Trackers | EasyPrivacy, HaGeZi Multi Light |
| Popups | AdGuard Popups |
| Widgets | AdGuard Widgets, Fanboy's Social |
| Harmful sites | HaGeZi TIF mini, uBlock filters - Badware risks |
| Adult sites | HaGeZi NSFW |

PersianBlocker comes from https://github.com/PersianBlocker/PersianBlocker at a pinned commit, under AGPL-3.0.

## Updates

The snapshots are updated by hand for now. There are no automatic updates and no schedule.

## CPAB's own rules

`cpab-own.txt` holds rules written by hand from reports about specific sites. Each rule has a comment with its date and the site it came from. Some rules end in `:cpab-offscreen`, a mark that only CPAB understands. It moves the box out of view at full size. Other blockers don't know it.

`cpab-exceptions.txt` lists the domains that CPAB's "Exceptions for Iranian sites" switch allows, each with a dated reason.

## CPAB's own leak list

`cpab-leaks.txt` names sites with a known data leak that the other data-leak sources miss. CPAB's data-leak notice shows a match as its own line, "Listed by CPAB". One entry per line, five fields split by `|`:

```
domain | English name | Persian name | YYYY-MM | https source
```

The domain is the site's host without `www`; an entry covers that host and everything under it. The month is when the leak became public. Every entry needs a public https source, such as a news report or the company's own notice, and the source never holds or links to the leaked data. A line that breaks these rules is dropped by CPAB's build.

## The Leakfa snapshot

`sources/leakfa-breaches/` holds Leakfa's list of breached Iranian sites (MIT, https://github.com/Leakfarsi/Leakfa-Alert), the one list here that is JSON: `sources/leakfa-breaches/leakfa-breaches.json`, with `meta.json` and `LICENSE.txt` beside it like the others. CPAB shows what Leakfa lists and does not vouch for it.

## Licence

`cpab-own.txt`, `cpab-exceptions.txt` and `cpab-leaks.txt` are under GPL-3.0-or-later; the text is in `LICENSE`. Every list under `sources/` stays under its own licence, as `SOURCES.md` records.

The names CPAB, CyClone Power Ad Blocker, CyClone and «تبلیغ‌شکن», and the CPAB logos, are not licensed. The licence grants no trademark rights in them.
