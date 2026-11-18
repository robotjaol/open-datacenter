# Prioritized implementation plan

Ordered by risk reduction first, then visibility. Status is what this change delivered.

| # | Item | Why first | Status |
| --- | --- | --- | --- |
| 1 | Extract shared asset rows, keep CLI output identical | Prevents two sources of truth | Done |
| 2 | Web data contract and builder with hash verification | Every screen depends on it | Done |
| 3 | Scenario runner with whitelist and validation | Scenario module must run the real model | Done |
| 4 | Local API and static host | Browser needs a way to call Python | Done |
| 5 | Ten module interface | The visible deliverable | Done |
| 6 | Tests (Python and frontend), CI web job | Evidence for every claim | Done locally; remote CI not yet run |
| 7 | Documentation and traceability | Reader can check claims | Done |
| 8 | README redesign with real screenshots | Entry point | Done |
| 9 | Scenario CAPEX scaling | Dense rack results are optimistic | Not done. Needs a cost model decision from the owner. |
| 10 | Static hosting without Python | Public demo | Not done. Scenario module needs the API. |
