# Seller workflow canvas (16 Nov 2026)

Snapshot of the redesign canvas, published at https://claude.ai/artifact/UxZAywJjqgXxC65EMMKsHR (version 41).
Example shop: Mây Cosmetics, reseller, 140 products. Decisions behind it: `../execution-plan.md` (W1.1, W2.1, W4.10).

| # | Board | File |
|---|---|---|
| 1 | First run | project/SStart.dc.html |
| 2 | Products | project/SLibrary.dc.html |
| 3 | Product facts | project/SFacts.dc.html |
| 4 | Make images | project/SSerum.dc.html |
| 5 | Output (6 images) | project/SOutput.dc.html |
| 6 | Bulk review | project/SBulk.dc.html |
| 7 | Sale frame | project/SSale.dc.html |
| 8 | Edit one image | project/SEdit.dc.html |
| 9 | Export done | project/SDone.dc.html |

`shots/*.png` are static renders (headless Chrome) — the visual reference for building the views. The `.dc.html` files are the canvas source (the actual HTML/CSS of each board — copy, colors, layout); they need the canvas runtime (`support.js`) to be interactive, so open the artifact link for that.
