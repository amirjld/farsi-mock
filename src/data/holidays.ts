// Fixed solar-calendar public holidays, copied from parsi-mcp (src/lib/dates2.ts),
// which follows Wikipedia "Public holidays in Iran". Lunar (Hijri) holidays move every year and
// need the official annual calendar, so they are not included.
export interface FixedHoliday { month: number; day: number; fa: string; en: string }
export const FIXED_SOLAR_HOLIDAYS: FixedHoliday[] = [
  { month: 1, day: 1, fa: "نوروز", en: "Nowruz" }, { month: 1, day: 2, fa: "نوروز", en: "Nowruz" }, { month: 1, day: 3, fa: "نوروز", en: "Nowruz" }, { month: 1, day: 4, fa: "نوروز", en: "Nowruz" },
  { month: 1, day: 12, fa: "روز جمهوری اسلامی", en: "Islamic Republic Day" }, { month: 1, day: 13, fa: "سیزده‌بدر", en: "Sizdah Bedar" },
  { month: 3, day: 14, fa: "رحلت امام خمینی", en: "Death of Khomeini" }, { month: 3, day: 15, fa: "قیام ۱۵ خرداد", en: "15 Khordad uprising" },
  { month: 11, day: 22, fa: "پیروزی انقلاب اسلامی", en: "Anniversary of the Islamic Revolution" }, { month: 12, day: 29, fa: "ملی شدن صنعت نفت", en: "Nationalization of the oil industry" },
];
