# NoKitchen 1.2

- Added **Meal coverage first** with explicit engine, policy, model, inputs and incumbent evidence. The original NoKitchen heuristic remains available as a fresh candidate. The independent reference strategy remains available in **Compare planners**.
- Revalidate a supplied allocation and its packing before retaining it as a new draft. A further candidate fixes its assignments and tries to fill only empty requests from residual stock. Both candidates use the same validators as fresh plans.
- Added per-household portion and percentage-point changes, newly filled, lost and changed slots, provenance, blockers and selection evidence to action previews. The ordinary approval view compares the draft with the active approval or previous draft.
- Updated the guided demo to check the selected result. Added durable local-storage failure feedback, in-memory operation, preservation of unreadable records and migration from older browser keys.
- Added a reproducible eight-scenario matrix and a standalone cold-start test. The audit still covers the same 16 recipes and 20 methods.

[Release verification](verification-1.2.md) · [Opener investigation](root-cause-1.2.md) · [Scenario matrix](scenario-matrix-1.2.md)
