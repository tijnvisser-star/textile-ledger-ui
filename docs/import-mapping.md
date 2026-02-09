# Textile Ledger Import Mapping (XLSX)

## Algemeen
- Workbook bevat tabs: RawMaterials, Yarn, Fabric, Manufacturer, Transport, Brand
- Per tab: elke rij = 1 profile (upsert op owner_actor_id + phase + product_line + material_or_process)
- Lege rij = rij zonder product_line → skip

## RawMaterials sheet
| Excel kolom | Verplicht | Payload pad | Default | Opmerking |
|---|---:|---|---|---|
| product_line | ✅ | product.label | — | string |
| rawMaterial | ✅ | material_or_process | Cotton | "Recycled material" gebruikt recycledSubtype |
| recycledSubtype | (cond) | material_or_process | post_consumer | alleen bij rawMaterial="Recycled material" |
| co2KgPerKg | ✅ | impacts_per_kg.co2_kg | 0 | number |
| waterLPerKg | ✅ | impacts_per_kg.water_l | 0 | number |
| energyKwhPerKg | ✅ | impacts_per_kg.energy_kwh | 0 | number |
| chemicalsUsed | — | chemicals.chemicals_used | null | string |
| substancesOfConcern | — | chemicals.substances_of_concern | null | string |
| evidenceType | — | evidence.type | self_declared | certificate/audit/self_declared |
| evidenceUrl | — | evidence.url | null | string |
| evidenceNote | — | evidence.note | null | string |

## Yarn / Fabric / Manufacturer sheets
| Excel kolom | Verplicht | Payload pad | Default | Opmerking |
|---|---:|---|---|---|
| product_line | ✅ | product.label | — | string |
| processType | ✅ | process_type & material_or_process | phase default | Spinning/YarnDyeing etc |
| co2KgPerKg | ✅ | impacts_per_kg.co2_kg | 0 | number |
| waterLPerKg | ✅ | impacts_per_kg.water_l | 0 | number |
| energyKwhPerKg | ✅ | impacts_per_kg.energy_kwh | 0 | number |
| components | ✅ | profile_components[] | — | JSON OR "PROF_x:80;PROF_y:20" |
| chemicalsUsed | — | chemicals.chemicals_used | null | string |
| substancesOfConcern | — | chemicals.substances_of_concern | null | string |
| evidenceType | — | evidence.type | self_declared | certificate/audit/self_declared |
| evidenceUrl | — | evidence.url | null | string |
| evidenceNote | — | evidence.note | null | string |

## Transport sheet
| Excel kolom | Verplicht | Payload pad | Default | Opmerking |
|---|---:|---|---|---|
| product_line | ✅ | product.label | — | string |
| mode | — | transport.mode | truck | truck/ship/air/rail |
| distance_km | — | transport.distance_km | 500 | number |
| co2KgPerKg | ✅ | impacts_per_kg.co2_kg | 0 | number |
| pm25GPerKg | — | impacts_per_kg.pm25_g_per_kg | 0 | number |
| evidenceType | — | evidence.type | self_declared | |
| evidenceUrl | — | evidence.url | null | |
| evidenceNote | — | evidence.note | null | |

## Brand sheet
| Excel kolom | Verplicht | Payload pad | Default | Opmerking |
|---|---:|---|---|---|
| product_line | ✅ | product.label | — | string |
| durability | — | brand.durability | 0 | 0–10 |
| repairability | — | brand.repairability | 0 | 0–10 |
| careInstructions | — | brand.care_instructions | null | string |
| recyclability | — | brand.recyclability | 0 | 0–10 |
| recycledContentPct | — | brand.recycled_content_pct | 0 | 0–100 |
| eolNote | — | brand.eol_note | null | string |
| scope12EnergyKwh | — | brand.scope12_energy_kwh | 0 | number |
| renewablePct | — | brand.renewable_pct | 0 | 0–100 |

### Brand rule: blend_pct > 5% → recyclability = NO
- Add column: blend_pct (number)
- If blend_pct > 5 then override: brand.recyclability = 0 and set reason.

## Brand phase
### Brand – core product data

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| product_line | productLine | impact_payload.product.label | Product name + SKU |

---

### Brand – Use phase

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| durability | durability | impact_payload.brand.durability | Scale 0–10 |
| repairability | repairability | impact_payload.brand.repairability | Scale 0–10 |
| careInstructions | careInstructions | impact_payload.brand.care_instructions | Free text |

---

### Brand – End of life

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| recyclability | recyclability | impact_payload.brand.recyclability | Scale 0–10 |
| recycledContentPct | recycledContentPct | impact_payload.brand.recycled_content_pct | % |
| eolNote | eolNote | impact_payload.brand.eol_note | Free text |

Business rule:
- If blend of materials > 5%, recyclability must be set to 0 (NO).

(This rule is enforced at validation / calculation level, not in Excel.)

---

### Brand – Scope 1 & 2

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| scope12EnergyKwh | scope12EnergyKwh | impact_payload.brand.scope12_energy_kwh | Absolute |
| renewablePct | renewablePct | impact_payload.brand.renewable_pct | % |

---

### Brand – Scope 3 links (future)

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| scope3Links | scope3Links | impact_payload.brand.scope3_links | JSON array of profile_id + % |

Note:
- Scope 3 links may be hidden or anonymised for sub-suppliers.
- Future versions may apply privacy-preserving techniques (e.g. zero-knowledge proofs).

---

### Brand – Evidence & validation

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| evidenceType | evidenceType | impact_payload.evidence.type | certificate / audit / self_declared |
| evidenceUrl | evidenceUrl | impact_payload.evidence.url | URL to audit or certificate |
| evidenceNote | evidenceNote | impact_payload.evidence.note | Optional explanation |

---

### Brand – Social (optional)

| Excel column | UI state | Payload path | Notes |
|-------------|---------|--------------|------|
| socialNote | socialNote | impact_payload.social.note | Free text |
| equalityManagement | equalityManagement | impact_payload.social.equality_management | % or yes/no (to be finalised) |
