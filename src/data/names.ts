// Hand-curated common Iranian given names and surnames (Persian + standard Latin spelling).
// Common names are plain facts, not copyrighted data. See DATA_SOURCES.md.
// Compound words use ZWNJ (U+200C), e.g. "حسن‌زاده".

export type Name = readonly [fa: string, en: string];

export const MALE_NAMES: Name[] = [
  ["علی", "Ali"], ["محمد", "Mohammad"], ["حسین", "Hossein"], ["رضا", "Reza"], ["مهدی", "Mahdi"],
  ["امیر", "Amir"], ["امیرحسین", "Amirhossein"], ["محمدرضا", "Mohammadreza"], ["حسن", "Hasan"], ["سعید", "Saeed"],
  ["مجید", "Majid"], ["مسعود", "Masoud"], ["حمید", "Hamid"], ["احمد", "Ahmad"], ["جواد", "Javad"],
  ["سجاد", "Sajjad"], ["میلاد", "Milad"], ["آرش", "Arash"], ["بهرام", "Bahram"], ["کامران", "Kamran"],
  ["پویا", "Pouya"], ["سینا", "Sina"], ["پارسا", "Parsa"], ["آرین", "Arian"], ["عرفان", "Erfan"],
  ["یاسین", "Yasin"], ["ابوالفضل", "Abolfazl"], ["امید", "Omid"], ["بهزاد", "Behzad"], ["فرهاد", "Farhad"],
  ["کیان", "Kian"], ["نیما", "Nima"], ["هومن", "Hooman"], ["وحید", "Vahid"], ["یوسف", "Yousef"],
  ["مصطفی", "Mostafa"], ["مرتضی", "Morteza"], ["داوود", "Davood"], ["بابک", "Babak"], ["شاهین", "Shahin"],
  ["کوروش", "Kourosh"], ["ایمان", "Iman"], ["رامین", "Ramin"], ["فرزاد", "Farzad"], ["سامان", "Saman"],
  ["مهران", "Mehran"], ["هادی", "Hadi"], ["صادق", "Sadegh"], ["محسن", "Mohsen"], ["علیرضا", "Alireza"],
  ["امیرعلی", "Amirali"], ["محمدحسین", "Mohammadhossein"], ["محمدمهدی", "Mohammadmahdi"], ["طاها", "Taha"], ["حسام", "Hesam"],
  ["بنیامین", "Benyamin"], ["آرمان", "Arman"], ["اشکان", "Ashkan"], ["کیوان", "Keyvan"], ["سهیل", "Soheil"],
  ["پدرام", "Pedram"], ["فرشاد", "Farshad"], ["بهنام", "Behnam"], ["شهرام", "Shahram"], ["کاوه", "Kaveh"],
  ["سروش", "Soroush"], ["مازیار", "Maziar"], ["نوید", "Navid"], ["احسان", "Ehsan"], ["روزبه", "Roozbeh"],
  ["سیاوش", "Siavash"], ["اسماعیل", "Esmaeil"], ["ابراهیم", "Ebrahim"], ["یعقوب", "Yaghoub"], ["عباس", "Abbas"],
  ["جمشید", "Jamshid"], ["منصور", "Mansour"], ["ناصر", "Naser"], ["خسرو", "Khosrow"], ["شهاب", "Shahab"],
  ["میثم", "Meysam"], ["مهرداد", "Mehrdad"], ["حامد", "Hamed"], ["حمیدرضا", "Hamidreza"], ["اردلان", "Ardalan"],
  ["بردیا", "Bardia"], ["دانیال", "Danial"], ["رادین", "Radin"], ["ماهان", "Mahan"], ["آریان", "Aryan"],
  ["سپهر", "Sepehr"], ["امین", "Amin"], ["یاشار", "Yashar"], ["کسری", "Kasra"], ["متین", "Matin"],
  ["نریمان", "Nariman"], ["فریبرز", "Fariborz"], ["بیژن", "Bijan"], ["هوشنگ", "Houshang"],
];

export const FEMALE_NAMES: Name[] = [
  ["فاطمه", "Fatemeh"], ["زهرا", "Zahra"], ["مریم", "Maryam"], ["زینب", "Zeinab"], ["سارا", "Sara"],
  ["نرگس", "Narges"], ["مهسا", "Mahsa"], ["نازنین", "Nazanin"], ["ریحانه", "Reyhaneh"], ["کوثر", "Kowsar"],
  ["الهام", "Elham"], ["سمیرا", "Samira"], ["لیلا", "Leila"], ["مینا", "Mina"], ["شیما", "Shima"],
  ["نگار", "Negar"], ["پریسا", "Parisa"], ["آزاده", "Azadeh"], ["ساناز", "Sanaz"], ["نسرین", "Nasrin"],
  ["رویا", "Roya"], ["طاهره", "Tahereh"], ["معصومه", "Masoumeh"], ["محدثه", "Mohadeseh"], ["هانیه", "Hanieh"],
  ["یاسمن", "Yasaman"], ["هستی", "Hasti"], ["آیدا", "Aida"], ["ترانه", "Taraneh"], ["شادی", "Shadi"],
  ["مهتاب", "Mahtab"], ["نیلوفر", "Niloufar"], ["فرشته", "Fereshteh"], ["سمانه", "Samaneh"], ["الناز", "Elnaz"],
  ["آتنا", "Atena"], ["هلیا", "Helia"], ["ستاره", "Setareh"], ["پرستو", "Parastoo"], ["بهاره", "Bahareh"],
  ["سحر", "Sahar"], ["نسیم", "Nasim"], ["ملیکا", "Melika"], ["رها", "Raha"], ["آوا", "Ava"],
  ["فرزانه", "Farzaneh"], ["مژگان", "Mozhgan"], ["سپیده", "Sepideh"], ["مائده", "Maedeh"], ["نیکی", "Niki"],
  ["فاطمه‌زهرا", "Fatemehzahra"], ["حدیث", "Hadis"], ["کیمیا", "Kimia"], ["پریا", "Paria"], ["صبا", "Saba"],
  ["مهشید", "Mahshid"], ["شیرین", "Shirin"], ["گلاره", "Golareh"], ["ژیلا", "Zhila"], ["ثمین", "Samin"],
  ["نیوشا", "Niusha"], ["مهناز", "Mahnaz"], ["منیژه", "Manijeh"], ["پروین", "Parvin"], ["شهلا", "Shahla"],
  ["اکرم", "Akram"], ["اعظم", "Azam"], ["سودابه", "Soudabeh"], ["فریبا", "Fariba"], ["مرجان", "Marjan"],
  ["بنفشه", "Banafsheh"], ["نازیلا", "Nazila"], ["سوگند", "Sogand"], ["آناهیتا", "Anahita"], ["درسا", "Dorsa"],
  ["ارغوان", "Arghavan"], ["یگانه", "Yeganeh"], ["تینا", "Tina"], ["غزل", "Ghazal"], ["مهرنوش", "Mehrnoush"],
  ["سیما", "Sima"], ["افسانه", "Afsaneh"], ["زیبا", "Ziba"], ["مهدیه", "Mahdieh"], ["فهیمه", "Fahimeh"],
  ["راضیه", "Razieh"], ["سمیه", "Somayeh"], ["عاطفه", "Atefeh"], ["نجمه", "Najmeh"], ["زهره", "Zohreh"],
  ["آرزو", "Arezoo"], ["گلنار", "Golnar"], ["بهار", "Bahar"], ["رعنا", "Rana"], ["پانته‌آ", "Panteha"],
  ["لاله", "Laleh"], ["مهرسا", "Mehrsa"], ["ثنا", "Sana"], ["النا", "Elena"], ["نیایش", "Niayesh"],
];

/** Names used for both genders. Picked for either gender at a low rate. */
export const UNISEX_NAMES: Name[] = [
  ["آریا", "Arya"], ["آذر", "Azar"], ["نیکو", "Nikoo"], ["روشن", "Roshan"], ["مهر", "Mehr"],
  ["شمیم", "Shamim"], ["صدف", "Sadaf"],
];

export const LAST_NAMES: Name[] = [
  ["رضایی", "Rezaei"], ["محمدی", "Mohammadi"], ["حسینی", "Hosseini"], ["احمدی", "Ahmadi"], ["کریمی", "Karimi"],
  ["موسوی", "Mousavi"], ["جعفری", "Jafari"], ["کاظمی", "Kazemi"], ["رحیمی", "Rahimi"], ["نوری", "Nouri"],
  ["قاسمی", "Ghasemi"], ["صادقی", "Sadeghi"], ["حیدری", "Heydari"], ["اکبری", "Akbari"], ["محمودی", "Mahmoudi"],
  ["عباسی", "Abbasi"], ["ابراهیمی", "Ebrahimi"], ["مرادی", "Moradi"], ["یوسفی", "Yousefi"], ["عزیزی", "Azizi"],
  ["طاهری", "Taheri"], ["شریفی", "Sharifi"], ["نجفی", "Najafi"], ["زارعی", "Zarei"], ["بهرامی", "Bahrami"],
  ["صالحی", "Salehi"], ["امیری", "Amiri"], ["رستمی", "Rostami"], ["نظری", "Nazari"], ["افشار", "Afshar"],
  ["کرمانی", "Kermani"], ["شیرازی", "Shirazi"], ["تهرانی", "Tehrani"], ["اصفهانی", "Esfahani"], ["تبریزی", "Tabrizi"],
  ["یزدانی", "Yazdani"], ["سلطانی", "Soltani"], ["خسروی", "Khosravi"], ["جمالی", "Jamali"], ["قربانی", "Ghorbani"],
  ["حسن‌زاده", "Hassanzadeh"], ["علیزاده", "Alizadeh"], ["مختاری", "Mokhtari"], ["ملکی", "Maleki"], ["باقری", "Bagheri"],
  ["اسدی", "Asadi"], ["نیک‌نام", "Niknam"], ["فراهانی", "Farahani"], ["دهقان", "Dehghan"], ["کشاورز", "Keshavarz"],
  ["توکلی", "Tavakoli"], ["منصوری", "Mansouri"], ["عسگری", "Asgari"], ["زمانی", "Zamani"], ["میرزایی", "Mirzaei"],
  ["فتحی", "Fathi"], ["پاکزاد", "Pakzad"], ["شجاعی", "Shojaei"], ["فلاح", "Fallah"], ["صفری", "Safari"],
  ["نصیری", "Nasiri"], ["یگانه", "Yeganeh"], ["وکیلی", "Vakili"], ["آقایی", "Aghaei"], ["رسولی", "Rasouli"],
  ["ایزدی", "Izadi"], ["شاکری", "Shakeri"], ["فرجی", "Faraji"], ["بابایی", "Babaei"], ["اسماعیلی", "Esmaeili"],
  ["نادری", "Naderi"], ["کیانی", "Kiani"], ["سعیدی", "Saeedi"], ["مقدم", "Moghaddam"], ["رحمانی", "Rahmani"],
];

/** Roots + suffixes for compound surnames (e.g. کریم + پور = کریم‌پور). */
export const SURNAME_ROOTS: Name[] = [
  ["حسن", "Hasan"], ["کریم", "Karim"], ["رحیم", "Rahim"], ["علی", "Ali"], ["محمد", "Mohammad"],
  ["ابراهیم", "Ebrahim"], ["اسماعیل", "Esmaeil"], ["جعفر", "Jafar"], ["قاسم", "Ghasem"], ["نصر", "Nasr"],
  ["صادق", "Sadegh"], ["شریف", "Sharif"], ["امیر", "Amir"], ["رضا", "Reza"], ["مهدی", "Mahdi"],
  ["نیک", "Nik"], ["مهر", "Mehr"], ["شاه", "Shah"], ["خسرو", "Khosrow"], ["بهرام", "Bahram"],
  ["کاظم", "Kazem"], ["تقی", "Taghi"], ["هاشم", "Hashem"], ["یزدان", "Yazdan"], ["فرخ", "Farrokh"],
  ["اکبر", "Akbar"], ["عباس", "Abbas"], ["موسی", "Mousa"], ["یوسف", "Yousef"], ["داوود", "Davood"],
];
export const SURNAME_SUFFIXES: Name[] = [
  ["زاده", "zadeh"], ["پور", "pour"], ["نیا", "nia"], ["فر", "far"], ["نژاد", "nejad"],
  ["راد", "rad"], ["منش", "manesh"], ["وند", "vand"], ["خانی", "khani"], ["لو", "loo"], ["ی", "i"],
];

/**
 * Full names of well-known public figures that the random combinations above could produce.
 * Generators re-roll when they hit one. Not exhaustive: names are common and ordinary people share them.
 */
export const BLOCKED_FULL_NAMES = new Set<string>([
  "علی کریمی", "مهدی رحمتی", "حسن یزدانی", "رضا عطاران", "محمد خاتمی", "علی دایی", "مهدی طارمی",
  "حسین رضازاده", "علیرضا بیرانوند", "مسعود شجاعی", "علی رضایی", "کامران نجفی", "بهرام رادان",
  "حمید سوریان", "علیرضا جهانبخش", "سعید معروف", "محمد موسوی", "رضا قوچان‌نژاد", "مهران مدیری",
  "علی نصیریان", "پرستو صالحی", "لیلا حاتمی", "نیکی کریمی", "هستی کیانی",
]);
