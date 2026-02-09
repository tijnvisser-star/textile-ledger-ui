"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [startHref, setStartHref] = useState("/login");
  const [authText, setAuthText] = useState("Checking login…");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;
      if (email) {
        setAuthText(`Logged in as: ${email}`);
        setStartHref("/input/supplier?phase=RawMaterials");
      } else {
        setAuthText("Not logged in");
        setStartHref("/login");
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "60px auto", fontFamily: "system-ui" }}>
      <h1>Textile Ledger – Beta</h1>
      <p style={{ opacity: 0.8 }}>{authText}</p>

      <ul style={{ listStyle: "none", padding: 0, marginTop: 20, lineHeight: "2.2em", fontSize: 22 }}>
        <li><a href="/login">Login</a></li>
        <li><a href="/browse">Browse</a></li>
        <li><a href={startHref}>Start</a></li>
      </ul>
    </div>
  );
}
