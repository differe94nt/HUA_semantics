/**
 * 詞網與AI偏誤工作坊 · Google 試算表後端（Google Apps Script）
 *
 * 用途：讓本機檔案或 GitHub Pages 上的「學生任務單」也能把答案存到老師的
 *       Google 試算表，教師端也能看到各組即時答案。設定步驟見 backend/README.md。
 *
 * 試算表會自動建立兩個工作表：
 *   groups   ：每組一列（id、updatedAt、各欄位的可讀內容、完整 json）
 *   settings ：教師廣播（目前階段）
 *
 * 介面（任務單裡的 makeSheetStore 就是對這兩個端點說話）：
 *   GET  ?action=all                       → {ok, groups:{g1:{...}}, settings:{class:{...}}}
 *   POST {type:'group'|'settings', id, data} → {ok}
 */

const SHEET_GROUPS = 'groups';
const SHEET_SETTINGS = 'settings';

// 可讀欄位：和任務單裡的 EXPORT_COLUMNS 一致。json 欄永遠保留完整資料，所以這裡少列也沒關係。
const GROUP_COLUMNS = [
  ['偏誤句', 'sentence'],
  ['1點選', 's1.markedWords'], ['1改成', 's1.fix'], ['1為什麼', 's1.why'],
  ['人類_用錯的詞', 'human.wrongWord'], ['人類_用錯詞義項', 'human.wrongSense'],
  ['人類_正確的詞', 'human.rightWord'], ['人類_正確詞義項', 'human.rightSense'],
  ['人類_差別', 'human.diff'], ['人類_解釋', 'human.explain'], ['人類_教學計畫', 'human.plan'],
  ['AI_改法', 'ai.aiFix'], ['AI_理由', 'ai.aiExplain'], ['AI_網頁', 'ai.result'],
  ['AI_過程', 'ai.notes'], ['AI_prompt', 'ai.prompt'],
  ['3比一比', 's3.compare'], ['3AI分數', 's3.score'], ['3最終答案', 's3.final'], ['3一句話', 's3.share'],
];

function doGet(e) {
  try {
    return json_({ ok: true, groups: readAll_(SHEET_GROUPS), settings: readAll_(SHEET_SETTINGS) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const type = body.type, id = String(body.id || '');
    const sheetName = type === 'group' ? SHEET_GROUPS : type === 'settings' ? SHEET_SETTINGS : null;
    if (!sheetName) throw new Error('type 必須是 group 或 settings');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('id 不合法');
    if (typeof body.data !== 'object' || body.data === null) throw new Error('缺少 data');
    lock.waitLock(10000);
    upsert_(sheetName, id, body.data);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ---------- 內部 ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function headers_(sheetName) {
  const base = ['id', 'updatedAt'];
  return sheetName === SHEET_GROUPS ? base.concat(GROUP_COLUMNS.map(c => c[0]), ['json']) : base.concat(['json']);
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers_(name));
    sh.setFrozenRows(1);
  }
  return sh;
}

function getPath_(o, p) {
  return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
}

function rowFor_(sheetName, id, data) {
  const json = JSON.stringify(data);
  const row = [id, data.updatedAt || new Date().toISOString()];
  if (sheetName === SHEET_GROUPS) {
    GROUP_COLUMNS.forEach(([, key]) => { const v = getPath_(data, key); row.push(v == null ? '' : String(v)); });
  }
  row.push(json);
  return row;
}

function upsert_(sheetName, id, data) {
  const sh = sheet_(sheetName);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const row = rowFor_(sheetName, id, data);
  const i = ids.indexOf(id);
  if (i >= 0) sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function readAll_(sheetName) {
  const sh = sheet_(sheetName);
  const out = {};
  if (sh.getLastRow() < 2) return out;
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const jsonCol = sh.getLastColumn() - 1;
  values.forEach(r => {
    const id = String(r[0]); if (!id) return;
    try { out[id] = JSON.parse(r[jsonCol]); } catch (_) { out[id] = { id: id, updatedAt: r[1] }; }
  });
  return out;
}
