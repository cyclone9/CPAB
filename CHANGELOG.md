# Changelog

## Unreleased

- A welcome page opens once after a fresh install and says what CPAB does, what it can't do, what it never collects and how to pause it on a site. About in Settings can open it again.
- Warning and blocked pages now open in incognito tabs instead of Chrome's error page, through `"incognito": "split"` in the manifest. The incognito worker leaves applying settings to the regular one. Allow in Incognito must be on in CPAB's details page in `chrome://extensions`.
- The data-leak line in the popup is red.
- A new Sources and credits section in Settings holds the list credits, moved from About, and the Have I Been Pwned link from under the Data-leak switch.
- Added a data-leak notice: the toolbar popup and the toolbar button's tooltip say when the open site is listed in Have I Been Pwned's breach catalogue (CC BY 4.0), with the years. The check runs on the device against a copy inside the extension, and it has its own switch in Protection.
- Sites you block yourself now show CPAB's blocked page, which says you blocked them, instead of Chrome's error page.
- Adult sites is now a working switch, off by default, with HaGeZi NSFW (GPL-3.0-only) as its source list. While it is on, a listed site is replaced by a blocked page that names only the site and the list, with Go back. The main switch, pausing a site and Allowed addresses don't lift it, and the popup says it stays on.
- Continue once now keeps the site open in that tab until you leave it, instead of warning again on the next page load.
- Harmful sites is now a working switch, on by default, with HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks (both GPL-3.0-only) as source lists, each with its own switch. A listed site is replaced by a warning page that names the site and the list, with Go back and Continue once.
- The main switch, pausing a site and Allowed addresses don't lift the warnings, and the popup says they stay on.
- malware-filter urlhaus-filter is not used: abuse.ch's terms of use since 2025-11-04 no longer put URLhaus data under CC0.
- Widgets is now a working switch, on by default, with AdGuard Widgets (GPL-3.0-only) and Fanboy's Social Blocking List (CC BY-SA 4.0) as source lists, each with its own switch; it hides chat and support bubbles and social media and share buttons, and gives back scrolling on sites AdGuard Widgets names.
- Fanboy's Annoyance list is not used, because half of it is EasyList Cookie rules, and hiding cookie notices can break consent walls.
- Popups now also hides pop-ups and overlays inside pages, using the AdGuard Popups filter as its source list with its own switch, and gives back scrolling on sites the list names.
- `:style()` rules are converted as plain CSS for AdGuard Popups only, with checks on every declaration; scriptlets are still never converted.
- HaGeZi Multi Light (GPL-3.0-only) is a second list under Trackers, with its own switch.
- A new Allowed addresses section in Settings: requests to those addresses and their subdomains are never blocked by the lists, on any site.
- An Exceptions for Iranian sites switch, on by default, allows the addresses in `lists/cpab-exceptions.txt`; the addresses you added yourself stay when it is off.
- Popup tabs that go to an allowed address stay open.
- `npm run lists -- <name>` fetches only the named lists, and HaGeZi is fetched at the exact commit it records.
- Site-specific hiding rules now go in an adopted stylesheet instead of a `<style>` element, so a page script that deletes style elements (as soft98.ir does every second) can no longer bring the ads back.
- Settings search for Blocked sites and Paused sites: results update as you type, 50 sites show at a time with a Show more button and a count line, and Escape clears the box.
- soft98.ir: the image block rules are gone and its ad boxes are moved off-screen with `:cpab-offscreen`, because the site detected the blocked images and zero-height boxes.
- A `:cpab-offscreen` mark for CPAB's own list: it moves a box above the page with no gap and no scroll and keeps its size, for sites that check box size or image errors.
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
