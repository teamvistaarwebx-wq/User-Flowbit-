# Folio document numbers: 16-character limit (Oct 2026)

Finding: R3 H2 (`docs/qa/TEST-10OCT-R3.md`, angle 25).

## What changed

- GST invoice, credit-note and receipt numbers must be at most 16 characters (CGST Rule 46(b); the IRP rejects longer `DocDtls.No`).
- A series can now print the year short (`VWX/26-27/0001`) or long (`VWX/2026-27/0001`). Series saved before this change have no year format and keep the long year.
- New entities get series that fit: short year, 4 digits, invoice prefix = the first 5 letters of the code, other prefixes = the first 3 letters plus `CN`, `RC`, `QT`, `PI` (for `VWX`: `VWX`, `VWXCN`, `VWXRC`, `VWXQT`, `VWXPI`).
- Saving a series that cannot fit is refused with the longest prefix allowed.
- Folio refuses to issue an invoice, credit note or receipt whose number would pass 16 characters (the issue transaction is aborted, so no number is spent). Quotes and proformas are not GST documents and are not limited.
- The e-invoice payload no longer clips the number; a long number shows as a problem and is not sent.

## Existing data

Issued numbers are never changed. The counter key does not include the year format, so switching to the short year or a new prefix continues the same sequence.

Detect series that are too long (read-only, writes nothing):

```
npx tsx scripts/folio-long-series.ts
npx tsx scripts/folio-long-series.ts --env-file=.env.setup.local
```

Folio settings, Series also shows a warning on each entity whose series is too long.

The most common case is the old default credit-note prefix `<CODE>-CN` with the long year, for example `VWX-CN/2026-27/0001` (19 characters), and invoice prefixes of 4 or more letters with the long year.

## What the admin must do

For each entity listed:

1. Open Folio settings, Series.
2. Pick the short year (26-27), which allows a prefix of up to 5 characters with 4 digits, or shorten the prefix (up to 3 characters with the long year and 4 digits).
3. Save. Future numbers use the new format and the sequence continues.

Mid-year changes are allowed, but a consistent format within a financial year is cleaner; where possible, switch from 1 April. Long numbers already issued (and any IRN already generated on a clipped number) should be reviewed with the CA; a wrongly registered IRN can only be cancelled within 24 hours, after that a credit note is needed.
