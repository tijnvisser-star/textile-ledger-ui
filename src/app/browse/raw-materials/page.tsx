"use client";

import { useState } from "react";

const rawOptions = ["Cotton","Polyester","Elastane","Nylon","Bamboo","Recycled material"] as const;
const recycledOptions = ["post_consumer","textile_to_textile","rPET"] as const;

export default function BrowseRawMaterials() {
  const [raw, setRaw] = useState<(typeof rawOptions)[number]>("Cotton");
  const [sub, setSub] = useState<(typeof recycledOptions)[number]>("post_consumer");

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Raw materials</h1>
      <p>Kies een raw material om te zien wat je kunt invullen. (Demo / browse mode)</p>

      <label>Raw material</label>
      <select
        style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
        value={raw}
        onChange={(e) => setRaw(e.target.value as any)}
      >
        {rawOptions.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      {raw === "Recycled material" && (
        <>
          <label>Recycled subtype</label>
          <select
            style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
            value={sub}
            onChange={(e) => setSub(e.target.value as any)}
          >
            {recycledOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      )}

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Wat je hier invult (later in /input)</h2>
        <ul>
          <li>Impact per kg (CO₂, water, energie, etc.)</li>
          <li>Recycled content (als dit relevant is)</li>
          <li>Substances of concern (optioneel)</li>
          <li>Evidence/validatie: certificate (groen), audit (oranje), self-declared (rood)</li>
        </ul>

        <p style={{ marginTop: 12 }}>
          Klaar om dit vast te leggen?{" "}
          <a href="/choose-actor"><b>Ga naar actor kiezen</b></a>
        </p>
      </div>

      <p style={{ marginTop: 16 }}>
        <a href="/browse">← terug naar browse</a>
      </p>
    </div>
  );
}
