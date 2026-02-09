export default function BrowsePage() {
  return (
    <div style={{ maxWidth: 900, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Browse (demo)</h1>
      <p style={{ opacity: 0.85 }}>
        This page is a read-only demo of what data is captured per phase. To actually save data, use <b>Start</b>.
      </p>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Phases</h2>
        <ol style={{ lineHeight: "1.9em" }}>
          <li><b>RawMaterials</b> – material type, recycled subtype, chemicals & substances of concern, impact per kg, evidence.</li>
          <li><b>Yarn</b> – process type, upstream inputs (%), chemicals & substances of concern, impact per kg, evidence.</li>
          <li><b>Fabric</b> – process type, upstream inputs (%), chemicals & substances of concern, impact per kg, evidence.</li>
          <li><b>Manufacturer</b> – process type, upstream inputs (%), chemicals & substances of concern, impact per kg, evidence.</li>
          <li><b>Transport</b> – transport mode + distance, CO₂ per kg, optional PM2.5, evidence.</li>
          <li><b>Brand</b> – use phase & end-of-life inputs + (beta) scope 1/2.</li>
        </ol>
      </div>

      <div style={{ marginTop: 20 }}>
        <a href="/input/supplier?phase=RawMaterials" style={{ fontSize: 18 }}>
          Go to input (login required)
        </a>
      </div>
    </div>
  );
}
