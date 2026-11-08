# CPAB-Lists

[English](README.md) | [فارسی](README.fa.md)

The filter lists that CPAB - CyClone Power Ad Blocker uses, each as its own file with its source, credit and licence, plus CPAB's own rules. CPAB is a browser extension; its site is https://cpab.cyclone9.dev/ and its family page is https://cyclone9.dev/cpab.

## What is here

```
README.md, README.fa.md, LICENSE   # LICENSE is GPLv3, for cpab-own.txt and cpab-exceptions.txt
SOURCES.md                         # generated: every list with attribution, homepage, source URL, licence, snapshot date or commit, SHA-256
cpab-own.txt                       # CPAB's own rules, written by hand from reports
cpab-exceptions.txt                # domains the "Exceptions for Iranian sites" switch allows, each with a dated reason
sources/<name>/<name>.txt          # an unmodified snapshot of each list CPAB uses
sources/<name>/meta.json           # where it came from and when
sources/<name>/LICENSE.txt         # the licence text, where the licence needs a copy
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

## Licence

`cpab-own.txt` and `cpab-exceptions.txt` are under GPL-3.0-or-later; the text is in `LICENSE`. Every list under `sources/` stays under its own licence, as `SOURCES.md` records.

The names CPAB, CyClone Power Ad Blocker, CyClone and «تبلیغ‌شکن», and the CPAB logos, are not licensed. The licence grants no trademark rights in them.
