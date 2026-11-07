# Changelog

## Unreleased

- Both READMEs now describe 0.2.1: ad tabs and windows that a page opens are closed, and Chrome's "Read your browsing history" warning is expected.
- Both READMEs now describe 0.2.0: leftover ad boxes are hidden, access to all sites is requested, and PersianBlocker is named as a list under Ads.
- List snapshots now record their checksum after line endings are normalised, so it matches the stored file.
- The motto is now "Free ad blocker. No data collected.", in both languages and both READMEs.
- About no longer lists the typeface, and its links now sit right below the version.
- Ads, Trackers and Iran now block for real, through rules converted from EasyList, EasyPrivacy and PersianBlocker, one file per list.
- The main switch and the group switches turn those rules on and off, and pausing a site lets everything on it through.
- The Iran list now comes from the maintained PersianBlocker repository, joined from its older list and its ads, trackers and hosts files.
- The toolbar icon shows the blocked count in Ink on Citron, and honours its switch in settings.
- The popup shows how many items were blocked on the current page.
- The popup splits that count into Ads, Trackers and Iran, and leaves out any group that blocked nothing.
- Settings shows each list's real rule count and snapshot date, says when a list isn't in the build, and reports a list Chrome refuses.
- About credits each list with its authors, homepage, licence and snapshot date, and `THIRD-PARTY-NOTICES.md` matches.
- `npm run lists` fetches the list snapshots, and `npm run build` converts them and prints what it dropped, per list and per reason.
- Settings has a Blocked sites section: add a domain and CPAB blocks it and its subdomains everywhere, even when opened directly, until you remove it or turn the main switch off.
- The popup counts your blocked sites as a "Your sites" line, and hides the pause button on a site you blocked.
- About shows the full name, with the Persian name in Persian, and links to the family page and the site.
- The "nothing is blocked yet" notice is gone from the popup and settings.
- The popup's Settings link is now a button, and Latin text sits centred in buttons and tags.
- Rules that name a path, such as an ad folder on a shared host, now block too, with their exceptions, and the build report gives an exact reason for every line it drops.
- Rules and exceptions tied to a site now apply, so fewer sites break, the few pages a list names as whole-page exceptions are left alone, and `$badfilter` cancels a rule within its own list.
- Rules using `from=` now apply, broad rules tied to a named site are no longer refused, and a manifest `key` keeps the extension's ID the same from any folder, so a new version replaces the old one and keeps its settings.
- Ads now has a second source list, AdGuard Base (the variant without EasyList), in its own rule file with its own licence and credits.
- In Settings, Ads opens to show its source lists, each with its own switch, rule count and date. Turning the group off keeps each list's choice, and settings saved by 0.1.4 carry over unchanged.
- Settings has a Changelog section with the last three versions, in English and Persian, and marks the version running.
- `npm run lists` can pin a compiled list to its repository's commit, and `THIRD-PARTY-NOTICES.md` now records each list's version.
- Popup ad tabs and windows now close: `$popup` rules convert to one data file per list, a small matcher in the service worker judges new tabs, and the Popups switch is live; this adds the `webNavigation` permission.
- `lists/cpab-own.txt` now blocks soft98.ir's banner images and collapses its ad boxes, through a `:cpab-collapse` mark that only this list may use, because the page forces `display` back inline.
- Ad boxes are now hidden with each list's CSS rules, generic ones as registered stylesheets and site ones from local storage, following every switch and the site pause; this adds the `scripting` and all-sites permissions, and `lists/cpab-own.txt` now builds as a list of its own with a rule for kojaro.com.
- The Iran group is gone: PersianBlocker sits under Ads as a third source list with its own switch, file and licence, and a saved Iran choice carries over.

## 0.1.0 - 2026-11-04

- Toolbar popup with a pause switch for the current site and a main on/off switch.
- Settings page with sections for blocking, protection, paused sites, appearance and language, and about.
- Paused sites list with domain checks and subdomain coverage.
- English and Persian interface, with right-to-left layout for Persian.
- Dark and light themes.
- Nothing is blocked yet; popups, widgets, harmful sites and adult sites are shown as coming in a later version.
