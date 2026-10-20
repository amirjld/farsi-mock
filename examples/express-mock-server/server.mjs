// Mount farsi-mock's mock REST API inside an Express app.
//   npm i express farsi-mock && node server.mjs
//   curl "http://localhost:4000/api/users?page=1&limit=5&city=شیراز"
import express from "express";
import { createIran } from "farsi-mock";
import { createMockServer } from "farsi-mock/server";

const iran = createIran({ seed: 42 });
const mock = createMockServer({
  iran,
  basePath: "/api",
  writable: true, // POST/PUT/PATCH/DELETE change the in-memory data
  resources: {
    users: { fields: { id: "id.uuid", name: "person.fullName", mobile: "contact.mobile", city: "address.city", nationalId: "person.nationalId" }, count: 100 },
    products: { fields: { id: "id.index", title: "product.name", price: "product.price", category: "product.category" }, count: 60 },
    orders: { fields: { id: "id.uuid", userId: "ref:users.id", total: "order.total", status: "order.status" }, count: 300 },
  },
});

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(mock.handler); // anything outside /api falls through to the next middleware
app.listen(4000, () => console.log("mock API on http://localhost:4000/api"));
