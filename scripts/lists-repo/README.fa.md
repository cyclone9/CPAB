# CPAB-Lists

[English](README.md) | [فارسی](README.fa.md)

<div dir="rtl">

فهرست‌هایی که CPAB - CyClone Power Ad Blocker (تبلیغ‌شکن) از آن‌ها استفاده می‌کند، هر کدام در فایل جداگانه و با منبع، نام سازنده و مجوز خودش، به‌علاوهٔ قانون‌های خود تبلیغ‌شکن. تبلیغ‌شکن یک افزونهٔ مرورگر است؛ سایتش https://cpab.cyclone9.dev/ و صفحهٔ خانوادگی‌اش https://cyclone9.dev/cpab است.

## اینجا چه هست

<div dir="ltr">

```
README.md, README.fa.md, LICENSE   # LICENSE is GPLv3, for cpab-own.txt, cpab-exceptions.txt and cpab-leaks.txt
SOURCES.md                         # generated: every list with attribution, homepage, source URL, licence, snapshot date or commit, SHA-256
cpab-own.txt                       # CPAB's own rules, written by hand from reports
cpab-exceptions.txt                # domains the "Exceptions for Iranian sites" switch allows, each with a dated reason
cpab-leaks.txt                     # CPAB's own data-leak list, written by hand, each entry with a public source
sources/<name>/<name>.txt          # an unmodified snapshot of each list CPAB uses
sources/<name>/meta.json           # where it came from and when
sources/<name>/LICENSE.txt         # the licence text, where the licence needs a copy
sources/<name>/<name>.json         # same as the .txt snapshot, for lists that are JSON (the Leakfa data-leak list)
```

</div>

تنها نسخهٔ ذخیره‌شده‌ای که تغییر می‌کند مال PersianBlocker است: بخش‌هایش در یک فایل کنار هم می‌آیند و هر بخش زیر یک خط `! ==== name ====` قرار می‌گیرد، و بخش فایل hosts آن به قانون‌های `||domain^` بازنویسی می‌شود. توضیحش در `meta.json` همان فهرست و در `SOURCES.md` آمده است.

## فهرست‌ها از تبلیغ‌شکن نیستند

هر فهرست زیر `sources/` مال سازندگانش است و مجوز خودش را نگه می‌دارد. فهرست‌ها هیچ‌وقت با هم ادغام نمی‌شوند: برای هر فهرست یک فایل، تا مجوز هر فایل درست بماند. نام سازنده، صفحهٔ اصلی، نشانی منبع، مجوز، تاریخ یا کامیت نسخه و SHA-256 هر فهرست در `SOURCES.md` آمده است و مجوزها را باید همان‌جا دید.

| گروه | فهرست‌ها |
|---|---|
| تبلیغ‌ها | فهرست‌های EasyList، AdGuard Base و PersianBlocker |
| ردیاب‌ها | فهرست‌های EasyPrivacy و HaGeZi Multi Light |
| پاپ‌آپ‌ها | فهرست AdGuard Popups |
| ابزارک‌ها | فهرست‌های AdGuard Widgets و Fanboy's Social |
| سایت‌های مضر | فهرست‌های HaGeZi TIF mini و uBlock filters - Badware risks |
| سایت‌های بزرگسال | فهرست HaGeZi NSFW |

فهرست PersianBlocker از https://github.com/PersianBlocker/PersianBlocker و از یک کامیت مشخص گرفته شده و مجوزش AGPL-3.0 است.

## گزارش یک سایت

در تبلیغ‌شکن، در پنجرهٔ کوچک افزونه «گزارش این سایت» را بزنید. متنی را که می‌فرستد نشان می‌دهد و بعد یک مورد از پیش پرشده را همین‌جا باز می‌کند. خودتان هم می‌توانید با فرم «سایت خراب» (تبلیغ‌شکن صفحه‌ای را خراب می‌کند) یا فرم «پیشنهاد یک سایت» (تبلیغ، پاپ‌آپ یا ردیاب رد می‌شود) مورد تازه باز کنید. موردها عمومی‌اند، پس نام سایت را بنویسید، نه نشانی کامل یک صفحهٔ خصوصی را.

## به‌روزرسانی

فعلاً نسخه‌ها را دستی به‌روز می‌کنیم. به‌روزرسانی خودکار و زمان‌بندی ثابتی وجود ندارد.

## قانون‌های خود تبلیغ‌شکن

فایل `cpab-own.txt` قانون‌هایی دارد که با دست و از گزارش دربارهٔ سایت‌های مشخص نوشته شده‌اند. بالای هر قانون یک توضیح با تاریخ و نام سایتِ مبدأ هست. بعضی قانون‌ها به `:cpab-offscreen` ختم می‌شوند؛ نشانه‌ای که فقط تبلیغ‌شکن می‌فهمد و کادر را با اندازهٔ کامل از دید بیرون می‌برد. مسدودکننده‌های دیگر آن را نمی‌شناسند.

فایل `cpab-exceptions.txt` دامنه‌هایی را فهرست می‌کند که کلید «استثناهای سایت‌های ایرانی» در تبلیغ‌شکن آزاد می‌گذارد، هر کدام با دلیلی که تاریخ دارد.

## فهرست نشت‌های خود تبلیغ‌شکن

فایل `cpab-leaks.txt` سایت‌هایی را نام می‌برد که نشت داده‌شان شناخته‌شده است و منبع‌های دیگر نشت داده آن‌ها را ندارند. اعلان نشت داده در تبلیغ‌شکن اگر سایتی در این فایل باشد، آن را در خطی جدا و با عبارت «در فهرست نشت‌های تبلیغ‌شکن» نشان می‌دهد. هر مورد یک خط است با پنج بخش که با `|` جدا شده‌اند:

<div dir="ltr">

```
domain | English name | Persian name | YYYY-MM | https source
```

</div>

دامنه همان میزبان سایت است، بدون `www`، و یک مورد خود آن میزبان و هر چه زیر آن است را در بر می‌گیرد. ماه همان ماهی است که نشت علنی شد. هر مورد باید یک منبع عمومی با نشانی https داشته باشد، مثلاً گزارش یک خبرگزاری یا اطلاعیهٔ خود شرکت، و آن منبع نباید خودش داده‌های نشت‌شده را داشته باشد یا به آن‌ها پیوند بدهد. خطی که از این قاعده‌ها پیروی نکند در ساخت تبلیغ‌شکن کنار گذاشته می‌شود.

## نسخهٔ ذخیره‌شدهٔ لیکفا

پوشهٔ `sources/leakfa-breaches/` فهرست لیکفا از سایت‌های ایرانیِ دچار نشت داده را دارد (مجوز MIT، https://github.com/Leakfarsi/Leakfa-Alert). این تنها فهرست اینجاست که JSON است: فایل `sources/leakfa-breaches/leakfa-breaches.json` و کنارش `meta.json` و `LICENSE.txt`، مثل بقیه. تبلیغ‌شکن آنچه لیکفا فهرست کرده را نشان می‌دهد و درستی آن را تأیید نمی‌کند.

## مجوز

فایل‌های `cpab-own.txt`، `cpab-exceptions.txt` و `cpab-leaks.txt` با مجوز GPL-3.0-or-later منتشر شده‌اند؛ متنش در `LICENSE` است. هر فهرست زیر `sources/` همان مجوز خودش را دارد، همان‌طور که `SOURCES.md` ثبت کرده است.

نام‌های CPAB، CyClone Power Ad Blocker، CyClone و «تبلیغ‌شکن» و آرم‌های تبلیغ‌شکن مجوز داده نشده‌اند. این مجوز هیچ حقی در قالب علامت تجاری برای آن‌ها نمی‌دهد.

</div>
