// Iranian banks with card BIN (first 6 digits) and Sheba bank code. BINs and codes
// come from parsi-mcp (cross-checked public lists). Only banks that currently issue
// both cards and Sheba numbers are included. See DATA_SOURCES.md.

export interface BankData { id: string; fa: string; en: string; bins: string[]; shebaCode: string }

export const BANKS: BankData[] = [
  { id: "melli", fa: "بانک ملی ایران", en: "Bank Melli Iran", bins: ["603799"], shebaCode: "017" },
  { id: "sepah", fa: "بانک سپه", en: "Bank Sepah", bins: ["589210"], shebaCode: "015" },
  { id: "edbi", fa: "بانک توسعه صادرات", en: "Export Development Bank of Iran", bins: ["627648"], shebaCode: "020" },
  { id: "sanat-madan", fa: "بانک صنعت و معدن", en: "Bank of Industry and Mine", bins: ["627961"], shebaCode: "011" },
  { id: "keshavarzi", fa: "بانک کشاورزی", en: "Bank Keshavarzi", bins: ["603770"], shebaCode: "016" },
  { id: "maskan", fa: "بانک مسکن", en: "Bank Maskan", bins: ["628023"], shebaCode: "014" },
  { id: "post", fa: "پست بانک ایران", en: "Post Bank of Iran", bins: ["627760"], shebaCode: "021" },
  { id: "tosee-taavon", fa: "بانک توسعه تعاون", en: "Tose'e Ta'avon Bank", bins: ["502908"], shebaCode: "022" },
  { id: "eghtesad-novin", fa: "بانک اقتصاد نوین", en: "Eghtesad Novin Bank", bins: ["627412"], shebaCode: "055" },
  { id: "parsian", fa: "بانک پارسیان", en: "Parsian Bank", bins: ["622106"], shebaCode: "054" },
  { id: "pasargad", fa: "بانک پاسارگاد", en: "Pasargad Bank", bins: ["502229"], shebaCode: "057" },
  { id: "karafarin", fa: "بانک کارآفرین", en: "Karafarin Bank", bins: ["627488"], shebaCode: "053" },
  { id: "saman", fa: "بانک سامان", en: "Saman Bank", bins: ["621986"], shebaCode: "056" },
  { id: "sina", fa: "بانک سینا", en: "Sina Bank", bins: ["639346"], shebaCode: "059" },
  { id: "sarmayeh", fa: "بانک سرمایه", en: "Sarmayeh Bank", bins: ["639607"], shebaCode: "058" },
  { id: "shahr", fa: "بانک شهر", en: "Shahr Bank", bins: ["504706", "502806"], shebaCode: "061" },
  { id: "dey", fa: "بانک دی", en: "Dey Bank", bins: ["502938"], shebaCode: "066" },
  { id: "saderat", fa: "بانک صادرات ایران", en: "Bank Saderat Iran", bins: ["603769"], shebaCode: "019" },
  { id: "mellat", fa: "بانک ملت", en: "Bank Mellat", bins: ["610433"], shebaCode: "012" },
  { id: "tejarat", fa: "بانک تجارت", en: "Bank Tejarat", bins: ["627353", "585983"], shebaCode: "018" },
  { id: "refah", fa: "بانک رفاه کارگران", en: "Refah Bank", bins: ["589463"], shebaCode: "013" },
  { id: "mehr-iran", fa: "بانک قرض‌الحسنه مهر ایران", en: "Qarz al-Hasna Mehr Iran Bank", bins: ["606373"], shebaCode: "060" },
  { id: "resalat", fa: "بانک قرض‌الحسنه رسالت", en: "Resalat Qarz al-Hasna Bank", bins: ["504172"], shebaCode: "070" },
  { id: "gardeshgari", fa: "بانک گردشگری", en: "Tourism Bank", bins: ["505416"], shebaCode: "064" },
];
