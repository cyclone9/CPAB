// SPDX-License-Identifier: GPL-3.0-or-later
// What Settings shows under Changelog, newest first. Written for a reader, in both languages, and it
// ships in the package, so showing it makes no request. test/changelog.test.js fails if the manifest
// version has no entry here.
const SHOWN_VERSIONS = 3;

export const CHANGELOG = Object.freeze([
  {
    version: '0.2.1',
    date: '2026-11-07',
    en: [
      'Tabs and windows that ads open from a page now close by themselves. The Popups switch in Settings turns this on and off.',
      'Tabs you open yourself stay open.',
      'CPAB now asks to see new tabs, which Chrome shows as "Read your browsing history". What it sees stays on your device.',
      'Ad banners and boxes on soft98.ir are now removed.',
    ],
    fa: [
      'زبانه‌ها و پنجره‌هایی که تبلیغ‌ها از داخل یک صفحه باز می‌کنند حالا خودبه‌خود بسته می‌شوند. کلید پاپ‌آپ‌ها در تنظیمات این کار را روشن و خاموش می‌کند.',
      'زبانه‌هایی که خودتان باز می‌کنید باز می‌مانند.',
      'تبلیغ‌شکن حالا اجازهٔ دیدن زبانه‌های تازه را می‌خواهد که کروم آن را «خواندن تاریخچهٔ مرور» نشان می‌دهد. آنچه می‌بیند روی دستگاه شما می‌ماند.',
      'بنرها و کادرهای تبلیغ در soft98.ir حالا حذف می‌شوند.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-06',
    en: [
      'Empty ad boxes and other leftovers are now hidden from the page.',
      'CPAB now asks for access to all sites, because hiding needs it.',
      'Ad blocking for Iranian sites now sits under Ads as a third source list, PersianBlocker, with its own switch. There is one Ads switch, and your choice stays as it was.',
      'A first rule of CPAB\'s own hides the top banner on kojaro.com.',
    ],
    fa: [
      'کادرهای خالی تبلیغ و بقایای آن‌ها حالا از صفحه پنهان می‌شوند.',
      'تبلیغ‌شکن حالا دسترسی به همهٔ سایت‌ها را می‌خواهد، چون پنهان‌کردن به آن نیاز دارد.',
      'مسدودکردن تبلیغ‌های سایت‌های ایرانی حالا زیر تبلیغ‌ها و به‌عنوان فهرست سوم، یعنی PersianBlocker، با کلید خودش قرار دارد. حالا یک کلید برای تبلیغ‌ها هست و انتخاب شما همان می‌ماند.',
      'اولین قانون خود تبلیغ‌شکن بنر بالای kojaro.com را پنهان می‌کند.',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-11-06',
    en: [
      'Blocking is unchanged. Memory use, updates and the way to hide ad boxes were checked.',
    ],
    fa: [
      'مسدودکردن تغییری نکرده است. مصرف حافظه، به‌روزرسانی و روش پنهان‌کردن جای تبلیغ بررسی شد.',
    ],
  },
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
