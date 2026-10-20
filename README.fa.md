<div dir="rtl">

# farsi-mock

یه چیزی مثل Faker، ولی برای ایران 🇮🇷 دیتای تستی واقعی‌نما می‌سازه که **از اعتبارسنجی رد می‌شه**:
کد ملی با رقم کنترل درست، کارت با Luhn درست، شبای معتبر (mod-97) که با بانک همون کارت جوره،
موبایل با پیش‌شماره‌ی واقعی اپراتورها، تلفن ثابت با کد همون استان. فیلدهای هر رکورد هم با هم جورن:
همون آدم، همون استان، اسم هم با جنسیت می‌خونه.

- بدون هیچ وابستگی، ESM و CommonJS، با تایپ‌های TypeScript
- با `seed()` هر بار دقیقاً همون خروجی
- اسم فیلدها دست خودته: schema منعطف، و فایل JSON برای CLI
- خروجی JSON، CSV و JSONL

> ⚠️ **فقط برای تست.** دیتا تصادفیه و فقط از نظر الگوریتم معتبره. کد ملی‌ها به‌صورت پیش‌فرض امنن (پایین‌تر توضیح دادم)،
> ولی کارت و شبا ممکنه تصادفاً با یه کارت واقعی یکی دربیان، پس برای پرداخت واقعی، احراز هویت یا پیامک فرستادن ازش استفاده نکنید.
> ایمیل‌ها روی دامنه‌های رزروشده‌ی `example.*` ساخته می‌شن.

## نصب

</div>

```bash
npm i -D farsi-mock
```

<div dir="rtl">

## شروع سریع

</div>

```ts
import { iran } from "farsi-mock";

iran.seed(42);
iran.person({ gender: "female", province: "اصفهان" });
// { firstName: "شادی", lastName: "جعفری", nationalId: "0008894922", birthDateJalali: "1364/04/30", ... }

iran.mobile({ operator: "Irancell" });
iran.landline({ province: "فارس" });
iran.bank();      // کارت + شبا + شماره حساب، همه از یه بانک
iran.company();   // اسم شرکت، شناسه ملی معتبر، کد اقتصادی
iran.address();   // استان، شهر، خیابان، کوچه، پلاک، واحد، کد پستی، آدرس کامل
iran.many(() => iran.person(), 100);
```

<div dir="rtl">

## schema: اسم فیلدها هر چی باشه

هر اپی اسم فیلداش فرق داره (`nationalCode`، `codeMelli`، `national_id`...). ساختار خودت رو بنویس و بگو هر فیلد از کجا پر بشه:

</div>

```ts
import { iran, literal } from "farsi-mock";

const User = iran.schema({
  _id: "id.objectId",
  codeMelli: "person.nationalId",
  full_name: "person.fullName",
  phone_number: (f) => f.mobile({ operator: "irancell" }),
  status: literal("active"),
  address: { city: "address.city", zip: "address.postalCode" },
  tags: iran.array([1, 3], "text.word"),
  createdAt: "date.recentJalali",
}, { context: { province: "اصفهان" } });

User.many(50);
```

<div dir="rtl">

- هر رکورد یه context مشترک داره، پس `person.*`، `contact.*`، `address.*`، `bank.*` و `company.*` توی یه رکورد همه مال یه نفر و یه استانن.
- با `context` می‌تونی استان، شهر، جنسیت، اپراتور، بانک، دسته‌ی محصول و بازه‌ی سنی رو ثابت کنی.
- رشته‌ی ساده یعنی path. برای متن ثابت از `literal("...")` استفاده کن. لیست همه‌ی pathها: `npx farsi-mock paths`
- اگه path رو اشتباه بنویسی، همون اول خطا می‌ده و پیشنهاد درستش رو می‌گه.
- برای ارجاع بین جدول‌ها: `iran.ref(Users)` یا توی `iran.dataset` بنویس `"ref:users.id"`.
- presetهای آماده: `iran.presets.user`، `seller`، `address`، `product`، `order`. با `rename`، `omit`، `extend` و `withCase("snake")` هم می‌شه شکلشون رو عوض کرد.

## CLI

</div>

```bash
npx farsi-mock person -n 50 --csv
npx farsi-mock user -n 100 --seed 42 --province اصفهان --case snake
npx farsi-mock schema ./schema.json -n 100 --format csv -o users.csv
```

<div dir="rtl">

نمونه‌ی فایل schema توی پوشه‌ی [`examples`](./examples) هست. برای اکسل از `--bom` استفاده کن تا فارسی درست باز بشه، و ستون موبایل و کد ملی رو Text ایمپورت کن تا صفر اولش نپره.

## چند نکته

- **کد ملی پیش‌فرض امنه:** رقم کنترلش درسته ولی با `000` شروع می‌شه که مال هیچ اداره‌ی ثبتی نیست، پس مال هیچ آدم واقعی‌ای هم نیست.
- بعضی سیستم‌ها پیشوند `000` رو قبول نمی‌کنن. اون موقع `realisticIds` رو روشن کن تا سه رقم اول بشه کد واقعی شهر محل تولد (اگه شهر توی جدول نباشه، کد مرکز استان):
  `createIran({ realisticIds: true })`، یا توی schema `context: { realisticIds: true }`، یا برای یه بار `iran.nationalId({ realistic: true })`. توی CLI هم `--realistic-ids`.
- کارت و شبا این حالت امن رو ندارن، چون شتاب هیچ بازه‌ی تستی منتشر نکرده و هر عدد ۱۶ رقمی با BIN واقعی و Luhn درست ممکنه کارت صادرشده باشه. تصادفی‌ان و احتمال یکی شدن کمه، ولی صفر نیست.
- قیمت‌ها به تومن و رندن. مالیات سفارش پیش‌فرض ۱۰ درصده.
- کد اقتصادی شرکت همون شناسه ملی ۱۱ رقمیه.
- منبع همه‌ی دیتاها توی [DATA_SOURCES.md](./DATA_SOURCES.md) نوشته شده. تست‌ها هم هر مقدار رو با اعتبارسنج‌های [parsi-mcp](https://github.com/amirjld/parsi-mcp) چک می‌کنن.

لایسنس: MIT

</div>
