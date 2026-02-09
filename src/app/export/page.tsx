"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  profile_id: string;
  owner_actor_id: string;
  profile_type: string;
  material_or_process: string;
  impact_payload: any;
  created_at: string;
};

function toCsv(rows: any[]) {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const escape = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ].join("\n");
}

export default function ExportPage() {
  const [actorId, setActorId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("RawMaterials");
  const [msg, setMsg] = useState<string>("");

  const phases = useMemo(() => ["RawMaterials","Yarn","Fabric","Manufacturer","Transport","Brand"], []);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return setMsg("Niet ingelogd. Ga naar /login.");

      const { data, error } = await supabase
        .from("actor_users")
        .select("actor_id")
        .eq("auth_uid", uid)
        .single();

      if (error) return setMsg(error.message);
      setActorId((data as any)?.actor_id ?? null);
    })();
  }, []);

  async function exportJson() {
    setMsg("");
    if (!actorId) return setMsg("Geen actor gekoppeld.");

    const { data, error } = await supabase
      .from("profiles")
      .select("profile_id, owner_actor_id, profile_type, material_or_process, impact_payload, created_at")
      .eq("owner_actor_id", actorId)
      .order("created_at", { ascending: false });

    if (error) return setMsg(error.message);

    // filter on phase if present in payload
    const filtered = (data as any[]).filter(p => (p.impact_payload?.phase ?? "") === phase);

    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${actorId}-${phase}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`JSON export klaar: ${filtered.length} records`);
  }

  async function exportCsv() {
    setMsg("");
    if (!actorId) return setMsg("Geen actor gekoppeld.");

    const { data, error } = await supabase
      .from("profiles")
      .select("profile_id, owner_actor_id, profile_type, material_or_process, impact_payload, created_at")
      .eq("owner_actor_id", actorId)
      .order("created_at", { ascending: false });

    if (error) return setMsg(error.message);

    const filtered = (data as any[]).filter(p => (p.impact_payload?.phase ?? "") === phase);

    // flatten a few key fields so CSV is readable
    const flat = filtered.map(p => ({
      profile_id: p.profile_id,
      owner_actor_id: p.owner_actor_id,
      phase: p.impact_payload?.phase ?? "",
      material_or_process: p.material_or_process,
      evidence_type: p.impact_payload?.evidence?.type ?? "",
      evidence_stoplight: p.impact_payload?.evidence?.stoplight ?? "",
      evidence_url: p.impact_payload?.evidence?.url ?? "",
      evidence_file_path: p.impact_payload?.evidence?.file_path ?? "",
      co2_kg_per_kg: p.impact_payload?.impacts_per_kg?.co2_kg ?? "",
      water_l_per_kg: p.impact_payload?.impacts_per_kg?.water_l ?? "",
      energy_kwh_per_kg: p.impact_payload?.impacts_per_kg?.energy_kwh ?? "",
      created_at: p.created_at,
    }));

    const csv = toCsv(flat);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${actorId}-${phase}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg(`CSV export klaar: ${flat.length} records`);
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Export (per invoer / phase)</h1>
      <p>Export je eigen entries als JSON (primary) of CSV (manager view).</p>
      {msg && <p>{msg}</p>}

      <p>Actor: <b>{actorId ?? "…"}</b></p>

      <label>Phase</label>
      <select style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
        value={phase} onChange={(e) => setPhase(e.target.value)}>
        {phases.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={exportJson} style={{ padding: "10px 14px" }}>Download JSON</button>
        <button onClick={exportCsv} style={{ padding: "10px 14px" }}>Download CSV</button>
      </div>

      <p style={{ marginTop: 16 }}><a href="/browse">← terug naar browse</a></p>
    </div>
  );
}
