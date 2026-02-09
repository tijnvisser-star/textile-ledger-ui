export default function HomePage() {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <a
          href="/input/supplier?phase=RawMaterials"
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
            background: "#fff",
          }}
        >
          Open Supplier Input (Demo)
        </a>
      </div>

      <h1>Textile Ledger UI ✅</h1>
      <p>
        Home page works. Try: <a href="/test">/test</a>
      </p>
    </div>
  );
}
