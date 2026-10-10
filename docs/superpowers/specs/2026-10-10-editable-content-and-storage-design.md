# 設計說明：可編輯的內容設定與學生答案儲存（2026-10-10）

## 問題

原本兩個網頁各自把偏誤句、組別、模板、通關碼寫死在 50 KB 的 HTML 裡，同一份句子出現在三個地方（任務單、教學頁、教案）；學生答案只有在 claude.ai Artifact 上才會存到共用資料庫，本機版只存在學生裝置。

## 決定

1. **單一設定檔** `content/config.js`（`window.CWN_CONFIG`）。選 JS 而不是 JSON，因為可以寫註解、可以直接用 `<script src>` 從 `file://` 載入、模板可以多行。網頁只透過 `C.xxx` 讀設定，教學頁的組別標籤由 `groups` 推導。
2. **src → build → dist / artifact_source**。`src/` 是完整可開的 HTML，引用 `../content/config.js`；`build.py` 把設定內嵌，輸出獨立檔到 `dist/`，並擷取 `<body>` 內容輸出 Artifact 原始碼。`build.py --check` 可驗證產出是否過期。
3. **儲存後端抽象**：`S.store` 介面（`saveGroup / saveSettings / watchGroup / watchGroups / watchSettings`），三個實作：
   - `makeDbStore`：Artifact 的 `db` 能力（原本的行為）。
   - `makeSheetStore`：Google Apps Script 網頁應用程式。POST 用 `text/plain` 避免 CORS 預檢；GET 輪詢（預設 8 秒），訂閱時先回快取並立刻重抓。接收端只接受 `updatedAt` 不早於手上資料的更新，避免輪詢蓋掉剛存的答案。
   - `makeLocalStore`：localStorage。
   選擇順序：db → sheet（能連上才算）→ local。
4. **資料匯出**：教師端新增「匯出 JSON」；`tools/export.py` 把 JSON／資料夾／試算表整理成同欄位 CSV 到 `data/exports/`（gitignored，比照 huayu-pronunciation-lab 不把學生資料放進 repo）。`s1.markedWords` 於儲存時一併寫入，讓試算表與匯出不必知道斷詞。

## 沒做的事

- 沒有重新發布線上 Artifact：現行版本可用，更新時用 `artifact_source/` 的檔案。
- 教案 Markdown 裡的句子表沒有自動產生，仍以 `config.js` 為準。
- 通關碼仍在前端，只是「軟性」把關；repo 公開時等同公開。

## 驗證

headless Chrome 跑三種模式（本機、模擬 db、模擬 Apps Script）：選組、點詞、儲存三個階段、教師端解鎖、各組答案、通知階段、投影熱度，全部通過；教學頁 `#groups` 顯示由 config 推導的「1–3 組」等標籤與 QR code。
