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
];
export const STREET_TYPES = ["خیابان", "خیابان", "خیابان", "بلوار"] as const;
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
export const COMPANY_TYPES = [
  ["سهامی خاص", "Private Joint Stock", 50], ["با مسئولیت محدود", "LLC", 40], ["تعاونی", "Cooperative", 7], ["سهامی عام", "Public Joint Stock", 3],
] as const;

export interface Category { id: string; fa: string; en: string; unit: string; min: number; max: number; items: string[] }
// Prices in toman.
export const CATEGORIES: Category[] = [
  { id: "digital", fa: "کالای دیجیتال", en: "Electronics", unit: "عدد", min: 150_000, max: 45_000_000,
    items: ["گوشی موبایل", "هدفون بی‌سیم", "پاوربانک", "شارژر دیواری", "کابل شارژ", "ساعت هوشمند", "اسپیکر بلوتوثی", "ماوس بی‌سیم", "کیبورد مکانیکی", "فلش مموری", "هارد اکسترنال", "تبلت"] },
  { id: "appliance", fa: "لوازم خانگی", en: "Home Appliances", unit: "عدد", min: 900_000, max: 60_000_000,
    items: ["کتری برقی", "اتو بخار", "جاروبرقی", "چای‌ساز", "آبمیوه‌گیری", "سرخ‌کن بدون روغن", "پنکه رومیزی", "مایکروفر", "همزن برقی", "یخچال فریزر"] },
  { id: "fashion", fa: "مد و پوشاک", en: "Fashion", unit: "عدد", min: 120_000, max: 6_000_000,
    items: ["تیشرت نخی", "شلوار جین", "کاپشن زمستانه", "کفش ورزشی", "مانتو", "شال", "پیراهن مردانه", "هودی", "کیف دوشی", "کمربند چرمی"] },
  { id: "food", fa: "مواد غذایی", en: "Groceries", unit: "بسته", min: 45_000, max: 3_500_000,
    items: ["زعفران سرگل", "پسته اکبری", "خرما مضافتی", "چای ایرانی", "عسل طبیعی", "برنج طارم", "کشمش", "گردو", "روغن زیتون", "نبات"] },
  { id: "home", fa: "خانه و آشپزخانه", en: "Home & Kitchen", unit: "عدد", min: 80_000, max: 25_000_000,
    items: ["ماهیتابه نچسب", "سرویس قاشق و چنگال", "قوری", "لیوان سرامیکی", "فرش ماشینی", "پتو", "قابلمه", "ظرف نگهدارنده", "ست حوله", "رومیزی"] },
  { id: "beauty", fa: "آرایشی و بهداشتی", en: "Beauty & Health", unit: "عدد", min: 60_000, max: 4_000_000,
    items: ["کرم مرطوب‌کننده", "شامپو", "کرم ضدآفتاب", "ادکلن", "مسواک برقی", "ماسک صورت", "سرم پوست", "خمیردندان"] },
  { id: "stationery", fa: "کتاب و لوازم‌التحریر", en: "Books & Stationery", unit: "عدد", min: 15_000, max: 1_500_000,
    items: ["دفتر سیمی", "خودکار", "رمان", "ماژیک", "مداد رنگی", "کوله‌پشتی", "کتاب آموزشی", "دفتر برنامه‌ریزی"] },
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
