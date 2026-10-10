# 把學生答案存到 Google 試算表

線上版（claude.ai Artifact）本來就有共用資料庫，**不需要**做這一節。
只有當你想用「本機 HTML 檔」或「GitHub Pages」上課、又希望各組答案自動收到你的 Google 帳號時，才需要設定。

設定一次約 5 分鐘：

1. 到 [Google 試算表](https://sheets.new) 開一個新的空白試算表，命名例如「偏誤句小組任務」。
2. 選單 **擴充功能 → Apps Script**，把編輯器裡原本的內容全部刪掉，貼上 `backend/google_sheets.gs` 的全部內容，按儲存。
3. 右上 **部署 → 新增部署作業**：
   - 類型：**網頁應用程式**
   - 執行身分：**我**
   - 誰可以存取：**所有人**（學生不用登入 Google 就能存答案）
   - 按「部署」，第一次會要你授權；完成後複製 **網頁應用程式網址**（`https://script.google.com/macros/s/…/exec`）。
4. 打開 `content/config.js`，把網址填進 `sheetEndpoint`，然後執行 `python3 build.py`。
5. 用瀏覽器打開 `dist/student_tasks.html`，首頁應顯示「已連線 Google 試算表」。隨便選一組按一次儲存，試算表裡會出現 `groups` 工作表和那一列。

之後每次修改 `.gs` 檔都要 **部署 → 管理部署作業 → 編輯 → 版本：新版本** 才會生效。

## 資料長什麼樣子

- `groups` 工作表：每組一列。前面是可直接閱讀的欄位（和教師端匯出的 CSV 相同），最後一欄 `json` 是完整原始資料。
- `settings` 工作表：教師按「通知全班目前階段」時寫入。

試算表本身就是備份；也可以用 `tools/export.py --from-sheet <網址>` 把資料抓回 `data/exports/`。

## 注意

- 網址是「所有人可存取」，知道網址的人都能寫入；網址只放在 config 裡、不要公開張貼。課後可以把部署封存。
- Apps Script 免費額度足夠一個班級使用（每天數萬次請求）。
