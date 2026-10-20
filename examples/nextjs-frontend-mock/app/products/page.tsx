"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { get } from "@/lib/api";

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["products", page, q],
    queryFn: () => get<"GET /products">("/products", { page, perPage: 12, q, sort: "-createdAt" }),
  });

  if (isLoading) return <p>در حال بارگذاری...</p>;
  if (error) return <p>خطا: {String(error.message)}</p>;
  return (
    <main>
      <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو" />
      <ul>
        {data?.data?.map((p) => (
          <li key={p.id}>
            <img src={p.imageUrl} alt="" width={64} /> {p.title} - {p.price?.toLocaleString("fa-IR")} تومان
          </li>
        ))}
      </ul>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
      <span> {data?.meta?.page} / {data?.meta?.totalPages} </span>
      <button disabled={page >= (data?.meta?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>بعدی</button>
    </main>
  );
}
