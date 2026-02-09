# Monetization model – Textile Ledger

## Core principle
Value is created when sustainability data is reused across the value chain.
Payment is therefore triggered by reuse, not by initial data entry.

Ultimately, brands pay, as they are the primary beneficiaries of consolidated
Scope 3 impact data and Digital Product Passports.

## Where value is created
Value increases when data moves downstream:
- Raw materials → Yarn
- Yarn → Fabric
- Fabric → Manufacturer
- Manufacturer → Brand

Each link aggregates upstream data and increases its commercial relevance.

## Chargeable events

### 1. Link event (primary value driver)
A link event occurs when a profile references another profile, for example:
- component links (Raw → Yarn → Fabric)
- Scope 3 links at Brand level

Effect:
- The linking actor benefits from upstream validated data.
- Upstream actors contribute value indirectly.

Monetization logic:
- The linking actor incurs a debit.
- Upstream data providers receive credits.
- The platform retains a service margin.

The more links used, the higher the accumulated value.

### 2. Bulk import event
Bulk import includes:
- Excel (XLSX) uploads
- API imports (future)

This is treated as a processing service, not a data reuse event.

Monetization logic:
- A fixed or volume-based service fee.
- Revenue goes entirely to the platform.

### 3. Export event
Export includes:
- CSV / JSON exports
- Digital Product Passport generation
- Data transfer to external platforms

Export represents commercial utilisation of aggregated data.

Monetization logic:
- The exporting actor incurs a debit.
- Typically the brand pays.

## Credit / debit model (VAT-like)
The system does not require immediate payment.

Instead:
- Actors accumulate debits when using data.
- Actors accumulate credits when their data is reused.
- Net balance can be settled periodically.

This mirrors VAT-like clearing mechanisms in complex value chains.

## What is explicitly out of scope
- Payment execution (e.g. Stripe)
- Pricing optimisation
- Legal enforcement
- Smart contracts or blockchain

This project focuses on governance and value attribution, not payment infrastructure.
