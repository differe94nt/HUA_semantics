# data/

學生答案的匯出檔放在 `data/exports/`（已列入 `.gitignore`，不會上傳到 GitHub）。

取得資料的三種方式：

| 上課用的版本 | 答案存在哪裡 | 怎麼拿回來 |
|---|---|---|
| claude.ai Artifact（線上版） | Artifact 的共用資料庫 | 教師端按「匯出 CSV／JSON」；或在 Cowork 對話貼上 Artifact 連結，請 Claude 把 `groups` 集合匯出成 JSON，再用 `tools/export.py --from-dir` |
| 本機檔／GitHub Pages ＋ Google 試算表 | 你的 Google 試算表 | 試算表本身就是；或 `tools/export.py --from-sheet <網址>` |
| 本機檔，沒有設定試算表 | 學生自己的裝置 | 學生按「複製本組答案」貼給你 |

`tools/export.py` 會同時產生 `.json`（原始）和 `.csv`（可開在 Excel／Numbers，欄位與教師端匯出一致）。

學生上傳的網頁截圖不在這裡，而是在你的 Google 雲端硬碟「偏誤句小組任務_截圖」資料夾；匯出的 CSV 在「AI_網頁截圖」欄列出每張截圖的網址。
