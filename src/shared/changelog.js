// SPDX-License-Identifier: GPL-3.0-or-later
// What Settings shows under Changelog, newest first. Written for a reader, in both languages, and it
// ships in the package, so showing it makes no request. test/changelog.test.js fails if the manifest
// version has no entry here.
const SHOWN_VERSIONS = 3;

export const CHANGELOG = Object.freeze([
  {
    version: '0.3.5',
    date: '2026-11-08',
    en: [
      'The data-leak notice now also uses Leakfa\'s list of breached Iranian sites. On a listed site the popup and the toolbar tooltip add a line that names Leakfa as the source, with the site\'s name in your interface language. The check still runs on your device against a copy inside the extension.',
      'CPAB now has its own leak list for leaks the other sources miss. Each entry has the month it became public and a link to a public report, and shows as its own line, "Listed by CPAB". The list starts empty.',
    ],
    fa: [
      'اعلان نشت داده حالا فهرست لیکفا از سایت‌های ایرانیِ دچار نشت داده را هم به کار می‌برد. روی سایتی که در این فهرست است، پنجرهٔ کوچک افزونه و راهنمای دکمهٔ نوار ابزار خطی اضافه می‌کنند که لیکفا را منبع آن می‌داند و نام سایت را به زبان رابط نشان می‌دهد. بررسی همچنان روی همین دستگاه و با نسخه‌ای که درون افزونه است انجام می‌شود.',
      'تبلیغ‌شکن حالا فهرست نشت‌های خودش را هم دارد، برای نشت‌هایی که منبع‌های دیگر ندارند. هر مورد ماهی را که نشت در آن علنی شد و پیوندی به یک گزارش عمومی دارد و در خطی جدا نشان داده می‌شود که با «در فهرست نشت‌های تبلیغ‌شکن» شروع می‌شود. این فهرست فعلاً خالی است.',
    ],
  },
  {
    version: '0.3.4',
    date: '2026-11-08',
    en: [
      'When a newer version of CPAB is out, the popup says so in one line, and About in Settings links to it with the two steps to install it. The version number comes with the daily list check, so turning Daily list updates off turns this off too.',
      'Sources and credits is now the last section in Settings, after Changelog.',
      'The links in About sit in one row.',
    ],
    fa: [
      'وقتی نسخهٔ تازه‌تری از تبلیغ‌شکن بیاید، پنجرهٔ کوچک افزونه در یک خط آن را می‌گوید و بخش «درباره» در تنظیمات به آن پیوند می‌دهد، همراه با دو گام نصبش. شمارهٔ نسخه همراه بررسی روزانهٔ فهرست‌ها می‌آید، پس با خاموش کردن «به‌روزرسانی روزانهٔ فهرست‌ها» این هم خاموش می‌شود.',
      'بخش «منبع‌ها و سازندگان» حالا آخرین بخش تنظیمات است، بعد از «تاریخچهٔ تغییرات».',
      'پیوندهای بخش «درباره» حالا در یک ردیف کنار هم‌اند.',
    ],
  },
  {
    version: '0.3.3',
    date: '2026-11-08',
    en: [
      'The lists now update once a day from cpab.cyclone9.dev. CPAB checks each download\'s signature and contents before using it, keeps the lists it came with when anything is wrong, and downloads only lists that changed. The request carries nothing about you or your browsing.',
      'Settings has a new Updates section with the Daily list updates switch, when the lists are from, when they were last checked, and a Check now button. Off means CPAB makes no requests at all.',
      'Hiding rules that apply on every site still change only with a new version of CPAB.',
      'CPAB now needs Chrome 137 or newer.',
    ],
    fa: [
      'فهرست‌ها حالا روزی یک بار از cpab.cyclone9.dev به‌روز می‌شوند. تبلیغ‌شکن پیش از به کار بردن هر دانلود، امضا و محتوایش را بررسی می‌کند، اگر چیزی درست نباشد همان فهرست‌هایی را نگه می‌دارد که با آن آمده‌اند و فقط فهرست‌هایی را دانلود می‌کند که تغییر کرده‌اند. این درخواست هیچ چیزی دربارهٔ شما یا مرورتان با خود نمی‌برد.',
      'تنظیمات بخش تازهٔ «به‌روزرسانی» را دارد، با کلید «به‌روزرسانی روزانهٔ فهرست‌ها»، تاریخ فهرست‌ها، زمان آخرین بررسی و دکمهٔ «همین حالا بررسی کن». با خاموش بودن آن، تبلیغ‌شکن هیچ درخواستی نمی‌فرستد.',
      'قانون‌های پنهان‌سازی که روی همهٔ سایت‌ها اعمال می‌شوند، همچنان فقط با نسخهٔ تازهٔ تبلیغ‌شکن تغییر می‌کنند.',
      'تبلیغ‌شکن حالا به کروم ۱۳۷ یا بالاتر نیاز دارد.',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-11-08',
    en: [
      'The lists CPAB uses are now converted every day and published on cpab.cyclone9.dev, with a signature that shows they came from CPAB. CPAB itself doesn\'t download them yet: your copy keeps the lists that came with this version.',
    ],
    fa: [
      'فهرست‌هایی که تبلیغ‌شکن به کار می‌برد، حالا هر روز تبدیل و در cpab.cyclone9.dev منتشر می‌شوند، همراه با امضایی که نشان می‌دهد از تبلیغ‌شکن آمده‌اند. خود تبلیغ‌شکن هنوز آن‌ها را دانلود نمی‌کند و نسخهٔ شما همان فهرست‌هایی را نگه می‌دارد که با این نسخه آمده‌اند.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-11-08',
    en: [
      'Statistics shows four counts: today, yesterday, the last 7 days and the last 30 days. Daily totals are now kept for 30 days. Top 5 sites still covers the last 14 days, and older site names are deleted.',
      'Sources and credits names CPAB\'s own rules as such, lists them first and says they are written by hand.',
      'In Persian, the English list credits in Sources and credits read left to right, so brackets stay with their URL.',
      'About in Settings links to the source code and the lists repository on GitHub, and the welcome page has its own row.',
      'About in Settings lists the browsers: Chrome is tested, other Chromium-based browsers should work but are not tested, and Firefox is coming soon.',
    ],
    fa: [
      'بخش «آمار» حالا چهار شمارش دارد: امروز، دیروز، ۷ روز گذشته و ۳۰ روز گذشته. جمع‌های روزانه حالا ۳۰ روز نگه داشته می‌شوند. «۵ سایت اول» همچنان ۱۴ روز گذشته را در بر می‌گیرد و نام سایت‌های قدیمی‌تر پاک می‌شود.',
      'بخش «منبع‌ها و سازندگان» قانون‌های خود تبلیغ‌شکن را با همین نام و در ابتدای فهرست نشان می‌دهد و می‌گوید دستی نوشته شده‌اند.',
      'در نسخهٔ فارسی، اعتبارنامهٔ انگلیسی فهرست‌ها در «منبع‌ها و سازندگان» از چپ به راست نمایش داده می‌شود، پس پرانتزها کنار نشانی خودشان می‌مانند.',
      'بخش «درباره» در تنظیمات به کد منبع و مخزن فهرست‌ها در GitHub پیوند دارد و صفحهٔ خوش‌آمد ردیف جداگانهٔ خودش را دارد.',
      'بخش «درباره» مرورگرها را نام می‌برد: کروم آزمایش شده، مرورگرهای دیگر مبتنی بر کرومیوم باید کار کنند اما آزمایش نشده‌اند و فایرفاکس به‌زودی می‌آید.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-08',
    en: [
      'Sources and credits in Settings links to the lists repository on GitHub, where every list CPAB uses is kept as its own file with its source and licence.',
    ],
    fa: [
      'بخش «منبع‌ها و سازندگان» در تنظیمات حالا به مخزن فهرست‌ها در GitHub پیوند دارد. هر فهرستی که تبلیغ‌شکن به کار می‌برد، آنجا در فایلی جداگانه و همراه با منبع و مجوزش نگه داشته می‌شود.',
    ],
  },
  {
    version: '0.2.10',
    date: '2026-11-08',
    en: [
      'Settings has a new Statistics section with how much was blocked in this browser today, yesterday and over the last two weeks. The counts stay on your device, incognito windows aren\'t counted, and Clear empties them.',
      'Top 5 sites, off by default, lists the sites where the most was blocked over the last 14 days. The list stays on your device.',
    ],
    fa: [
      'تنظیمات بخش تازهٔ «آمار» را دارد که می‌گوید امروز، دیروز و در دو هفتهٔ گذشته چه مقدار در این مرورگر مسدود شده است. شمارش‌ها روی دستگاه شما می‌مانند، پنجره‌های ناشناس شمرده نمی‌شوند و دکمهٔ «پاک کردن آمار» همه را پاک می‌کند.',
      'گزینهٔ «۵ سایت اول» که از پیش خاموش است، سایت‌هایی را نشان می‌دهد که در ۱۴ روز گذشته بیشترین مسدودی را داشته‌اند. این فهرست روی دستگاه شما می‌ماند.',
    ],
  },
  {
    version: '0.2.9',
    date: '2026-11-08',
    en: [
      'A welcome page opens once after a fresh install. It says what CPAB does, what it can\'t do, what it never collects and how to pause it on a site. About in Settings can open it again.',
      'Warning and blocked pages now open in incognito tabs too, instead of Chrome\'s error page. For that, turn on Allow in Incognito on CPAB\'s details page in chrome://extensions.',
      'The data-leak line in the popup is now red.',
      'Settings has a new Sources and credits section with the authors, licence and date of every list. It replaces the credits that were under About.',
    ],
    fa: [
      'بعد از نصب تازه، یک صفحهٔ خوش‌آمد فقط یک بار باز می‌شود. می‌گوید تبلیغ‌شکن چه می‌کند، چه کاری از آن برنمی‌آید، چه چیزی را هرگز جمع نمی‌کند و چطور آن را روی یک سایت متوقف کنید. از «درباره» در تنظیمات می‌توانید دوباره بازش کنید.',
      'صفحه‌های هشدار و مسدودی حالا در زبانه‌های ناشناس هم باز می‌شوند، نه صفحهٔ خطای Chrome. برای این کار در صفحهٔ جزئیات تبلیغ‌شکن در chrome://extensions گزینهٔ Allow in Incognito را روشن کنید.',
      'خط نشت داده در پنجرهٔ کوچک افزونه حالا قرمز است.',
      'تنظیمات بخش تازهٔ «منبع‌ها و سازندگان» را دارد که سازنده، مجوز و تاریخ هر فهرست را می‌گوید و جای اعتبارهای قبلیِ بخش «درباره» را گرفته است.',
    ],
  },
  {
    version: '0.2.8',
    date: '2026-11-07',
    en: [
      'New data-leak notice. When the site you are on is listed in Have I Been Pwned\'s breach catalogue, the toolbar popup and the toolbar button\'s tooltip say so, with the years. The check runs on your device against a copy inside the extension, and it has its own switch in Protection.',
      'Sites you block yourself now show CPAB\'s blocked page, which says you blocked them, instead of Chrome\'s error page.',
    ],
    fa: [
      'اعلان نشت داده اضافه شد. اگر سایتی که باز کرده‌اید در فهرست نشت‌های Have I Been Pwned آمده باشد، پنجرهٔ کوچک افزونه و راهنمای دکمهٔ نوار ابزار آن را با سال‌های نشت (میلادی) نشان می‌دهند. مقایسه روی دستگاه شما و با نسخه‌ای از فهرست انجام می‌شود که درون افزونه است، و در بخش حفاظت کلید جداگانه دارد.',
      'سایت‌هایی که خودتان مسدود می‌کنید حالا به‌جای صفحهٔ خطای Chrome، صفحهٔ مسدودی تبلیغ‌شکن را نشان می‌دهند که می‌گوید خودتان مسدودشان کرده‌اید.',
    ],
  },
  {
    version: '0.2.7',
    date: '2026-11-07',
    en: [
      'The Adult sites switch now works and is off by default, with HaGeZi NSFW as its source list. While it is on, a listed site is replaced by a blocked page that names only the site and the list, with Go back. Pausing a site, the main switch and Allowed addresses leave it on.',
      'Continue once on a harmful-site warning now keeps the site open in that tab until you leave it, instead of warning again on the next page load. The next visit warns again.',
    ],
    fa: [
      'کلید سایت‌های بزرگسال حالا کار می‌کند و به‌طور پیش‌فرض خاموش است. فهرست مبدأ آن HaGeZi NSFW است. تا وقتی روشن باشد، سایتی که در فهرست آمده با صفحهٔ مسدودی جایگزین می‌شود که فقط نام سایت و فهرست را می‌گوید و دکمهٔ «بازگشت» دارد. متوقف کردن یک سایت، کلید اصلی و نشانی‌های مجاز آن را خاموش نمی‌کنند.',
      'دکمهٔ «فقط این بار ادامه بده» در هشدار سایت‌های مضر حالا سایت را در همان زبانه باز نگه می‌دارد تا وقتی از آن بیرون بروید، و دیگر با بارگذاری صفحهٔ بعدی دوباره هشدار نمی‌دهد. در بازدید بعدی دوباره هشدار می‌دهد.',
    ],
  },
  {
    version: '0.2.6',
    date: '2026-11-07',
    en: [
      'The Harmful sites switch now works and is on by default. Before a site on a harmful-sites list opens, CPAB shows a warning that names the site and the list, with Go back and Continue once.',
      'Harmful sites has two source lists, HaGeZi Threat Intelligence Feeds mini and uBlock filters - Badware risks, each with its own switch. Pausing a site or turning off the main switch leaves the warnings on.',
    ],
    fa: [
      'کلید سایت‌های مضر حالا کار می‌کند و به‌طور پیش‌فرض روشن است. پیش از باز شدن سایتی که در فهرست سایت‌های مضر آمده، تبلیغ‌شکن هشداری نشان می‌دهد که نام سایت و فهرست را می‌گوید و دو دکمهٔ «بازگشت» و «فقط این بار ادامه بده» دارد.',
      'این بخش دو فهرست مبدأ دارد، HaGeZi Threat Intelligence Feeds mini و uBlock filters - Badware risks، و هر کدام کلید جداگانه دارد. متوقف کردن یک سایت یا خاموش کردن کلید اصلی، هشدارها را خاموش نمی‌کند.',
    ],
  },
  {
    version: '0.2.5',
    date: '2026-11-07',
    en: [
      'The Widgets switch now works and is on by default. It hides chat and support bubbles, social media and share buttons, and embedded social feeds inside pages, and gives back scrolling on sites AdGuard Widgets names.',
      'Widgets has two source lists, AdGuard Widgets and Fanboy\'s Social Blocking List, each with its own switch.',
    ],
    fa: [
      'کلید کادرهای مزاحم حالا کار می‌کند و به‌طور پیش‌فرض روشن است. حباب‌های گفت‌وگو و پشتیبانی، دکمه‌های شبکه‌های اجتماعی و اشتراک‌گذاری و محتوای جاسازی‌شدهٔ این شبکه‌ها را در صفحه‌ها پنهان می‌کند و در سایت‌هایی که AdGuard Widgets نامشان را برده، اسکرول را آزاد می‌کند.',
      'این بخش دو فهرست مبدأ دارد، AdGuard Widgets و Fanboy\'s Social Blocking List، و هر کدام کلید جداگانه دارد.',
    ],
  },
  {
    version: '0.2.4',
    date: '2026-11-07',
    en: [
      'Pop-ups, overlays and newsletter or notification prompts inside pages are now hidden, using the AdGuard Popups list. It has its own switch under Popups.',
      'On sites the list names, scrolling that an overlay locked is given back.',
    ],
    fa: [
      'پاپ‌آپ‌ها، لایه‌های روی صفحه و درخواست‌های خبرنامه یا اعلان درون صفحه‌ها حالا پنهان می‌شوند. این کار با فهرست AdGuard Popups انجام می‌شود و زیر پاپ‌آپ‌ها کلید جداگانه دارد.',
      'در سایت‌هایی که فهرست نامشان را برده، اسکرولی که یک لایه قفل کرده بود آزاد می‌شود.',
    ],
  },
  {
    version: '0.2.3',
    date: '2026-11-07',
    en: [
      'Trackers has a second list, HaGeZi Multi Light, with its own switch.',
      'A new Allowed addresses section in Settings lists addresses CPAB never blocks, on any site. Tabs that ads open to an allowed address stay open.',
      'Exceptions for Iranian sites is on by default. It keeps the e-rasaneh.ir registration seal from being blocked.',
    ],
    fa: [
      'بخش ردیاب‌ها فهرست دومی دارد، HaGeZi Multi Light، با کلید جداگانهٔ خودش.',
      'بخش تازهٔ «نشانی‌های مجاز» در تنظیمات، نشانی‌هایی را نگه می‌دارد که تبلیغ‌شکن در هیچ سایتی مسدودشان نمی‌کند. زبانه‌هایی که تبلیغ‌ها به نشانی مجاز باز می‌کنند هم باز می‌مانند.',
      'کلید «استثناهای سایت‌های ایرانی» به‌طور پیش‌فرض روشن است و جلوی مسدود شدن نماد ثبت e-rasaneh.ir را می‌گیرد.',
    ],
  },
  {
    version: '0.2.2',
    date: '2026-11-07',
    en: [
      'soft98.ir no longer shows its "ad blocker detected" warning. Its ads also stay hidden after the page loads, instead of coming back a second later.',
      'Blocked sites and Paused sites in Settings have a search box.',
      'Both lists show 50 sites at a time, with a "Show 50 more" button and a count.',
    ],
    fa: [
      'soft98.ir دیگر هشدار «مسدودکنندهٔ تبلیغ شناسایی شد» را نشان نمی‌دهد. تبلیغ‌هایش هم پس از بازشدن صفحه پنهان می‌مانند و یک ثانیه بعد برنمی‌گردند.',
      'سایت‌های مسدودشده و سایت‌های متوقف‌شده در تنظیمات کادر جست‌وجو دارند.',
      'هر دو فهرست هر بار ۵۰ سایت را نشان می‌دهند، با دکمهٔ «نمایش ۵۰ سایت دیگر» و شمارنده.',
    ],
  },
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
