"use client";

export default function HomePage() {
  return (
    <div style={{ maxWidth: 900, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Textile Ledger – Beta</h1>

      <p>
        Deze beta focust op:
      </p>

      <ul>
        <li>Profiles (process / material)</li>
        <li>Validatie (stoplicht)</li>
        <li>Product ↔ profile linking</li>
        <li>Use phase & End-of-life (Brand)</li>
      </ul>

      <p>
        De oude DPP phase-form wizard is bewust verwijderd.
      </p>

      <p>
        👉 Ga naar:
      </p>

      <ul>
        <li><a href="/login">/login</a> – login</li>
        <li><a href="/browse">/browse</a> – fases & process types</li>
        <li><a href="/brand">/brand</a> – brand inputs</li>
      </ul>
    </div>
  );
}
