"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Product = {
  id: string;
  product_code: string;
  public_slug: string | null;
};

type LedgerRow = {
  id: string;
  tier: string | null;
  actor: string | null;
  aspect_key: string;
  value: string | null;
  unit: string | null;
  method: string;
  confidence_score: number;
  created_at: string;
};

const TIERS = ["transport", "T1", "T2", "T3", "T4", "product"] as const;

// Controlled vocabulary: keep it small for MVP, expand later
const ASPECTS = [
  { key: "product_type", label: "Product type" },
  { key: "material_composition", label: "Material composition" },
  { key: "durability_class", label: "Durability class" },
  { key: "recyclability_class", label: "Recyclability class" },
  { key: "audit_coverage", label: "Audit coverage" },
  { key: "living_wage_status", label: "Living wage status" },
] as const;

const VALUE_OPTIONS: Record<string, string[]> = {
  product_type: ["T-shirt", "Hoodie", "Sweater", "Jacket", "Jeans", "Dress", "Other"],
  durability_class: ["low", "medium", "high"],
  recyclability_class: ["easy", "moderate", "hard"],
  living_wage_status: ["yes", "partial", "no", "unknown"],
  audit_coverage: ["none", "partial", "full"]
};

export default function AdminLedgerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    tier: "product",
    actor: "Brand T 🏪",
    aspect_key: "product_type",
    value: "Hoodie",
    unit: "",
    method: "estimate",
    confidence_score: "0.6"
  });

  const valueChoices = useMemo(() => VALUE_OPTIONS[form.aspect_key] ?? null, [form.aspect_key]);

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_code, public_slug")
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setProducts(data ?? []);
  }

  async function loadRows(pid: string) {
    const { data, error } = await supabase
      .from("ledger_rows")
      .select("*")
      .eq("product_id", pid)
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setRows((data ?? []) as LedgerRow[]);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (productId) loadRows(productId);
  }, [productId]);

  async function addRow() {
    if (!productId) return alert("Select a product first.");
    setLoading(true);

    const payload = {
      product_id: productId,
      tier: form.tier,
      actor: form.actor,
      aspect_key: form.aspect_key,
      value: form.value,
      unit: form.unit || null,
      method: form.method,
      applicability: "required",
      confidence_score: Number(form.confidence_score)
    };

    const { error } = await supabase.from("ledger_rows").insert(payload);
    setLoading(false);

    if (error) return alert("Insert failed: " + error.message);

    await loadRows(productId);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1000 }}>
      <h1>Admin — Ledger (controlled input)</h1>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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

        {productId && (
          <a
            href={`/p/${products.find(p => p.id === productId)?.public_slug ?? ""}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Open share link ↗
          </a>
        )}
      </div>

      <h2 style={{ marginTop: 20 }}>Add ledger row</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Tier
          <select value={form.tier} onChange={(e) => setForm(f => ({ ...f, tier: e.target.value }))}>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Actor
          <input value={form.actor} onChange={(e) => setForm(f => ({ ...f, actor: e.target.value }))} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Aspect
          <select
            value={form.aspect_key}
            onChange={(e) => {
              const k = e.target.value;
              const defaults = VALUE_OPTIONS[k];
              setForm(f => ({
                ...f,
                aspect_key: k,
                value: defaults?.[0] ?? ""
              }));
            }}
          >
            {ASPECTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Value
          {valueChoices ? (
            <select value={form.value} onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}>
              {valueChoices.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input value={form.value} onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))} />
          )}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Unit (optional)
          <input value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="%, kg, km, etc." />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Confidence (0..1)
          <input value={form.confidence_score} onChange={(e) => setForm(f => ({ ...f, confidence_score: e.target.value }))} />
        </label>

        <button
          onClick={addRow}
          disabled={loading}
          style={{ padding: 10, gridColumn: "1 / -1", cursor: "pointer" }}
        >
          {loading ? "Adding..." : "➕ Add (append-only)"}
        </button>
      </div>

      <h2 style={{ marginTop: 24 }}>Ledger rows</h2>
      <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
        <thead>
          <tr>
            <th>tier</th>
            <th>actor</th>
            <th>aspect</th>
            <th>value</th>
            <th>unit</th>
            <th>method</th>
            <th>confidence</th>
            <th>created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.tier}</td>
              <td>{r.actor}</td>
              <td>{r.aspect_key}</td>
              <td>{r.value}</td>
              <td>{r.unit}</td>
              <td>{r.method}</td>
              <td>{r.confidence_score}</td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Note: values are controlled for key fields (e.g., Hoodie vs Sweater). We can expand the controlled lists later.
      </p>
    </div>
  );
}
