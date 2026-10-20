import type { Iran } from "./iran.js";
import { Schema, literal } from "./schema.js";

/**
 * Ready-made shapes modelled on common Iranian app entities (user, seller, customer address,
 * product, order). Field names follow the most common camelCase patterns; rename or
 * .withCase("snake") them to match your API.
 */
export function createPresets(f: Iran) {
  const user = new Schema(f, {
    id: "id.uuid",
    firstName: "person.firstName",
    lastName: "person.lastName",
    fullName: "person.fullName",
    gender: "person.gender",
    nationalId: "person.nationalId",
    birthDate: "person.birthDate",
    birthDateJalali: "person.birthDateJalali",
    mobile: "contact.mobile",
    email: "contact.email",
    province: "province.name",
    city: "city.name",
    isActive: (x) => x.bool(0.9),
    createdAt: "date.past",
  });

  const address = new Schema(f, {
    id: "id.uuid",
    title: (x) => x.pick(["خانه", "محل کار", "منزل پدری", "دفتر"]),
    recipientFirstName: "person.firstName",
    recipientLastName: "person.lastName",
    recipientMobile: "contact.mobile",
    provinceId: "province.id",
    provinceName: "address.province",
    cityName: "address.city",
    district: "address.district",
    addressLine: "address.line",
    postalCode: "address.postalCode",
    plaque: "address.plaque",
    unit: (x, c) => String(c.address.unit),
    latitude: "address.latitude",
    longitude: "address.longitude",
    isDefault: (_x, c) => c.index === 0,
  });

  const seller = new Schema(f, {
    id: "id.uuid",
    shopName: (_x, c) => c.company.name.replace(/^شرکت /, "").replace(/ \(.*\)$/, ""),
    companyName: "company.name",
    legalNationalId: "company.legalNationalId",
    economicCode: "company.economicCode",
    registrationNumber: "company.registrationNumber",
    ownerFullName: "person.fullName",
    ownerNationalId: "person.nationalId",
    mobile: "contact.mobile",
    landline: "company.landline",
    email: "contact.email",
    bankName: "bank.bankName",
    sheba: "bank.sheba",
    cardNumber: "bank.cardNumber",
    province: "address.province",
    city: "address.city",
    address: "address.formatted",
    postalCode: "address.postalCode",
    rating: "number.rating",
    isActive: (x) => x.bool(0.85),
    createdAt: "date.past",
  });

  const product = new Schema(f, {
    id: "id.uuid",
    sku: "product.sku",
    name: "product.name",
    category: "product.category",
    categoryId: "product.categoryId",
    price: "product.price",
    discountPercent: (x) => (x.bool(0.3) ? x.pick([5, 10, 15, 20, 25]) : 0),
    finalPrice: (_x, c) => Math.round((c.product.price * (100 - Number(c.record?.discountPercent ?? 0))) / 100 / 1000) * 1000,
    stockQuantity: (x) => x.int(0, 250),
    unit: "product.unit",
    color: "product.color",
    description: "product.description",
    rating: "number.rating",
    currency: literal("IRT"),
    createdAt: "date.past",
  });

  const order = new Schema(f, {
    id: "id.uuid",
    orderNumber: "order.orderNumber",
    customerFullName: "person.fullName",
    customerMobile: "contact.mobile",
    status: "order.status",
    items: "order.items",
    subtotal: "order.subtotal",
    discountAmount: "order.discount",
    shippingAmount: "order.shipping",
    taxAmount: "order.tax",
    totalAmount: "order.total",
    currency: "order.currency",
    paymentMethod: "order.paymentMethod",
    shippingMethod: "order.shippingMethod",
    shippingAddress: {
      provinceName: "address.province",
      cityName: "address.city",
      addressLine: "address.line",
      postalCode: "address.postalCode",
    },
    createdAt: "order.createdAt",
    createdAtJalali: "order.createdAtJalali",
  });

  return { user, seller, address, product, order };
}

export type PresetName = keyof ReturnType<typeof createPresets>;
