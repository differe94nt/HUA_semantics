# HUA_semantics · 詞網與AI偏誤工作坊

大三華語文教學系 50 分鐘課堂活動的網頁與文件：以國家教育研究院華語中介語語料庫（2019）的詞彙誤代偏誤句為材料，學生分成「人類分析小隊」（查中文詞彙網路 CWN）與「AI 分析小隊」（引導 AI 做互動教材），最後比較兩者，體會專業知識才能有效引導並判斷 AI。

## 線上版本（claude.ai Artifact，需從分享選單開啟連結）

| 網頁 | 用途 | 連結 |
|---|---|---|
| 詞網與AI偏誤工作坊 | 教師投影用教學頁 | https://claude.ai/artifact/BnMhR83EnEBp4gHvRapxpS |
| 偏誤句小組任務單 | 學生任務頁＋教師答案檢視 | https://claude.ai/artifact/4AxQFegPfkYEBcoSPt6tcr |

教師端通關碼預設 `cwn2026`（在 `content/config.js` 的 `teacherCode` 修改）。用作者帳號開啟時會自動解鎖教師端。

## 資料夾內容

```
content/config.js        ← 唯一需要編輯的檔案：偏誤句、組數、通關碼、階段、AI 模板、資料後端
src/                     網頁原始碼（直接用瀏覽器開也能看，會即時讀 config.js）
  student_tasks.html       學生任務單＋教師端
  teaching_slides.html     教學投影頁
build.py                 把 config.js 嵌進網頁，產生下面兩個資料夾
dist/                    獨立版網頁（雙擊即可開；可放 GitHub Pages）
artifact_source/         claude.ai Artifact 用的原始碼（不含 <html> 外框）
backend/google_sheets.gs 選用：Google 試算表後端（Apps Script），設定步驟見 backend/README.md
tools/export.py          把學生答案整理成 CSV，存進 data/exports/
data/                    學生答案匯出檔（不進 git），說明見 data/README.md
教案_lesson_plan.md       活動流程、時間分配、教師參考與討論題
docs/superpowers/specs/  設計說明
```

## 如何修改

1. **改內容**（換句子、改組數、改模板、改通關碼）：編輯 `content/config.js`。
   - 偏誤句在 `sentences`，`toks` 用 `|` 斷詞供學生點選，`groups` 是拿到該句的組別，`ref` 是教師參考。
   - 教學頁的「分組與任務」那一頁、任務單的句子、匯出欄位都從這裡讀，不必改兩份。
2. **看結果**：直接用瀏覽器打開 `src/student_tasks.html` 或 `src/teaching_slides.html`。
3. **產生可發布的檔案**：`python3 build.py`（不需要安裝任何套件；有 node 的話會順便檢查語法）。
4. **更新線上版**：在 Cowork 新對話中貼上 Artifact 連結，請 Claude 用 `artifact_source/` 裡對應的檔案更新；已存的學生答案會保留。
5. **改版面或流程**：編輯 `src/` 裡的 HTML，再執行 `build.py`。

## 學生答案存在哪裡

任務單會依環境自動挑一種後端，首頁會顯示目前是哪一種：

| 情境 | 後端 | 畫面顯示 |
|---|---|---|
| 以 claude.ai Artifact 開啟 | Artifact 共用資料庫，全組即時同步，教師端即時看到 | ● 即時儲存 |
| 本機檔／GitHub Pages，且 `config.js` 填了 `sheetEndpoint` | 你的 Google 試算表（Apps Script），每 8 秒同步一次 | ● 存到試算表 |
| 以上都沒有 | 只存在學生裝置，最後按「複製本組答案」交卷 | ○ 存在本機 |

教師端可「匯出 CSV」「匯出 JSON」；課後整理見 `data/README.md`。

> **要不要連 Google Drive？** 把 Google Drive 接到 Claude 只會讓 *Claude* 能讀寫你的雲端硬碟，學生的瀏覽器還是寫不進去，所以對收答案沒有幫助。想把答案放進 Google 帳號，正確做法是上面的 Google 試算表後端；不需要的話，線上版自帶的資料庫已經夠用。

## 任務單的資料結構

每組一份文件 `groups/g<組別>`（試算表模式下是 `groups` 工作表的一列），欄位如下：

- `s1`：`marked`（點選的詞序號）、`markedWords`、`fix`、`why`
- `human`：`wrongWord`、`wrongSense`、`rightWord`、`rightSense`、`diff`、`explain`、`plan`
- `ai`：`aiFix`、`aiExplain`、`result`、`notes`、`prompt`
- `s3`：`compare`、`score`（1–5）、`final`、`share`
- 另有 `group`、`sentence`、`updatedAt`

`settings/class` 存教師廣播的目前階段（1 找誤代詞、2 分隊分析、3 比較與結論）與開始時間。

## CWN 資料來源

- CWN 2.0 線上查詢：https://lopentu.github.io/CwnWeb/
- LOPE 實驗室專案頁：https://lope.linguistics.ntu.edu.tw/projects/chinese-wordnet/
- 黃居仁、謝舒凱、洪嘉馡等（2010）。〈中文詞彙網路：跨語言知識處理基礎架構的設計理念與實踐〉。《中國語文》，24(2)。
