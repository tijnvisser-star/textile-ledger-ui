"use client";

import { useParams } from "next/navigation";

export default function BrandProductPage() {
  const params = useParams();
  const product_id = String((params as any)?.product_id ?? "");

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Brand input</h1>
      <p>Product: <b>{product_id}</b></p>
      <p>OK ✅ Deze route bestaat nu. Volgende stap: formulier Use phase + End-of-life + Scope 1/2.</p>
    </div>
  );
}
