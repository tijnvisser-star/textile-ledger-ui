import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>T-Easy AAS Textile Ledger</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Demo UI to input, import and export textile supply-chain data.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <Link href="/input/supplier" style={linkStyle}>
          → Supplier input
        </Link>

        <Link href="/input/brand" style={linkStyle}>
          → Brand input
        </Link>

        <Link href="/export" style={linkStyle}>
          → Export
        </Link>

        <Link href="/test" style={linkStyle}>
          → Test page (routing check)
        </Link>
      </div>

      <hr style={{ margin: "28px 0" }} />

      <p style={{ margin: 0, color: "#666" }}>
        Tip: you can open supplier directly with a phase, e.g. <code>?phase=Yarn</code>
      </p>
    </main>
  );
}

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: 14,
  border: "1px solid #ddd",
  borderRadius: 10,
  textDecoration: "none",
  color: "inherit",
};
