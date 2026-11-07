# CPAB - CyClone Power Ad Blocker

[English](README.md) | [فارسی](README.fa.md)

Status: private preview of `0.2.3`. It blocks ads and trackers, closes ad tabs and windows that a page opens, and hides leftover ad boxes, so some ads still show and a site may occasionally need pausing.

The page stays, the ads go.

Free ad blocker. No data collected.

## What this version is

`0.2.3` blocks ads, trackers and Iranian ad networks with rules converted from EasyList, EasyPrivacy, HaGeZi Multi Light (GPL-3.0-only, https://github.com/hagezi/dns-blocklists), AdGuard Base and PersianBlocker. It hides leftover ad boxes on the page and closes tabs and windows that ads open from a page. Tabs you open yourself stay. Hiding needs it to work on the pages you open, so it asks for access to all sites. Closing needs it to see new tabs, and Chrome words that as "Read your browsing history". That warning is expected. Page contents and what it sees stay in your browser. The converter isn't complete yet: regex rules aren't converted, so some ads still show and now and then a page breaks, for example inside embedded frames. If that happens, pause the extension on that site from the toolbar popup.

The main switch and the switches for each group turn the rules on and off. The toolbar icon and the popup show how many items were blocked on the current page, with a count for each group and a "Your sites" line for sites you blocked yourself. In Settings you can add your own blocked sites, and CPAB blocks them and their subdomains everywhere. Allowed addresses works the other way: requests to an address you add, and its subdomains, are never blocked by the lists, on any site, though Blocked sites, Harmful sites and Adult sites stay blocked. An Exceptions for Iranian sites switch, on by default, adds a short list that CPAB keeps for Iranian sites that break otherwise. The blocked, paused and allowed lists each have a search box. Settings shows each list's rule count and date, and About credits the authors of every list. You can also change the language and theme. Your choices are saved in your browser.

The Popups switch turns the closing of ad tabs and windows on and off. The switches for widgets, harmful sites and adult sites are marked as coming in a later version.

## Load it in Chrome

You need Node.js 24 or newer.

```
npm test
npm run lists
npm run build
```

The build needs the lists. `npm run lists` fetches them to your machine, and that is also how the PersianBlocker list gets in.

Then open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select the `dist/` folder.

## Planned

- Widgets, and warnings for harmful sites.
- An optional block for adult sites.

## Licence

GPL-3.0-or-later, see `LICENSE`. The names and logos are not covered by that licence: see `NOTICE`. Third-party material is listed in `THIRD-PARTY-NOTICES.md`.
