"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type LinkRow = { profile_id: string; percent: number };

export default function BrandInputPage() {
  const ACTOR_ID = process.env.NEXT_PUBLIC_DEMO_ACTOR_ID!;

  const [actorId] = useState<string>(ACTOR_ID);
  const [actorName] = useState<string>(ACTOR_ID);

  const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const DEMO_ACTOR_ID = process.env.NEXT_PUBLIC_DEMO_ACTOR_ID || "";


  // Use phase (minimal v1)
  const [durability, setDurability] = useState<number>(0);
  const [repairability, setRepairability] = useState<number>(0);
  const [careInstructions, setCareInstructions] = useState<string>("");

  // End-of-life (minimal v1)
  const [recyclability, setRecyclability] = useState<number>(0);
  const [recycledContentPct, setRecycledContentPct] = useState<number>(0);
  const [eolNote, setEolNote] = useState<string>("");

  // Scope 1/2 (minimal v1)
  const [scope12EnergyKwh, setScope12EnergyKwh] = useState<number>(0);
  const [renewablePct, setRenewablePct] = useState<number>(0);

  // Scope 3 links (manufacturer + transport profiles)
  const [scope3Links, setScope3Links] = useState<LinkRow[]>([
    { profile_id: "", percent: 0 },
    { profile_id: "", percent: 0 },
  ]);

  const [msg, setMsg] = useState("");

  async function saveBrandProfile() {
    setMsg("");
    if (!actorId) return setMsg("No actor linked yet.");

    const total = scope3Links.reduce((s, r) => s + (Number(r.percent) || 0), 0);
    if (total !== 100) {
      return setMsg(`Scope 3 percentages must add up to 100. Current total: ${total}%`);
    }

    const impact_payload = {
      phase: "Brand",
      use_phase: {
        durability_score_0_10: durability,
        repairability_score_0_10: repairability,
        care_instructions: careInstructions || null,
      },
      end_of_life: {
        recyclability_score_0_10: recyclability,
        recycled_content_pct: recycledContentPct,
        note: eolNote || null,
      },
      scope_1_2: {
        energy_kwh: scope12EnergyKwh,
        renewable_pct: renewablePct,
      },
      scope_3_links: scope3Links.map((r) => ({
        profile_id: r.profile_id,
        percent: r.percent,
      })),
      created_at: new Date().toISOString(),
    };

    // Save as a profile (just like suppliers)
    const profile_id = `PROF_BRAND_${Date.now()}`;

    const { error: pErr } = await supabase.from("profiles").insert({
      profile_id,
      owner_actor_id: actorId,
      phase: "Brand",
      process_type: "BrandInputs",
      impact_payload,
    });    

    setMsg(`Saved ✅ Profile: ${profile_id}`);
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Brand input</h1>
      <p style={{ opacity: 0.8 }}>
        Actor: <b>{actorName || "…"}</b> {actorId ? <span>({actorId})</span> : null}
      </p>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Use phase</h2>

        <label>Durability (0–10)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={durability}
          onChange={(e) => setDurability(Number(e.target.value))}
        />

        <label>Repairability (0–10)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={repairability}
          onChange={(e) => setRepairability(Number(e.target.value))}
        />

        <label>Care / maintenance notes (optional)</label>
        <input
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={careInstructions}
          onChange={(e) => setCareInstructions(e.target.value)}
          placeholder="e.g., washing temperature, repair guidance..."
        />
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>End-of-life</h2>

        <label>Recyclability (0–10)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={recyclability}
          onChange={(e) => setRecyclability(Number(e.target.value))}
        />

        <label>Recycled content (%)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={recycledContentPct}
          onChange={(e) => setRecycledContentPct(Number(e.target.value))}
        />

        <label>End-of-life note (optional)</label>
        <input
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={eolNote}
          onChange={(e) => setEolNote(e.target.value)}
          placeholder="e.g., take-back program, mono-material, blend limits..."
        />
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Scope 1 & 2 (beta)</h2>

        <label>Energy use (kWh)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={scope12EnergyKwh}
          onChange={(e) => setScope12EnergyKwh(Number(e.target.value))}
        />

        <label>Renewable energy (%)</label>
        <input
          type="number"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={renewablePct}
          onChange={(e) => setRenewablePct(Number(e.target.value))}
        />
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Scope 3 links (Manufacturer + Transport)</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Link upstream profiles (profile_id) and enter percentages. Total must be 100.
        </p>

        {scope3Links.map((row, idx) => (
          <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0" }}>
            <input
              style={{ flex: 1, padding: 10 }}
              placeholder="profile_id (e.g., PROF_...)"
              value={row.profile_id}
              onChange={(e) => {
                const v = e.target.value;
                setScope3Links((prev) => prev.map((r, i) => (i === idx ? { ...r, profile_id: v } : r)));
              }}
            />
            <input
              style={{ width: 90, padding: 10, textAlign: "right" }}
              type="number"
              value={row.percent}
              onChange={(e) => {
                const v = Number(e.target.value);
                setScope3Links((prev) => prev.map((r, i) => (i === idx ? { ...r, percent: v } : r)));
              }}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => setScope3Links((prev) => [...prev, { profile_id: "", percent: 0 }])}
          style={{ padding: "8px 12px", marginTop: 8 }}
        >
          + Add link
        </button>

        <p style={{ marginTop: 12 }}>
          <b>Total: {scope3Links.reduce((sum, r) => sum + (Number(r.percent) || 0), 0)}%</b>
        </p>
      </div>

      <button onClick={saveBrandProfile} style={{ padding: "10px 14px", marginTop: 14 }}>
        Save Brand profile
      </button>

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </div>
  );
}
