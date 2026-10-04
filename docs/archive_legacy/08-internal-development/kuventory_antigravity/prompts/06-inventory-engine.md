# KUVENTORY — PHASE 6: INVENTORY ENGINE

Implement atomic inventory mutations before advanced UI. Required calculations: TOTAL=BEG+ADD; ENDING=BEG+ADD-AM-PM. Implement add, remove, adjust, balance, movement history, and concurrency-safe mutation logic using database transactions/RPC as appropriate. Reject invalid states and unauthorized mutations. Test normal, edge, insufficient-stock, zero-stock, adjustment, concurrency, history, calculation, and authorization cases. No client-side read-modify-write for critical stock changes.

## Required completion artifact

Update the applicable documentation, CHANGELOG, automated tests, and `docs/phase-reports/PHASE-6.md`. Record actual commands and results. Never claim PASS without execution evidence.
