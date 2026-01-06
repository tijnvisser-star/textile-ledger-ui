import "./globals.css";

export const metadata = {
  title: "Textile Ledger UI",
  description: "Interoperable product ledger MVP"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
