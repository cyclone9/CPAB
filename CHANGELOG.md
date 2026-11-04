# Changelog

## Unreleased

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

## 0.1.0 - 2026-11-04

- Toolbar popup with a pause switch for the current site and a main on/off switch.
- Settings page with sections for blocking, protection, paused sites, appearance and language, and about.
- Paused sites list with domain checks and subdomain coverage.
- English and Persian interface, with right-to-left layout for Persian.
- Dark and light themes.
- Nothing is blocked yet; popups, widgets, harmful sites and adult sites are shown as coming in a later version.
