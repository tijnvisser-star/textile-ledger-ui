"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SupaTest() {
  const [msg, setMsg] = useState("Testing Supabase connection...");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_code, public_slug")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) setMsg("ERROR: " + error.message);
      else setMsg("OK:\n" + JSON.stringify(data, null, 2));
    })();
  }, []);

  return (
    <pre style={{ padding: 24, whiteSpace: "pre-wrap" }}>
      {msg}
    </pre>
  );
}
