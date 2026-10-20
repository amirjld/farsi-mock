import { useEffect, useState } from "react";
import { getJson } from "./api";
import { http } from "./http";
import type { ResponseOf } from "./mocks/types";

type BookList = ResponseOf<"GET /api/Books">;
type Book = NonNullable<NonNullable<NonNullable<BookList["result"]>["items"]>[number]>;

export function App() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [list, setList] = useState<BookList>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const qs = new URLSearchParams({ PageNumber: String(page), PageSize: "10", Search: search });
    getJson<BookList>(`/api/Books?${qs}`).then(setList, (e: Error) => setError(e.message));
  }, [page, search]);

  async function addBook() {
    // axios + mock adapter: POST really adds the book to the in-memory store, so it shows up in the list
    await http.post<ResponseOf<"POST /api/Books">>("/api/Books", { title: "کتاب تازه", price: 250000 });
    setSearch("کتاب تازه");
  }

  if (error) return <p>خطا: {error}</p>;
  const r = list?.result;
  return (
    <main dir="rtl">
      {import.meta.env.VITE_API_MODE !== "api" && <small>حالت: {import.meta.env.VITE_API_MODE}</small>}
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="جستجو" />
      <button onClick={addBook}>افزودن کتاب</button>
      <ul>
        {r?.items?.map((b: Book) => (
          <li key={b.id}>
            {b.coverUrl && <img src={b.coverUrl} alt="" width={48} />} {b.title} - {b.authorName}
          </li>
        ))}
      </ul>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
      <span> {r?.page} / {r?.totalPages} </span>
      <button disabled={!r?.hasNextPage} onClick={() => setPage(page + 1)}>بعدی</button>
    </main>
  );
}
