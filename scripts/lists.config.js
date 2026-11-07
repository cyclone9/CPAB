// SPDX-License-Identifier: GPL-3.0-or-later
// The lists CPAB uses, with their licences and admission records. `npm run lists` writes each entry
// to lists/<meta>, so the record sits beside the snapshot. The Iran record has its own file name
// because git-guard.sh refuses any path holding the list's name, and the record itself is fine in git.

const REVIEWED = '2026-11-04';

const EASYLIST_LICENCE = {
  name: 'CC BY-SA 4.0',
  spdx: 'CC-BY-SA-4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  source: 'GPL-3.0-or-later or CC BY-SA 3.0 or later, at our choice. CPAB takes the CC BY-SA side, at version 4.0, for the converted file.',
};

const easylistAdmission = (title) => ({
  reviewed: REVIEWED,
  result: 'admitted',
  checks: {
    licenceStated: `${title} header "Licence:" points to https://easylist.to/pages/licence.html, read through the Wayback Machine because the live page sits behind a Cloudflare challenge.`,
    licenceAccepted: 'GPL-3.0-or-later and CC BY-SA 3.0 or later are both on the accepted set.',
    notRefused: 'No NonCommercial or NoDerivatives term, nothing forbids redistribution or restricts the audience.',
    attribution: 'The EasyList authors (https://easylist.to/), shown in settings and THIRD-PARTY-NOTICES.md.',
    aggregated: 'Not an aggregate: built from the templates in the EasyList repository.',
    ownFile: 'The converted rules are one file of their own, never merged with another list.',
    retrievable: 'A stable URL, and the snapshot records the list\'s own version and commit.',
  },
});

export const LISTS = [
  {
    name: 'easylist',
    group: 'ads',
    ruleset: 'ads',
    listFile: 'easylist.txt',
    metaFile: 'easylist.meta.json',
    rulesFile: 'ads-easylist.json',
    required: true,
    title: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    homepage: 'https://easylist.to/',
    attribution: 'The EasyList authors (https://easylist.to/)',
    licence: EASYLIST_LICENCE,
    admission: easylistAdmission('EasyList'),
  },
  {
    name: 'adguard-base',
    group: 'ads',
    ruleset: 'ads-adguard-base',
    listFile: 'adguard-base.txt',
    metaFile: 'adguard-base.meta.json',
    rulesFile: 'ads-adguard-base.json',
    required: true,
    title: 'AdGuard Base filter',
    // AdGuard compiles this file, and the variant leaves out the part of the list that repeats EasyList.
    // It isn't in the repository, so the commit below is the repository's head when the file was fetched.
    url: 'https://filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt',
    commitApi: 'https://api.github.com/repos/AdguardTeam/AdguardFilters/commits/master',
    homepage: 'https://github.com/AdguardTeam/AdguardFilters',
    sourceLink: 'https://github.com/AdguardTeam/AdguardFilters',
    attribution: 'AdGuard (https://github.com/AdguardTeam/AdguardFilters)',
    licence: {
      name: 'GPL-3.0-only',
      spdx: 'GPL-3.0-only',
      url: 'https://www.gnu.org/licenses/gpl-3.0.html',
      source: 'The repository LICENSE is the GPLv3 text and the list header points to it, with no "or later", so CPAB treats the list as GPL-3.0-only. The same text ships as LICENSE at the top of the package.',
    },
    admission: {
      reviewed: '2026-11-06',
      result: 'admitted, with care',
      checks: {
        licenceStated: 'The list header "License:" points to https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE. That file was read on 2026-11-06: it is the GPLv3 text, byte-identical to CPAB\'s own LICENSE. The README states nothing different.',
        licenceAccepted: 'GPL-3.0 is on the accepted set, only or later.',
        notRefused: 'No NonCommercial or NoDerivatives term, nothing forbids redistribution or restricts the audience.',
        attribution: 'AdGuard (https://github.com/AdguardTeam/AdguardFilters), shown in settings and THIRD-PARTY-NOTICES.md.',
        aggregated: 'Treated as AdGuard\'s own list, on limited evidence: the fetched file has no !#include line and the repository README names no third-party inputs. Not verified beyond that: the compiler\'s inputs were not traced, and this variant is known to be free of EasyList only by its name.',
        ownFile: 'The converted rules are one file of their own, never merged with another list, under GPL-3.0-only. The GPLv3 text is in the package as LICENSE.',
        retrievable: 'A stable URL, a dated snapshot with its SHA-256 and the list\'s own Version line. The recorded commit is the head of AdguardFilters just after the download, so the file was built from that commit or an earlier one; the snapshot in lists/ is the exact copy used.',
      },
    },
  },
  {
    name: 'persianblocker',
    group: 'ads',
    descriptionKey: 'listIranDesc',
    ruleset: 'iran',
    listFile: 'persianblocker.txt',
    metaFile: 'iran.meta.json',
    rulesFile: 'iran-persianblocker.json',
    required: false,
    title: 'PersianBlocker',
    url: 'https://github.com/PersianBlocker/PersianBlocker',
    // PersianBlocker.txt is only an index of !#include lines. These are the parts CPAB uses, joined in
    // this order. Left out: Censor and HalfPrice aren't ads; Annoyances, Mobile, SMS, Malware and
    // Phishing wait for later.
    repository: {
      commitApi: 'https://api.github.com/repos/PersianBlocker/PersianBlocker/commits/main',
      raw: 'https://raw.githubusercontent.com/PersianBlocker/PersianBlocker',
      files: [
        { name: 'PersianBlocker-Deprecated.txt' },
        { name: 'PersianBlockerAds.txt' },
        { name: 'PersianBlockerTrackers.txt' },
        { name: 'PersianBlockerHosts.txt', format: 'hosts' },
      ],
    },
    homepage: 'https://github.com/PersianBlocker/PersianBlocker',
    sourceLink: 'https://github.com/PersianBlocker/PersianBlocker',
    attribution: 'The PersianBlocker authors (https://github.com/PersianBlocker/PersianBlocker)',
    licence: {
      name: 'AGPL-3.0-only',
      spdx: 'AGPL-3.0-only',
      url: 'https://www.gnu.org/licenses/agpl-3.0.html',
      copy: 'LICENSE.AGPL-3.0.txt',
      source: 'The repository LICENSE is the AGPLv3 text and the list headers say AGPLv3 with no "or later", so CPAB treats the list as AGPL-3.0-only.',
    },
    admission: {
      reviewed: '2026-11-04',
      result: 'admitted, with care',
      checks: {
        licenceStated: 'The repository LICENSE on GitHub is the AGPLv3 text, byte-identical to lists/LICENSE.AGPL-3.0.txt (SHA-256 8486a10c...f07ef), and the list headers point to it.',
        licenceAccepted: 'AGPL-3.0 is on the accepted set.',
        notRefused: 'No NonCommercial or NoDerivatives term. The README of the earlier Codeberg copy asks that the list not be uploaded to GitHub: a request, not a licence term, and CPAB keeps the snapshot off GitHub until the owner decides otherwise.',
        attribution: 'Named in settings and THIRD-PARTY-NOTICES.md, with a link to the source.',
        aggregated: 'Not an aggregate: PersianBlocker/PersianBlocker is a GitHub fork of MasterKia/PersianBlocker, carrying on that project\'s own list under the same licence.',
        ownFile: 'The converted rules are one file of their own, with the AGPL text beside them.',
        retrievable: 'A stable repository, and the snapshot records the commit it was fetched at. The parts are joined in the listed order, with PersianBlockerHosts.txt rewritten from host-file lines to ||domain^ rules.',
      },
    },
  },
  // Written here, not fetched: its record is lists/cpab-own.meta.json, kept by hand.
  {
    name: 'cpab-own',
    group: 'ads',
    ruleset: 'cpab-own',
    listFile: 'cpab-own.txt',
    metaFile: 'cpab-own.meta.json',
    rulesFile: 'ads-cpab-own.json',
    required: true,
    listed: false,
    ownFormat: true,
    title: 'CPAB',
    homepage: 'https://cyclone9.dev/cpab',
    attribution: 'CPAB',
    licence: {
      name: 'GPL-3.0-or-later',
      spdx: 'GPL-3.0-or-later',
      url: 'https://www.gnu.org/licenses/gpl-3.0.html',
      source: 'CPAB\'s own rules, under the same licence as its code.',
    },
    admission: {
      reviewed: '2026-11-06',
      result: 'own list',
      checks: {
        licenceStated: 'The file header says GPL-3.0-or-later.',
        licenceAccepted: 'CPAB\'s own licence.',
        notRefused: 'No term limits it.',
        attribution: 'Named in settings as CPAB.',
        aggregated: 'Not an aggregate: every rule is written by hand, never copied from another list.',
        ownFile: 'One output file of its own.',
        retrievable: 'The file is in this repository.',
      },
    },
  },
  {
    name: 'easyprivacy',
    group: 'trackers',
    ruleset: 'trackers',
    listFile: 'easyprivacy.txt',
    metaFile: 'easyprivacy.meta.json',
    rulesFile: 'trackers-easyprivacy.json',
    required: true,
    title: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    homepage: 'https://easylist.to/',
    attribution: 'The EasyList authors (https://easylist.to/)',
    licence: EASYLIST_LICENCE,
    admission: easylistAdmission('EasyPrivacy'),
  },
  {
    name: 'hagezi-light',
    group: 'trackers',
    descriptionKey: 'listHageziDesc',
    ruleset: 'trackers-hagezi-light',
    listFile: 'hagezi-light.txt',
    metaFile: 'hagezi-light.meta.json',
    rulesFile: 'trackers-hagezi-light.json',
    required: true,
    title: 'HaGeZi Multi Light',
    fileTitle: 'HaGeZi\'s Multi LIGHT',
    url: 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt',
    // The file is rebuilt several times a day, so it is fetched at the last commit that changed it.
    pinned: {
      commitsApi: 'https://api.github.com/repos/hagezi/dns-blocklists/commits?path=adblock/light.txt&per_page=1',
      raw: 'https://raw.githubusercontent.com/hagezi/dns-blocklists',
      path: 'adblock/light.txt',
    },
    homepage: 'https://github.com/hagezi/dns-blocklists',
    sourceLink: 'https://github.com/hagezi/dns-blocklists',
    attribution: 'HaGeZi (https://github.com/hagezi/dns-blocklists)',
    licence: {
      name: 'GPL-3.0-only',
      spdx: 'GPL-3.0-only',
      url: 'https://www.gnu.org/licenses/gpl-3.0.html',
      source: 'The repository LICENSE is the GPLv3 text and the list header points to it, with no "or later", so CPAB treats the list as GPL-3.0-only. The same text ships as LICENSE at the top of the package.',
    },
    admission: {
      reviewed: '2026-11-07',
      result: 'admitted, with care',
      checks: {
        licenceStated: 'The list header "License:" points to https://github.com/hagezi/dns-blocklists/blob/main/LICENSE. That file was read on 2026-11-07: it is the GPLv3 text, byte-identical to CPAB\'s own LICENSE.',
        licenceAccepted: 'GPL-3.0 is on the accepted set, only or later.',
        notRefused: 'No NonCommercial or NoDerivatives term, nothing forbids redistribution or restricts the audience.',
        attribution: 'HaGeZi (https://github.com/hagezi/dns-blocklists), shown in settings and THIRD-PARTY-NOTICES.md.',
        aggregated: 'An aggregate. Its inputs are listed in sources.md at commit acded31b209c342f06c38af538281c7ed306202e, and FAQ section 11 says none is copied one to one: HaGeZi rewrites them. 21 inputs were spot-checked on 2026-11-07, all on the accepted set (GPL-3.0, MIT, MPL-2.0, Unlicense, CC0, CC BY-SA 4.0, CC BY 4.0, CC BY 3.0, AGPL-3.0). Not verified: cbuijs/ut1, DandelionSprout/adfilt, pgl.yoyo.org, big.oisd.nl, two Codeberg inputs and about 150 regional ones. One input is the Codeberg copy of PersianBlocker: CPAB doesn\'t copy that file, and the owner accepted the list with it (PRD D21). Care: read sources.md again at each snapshot.',
        ownFile: 'The converted rules are one file of their own, never merged with another list, under GPL-3.0-only. The GPLv3 text is in the package as LICENSE.',
        retrievable: 'A stable repository. The snapshot is fetched at the last commit that changed adblock/light.txt and records that commit, the list\'s own Version line and its SHA-256.',
      },
    },
  },
];

// Stored under this name beside the rule file, because AGPLv3 needs the text with the work.
export const AGPL_TEXT = {
  url: 'https://raw.githubusercontent.com/PersianBlocker/PersianBlocker/main/LICENSE',
  file: 'LICENSE.AGPL-3.0.txt',
};
