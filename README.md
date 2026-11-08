# CPAB - CyClone Power Ad Blocker

[English](README.md) | [فارسی](README.fa.md)

Status: preview of `0.3.4`, installed through developer mode for now (no store, no release download yet). It blocks ads and trackers, closes ad tabs and windows that a page opens, hides pop-ups, overlays, chat bubbles and social media buttons inside pages, and hides leftover ad boxes, so some ads still show and a site may occasionally need pausing.

The page stays, the ads go.

Free ad blocker. No data collected.

## What this version is

`0.3.4` blocks ads, trackers and Iranian ad networks with rules converted from EasyList, EasyPrivacy, HaGeZi Multi Light (GPL-3.0-only, https://github.com/hagezi/dns-blocklists), AdGuard Base, AdGuard Popups (GPL-3.0, by AdGuard), AdGuard Widgets (GPL-3.0, by AdGuard), Fanboy's Social Blocking List (CC BY-SA 4.0, by The EasyList authors) and PersianBlocker. Warnings for harmful sites come from HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks (both GPL-3.0-only). The optional Adult sites block comes from HaGeZi NSFW (GPL-3.0-only). It hides leftover ad boxes, pop-ups, overlays, newsletter or notification prompts, chat and support bubbles, and social media and share buttons on the page, and gives back scrolling on sites where the list says how. It also closes tabs and windows that ads open from a page. Tabs you open yourself stay. Hiding needs it to work on the pages you open, so it asks for access to all sites. Closing needs it to see new tabs, and Chrome words that as "Read your browsing history". That warning is expected. Page contents and what it sees stay in your browser. The converter isn't complete yet: regex rules aren't converted, so some ads still show and now and then a page breaks, for example inside embedded frames. If that happens, pause the extension on that site from the toolbar popup.

The main switch and the switches for each group turn the rules on and off. The toolbar icon and the popup show how many items were blocked on the current page, with a count for each group and a "Your sites" line for sites you blocked yourself. In Settings you can add your own blocked sites, and CPAB blocks them and their subdomains everywhere, showing its own blocked page that says you blocked them instead of Chrome's error page. Allowed addresses works the other way: requests to an address you add, and its subdomains, are never blocked by the lists, on any site, though Blocked sites, Harmful sites and Adult sites stay blocked. An Exceptions for Iranian sites switch, on by default, adds a short list that CPAB keeps for Iranian sites that break otherwise. The blocked, paused and allowed lists each have a search box. Settings shows each list's rule count and date, and Sources and credits names the authors, licence and date of every list. You can also change the language and theme. Your choices are saved in your browser. A welcome page opens once after you install it, and About in Settings can open it again. Statistics in Settings counts what was blocked in this browser today, yesterday, over the last 7 days and over the last 30 days, harmful-site warnings included. Daily totals stay on your device for 30 days, incognito windows aren't counted, and Clear statistics empties them. Top 5 sites, off by default, lists the 5 sites with the most blocks over the last 14 days. To count, CPAB asks for the `webRequest` permission. It only observes, and Chrome shows no new warning for it.

The Popups switch turns the closing of ad tabs and windows, and the hiding of pop-ups and overlays inside pages, on and off. AdGuard Popups has its own switch under it. The Widgets switch, on by default, turns on the hiding of chat and support bubbles, social media and share buttons, and embedded social feeds inside pages. AdGuard Widgets and Fanboy's Social Blocking List each have their own switch under it. It doesn't cover sticky bars or recommendation boxes. The Harmful sites switch, on by default, shows a warning page before a site on one of its two lists opens: HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks (both GPL-3.0-only). The page names the site and the list, with Go back and Continue once; Continue once keeps the site open in that tab until you leave it; the next visit warns again. Each list has its own switch. Pausing a site, the main switch and Allowed addresses don't lift the warning. The Adult sites switch is off by default and always your choice. While it is on, a site on the HaGeZi NSFW list is replaced by a blocked page that names only the site and the list, with Go back and no way to continue. Pausing a site, the main switch and Allowed addresses don't lift it, and the popup says it stays on. The list can't cover every adult site. The data-leak notice, on by default and under Protection in Settings, adds a line to the toolbar popup and the toolbar button's tooltip when the open site is listed in the Have I Been Pwned breach catalogue (CC BY 4.0, https://haveibeenpwned.com/), with the breach name and years and a link to the source. CPAB checks the site against a copy inside the extension, on your device, and sends nothing. The pause and the main switch don't hide it, and it doesn't say a site is unsafe or cover every breach.

CPAB is built and tested in Chrome. Other Chromium-based browsers such as Edge, Brave and Opera should work the same way but are not tested yet. Firefox: coming soon. CPAB needs Chrome 137 or newer.

Once a day CPAB downloads new list data from https://cpab.cyclone9.dev/, where a GitHub Action publishes the converted lists, signed. One plain request fetches the version file and its signature, then only the lists that changed. It sends no cookies and no identifier, and nothing about you or your browsing. CPAB checks the signature and the data before using them, and keeps the lists that came with the version if anything is wrong. The Daily list updates switch under Updates in Settings turns it off, and then CPAB makes no requests at all; Check now runs it on demand. Hiding rules that apply on every site still change only with a new version of CPAB. When a newer version has been published, the popup and About in Settings say so and link to https://github.com/cyclone9/CPAB. To install it, unzip it over the same folder, then press Reload on CPAB in `chrome://extensions`. The version number comes with the daily check, so turning the switch off turns the notice off too.

## Load it in Chrome

You need Node.js 24 or newer.

```
npm test
npm run lists
npm run build
```

The build needs the lists. `npm run lists` fetches them to your machine, and that is also how the PersianBlocker list gets in.

Then open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select the `dist/` folder. To use CPAB in incognito windows, also turn on Allow in Incognito on CPAB's details page in `chrome://extensions`.

## Licence

GPL-3.0-or-later, see `LICENSE`. The names and logos are not covered by that licence: see `NOTICE`. Third-party material is listed in `THIRD-PARTY-NOTICES.md`.
