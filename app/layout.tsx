import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ole-work.ole9917.chatgpt.site"),
  title: "OLE WORK",
  description: "พื้นที่ผู้ดูแลสำหรับมอบหมายงาน ติดตามพนักงาน ปฏิทินและรายงานจากข้อมูลชุดเดียวกัน",
  openGraph: {
    title: "OLE WORK",
    description: "จัดงานชัด ติดตามง่าย ทุกสาขาไปด้วยกัน",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "OLE WORK" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OLE WORK",
    description: "จัดงานชัด ติดตามง่าย ทุกสาขาไปด้วยกัน",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
