// Small hand-written word lists for addresses, companies, products and text.
// Generic words only: no real brands, shops or private business names.

export type Operator = "MCI" | "Irancell" | "Rightel";

// Prefix ranges match parsi-mcp's mobileOperator() verified list.
export const MOBILE_PREFIXES: Record<Operator, string[]> = {
  MCI: ["0910", "0911", "0912", "0913", "0914", "0915", "0916", "0917", "0918", "0919", "0990", "0991", "0992", "0993", "0994"],
  Irancell: ["0901", "0902", "0903", "0904", "0905", "0930", "0933", "0935", "0936", "0937", "0938", "0939", "0941"],
  Rightel: ["0920", "0921", "0922"],
};
// rough market-share weights used when no operator is requested
export const OPERATOR_WEIGHTS: [Operator, number][] = [["MCI", 55], ["Irancell", 38], ["Rightel", 7]];

export const STREETS = [
  "آزادی", "انقلاب", "فردوسی", "حافظ", "سعدی", "شریعتی", "مطهری", "طالقانی", "جمهوری", "کارگر",
  "بهار", "گلستان", "نوبهار", "ولیعصر", "پاسداران", "کشاورز", "مدرس", "ملت", "استقلال", "امام خمینی",
  "بهشتی", "باهنر", "سپهر", "دانشگاه", "فرهنگ", "معلم", "پروین اعتصامی", "خیام", "نیایش", "کوهسار",
  "مولوی", "عطار", "نظامی", "رودکی", "فلسطین", "توحید", "امام رضا", "سعادت‌آباد", "شهرک", "صیاد",
];
/** Street name patterns: plain name, «شهید + surname», numbered «... متری». */
export const STREET_TYPES = ["خیابان", "خیابان", "خیابان", "بلوار"] as const;
export const STREET_WIDTHS = ["دوازده‌متری", "شانزده‌متری", "بیست‌متری", "سی‌متری", "چهل‌وپنج‌متری"];
export const ALLEYS = [
  "نسترن", "لاله", "یاس", "شقایق", "نرگس", "اقاقیا", "صنوبر", "سرو", "مریم", "بنفشه",
  "ارغوان", "سوسن", "اطلسی", "شبنم", "آفتاب", "مهتاب", "بهاران", "ستاره", "نیلوفر", "یاسمن",
];
export const DISTRICTS = [
  "مرکز شهر", "شهرک ولیعصر", "کوی دانشگاه", "شهرک بهاران", "کوی فرهنگیان", "شهرک صنعتی", "کوی گلستان",
  "شهرک آزادی", "کوی معلم", "شهرک امید", "کوی پردیس", "شهرک نوبهار",
];

export const EMAIL_DOMAINS = ["example.com", "example.org", "example.net"];

export const COMPANY_WORDS = [
  ["آوا", "Ava"], ["نوین", "Novin"], ["سپهر", "Sepehr"], ["آرمان", "Arman"], ["پیشرو", "Pishro"],
  ["ستاره", "Setareh"], ["دنا", "Dena"], ["کاوش", "Kavosh"], ["رایان", "Rayan"], ["هامون", "Hamoun"],
  ["تیوا", "Tiva"], ["پرتو", "Partow"], ["بهین", "Behin"], ["آسا", "Asa"], ["نیک", "Nik"],
  ["آبتین", "Abtin"], ["مهرآذین", "Mehrazin"], ["افرا", "Afra"], ["ارغوان", "Arghavan"], ["پگاه", "Pegah"],
] as const;
export const COMPANY_FIELDS = [
  ["تجارت", "Trading"], ["صنعت", "Industries"], ["فناوری", "Technology"], ["بازرگانی", "Commerce"], ["پخش", "Distribution"],
  ["سازه", "Construction"], ["رایانه", "Computing"], ["داده‌پرداز", "Data Processing"], ["لجستیک", "Logistics"], ["گستر", "Services"],
  ["تولیدی", "Manufacturing"], ["مهندسی", "Engineering"], ["طب", "Medical"], ["نساجی", "Textiles"], ["غذایی", "Foods"],
] as const;
/** [fa, en, weight, entity word]. Types follow the Iranian Commercial Code. */
export const COMPANY_TYPES = [
  ["سهامی خاص", "Private Joint Stock", 45, "شرکت"], ["با مسئولیت محدود", "LLC", 33, "شرکت"],
  ["تعاونی", "Cooperative", 7, "شرکت"], ["سهامی عام", "Public Joint Stock", 3, "شرکت"],
  ["تضامنی", "General Partnership", 2, "شرکت"], ["نسبی", "Proportional Liability", 1, "شرکت"],
  ["مختلط سهامی", "Mixed Joint Stock", 1, "شرکت"], ["مختلط غیرسهامی", "Mixed Non-Stock", 1, "شرکت"],
  ["غیرتجاری", "Non-Commercial Institute", 7, "موسسه"],
] as const;

export interface CatalogItem { name: string; min: number; max: number; unit: string; variants?: string[]; model?: boolean }
export interface Category { id: string; fa: string; en: string; aliases: string[]; items: CatalogItem[] }
const I = (name: string, min: number, max: number, unit = "عدد", variants?: string[], model = false): CatalogItem => ({ name, min, max, unit, variants, model });
const K = 1_000, M = 1_000_000;
const SIZES = ["S", "M", "L", "XL", "XXL"];
/**
 * Brand-free catalog. Prices are rough toman ranges for the 1405 (2026) retail market, meant to look
 * plausible in test data, not to be quotes.
 */
export const CATEGORIES: Category[] = [
  { id: "digital", fa: "کالای دیجیتال", en: "Electronics", aliases: ["electronics", "electronic", "tech"], items: [
    I("گوشی موبایل", 12 * M, 90 * M, "عدد", ["۱۲۸ گیگابایت", "۲۵۶ گیگابایت", "۵۱۲ گیگابایت"], true),
    I("هدفون بی‌سیم", 1.2 * M, 15 * M, "عدد", undefined, true), I("پاوربانک ۲۰۰۰۰ میلی‌آمپر", 1 * M, 4.5 * M, "عدد", undefined, true),
    I("شارژر دیواری فست", 400 * K, 2.5 * M, "عدد", undefined, true), I("کابل شارژ USB-C", 150 * K, 900 * K, "عدد", ["۱ متری", "۲ متری"], true),
    I("ساعت هوشمند", 2.5 * M, 30 * M, "عدد", undefined, true), I("اسپیکر بلوتوثی", 1 * M, 12 * M, "عدد", undefined, true),
    I("ماوس بی‌سیم", 350 * K, 3.5 * M, "عدد", undefined, true), I("کیبورد مکانیکی", 1.8 * M, 12 * M, "عدد", undefined, true),
    I("فلش مموری", 250 * K, 1.5 * M, "عدد", ["۳۲ گیگابایت", "۶۴ گیگابایت", "۱۲۸ گیگابایت"], true),
    I("هارد اکسترنال", 3.5 * M, 12 * M, "عدد", ["۱ ترابایت", "۲ ترابایت"], true), I("تبلت", 9 * M, 60 * M, "عدد", undefined, true),
    I("لپ‌تاپ", 35 * M, 180 * M, "عدد", undefined, true), I("مانیتور", 8 * M, 45 * M, "عدد", ["۲۴ اینچ", "۲۷ اینچ"], true),
  ] },
  { id: "wood", fa: "چوب و ورق", en: "Wood & Panels", aliases: ["mdf", "timber", "panels"], items: [
    I("ورق MDF", 1.6 * M, 4.5 * M, "برگ", ["۸ میل ۱۸۳×۳۶۶", "۱۶ میل ۱۸۳×۳۶۶", "۱۸ میل ۱۸۳×۳۶۶"]),
    I("ورق HDF", 900 * K, 2.2 * M, "برگ", ["۳ میل", "۵ میل"]), I("نئوپان", 1.2 * M, 3 * M, "برگ", ["۱۶ میل", "۱۸ میل"]),
    I("تخته چندلایی", 1.5 * M, 5 * M, "برگ", ["۴ میل", "۱۲ میل", "۱۸ میل"]), I("چوب روسی", 25 * M, 60 * M, "متر مکعب"),
    I("چوب راش", 60 * M, 150 * M, "متر مکعب"), I("چوب گردو", 120 * M, 350 * M, "متر مکعب"),
    I("نوار PVC لبه", 8 * K, 40 * K, "متر", ["۱ میل", "۲ میل"]), I("لولا کابینتی", 60 * K, 400 * K, "عدد", ["آرام‌بند", "معمولی"]),
    I("ریل کشو", 150 * K, 900 * K, "جفت", ["۳۵ سانت", "۴۵ سانت", "۵۰ سانت"]),
  ] },
  { id: "food", fa: "مواد غذایی", en: "Groceries", aliases: ["grocery", "groceries"], items: [
    I("زعفران سرگل", 1 * M, 3.5 * M, "مثقال"), I("پسته اکبری", 1.2 * M, 2.8 * M, "کیلوگرم"), I("خرما مضافتی", 150 * K, 400 * K, "کیلوگرم"),
    I("چای ایرانی", 250 * K, 900 * K, "بسته", ["۴۵۰ گرمی", "۵۰۰ گرمی"]), I("عسل طبیعی", 400 * K, 1.8 * M, "کیلوگرم"),
    I("برنج طارم", 150 * K, 350 * K, "کیلوگرم"), I("کشمش", 150 * K, 450 * K, "کیلوگرم"), I("گردو", 500 * K, 1.2 * M, "کیلوگرم"),
    I("روغن زیتون", 400 * K, 1.5 * M, "بطری", ["۵۰۰ میلی‌لیتر", "۱ لیتر"]), I("نبات", 120 * K, 350 * K, "بسته"),
    I("عدس", 80 * K, 200 * K, "کیلوگرم"), I("رب گوجه‌فرنگی", 60 * K, 180 * K, "قوطی", ["۸۰۰ گرمی"]),
  ] },
  { id: "fashion", fa: "مد و پوشاک", en: "Clothing", aliases: ["clothes", "clothing", "apparel"], items: [
    I("تیشرت نخی", 250 * K, 1.5 * M, "عدد", SIZES), I("شلوار جین", 700 * K, 3.5 * M, "عدد", ["۳۰", "۳۲", "۳۴", "۳۶"]),
    I("کاپشن زمستانه", 1.5 * M, 9 * M, "عدد", SIZES), I("کفش ورزشی", 1.2 * M, 8 * M, "جفت", ["۴۰", "۴۱", "۴۲", "۴۳", "۴۴"]),
    I("مانتو", 900 * K, 5 * M, "عدد", SIZES), I("شال", 200 * K, 1.2 * M, "عدد"), I("پیراهن مردانه", 500 * K, 2.5 * M, "عدد", SIZES),
    I("هودی", 600 * K, 3 * M, "عدد", SIZES), I("کیف دوشی", 500 * K, 4 * M, "عدد"), I("کمربند چرمی", 250 * K, 1.5 * M, "عدد"),
  ] },
  { id: "appliance", fa: "لوازم خانگی", en: "Home Appliances", aliases: ["appliances"], items: [
    I("کتری برقی", 1.2 * M, 5 * M, "عدد", undefined, true), I("اتو بخار", 1.5 * M, 7 * M, "عدد", undefined, true),
    I("جاروبرقی", 4 * M, 25 * M, "عدد", undefined, true), I("چای‌ساز", 2.5 * M, 12 * M, "عدد", undefined, true),
    I("آبمیوه‌گیری", 2 * M, 10 * M, "عدد", undefined, true), I("سرخ‌کن بدون روغن", 3 * M, 15 * M, "عدد", undefined, true),
    I("پنکه رومیزی", 1 * M, 4 * M, "عدد", undefined, true), I("مایکروفر", 5 * M, 20 * M, "عدد", undefined, true),
    I("یخچال فریزر", 35 * M, 150 * M, "عدد", undefined, true), I("ماشین لباسشویی", 30 * M, 120 * M, "عدد", ["۷ کیلویی", "۸ کیلویی", "۹ کیلویی"], true),
  ] },
  { id: "home", fa: "خانه و آشپزخانه", en: "Home & Kitchen", aliases: ["kitchen"], items: [
    I("ماهیتابه نچسب", 500 * K, 3 * M, "عدد", ["سایز ۲۴", "سایز ۲۸"]), I("سرویس قاشق و چنگال", 1.5 * M, 12 * M, "دست"),
    I("قوری", 300 * K, 2 * M), I("لیوان سرامیکی", 80 * K, 400 * K), I("فرش ماشینی", 6 * M, 40 * M, "تخته", ["۶ متری", "۹ متری", "۱۲ متری"]),
    I("پتو", 900 * K, 6 * M, "عدد", ["یک‌نفره", "دونفره"]), I("قابلمه", 700 * K, 5 * M), I("ظرف نگهدارنده", 80 * K, 600 * K),
    I("ست حوله", 500 * K, 3 * M, "دست"), I("رومیزی", 250 * K, 1.5 * M),
  ] },
  { id: "beauty", fa: "آرایشی و بهداشتی", en: "Beauty & Health", aliases: ["health", "cosmetics"], items: [
    I("کرم مرطوب‌کننده", 150 * K, 1.5 * M), I("شامپو", 90 * K, 700 * K), I("کرم ضدآفتاب", 250 * K, 1.8 * M), I("ادکلن", 800 * K, 12 * M),
    I("مسواک برقی", 800 * K, 6 * M), I("ماسک صورت", 50 * K, 400 * K), I("سرم پوست", 300 * K, 2.5 * M), I("خمیردندان", 60 * K, 350 * K),
  ] },
  { id: "stationery", fa: "کتاب و لوازم‌التحریر", en: "Books & Stationery", aliases: ["books", "book"], items: [
    I("دفتر سیمی", 40 * K, 250 * K), I("خودکار", 15 * K, 150 * K), I("رمان", 150 * K, 700 * K, "جلد"), I("ماژیک", 25 * K, 150 * K),
    I("مداد رنگی ۲۴ رنگ", 150 * K, 1.5 * M, "بسته"), I("کوله‌پشتی", 600 * K, 4 * M), I("کتاب آموزشی", 200 * K, 900 * K, "جلد"),
    I("دفتر برنامه‌ریزی", 150 * K, 600 * K),
  ] },
];

export const COLORS = ["مشکی", "سفید", "نقره‌ای", "آبی", "قرمز", "سبز", "طوسی", "کرم", "سرمه‌ای", "قهوه‌ای"];

export const ORDER_STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "returned"] as const;
export const ORDER_STATUS_WEIGHTS = [8, 10, 12, 15, 45, 7, 3];
export const PAYMENT_METHODS = ["online", "wallet", "cash_on_delivery", "card_to_card"] as const;
export const SHIPPING_METHODS = [
  { id: "post-express", fa: "پست پیشتاز", cost: [60_000, 120_000] },
  { id: "post-registered", fa: "پست سفارشی", cost: [40_000, 80_000] },
  { id: "courier", fa: "پیک موتوری", cost: [50_000, 150_000] },
  { id: "freight", fa: "باربری", cost: [150_000, 600_000] },
] as const;

export const WORDS = (
  "کیفیت خوب ارسال سریع قیمت مناسب طراحی زیبا جنس مرغوب ضمانت اصالت کالا بسته‌بندی محکم رنگ ثابت " +
  "دوام بالا مناسب استفاده روزانه سبک کاربردی آسان تمیز شدن تولید داخل محصول جدید پیشنهاد ویژه " +
  "پشتیبانی هفت روز بازگشت مشتری راضی امکان خرید قسطی موجودی محدود اندازه استاندارد ظاهر شیک"
).split(" ");

/** Iranian license plate letters by plate type. */
export const PLATE_LETTERS = {
  private: ["ب", "ج", "د", "س", "ص", "ط", "ق", "ل", "م", "ن", "و", "ه", "ی"],
  taxi: ["ت"], government: ["الف"], public: ["ع"], disabled: ["ژ"],
} as const;
export type PlateType = keyof typeof PLATE_LETTERS;

export const EDUCATION_LEVELS = [
  ["زیر دیپلم", "Below diploma", 10], ["دیپلم", "High school diploma", 30], ["کاردانی", "Associate degree", 10],
  ["کارشناسی", "Bachelor's degree", 33], ["کارشناسی ارشد", "Master's degree", 13], ["دکتری", "Doctorate", 4],
] as const;
