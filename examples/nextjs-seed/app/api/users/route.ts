// Mock API route for UI work before the backend exists: GET /api/users?page=2&limit=20
import { createIran } from "farsi-mock";

const iran = createIran({ seed: 1 });
const User = iran.schema({
  id: "id.uuid",
  name: "person.fullName",
  avatar: "internet.url",
  mobile: "contact.mobile",
  city: "address.city",
  joinedAt: "date.pastJalali",
});
const all = User.many(200); // same 200 users on every request

export function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 20));
  return Response.json({ data: all.slice((page - 1) * limit, page * limit), meta: { page, limit, total: all.length } });
}
