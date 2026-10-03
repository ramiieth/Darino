# Dashboard purchase-cost table presentation

- Quantity display is truncated to two decimal places: 17961.316141 → 17,961.31. Exact Decimal quantities, recorded costs and calculation inputs remain unchanged; the full quantity is available in the title and cost editor.
- Dashboard USD prices, averages, costs and values use fixed two-decimal formatting. Shared money formatting retains its previous default elsewhere. Positive nonzero quantities/amounts below 0.01 are labeled below that threshold rather than presented as zero.
- Number and dollar label remain on one line on desktop. Table columns have explicit widths, middle alignment and separate centered PnL/share cells. Unavailable PnL is a single “نامشخص” rather than stacked dashes. Mobile cards retain responsive wrapping and the secondary toman value.
- Full suite: 111 files, 1,255 tests passed. Client/server type checks and production PWA build passed. Browser QA with screenshot-sized 17961.316141 and 3.322229 balances passed at 320/390/768/1280/1440 widths, including unit alignment, no overflow and saving unchanged quantities. Visual desktop/mobile screenshots inspected.
- No migration, stored-quantity rounding or change to accounting formulas. No live provider or installed-device PWA validation in this presentation task.
