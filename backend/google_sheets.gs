/**
 * 詞網與AI偏誤工作坊 · Google 試算表＋雲端硬碟後端（Google Apps Script）
 *
 * 用途：讓 GitHub Pages／本機檔案上的「學生任務單」把答案存到老師的 Google 試算表，
 *       並把學生上傳的網頁截圖存到老師的 Google 雲端硬碟。設定步驟見 backend/README.md。
 *
 * 試算表會自動建立三個工作表：
 *   groups   ：每組一列（id、updatedAt、各欄位的可讀內容、完整 json）
 *   settings ：教師廣播（目前階段）
 *   uploads  ：每張截圖一列（組別、雲端硬碟檔案 ID、網址、檔名、上傳時間、是否移除）
 * 截圖存在試算表旁邊的資料夾「偏誤句小組任務_截圖」。
 *
 * 介面（任務單裡的 makeSheetStore 就是對這些端點說話）：
 *   GET  ?action=ping                → {ok}
 *   GET  ?action=all                 → {ok, groups:{g1:{...}}, settings:{class:{...}}}
 *   GET  ?action=group&id=g4         → 同上，但 groups 只有 g4
 *   POST {type:'group'|'settings', id, data}              → {ok}
 *   POST {type:'upload', id:'g4', name, mime, data(base64)} → {ok, file, shots}
 *   POST {type:'unshot', id:'g4', fileId}                  → {ok, shots}
 */

const SHEET_GROUPS = 'groups';
const SHEET_SETTINGS = 'settings';
const SHEET_UPLOADS = 'uploads';
const UPLOAD_FOLDER_NAME = '偏誤句小組任務_截圖';
// true：截圖設為「知道連結的人可以檢視」，教師端與組員才看得到縮圖。
// 改成 false：只有你自己看得到（教師端縮圖可能顯示不出來，要點連結到雲端硬碟看）。
const SHARE_UPLOADS_WITH_LINK = true;
const MAX_SHOTS = 6;                     // 每組最多幾張
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const CELL_MAX = 45000;                  // 試算表一格上限是 50,000 字，留一點空間

// 可讀欄位：和任務單裡的 EXPORT_COLUMNS 一致。json 欄永遠保留完整資料。
const GROUP_COLUMNS = [
  ['偏誤句', 'sentence'],
  ['1點選', 's1.markedWords'], ['1改成', 's1.fix'], ['1為什麼', 's1.why'],
  ['人類_用錯的詞', 'human.wrongWord'], ['人類_用錯詞義項', 'human.wrongSense'],
  ['人類_正確的詞', 'human.rightWord'], ['人類_正確詞義項', 'human.rightSense'],
  ['人類_差別', 'human.diff'], ['人類_解釋', 'human.explain'], ['人類_教學計畫', 'human.plan'],
  ['AI_改法', 'ai.aiFix'], ['AI_理由', 'ai.aiExplain'], ['AI_網頁', 'ai.result'],
  ['AI_網頁截圖', 'ai.shots'], ['AI_分享連結', 'ai.shareLink'], ['AI_建置回覆', 'ai.builderReply'],
  ['AI_過程', 'ai.notes'], ['AI_prompt', 'ai.prompt'],
  ['3比一比', 's3.compare'], ['3AI分數', 's3.score'], ['3最終答案', 's3.final'], ['3一句話', 's3.share'],
];

// ---------- 入口 ----------
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'ping') return json_({ ok: true });
    const groups = readGroups_(), settings = readDocs_(sheet_(SHEET_SETTINGS));
    if (p.action === 'group') {
      const id = String(p.id || ''), one = {};
      if (groups[id]) one[id] = groups[id];
      return json_({ ok: true, groups: one, settings: settings });
    }
    return json_({ ok: true, groups: groups, settings: settings });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const type = String(body.type || ''), id = String(body.id || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error('id 不合法');
    lock.waitLock(20000);
    if (type === 'group' || type === 'settings') {
      if (typeof body.data !== 'object' || body.data === null) throw new Error('缺少 data');
      upsert_(type === 'group' ? SHEET_GROUPS : SHEET_SETTINGS, id, body.data);
      return json_({ ok: true, id: id });
    }
    if (type === 'upload') return json_(saveUpload_(id, body));
    if (type === 'unshot') return json_(removeUpload_(id, String(body.fileId || '')));
    throw new Error('type 不合法');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ---------- 截圖 ----------
function saveUpload_(groupId, body) {
  if (!/^g\d{1,3}$/.test(groupId)) throw new Error('組別不合法');
  const mime = String(body.mime || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('只接受圖片');
  const bytes = Utilities.base64Decode(String(body.data || ''));
  if (!bytes.length) throw new Error('圖片是空的');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('圖片太大');
  if ((readUploads_()[groupId] || []).length >= MAX_SHOTS) throw new Error('每組最多 ' + MAX_SHOTS + ' 張');

  const name = String(body.name || 'screenshot.jpg').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  const file = folder_().createFile(Utilities.newBlob(bytes, mime, groupId + '_' + stamp + '_' + name));
  if (SHARE_UPLOADS_WITH_LINK) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {
      // 學校帳號可能不允許對外分享；檔案仍然存好了，只是縮圖要老師登入才看得到
    }
  }
  sheet_(SHEET_UPLOADS).appendRow([groupId, file.getId(), file.getUrl(), name, new Date().toISOString(), '']);
  refreshGroupRow_(groupId);
  return { ok: true, file: { id: file.getId(), url: file.getUrl(), name: name }, shots: readUploads_()[groupId] || [] };
}

function removeUpload_(groupId, fileId) {
  const sh = sheet_(SHEET_UPLOADS);
  if (sh.getLastRow() > 1) {
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === groupId && String(rows[i][1]) === fileId && !rows[i][5]) {
        sh.getRange(i + 2, 6).setValue('removed ' + new Date().toISOString());
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (_) {}  // 丟到垃圾桶，30 天內可救回
      }
    }
  }
  refreshGroupRow_(groupId);
  return { ok: true, shots: readUploads_()[groupId] || [] };
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('UPLOAD_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (_) {}
  }
  let parent = DriveApp.getRootFolder();
  try {
    const ps = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
    if (ps.hasNext()) parent = ps.next();
  } catch (_) {}
  const f = parent.createFolder(UPLOAD_FOLDER_NAME);
  props.setProperty('UPLOAD_FOLDER_ID', f.getId());
  return f;
}

function readUploads_() {
  const sh = sheet_(SHEET_UPLOADS), out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(r => {
    if (!r[0] || r[5]) return;
    const g = String(r[0]);
    (out[g] = out[g] || []).push({ id: String(r[1]), url: String(r[2]), name: String(r[3]), at: String(r[4]) });
  });
  return out;
}

// ---------- 試算表 ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function headers_(name) {
  if (name === SHEET_GROUPS) return ['id', 'updatedAt'].concat(GROUP_COLUMNS.map(c => c[0]), ['json']);
  if (name === SHEET_UPLOADS) return ['group', 'fileId', 'url', 'name', 'uploadedAt', 'removed'];
  return ['id', 'updatedAt', 'json'];
}

// 取得工作表；不存在就建立。欄位改版時，自動把舊資料搬到新欄位。
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const want = headers_(name);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.setFrozenRows(1);
    return sh;
  }
  const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (name !== SHEET_UPLOADS && !want.every((h, i) => have[i] === h)) {
    const docs = readDocs_(sh, have);
    sh.clearContents();
    sh.getRange(1, 1, 1, want.length).setValues([want]);
    sh.setFrozenRows(1);
    Object.keys(docs).forEach(id => writeRow_(sh, null, rowFor_(name, id, docs[id])));
  }
  return sh;
}

function getPath_(o, p) {
  return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
}

function readable_(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.url || x.name || '') : String(x)).join('\n');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// 避免學生的文字被當成公式（= + - @ 開頭），並截短到一格的上限
function cell_(s) {
  s = String(s);
  if (s.length > CELL_MAX) s = s.slice(0, CELL_MAX - 1) + '…';
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// json 太長時切成好幾格；每格前面加 ~，讀回來時拿掉，避免被試算表當成數字或公式
function rowFor_(name, id, data, shots) {
  const doc = JSON.parse(JSON.stringify(data));
  if (doc.ai) delete doc.ai.shots;  // 截圖清單以 uploads 工作表為準
  const row = [id, doc.updatedAt || new Date().toISOString()];
  if (name === SHEET_GROUPS) {
    const view = Object.assign({}, doc, { ai: Object.assign({}, doc.ai, { shots: shots || [] }) });
    GROUP_COLUMNS.forEach(([, key]) => row.push(cell_(readable_(getPath_(view, key)))));
  }
  const json = JSON.stringify(doc);
  for (let i = 0; i === 0 || i < json.length; i += CELL_MAX) row.push('~' + json.slice(i, i + CELL_MAX));
  return row;
}

function writeRow_(sh, rowIndex, row) {
  if (row.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  if (rowIndex) {
    sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).clearContent();
    sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function rowIndexOf_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(id);
  return i >= 0 ? i + 2 : 0;
}

function upsert_(name, id, data) {
  const sh = sheet_(name);
  const shots = name === SHEET_GROUPS ? (readUploads_()[id] || []) : null;
  writeRow_(sh, rowIndexOf_(sh, id), rowFor_(name, id, data, shots));
}

// 上傳或移除截圖後，更新那一組的可讀欄位
function refreshGroupRow_(groupId) {
  const sh = sheet_(SHEET_GROUPS), r = rowIndexOf_(sh, groupId);
  if (!r) return;
  const docs = readDocs_(sh);
  if (docs[groupId]) writeRow_(sh, r, rowFor_(SHEET_GROUPS, groupId, docs[groupId], readUploads_()[groupId] || []));
}

function readDocs_(sh, header) {
  const out = {};
  if (sh.getLastRow() < 2) return out;
  header = header || sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const j = header.indexOf('json');
  if (j < 0) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(r => {
    const id = String(r[0]); if (!id) return;
    const text = r.slice(j).map(c => { c = String(c); return c.charAt(0) === '~' ? c.slice(1) : c; }).join('');
    try { out[id] = JSON.parse(text); } catch (_) { out[id] = { id: id, updatedAt: String(r[1]) }; }
  });
  return out;
}

// 每組的答案，加上該組目前的截圖清單
function readGroups_() {
  const groups = readDocs_(sheet_(SHEET_GROUPS)), ups = readUploads_();
  Object.keys(groups).forEach(g => { if (groups[g].ai) delete groups[g].ai.shots; });
  Object.keys(ups).forEach(g => {
    const d = groups[g] || (groups[g] = { group: Number(g.slice(1)) || null, updatedAt: ups[g][0].at });
    d.ai = Object.assign({}, d.ai, { shots: ups[g] });
  });
  return groups;
}

// ---------- 在編輯器手動執行 ----------
// 授權雲端硬碟並建立截圖資料夾：在上方函式選單選 authorizeDrive → 執行，
// 授權畫面請勾選「雲端硬碟」那一項（或「全選」）。執行記錄會印出資料夾網址。
// 想改存到別的資料夾：到「專案設定 → 指令碼屬性」新增 UPLOAD_FOLDER_ID，值填那個資料夾網址最後一段 ID。
function authorizeDrive() {
  const f = folder_();
  Logger.log('截圖資料夾：' + f.getName() + '  ' + f.getUrl());
}
