# Catalog compatibility · NoKitchen 1.3

This fixture uses the expanded opening inventory and the unedited eight households. Each Monday pickup covers Monday through Thursday. The Friday pickup covers Friday through Sunday. Each independent check starts with all received stock and tests one batch for the entire household. The selected joint plan shares this same finite stock across the week.

## Independent compatibility and actual allocations

Each pair shows distinct recipes / distinct families. Main combines lunch and dinner. The weekly column counts the recipes and families that actually occur in the selected weekly plan for that household and category. The JSON contains all seven days, the groups of recipe and family IDs, individual allocated slots and the exact witness lots for each method.

| Household | Day | Category | Catalog | Kitchen method | Full independent batch | Allocated that day | Allocated that week |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| H01 | Monday | breakfast | 10 / 9 | 6 / 6 | 5 / 5 | 1 / 1 | 4 / 4 |
| H01 | Monday | main | 30 / 15 | 10 / 6 | 7 / 6 | 2 / 2 | 6 / 6 |
| H01 | Friday | breakfast | 10 / 9 | 6 / 6 | 5 / 5 | 1 / 1 | 4 / 4 |
| H01 | Friday | main | 30 / 15 | 10 / 6 | 9 / 6 | 1 / 1 | 6 / 6 |
| H02 | Monday | breakfast | 10 / 9 | 7 / 7 | 6 / 6 | 1 / 1 | 4 / 4 |
| H02 | Monday | main | 30 / 15 | 14 / 8 | 14 / 8 | 2 / 2 | 6 / 4 |
| H02 | Friday | breakfast | 10 / 9 | 7 / 7 | 6 / 6 | 1 / 1 | 4 / 4 |
| H02 | Friday | main | 30 / 15 | 14 / 8 | 14 / 8 | 1 / 1 | 6 / 4 |
| H03 | Monday | breakfast | 10 / 9 | 8 / 8 | 8 / 8 | 1 / 1 | 4 / 4 |
| H03 | Monday | main | 30 / 15 | 13 / 8 | 13 / 8 | 2 / 2 | 7 / 6 |
| H03 | Friday | breakfast | 10 / 9 | 8 / 8 | 8 / 8 | 1 / 1 | 4 / 4 |
| H03 | Friday | main | 30 / 15 | 13 / 8 | 12 / 8 | 1 / 1 | 7 / 6 |
| H04 | Monday | breakfast | 10 / 9 | 8 / 7 | 7 / 6 | 1 / 1 | 4 / 4 |
| H04 | Monday | main | 30 / 15 | 19 / 10 | 18 / 10 | 2 / 2 | 9 / 7 |
| H04 | Friday | breakfast | 10 / 9 | 8 / 7 | 7 / 6 | 1 / 1 | 4 / 4 |
| H04 | Friday | main | 30 / 15 | 19 / 10 | 17 / 10 | 2 / 2 | 9 / 7 |
| H05 | Monday | breakfast | 10 / 9 | 8 / 7 | 6 / 6 | 1 / 1 | 4 / 4 |
| H05 | Monday | main | 30 / 15 | 19 / 10 | 19 / 10 | 2 / 2 | 9 / 6 |
| H05 | Friday | breakfast | 10 / 9 | 8 / 7 | 6 / 6 | 1 / 1 | 4 / 4 |
| H05 | Friday | main | 30 / 15 | 19 / 10 | 18 / 10 | 2 / 2 | 9 / 6 |
| H06 | Monday | breakfast | 10 / 9 | 6 / 6 | 6 / 6 | 1 / 1 | 4 / 4 |
| H06 | Monday | main | 30 / 15 | 11 / 6 | 10 / 6 | 2 / 2 | 7 / 5 |
| H06 | Friday | breakfast | 10 / 9 | 6 / 6 | 6 / 6 | 1 / 1 | 4 / 4 |
| H06 | Friday | main | 30 / 15 | 11 / 6 | 10 / 6 | 1 / 1 | 7 / 5 |
| H07 | Monday | breakfast | 10 / 9 | 7 / 7 | 7 / 7 | 1 / 1 | 4 / 4 |
| H07 | Monday | main | 30 / 15 | 16 / 9 | 16 / 9 | 2 / 2 | 7 / 5 |
| H07 | Friday | breakfast | 10 / 9 | 7 / 7 | 7 / 7 | 1 / 1 | 4 / 4 |
| H07 | Friday | main | 30 / 15 | 16 / 9 | 16 / 9 | 1 / 1 | 7 / 5 |
| H08 | Monday | breakfast | 10 / 9 | 8 / 8 | 8 / 8 | 1 / 1 | 3 / 3 |
| H08 | Monday | main | 30 / 15 | 16 / 11 | 16 / 11 | 2 / 2 | 8 / 6 |
| H08 | Friday | breakfast | 10 / 9 | 8 / 8 | 8 / 8 | 1 / 1 | 3 / 3 |
| H08 | Friday | main | 30 / 15 | 16 / 11 | 15 / 11 | 1 / 1 | 8 / 6 |

## Limited kitchens

H01 has one person, no cooking appliance, no can opener and ambient storage only. H02 has two people, a kettle, an opener and ambient storage only. These are their actual independently feasible families on the two pickup days.

- **H01 · Monday**. Breakfast (5) includes cereal bowl, cracker plate, fruit salad, muesli, open sandwich. Main (6) includes cracker plate, open sandwich, pulse salad, rice bowl, stuffed vegetables, wrap.
- **H01 · Friday**. Breakfast (5) includes cereal bowl, cracker plate, fruit salad, muesli, open sandwich. Main (6) includes cracker plate, open sandwich, pulse salad, rice bowl, stuffed vegetables, wrap.
- **H02 · Monday**. Breakfast (6) includes cereal bowl, couscous bowl, cracker plate, fruit salad, muesli, open sandwich. Main (8) includes couscous bowl, cracker plate, open sandwich, potato bowl, pulse salad, rice bowl, stuffed vegetables, wrap.
- **H02 · Friday**. Breakfast (6) includes cereal bowl, couscous bowl, cracker plate, fruit salad, muesli, open sandwich. Main (8) includes couscous bowl, cracker plate, open sandwich, potato bowl, pulse salad, rice bowl, stuffed vegetables, wrap.

## Family index and reproducibility

| Recognizable meal family | Recipes |
| --- | --- |
| cereal bowl | R17 Pear and puffed rice cereal |
| couscous bowl | R04 Sweet couscous with raisins, R05 Chickpea couscous bowl, R40 Orange and lentil couscous |
| cracker plate | R19 Sunflower and jam cracker plate, R25 Sardine and cucumber cracker plate, R28 Beet and bean dip with crackers |
| flatbread | R38 Corn and tomato tortilla flatbreads |
| fruit salad | R20 Orange and pear salad with rice crunch |
| gratin | R37 Beetroot and cheese gratin |
| muesli | R18 Apple and apricot muesli |
| open sandwich | R02 Peanut butter and banana bread, R24 Hummus and pepper open sandwiches |
| pasta | R10 Tomato pasta, R33 Spinach and pea pasta |
| porridge | R01 Banana oatmeal, R21 Pear porridge with oat drink |
| potato bowl | R13 Potato with beans, R29 Potato mash with peas, R34 Sweet potato and hummus bowl, R39 Cabbage and potato mash |
| pulse salad | R06 Lentil salad with bread, R23 Beetroot and chickpea salad |
| rice bowl | R11 Rice and beans, R12 Vegetable rice, R26 Cold rice and pea bowl |
| rice pudding | R22 Warm raisin rice pudding |
| soup | R15 Vegetable soup and crackers, R31 Red lentil and carrot soup |
| stew | R16 Potato and lentil pot, R32 Sweet potato and red lentil stew |
| stuffed vegetables | R30 Couscous-stuffed pepper halves, R35 Rice and sardine stuffed tomatoes |
| toastie | R09 Cheese and tomato toastie, R36 Apple and cheese tortilla pockets |
| tray roast | R14 Roasted potatoes and chickpeas |
| wrap | R07 Bean and corn tortilla, R08 Tuna cucumber wraps, R27 Crunchy cabbage and hummus wrap |
| yogurt bowl | R03 Apple yogurt bowl |

Run `node scripts/catalog-audit.mjs` from the extracted project. The matrix uses the same recipe and method checks as Recipes. [Machine-readable results](catalog-compatibility-1.3.json).
