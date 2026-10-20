import type { ReactNode } from "react";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {process.env.NEXT_PUBLIC_API_MODE === "mock" && <div style={{ background: "#fde68a", padding: 4 }}>دیتای ساختگی (mock)</div>}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
