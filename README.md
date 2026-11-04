# CPAB - CyClone Power Ad Blocker

[English](README.md) | [فارسی](README.fa.md)

Status: private preview of `0.1.0`. It doesn't block anything yet.

The page stays, the ads go.

Nothing leaves your browser.

## What this version is

`0.1.0` is the interface: the toolbar popup and the settings page, in English and Persian, with a dark and a light theme. You can pause the extension on a site, turn the main switch on and off, and change the language and theme. These choices are saved in your browser.

Blocking comes next. Until then the extension does not touch any page, and the switches for popups, widgets, harmful sites and adult sites are marked as coming in a later version.

## Load it in Chrome

You need Node.js 24 or newer.

```
npm test
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and select the `dist/` folder.

## Planned

- Blocking for ads, trackers and Iranian ad networks.
- Popups, widgets, and warnings for harmful sites.
- An optional block for adult sites.

## Licence

GPL-3.0-or-later, see `LICENSE`. The names and logos are not covered by that licence: see `NOTICE`. Third-party material is listed in `THIRD-PARTY-NOTICES.md`.
