"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

type ActorUser = { actor_id: string | null };
type ActorRow = { actor_id: string; display_name: string | null };
type ComponentRow = { component_profile_id: string; percent: number };

type ImpactPerKg = {
  co2_kg: number;
  water_l: number;
  energy_kwh: number;
  pm25_g_per_kg?: number;
};

type SourceMode = "calculated" | "manual" | "none";

type ImpactSources = {
  scope3: { mode: SourceMode; calculated?: ImpactPerKg | null; manual?: ImpactPerKg | null; note?: string | null };
  total: { mode: SourceMode; calculated?: ImpactPerKg | null; manual?: ImpactPerKg | null; note?: string | null };
};

type ImpactResolved = {
  scope3_per_kg: ImpactPerKg | null;
  total_per_kg: ImpactPerKg | null;
};


function z(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeImpact(x: any): ImpactPerKg {
  if (!x) return { co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 };
  return {
    co2_kg: z(x.co2_kg),
    water_l: z(x.water_l),
    energy_kwh: z(x.energy_kwh),
    pm25_g_per_kg: x.pm25_g_per_kg != null ? z(x.pm25_g_per_kg) : 0,
  };
}

function addImp(a: ImpactPerKg | null | undefined, b: ImpactPerKg | null | undefined): ImpactPerKg {
  const A = normalizeImpact(a);
  const B = normalizeImpact(b);
  return {
    co2_kg: A.co2_kg + B.co2_kg,
    water_l: A.water_l + B.water_l,
    energy_kwh: A.energy_kwh + B.energy_kwh,
    pm25_g_per_kg: (A.pm25_g_per_kg ?? 0) + (B.pm25_g_per_kg ?? 0),
  };
}

function isNonZero(i: ImpactPerKg | null | undefined): boolean {
  if (!i) return false;
  const x = normalizeImpact(i);
  return !!(x.co2_kg || x.water_l || x.energy_kwh || (x.pm25_g_per_kg ?? 0));
}

/**
 * Canonical resolver:
 * scope3 from manual else calculated
 * total from manual else (scope3 + stepImpacts)
 */

function resolveImpactBundle(args: {
  scope3Calculated?: ImpactPerKg | null;
  scope3Manual?: ImpactPerKg | null;
  totalManual?: ImpactPerKg | null;
  stepImpacts?: ImpactPerKg | null;
}) {
  const step = normalizeImpact(args.stepImpacts);

  const scope3 =
    isNonZero(args.scope3Manual) ? normalizeImpact(args.scope3Manual) :
    isNonZero(args.scope3Calculated) ? normalizeImpact(args.scope3Calculated) :
    null;

  const totalCalculated = (scope3 || isNonZero(step))
    ? addImp(scope3, step)
    : null;

  const total =
    isNonZero(args.totalManual) ? normalizeImpact(args.totalManual) : totalCalculated;

  const sources: ImpactSources = {
    scope3: {
      mode: isNonZero(args.scope3Manual) ? "manual" : (isNonZero(args.scope3Calculated) ? "calculated" : "none"),
      calculated: isNonZero(args.scope3Calculated) ? normalizeImpact(args.scope3Calculated) : null,
      manual: isNonZero(args.scope3Manual) ? normalizeImpact(args.scope3Manual) : null,
    },
    total: {
      mode: isNonZero(args.totalManual) ? "manual" : "calculated",
      calculated: totalCalculated,
      manual: isNonZero(args.totalManual) ? normalizeImpact(args.totalManual) : null,
    },
  };

  const resolved: ImpactResolved = {
    scope3_per_kg: scope3,
    total_per_kg: total,
  };

  return { sources, resolved, totalCalculated };
}

/** Prefer total_per_kg if present, else impacts_per_kg */
function readBestImpactFromPayload(p: any): ImpactPerKg {
  const best = p?.resolved?.total_per_kg ?? p?.total_per_kg ?? p?.impacts_per_kg ?? {};
  return normalizeImpact(best);
}

const MIN_PROFILE_ID_LEN = 10;

function fmtEnergyKwhPerKg(x: number) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";

  // Geen nep-precisie bij grote getallen
  if (Math.abs(n) >= 100) return String(Math.round(n)); // 880 -> "880"
  if (Math.abs(n) >= 10) return n.toFixed(1);           // 12.34 -> "12.3"
  return n.toFixed(2);                                 // 1.234 -> "1.23"
}

export default function SupplierInputPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: "system-ui" }}>Loading…</div>}>
      <SupplierInputPageInner />
    </Suspense>
  );
}

function SupplierInputPageInner() {
  const ME_STORAGE_KEY = "tls_meName";        // 1x definiëren
  const COUNTRY_STORAGE_KEY = "tls_meCountry"; // 1x definiëren

  const search = useSearchParams();
  const router = useRouter();
  const phase = search.get("phase") ?? "RawMaterials";
  const productFromUrl = search.get("product") ?? "";

  // --- Single source of truth: meName ---
  const [meName, setMeName] = useState<string>("This is me");
  const [meNameDirty, setMeNameDirty] = useState(false);

  const [meCountry, setMeCountry] = useState<string>("NL");

  // Load from localStorage AFTER mount (prevents hydration mismatch)
  useEffect(() => {
  const n = window.localStorage.getItem(ME_STORAGE_KEY);
  const c = window.localStorage.getItem(COUNTRY_STORAGE_KEY);

  if (n != null) setMeName(n);
  if (c != null) setMeCountry(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ME_STORAGE_KEY, meName);
  }, [meName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, meCountry);
  }, [meCountry]);

    // Derived actor identity
    const actorIdClean = meName.trim(); // dit is je actor_id
    const actorLabel = actorIdClean;    // wat je in UI toont
    const actorId = actorIdClean; // alias: voorkomt crashes als ergens nog actorId staat
  
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
    const [msg, setMsg] = useState("");
    const [existingEntries, setExistingEntries] = useState<Array<{ profile_id: string; label: string }>>([]);
    const [productLine, setProductLine] = useState<string>("");
  
    useEffect(() => {
      if (productFromUrl && !productLine) {
        setProductLine(productFromUrl);
      }
    }, [productFromUrl, productLine]);

  // ---------- Import (XLSX) ----------
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: any) {
  return v == null ? "" : String(v).trim();
}

  const rawOptions = useMemo(
    () => ["Cotton","Polyester","Elastane","Nylon","Bamboo","Recycled material"] as const,
    []
  );
  const recycledOptions = useMemo(
    () => ["post_consumer","textile_to_textile","rPET"] as const,
    []
  );

  const processOptionsByPhase = useMemo(() => ({
    RawMaterials: ["Material"],
    Yarn: ["Spinning","YarnDyeing"],
    Fabric: ["KnittingWeaving","Dyeing","Finishing"],
    Manufacturer: ["CutMakeTrim","GarmentDyeing"],
    Transport: ["Transport"],
  } as Record<string, string[]>), []);

  const [processType, setProcessType] = useState<string>(() => (processOptionsByPhase[phase]?.[0] ?? "Material"));
  useEffect(() => {
    setProcessType(processOptionsByPhase[phase]?.[0] ?? "Material");
  }, [phase]);
  useEffect(() => {
    // When switching phases, the previously selected profile_id may belong to another phase.
    // If we keep it, Save can update the wrong row and violate DB constraints (profiles_check).
    setActiveProfileId(null);
    setMsg("");
  }, [phase]);
  
  const [rawMaterial, setRawMaterial] = useState<(typeof rawOptions)[number]>("Cotton");
  const [recycledSubtype, setRecycledSubtype] = useState<(typeof recycledOptions)[number]>("post_consumer");
  const [recycledBaseMaterial, setRecycledBaseMaterial] =
  useState<"Cotton" | "Polyester" | "Nylon" | "Other">("Cotton");

  // Impacts (beta minimal)
  const [co2GPerKgUI, setCo2GPerKgUI] = useState<string>("");        // gebruiker typt g/kg
  const [waterLPerKgUI, setWaterLPerKgUI] = useState<string>("");    // gebruiker typt L/kg
  const [energyKwhPerKgUI, setEnergyKwhPerKgUI] = useState<string>(""); // gebruiker typt kWh/kg
  const [pm25GPerKgUI, setPm25GPerKgUI] = useState<string>("");

  function numFromUI(s: string) {
    const n = Number(String(s ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }  
  
  // --- UI values -> numeric values (1 place, for whole page) ---
  const co2_g_per_kg = numFromUI(co2GPerKgUI);
  const co2_kg_per_kg = co2_g_per_kg / 1000; // ONLY CO2 gets converted (g/kg -> kg/kg)

  const water_l_per_kg = numFromUI(waterLPerKgUI);
  const energy_kwh_per_kg = numFromUI(energyKwhPerKgUI);

  const pm25_g_per_kg = numFromUI(pm25GPerKgUI); // PM2.5 stays g/kg (no conversion)

  // Transport – UI (controlled)
  const [transportMode, setTransportMode] = useState<string>("truck");
  const [transportDistanceKm, setTransportDistanceKm] = useState<number>(500);
  const [chemicalsUsed, setChemicalsUsed] = useState("");
  const [substancesOfConcern, setSubstancesOfConcern] = useState("");
  const [zdhcConform, setZdhcConform] = useState<boolean>(false);
  
// Brand – simple notes (for later coefficient / calc)
const [brandUseMeasures, setBrandUseMeasures] = useState<string>("");
const [brandPostUseMeasures, setBrandPostUseMeasures] = useState<string>("");

// Brand – Own impact (simple, later we can link this into the calc)
const [brandScope12Co2PerKg, setBrandScope12Co2PerKg] = useState<number>(0);
const [brandScope12EnergyPerKg, setBrandScope12EnergyPerKg] = useState<number>(0);

// Brand – Scope 3 links (additive: Manufacturer + Transport)
const [brandManufacturerProfileId, setBrandManufacturerProfileId] = useState<string>("");
const [brandTransportProfileIds, setBrandTransportProfileIds] = useState<string[]>([""]);

// External verification (BSCI/BCI/GOTS etc) — demo/dev
const [isVerifier, setIsVerifier] = useState<boolean>(false);
const [verifierOrg, setVerifierOrg] = useState<string>("BSCI");
const [latestVerification, setLatestVerification] = useState<null | {
  state: "green" | "orange" | "red";
  org: string | null;
  note: string | null;
  verified_at: string | null;
  links_changed_at: string | null;
}>(null);

  // Evidence / validation stoplight
  const [evidenceType, setEvidenceType] = useState<"certificate"|"audit"|"self_declared">("self_declared");
  const [evidenceUrl, setEvidenceUrl] = useState<string>("");
  const [evidenceNote, setEvidenceNote] = useState<string>("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  // Social factors (beta)
  const [socialEnabled, setSocialEnabled] = useState<boolean>(false);
  const [codeOfConduct, setCodeOfConduct] = useState<boolean>(false);
  const [auditStandard, setAuditStandard] = useState<string>("");
  const [livingWage, setLivingWage] = useState<boolean>(false);
  const [childLaborPolicy, setChildLaborPolicy] = useState<boolean>(false);
  const [equalityMeasuresMgmt, setEqualityMeasuresMgmt] = useState<boolean>(false);
  const [grievanceMechanism, setGrievanceMechanism] = useState<boolean>(false);
  const [unionRights, setUnionRights] = useState<boolean>(false);
  const [socialNote, setSocialNote] = useState<string>("");
  const [socialEvidenceUrl, setSocialEvidenceUrl] = useState<string>("");
  const [socialEvidenceNote, setSocialEvidenceNote] = useState<string>("");

// Inputs (%)
const [components, setComponents] = useState<ComponentRow[]>([
  { component_profile_id: "", percent: 80 },
  { component_profile_id: "", percent: 20 },
]);

const [upstreamCalc, setUpstreamCalc] = useState<ImpactPerKg | null>(null);
const [calcErr, setCalcErr] = useState<string>("");

// totals used in Calculated impacts box
const totalCo2 = (upstreamCalc?.co2_kg ?? 0) + co2_kg_per_kg;
const totalWater = (upstreamCalc?.water_l ?? 0) + water_l_per_kg;
const totalEnergy = (upstreamCalc?.energy_kwh ?? 0) + energy_kwh_per_kg;

// Brand-only Scope 3 calc from links (Manufacturer + Transport)
const [brandScope3Calc, setBrandScope3Calc] = useState<ImpactPerKg | null>(null);
const [brandScope3Err, setBrandScope3Err] = useState<string>("");

// Upstream transport links (additive) for Yarn/Fabric/Manufacturer
const [upstreamTransportProfileIds, setUpstreamTransportProfileIds] = useState<string[]>([""]);

// Upstream transport manual add-on (optional) for Yarn/Fabric/Manufacturer
const [upstreamTransportManual, setUpstreamTransportManual] = useState<ImpactPerKg>({
  co2_kg: 0,
  water_l: 0,
  energy_kwh: 0,
  pm25_g_per_kg: 0,
});
  
  useEffect(() => {
    (async () => {
      if (!actorIdClean) return;
  
      const { data, error } = await supabase
        .from("profiles")
        .select("profile_id, phase, impact_payload")
        .eq("owner_actor_id", actorIdClean)
        .order("created_at", { ascending: false })
        .limit(50);
  
      if (error) return;
  
      const rows = (data ?? [])
        .map((r: any) => {
          const p = r.impact_payload ?? {};
          if (r.phase !== phase) return null;
          const label = p?.product?.label ?? "";
          const fallback = `${p?.phase ?? "?"} — ${r.profile_id.slice(0,8)}…`;
          return { profile_id: r.profile_id as string, label: String(label || fallback) };
        })
        .filter(Boolean) as Array<{ profile_id: string; label: string }>;
  
      // unique by label (keep newest)
      const seen = new Set<string>();
      const uniq = rows.filter((r) => {
        if (seen.has(r.label)) return false;
        seen.add(r.label);
        return true;
      });
  
      setExistingEntries(uniq);
    })();
  }, [actorIdClean, phase]);

  useEffect(() => {
    (async () => {
      if (!activeProfileId) {
        setLatestVerification(null);
        return;
      }
  
      const { data, error } = await supabase
        .from("profile_validation_state")
        .select("state, org, note, verified_at, links_changed_at")
        .eq("profile_id", activeProfileId)
        .maybeSingle();
  
      if (error) {
        setLatestVerification(null);
        return;
      }
  
      setLatestVerification((data as any) ?? null);
    })();
  }, [activeProfileId]);
  
  const recalcUpstreamKey = useMemo(() => {
    const compKey = components
      .map((c) => `${(c.component_profile_id || "").trim()}:${Number(c.percent || 0)}`)
      .join("|");
  
    const tKey = (upstreamTransportProfileIds ?? [])
      .map((x) => (x || "").trim())
      .join("|");
  
    const m = upstreamTransportManual ?? { co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 };
  
    const mKey = `${Number(m.co2_kg || 0)}:${Number(m.water_l || 0)}:${Number(m.energy_kwh || 0)}:${Number(m.pm25_g_per_kg || 0)}`;
  
    return `${phase}__${compKey}__${tKey}__${mKey}`;
  }, [phase, components, upstreamTransportProfileIds, upstreamTransportManual]);
  
  useEffect(() => {
    recalcUpstream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcUpstreamKey]);
       
  useEffect(() => {
    // Auto recalc Brand Scope 3 whenever links change
    if (phase !== "Brand") return;
  
    // Only run when at least manufacturer has something typed
    const manuId = (brandManufacturerProfileId || "").trim();
    if (!manuId) {
      setBrandScope3Calc(null);
      setBrandScope3Err("");
      return;
    }
  
    recalcBrandScope3();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, brandManufacturerProfileId, JSON.stringify(brandTransportProfileIds)]);
  
  function rawMaterialColumnValue(args: {
    phase: string;
    rawMaterial?: string | null;
    recycledBaseMaterial?: string | null;
    recycledSubtype?: string | null;
    material_or_process?: string | null;
  }): string | null {
    if (args.phase !== "RawMaterials") return null;
  
    const rm = (args.rawMaterial ?? "").trim();
    if (rm) {
      if (rm === "Recycled material") {
        const base = (args.recycledBaseMaterial ?? "Other").trim() || "Other";
        const sub = (args.recycledSubtype ?? "post_consumer").trim() || "post_consumer";
        return `Recycled material:${base}:${sub}`;
      }
      return rm;
    }
  
    const mop = (args.material_or_process ?? "").trim();
    return mop || "Unknown";
  }
  
  function materialOrProcessLabel() {
    if (phase === "RawMaterials") {
      return rawMaterial === "Recycled material"
      ? `RecycledMaterial:${recycledBaseMaterial}:${recycledSubtype}`
      : rawMaterial;
    }
    return processType;
  }

  function readImpactPerKg(impact_payload: any): ImpactPerKg {
    const imp = impact_payload?.impacts_per_kg ?? {};
    return {
      co2_kg: Number(imp.co2_kg ?? 0),          // opgeslagen als kg/kg
      water_l: Number(imp.water_l ?? 0),
      energy_kwh: Number(imp.energy_kwh ?? 0),
      pm25_g_per_kg: imp.pm25_g_per_kg != null ? Number(imp.pm25_g_per_kg) : undefined,
    };
  }
    
  function totalPercent() {
    return components.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);
  }

  function updateComponent(i: number, patch: Partial<ComponentRow>) {
    setComponents((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addComponent() {
    setComponents((prev) => [...prev, { component_profile_id: "", percent: 0 }]);
  }

  async function uploadEvidenceIfNeeded(parentProfileId: string): Promise<string | null> {
    if (!evidenceFile || !actorIdClean) return null;

    const safeName = evidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `evidence/${actorIdClean}/${parentProfileId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage.from("evidence").upload(path, evidenceFile, {
      upsert: false,
    });

    if (error) throw new Error(error.message);
    return path;
  }

  function supaErr(err: any) {
    if (!err) return null;
    return {
      message: err?.message ?? null,
      details: err?.details ?? null,
      hint: err?.hint ?? null,
      code: err?.code ?? null,
      status: err?.status ?? null,
    };
  }
  
  async function ensureActorRow(actorId: string) {
    const { error } = await supabase
      .from("actors")
      .upsert(
        {
          actor_id: actorId,
          actor_kind: "supplier",
          display_name: actorLabel ?? actorId,
        },
        { onConflict: "actor_id" }
      )
        
    if (error) {
      const e = supaErr(error);
      console.error("[actors.upsert] failed:", e);
      throw new Error(
        `Save actor failed: ${e?.message ?? ""} | details=${e?.details ?? ""} | hint=${e?.hint ?? ""} | code=${e?.code ?? ""} | status=${e?.status ?? ""}`
      );
    }
  }
  
  async function saveActorDetails() {
    setMsg("");
  
    const id = meName.trim(); // spaties binnenin blijven
    if (!id) {
      setMsg("Vul eerst 'Company name' in.");
      return;
    }
  
    // onthouden per browser
    localStorage.setItem(ME_STORAGE_KEY, id);
    localStorage.setItem(COUNTRY_STORAGE_KEY, meCountry);
  
    // UI-state sync (single source of truth = meName)
    setMeName(id);
    setMeNameDirty(false);
  
    // (optioneel) meteen actor in DB zetten voor zekerheid:
    try {
      await ensureActorRow(id);
    } catch (e: any) {
      setMsg(e?.message ?? "Save actor failed");
      return;
    }
  
    setMsg("Saved ✅");
  }  
      
  function downloadTemplateXlsx() {
    const wb = XLSX.utils.book_new();
  
    // exact headers expected by the importer (current)
    const headersCommon = {
      product_line: "",
      co2KgPerKg: "",
      waterLPerKg: "",
      energyKwhPerKg: "",
      pm25GPerKg: "",
  
      chemicalsUsed: "",
      substancesOfConcern: "",
      zdhcConform: "",
  
      evidenceType: "",
      evidenceUrl: "",
      evidenceNote: "",
    };
  
    // RawMaterials
    const raw = [
      {
        ...headersCommon,
        rawMaterial: "",
        recycledBaseMaterial: "",
        recycledSubtype: "",
      },
    ];    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raw), "RawMaterials");
  
    // Yarn/Fabric/Manufacturer
const process = [
  {
    ...headersCommon,
    processType: "",
    components_json: "", // JSON OR "id:80;id:20"

    // Upstream transport (optional)
    upstream_transport_profile_ids: "", // JSON array OR "PROF_x;PROF_y"
    upstream_transport_manual_co2: "",
    upstream_transport_manual_energy: "",
    upstream_transport_manual_pm25: "",
    },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(process), "Yarn");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(process), "Fabric");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(process), "Manufacturer");
  
    // Transport
    const transport = [
      {
        ...headersCommon,
        mode: "",
        distance_km: "",
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transport), "Transport");
  
    // Brand
const brand = [
  {
    ...headersCommon,

    // Brand measures (used by importer)
    use_phase_measures: "",
    post_use_measures: "",

    // Own impact (Scope 1 & 2)
    scope12_co2_per_kg: "",
    scope12_energy_per_kg: "",

    // Scope 3 links
    manufacturer_profile_id: "",
    transport_profile_ids: "", // JSON array OR "PROF_x;PROF_y"
    },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(brand), "Brand");
  
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob(
      "TextileLedger_template_ALIGNED.xlsx",
      new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
  
    setMsg("Template downloaded ✅");
  }
  
  // ---------- Export helpers (Save bundle -> JSON/CSV) ----------
function buildSaveBundle() {
  const needsComponents = phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand";
  const material_or_process = materialOrProcessLabel();

  const upstreamManual = {
    co2_kg: Number((upstreamTransportManual as any)?.co2_kg || 0),
    water_l: 0, // transport has no water
    energy_kwh: Number((upstreamTransportManual as any)?.energy_kwh || 0),
    pm25_g_per_kg: Number((upstreamTransportManual as any)?.pm25_g_per_kg || 0),
  };

  const stepImpacts: ImpactPerKg =
    phase === "Brand"
      ? {
          co2_kg: Number(brandScope12Co2PerKg || 0),
          water_l: 0,
          energy_kwh: Number(brandScope12EnergyPerKg || 0),
          pm25_g_per_kg: 0,
        }
      : {
        co2_kg: co2_kg_per_kg,
        water_l: water_l_per_kg,
        energy_kwh: energy_kwh_per_kg,
        pm25_g_per_kg: phase === "Transport" ? pm25_g_per_kg : 0,        
        };

  const scope3Calculated = (phase !== "Brand" ? upstreamCalc : brandScope3Calc) ?? null;

  const payload: any = {
    phase,
    process_type: processType,
    material_or_process,
    unit: "per_kg",
    product: { label: productLine.trim() || null },

    upstream_transport_profile_ids: needsComponents
      ? (upstreamTransportProfileIds ?? []).map((s) => (s || "").trim()).filter(Boolean)
      : undefined,

    upstream_transport_manual: needsComponents ? upstreamManual : undefined,

    transport:
      phase === "Transport"
        ? { mode: transportMode, distance_km: transportDistanceKm }
        : undefined,

    impacts_per_kg:
      phase === "Brand"
        ? {
            co2_kg: Number(brandScope12Co2PerKg || 0),
            water_l: 0,
            energy_kwh: Number(brandScope12EnergyPerKg || 0),
          }
        : {
          co2_kg: co2_kg_per_kg,
          water_l: water_l_per_kg,
          energy_kwh: energy_kwh_per_kg,
          ...(phase === "Transport" ? { pm25_g_per_kg } : {}),
          },

    calculated_upstream: phase !== "Brand" ? (upstreamCalc ?? null) : (brandScope3Calc ?? null),

    impact_bundle: resolveImpactBundle({
      scope3Calculated,
      scope3Manual: null,
      totalManual: null,
      stepImpacts,
    }),

    sources: null,
    resolved: null,
    total_per_kg: null,

    chemicals:
      phase === "RawMaterials" || phase === "Yarn" || phase === "Fabric" || phase === "Manufacturer"
        ? {
            chemicals_used: chemicalsUsed || null,
            substances_of_concern: substancesOfConcern || null,
            zdhc_conform: !!zdhcConform,
          }
        : undefined,

    evidence: {
      type: evidenceType,
      stoplight: evidenceType === "certificate" ? "green" : evidenceType === "audit" ? "orange" : "red",
      url: evidenceUrl || null,
      note: evidenceNote || null,
      file_path: null as string | null,
    },

    brand:
      phase === "Brand"
        ? {
            use_phase_measures: brandUseMeasures || null,
            post_use_measures: brandPostUseMeasures || null,
            scope12_co2_per_kg: Number(brandScope12Co2PerKg || 0),
            scope12_energy_per_kg: Number(brandScope12EnergyPerKg || 0),
            manufacturer_profile_id: (brandManufacturerProfileId || "").trim() || null,
            transport_profile_ids: (brandTransportProfileIds ?? []).map((s) => (s || "").trim()).filter(Boolean),
          }
        : undefined,
  };

  // Promote bundle fields to top-level (same as Save)
  if (payload.impact_bundle?.resolved) {
    payload.sources = payload.impact_bundle.sources;
    payload.resolved = payload.impact_bundle.resolved;
    payload.total_per_kg = payload.impact_bundle.resolved.total_per_kg;
  }

  // Social
  if (socialEnabled) {
    payload.social = {
      code_of_conduct: codeOfConduct,
      audit_standard: auditStandard || null,
      living_wage: livingWage,
      child_labor_policy: childLaborPolicy,
      equality_measures_mgmt_positions: equalityMeasuresMgmt,
      grievance_mechanism: grievanceMechanism,
      union_rights: unionRights,
      note: socialNote || null,
      evidence: {
        url: socialEvidenceUrl || null,
        note: socialEvidenceNote || null,
      },
    };
  }

  // Components rows (export includes these, Save stores them in profile_components)
  const component_rows = needsComponents
    ? components
        .map((c) => ({
          component_profile_id: (c.component_profile_id || "").trim(),
          percent: Number(c.percent),
        }))
        .filter((r) => r.component_profile_id.length >= MIN_PROFILE_ID_LEN)
    : [];

  return { needsComponents, material_or_process, payload, component_rows };
}

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportDraftJson() {
    const { payload, component_rows } = buildSaveBundle();
  
    const out = {
      meta: {
        actor_id: actorIdClean || null,
        phase,
        product_line: productLine.trim() || null,
        profile_id: activeProfileId || null,
      },
      impact_payload: payload,
      profile_components: component_rows,
    };
  
    const json = JSON.stringify(out, null, 2);
  
    downloadBlob(
      `textile-ledger-${phase}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`,
      new Blob([json], { type: "application/json" })
    );
  
    setMsg("Exported JSON ✅");
  }  

  function csvEscape(v: any) {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportDraftCsv() {
    const { payload, component_rows } = buildSaveBundle();
  
    const row: Record<string, any> = {
      phase,
      actor_id: actorIdClean || "",
      product_line: productLine || "",
      profile_id: activeProfileId || "",
  
      impact_payload_json: JSON.stringify(payload),
      profile_components_json: JSON.stringify(component_rows),
    };
  
    const headers = Object.keys(row);
    const values = headers.map((h) => csvEscape(row[h]));
    const csv = `${headers.join(",")}\n${values.join(",")}\n`;
  
    downloadBlob(
      `textile-ledger-${phase}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  
    setMsg("Exported CSV ✅");
  }
  
  async function recalcUpstream() {
    setCalcErr("");
    setUpstreamCalc(null);
  
    // Alleen relevant bij fases met inputs (Yarn/Fabric/Manufacturer)
    if (phase === "RawMaterials" || phase === "Transport" || phase === "Brand") return;
  
    const anyComponentTyped = components.some(
      (c) => (c.component_profile_id || "").trim().length > 0
    );

    const anyTransportTyped = (upstreamTransportProfileIds ?? []).some(
      (x) => (x || "").trim().length > 0
    );

    const manualHasAny =
      Number(upstreamTransportManual.co2_kg || 0) !== 0 ||
      Number(upstreamTransportManual.energy_kwh || 0) !== 0 ||
      Number(upstreamTransportManual.pm25_g_per_kg || 0) !== 0;

    const ids = components
      .map((c) => (c.component_profile_id || "").trim())
      .filter((x): x is string => x.length >= MIN_PROFILE_ID_LEN);

    const transportIds = (upstreamTransportProfileIds ?? [])
      .map((x) => (x || "").trim())
      .filter((x) => x.length >= MIN_PROFILE_ID_LEN);

    const shouldCompute = ids.length > 0 || transportIds.length > 0 || manualHasAny;

    // If nothing is entered yet: no error, no calc.
    if (!shouldCompute) {
      setCalcErr("");
      setUpstreamCalc(null);
      return;
    }

    // Only error if the user typed something but no valid IDs exist.
    if (anyComponentTyped && ids.length === 0) {
      setCalcErr("Please enter valid component_profile_id(s) (PROF_...) or leave them all empty.");
      return;
    }

    if (anyTransportTyped && transportIds.length === 0) {
      setCalcErr("Please enter valid transport profile_id(s) (PROF_...) or leave them all empty.");
      return;
    }

    // Only enforce 100% when we actually have upstream component IDs to weight.
    if (ids.length > 0) {
      const t = totalPercent();
      if (Math.round(t * 100) / 100 !== 100) {
        setCalcErr(`Percentages must add up to 100. Currently: ${t}`);
        return;
      }
    }
  
    // 1) Fetch upstream profiles
    const fetchIds = Array.from(new Set([...ids, ...transportIds]));

    // Manual-only: no DB fetch needed
    if (fetchIds.length === 0) {
      const sum: ImpactPerKg = { co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 };

      sum.co2_kg += Number(upstreamTransportManual.co2_kg || 0);
      sum.energy_kwh += Number(upstreamTransportManual.energy_kwh || 0);
      sum.pm25_g_per_kg = (sum.pm25_g_per_kg ?? 0) + Number(upstreamTransportManual.pm25_g_per_kg || 0);

      setUpstreamCalc(sum);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("profile_id, impact_payload")
      .in("profile_id", fetchIds);
  
    if (error) {
      setCalcErr(error.message);
      return;
    }
  
    const map = new Map<string, any>();
    (data ?? []).forEach((r: any) => map.set(r.profile_id, r.impact_payload));
  
    // 2) Weighted sum: Σ(pct * upstream)
    const sum: ImpactPerKg = { co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 };
  
    for (const c of components) {
      const id = c.component_profile_id?.trim();
      const pct = Number(c.percent ?? 0) / 100;
  
      if (!id) continue;
  
      const payload = map.get(id);
      if (!payload) {
        setCalcErr(`Upstream profile not found: ${id}`);
        return;
      }
  
      const imp = readBestImpactFromPayload(payload);
  
      sum.co2_kg += pct * (imp.co2_kg ?? 0);
      sum.water_l += pct * (imp.water_l ?? 0);
      sum.energy_kwh += pct * (imp.energy_kwh ?? 0);
      sum.pm25_g_per_kg = (sum.pm25_g_per_kg ?? 0) + pct * (imp.pm25_g_per_kg ?? 0);
    }
  
    // Add additive upstream transport (optional)
for (const tid of transportIds) {
  const payload = map.get(tid);
  if (!payload) {
    setCalcErr(`Transport profile not found: ${tid}`);
    return;
  }
  const impT = readBestImpactFromPayload(payload);
  sum.co2_kg += impT.co2_kg ?? 0;
  sum.water_l += impT.water_l ?? 0;
  sum.energy_kwh += impT.energy_kwh ?? 0;
  sum.pm25_g_per_kg = (sum.pm25_g_per_kg ?? 0) + (impT.pm25_g_per_kg ?? 0);
}

// Add manual upstream transport add-on (optional)
sum.co2_kg += Number(upstreamTransportManual.co2_kg || 0);
sum.energy_kwh += Number(upstreamTransportManual.energy_kwh || 0);
sum.pm25_g_per_kg = (sum.pm25_g_per_kg ?? 0) + Number(upstreamTransportManual.pm25_g_per_kg || 0);

    setUpstreamCalc(sum);
  }
  
  async function recalcBrandScope3() {
    setBrandScope3Err("");
    setBrandScope3Calc(null);
  
    if (phase !== "Brand") return;
  
    const manuId = (brandManufacturerProfileId || "").trim();
    const transportIds = (brandTransportProfileIds ?? [])
      .map((x) => (x || "").trim())
      .filter((x) => x.length >= MIN_PROFILE_ID_LEN);
  
    if (!manuId) {
      setBrandScope3Err("Add manufacturer profile_id.");
      return;
    }
  
    const ids = [manuId, ...transportIds];
  
    const { data, error } = await supabase
      .from("profiles")
      .select("profile_id, impact_payload")
      .in("profile_id", ids);
  
    if (error) {
      setBrandScope3Err(error.message);
      return;
    }
  
    const map = new Map<string, any>();
    (data ?? []).forEach((r: any) => map.set(r.profile_id, r.impact_payload));
  
    const manuPayload = map.get(manuId);
    if (!manuPayload) {
      setBrandScope3Err(`Manufacturer profile not found: ${manuId}`);
      return;
    }
  
    let sum: ImpactPerKg = { co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 };
  
    // Add manufacturer
    sum = addImp(sum, readBestImpactFromPayload(manuPayload));
  
    // Add each transport (optional)
    for (const tid of transportIds) {
      const payload = map.get(tid);
      if (!payload) {
        setBrandScope3Err(`Transport profile not found: ${tid}`);
        return;
      }
      sum = addImp(sum, readBestImpactFromPayload(payload));
    }
  
    setBrandScope3Calc(sum);
  }  
  
  async function findExistingProfileId(args: {
    owner_actor_id: string;
    phase: string;
    material_or_process: string;
    productLine: string;
  }): Promise<string | null> {
    const { owner_actor_id, phase, material_or_process, productLine } = args;
  
    // NOTE: we filter minimal in SQL (owner + material_or_process), daarna filteren we op phase+productLine in JS
    const { data, error } = await supabase
      .from("profiles")
      .select("profile_id, impact_payload")
      .eq("owner_actor_id", owner_actor_id)
      .eq("material_or_process", material_or_process)
      .order("created_at", { ascending: false })
      .limit(50);
  
    if (error) throw new Error(error.message);
  
    const match = (data ?? []).find((r: any) => {
      const p = r.impact_payload ?? {};
      const pPhase = p.phase ?? null;
      const pProd = p?.product?.label ?? null;
      return pPhase === phase && (pProd ?? "") === (productLine ?? "");
    });
  
    return match?.profile_id ?? null;
  }
  
  async function upsertImportedProfile(args: {
    importPhase: string;
    productLine: string;
    material_or_process: string;
    processType?: string;
    rawMaterial?: string;
    recycledSubtype?: string;
    recycledBaseMaterial?: string;
  
    impacts: { co2_kg: number; water_l: number; energy_kwh: number; pm25_g_per_kg?: number };
    chemicals?: {
      chemicals_used?: string | null;
      substances_of_concern?: string | null;
      zdhc_conform?: boolean;
    };
      
    evidence?: { type?: string; url?: string | null; note?: string | null };
  
    social?: any;
    brand?: any;
    transport?: any;
  
    components?: { component_profile_id: string; percent: number }[];
    upstream_transport_profile_ids?: string[];
    upstream_transport_manual?: { co2_kg: number; energy_kwh: number; pm25_g_per_kg?: number };
  }) {
    if (!actorIdClean) throw new Error("No actorId in upsertImportedProfile");
  
    const phaseLocal = args.importPhase;
    const material_or_process = args.material_or_process;

    const needsComponents = phaseLocal !== "RawMaterials" && phaseLocal !== "Transport" && phaseLocal !== "Brand";
  
    const payload: any = {
      phase: phaseLocal,
      process_type: args.processType ?? (processOptionsByPhase[phaseLocal]?.[0] ?? "Material"),
      material_or_process,
      unit: "per_kg",
      product: { label: (args.productLine ?? "").trim() || null },
      upstream_transport_profile_ids: needsComponents
      ? (args.upstream_transport_profile_ids ?? []).map((s) => str(s)).filter(Boolean)
      : undefined,
  
      upstream_transport_manual: needsComponents
      ? {
          co2_kg: num(args.upstream_transport_manual?.co2_kg),
          water_l: 0, // transport has no water
          energy_kwh: num(args.upstream_transport_manual?.energy_kwh),
          pm25_g_per_kg: num(args.upstream_transport_manual?.pm25_g_per_kg),
        }
      : undefined,    
      transport: args.transport ?? undefined,
  
      impacts_per_kg: {
        co2_kg: Number(args.impacts.co2_kg ?? 0),
        water_l: Number(args.impacts.water_l ?? 0),
        energy_kwh: Number(args.impacts.energy_kwh ?? 0),
        ...(phaseLocal === "Transport" ? { pm25_g_per_kg: Number(args.impacts.pm25_g_per_kg ?? 0) } : {}),
      },
  
      chemicals: args.chemicals ? {
        chemicals_used: args.chemicals.chemicals_used ?? null,
        substances_of_concern: args.chemicals.substances_of_concern ?? null,
      } : undefined,
  
      evidence: {
        type: (args.evidence?.type ?? "self_declared"),
        stoplight: (args.evidence?.type ?? "self_declared") === "certificate" ? "green"
          : (args.evidence?.type ?? "self_declared") === "audit" ? "orange"
          : "red",
        url: args.evidence?.url ?? null,
        note: args.evidence?.note ?? null,
        file_path: null,
      },
  
      social: args.social ?? undefined,
      brand: args.brand ?? undefined,
    };
  
    // Components (only for Yarn/Fabric/Manufacturer)
    const componentsLocal = (args.components ?? []).filter(c => c.component_profile_id?.trim());
  
    if (needsComponents) {
      const t = componentsLocal.reduce((s, c) => s + (Number(c.percent) || 0), 0);
      if (Math.round(t * 100) / 100 !== 100) {
        throw new Error(`Import error: components percent must sum to 100. Got ${t} for product "${args.productLine}" in ${phaseLocal}`);
      }
      if (componentsLocal.length === 0) {
        throw new Error(`Import error: missing components for product "${args.productLine}" in ${phaseLocal}`);
      }
    }
  
    // Find existing (same logic as UI save)
    let parentProfileId: string | null = await findExistingProfileId({
      owner_actor_id: actorIdClean,
      phase: phaseLocal,
      material_or_process,
      productLine: args.productLine ?? "",
    });
  
    if (parentProfileId) {
      // UPDATE existing
      const { error: uErr } = await supabase
      .from("profiles")
      .update({
        owner_actor_id: actorIdClean,
        owner_actor_label: actorLabel,
        product_line: (args.productLine ?? "").trim(),
        profile_type: phaseLocal === "RawMaterials" ? "material" : "process",
        material_or_process,
        raw_material: rawMaterialColumnValue({
          phase: phaseLocal,
          rawMaterial: args.rawMaterial ?? null,
          recycledBaseMaterial: args.recycledBaseMaterial ?? null,
          recycledSubtype: args.recycledSubtype ?? null,
          material_or_process,
        }),
        region: null,
        impact_payload: payload,
      } as any)
      .eq("profile_id", parentProfileId);
    
      if (uErr) {
        setMsg(uErr.message);
        return false;
      }
    } else {
      // INSERT new
      const { data: inserted, error: pErr } = await supabase
      .from("profiles")
      .insert({
        owner_actor_id: actorIdClean,
        owner_actor_label: actorLabel,
        product_line: (args.productLine ?? "").trim(),       
        phase: phaseLocal,
        process_type: payload.process_type,
        profile_type: phaseLocal === "RawMaterials" ? "material" : "process",
        material_or_process,
        raw_material: rawMaterialColumnValue({
          phase: phaseLocal,
          rawMaterial: args.rawMaterial ?? null,
          recycledBaseMaterial: args.recycledBaseMaterial ?? null,
          recycledSubtype: args.recycledSubtype ?? null,
          material_or_process,
        }),
        region: null,
        impact_payload: payload,
      } as any)
      .select("profile_id")
      .single();
    
      if (pErr) {
        setMsg(pErr.message);
        return false;
      }
    
      parentProfileId = (inserted as any)?.profile_id as string;
    }

    if (!parentProfileId) {
      setMsg("Save failed: no profile_id returned.");
      return false;
    }
    
    // keep it selected for next saves
    setActiveProfileId(parentProfileId);
          
    // Write component links
    if (needsComponents) {
      const { error: dErr } = await supabase
        .from("profile_components")
        .delete()
        .eq("parent_profile_id", parentProfileId);
  
      if (dErr) throw new Error(dErr.message);
  
      const rows = componentsLocal.map((c) => ({
        parent_profile_id: parentProfileId,
        component_profile_id: c.component_profile_id.trim(),
        percent: Number(c.percent),
      }));
  
      const { error: cErr } = await supabase.from("profile_components").insert(rows as any);
      if (cErr) throw new Error(cErr.message);
    }
  
    return parentProfileId;
  }
  
  async function saveProfileAndComponents(): Promise<boolean> {
    setMsg("");
  
    const actorIdClean = meName.trim();
    if (!actorIdClean) {
      setMsg("Company name is empty.");
      return false;
    }
  
    if (!productLine.trim()) {
      setMsg("Please enter Productline (product + productcode) before saving.");
      return false;
    }
  
    // 0) Actor MUST exist (FK target)
    try {
      await ensureActorRow(actorIdClean);
    } catch (e: any) {
      setMsg(e?.message ?? "Save actor failed");
      return false;
    }
  
    console.log("[SAVE] start", { phase, actorIdClean, productLine, activeProfileId });
  
    try {
      const needsComponentsForValidation =
        phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand";
  
      if (needsComponentsForValidation) {
        const anyTyped = components.some(c => (c.component_profile_id || "").trim());
        const anyValid = components.some(c => (c.component_profile_id || "").trim().length >= MIN_PROFILE_ID_LEN);
  
        if (anyTyped && !anyValid) {
          setMsg("Please enter valid component_profile_id(s) (PROF_...) or leave them all empty.");
          return false;
        }
  
        if (anyValid) {
          const t = totalPercent();
          if (Math.round(t * 100) / 100 !== 100) {
            setMsg(`Percentages must add up to 100. Currently: ${t}`);
            return false;
          }
        }
      }
  
      const { material_or_process, payload, component_rows } = buildSaveBundle();
  
      let parentProfileId: string | null = activeProfileId;
  
      if (!parentProfileId) {
        parentProfileId = await findExistingProfileId({
          owner_actor_id: actorIdClean,
          phase,
          material_or_process,
          productLine: String(payload?.product?.label ?? ""),
        });
      }
  
      if (parentProfileId) {
        const { error } = await supabase
          .from("profiles")
          .update({
            owner_actor_id: actorIdClean,
            owner_actor_label: actorLabel,
            product_line: productLine.trim(),
            profile_type: phase === "RawMaterials" ? "material" : "process",
            material_or_process,
            raw_material: rawMaterialColumnValue({
              phase,
              rawMaterial,
              recycledBaseMaterial,
              recycledSubtype,
              material_or_process,
            }),
            region: null,
            impact_payload: payload,
          } as any)
          .eq("profile_id", parentProfileId);
  
        if (error) {
          setMsg(`Save failed (update): ${error.message}`);
          return false;
        }
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .insert({
            owner_actor_id: actorIdClean,
            owner_actor_label: actorLabel,
            product_line: productLine.trim(),
            phase,
            process_type: processType,
            profile_type: phase === "RawMaterials" ? "material" : "process",
            material_or_process,
            raw_material: rawMaterialColumnValue({
              phase,
              rawMaterial,
              recycledBaseMaterial,
              recycledSubtype,
              material_or_process,
            }),
            region: null,
            impact_payload: payload,
          } as any)
          .select("profile_id")
          .single();
  
        if (error) {
          setMsg(`Save failed (insert): ${error.message}`);
          return false;
        }
  
        parentProfileId = (data as any)?.profile_id ?? null;
      }

      if (!parentProfileId) {
        setMsg("Save failed: no profile_id returned.");
        return false;
      }
      
      // --- WRITE profile_components (Save must persist components like Import) ---
      const needsComponents =
      phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand";

      if (needsComponents) {
        // Delete previous rows
        const { error: dErr } = await supabase
        .from("profile_components")
        .delete()
        .eq("parent_profile_id", parentProfileId);
  
    if (dErr) {
      setMsg(`Save failed (components delete): ${dErr.message}`);
      return false;
    }

  // Insert current rows
  const rows = component_rows.map((c) => ({
    parent_profile_id: parentProfileId,
    component_profile_id: c.component_profile_id,
    percent: Number(c.percent),
  }));

  if (rows.length) {
    const { error: cErr } = await supabase
      .from("profile_components")
      .insert(rows as any);

    if (cErr) {
      setMsg(`Save failed (components insert): ${cErr.message}`);
      return false;
    }
  }
}
// --- END WRITE profile_components ---

// --- UPLOAD evidence file (optional) and persist evidence.file_path ---
try {
  const path = await uploadEvidenceIfNeeded(parentProfileId);

  if (path) {
    const nextPayload = {
      ...payload,
      evidence: {
        ...(payload?.evidence ?? {}),
        file_path: path,
      },
    };

    const { error: eErr } = await supabase
      .from("profiles")
      .update({ impact_payload: nextPayload } as any)
      .eq("profile_id", parentProfileId);

    if (eErr) {
      setMsg(`Save failed (evidence update): ${eErr.message}`);
      return false;
    }
  }
} catch (e: any) {
  setMsg(e?.message ?? "Save failed (evidence upload)");
  return false;
}
// --- END evidence upload ---

      setActiveProfileId(parentProfileId);
      setMsg(`Saved ✅ profile_id = ${parentProfileId}`);
      return true;      
  
    } catch (e: any) {
      setMsg(e?.message ?? "Save error");
      return false;
    }
  }
  
  async function markVerification(status: boolean) {
    setMsg("");
  
    if (!activeProfileId) {
      return setMsg("First select a product via “Load existing product”.");
    }
  
    const { error } = await supabase.from("verifications").insert({
      profile_id: activeProfileId,
      status,
      org: verifierOrg,
      note: status ? "Certificate of audit" : "Unverified",
    } as any);
  
    if (error) return setMsg(error.message);
  
    // refresh latest
    const { data, error: rErr } = await supabase
      .from("profile_verification_latest")
      .select("status, org, note, verified_at")
      .eq("profile_id", activeProfileId)
      .maybeSingle();
  
    if (rErr) return setMsg(rErr.message);
  
    setLatestVerification((data as any) ?? null);
    setMsg("Verification saved ✅");
  }
  
  function pick(row: any, key: string) {
    return row?.[key] ?? row?.[key.toLowerCase()] ?? row?.[key.toUpperCase()] ?? "";
  }
  
  function parseIdsCell(v: any): string[] {
    const s = str(v);
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) return j.map(str).filter(Boolean);
    } catch {}
    return s.split(";").map((x) => str(x)).filter(Boolean);
  }
  
  function parseComponentsCell(v: any): { component_profile_id: string; percent: number }[] {
    // Accept: JSON string OR "PROF_x:80;PROF_y:20"
    const s = str(v);
    if (!s) return [];
    if (s.trim().startsWith("[") || s.trim().startsWith("{")) {
      try {
        const j = JSON.parse(s);
        if (Array.isArray(j)) {
          return j.map((x: any) => ({
            component_profile_id: str(x.component_profile_id),
            percent: num(x.percent),
          }));
        }
      } catch {}
    }
    return s.split(";").map(part => part.trim()).filter(Boolean).map(part => {
      const [id, pct] = part.split(":");
      return { component_profile_id: str(id), percent: num(pct) };
    });
  }
  
  function buildImportArgsForRaw(row: any) {
    const productLine = str(pick(row, "product_line"));
    const rawMaterial = str(pick(row, "rawMaterial")) || str(pick(row, "raw_material"));
    const recycledSubtype = str(pick(row, "recycledSubtype")) || str(pick(row, "recycled_subtype"));
    const recycledBaseMaterial =
    str(pick(row, "recycledBaseMaterial")) ||
    str(pick(row, "recycled_base_material")) ||
    "Other";
  
    const material_or_process =
    rawMaterial === "Recycled material"
    ? `RecycledMaterial:${recycledBaseMaterial || "Other"}:${recycledSubtype || "post_consumer"}`
    : (rawMaterial || "Cotton");
  
    return {
      importPhase: "RawMaterials",
      productLine,
      material_or_process,
      rawMaterial,
      recycledBaseMaterial,
      recycledSubtype,    
      impacts: {
        co2_kg: num(pick(row, "co2KgPerKg")),
        water_l: num(pick(row, "waterLPerKg")),
        energy_kwh: num(pick(row, "energyKwhPerKg")),
      },
      chemicals: {
        chemicals_used: str(pick(row, "chemicalsUsed")) || null,
        substances_of_concern: str(pick(row, "substancesOfConcern")) || null,
        zdhc_conform: !!num(pick(row, "zdhcConform") || pick(row, "zdhc_conform")),
      },      
      evidence: {
        type: str(pick(row, "evidenceType")) || "self_declared",
        url: str(pick(row, "evidenceUrl")) || null,
        note: str(pick(row, "evidenceNote")) || null,
      },
    };
  }
  
  function buildImportArgsForTransport(row: any) {
    const productLine = str(pick(row, "product_line"));
  
    const mode = str(pick(row, "mode")) || str(pick(row, "transport_mode")) || "truck";
    const distance_km = num(pick(row, "distance_km")) || num(pick(row, "distanceKm"));
  
    return {
      importPhase: "Transport",
      productLine,
      material_or_process: "Transport",
      impacts: {
        co2_kg: num(pick(row, "co2KgPerKg")),
        water_l: 0,
        energy_kwh: 0,
        pm25_g_per_kg: num(pick(row, "pm25GPerKg")),
      },
      transport: { mode, distance_km },
      evidence: {
        type: str(pick(row, "evidenceType")) || "self_declared",
        url: str(pick(row, "evidenceUrl")) || null,
        note: str(pick(row, "evidenceNote")) || null,
      },
    };
  }
  
  function buildImportArgsForBrand(row: any) {
    const productLine = str(pick(row, "product_line"));
  
    return {
      importPhase: "Brand",
      productLine,
      material_or_process: "Brand",
  
      impacts: {
        co2_kg: 0,
        water_l: 0,
        energy_kwh: 0,
      },
  
      brand: {
        use_phase_measures: str(pick(row, "use_phase_measures")) || null,
        post_use_measures: str(pick(row, "post_use_measures")) || null,
  
        scope12_co2_per_kg: num(pick(row, "scope12_co2_per_kg")),
        scope12_energy_per_kg: num(pick(row, "scope12_energy_per_kg")),
  
        manufacturer_profile_id: str(pick(row, "manufacturer_profile_id")) || null,
  
        transport_profile_ids: parseIdsCell(pick(row, "transport_profile_ids") || pick(row, "transportProfileIds")),
      },
  
      evidence: {
        type: str(pick(row, "evidenceType")) || "self_declared",
        url: str(pick(row, "evidenceUrl")) || null,
        note: str(pick(row, "evidenceNote")) || null,
      },
    };
  }
    
  function buildImportArgsForProcess(phaseName: string, row: any) {
    const productLine = str(pick(row, "product_line"));
    const processType = str(pick(row, "processType")) || (processOptionsByPhase[phaseName]?.[0] ?? "Material");
    const material_or_process = processType;
  
    return {
      importPhase: phaseName,
      productLine,
      material_or_process,
      processType,
      upstream_transport_profile_ids: parseIdsCell(
        pick(row, "upstream_transport_profile_ids") || pick(row, "upstreamTransportProfileIds")
      ),
      upstream_transport_manual: {
        co2_kg: num(pick(row, "upstream_transport_manual_co2") || pick(row, "upstreamTransportManualCo2")),
        water_l: 0,
        energy_kwh: num(pick(row, "upstream_transport_manual_energy") || pick(row, "upstreamTransportManualEnergy")),
        pm25_g_per_kg: num(pick(row, "upstream_transport_manual_pm25") || pick(row, "upstreamTransportManualPm25")),
      },   
      impacts: {
        co2_kg: num(pick(row, "co2KgPerKg")),
        water_l: num(pick(row, "waterLPerKg")),
        energy_kwh: num(pick(row, "energyKwhPerKg")),
      },
      chemicals: {
        chemicals_used: str(pick(row, "chemicalsUsed")) || null,
        substances_of_concern: str(pick(row, "substancesOfConcern")) || null,
        zdhc_conform: !!num(pick(row, "zdhcConform") || pick(row, "zdhc_conform")),
      },      
      components: parseComponentsCell(pick(row, "components_json") || pick(row, "components")),
      evidence: {
        type: str(pick(row, "evidenceType")) || "self_declared",
        url: str(pick(row, "evidenceUrl")) || null,
        note: str(pick(row, "evidenceNote")) || null,
      },
    };
  }
  
  // helper: run tasks with limited concurrency (prevents 1-by-1 slowness)
async function runPool<T>(
  items: T[],
  worker: (item: T, idx: number) => Promise<void>,
  concurrency: number
) {
  let next = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const idx = next++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

type ImportErrorRow = { sheet: string; row: number; message: string };

  async function importXlsx() {
    try {
      setMsg("");
      if (!importFile) return setMsg("First select a .xlsx file.");
      if (!actorIdClean) return setMsg("No actor connected. Click 'Save actor' first.");
  
      setImporting(true);
  
      const ab = await importFile.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
  
      const allowedSheets = new Set(["RawMaterials","Yarn","Fabric","Manufacturer","Transport","Brand"]);
      const sheetNames = wb.SheetNames.filter((n) => allowedSheets.has(n));
  
      if (sheetNames.length === 0) {
        return setMsg("No valid sheets found. Expected: RawMaterials/Yarn/Fabric/Manufacturer/Transport/Brand");
      }
  
      let importedCount = 0;
const createdProfileIds: string[] = [];
const errors: ImportErrorRow[] = [];

for (const sheetName of sheetNames) {
  const ws = wb.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
  if (rows.length === 0) continue;

  const usable = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => str(pick(row, "product_line")));

  await runPool(
    usable,
    async ({ row, i }) => {
      try {
        const productLineCell = str(pick(row, "product_line"));

        let args: any;
        if (sheetName === "RawMaterials") args = buildImportArgsForRaw(row);
        else if (sheetName === "Transport") args = buildImportArgsForTransport(row);
        else if (sheetName === "Brand") args = buildImportArgsForBrand(row);
        else args = buildImportArgsForProcess(sheetName, row);

        args.productLine = productLineCell;

        const profileId = await upsertImportedProfile(args);

        if (!profileId) {
        throw new Error("Import save failed: no profile_id returned.");
        }

        createdProfileIds.push(profileId);
        importedCount++;

        } catch (e: any) {
        errors.push({
          sheet: sheetName,
          row: i + 2, // excel row number (header=1)
          message: e?.message ?? "Unknown import error",
        });
      }
    },
    5 // concurrency
  );
}

// RESULT MESSAGE (vervang je setMsg regel hiermee)
if (errors.length) {
  console.error("Import errors:", errors);
  setMsg(`Imported ✅ ${importedCount} rows. Errors ❌ ${errors.length}. Check console.`);
} else {
  setMsg(`Imported ✅ ${importedCount} rows → ${createdProfileIds.length} profiles updated/created`);
}
  
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? "Import error");
    } finally {
      setImporting(false);
    }
  }
    
  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>T-easy AAS Textile Ledger</h1>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 12 }}>
  
  {/* ANCHOR:BEGIN:THIS_IS_ME */}
<label>Company name</label>
<input
  style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
  value={meName}
  onChange={(e) => {
    setMeName(e.target.value);
    setMeNameDirty(true);
  }}
  placeholder="enter company name"
/>

<label>Country</label>
<input
  style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
  value={meCountry}
  onChange={(e) => setMeCountry(e.target.value)}
/>

<label>Productline (product + productcode)</label>
<input
  style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
  value={productLine}
  onChange={(e) => setProductLine(e.target.value)}
  placeholder='"T-shirt women – SKU 12345"'
/>
<div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
  Saved when you press the Save button below.
</div>

{/* ANCHOR:END:THIS_IS_ME */}
</div>

<p style={{ marginTop: 6, opacity: 0.7 }}>
  Product: <b>{productLine || "—"}</b>
</p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "10px 0 20px" }}>
  {/* ANCHOR:BEGIN:PHASE_SWITCH */}
  <label style={{ margin: 0 }}>Quick switch phase</label>
  <select
    style={{ padding: 10 }}
    value={phase}
    onChange={(e) => {
      const next = e.target.value;
      router.push(`/input/supplier?phase=${encodeURIComponent(next)}`);
    }}    
  >
    <option value="RawMaterials">RawMaterials</option>
    <option value="Yarn">Yarn</option>
    <option value="Fabric">Fabric</option>
    <option value="Manufacturer">Manufacturer</option>
    <option value="Transport">Transport</option>
    <option value="Brand">Brand</option>
  </select>
  {/* ANCHOR:END:PHASE_SWITCH */}
</div>

      <p>Phase: <b>{phase}</b></p>
      <p>Actor: <b>{actorLabel || "—"}</b></p>
      <div style={{ margin: "10px 0 16px" }}>
  {/* ANCHOR:BEGIN:LOAD_EXISTING */}
  <label style={{ display: "block", marginBottom: 6, opacity: 0.85 }}>
    Load existing product (in this phase)
  </label>

  <select
    style={{ width: "100%", padding: 10 }}
    value={activeProfileId ?? ""}
    onChange={async (e) => {
      const id = e.target.value || null;
      setActiveProfileId(id);

      if (!id) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("impact_payload")
        .eq("profile_id", id)
        .single();

      if (error) return setMsg(error.message);

      const p: any = (data as any)?.impact_payload ?? {};
      // --- LOAD profile_components into UI (Yarn/Fabric/Manufacturer) ---
if (p?.phase !== "RawMaterials" && p?.phase !== "Transport" && p?.phase !== "Brand") {
  const { data: compRows, error: compErr } = await supabase
    .from("profile_components")
    .select("component_profile_id, percent")
    .eq("parent_profile_id", id)
    .order("percent", { ascending: false });

  if (compErr) return setMsg(compErr.message);

  const mapped = (compRows ?? []).map((r: any) => ({
    component_profile_id: String(r.component_profile_id ?? ""),
    percent: Number(r.percent ?? 0),
  }));

  setComponents(mapped.length ? mapped : [{ component_profile_id: "", percent: 100 }]);
} else {
  // phases without components: reset to default
  setComponents([
    { component_profile_id: "", percent: 80 },
    { component_profile_id: "", percent: 20 },
  ]);
}
// --- END LOAD profile_components ---

      if (p?.process_type) setProcessType(String(p.process_type));
      setProductLine(p?.product?.label ?? "");

      // Load additive upstream transport links + manual add-on (Yarn/Fabric/Manufacturer)
if (p.phase !== "RawMaterials" && p.phase !== "Transport" && p.phase !== "Brand") {
  const idsT = Array.isArray(p?.upstream_transport_profile_ids) ? p.upstream_transport_profile_ids : [];
  setUpstreamTransportProfileIds(idsT.length ? idsT.map((x: any) => String(x)) : [""]);

  const m = p?.upstream_transport_manual ?? null;
  setUpstreamTransportManual(normalizeImpact(m));
} else {
  setUpstreamTransportProfileIds([""]);
  setUpstreamTransportManual({ co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 });
}

 // Brand: Scope 3 links (Manufacturer + Transport)
if (p.phase === "Brand") {
  const b0 = p?.brand ?? {};

  setBrandManufacturerProfileId(String(b0.manufacturer_profile_id ?? ""));

  const tIds = Array.isArray(b0.transport_profile_ids) ? b0.transport_profile_ids : [];
  setBrandTransportProfileIds(tIds.length > 0 ? tIds.map((x: any) => String(x)) : [""]);
}

      // ---------- LOAD EXISTING MAPPING (state <- payload) ----------
const imp = p?.impacts_per_kg ?? {};
setCo2GPerKgUI(String((Number(imp.co2_kg ?? 0) || 0) * 1000)); // kg/kg -> g/kg UI
setWaterLPerKgUI(String(Number(imp.water_l ?? 0) || 0));
setEnergyKwhPerKgUI(String(Number(imp.energy_kwh ?? 0) || 0));
setPm25GPerKgUI(String(Number(imp.pm25_g_per_kg ?? 0) || 0));

// Chemicals
const ch = p?.chemicals ?? {};
setChemicalsUsed(String(ch.chemicals_used ?? ""));
setSubstancesOfConcern(String(ch.substances_of_concern ?? ""));
setZdhcConform(!!ch.zdhc_conform);

// Evidence
const ev = p?.evidence ?? {};
setEvidenceType((ev.type ?? "self_declared") as any);
setEvidenceUrl(String(ev.url ?? ""));
setEvidenceNote(String(ev.note ?? ""));

// Transport
const tr = p?.transport ?? null;
if (tr) {
  setTransportMode(String(tr.mode ?? "truck"));
  setTransportDistanceKm(Number(tr.distance_km ?? 500));
}

// Brand: load simple notes + own impact (from payload.brand if present)
const b = p?.brand ?? {};
if (p.phase === "Brand") {
  setBrandUseMeasures(String(b.use_phase_measures ?? ""));
  setBrandPostUseMeasures(String(b.post_use_measures ?? ""));

  setBrandScope12Co2PerKg(Number(b.scope12_co2_per_kg ?? 0));
  setBrandScope12EnergyPerKg(Number(b.scope12_energy_per_kg ?? 0));
}
      setMsg(`Loaded ✅ profile_id = ${id}`);
    }}
  >
    <option value="">
      {existingEntries.length > 0 ? "— Select —" : "No saved products found yet"}
    </option>

    {existingEntries.map((r) => (
      <option key={r.profile_id} value={r.profile_id}>
        {r.label} ({r.profile_id.slice(0, 8)}…)
      </option>
    ))}
  </select>
  {/* ANCHOR:END:LOAD_EXISTING */}
</div>

      {msg && <p>{msg}</p>}

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 12 }}>
        <h2>{phase}</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 14px" }}>
</div>
        {/* Import / Export (prep for later) */}
  {/* ANCHOR:BEGIN:ADVANCED_IMPORT */}
<details style={{ marginTop: 8, marginBottom: 14 }}>
  <summary style={{ cursor: "pointer", opacity: 0.85 }}>
    Advanced Import
  </summary>

  <div
    style={{
      border: "1px dashed #bbb",
      borderRadius: 10,
      padding: 12,
      marginTop: 10,
    }}
  >
    <button
  type="button"
  onClick={importXlsx}
  disabled={importing || !importFile}
  style={{
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    cursor: importing || !importFile ? "not-allowed" : "pointer",
    background: "#fff",
    opacity: importing || !importFile ? 0.6 : 1,
  }}
>
  {importing ? "Importing…" : "Import now"}
</button>

    <p style={{ marginTop: 0, opacity: 0.75 }}>
      Bulk import Excel. Export happens via the buttons at the bottom (Save & Export).
    </p>
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
  {/* Upload file */}
  <label
    style={{
      padding: "8px 12px",
      border: "1px solid #ddd",
      borderRadius: 8,
      cursor: "pointer",
      background: "#fff",
    }}
  >
    Upload Excel-file
    <input
      type="file"
      accept=".xlsx"
      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
      style={{ display: "none" }}
    />
  </label>

  {/* Download template */}
<button
  type="button"
  onClick={downloadTemplateXlsx}
  style={{
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    cursor: "pointer",
    background: "#fff",
  }}
>
  Download Excel-template
</button>

  {/* Import action */}
</div>
  </div>
  {/* ANCHOR:END:ADVANCED_IMPORT */}
</details>

{/* ANCHOR:BEGIN:TRANSPORT_DETAILS */}
        {phase === "Transport" && (
  <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, margin: "10px 0" }}>
    <h3>Transport details</h3>
    <p style={{ marginTop: 0, opacity: 0.8 }}>Select transport type and distance.</p>
    <label>Type</label>
    <select
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={transportMode}
      onChange={(e) => setTransportMode(e.target.value)}

    >
      <option value="truck">Truck</option>
      <option value="ship">Ship</option>
      <option value="air">Air</option>
      <option value="rail">Rail</option>
    </select>

    <label>Distance (km)</label>
    <input
      type="number"
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={transportDistanceKm}
      onChange={(e) => setTransportDistanceKm(Number(e.target.value))}
    />
    {/* ANCHOR:END:TRANSPORT_DETAILS */}
  </div>
)}

{phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand" && (
  <>
    <label>Process type</label>
    <select
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={processType}
      onChange={(e) => setProcessType(e.target.value)}
    >
      {(processOptionsByPhase[phase] ?? ["Material"]).map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  </>
)}

{phase === "RawMaterials" && (
  <>
    <label>Material</label>
    <select
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={rawMaterial}
      onChange={(e) => setRawMaterial(e.target.value as any)}
    >
      {rawOptions.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>

    {rawMaterial === "Recycled material" && (
  <>
    <label>Recycled base material</label>
    <select
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={recycledBaseMaterial}
      onChange={(e) => setRecycledBaseMaterial(e.target.value as any)}
    >
      <option value="Cotton">Cotton</option>
      <option value="Polyester">Polyester</option>
      <option value="Nylon">Nylon</option>
      <option value="Other">Other</option>
    </select>

    <label>Recycled subtype</label>
    <select
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={recycledSubtype}
      onChange={(e) => setRecycledSubtype(e.target.value as any)}
    >
      {recycledOptions.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  </>
)}
  </>
)}

{/* ANCHOR:BEGIN:UPSTREAM_INPUTS */}
{phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand" && (
  <>
    <h3>Inputs (% of upstream profiles)</h3>
    <p style={{ marginTop: 0, opacity: 0.8 }}>
      Fill in the upstream <b>profile_id</b>. Percentages must add up to 100.
    </p>

            {components.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, marginBottom: 10 }}>
                <input
                  style={{ padding: 10 }}
                  value={c.component_profile_id}
                  onChange={(e) => updateComponent(i, { component_profile_id: e.target.value })}
                  placeholder="component_profile_id (profile_id)"
                />
                <input
                  type="number"
                  style={{ padding: 10 }}
                  value={c.percent}
                  onChange={(e) => updateComponent(i, { percent: Number(e.target.value) })}
                  placeholder="%"
                />
              </div>
            ))}

            <button onClick={addComponent} style={{ padding: "8px 12px", marginBottom: 12 }}>
              + Add input
            </button>

            <p style={{ marginTop: 0 }}>Total: <b>{totalPercent()}</b>%</p>
            {calcErr && (
  <p style={{ marginTop: 8, color: "crimson" }}>
    Upstream calc error: {calcErr}
    {/* ANCHOR:END:UPSTREAM_INPUTS */}
  </p>
)}
          </>
        )}

{/* ANCHOR:BEGIN:CHEMICALS */}
{(phase === "RawMaterials" || phase === "Yarn" || phase === "Fabric" || phase === "Manufacturer") && (
  <>
    <h3>Chemicals</h3>

    <label>Chemicals used (optional)</label>
    <input
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={chemicalsUsed}
      onChange={(e) => setChemicalsUsed(e.target.value)}
      placeholder="dyes, auxiliaries, detergents, solvents etc."
    />

    <label>Substances of concern (optional)</label>
    <input
      style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
      value={substancesOfConcern}
      onChange={(e) => setSubstancesOfConcern(e.target.value)}
      placeholder="PFAS, azo dyes, heavy metals etc."
    />

    <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
      <input
        type="checkbox"
        checked={zdhcConform}
        onChange={(e) => setZdhcConform(e.target.checked)}
      />
      Zero Discharge of Hazardous Chemicals (ZDHC) – conform
    </label>

    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
      Tick if chemical management is aligned with ZDHC.
    </div>
  </>
)}

{/* ANCHOR:END:CHEMICALS */}
{/* ANCHOR:BEGIN:IMPACT_BREAKDOWN */}
{phase !== "RawMaterials" && (() => {
  const scope3Calculated = (phase !== "Brand" ? upstreamCalc : brandScope3Calc) ?? null;

  const stepImpacts: ImpactPerKg =
    phase === "Brand"
      ? {
          co2_kg: Number(brandScope12Co2PerKg || 0),
          water_l: 0,
          energy_kwh: Number(brandScope12EnergyPerKg || 0),
          pm25_g_per_kg: 0,
        }
      : {
        co2_kg: numFromUI(co2GPerKgUI) / 1000,      // g/kg -> kg/kg voor opslag/calc
        water_l: numFromUI(waterLPerKgUI),          // L/kg
        energy_kwh: numFromUI(energyKwhPerKgUI),    // kWh/kg
        pm25_g_per_kg: phase === "Transport" ? pm25_g_per_kg : 0,     
        };

  // Overrides disabled for now (verifier-only later)
  const bundle = resolveImpactBundle({
    scope3Calculated,
    scope3Manual: null,
    totalManual: null,
    stepImpacts,
  });

  const row = (label: string, v: ImpactPerKg | null) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "8px 0", borderTop: "1px solid #f1f1f1" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 13 }}>{label}</b>
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
        CO₂ <b>{(((v?.co2_kg ?? 0) * 1000)).toFixed(0)}</b> g/kg ·
        Water <b>{(v?.water_l ?? 0).toFixed(1)}</b> L/kg ·
        Energy <b>{fmtEnergyKwhPerKg(v?.energy_kwh ?? 0)}</b> kWh/kg
        {v?.pm25_g_per_kg != null ? <> · PM2.5 {v.pm25_g_per_kg.toFixed(3)} g/kg</> : null}
        </div>

      </div>
      <div style={{ textAlign: "right", fontSize: 12, opacity: 0.6, paddingTop: 2 }}>per kg product</div>
    </div>
  );
  
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, margin: "12px 0" }}>
      <div>
        <div style={{ fontSize: 14 }}>
          <b>Impact breakdown</b>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Total = Scope 3 + Own impact.</div>
      </div>

      {phase === "Brand" && brandScope3Err && (
        <div style={{ marginTop: 10, color: "crimson", fontSize: 12 }}>Scope 3 link error: {brandScope3Err}</div>
      )}

<div style={{ marginTop: 10 }}>
  {row(
    phase === "Brand"
      ? "Scope 3 (from links)"
      : phase === "Yarn" || phase === "Fabric" || phase === "Manufacturer"
      ? "Scope 3 (weighted inputs + transport links + manual transport)"
      : "Scope 3 (imported)",
    bundle.resolved.scope3_per_kg
  )}

  {row(phase === "Brand" ? "Own impact (Scope 1 & 2)" : "Own impact", stepImpacts)}

  {row("Total (Scope 3 + Own impact)", bundle.resolved.total_per_kg)}
</div>
    </div>
  );
})()}
{/* ANCHOR:END:IMPACT_BREAKDOWN */}

{phase !== "Brand" && (
  <>
<h3>Impact</h3>

<label>CO₂ (g per kg)</label>
{phase !== "RawMaterials" && phase !== "Transport" && phase !== "Brand" && upstreamCalc && (
  <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
    <div style={{ opacity: 0.8, marginBottom: 6 }}>
    <b>Calculated impacts</b> (Upstream + your entry)
    </div>

    {calcErr && <div style={{ color: "crimson", marginBottom: 8 }}>{calcErr}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
  <div>
    <div style={{ opacity: 0.7 }}>Upstream (weighted)</div>
    <div><b>{(upstreamCalc?.co2_kg ?? 0).toFixed(3)}</b> kg CO₂/kg</div>
    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
      Water <b>{(upstreamCalc?.water_l ?? 0).toFixed(1)}</b> L/kg · Energy{" "}
      <b>{fmtEnergyKwhPerKg(upstreamCalc?.energy_kwh ?? 0)}</b> kWh/kg
    </div>
  </div>

  <div>
    <div style={{ opacity: 0.7 }}>Total (upstream + your entry)</div>
    <div><b>{totalCo2.toFixed(3)}</b> kg CO₂/kg</div>
    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
      Water <b>{totalWater.toFixed(1)}</b> L/kg · Energy <b>{fmtEnergyKwhPerKg(totalEnergy)}</b> kWh/kg
    </div>
  </div>
</div>
  </div>
)}

<input
  type="text"
  inputMode="decimal"
  style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
  value={co2GPerKgUI}
  onChange={(e) => setCo2GPerKgUI(e.target.value.replace(/[^\d.,-]/g, ""))}
  onBlur={() => setCo2GPerKgUI(String(numFromUI(co2GPerKgUI)))}
/>

{phase === "Transport" && (
  <>
    <label>PM2.5 (g per kg) (optional)</label>
    <input
    type="text"
    inputMode="decimal"
    style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
    value={pm25GPerKgUI}
    onChange={(e) => setPm25GPerKgUI(e.target.value.replace(/[^\d.,-]/g, ""))}
    onBlur={() => setPm25GPerKgUI(String(numFromUI(pm25GPerKgUI)))}
    placeholder="0"
/>
  </>
)}

{phase !== "Transport" && (
  <>
    <label>Water (L per kg)</label>
    <input
    type="text"
    inputMode="decimal"
    style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
    value={waterLPerKgUI}
    onChange={(e) => setWaterLPerKgUI(e.target.value.replace(/[^\d.,-]/g, ""))}
    onBlur={() => setWaterLPerKgUI(String(numFromUI(waterLPerKgUI)))}
/>

<label>Energy (kWh per kg)</label>
<input
  type="text"
  inputMode="decimal"
  style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
  value={energyKwhPerKgUI}
  onChange={(e) => setEnergyKwhPerKgUI(e.target.value.replace(/[^\d.,-]/g, ""))}
  onBlur={() => setEnergyKwhPerKgUI(String(numFromUI(energyKwhPerKgUI)))}
/>
  </>
)}
  </>
)}

{/* ANCHOR:BEGIN:BRAND */}
{phase === "Brand" && (
  <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 14 }}>
    <h2 style={{ marginTop: 0 }}>Brand</h2>

    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 10 }}>
  <h3 style={{ marginTop: 0 }}>Use phase</h3>

  <label>Durability & repairability measures</label>
  <textarea
    style={{ width: "100%", padding: 10, margin: "6px 0 0", minHeight: 90 }}
    value={brandUseMeasures}
    onChange={(e) => setBrandUseMeasures(e.target.value)}
    placeholder="Describe measures (quality specs, repair programs, warranty, material choices etc.)"
  />
</div>

<div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 14 }}>
  <h3 style={{ marginTop: 0 }}>Post-use phase</h3>

  <label>Recycleability measures</label>
  <textarea
    style={{ width: "100%", padding: 10, margin: "6px 0 0", minHeight: 90 }}
    value={brandPostUseMeasures}
    onChange={(e) => setBrandPostUseMeasures(e.target.value)}
    placeholder="Describe measures (take-back, mono-fiber, disassembly, blend limits etc.)"
  />
</div>

<div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
  Note: coefficient and calculation will be added later.
</div>

<div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 14 }}>
  <h3 style={{ marginTop: 0 }}>Own impact (Scope 1 & 2)</h3>

  <label>CO₂ (g per kg)</label>
  <input
    type="number"
    style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
    value={brandScope12Co2PerKg}
    onChange={(e) => setBrandScope12Co2PerKg(Number(e.target.value))}
  />

  <label>Energy (kWh per kg)</label>
  <input
    type="number"
    style={{ width: "100%", padding: 10, margin: "6px 0 0" }}
    value={brandScope12EnergyPerKg}
    onChange={(e) => setBrandScope12EnergyPerKg(Number(e.target.value))}
  />
</div>

    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 14 }}>
  <h3 style={{ marginTop: 0 }}>Scope 3 links (Manufacturer + Transport)</h3>
  <p style={{ marginTop: 0, opacity: 0.8 }}>
    Scope 3 = Manufacturer + Transport (additive).
  </p>

  <label>Manufacturer profile_id</label>
  <input
    style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
    value={brandManufacturerProfileId}
    onChange={(e) => setBrandManufacturerProfileId(e.target.value)}
    placeholder="profile_id (PROF_...)"
  />

  <label>Transport profile_id(s)</label>

  {(brandTransportProfileIds ?? []).map((v, idx) => (
    <div key={idx} style={{ display: "flex", gap: 10, margin: "6px 0" }}>
      <input
        style={{ flex: 1, padding: 10 }}
        value={v}
        onChange={(e) => {
          const next = [...brandTransportProfileIds];
          next[idx] = e.target.value;
          setBrandTransportProfileIds(next);
        }}
        placeholder="profile_id (PROF_...)"
      />
      <button
        type="button"
        onClick={() => {
          const next = brandTransportProfileIds.filter((_, i) => i !== idx);
          setBrandTransportProfileIds(next.length ? next : [""]);
        }}
        style={{ padding: "8px 10px" }}
      >
        Remove
      </button>
    </div>
  ))}

  <button
    type="button"
    onClick={() => setBrandTransportProfileIds((prev) => [...prev, ""])}
    style={{ padding: "8px 12px", marginTop: 8 }}
  >
    + Add transport
  </button>
</div>
{/* ANCHOR:END:BRAND */}
    </div>
)}

{/* ANCHOR:BEGIN:UPSTREAM_TRANSPORT_BLOCKS */}
{(phase === "Yarn" || phase === "Fabric" || phase === "Manufacturer") && (
  <>
    {/* --- BEGIN: upstream transport links (additive) --- */}
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 14 }}>
      <h4 style={{ marginTop: 0 }}>Upstream transport links (additive)</h4>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Add transport profile_id(s). These are added on top of the weighted inputs (no percentages).
      </p>

      {(upstreamTransportProfileIds ?? []).map((v, idx) => (
        <div key={idx} style={{ display: "flex", gap: 10, margin: "6px 0" }}>
          <input
            style={{ flex: 1, padding: 10 }}
            value={v}
            onChange={(e) => {
              const next = [...upstreamTransportProfileIds];
              next[idx] = e.target.value;
              setUpstreamTransportProfileIds(next);
            }}
            placeholder="transport profile_id (PROF_...)"
          />
          <button
            type="button"
            onClick={() => {
              const next = upstreamTransportProfileIds.filter((_, i) => i !== idx);
              setUpstreamTransportProfileIds(next.length ? next : [""]);
            }}
            style={{ padding: "8px 10px" }}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setUpstreamTransportProfileIds((prev) => [...prev, ""])}
        style={{ padding: "8px 12px", marginTop: 8 }}
      >
        + Add transport
      </button>
    </div>
    {/* --- END: upstream transport links (additive) --- */}

    {/* --- BEGIN: upstream transport manual add-on --- */}
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 12 }}>
      <h4 style={{ marginTop: 0 }}>Upstream transport (manual add-on)</h4>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Optional. If you don’t have a transport profile_id yet, add the transport impact here. This is added on top of Scope 3.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <div>
          <label>CO₂ (kg/kg)</label>
          <input
            type="number"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            value={upstreamTransportManual.co2_kg}
            onChange={(e) => setUpstreamTransportManual((s) => ({ ...s, co2_kg: Number(e.target.value) }))}
          />
        </div>

        <div>
          <label>PM2.5 (g/kg)</label>
          <input
            type="number"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            value={upstreamTransportManual.pm25_g_per_kg ?? 0}
            onChange={(e) =>
              setUpstreamTransportManual((s) => ({ ...s, pm25_g_per_kg: Number(e.target.value) }))
            }
          />
        </div>

        <div>
          <label>Energy (kWh/kg)</label>
          <input
          type="number"
          inputMode="decimal"
          step="0.01"
          style={{ width: "100%", padding: 10, marginTop: 6 }}
          value={upstreamTransportManual.energy_kwh}
          onChange={(e) =>
          setUpstreamTransportManual((s) => ({ ...s, energy_kwh: Number(e.target.value) }))
          }
          onBlur={() =>
          setUpstreamTransportManual((s) => ({ ...s, energy_kwh: Number(s.energy_kwh) }))
  }
/>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setUpstreamTransportManual({ co2_kg: 0, water_l: 0, energy_kwh: 0, pm25_g_per_kg: 0 })}
        style={{ padding: "8px 12px", marginTop: 10 }}
      >
        Reset manual transport
      </button>
    </div>
    {/* --- END: upstream transport manual add-on --- */}
  </>
)}
{/* ANCHOR:END:UPSTREAM_TRANSPORT_BLOCKS */}

{/* ANCHOR:BEGIN:VALIDATION_EVIDENCE */}
<h3>Validation / evidence</h3>

{(() => {
  const has = !!latestVerification;

  const state: "green" | "orange" | "red" =
    (latestVerification?.state ?? "red") as any;

  const dotColor =
    state === "green" ? "#16a34a" :
    state === "orange" ? "#f59e0b" :
    "#dc2626";

  const headline =
    state === "green"
      ? "Validated (≤ 6 months)"
      : state === "orange"
      ? "Validated (expired > 6 months)"
      : "Not validated yet";

  const detailLine =
    state === "green"
      ? "Certificate or audit present."
      : state === "orange"
      ? "Audit present but older than 6 months."
      : latestVerification?.links_changed_at
      ? "Supply chain changed after verification (re-validation required)."
      : "No external validation yet.";

  const org = latestVerification?.org ?? null;
  const verifiedAt = latestVerification?.verified_at ?? null;
  const note = latestVerification?.note ?? null;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, margin: "10px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{ width: 14, height: 14, borderRadius: 999, background: dotColor }}
          title={headline}
        />
        <div style={{ fontSize: 14, opacity: 0.95 }}>
          <b>{headline}</b>

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            {detailLine}
          </div>

          {has && (
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
              {org ?? "—"}
              {" — "}
              {verifiedAt ? new Date(verifiedAt).toLocaleString() : "—"}
              {note ? <> — {note}</> : null}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#16a34a" }}>●</span>
          <span>
            Green — externally verified by an <b>approved scheme or auditor</b> (EU Ecolabel, GOTS, OEKO-TEX, BSCI etc.),
            and verified ≤ 6 months
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#f59e0b" }}>●</span>
          <span>Orange — audit present but older than 6 months</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#dc2626" }}>●</span>
          <span>
            Red — self-declared <b>or supply chain changed after verification</b> (re-validation required)
          </span>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Public view shows <b>impact only</b>. Supplier identities can be hidden <b>only after verification</b>.
      </div>

      {!isVerifier && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            <b>Verifier actions hidden</b>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Only accredited verifiers can mark entries as verified.
            If you need access, ask the platform admin to add you to <b>verifier_users</b>.
          </div>
        </div>
      )}

      {isVerifier && (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!activeProfileId}
            onClick={() => markVerification(true)}
            style={{ padding: "10px 12px", opacity: activeProfileId ? 1 : 0.5 }}
          >
            Mark VERIFIED
          </button>

          <button
            type="button"
            disabled={!activeProfileId}
            onClick={() => markVerification(false)}
            style={{ padding: "10px 12px", opacity: activeProfileId ? 1 : 0.5 }}
          >
            Mark UNVERIFIED
          </button>

          {!activeProfileId && (
            <p style={{ margin: "8px 0 0", opacity: 0.7 }}>
              First select a product via “Load existing product”.
            </p>
          )}
        </div>
      )}
    </div>
  );
})()}

        <label>Evidence type</label>
        <select style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value as any)}
        >
          <option value="certificate">Certificate (green)</option>
          <option value="audit">Audit (orange)</option>
          <option value="self_declared">Self-declared (red)</option>
        </select>

        <label>Evidence URL (optional)</label>
        <input style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://..." />

        <label>Evidence file (optional)</label>
        <input
          type="file"
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
        />

        <label>Evidence note (optional)</label>
        <input style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)}
          placeholder="GOTS certificate / audit report etc." />

{/* ANCHOR:END:VALIDATION_EVIDENCE */}
{/* ANCHOR:BEGIN:SOCIAL */}
        <h3>Social factors (optional)</h3>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={socialEnabled} onChange={(e) => setSocialEnabled(e.target.checked)} />
          Add a Social block to this entry
        </label>

        {socialEnabled && (
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={codeOfConduct} onChange={(e) => setCodeOfConduct(e.target.checked)} />
              Code of conduct present
            </label>

            <label>Audit standard (optional)</label>
            <input style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
              value={auditStandard} onChange={(e) => setAuditStandard(e.target.value)}
              placeholder="SMETA / SA8000 / BCI / WRAP etc." />

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={livingWage} onChange={(e) => setLivingWage(e.target.checked)} />
              Living wage policy
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={childLaborPolicy} onChange={(e) => setChildLaborPolicy(e.target.checked)} />
              Child labor policy
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
            type="checkbox"
            checked={equalityMeasuresMgmt}
            onChange={(e) => setEqualityMeasuresMgmt(e.target.checked)}
            />
            Equality measures in management positions
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={grievanceMechanism} onChange={(e) => setGrievanceMechanism(e.target.checked)} />
              Grievance mechanism
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={unionRights} onChange={(e) => setUnionRights(e.target.checked)} />
              Union / worker rights
            </label>

            <label>Social note (optional)</label>
            <input
            style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
            value={socialNote}
            onChange={(e) => setSocialNote(e.target.value)}
            placeholder="extra context (scope, departments, dates etc.)"
            />

            <div style={{ marginTop: 6, padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
            <b>Social evidence</b> (optional)
            </div>

            <label>Evidence link (URL)</label>
           <input
            style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
            value={socialEvidenceUrl}
            onChange={(e) => setSocialEvidenceUrl(e.target.value)}
            placeholder="Link to audit / certificate / NGO report"
            />
            <label>Evidence summary (optional)</label>
            <input
            style={{ width: "100%", padding: 10 }}
            value={socialEvidenceNote}
            onChange={(e) => setSocialEvidenceNote(e.target.value)}
            placeholder="1–2 lines: what this evidence proves"
            />

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            If you want to upload a file: use <b>Evidence file</b> in the section “Validation / evidence” above.
            </div>
        </div>
          </div>
        )}
{/* ANCHOR:END:SOCIAL */}
{/* ANCHOR:BEGIN:SAVE_EXPORT */}
<div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
<button
  type="button"
  onClick={async () => {
    console.log("[SAVE] clicked", { phase, actorIdClean, productLine, activeProfileId });
    setMsg("Saving…");
    const ok = await saveProfileAndComponents();
    console.log("[SAVE] done", { ok });
  }}
  style={{ padding: "10px 14px" }}
>
  Save
</button>

  <button
    type="button"
    onClick={async () => {
      const ok = await saveProfileAndComponents();
      if (ok) exportDraftJson();
    }}    
    style={{ padding: "10px 14px" }}
  >
    Save & Export (JSON)
  </button>

  <button
    type="button"
    onClick={async () => {
      const ok = await saveProfileAndComponents();
      if (ok) exportDraftCsv();
    }}
    style={{ padding: "10px 14px" }}
  >
    Save & Export (CSV)
  </button>
  {/* ANCHOR:END:SAVE_EXPORT */}
</div>
      </div>
    </div>
  );
}