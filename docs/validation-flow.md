# Validation flow (Textile Ledger)

## Goal
The ledger does not claim “truth”.
It stores: “According to org X, status Y, on date Z, with scope S”.

## Verifier registry (whitelist)
Verifiers must be selected from a whitelist.
No free-text org names.

Each verifier has:
- org_name
- verifier_type: certificate | audit | advisory
- trust_level: high | medium | low
- notes (optional)

## Validation record (per profile)
A validation is an immutable record.

Fields:
- profile_id
- verifier_org (must exist in verifier registry)
- status: verified | unverified
- evidence_type: certificate | audit | self_declared
- evidence_url (optional)
- evidence_note (optional)
- verified_at (timestamp)
- created_by_user_id (who logged it)

## Stoplight logic (UI)
We show a stoplight based on the latest validation record:

- Green:
  - status = verified
  - AND evidence_type = certificate
  - AND verified_at <= 6 months ago

- Orange:
  - status = verified
  - AND (evidence_type = audit OR verified_at > 6 months ago)

- Red:
  - No validation record OR status = unverified
  - OR evidence_type = self_declared

## Rules
1) Only registered verifiers can validate.
2) Every validation must include a timestamp.
3) Evidence can be certificate OR audit.
4) Multiple validations may exist; latest one determines UI.
5) Do not delete validations (audit trail).
