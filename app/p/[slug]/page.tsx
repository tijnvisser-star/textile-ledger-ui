"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type Product = {
  id: string;
  product_code: string;
  public_slug: string;
};

type LedgerRow = {
  id: string;
  tier: string | null;
  actor: string | null;
  aspect_key: string;
  value: string | null;
  unit: string | null;
  confidence_score: number;
  created_at: string;
};

const TIERS = ["transport", "T1", "T2", "T3", "T4", "product"] as const;

const ASPECTS = [
  { key: "product_type", label: "Product type" },
  { key: "durability_class", label: "Durability class" },
  { key: "recyclability_class", label: "Recyclability class" },
  { key: "audit_coverage", label: "Audit coverage" }
] as const;

const VALUE_OPTIONS: Record<string, string[]> = {
  product_type: ["T-shirt", "Hoodie", "Sweater", "Jacket", "Jeans", "Dress", "Other"],
  durability_class: ["low", "medium", "high"],
  recyclability_class: ["easy", "moderate", "hard"],
  audit_coverage: ["none", "partial", "full"]
};

export default function PublicProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [product, setProduct] = useState<Product | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [form, setForm] = useState({
    tier: "product",
    actor: "Supervisor 🧑‍🏫",
    aspect_key: "audit_coverage",
    value: "partial",
    unit: "",
    confidence_score: "0.7",
    pin: ""
  });

  const valueChoices = useMemo(() => VALUE_OPTIONS[form.aspect_key] ?? null, [form.aspect_key]);

  async function loadAll() {
    setMsg("");
    const { data: p, error: pe } = await supabase
      .from("products")
      .select("id, product_code, public_slug")
      .eq("public_slug", slug)
      .single();

    if (pe) return setMsg("ERROR loading product: " + pe.message);
    setProduct(p as Product);

    const { data: lr, error: le } = await supabase
      .from("ledger_rows")
      .select("*")
      .eq("product_id", (p as Product).id)
      .order("created_at", { ascending: false });

    if (le) return setMsg("ERROR loading ledger: " + le.message);
    setRows((lr ?? []) as LedgerRow[]);
  }

  useEffect(() => {
    if (slug) loadAll();
  }, [slug]);

  async function addRow() {
    if (!product) return;

    const DEMO_PIN = "1234";
    if (form.pin !== DEMO_PIN) return alert("Wrong PIN (demo). Use 1234.");

    const payload = {
      product_id: product.id,
      tier: form.tier,
      actor: form.actor,
      aspect_key: form.aspect_key,
      value: form.value,
      unit: form.unit || null,
      method: "third_party",
      applicability: "optional",
      confidence_score: Number(form.confidence_score)
    };

    const { error } = await supabase.from("ledger_rows").insert(payload);
    if (error) return alert("Insert failed: " + error.message);

    await loadAll();
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1000 }}>
      <h1>Product Ledger</h1>
      {msg && <p style={{ color: "crimson" }}>{msg}</p>}

      {product ? (
        <>
          <p>
            <b>{product.product_code}</b> — share link: <code>/p/{product.public_slug}</code>
          </p>

          <h2 style={{ marginTop: 20 }}>Add entry (supervisor)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              PIN (demo)
              <input value={form.pin} onChange={(e) => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="1234" />
            </label>

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
                  setForm(f => ({ ...f, aspect_key: k, value: VALUE_OPTIONS[k]?.[0] ?? "" }));
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
              Confidence (0..1)
              <input value={form.confidence_score} onChange={(e) => setForm(f => ({ ...f, confidence_score: e.target.value }))} />
            </label>

            <button onClick={addRow} style={{ padding: 10, gridColumn: "1 / -1", cursor: "pointer" }}>
              ➕ Add entry
            </button>
          </div>

          <h2 style={{ marginTop: 24 }}>Ledger</h2>
          <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th>tier</th>
                <th>actor</th>
                <th>aspect</th>
                <th>value</th>
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
                  <td>{r.confidence_score}</td>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: 12, opacity: 0.7 }}>
            Demo share page. Real security comes from Supabase RLS policies (later sprint).
          </p>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
