"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function login() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    router.push("/choose-actor");
  }

  async function signup() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);
    setMsg("Account aangemaakt. Log nu in met dezelfde gegevens.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Textile Ledger – Beta</h1>
      <p>Login om te beginnen.</p>

      <label>Email</label>
      <input style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
        value={email} onChange={(e) => setEmail(e.target.value)} />

      <label>Password</label>
      <input type="password" style={{ width: "100%", padding: 10, margin: "6px 0 12px" }}
        value={password} onChange={(e) => setPassword(e.target.value)} />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={login} style={{ padding: "10px 14px" }}>Login</button>
        <button onClick={signup} style={{ padding: "10px 14px" }}>Account maken</button>
      </div>

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}
    </div>
  );
}
