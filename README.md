# CPAB - CyClone Power Ad Blocker

[English](README.md) | [فارسی](README.fa.md)

Status: private preview of `0.1.1`. It blocks ads and trackers with a simple set of rules, so some ads still show and a site may occasionally need pausing.

The page stays, the ads go.

Nothing leaves your browser.

## What this version is

`0.1.1` blocks ads, trackers and Iranian ad networks with simple rules converted from EasyList, EasyPrivacy and PersianBlocker. Simple rules miss some ads, and now and then one breaks a page. If that happens, pause the extension on that site from the toolbar popup.

The main switch and the switches for each group turn the rules on and off. The toolbar icon and the popup show how many items were blocked on the current page, with a count for each group and a "Your sites" line for sites you blocked yourself. In Settings you can add your own blocked sites, and CPAB blocks them and their subdomains everywhere. Settings shows each list's rule count and date, and About credits the authors of every list. You can also change the language and theme. Your choices are saved in your browser.

The switches for popups, widgets, harmful sites and adult sites are marked as coming in a later version.

## Load it in Chrome

You need Node.js 24 or newer.

```
npm test
npm run lists
npm run build
```

The build needs the lists. `npm run lists` fetches them to your machine, and that is also how the Iran list gets in.

Then open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select the `dist/` folder.

## Planned

- Popups, widgets, and warnings for harmful sites.
- An optional block for adult sites.

## Licence

GPL-3.0-or-later, see `LICENSE`. The names and logos are not covered by that licence: see `NOTICE`. Third-party material is listed in `THIRD-PARTY-NOTICES.md`.
