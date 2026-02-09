"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const supplierPhaseOptions = ["RawMaterials","Yarn","Fabric","Manufacturer","Transport","Brand"] as const;

export default function ChooseActorPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("This is me!");
  const [country, setCountry] = useState("NL");
  const [phase, setPhase] = useState<(typeof supplierPhaseOptions)[number]>("RawMaterials");
  const [productLine, setProductLine] = useState("");
  const [msg, setMsg] = useState("");
  const [authText, setAuthText] = useState("Checking…");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      setAuthText(email ? `Logged in as: ${email}` : "Not authenticated");
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }
  
  async function onboardActor() {
    setMsg("");
    const { error } = await supabase.rpc("onboard_supplier", {
      _display_name: displayName,
      _country: country,
      _phases: [phase],
    });
    if (error) return setMsg(error.message);
  
    if (phase === "Brand") {
      router.push("/input/brand");
    } else {
      router.push(`/input/supplier?phase=${encodeURIComponent(phase)}&product=${encodeURIComponent(productLine)}`);
    }
  }
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Get started</h1>
  
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ margin: 0 }}>{authText}</p>
        <button onClick={logout} style={{ padding: "8px 12px" }}>
          Logout
        </button>
      </div>
  
      <p style={{ marginTop: 10 }}>Enter your details, then pick a phase to start. You can switch phases later.</p>

      <div style={{ border: "1px solid #ddd", padding: 16, borderRadius: 12, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Actor details</h2>
  
        <label>Display name</label>
        <input
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
  
        <label>Country</label>
        <input
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
  
        <label>Phase</label>
        <select
          style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
          value={phase}
          onChange={(e) => setPhase(e.target.value as any)}
        >
          {supplierPhaseOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
  
        <button onClick={onboardActor} style={{ padding: "10px 14px" }}>
          Continue
        </button>
      </div>
  
      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </div>
  );
  
}
