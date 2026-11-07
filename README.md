# CPAB - CyClone Power Ad Blocker

[English](README.md) | [فارسی](README.fa.md)

Status: private preview of `0.2.6`. It blocks ads and trackers, closes ad tabs and windows that a page opens, hides pop-ups, overlays, chat bubbles and social media buttons inside pages, and hides leftover ad boxes, so some ads still show and a site may occasionally need pausing.

The page stays, the ads go.

Free ad blocker. No data collected.

## What this version is

`0.2.6` blocks ads, trackers and Iranian ad networks with rules converted from EasyList, EasyPrivacy, HaGeZi Multi Light (GPL-3.0-only, https://github.com/hagezi/dns-blocklists), AdGuard Base, AdGuard Popups (GPL-3.0, by AdGuard), AdGuard Widgets (GPL-3.0, by AdGuard), Fanboy's Social Blocking List (CC BY-SA 4.0, by The EasyList authors) and PersianBlocker. Warnings for harmful sites come from HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks (both GPL-3.0-only). It hides leftover ad boxes, pop-ups, overlays, newsletter or notification prompts, chat and support bubbles, and social media and share buttons on the page, and gives back scrolling on sites where the list says how. It also closes tabs and windows that ads open from a page. Tabs you open yourself stay. Hiding needs it to work on the pages you open, so it asks for access to all sites. Closing needs it to see new tabs, and Chrome words that as "Read your browsing history". That warning is expected. Page contents and what it sees stay in your browser. The converter isn't complete yet: regex rules aren't converted, so some ads still show and now and then a page breaks, for example inside embedded frames. If that happens, pause the extension on that site from the toolbar popup.

The main switch and the switches for each group turn the rules on and off. The toolbar icon and the popup show how many items were blocked on the current page, with a count for each group and a "Your sites" line for sites you blocked yourself. In Settings you can add your own blocked sites, and CPAB blocks them and their subdomains everywhere. Allowed addresses works the other way: requests to an address you add, and its subdomains, are never blocked by the lists, on any site, though Blocked sites, Harmful sites and Adult sites stay blocked. An Exceptions for Iranian sites switch, on by default, adds a short list that CPAB keeps for Iranian sites that break otherwise. The blocked, paused and allowed lists each have a search box. Settings shows each list's rule count and date, and About credits the authors of every list. You can also change the language and theme. Your choices are saved in your browser.

The Popups switch turns the closing of ad tabs and windows, and the hiding of pop-ups and overlays inside pages, on and off. AdGuard Popups has its own switch under it. The Widgets switch, on by default, turns on the hiding of chat and support bubbles, social media and share buttons, and embedded social feeds inside pages. AdGuard Widgets and Fanboy's Social Blocking List each have their own switch under it. It doesn't cover sticky bars or recommendation boxes. The Harmful sites switch, on by default, shows a warning page before a site on one of its two lists opens: HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks (both GPL-3.0-only). The page names the site and the list, with Go back and Continue once; Continue once opens the site that one time, and the next visit warns again. Each list has its own switch. Pausing a site, the main switch and Allowed addresses don't lift the warning. The Adult sites switch is marked as coming in a later version.

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

- An optional block for adult sites.

## Licence

GPL-3.0-or-later, see `LICENSE`. The names and logos are not covered by that licence: see `NOTICE`. Third-party material is listed in `THIRD-PARTY-NOTICES.md`.
