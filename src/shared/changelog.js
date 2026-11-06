// SPDX-License-Identifier: GPL-3.0-or-later
// What Settings shows under Changelog, newest first. Written for a reader, in both languages, and it
// ships in the package, so showing it makes no request. test/changelog.test.js fails if the manifest
// version has no entry here.
const SHOWN_VERSIONS = 3;

export const CHANGELOG = Object.freeze([
  {
    version: '0.1.5',
    date: '2026-11-06',
    en: [
      'Each source list now has its own switch, under Ads in Settings.',
      'AdGuard Base joins EasyList as a second ad list.',
      'Settings has this new Changelog section.',
    ],
    fa: [
      'هر فهرست منبع حالا کلید جداگانه دارد؛ در تنظیمات، زیر تبلیغ‌ها.',
      'فهرست AdGuard Base به‌عنوان فهرست دوم تبلیغ‌ها کنار EasyList اضافه شد.',
      'تنظیمات حالا این بخش تاریخچهٔ تغییرات را دارد.',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-11-06',
    en: [
      'Banners that sites like fararu.com serve from their own servers are now blocked.',
      'More rules meant for one specific site now apply.',
      'A new version now replaces the old copy instead of installing beside it.',
    ],
    fa: [
      'بنرهایی که سایت‌هایی مثل fararu.com از سرور خودشان نشان می‌دهند حالا مسدود می‌شوند.',
      'قانون‌های بیشتری که مخصوص یک سایت‌اند حالا اعمال می‌شوند.',
      'نسخهٔ تازه حالا جای نسخهٔ قبلی را می‌گیرد و کنار آن نصب نمی‌شود.',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-11-06',
    en: [
      'Rules tied to a named site now apply, so fewer sites break.',
    ],
    fa: [
      'قانون‌هایی که مخصوص یک سایت مشخص‌اند حالا اعمال می‌شوند، پس سایت‌های کمتری خراب می‌شوند.',
    ],
  },
]);

export const recentChangelog = () => CHANGELOG.slice(0, SHOWN_VERSIONS);
