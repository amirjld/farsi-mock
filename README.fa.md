<div dir="rtl">

# farsi-mock

[![CI](https://github.com/amirjld/farsi-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/amirjld/farsi-mock/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/farsi-mock.svg)](https://www.npmjs.com/package/farsi-mock)
[![license](https://img.shields.io/npm/l/farsi-mock.svg)](./LICENSE)

یه چیزی مثل Faker، ولی برای ایران 🇮🇷 دیتای تستی واقعی‌نما می‌سازه که **از اعتبارسنجی رد می‌شه**:
کد ملی با رقم کنترل درست، کارت با Luhn درست، شبای معتبر (mod-97) که با بانک همون کارت جوره،
موبایل با پیش‌شماره‌ی واقعی اپراتورها، تلفن ثابت با کد همون استان. فیلدهای هر رکورد هم با هم جورن:
همون آدم، همون استان، اسم هم با جنسیت می‌خونه.

- **schema خودت رو بهش بده:** از Prisma، Zod، Mongoose، OpenAPI، JSON Schema یا یه JSON نمونه خودش می‌فهمه هر فیلد چیه (`codeMelli`، `shomare_mobile`، `zipCode`...) و برای هر فیلد درصد اطمینان می‌ده
- schemaهای تایپ‌دار، با `unique`، `nullable`، `weighted`، `uniqueBy` و dataset به‌هم‌وصل
- خروجی JSON، CSV، JSONL، SQL (Postgres/MySQL/SQLite)، Extended JSON مونگو و فیکسچر TypeScript
- seed برای Prisma، Drizzle، Mongoose و درایور Mongo، سرور mock با `farsi-mock serve`، و سرور MCP برای دستیارهای AI
- بدون هیچ وابستگی، ESM و CommonJS و نسخه‌ی مرورگر، با `seed` هر بار دقیقاً همون خروجی

[English](./README.md) · [مستندات API](./docs/API.md) · [تغییرات](./CHANGELOG.md)

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
// { firstName: "کوثر", lastName: "اصفهانی", nationalId: "0009492739", birthDateJalali: "1343/06/12", ... }

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

## از روی schema خودت بساز (infer)

دیگه لازم نیست دستی بنویسی هر فیلد چیه. فایل Prisma یا OpenAPI یا یه نمونه JSON رو بده، خودش حدس می‌زنه و می‌گه چقدر مطمئنه:

</div>

```bash
npx farsi-mock infer prisma/schema.prisma --explain                # جدول حدس‌ها با درصد اطمینان
npx farsi-mock infer prisma/schema.prisma --write farsi-mock.json  # ذخیره کن، اگه لازم بود دستی درستش کن
npx farsi-mock schema farsi-mock.json -n 50 --seed 1 --sql --dialect postgres -o seed.sql
npx farsi-mock infer sample.json --override customer_code=person.nationalId --generate
```

```ts
const r = iran.fromPrisma(schemaText);   // یا fromZod / fromMongoose / fromOpenAPI / fromJsonSchema / fromSample
r.explain();
const data = r.dataset({ User: 20, Order: 100 }); // userId سفارش‌ها واقعاً id یکی از کاربرهاست
```

<div dir="rtl">

- اسم فیلد به هر شکلی باشه می‌فهمه: camelCase، snake_case، PascalCase، kebab-case، انگلیسی یا فینگلیش (`kodMelli`، `tel`، `shaba`، `codePosti`، `ostan`، `tavalod`...).
- اسم مدل هم کمک می‌کنه: `name` توی `Product` می‌شه اسم کالا، توی `Company` اسم شرکت.
- enum، min/max، طول رشته، regex و ستون‌های unique رو رعایت می‌کنه.
- zod و Prisma وابستگی نیستن: zod رو ساختاری می‌خونه (v3 و v4)، Prisma رو هم به‌صورت متن.
- از نمونه JSON فقط شکل و فرمت رو برمی‌داره، مقدارها هیچ‌وقت توی خروجی کپی نمی‌شن.

## محدودیت‌ها (constraints)

</div>

```ts
const User = iran.schema({
  id: "id.uuid",
  mobile: iran.unique("contact.mobile"),         // تکراری نمی‌شه
  email: iran.nullable("contact.email", 0.1),    // ۱۰٪ null
  role: iran.weighted([["user", 90], ["admin", 10]]),
});
const db = iran.dataset({
  users: [User, 20],
  orders: { schema: { userId: "parent.id", total: "order.total" }, count: { per: "users", min: 0, max: 5 } }, // هر کاربر ۰ تا ۵ سفارش
});
// db.orders[0].total تایپش number ـه
```

<div dir="rtl">

## SQL، seed و API ساختگی

</div>

```ts
import { toSql, toMongoJson, toTs } from "farsi-mock/output";
import { seedPrisma, seedDrizzle, seedMongoose } from "farsi-mock/seed";

toSql(db, { dialect: "mysql", createTable: true });
await seedPrisma(prisma, "user", db.users);
```

```bash
npx farsi-mock serve farsi-mock.json --port 4000 --seed 1
curl "localhost:4000/users?page=2&limit=10&city=شیراز"
```

<div dir="rtl">

نمونه‌های کامل توی [`examples`](./examples) هست: seed با Prisma، seed توی Next.js با Drizzle، و سرور mock با Express.

## برای AI

`npx farsi-mock mcp` یه سرور MCP بدون وابستگیه (ابزارهای generate، schema، infer، validate و paths). توی سرورهای MCP دیگه (مثلاً parsi-mcp) هم می‌شه `tools` و `callTool` رو از `farsi-mock/ai` ایمپورت کرد. توضیح کامل: [docs/AI.md](./docs/AI.md). یه skill هم توی [`skills/farsi-mock`](./skills/farsi-mock/SKILL.md) هست.

## دیتای واقعی‌نماتر

- بیش از ۲۰۰ اسم (پسرونه، دخترونه و چندتا مشترک)، فامیلی‌های ترکیبی با نیم‌فاصله‌ی درست (کریم‌پور، بهرام‌زاده، ولی داودزاده و رضایی)
- خیابون‌ها مثل واقعیت: «خیابان آزادی»، «بلوار شهید …»، «خیابان بیست‌متری»، «بن‌بست …»
- مختصات شهرها از GeoNames (لایسنس CC BY 4.0)
- نوع شرکت (سهامی خاص، مسئولیت محدود، تعاونی، … و موسسه)
- کاتالوگ بدون برند با قیمت تومنی: دیجیتال، چوب و MDF (ام‌دی‌اف ۱۶ میل، نئوپان، HDF، چندلایی)، خوراکی، پوشاک، لوازم خانگی و...
- پلاک ماشین، مدرک تحصیلی، بازه‌ی تاریخ شمسی با روز کاری و تعطیلی‌های ثابت: `iran.jalali.between("1405/01/01", "1405/06/31", { workdaysOnly: true })`
- رقم فارسی یا لاتین: `digits: "fa"` یا `"latin"`

## CLI

</div>

```bash
npx farsi-mock person -n 50 --csv
npx farsi-mock user -n 100 --seed 42 --province اصفهان --case snake
npx farsi-mock schema ./schema.json -n 100 --format csv -o users.csv
npx farsi-mock user -n 1000 --sql --dialect mysql --table users -o users.sql
npx farsi-mock holidays 1405
```

<div dir="rtl">

نمونه‌ی فایل schema توی پوشه‌ی [`examples`](./examples) هست. برای اکسل از `--bom` استفاده کن تا فارسی درست باز بشه، و ستون موبایل و کد ملی رو Text ایمپورت کن تا صفر اولش نپره.

## چند نکته

- **کد ملی پیش‌فرض امنه:** رقم کنترلش درسته ولی با `000` شروع می‌شه که مال هیچ اداره‌ی ثبتی نیست، پس مال هیچ آدم واقعی‌ای هم نیست.
- بعضی سیستم‌ها پیشوند `000` رو قبول نمی‌کنن. اون موقع `realisticIds` رو روشن کن تا سه رقم اول بشه کد واقعی شهر محل تولد (اگه شهر توی جدول نباشه، کد مرکز استان):
  `createIran({ realisticIds: true })`، یا توی schema `context: { realisticIds: true }`، یا برای یه بار `iran.nationalId({ realistic: true })`. توی CLI هم `--realistic-ids`.
- کارت و شبا این حالت امن رو ندارن، چون شتاب هیچ بازه‌ی تستی منتشر نکرده و هر عدد ۱۶ رقمی با BIN واقعی و Luhn درست ممکنه کارت صادرشده باشه. تصادفی‌ان و احتمال یکی شدن کمه، ولی صفر نیست.
- قیمت‌ها به تومن و رندن. مالیات سفارش پیش‌فرض ۱۰ درصده.
- فقط تعطیلی‌های ثابت شمسی هست. تعطیلی‌های قمری هر سال جابه‌جا می‌شن و تقویم رسمی لازم دارن.
- کد پستی معتبره ولی هنوز با استان جور نیست، چون جدول بازه‌ی کد پستی استان‌ها با لایسنس آزاد پیدا نکردم.
- کد اقتصادی شرکت همون شناسه ملی ۱۱ رقمیه.
- منبع همه‌ی دیتاها توی [DATA_SOURCES.md](./DATA_SOURCES.md) نوشته شده. تست‌ها هم هر مقدار رو با اعتبارسنج‌های [parsi-mcp](https://github.com/amirjld/parsi-mcp) چک می‌کنن.

لایسنس: MIT

</div>
