// Multilingual field-name dictionary: English, Finglish (Persian written in Latin letters) and common abbreviations.
// Names are tokenized (camelCase, snake_case, PascalCase, kebab-case all work) and compared without separators.

export type Produces = "string" | "number" | "boolean" | "date";
/** Model kinds used to disambiguate generic names like "name" or "code". */
export type ModelKind = "person" | "company" | "product" | "order" | "address" | "bank" | "any";

export interface Alias {
  gen: string | Record<string, unknown>;
  produces: Produces;
  keys: string[];
  /** Only for models of this kind (e.g. "name" -> product.name in a Product model). */
  kind?: ModelKind;
  /** Only when the field also looks like this type. */
  label: string;
}

export const ALIASES: Alias[] = [
  // ---- person ----
  { label: "national ID (کد ملی)", gen: "person.nationalId", produces: "string", keys: ["nationalcode", "nationalid", "nationalnumber", "nationalno", "codemelli", "codmelli", "kodmelli", "codemeli", "melicode", "mellicode", "shomaremelli", "nid", "nin", "melli", "meli", "ssn", "personalcode", "nationalidnumber"] },
  { label: "first name", gen: "person.firstName", produces: "string", keys: ["firstname", "fname", "givenname", "forename", "nam", "esm", "firstnamefa", "namfa"] },
  { label: "first name (Latin)", gen: "person.firstNameEn", produces: "string", keys: ["firstnameen", "firstnamelatin", "firstnameenglish", "latinfirstname", "englishfirstname"] },
  { label: "last name", gen: "person.lastName", produces: "string", keys: ["lastname", "lname", "surname", "familyname", "family", "famil", "familname", "namkhanevadegi", "namekhanevadegi", "lastnamefa"] },
  { label: "last name (Latin)", gen: "person.lastNameEn", produces: "string", keys: ["lastnameen", "lastnamelatin", "lastnameenglish", "latinlastname", "englishlastname", "surnameen"] },
  { label: "full name", gen: "person.fullName", produces: "string", keys: ["fullname", "name", "displayname", "customername", "ownername", "personname", "contactname", "receivername", "recipientname", "sendername", "buyername", "authorname", "writername", "clientname", "employeename", "membername", "studentname", "teachername", "drivername", "managername", "creatorname", "createdbyname", "patientname", "doctorname", "guestname", "userfullname", "namokamel", "namkamel", "namvanamkhanevadegi"], kind: "person" },
  { label: "full name", gen: "person.fullName", produces: "string", keys: ["fullname", "displayname", "customername", "ownername", "personname", "contactname", "receivername", "recipientname", "buyername", "authorname", "writername", "clientname", "employeename", "membername", "studentname", "teachername", "drivername", "managername", "creatorname", "createdbyname", "patientname", "doctorname", "guestname", "userfullname"] },
  { label: "full name (Latin)", gen: "person.fullNameEn", produces: "string", keys: ["fullnameen", "nameen", "latinname", "englishname", "namelatin", "nameenglish"] },
  { label: "father's name", gen: "person.fatherName", produces: "string", keys: ["fathername", "fathersname", "nampedar", "namepedar", "pedar", "esmpedar"] },
  { label: "gender", gen: "person.gender", produces: "string", keys: ["gender", "sex", "jensiat", "jensiyat", "jensiyyat", "jens"] },
  { label: "birth date", gen: "person.birthDate", produces: "date", keys: ["birthdate", "dateofbirth", "dob", "birthday", "birth", "borndate", "tavalod", "tavallod", "tarikhtavalod", "tarikhtavallod", "birthdategregorian"] },
  { label: "birth date (Jalali)", gen: "person.birthDateJalali", produces: "string", keys: ["birthdatejalali", "birthdateshamsi", "birthdatefa", "tavalodshamsi", "tarikhtavalodshamsi", "jalalibirthdate", "shamsibirthdate", "birthdatepersian"] },
  { label: "age", gen: "person.age", produces: "number", keys: ["age", "sen", "senn", "ageyears"] },
  { label: "birth city", gen: "person.birthCity", produces: "string", keys: ["birthcity", "placeofbirth", "birthplace", "mahaletavalod", "mahalletavalod", "shahrtavalod"] },
  { label: "education", gen: "person.education", produces: "string", keys: ["education", "educationlevel", "degree", "madrak", "madraktahsili", "tahsilat", "akharinmadrak"] },
  // ---- contact ----
  { label: "mobile", gen: "contact.mobile", produces: "string", keys: ["mobile", "mobilenumber", "mobileno", "mobilephone", "phone", "phonenumber", "phoneno", "tel", "tell", "cell", "cellphone", "cellnumber", "msisdn", "mob", "mobail", "shomaremobile", "shomaremobail", "shomaretamas", "tamas", "contactnumber", "whatsapp", "telegramphone", "shomarehamrah", "hamrah"] },
  { label: "landline", gen: "contact.landline", produces: "string", keys: ["landline", "landlinenumber", "fixedphone", "homephone", "officephone", "workphone", "telsabet", "sabet", "telephonesabet", "telephone", "telephonenumber", "businessphone", "fax"] },
  { label: "mobile operator", gen: "contact.operator", produces: "string", keys: ["operator", "carrier", "mobileoperator", "operator"] },
  { label: "email", gen: "contact.email", produces: "string", keys: ["email", "mail", "emailaddress", "emailaddr", "useremail", "contactemail", "pamenegar", "imeil"] },
  // ---- address ----
  { label: "postal code", gen: "address.postalCode", produces: "string", keys: ["postalcode", "postcode", "zip", "zipcode", "postal", "codeposti", "kodposti", "codposti"] },
  { label: "province", gen: "address.province", produces: "string", keys: ["province", "provincename", "ostan", "state", "region", "statename", "nameostan"] },
  { label: "province (English)", gen: "address.provinceEn", produces: "string", keys: ["provinceen", "provincenameen", "ostanen", "stateen"] },
  { label: "province id", gen: "address.provinceId", produces: "number", keys: ["provinceid", "ostanid", "stateid", "provincecode"] },
  { label: "city", gen: "address.city", produces: "string", keys: ["city", "cityname", "shahr", "town", "nameshahr"] },
  { label: "city (English)", gen: "address.cityEn", produces: "string", keys: ["cityen", "citynameen", "shahren"] },
  { label: "district", gen: "address.district", produces: "string", keys: ["district", "neighborhood", "neighbourhood", "mahale", "mahalle", "area", "mantaghe"] },
  { label: "street", gen: "address.street", produces: "string", keys: ["street", "streetname", "khiaban", "khiyaban"] },
  { label: "alley", gen: "address.alley", produces: "string", keys: ["alley", "koche", "kooche", "kuche", "lane"] },
  { label: "plaque", gen: "address.plaque", produces: "string", keys: ["plaque", "pelak", "housenumber", "buildingnumber", "streetnumber", "plak"] },
  { label: "floor", gen: "address.floor", produces: "number", keys: ["floor", "tabaghe", "tabaqe"] },
  { label: "unit", gen: "address.unit", produces: "number", keys: ["unit", "unitnumber", "vahed", "apartment", "apt"] },
  { label: "address", gen: "address.formatted", produces: "string", keys: ["address", "addr", "fulladdress", "addressline", "address1", "addressline1", "streetaddress", "neshani", "nashani", "adres", "adress", "shippingaddress", "billingaddress", "postaladdress", "homeaddress"] },
  { label: "latitude", gen: "address.latitude", produces: "number", keys: ["lat", "latitude", "geolat", "locationlat"] },
  { label: "longitude", gen: "address.longitude", produces: "number", keys: ["lng", "lon", "long", "longitude", "geolng", "geolon", "locationlng"] },
  // ---- bank ----
  { label: "IBAN / Sheba", gen: "bank.sheba", produces: "string", keys: ["sheba", "shaba", "iban", "shebanumber", "shabanumber", "ibannumber", "shomaresheba", "shomareshaba", "shebano"] },
  { label: "card number", gen: "bank.cardNumber", produces: "string", keys: ["card", "cardnumber", "cardno", "pan", "cardpan", "debitcard", "bankcard", "shomarekart", "shomarecart", "kart", "cartnumber", "creditcard"] },
  { label: "account number", gen: "bank.accountNumber", produces: "string", keys: ["accountnumber", "accountno", "account", "bankaccount", "hesab", "shomarehesab", "accnumber", "accno"] },
  { label: "bank name", gen: "bank.bankName", produces: "string", keys: ["bank", "bankname", "namebank", "bankfa"] },
  { label: "bank name (English)", gen: "bank.bankNameEn", produces: "string", keys: ["banknameen", "banken"] },
  // ---- company ----
  { label: "company name", gen: "company.name", produces: "string", keys: ["companyname", "company", "organization", "organisation", "org", "orgname", "sherkat", "namesherkat", "namsherkat", "businessname", "employer", "brandname", "storename", "shopname", "sellername", "vendorname", "merchantname"] },
  { label: "company name", gen: "company.name", produces: "string", keys: ["name", "title", "nam", "onvan"], kind: "company" },
  { label: "legal national ID (شناسه ملی)", gen: "company.legalNationalId", produces: "string", keys: ["legalid", "legalnationalid", "companynationalid", "shenasemelli", "shenasehmelli", "shenase", "nationalidlegal", "corporateid", "companyid"] },
  { label: "economic code", gen: "company.economicCode", produces: "string", keys: ["economiccode", "economicnumber", "codeeghtesadi", "kodeghtesadi", "taxid", "taxcode", "taxnumber", "vatnumber"] },
  { label: "registration number", gen: "company.registrationNumber", produces: "string", keys: ["registrationnumber", "registrationno", "regno", "registerno", "shomaresabt", "sabt"] },
  { label: "company type", gen: "company.type", produces: "string", keys: ["companytype", "legaltype", "noesherkat", "entitytype"] },
  // ---- product ----
  { label: "product name", gen: "product.name", produces: "string", keys: ["productname", "itemname", "kala", "namekala", "namkala", "productitle", "producttitle", "goodsname"] },
  { label: "product name", gen: "product.name", produces: "string", keys: ["name", "title", "nam", "onvan", "label"], kind: "product" },
  { label: "price (toman)", gen: "product.price", produces: "number", keys: ["price", "unitprice", "gheymat", "ghimat", "qeymat", "fee", "cost", "saleprice", "baseprice", "listprice", "productprice", "mablagh", "amount"] },
  { label: "SKU", gen: "product.sku", produces: "string", keys: ["sku", "productcode", "itemcode", "codekala", "kodkala", "partnumber"] },
  { label: "SKU", gen: "product.sku", produces: "string", keys: ["code", "barcode"], kind: "product" },
  { label: "category", gen: "product.category", produces: "string", keys: ["category", "categoryname", "dastebandi", "daste", "cat", "productcategory", "group", "goroh"] },
  { label: "color", gen: "product.color", produces: "string", keys: ["color", "colour", "rang"] },
  { label: "unit of measure", gen: "product.unit", produces: "string", keys: ["uom", "unitofmeasure", "measureunit", "vahedkala"] },
  { label: "description", gen: "product.description", produces: "string", keys: ["description", "desc", "tozih", "tozihat", "details", "summary"], kind: "product" },
  // ---- order ----
  { label: "order number", gen: "commerce.orderNumber", produces: "string", keys: ["ordernumber", "orderno", "ordercode", "invoicenumber", "invoiceno", "factor", "factornumber", "shomarefactor", "trackingcode", "trackingnumber", "codepeygiri", "peygiri", "referencenumber", "refnumber"] },
  { label: "order status", gen: "order.status", produces: "string", keys: ["status", "orderstatus", "state", "vaziat", "vazeiat"], kind: "order" },
  { label: "order total", gen: "order.total", produces: "number", keys: ["total", "totalprice", "totalamount", "grandtotal", "payable", "jamkol", "mablaghkol"] },
  { label: "subtotal", gen: "order.subtotal", produces: "number", keys: ["subtotal"] },
  { label: "tax", gen: "order.tax", produces: "number", keys: ["tax", "vat", "maliat"] },
  { label: "shipping cost", gen: "order.shipping", produces: "number", keys: ["shipping", "shippingcost", "shippingfee", "deliveryfee", "hazinehersal", "hazineersal"] },
  { label: "payment method", gen: "order.paymentMethod", produces: "string", keys: ["paymentmethod", "paymenttype", "ravesheparakht", "raveshpardakht", "paymethod"] },
  { label: "shipping method", gen: "order.shippingMethod", produces: "string", keys: ["shippingmethod", "deliverymethod", "raveshersal", "raveshersal"] },
  { label: "currency", gen: { $literal: "IRT" }, produces: "string", keys: ["currency", "currencycode", "vahedpool"] },
  // ---- misc ----
  { label: "quantity", gen: { $int: [1, 20] }, produces: "number", keys: ["quantity", "qty", "count", "tedad", "numberofitems", "itemcount"] },
  { label: "stock", gen: { $int: [0, 500] }, produces: "number", keys: ["stock", "inventory", "mojoodi", "mojodi", "instock", "stockcount"] },
  { label: "discount percent", gen: { $int: [0, 40] }, produces: "number", keys: ["discount", "discountpercent", "takhfif", "darsadtakhfif", "off"] },
  { label: "rating", gen: "number.rating", produces: "number", keys: ["rating", "rate", "score", "emtiaz", "stars"] },
  { label: "plate", gen: "vehicle.plate", produces: "string", keys: ["plate", "platenumber", "licenseplate", "pelakmashin", "pelakkhodro", "carplate"] },
  { label: "username", gen: "internet.username", produces: "string", keys: ["username", "user", "login", "loginname", "namkarbari", "handle", "nickname"] },
  { label: "password (fake)", gen: "internet.password", produces: "string", keys: ["password", "pass", "pwd", "passwd", "ramz", "ramzeobur", "ramzobor"] },
  { label: "URL (example.com)", gen: "internet.url", produces: "string", keys: ["url", "website", "site", "link", "homepage", "avatar", "image", "imageurl", "photo", "picture", "thumbnail", "logo", "aks", "tasvir"] },
  { label: "IP address (private range)", gen: "internet.ip", produces: "string", keys: ["ip", "ipaddress", "ipaddr", "lastip"] },
  { label: "slug", gen: "internet.slug", produces: "string", keys: ["slug", "permalink"] },
  { label: "title", gen: "text.sentence", produces: "string", keys: ["title", "subject", "headline", "onvan", "mozoo"] },
  { label: "text", gen: "text.paragraph", produces: "string", keys: ["description", "desc", "body", "content", "text", "bio", "about", "note", "notes", "comment", "message", "tozih", "tozihat", "matn", "details", "summary"] },
  { label: "Jalali date", gen: "date.recentJalali", produces: "string", keys: ["jalalidate", "shamsidate", "tarikh", "tarikhshamsi", "datejalali", "dateshamsi", "datefa", "createdatjalali", "createdatshamsi", "createdatfa", "tarikhsabt"] },
  { label: "creation date", gen: "date.past", produces: "date", keys: ["createdat", "created", "createdon", "creationdate", "createdate", "datecreated", "insertedat", "registeredat", "joinedat", "signupdate", "date", "timestamp"] },
  { label: "update date", gen: "date.recent", produces: "date", keys: ["updatedat", "updated", "updatedon", "modifiedat", "modified", "lastmodified", "lastupdate", "lastlogin", "lastloginat", "lastseen"] },
  { label: "event date", gen: "date.recent", produces: "date", keys: ["paidat", "shippedat", "deliveredat", "publishedat", "completedat", "canceledat", "cancelledat", "verifiedat", "approvedat", "sentat", "readat", "loggedinat"] },
  { label: "tag", gen: "text.word", produces: "string", keys: ["tag", "keyword", "hashtag", "barchasb", "label"] },
  { label: "future date", gen: "date.future", produces: "date", keys: ["expiresat", "expireat", "expiry", "expirationdate", "duedate", "deadline", "validuntil", "deliverydate", "scheduledat"] },
  { label: "province (entity)", gen: "province.name", produces: "string", keys: ["provincefa"] },
];

/** Split a field name into lowercase words: camelCase, PascalCase, snake_case, kebab-case, "dot.case", digits. */
export function tokenize(name: string): string[] {
  return name
    .replace(/^[_$]+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** Words that add nothing when they prefix/suffix a field ("user_mobile", "mobileNumber" are handled by keys). */
export const NOISE = new Set(["user", "customer", "client", "member", "person", "owner", "seller", "buyer", "my", "the", "primary", "main", "default", "fa", "en", "str", "value", "val", "field", "info", "data", "karbar", "moshtari"]);

export function modelKind(name: string | undefined): ModelKind {
  if (!name) return "any";
  const t = tokenize(name).join("");
  if (/(product|item|good|kala|sku|article|catalog|inventory|merchandise)/.test(t)) return "product";
  if (/(compan|organi[sz]ation|org$|business|shop|store|seller|vendor|merchant|supplier|sherkat|brand|corporat)/.test(t)) return "company";
  if (/(order|invoice|factor|cart|purchase|payment|transaction|sefaresh)/.test(t)) return "order";
  if (/(address|location|neshani)/.test(t)) return "address";
  if (/(bank|account|card|wallet)/.test(t)) return "bank";
  if (/(user|person|customer|client|member|employee|staff|student|patient|profile|contact|author|people|karbar|moshtari|driver|teacher)/.test(t)) return "person";
  return "any";
}
