"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Product = { id: string; product_code: string; public_slug: string | null };

type DppField = {
  id: string;
  phase: string;
  key: string;
  label: string;
  data_type: "select" | "number" | "text" | "boolean";
  required: boolean;
  allowed_values: any; // jsonb -> array
  unit_options: any;   // jsonb -> array
  description: string | null;
};

type LedgerInsert = {
  product_id: string;
  tier: string | null;
  actor: string | null;
  aspect_key: string;
  value: string | null;
  unit: string | null;
  method: string;
  applicability: string;
  confidence_score: number;
};

export default function WizardPage() {
const [brandFields, setBrandFields] = useState<DppField[]>([]);
const [brandValues, setBrandValues] = useState<Record<string, any>>({});
const [brandUnits, setBrandUnits] = useState<Record<string, string>>({});
const BRAND_PHASE = "Brand impact";

  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");

  const [phases, setPhases] = useState<string[]>([]);
  const [phase, setPhase] = useState<string>("");

  const [fields, setFields] = useState<DppField[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [units, setUnits] = useState<Record<string, string>>({});

  const [actor, setActor] = useState("Brand T 🏪");
  const [confidence, setConfidence] = useState("0.7");
  const [msg, setMsg] = useState<string>("");
const [evidence, setEvidence] = useState({
  type: "certificate",
  url: "",
  note: ""
});

  // map phase -> internal tier (for compatibility)
  const tierForPhase = useMemo(() => {
    const map: Record<string, string> = {
      "Raw materials & sourcing": "T4",
      "Yarn & intermediate processing": "T3",
      "Fabric production & finishing": "T2",
      "Product manufacturing": "T1",
      "International transport": "transport",
      "Use phase": "downstream",
      "End-of-life / recycling": "downstream"
    };
    return map[phase] ?? "product";
  }, [phase]);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_code, public_slug")
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setProducts(data ?? []);
  }

  async function loadPhases() {
    const { data, error } = await supabase
      .from("dpp_fields")
      .select("phase");

    if (error) return alert(error.message);

const all = Array.from(new Set((data ?? []).map((r: any) => r.phase))).sort();

const hidden = new Set(["Use phase", "End-of-life / recycling"]);
const visible = all.filter((p) => !hidden.has(p));

setPhases(visible);
if (!phase && visible.length) setPhase(visible[0]);
  }

  async function loadFieldsForPhase(p: string) {
    setMsg("");
    const { data, error } = await supabase
      .from("dpp_fields")
      .select("*")
      .eq("phase", p)
      .order("required", { ascending: false })
      .order("label", { ascending: true });

    if (error) return alert(error.message);

    const rows = (data ?? []) as DppField[];
    setFields(rows);

    // initialize value defaults for selects
    const nextValues: Record<string, any> = {};
    const nextUnits: Record<string, string> = {};
    for (const f of rows) {
      const allowed = Array.isArray(f.allowed_values) ? f.allowed_values : [];
      const uopts = Array.isArray(f.unit_options) ? f.unit_options : [];
      if (f.data_type === "select") nextValues[f.key] = allowed[0] ?? "";
      else nextValues[f.key] = "";
      if (uopts.length) nextUnits[f.key] = uopts[0];
    }
    setValues(nextValues);
    setUnits(nextUnits);
  }

async function loadBrandImpactFields() {
  const { data, error } = await supabase
    .from("dpp_fields")
    .select("*")
    .eq("phase", BRAND_PHASE)
    .order("required", { ascending: false })
    .order("label", { ascending: true });

  if (error) return alert(error.message);

  const rows = (data ?? []) as DppField[];
  setBrandFields(rows);

  const nextValues: Record<string, any> = {};
  const nextUnits: Record<string, string> = {};
  for (const f of rows) {
    const allowed = Array.isArray(f.allowed_values) ? f.allowed_values : [];
    const uopts = Array.isArray(f.unit_options) ? f.unit_options : [];
    if (f.data_type === "select") nextValues[f.key] = allowed[0] ?? "";
    else nextValues[f.key] = "";
    if (uopts.length) nextUnits[f.key] = uopts[0];
  }
  setBrandValues(nextValues);
  setBrandUnits(nextUnits);
}

  useEffect(() => {
    loadProducts();
    loadPhases();
loadBrandImpactFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase) loadFieldsForPhase(phase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function isComplete(): boolean {
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.key];
      if (v === null || v === undefined) return false;
      if (String(v).trim() === "") return false;
    }
    return true;
  }

  async function submit() {
    setMsg("");
    if (!productId) return alert("Select a product first.");
    if (!phase) return alert("Select a phase.");
    if (!isComplete()) return alert("Required fields missing.");

    const inserts: LedgerInsert[] = fields.map((f) => ({
      product_id: productId,
      tier: tierForPhase,
      actor: actor,
      aspect_key: f.key,
      value: values[f.key] === "" ? null : String(values[f.key]),
      unit: (units[f.key] ?? "") || null,
      method: "self",
      applicability: f.required ? "required" : "optional",
      confidence_score: Number(confidence)
    }));

    const { error } = await supabase.from("ledger_rows").insert(inserts);
    if (error) return setMsg("ERROR: " + error.message);

    // Optional: add 1 evidence record for this phase submit (batch evidence)
    if (evidence.url.trim() !== "") {
      const { error: eerr } = await supabase.from("evidence").insert({
        linked_product_id: productId,
        phase,
        doc_type: evidence.type,
        url: evidence.url,
        note: evidence.note || null
      });

      if (eerr) return setMsg("Ledger saved, but evidence failed: " + eerr.message);
    }

    setMsg(
      `✅ Added ${inserts.length} ledger rows for phase: ${phase}${evidence.url ? " + evidence" : ""}`
    );
  }

async function submitBrandImpact() {
  setMsg("");
  if (!productId) return alert("Select a product first.");
  if (!brandFields.length) return alert("No brand fields loaded.");

  const inserts: LedgerInsert[] = brandFields.map((f) => ({
    product_id: productId,
    tier: "brand",
    actor: actor,
    aspect_key: f.key,
    value: brandValues[f.key] === "" ? null : String(brandValues[f.key]),
    unit: (brandUnits[f.key] ?? "") || null,
    method: "self",
    applicability: f.required ? "required" : "optional",
    confidence_score: Number(confidence)
  }));

  const { error } = await supabase.from("ledger_rows").insert(inserts);
  if (error) return setMsg("ERROR: " + error.message);

  // Re-use evidence block (optional)
  if (evidence.url.trim() !== "") {
    const { error: eerr } = await supabase.from("evidence").insert({
      linked_product_id: productId,
      phase: BRAND_PHASE,
      doc_type: evidence.type,
      url: evidence.url,
      note: evidence.note || null
    });

    if (eerr) return setMsg("Brand impact saved, but evidence failed: " + eerr.message);
  }

  setMsg(`✅ Saved Brand impact (${inserts.length} rows)${evidence.url ? " + evidence" : ""}`);
}

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <h1>DPP Wizard (phase-based)</h1>
      <p style={{ opacity: 0.75 }}>
        Choose a product → choose a phase → fill controlled fields → submit (append-only).
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <label>
          Product:{" "}
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_code} {p.public_slug ? `(${p.public_slug})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Phase:{" "}
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {phases.map((ph) => (
              <option key={ph} value={ph}>
                {ph}
              </option>
            ))}
          </select>
        </label>

        <label>
          Actor:{" "}
          <input value={actor} onChange={(e) => setActor(e.target.value)} />
        </label>

        <label>
          Confidence (0..1):{" "}
          <input value={confidence} onChange={(e) => setConfidence(e.target.value)} style={{ width: 80 }} />
        </label>

        <span style={{ opacity: 0.7 }}>
          Internal tier: <code>{tierForPhase}</code>
        </span>
      </div>

      <h2 style={{ marginTop: 18 }}>{phase}</h2>

{phase !== BRAND_PHASE && (
  <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(320px, 1fr))", gap: 12 }}>
        {fields.map((f) => {
          const allowed = Array.isArray(f.allowed_values) ? f.allowed_values : [];
          const uopts = Array.isArray(f.unit_options) ? f.unit_options : [];
          const requiredMark = f.required ? " *" : "";

          return (
            <div key={f.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b>{f.label}{requiredMark}</b>
                <code style={{ opacity: 0.7 }}>{f.key}</code>
              </div>
              {f.description && <div style={{ opacity: 0.75, marginTop: 6 }}>{f.description}</div>}

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {f.data_type === "select" ? (
                  <select
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  >
                    {allowed.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : f.data_type === "boolean" ? (
                  <select
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={f.data_type === "number" ? "number" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.data_type === "number" ? "Enter a number" : "Enter text"}
                  />
                )}

                {uopts.length > 0 && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    Unit:
                    <select
                      value={units[f.key] ?? uopts[0]}
                      onChange={(e) => setUnits((u) => ({ ...u, [f.key]: e.target.value }))}
                    >
                      {uopts.map((u: string) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
  </>
)}

{phase === BRAND_PHASE && (
  <>
<h2 style={{ marginTop: 26 }}>Brand impact</h2>
<p style={{ opacity: 0.75 }}>
  Brand-owned inputs (use phase + end-of-life + circular features). Not part of supplier phases.
</p>

<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(320px, 1fr))", gap: 12 }}>
  {brandFields.map((f) => {
    const allowed = Array.isArray(f.allowed_values) ? f.allowed_values : [];
    const uopts = Array.isArray(f.unit_options) ? f.unit_options : [];
    const requiredMark = f.required ? " *" : "";

    return (
      <div key={f.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <b>{f.label}{requiredMark}</b>
          <code style={{ opacity: 0.7 }}>{f.key}</code>
        </div>
        {f.description && <div style={{ opacity: 0.75, marginTop: 6 }}>{f.description}</div>}

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {f.data_type === "select" ? (
            <select
              value={brandValues[f.key] ?? ""}
              onChange={(e) => setBrandValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              {allowed.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : f.data_type === "boolean" ? (
            <select
              value={brandValues[f.key] ?? ""}
              onChange={(e) => setBrandValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              <option value="">Select…</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              type={f.data_type === "number" ? "number" : "text"}
              value={brandValues[f.key] ?? ""}
              onChange={(e) => setBrandValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.data_type === "number" ? "Enter a number" : "Enter text"}
            />
          )}

          {uopts.length > 0 && (
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              Unit:
              <select
                value={brandUnits[f.key] ?? uopts[0]}
                onChange={(e) => setBrandUnits((u) => ({ ...u, [f.key]: e.target.value }))}
              >
                {uopts.map((u: string) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
    );
  })}
</div>

<div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
  <button onClick={submitBrandImpact} style={{ padding: "10px 14px", cursor: "pointer" }}>
    ✅ Save Brand impact
  </button>
</div>
  </>
)}


<h2 style={{ marginTop: 18 }}>Evidence (optional)</h2>

<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(320px, 1fr))", gap: 12 }}>
  <label style={{ display: "grid", gap: 6 }}>
    Evidence type
    <select
      value={evidence.type}
      onChange={(e) => setEvidence((x) => ({ ...x, type: e.target.value }))}
    >
      <option value="certificate">certificate</option>
      <option value="audit">audit</option>
      <option value="SDS">SDS</option>
      <option value="test_report">test_report</option>
      <option value="other">other</option>
    </select>
  </label>

  <label style={{ display: "grid", gap: 6 }}>
    Evidence URL
    <input
      value={evidence.url}
      onChange={(e) => setEvidence((x) => ({ ...x, url: e.target.value }))}
      placeholder="https://..."
    />
  </label>

  <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
    Evidence note (optional)
    <input
      value={evidence.note}
      onChange={(e) => setEvidence((x) => ({ ...x, note: e.target.value }))}
      placeholder="e.g., GOTS certificate, ZDHC audit, durability report..."
    />
  </label>
</div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={submit} style={{ padding: "10px 14px", cursor: "pointer" }}>
          ✅ Submit phase entries
        </button>
        <span style={{ opacity: 0.8 }}>
          Required completeness: <b>{isComplete() ? "OK" : "Missing required fields"}</b>
        </span>
      </div>

      {msg && (
        <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {msg}
        </p>
      )}

      <p style={{ marginTop: 18, opacity: 0.75 }}>
        Next: attach evidence per entry (link/upload) and compute completeness/stoplight.
      </p>
    </div>
  );
}
