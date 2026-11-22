# Scenario matrix · NoKitchen 1.2

All values are model recipe portions. Reference and raw are fresh runs from identical received stock. Selection uses the named incumbent when supplied. Each selection was checked against its current inputs. Times are median wall-clock milliseconds for 9 measured runs after one warm-up in Node v24.22.3.

| Scenario and mode | Reference | Raw | Incumbent | Selected / demand | Winning candidate | Target before → after | Checks | Selection ms |
| --- | ---: | ---: | --- | ---: | --- | --- | --- | ---: |
| Untouched full week · fresh | 228 | 241 | None | 241 / 378 | fresh-legacy | H01 8 → 10 | Passed | 12.01 |
| Monday donation · with incumbent | 242 | 249 | 241 · valid | 255 / 378 | extend | H01 10 → 12 | Passed | 21.85 |
| Opener only · with incumbent | 228 | 239 | 241 · valid | 241 / 378 | retain | H01 10 → 10 | Passed | 21.62 |
| Donation then opener · with incumbent | 242 | 253 | 255 · valid | 255 / 378 | retain | H01 12 → 12 | Passed | 21.48 |
| Teaching pair · fresh | 1 | 2 | None | 2 / 2 | fresh-legacy | H02 0 → 1 | Passed | 0.46 |
| Neutral pair · fresh | 2 | 2 | None | 2 / 2 | fresh-legacy | H02 1 → 1 | Passed | 0.42 |
| Invalid incumbent · with incumbent | 220 | 222 | 241 · invalid | 222 / 378 | fresh-legacy | H02 26 → 16 | Passed | 15.88 |
| Microwave without container · with incumbent | 228 | 241 | 241 · valid | 241 / 378 | retain | H01 10 → 10 | Passed | 20.99 |

## Household changes

Deltas compare selection with the supplied incumbent, or with the reference on fresh runs. Zero includes a household that kept the same number of portions. Percentage-point and slot-level changes, additional reference comparisons, and validator evidence are recorded in the JSON.

| Scenario | Basis | H01 | H02 | H03 | H04 | H05 | H06 | H07 | H08 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Untouched full week | Reference | +2 | +2 | -6 | +5 | -4 | +2 | +6 | +6 |
| Monday donation | Incumbent | +2 | +2 | +3 | 0 | 0 | +4 | 0 | +3 |
| Opener only | Incumbent | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Donation then opener | Incumbent | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Teaching pair | Reference | 0 | +1 | — | — | — | — | — | — |
| Neutral pair | Reference | 0 | 0 | — | — | — | — | — | — |
| Invalid incumbent | Incumbent | -1 | -10 | -3 | +2 | 0 | -2 | -8 | +3 |
| Microwave without container | Incumbent | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Reproducible inputs

The policy is Meal coverage first. The policy parameters, snapshot fingerprints, allocation digests and scores for every candidate are retained in [the machine-readable matrix](scenario-results-1.2.json). Formula, lot declarations and scenario inputs come from the same code as the application.

| Scenario | Policy context key | Input change |
| --- | --- | --- |
| Untouched full week | `ctx12-11yeqnc-2t9cze` | Reset fixture with all original inputs. |
| Monday donation | `ctx12-bhnv3j-g9prav` | Review and receive OFFER-01 once, using the selected initial plan as history. |
| Opener only | `ctx12-8hy0pw-b3tfkm` | Add only a can opener to H01 on the initial stock. |
| Donation then opener | `ctx12-dcti0r-1y49vot` | Add only a can opener to H01 after the Monday receipt and its selected draft. |
| Teaching pair | `ctx12-1dh1bed-1nw5f21` | Two one-person Monday lunch requests competing for one kettle meal. |
| Neutral pair | `ctx12-1o92q8f-1a1pa15` | Both Monday lunch requests have suitable stock in this separate example. |
| Invalid incumbent | `ctx12-bi31ri-w9tjqs` | Reduce the received couscous lot LOT-002 to zero before approval. The old assignments use this lot. |
| Microwave without container | `ctx12-1kjjrua-1c8d3pc` | Add a microwave to H01 only. The R13 microwave-safe container remains missing. |

Run `npm run matrix` to regenerate both files. Timings vary by machine and load.
