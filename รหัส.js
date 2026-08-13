const SHEET_ID = '1AivfnmIxjPaY-bidje61q0IkFUd5nZx9OiNVhw5WrZs';
const SHEET_NAME = 'Sheet1';
const OUTAGE_SHEET = 'OutagePlan';
/** ชีทต้นทาง "กำหนดการดับกระแสไฟฟ้า" — ต้องแชร์ให้บัญชีเจ้าของ Apps Script อ่านได้ */
const OUTAGE_SOURCE_SS_ID = '12oKHsTOG9FpPE9F80ACAjYox3s_WxVgl_2gTovEyx_I';
const OUTAGE_SOURCE_TITLE = 'กำหนดการดับกระแสไฟฟ้า ระยะที่ 3-4';
const OUTAGE_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/' + OUTAGE_SOURCE_SS_ID + '/edit';
/** ชีทต้นทาง "แผนการเข้าตรวจรับงานเฟส3-4" — ต้องแชร์ให้บัญชีเจ้าของ Apps Script อ่าน/เขียนได้ */
const INSPECTION_SHEET = 'InspectionPlan';
const INSPECTION_SOURCE_SS_ID = '18IPB1OWOKo0mSxXBWfSFTyaIePNlZvPR655UCTQPzsc';
const INSPECTION_SOURCE_TITLE = 'แผนการเข้าตรวจรับงานเฟส3-4';
const INSPECTION_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/' + INSPECTION_SOURCE_SS_ID + '/edit';
/** โฟลเดอร์ File comment แผนตรวจรับ — แยกโฟลเดอร์ย่อยตามชื่อสถานที่ */
const INSPECTION_FILE_FOLDER_ID = '14miqnUw4Vyq0X9xuLOUHZN_1FQWp_VsU';
const INSPECTION_FILE_FOLDER_URL = 'https://drive.google.com/drive/folders/' + INSPECTION_FILE_FOLDER_ID;
const USERS_SHEET = 'Users';
const SESSIONS_SHEET = 'Sessions';
const FOLDER_ID = '1_SRxF0_obGuzFCo9NDcA3QPiZDn7or-P';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

let SS_MEMO_MAIN_ = null;
function getSpreadsheet_() {
  if (!SS_MEMO_MAIN_) SS_MEMO_MAIN_ = SpreadsheetApp.openById(SHEET_ID);
  return SS_MEMO_MAIN_;
}

let OUTAGE_SRC_SS_MEMO_ = null;
function getOutageSourceSs_() {
  if (!OUTAGE_SRC_SS_MEMO_) OUTAGE_SRC_SS_MEMO_ = SpreadsheetApp.openById(OUTAGE_SOURCE_SS_ID);
  return OUTAGE_SRC_SS_MEMO_;
}

function friendlyOutageSheetError_(e) {
  const msg = (e && e.message) ? e.message : String(e || 'unknown');
  if (/permission|access denied|Authorization|ไม่มีสิทธิ์|does not have permission|Exception:\s*You do not have/i.test(msg)) {
    return 'ไม่มีสิทธิ์อ่านชีทกำหนดการ — แชร์ชีทให้บัญชีเจ้าของ Apps Script เป็น Viewer อย่างน้อย';
  }
  if (/timed out|timeout|Service invoked too many|Exceeded maximum/i.test(msg)) {
    return 'ชีทตอบช้าเกินกำหนด ลองกด「รีเฟรชจากชีท」อีกครั้ง';
  }
  return msg;
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function doGet(e) {
  if (e && e.parameter && e.parameter.api === '1') {
    return handleApiGet_(e.parameter);
  }
  if (e && e.parameter && (e.parameter.page === 'siteUpload' || e.parameter.page === 'inspectionUpload' || e.parameter.page === 'inspectionFormUpload')) {
    const t = HtmlService.createTemplateFromFile('SiteUpload');
    t.siteKey = (e.parameter.siteKey || e.parameter.inspectionId || '').toString();
    t.folderName = (e.parameter.folder || e.parameter.place || '').toString();
    t.token = (e.parameter.token || '').toString();
    t.inspectionId = (e.parameter.inspectionId || '').toString();
    if (e.parameter.page === 'inspectionFormUpload') t.uploadMode = 'inspectionForm';
    else t.uploadMode = e.parameter.page === 'inspectionUpload' ? 'inspection' : 'site';
    return t.evaluate()
      .setTitle('อัปโหลด PDF')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setTitle('PEA/PWA Smart Map System');
}

function handleApiGet_(p) {
  try {
    if (p.action) {
      const args = p.args ? JSON.parse(p.args) : [];
      const result = dispatchApi_(p.action, args, p.sessionToken || null);
      const out = { ok: true, result: result, requestId: p.requestId || null };
      if (p.callback) {
        return jsonpOutput_(p.callback, out);
      }
      return jsonOutput_(out);
    }
    return jsonOutput_({ ok: true, result: { status: 'online', version: 'api' } });
  } catch (err) {
    const out = { ok: false, error: err.message || String(err), requestId: p.requestId || null };
    if (p.callback) return jsonpOutput_(p.callback, out);
    return jsonOutput_(out);
  }
}

function jsonpOutput_(callback, obj) {
  const name = String(callback).replace(/[^\w$.]/g, '');
  if (!name) throw new Error('Invalid callback');
  const safe = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
  return ContentService.createTextOutput(name + '(' + safe + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function parsePostPayload_(e) {
  if (e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  throw new Error('Empty payload');
}

function postMessageHtml_(obj) {
  const safe = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
  const html = '<!doctype html><html><body><script>parent.postMessage(' + safe + ',"*");</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var payload = {};
  try {
    payload = parsePostPayload_(e);
    if (payload.jobId) setApiJob_(payload.jobId, { status: 'running' });
    const result = dispatchApi_(payload.action, payload.args || [], payload.sessionToken || null);
    if (payload.jobId) setApiJob_(payload.jobId, { status: 'done', result: result });
    const out = { ok: true, result: result, requestId: payload.requestId || null, jobId: payload.jobId || null };
    if (payload.client === 'pages') return postMessageHtml_(out);
    return jsonOutput_(out);
  } catch (err) {
    if (payload && payload.jobId) setApiJob_(payload.jobId, { status: 'error', error: err.message || String(err) });
    const out = { ok: false, error: err.message || String(err), requestId: payload.requestId || null, jobId: payload.jobId || null };
    if (payload && payload.client === 'pages') return postMessageHtml_(out);
    return jsonOutput_(out);
  }
}

function setApiJob_(jobId, obj) {
  if (!jobId) return;
  const key = 'job:' + String(jobId).substring(0, 80);
  CacheService.getScriptCache().put(key, JSON.stringify(obj || {}), 1800);
}

function getApiJobStatus(jobId) {
  const id = (jobId == null ? '' : String(jobId)).trim();
  if (!id) return { status: 'missing' };
  const raw = CacheService.getScriptCache().get('job:' + id.substring(0, 80));
  if (!raw) return { status: 'pending' };
  try { return JSON.parse(raw); } catch (e) { return { status: 'error', error: 'job parse failed' }; }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dispatchApi_(action, args, sessionToken) {
  const tok = sessionToken;
  switch (action) {
    case 'getLocations': return getLocations();
    case 'authenticate': return authenticate(args[0], args[1]);
    case 'validateClientSession': return validateClientSession(args[0] || tok);
    case 'revokeSession': return revokeSession(args[0] || tok);
    case 'getOutages': return getOutages();
    case 'refreshOutagesFromSource': return refreshOutagesFromSource(args[0]);
    case 'debugOutageSourceSheets': return debugOutageSourceSheets_();
    case 'saveOutageData': return saveOutageData(args[0], args[1] || tok);
    case 'updateOutageStatus': return updateOutageStatus(args[0], args[1], args[2], args[3] || tok);
    case 'deleteOutage': return deleteOutage(args[0], args[1] || tok);
    case 'getInspectionPlans': return getInspectionPlans();
    case 'refreshInspectionPlansFromSource': return refreshInspectionPlansFromSource(args[0]);
    case 'saveInspectionPlan': return saveInspectionPlan(args[0], args[1] || tok);
    case 'saveInspectionFileComment': return saveInspectionFileComment(args[0], args[1] || tok);
    case 'deleteInspectionFileComment': return deleteInspectionFileComment(args[0], args[1] || tok);
    case 'getInspectionFormTemplate': return getInspectionFormTemplate();
    case 'uploadInspectionFormTemplate': return uploadInspectionFormTemplate(args[0], args[1] || tok);
    case 'deleteInspectionFormTemplate': return deleteInspectionFormTemplate(args[0] || tok);
    case 'deleteInspectionPlan': return deleteInspectionPlan(args[0], args[1] || tok);
    case 'updateLocation': return updateLocation(args[0], args[1] || tok);
    case 'getUsers': return getUsers(args[0] || tok);
    case 'createDeputyAdmin': return createDeputyAdmin(args[0], args[1], args[2] || tok);
    case 'deleteUserAccount': return deleteUserAccount(args[0], args[1] || tok);
    case 'getProjectDocs': return getProjectDocs();
    case 'updateDocOrders': return updateDocOrders(args[0], args[1] || tok);
    case 'saveProjectDoc': return saveProjectDoc(args[0], args[1] || tok);
    case 'deleteDoc': return deleteDoc(args[0], args[1] || tok);
    case 'editProjectDoc': return editProjectDoc(args[0], args[1], args[2], args[3] || tok);
    case 'getSiteDocs': return getSiteDocs(args[0]);
    case 'getDriveSiteFolders': return getDriveSiteFolders();
    case 'saveSiteDoc': return saveSiteDoc(args[0], args[1] || tok);
    case 'beginSiteDocUpload': return beginSiteDocUpload(args[0], args[1] || tok);
    case 'saveSiteDocChunk': return saveSiteDocChunk(args[0], args[1] || tok);
    case 'finalizeSiteDocUpload': return finalizeSiteDocUpload(args[0], args[1] || tok);
    case 'getApiJobStatus': return getApiJobStatus(args[0]);
    case 'deleteSiteDoc': return deleteSiteDoc(args[0], args[1] || tok);
    default: throw new Error('Unknown action: ' + action);
  }
}

// --- Session (Cache + Sheet — คงอยู่หลัง deploy) ---
const SESSION_CACHE_PREFIX = 'sess:';

function sessionCacheKey_(token) {
  return SESSION_CACHE_PREFIX + token.toString();
}

function sessionCacheTtlSec_() {
  return Math.min(21600, Math.max(60, Math.floor(SESSION_TTL_MS / 1000)));
}

function isLikelySessionToken_(token) {
  if (!token) return false;
  const s = token.toString().trim();
  return s.length >= 32 && s.indexOf('-') > 0;
}

function getSessionsSheet_() {
  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SESSIONS_SHEET, ['Token', 'Username', 'Role', 'ExpireMs']);
  sheet.getRange('D:D').setNumberFormat('@');
  return sheet;
}

function parseSessionExpireMs_(val) {
  if (val == null || val === '') return 0;
  if (val instanceof Date) return val.getTime();
  const n = Number(String(val).trim());
  if (!isNaN(n) && n > 1e11) return n;
  return 0;
}

function cleanupExpiredSessionsSheet_() {
  const sheet = getSessionsSheet_();
  const data = sheet.getDataRange().getValues();
  const now = Date.now();
  for (let i = data.length - 1; i >= 1; i--) {
    if (parseSessionExpireMs_(data[i][3]) <= now) sheet.deleteRow(i + 1);
  }
}

function cacheSession_(token, username, role, expire) {
  const payload = JSON.stringify({ username: username, role: role, expire: expire });
  CacheService.getScriptCache().put(sessionCacheKey_(token), payload, sessionCacheTtlSec_());
}

function writeSessionToSheet_(token, username, role, expire) {
  cleanupExpiredSessionsSheet_();
  getSessionsSheet_().appendRow([token, username, role, String(expire)]);
}

function readSessionFromSheet_(sessionToken) {
  cleanupExpiredSessionsSheet_();
  const data = getSessionsSheet_().getDataRange().getValues();
  const now = Date.now();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === sessionToken.toString()) {
      const expire = parseSessionExpireMs_(data[i][3]);
      if (expire <= now) {
        getSessionsSheet_().deleteRow(i + 1);
        throw new Error('เซสชันหมดอายุ กรุณา login ใหม่');
      }
      return { username: data[i][1].toString(), role: data[i][2].toString(), expire: expire };
    }
  }
  return null;
}

function createSession_(username, role) {
  const token = Utilities.getUuid();
  const expire = Date.now() + SESSION_TTL_MS;
  cacheSession_(token, username, role, expire);
  writeSessionToSheet_(token, username, role, expire);
  return { token: token, expire: expire };
}

function validateSession_(sessionToken) {
  if (!sessionToken) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!isLikelySessionToken_(sessionToken)) throw new Error('เซสชันไม่ถูกต้อง กรุณา login ใหม่');

  const key = sessionCacheKey_(sessionToken);
  const cached = CacheService.getScriptCache().get(key);
  if (cached) {
    try {
      const info = JSON.parse(cached);
      if (info.expire && info.expire > Date.now()) {
        return { username: info.username, role: info.role };
      }
    } catch (e) { /* fall through to sheet */ }
    CacheService.getScriptCache().remove(key);
  }

  const fromSheet = readSessionFromSheet_(sessionToken);
  if (!fromSheet) throw new Error('เซสชันไม่ถูกต้อง กรุณา login ใหม่');
  cacheSession_(sessionToken, fromSheet.username, fromSheet.role, fromSheet.expire);
  return { username: fromSheet.username, role: fromSheet.role };
}

function validateClientSession(sessionToken) {
  try {
    const info = validateSession_(sessionToken);
    return { valid: true, role: info.role, username: info.username };
  } catch (e) {
    return { valid: false, message: e.message };
  }
}

function getRoleFromSession_(sessionToken) {
  return validateSession_(sessionToken).role;
}

function assertAdminFromSession_(sessionToken) {
  if (getRoleFromSession_(sessionToken) !== 'admin') {
    throw new Error('เฉพาะแอดมินหลักเท่านั้นที่ทำรายการนี้ได้');
  }
}

function assertOutageFromSession_(sessionToken) {
  const role = getRoleFromSession_(sessionToken);
  if (role !== 'admin' && role !== 'editor') {
    throw new Error('คุณไม่มีสิทธิ์แก้ไขแผนดับไฟ');
  }
}

function assertInspectionFromSession_(sessionToken) {
  const role = getRoleFromSession_(sessionToken);
  if (role !== 'admin' && role !== 'editor') {
    throw new Error('คุณไม่มีสิทธิ์แก้ไขแผนตรวจรับงาน');
  }
}

function assertEditorOrAdminFromSession_(sessionToken) {
  const role = getRoleFromSession_(sessionToken);
  if (role !== 'admin' && role !== 'editor') {
    throw new Error('คุณไม่มีสิทธิ์เพิ่มหรือจัดการไฟล์โครงการ');
  }
  return role;
}

function revokeSession(sessionToken) {
  if (!sessionToken) return { success: true };
  CacheService.getScriptCache().remove(sessionCacheKey_(sessionToken));
  if (!isLikelySessionToken_(sessionToken)) return { success: true };
  const sheet = getSessionsSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === sessionToken.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}

function ensureUsersSheet_(ss) {
  let sheet = getOrCreateSheet_(ss, USERS_SHEET, ['Username', 'Password', 'Role']);
  const data = sheet.getDataRange().getValues();
  let hasAdmin = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][2].toString() === 'admin') hasAdmin = true;
  }
  if (!hasAdmin) {
    sheet.appendRow(['admin', '1234', 'admin']);
  }
  return sheet;
}

function parseCheckbox_(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0 || val === '' || val == null) return false;
  const s = val.toString().trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === '✓' || s === 'checked';
}

function fixGregorianDate_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return d;
  if (d.getFullYear() > 2400) {
    return new Date(
      d.getFullYear() - 543, d.getMonth(), d.getDate(),
      d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
    );
  }
  return d;
}

function normalizeOutageDate_(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return fixGregorianDate_(val).toISOString();
  }
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return fixGregorianDate_(d).toISOString();
  }
  const th = parseThaiDate_(val);
  if (th) return fixGregorianDate_(th).toISOString();
  const d = new Date(val);
  if (!isNaN(d.getTime())) return fixGregorianDate_(d).toISOString();
  return null;
}

function parseOutageDateForSheet_(val) {
  const iso = normalizeOutageDate_(val);
  if (!iso) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  return new Date(iso);
}

function validateHttpUrl_(url) {
  if (url == null || url === '') return '';
  url = url.toString().trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น');
  }
  return url;
}

const LOCATIONS_CACHE_KEY = 'loc_v2';
const LOCATIONS_CACHE_TTL = 180; // 3 นาที — มือถือได้ข้อมูลเร็วขึ้นมาก

function cachePutChunks_(baseKey, json, ttl) {
  const cache = CacheService.getScriptCache();
  const size = 90000;
  const n = Math.ceil(json.length / size);
  if (n < 1 || n > 25) return false;
  const payload = {};
  payload[baseKey + '_n'] = String(n);
  for (let i = 0; i < n; i++) {
    payload[baseKey + '_' + i] = json.substring(i * size, (i + 1) * size);
  }
  cache.putAll(payload, ttl);
  return true;
}

function cacheGetChunks_(baseKey) {
  const cache = CacheService.getScriptCache();
  const nStr = cache.get(baseKey + '_n');
  if (!nStr) return null;
  const n = parseInt(nStr, 10);
  if (!n || n < 1) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(baseKey + '_' + i);
  const parts = cache.getAll(keys);
  let json = '';
  for (let i = 0; i < n; i++) {
    const p = parts[baseKey + '_' + i];
    if (p == null) return null;
    json += p;
  }
  return json;
}

function invalidateLocationsCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const nStr = cache.get(LOCATIONS_CACHE_KEY + '_n');
    const keys = [LOCATIONS_CACHE_KEY + '_n'];
    const n = parseInt(nStr, 10) || 0;
    for (let i = 0; i < n; i++) keys.push(LOCATIONS_CACHE_KEY + '_' + i);
    cache.removeAll(keys);
  } catch (e) { /* ignore */ }
}

function getLocationsUncached_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  data.shift();

  return data.map((row, index) => {
    let lat = null, lng = null;
    if (row[5] && typeof row[5] === 'string' && row[5].includes(',')) {
      const parts = row[5].split(',');
      lat = parseFloat(parts[0].trim());
      lng = parseFloat(parts[1].trim());
    }

    return {
      row: index + 2,
      phase: row[0], seq: row[1], link: row[2], peaRegion: row[3], name: row[4], latlngRaw: row[5],
      lat: lat, lng: lng,
      pea1Name: row[6], pea1Phone: row[7], pea1Pos: row[8],
      pea2Name: row[9], pea2Phone: row[10], pea2Pos: row[11],
      comp1Name: row[12], comp1Phone: row[13], comp2Name: row[14], comp2Phone: row[15],
      kwp: row[16], caNum: row[17], meterNum: row[18], pwaRegion: row[19],
      linkPEA: row[20] || ''
    };
  }).filter(loc => loc.lat !== null && loc.lng !== null);
}

/** ดึงข้อมูลทั้งหมด — มี cache ฝั่งเซิร์ฟเวอร์เพื่อมือถือโหลดเร็ว */
function getLocations() {
  try {
    const raw = cacheGetChunks_(LOCATIONS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  const result = getLocationsUncached_();
  try {
    cachePutChunks_(LOCATIONS_CACHE_KEY, JSON.stringify(result), LOCATIONS_CACHE_TTL);
  } catch (e) { /* ignore cache write */ }
  return result;
}

function authenticate(username, password) {
  const ss = getSpreadsheet_();
  username = (username || '').toString().trim();
  password = (password || '').toString();

  if (username === '' || username.toLowerCase() === 'guest') {
    return { success: false, message: 'กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน' };
  }

  let userSheet = ss.getSheetByName(USERS_SHEET);
  if (!userSheet) {
    if (username === 'admin' && password === '1234') {
      const sess = createSession_('admin', 'admin');
      return {
        success: true, role: 'admin', sessionToken: sess.token, expire: sess.expire,
        message: 'เข้าสู่ระบบสำเร็จ (แอดมินหลัก)'
      };
    }
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!' };
  }

  ensureUsersSheet_(ss);
  const data = ss.getSheetByName(USERS_SHEET).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === username && data[i][1].toString() === password) {
      const role = data[i][2].toString();
      const roleLabel = role === 'admin' ? 'แอดมินหลัก' : (role === 'editor' ? 'แอดมินรอง' : role);
      const sess = createSession_(username, role);
      return {
        success: true, role: role, sessionToken: sess.token, expire: sess.expire,
        message: 'เข้าสู่ระบบสำเร็จ (' + roleLabel + ')'
      };
    }
  }
  return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!' };
}

function updateLocation(data, sessionToken) {
  assertAdminFromSession_(sessionToken);

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

  const rowData = [
    data.phase, data.seq, data.link, data.peaRegion, data.name, data.latlngRaw,
    data.pea1Name, data.pea1Phone, data.pea1Pos, data.pea2Name, data.pea2Phone, data.pea2Pos,
    data.comp1Name, data.comp1Phone, data.comp2Name, data.comp2Phone,
    data.kwp, data.caNum, data.meterNum, data.pwaRegion, data.linkPEA
  ];

  sheet.getRange(data.row, 1, 1, 21).setValues([rowData]);
  invalidateLocationsCache_();
  logAction('แก้ไขข้อมูล: ' + data.name + ' (แถวที่ ' + data.row + ')');
  return true;
}

function logAction(detail) {
  const ss = getSpreadsheet_();
  let logSheet = ss.getSheetByName('Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('Log');
    logSheet.appendRow(['Timestamp', 'Action Detail']);
    logSheet.getRange('A1:B1').setFontWeight('bold').setBackground('#dcedc1');
  }
  logSheet.appendRow([new Date(), detail]);
}

function getUsers(sessionToken) {
  assertAdminFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  const sheet = ensureUsersSheet_(ss);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  data.shift();
  return data.map(row => ({
    username: row[0].toString(),
    password: row[1].toString(),
    role: row[2].toString()
  }));
}

function createDeputyAdmin(username, password, sessionToken) {
  assertAdminFromSession_(sessionToken);
  username = (username || '').toString().trim();
  password = (password || '').toString().trim();
  if (!username || !password) throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
  if (username.toLowerCase() === 'admin') throw new Error('ไม่สามารถใช้ชื่อ admin ได้');

  const ss = getSpreadsheet_();
  const sheet = ensureUsersSheet_(ss);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === username) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว');
  }
  sheet.appendRow([username, password, 'editor']);
  logAction('สร้างแอดมินรอง: ' + username);
  return { success: true, message: 'สร้างแอดมินรองสำเร็จ' };
}

function deleteUserAccount(username, sessionToken) {
  assertAdminFromSession_(sessionToken);
  username = (username || '').toString().trim();
  if (!username || username.toLowerCase() === 'admin') throw new Error('ไม่สามารถลบบัญชีนี้ได้');

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) throw new Error('ไม่พบตารางผู้ใช้');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === username) {
      if (data[i][2].toString() === 'admin') throw new Error('ไม่สามารถลบแอดมินหลักได้');
      sheet.deleteRow(i + 1);
      logAction('ลบผู้ใช้: ' + username);
      return { success: true, message: 'ลบผู้ใช้สำเร็จ' };
    }
  }
  throw new Error('ไม่พบผู้ใช้ที่ต้องการลบ');
}

// --- ระบบแผนดับไฟ ---
const OUTAGE_HEADERS = ['ID', 'ProjectName', 'Start', 'End', 'Remark', 'FileURL', 'CheckVendor', 'CheckPEAPwa', 'CheckPEASite', 'CheckPEAPhone', 'CheckDone', 'SheetDetails'];

function ensureOutageSheet_(ss) {
  let sheet = ss.getSheetByName(OUTAGE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(OUTAGE_SHEET);
    sheet.appendRow(OUTAGE_HEADERS);
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim());
  if (headers[0] !== 'ID') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, OUTAGE_HEADERS.length).setValues([OUTAGE_HEADERS]);
    return sheet;
  }
  if (headers[7] === 'CheckPEA' && headers[8] === 'CheckDone') {
    sheet.insertColumnsAfter(8, 2);
    sheet.getRange(1, 8).setValue('CheckPEAPwa');
    sheet.getRange(1, 9).setValue('CheckPEASite');
    sheet.getRange(1, 10).setValue('CheckPEAPhone');
    sheet.getRange(1, 11).setValue('CheckDone');
  } else {
    OUTAGE_HEADERS.forEach((name, i) => {
      if (headers[i] !== name) sheet.getRange(1, i + 1).setValue(name);
    });
  }
  if (headers.length < OUTAGE_HEADERS.length || headers[11] !== 'SheetDetails') {
    if (sheet.getLastColumn() < OUTAGE_HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getLastColumn(), OUTAGE_HEADERS.length - sheet.getLastColumn());
    }
    sheet.getRange(1, 12).setValue('SheetDetails');
  }
  return sheet;
}

function isSyncedOutageId_(id) {
  return id != null && id.toString().indexOf('ext-') === 0;
}

function mapOutageRow_(row) {
  const migrated = row.length > 10;
  const id = row[0];
  const fromSheet = isSyncedOutageId_(id);
  const fileUrl = row[5] || '';
  let sheetDetails = {};
  const rawDetails = row[11];
  if (rawDetails) {
    try {
      sheetDetails = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails;
    } catch (ignore) {
      sheetDetails = {};
    }
  }
  return {
    id: id,
    projectName: row[1],
    start: normalizeOutageDate_(row[2]),
    end: normalizeOutageDate_(row[3]),
    remark: row[4] || '',
    fileUrl: fileUrl,
    checkVendor: parseCheckbox_(row[6]),
    checkPEAPwa: parseCheckbox_(row[7]),
    checkPEASite: migrated ? parseCheckbox_(row[8]) : false,
    checkPEAPhone: migrated ? parseCheckbox_(row[9]) : false,
    checkDone: parseCheckbox_(migrated ? row[10] : row[8]),
    sheetDetails: sheetDetails,
    fromSheet: fromSheet,
    sourceTitle: fromSheet ? OUTAGE_SOURCE_TITLE : '',
    sourceUrl: fromSheet ? OUTAGE_SOURCE_URL : ''
  };
}

function cellStr_(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Bangkok', 'd MMM yyyy');
  }
  return val.toString().replace(/\u00a0/g, ' ').trim();
}

const THAI_MONTH_MAP_ = {
  'ม.ค.': 0, 'มกราคม': 0,
  'ก.พ.': 1, 'กุมภาพันธ์': 1,
  'มี.ค.': 2, 'มีนาคม': 2,
  'เม.ย.': 3, 'เมษายน': 3,
  'พ.ค.': 4, 'พฤษภาคม': 4,
  'มิ.ย.': 5, 'มิถุนายน': 5,
  'ก.ค.': 6, 'กรกฎาคม': 6,
  'ส.ค.': 7, 'สิงหาคม': 7,
  'ก.ย.': 8, 'กันยายน': 8,
  'ต.ค.': 9, 'ตุลาคม': 9,
  'พ.ย.': 10, 'พฤศจิกายน': 10,
  'ธ.ค.': 11, 'ธันวาคม': 11
};

/** แปลงวันที่ไทย เช่น "4 ส.ค. 2569", "23 ก.ค. 69" → Date (local) หรือ null */
function parseThaiDate_(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    let y = raw.getFullYear();
    if (y > 2400) y -= 543;
    return new Date(y, raw.getMonth(), raw.getDate());
  }
  if (typeof raw === 'number' && isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const s = cellStr_(raw);
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*([ก-๙\.]+)\s*(\d{2,4})/);
  if (!m) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return null;
  }
  const day = parseInt(m[1], 10);
  let monthKey = m[2].replace(/\s+/g, '');
  if (monthKey.charAt(monthKey.length - 1) !== '.' && monthKey.length <= 4) {
    // keep as-is for full month names
  }
  let month = THAI_MONTH_MAP_[monthKey];
  if (month == null) {
    const withDot = monthKey.indexOf('.') >= 0 ? monthKey : (monthKey + '.');
    month = THAI_MONTH_MAP_[withDot];
  }
  if (month == null) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2500;
  if (year > 2400) year -= 543;
  const dt = new Date(year, month, day);
  if (isNaN(dt.getTime()) || dt.getDate() !== day) return null;
  return dt;
}

/** แปลงช่วงเวลา เช่น "22.30 น. – 02.00", "23.00 - 03.30" */
function parseTimeRange_(raw) {
  const s = cellStr_(raw);
  if (!s) return null;
  const parts = s.split(/\s*[-–—]\s*/);
  if (parts.length < 2) return null;
  const parseOne = function(t) {
    const m = t.replace(/น\.?/g, '').trim().match(/(\d{1,2})[.:](\d{2})/);
    if (!m) return null;
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  };
  const a = parseOne(parts[0]);
  const b = parseOne(parts[1]);
  if (!a || !b) return null;
  return { startH: a.h, startM: a.m, endH: b.h, endM: b.m };
}

/**
 * วันดับไฟใหม่ (N) ถ้ามี ไม่เช่นนั้น วันที่ดับไฟ (M) + ช่วงเวลา (O)
 * คืน { start: Date|'', end: Date|'' } — ว่างได้ถ้าไม่มีวัน
 */
function buildOutageStartEnd_(dateNewVal, dateVal, timeVal) {
  const base = parseThaiDate_(dateNewVal) || parseThaiDate_(dateVal);
  if (!base) return { start: '', end: '' };
  const tr = parseTimeRange_(timeVal);
  if (!tr) {
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0);
    const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 0);
    return { start: start, end: end };
  }
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), tr.startH, tr.startM, 0);
  let end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), tr.endH, tr.endM, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start: start, end: end };
}

function looksLikeOutageSourceSheet_(values) {
  if (!values || values.length < 2) return false;
  const maxScan = Math.min(values.length, 10);
  for (let r = 0; r < maxScan; r++) {
    const row = values[r];
    for (let c = 0; c < Math.min(row.length, 35); c++) {
      const t = cellStr_(row[c]);
      if (t === 'สถานที่' || t.indexOf('วันที่ดับไฟ') >= 0 || t.indexOf('วันดับไฟใหม่') >= 0) return true;
    }
  }
  return false;
}

/** หาแถวหัวตารางแล้วคืน index คอลัมน์ตามชื่อ (แท็บ NC/NE/S โครงไม่เหมือนกัน) */
function normOutageHeader_(t) {
  return cellStr_(t).replace(/\s+/g, ' ').trim().toLowerCase();
}

function assignOutageDetailCol_(map, key, col) {
  if (!map.detailCols) map.detailCols = {};
  if (map.detailCols[key] == null) map.detailCols[key] = col;
}

function mapOutageDetailColumns_(map, h, c) {
  if (h.indexOf('เลขที่หนังสือ') >= 0 && h.indexOf('tc') >= 0 && h.indexOf('ขอชื่อ') < 0 && h.indexOf('pea-pwa') < 0 && h.indexOf('pea-pea') < 0) {
    assignOutageDetailCol_(map, 'tcDocNo', c);
  } else if (h.indexOf('pea') >= 0 && h.indexOf('ได้รับหนังสือ') >= 0 && h.indexOf('tc') >= 0) {
    assignOutageDetailCol_(map, 'peaTcReceivedDate', c);
  } else if (h.indexOf('สถานะดับกระแส') >= 0) {
    assignOutageDetailCol_(map, 'powerStatus', c);
  } else if ((h.indexOf('หนังสือ pea-pwa') >= 0 || h.indexOf('หนังสือpea-pwa') >= 0) && h.indexOf('หมายเลข') < 0 && h.indexOf('ได้รับ') < 0) {
    assignOutageDetailCol_(map, 'peaPwaDoc', c);
  } else if (h.indexOf('หมายเลขหนังสือ') >= 0 && h.indexOf('pea-pwa') >= 0) {
    assignOutageDetailCol_(map, 'peaPwaDocNo', c);
  } else if (h.indexOf('pea-pwa') >= 0 && h.indexOf('ได้รับหนังสือ') >= 0) {
    assignOutageDetailCol_(map, 'peaPwaReceivedDate', c);
  } else if (h.indexOf('หนังสือ pea-pea') >= 0 && h.indexOf('หน้างาน') >= 0 && h.indexOf('หมายเลข') < 0 && h.indexOf('ได้รับ') < 0) {
    assignOutageDetailCol_(map, 'peaPeaSiteDoc', c);
  } else if (h.indexOf('หมายเลขหนังสือ') >= 0 && h.indexOf('pea-pea') >= 0 && h.indexOf('หน้างาน') >= 0) {
    assignOutageDetailCol_(map, 'peaPeaSiteDocNo', c);
  } else if (h.indexOf('pea-pea') >= 0 && h.indexOf('หน้างาน') >= 0 && h.indexOf('ได้รับหนังสือ') >= 0) {
    assignOutageDetailCol_(map, 'peaPeaSiteReceivedDate', c);
  } else if (h.indexOf('ผู้ประสานงาน pea') >= 0) {
    assignOutageDetailCol_(map, 'peaCoordinator', c);
  } else if (h.indexOf('ตำแหน่ง pea') >= 0) {
    assignOutageDetailCol_(map, 'peaPosition', c);
  } else if (h.indexOf('สังกัด pea') >= 0) {
    assignOutageDetailCol_(map, 'peaDept', c);
  } else if (h.indexOf('โทรประสาน') >= 0 && h.indexOf('กฟภ') >= 0) {
    assignOutageDetailCol_(map, 'peaPhoneEgat', c);
  } else if (h.indexOf('เบอร์ติดต่อ pea') >= 0) {
    assignOutageDetailCol_(map, 'peaContact', c);
  } else if (h.indexOf('ผู้ประสานงาน tc') >= 0) {
    assignOutageDetailCol_(map, 'tcCoordinator', c);
  } else if (h.indexOf('เบอร์ติดต่อ tc') >= 0) {
    assignOutageDetailCol_(map, 'tcContact', c);
  } else if (h.indexOf('หมายเลขหนังสือขอชื่อ') >= 0 || h.indexOf('ขอชื่อผู้ประสานงาน') >= 0) {
    assignOutageDetailCol_(map, 'coordRequestDocNo', c);
  } else if (h.indexOf('หน่วยงานที่แจ้งรายชื่อ') >= 0) {
    assignOutageDetailCol_(map, 'notifyAgency', c);
  }
}

function extractOutageSheetDetails_(row, map) {
  const details = {};
  const knownCols = new Set();
  if (map.seq != null) knownCols.add(map.seq);
  if (map.place != null) knownCols.add(map.place);
  if (map.date != null) knownCols.add(map.date);
  if (map.dateNew != null) knownCols.add(map.dateNew);
  if (map.time != null) knownCols.add(map.time);
  if (map.timeNew != null) knownCols.add(map.timeNew);

  const detailKeys = ['tcDocNo', 'peaTcReceivedDate', 'outageDate', 'outageTime', 'outageDateNew', 'outageTimeNew',
    'powerStatus', 'peaPwaDoc', 'peaPwaDocNo', 'peaPwaReceivedDate', 'peaPeaSiteDoc', 'peaPeaSiteDocNo',
    'peaPeaSiteReceivedDate', 'peaCoordinator', 'peaPosition', 'peaDept', 'peaPhoneEgat', 'peaContact',
    'tcCoordinator', 'tcContact', 'remark', 'coordRequestDocNo', 'notifyAgency'];

  if (map.date != null) {
    knownCols.add(map.date);
    const v = cellStr_(row[map.date]);
    if (v) details.outageDate = v;
  }
  if (map.time != null) {
    knownCols.add(map.time);
    const v = cellStr_(row[map.time]);
    if (v) details.outageTime = v;
  }
  if (map.dateNew != null) {
    knownCols.add(map.dateNew);
    const v = cellStr_(row[map.dateNew]);
    if (v) details.outageDateNew = v;
  }
  if (map.timeNew != null) {
    knownCols.add(map.timeNew);
    const v = cellStr_(row[map.timeNew]);
    if (v) details.outageTimeNew = v;
  }
  if (map.remark != null) {
    knownCols.add(map.remark);
    const v = cellStr_(row[map.remark]);
    if (v) details.remark = v;
  }

  const dc = map.detailCols || {};
  detailKeys.forEach(function(key) {
    if (details[key] != null) return;
    const col = dc[key];
    if (col == null) return;
    knownCols.add(col);
    const val = cellStr_(row[col]);
    if (val) details[key] = val;
  });

  const extras = [];
  const headers = map.headerLabels || [];
  for (let c = 0; c < headers.length; c++) {
    if (knownCols.has(c)) continue;
    const label = cellStr_(headers[c]);
    const val = cellStr_(row[c]);
    if (!label || !val) continue;
    if (label === 'สถานที่') continue;
    if (label.indexOf('ลำดับ') === 0) continue;
    extras.push({ label: label.replace(/\s+/g, ' ').trim(), value: val });
  }
  if (extras.length) details._extras = extras;
  return details;
}

function findOutageHeaderMap_(values) {
  const fallback = { headerRow: 1, seq: 0, place: 2, date: 12, dateNew: 13, time: 14, timeNew: null, remark: 29, detailCols: {}, headerLabels: [] };
  if (!values || !values.length) return fallback;
  for (let r = 0; r < Math.min(values.length, 12); r++) {
    const map = { headerRow: r, detailCols: {} };
    const row = values[r];
    map.headerLabels = row.map(function(cell) { return cellStr_(cell); });
    for (let c = 0; c < row.length; c++) {
      const t = cellStr_(row[c]).replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const h = normOutageHeader_(t);
      if (t === 'สถานที่') map.place = c;
      else if (h.indexOf('วันดับไฟใหม่') >= 0) map.dateNew = c;
      else if (h.indexOf('วันที่ดับไฟ') >= 0) map.date = c;
      else if (h.indexOf('ช่วงเวล') >= 0 && h.indexOf('ใหม่') >= 0) map.timeNew = c;
      else if ((h.indexOf('ช่วงเวลที่ดับไฟ') >= 0 || h.indexOf('ช่วงเวลาที่ดับไฟ') >= 0) && h.indexOf('ใหม่') < 0) map.time = c;
      else if (h.indexOf('ช่วงเวล') >= 0 && map.time == null && h.indexOf('ใหม่') < 0) map.time = c;
      else if (h.indexOf('หมายเหตุ') === 0) map.remark = c;
      else if ((h.indexOf('ลำดับ') >= 0 || h.indexOf('ดับไฟ') >= 0) && map.seq == null && c < 3) map.seq = c;
      mapOutageDetailColumns_(map, h, c);
    }
    if (map.place != null) {
      if (map.seq == null) map.seq = 0;
      if (map.date == null) map.date = 12;
      if (map.dateNew == null) map.dateNew = 13;
      if (map.time == null) map.time = 14;
      if (map.remark == null) map.remark = 29;
      return map;
    }
  }
  return fallback;
}

function isOutageSourceDataRow_(row, map) {
  if (!row || !map || map.place == null) return false;
  const place = cellStr_(row[map.place]);
  if (!place || place === 'สถานที่') return false;
  if (place.indexOf('แผนดับ') === 0 || place.indexOf('ลำดับ') >= 0) return false;
  if (place.length < 4) return false;
  // รับแถวที่มีชื่อสถานที่ แม้ไม่มีเลขลำดับ (บางแถวใน NE ว่าง)
  return true;
}

function normalizePlaceKey_(name) {
  return cellStr_(name)
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** ปี พ.ศ. 2568 (= ค.ศ. 2025) และเก่ากว่า — ไม่ดึง/ไม่แสดงในแผนดับไฟ */
function isOutageYear2568OrOlder_(startVal) {
  if (startVal == null || startVal === '') return false;
  const d = startVal instanceof Date ? startVal : new Date(startVal);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() <= 2025;
}

/** ID คงที่ต่อแถวในชีท — ไม่ใช้เลขลำดับเพราะในชีทมีหลายบล็อกลำดับซ้ำกัน */
function buildSyncedOutageId_(sheetId, rowIndex1Based) {
  return 'ext-' + sheetId + '-r' + rowIndex1Based;
}

function collectSourceOutageRows_() {
  const srcSs = getOutageSourceSs_();
  const sheets = srcSs.getSheets();
  const collected = [];
  const seenIds = {};
  const seenPlaces = {};

  sheets.forEach(function(srcSheet) {
    const lastRow = srcSheet.getLastRow();
    const lastCol = srcSheet.getLastColumn();
    if (lastRow < 2 || lastCol < 3) return;

    // ดูหัวตารางก่อน — ข้ามแท็บที่ไม่ใช่แผนดับไฟ โดยไม่โหลดทั้งชีท
    const peekRows = Math.min(lastRow, 12);
    const peekCols = Math.min(Math.max(lastCol, 3), 40);
    const peek = srcSheet.getRange(1, 1, peekRows, peekCols).getValues();
    if (!looksLikeOutageSourceSheet_(peek)) return;

    const useCol = Math.min(Math.max(lastCol, 3), 40);
    const values = (lastRow <= peekRows && useCol <= peekCols)
      ? peek
      : srcSheet.getRange(1, 1, lastRow, useCol).getValues();

    const map = findOutageHeaderMap_(values);
    const sheetId = srcSheet.getSheetId();

    for (let r = map.headerRow + 1; r < values.length; r++) {
      const row = values[r];
      if (!isOutageSourceDataRow_(row, map)) continue;
      const place = cellStr_(row[map.place]);
      const placeKey = normalizePlaceKey_(place);
      const id = buildSyncedOutageId_(sheetId, r + 1);
      if (seenIds[id]) continue;

      const range = buildOutageStartEnd_(
        map.dateNew != null ? row[map.dateNew] : '',
        map.date != null ? row[map.date] : '',
        map.time != null ? row[map.time] : ''
      );
      // ข้ามชุดเก่าปี 68 (และก่อนหน้านั้น)
      if (range.start && isOutageYear2568OrOlder_(range.start)) continue;

      // ชื่อซ้ำในชีทเดียวกัน: เก็บแถวล่างสุด (ชุดใหม่กว่ามักอยู่ล่าง)
      if (placeKey && seenPlaces[sheetId + ':' + placeKey] != null) {
        const prevIdx = seenPlaces[sheetId + ':' + placeKey];
        collected[prevIdx] = null;
      }

      const remark = map.remark != null ? cellStr_(row[map.remark]) : '';
      const sheetDetails = extractOutageSheetDetails_(row, map);
      const entry = {
        id: id,
        projectName: place,
        placeKey: placeKey,
        start: range.start === '' ? '' : range.start,
        end: range.end === '' ? '' : range.end,
        remark: remark,
        sheetDetails: sheetDetails
      };
      seenIds[id] = true;
      if (placeKey) seenPlaces[sheetId + ':' + placeKey] = collected.length;
      collected.push(entry);
    }
  });

  return collected.filter(function(x) { return !!x; });
}

/** ตรวจแท็บชีทต้นทาง — ใช้หาว่าอ่านแท็บไหนอยู่ */
function debugOutageSourceSheets_() {
  const srcSs = getOutageSourceSs_();
  const sheets = srcSs.getSheets();
  const findNames = ['ชัยบาดาล', 'บ้านหมี่', 'ลพบุรี', 'กุดตาเพชร', 'เกาะขนุน', 'บ้านบอน'];
  const found = {};
  findNames.forEach(function(n) { found[n] = []; });

  const collected = collectSourceOutageRows_();
  const sheetInfos = sheets.map(function(s) {
    const lastRow = s.getLastRow();
    const lastCol = s.getLastColumn();
    let matched = false;
    let dataRows = 0;
    let samples = [];
    if (lastRow >= 1 && lastCol >= 1) {
      const values = s.getRange(1, 1, lastRow, Math.min(Math.max(lastCol, 3), 35)).getValues();
      matched = looksLikeOutageSourceSheet_(values);
      const map = findOutageHeaderMap_(values);
      for (let r = map.headerRow + 1; r < values.length; r++) {
        if (!isOutageSourceDataRow_(values[r], map)) continue;
        dataRows++;
        const place = cellStr_(values[r][map.place]);
        if (samples.length < 5) samples.push(place);
        findNames.forEach(function(n) {
          if (place.indexOf(n) >= 0) {
            found[n].push({
              sheet: s.getName(),
              row: r + 1,
              place: place,
              id: buildSyncedOutageId_(s.getSheetId(), r + 1),
              date: cellStr_(values[r][map.date]),
              time: cellStr_(values[r][map.time])
            });
          }
        });
      }
    }
    return { name: s.getName(), sheetId: s.getSheetId(), rows: lastRow, matched: matched, dataRows: dataRows, samples: samples };
  });

  return {
    spreadsheetName: srcSs.getName(),
    collected: collected.length,
    sampleCollected: collected.filter(function(r) {
      return /ชัยบาดาล|บ้านหมี่|ลพบุรี|บ้านบอน/.test(r.projectName || '');
    }).slice(0, 10),
    found: found,
    sheets: sheetInfos
  };
}

/**
 * ซิงก์ชีทกำหนดการ → OutagePlan
 * ชีทชนะชื่อ/วัน/หมายเหตุ; คง FileURL + checkbox ของแอป
 * รวมแถวที่เคยสร้างในแอปถ้าชื่อสถานที่ตรงกัน (คง checkbox)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destSheet
 * @param {Array=} precollected ถ้าส่งมาแล้วจะไม่เปิดชีทต้นทางซ้ำ
 */
function syncOutagesFromSource_(destSheet, precollected) {
  const sourceRows = precollected || collectSourceOutageRows_();
  const data = destSheet.getDataRange().getValues();
  const byId = {};
  const manualByPlace = {};
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0] != null ? data[i][0].toString() : '';
    if (!id) continue;
    byId[id] = data[i];
    if (!isSyncedOutageId_(id)) {
      const key = normalizePlaceKey_(data[i][1]);
      if (key && !manualByPlace[key]) manualByPlace[key] = data[i];
    }
  }

  // แถว ext เก่าที่ id แบบเดิม (ext-0-1) — ย้าย checkbox ตามชื่อสถานที่
  const legacyByPlace = {};
  Object.keys(byId).forEach(function(id) {
    if (!isSyncedOutageId_(id)) return;
    if (/-r\d+$/.test(id)) return; // id ใหม่แล้ว
    const key = normalizePlaceKey_(byId[id][1]);
    if (key && !legacyByPlace[key]) legacyByPlace[key] = byId[id];
  });

  const newData = [OUTAGE_HEADERS];
  const usedManual = {};

  sourceRows.forEach(function(src) {
    let old = byId[src.id];
    if (!old && src.placeKey && manualByPlace[src.placeKey]) {
      old = manualByPlace[src.placeKey];
      usedManual[old[0].toString()] = true;
    }
    if (!old && src.placeKey && legacyByPlace[src.placeKey]) {
      old = legacyByPlace[src.placeKey];
    }
    newData.push([
      src.id,
      src.projectName,
      src.start === '' ? '' : src.start,
      src.end === '' ? '' : src.end,
      src.remark || '',
      old ? (old[5] || '') : '',
      old ? parseCheckbox_(old[6]) : false,
      old ? parseCheckbox_(old[7]) : false,
      old ? parseCheckbox_(old[8]) : false,
      old ? parseCheckbox_(old[9]) : false,
      old ? parseCheckbox_(old[10]) : false,
      JSON.stringify(src.sheetDetails || {})
    ]);
  });

  // คงแถวแอปที่ไม่ได้จับคู่กับชีท
  Object.keys(byId).forEach(function(id) {
    if (isSyncedOutageId_(id)) return;
    if (usedManual[id]) return;
    const row = byId[id];
    newData.push([
      row[0], row[1], row[2], row[3], row[4] || '', row[5] || '',
      parseCheckbox_(row[6]), parseCheckbox_(row[7]), parseCheckbox_(row[8]),
      parseCheckbox_(row[9]), parseCheckbox_(row[10]),
      row[11] || ''
    ]);
  });

  const lastRow = Math.max(destSheet.getLastRow(), 1);
  const lastCol = Math.max(destSheet.getLastColumn(), OUTAGE_HEADERS.length);
  if (lastRow >= 1) destSheet.getRange(1, 1, lastRow, lastCol).clearContent();
  destSheet.getRange(1, 1, newData.length, OUTAGE_HEADERS.length).setValues(newData);
  return sourceRows.length;
}

/** เลยวันสิ้นสุดที่ตั้งไว้แล้วยังไม่เคย mark เสร็จ → ตั้ง CheckDone อัตโนมัติ (เขียนครั้งเดียวทั้งคอลัมน์) */
function autoCompletePastOutages_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  const now = new Date();
  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    if (parseCheckbox_(data[i][10])) continue;
    const endIso = normalizeOutageDate_(data[i][3]);
    if (!endIso) continue;
    const end = new Date(endIso);
    if (isNaN(end.getTime()) || end >= now) continue;
    data[i][10] = true;
    updated++;
  }
  if (updated > 0) {
    const colValues = data.slice(1).map(function(row) { return [!!parseCheckbox_(row[10])]; });
    sheet.getRange(2, 11, data.length, 11).setValues(colValues);
  }
  return updated;
}

function readOutagesMapped_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  data.shift();
  return data.map(mapOutageRow_).filter(function(o) {
    if (o.id == null || o.id === '' || !cellStr_(o.projectName)) return false;
    // ไม่แสดงงานปี 68 และเก่ากว่า
    if (isOutageYear2568OrOlder_(o.start)) return false;
    return true;
  });
}

/** โหลดรายการจาก OutagePlan อย่างเดียว — เร็ว ไม่ซิงก์ชีทภายนอก */
function getOutages() {
  const ss = getSpreadsheet_();
  const sheet = ensureOutageSheet_(ss);
  return readOutagesMapped_(sheet);
}

const OUTAGE_SYNC_CACHE_KEY = 'outage_src_sync_v1';
const OUTAGE_SYNC_TTL_SEC = 300; // 5 นาที — ลดการเปิดชีทภายนอกซ้ำ; กด「รีเฟรชจากชีท」ได้ทันที
const OUTAGE_SYNC_SOFT_LOCK_KEY = 'outage_src_sync_running';

/**
 * ซิงก์จากชีทกำหนดการแล้วคืนรายการ
 * force=true บังคับซิงก์; ถ้าไม่บังคับและเพิ่งซิงก์ภายใน TTL จะข้าม
 * อ่านชีทต้นทางนอก lock — ถือ ScriptLock เฉพาะตอนเขียน OutagePlan เพื่อไม่ชนกับซิงก์อื่นนานๆ
 */
function refreshOutagesFromSource(force) {
  const wantForce = !!force;
  const cache = CacheService.getScriptCache();
  if (!wantForce && cache.get(OUTAGE_SYNC_CACHE_KEY)) {
    return { synced: false, outages: getOutages(), sourceTitle: OUTAGE_SOURCE_TITLE, sourceUrl: OUTAGE_SOURCE_URL };
  }

  // soft-lock กันเรียกซ้ำซ้อนจากหลายแท็บ (ไม่ใช้ error หลอกผู้ใช้)
  if (cache.get(OUTAGE_SYNC_SOFT_LOCK_KEY)) {
    return { synced: false, outages: getOutages(), sourceTitle: OUTAGE_SOURCE_TITLE, sourceUrl: OUTAGE_SOURCE_URL };
  }
  cache.put(OUTAGE_SYNC_SOFT_LOCK_KEY, '1', 120);

  try {
    if (!wantForce && cache.get(OUTAGE_SYNC_CACHE_KEY)) {
      return { synced: false, outages: getOutages(), sourceTitle: OUTAGE_SOURCE_TITLE, sourceUrl: OUTAGE_SOURCE_URL };
    }

    let sourceRows;
    try {
      sourceRows = collectSourceOutageRows_();
    } catch (e) {
      Logger.log('outage sync read failed: ' + e.message);
      try { logAction('ซิงก์แผนดับไฟล้มเหลว (อ่านชีท): ' + e.message); } catch (ignore) {}
      return {
        synced: false,
        error: friendlyOutageSheetError_(e),
        outages: getOutages(),
        sourceTitle: OUTAGE_SOURCE_TITLE,
        sourceUrl: OUTAGE_SOURCE_URL
      };
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      // ระบบอื่นกำลังเขียนชีทหลัก — คืนข้อมูลเดิมโดยไม่โชว์ error
      return { synced: false, outages: getOutages(), sourceTitle: OUTAGE_SOURCE_TITLE, sourceUrl: OUTAGE_SOURCE_URL };
    }
    try {
      if (!wantForce && cache.get(OUTAGE_SYNC_CACHE_KEY)) {
        return { synced: false, outages: getOutages(), sourceTitle: OUTAGE_SOURCE_TITLE, sourceUrl: OUTAGE_SOURCE_URL };
      }
      const ss = getSpreadsheet_();
      const sheet = ensureOutageSheet_(ss);
      try {
        const n = syncOutagesFromSource_(sheet, sourceRows);
        autoCompletePastOutages_(sheet);
        cache.put(OUTAGE_SYNC_CACHE_KEY, String(Date.now()), OUTAGE_SYNC_TTL_SEC);
        return {
          synced: true,
          count: n,
          outages: readOutagesMapped_(sheet),
          sourceTitle: OUTAGE_SOURCE_TITLE,
          sourceUrl: OUTAGE_SOURCE_URL
        };
      } catch (e) {
        Logger.log('outage sync write failed: ' + e.message);
        try { logAction('ซิงก์แผนดับไฟล้มเหลว: ' + e.message); } catch (ignore) {}
        return {
          synced: false,
          error: friendlyOutageSheetError_(e),
          outages: readOutagesMapped_(sheet),
          sourceTitle: OUTAGE_SOURCE_TITLE,
          sourceUrl: OUTAGE_SOURCE_URL
        };
      }
    } finally {
      lock.releaseLock();
    }
  } finally {
    try { cache.remove(OUTAGE_SYNC_SOFT_LOCK_KEY); } catch (ignore) {}
  }
}

function saveOutageData(formObj, sessionToken) {
  assertOutageFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  const sheet = ensureOutageSheet_(ss);
  const fileUrl = validateHttpUrl_(formObj.fileUrl || formObj.existingFileUrl || '');

  let startDate = '';
  let endDate = '';
  const hasDates = !!(formObj.start && formObj.end);
  if (hasDates) {
    startDate = parseOutageDateForSheet_(formObj.start);
    endDate = parseOutageDateForSheet_(formObj.end);
    if (endDate < startDate) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
  } else if (!(formObj.id && isSyncedOutageId_(formObj.id))) {
    // รายการที่สร้างในแอปต้องมีวัน — รายการจากชีทว่างวันได้
    throw new Error('กรุณาระบุวันเริ่มและวันสิ้นสุด');
  }

  if (formObj.id) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === formObj.id.toString()) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[
          formObj.projectName,
          startDate === '' ? '' : startDate,
          endDate === '' ? '' : endDate,
          formObj.remark || '',
          fileUrl
        ]]);
        if (isSyncedOutageId_(formObj.id)) {
          if (formObj.sheetDetails) formObj.sheetDetails.remark = formObj.remark || '';
          try {
            writeOutageBackToSource_(formObj.id, formObj, startDate, endDate);
            CacheService.getScriptCache().remove(OUTAGE_SYNC_CACHE_KEY);
          } catch (e) {
            logAction('บันทึกแผนดับไฟแล้ว แต่เขียนกลับชีทต้นทางไม่สำเร็จ: ' + e.message);
            return { success: true, message: 'บันทึกในแอปแล้ว แต่เขียนกลับชีทไม่สำเร็จ: ' + e.message };
          }
        }
        const sheetDetailsStr = formObj.sheetDetails
          ? JSON.stringify(formObj.sheetDetails)
          : (data[i][11] != null ? data[i][11].toString() : '');
        sheet.getRange(i + 1, 12).setValue(sheetDetailsStr);
        logAction('แก้ไขแผนดับไฟ: ' + formObj.projectName);
        return { success: true, message: isSyncedOutageId_(formObj.id) ? 'อัปเดตแล้ว (แอป + ชีทกำหนดการ)' : 'อัปเดตข้อมูลสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
  }

  if (!hasDates) throw new Error('กรุณาระบุวันเริ่มและวันสิ้นสุด');
  sheet.appendRow([new Date().getTime().toString(), formObj.projectName, startDate, endDate, formObj.remark || '', fileUrl, false, false, false, false, false, '']);
  logAction('เพิ่มแผนดับไฟ: ' + formObj.projectName);
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
}

function parseSyncedOutageRowRef_(id) {
  const m = String(id || '').match(/^ext-(\d+)-r(\d+)$/);
  if (!m) return null;
  return { sheetId: Number(m[1]), row: Number(m[2]) };
}

function formatThaiDateForSheet_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
  const day = Number(Utilities.formatDate(d, tz, 'd'));
  const monthIdx = Number(Utilities.formatDate(d, tz, 'M')) - 1;
  const year = Number(Utilities.formatDate(d, tz, 'yyyy')) + 543;
  return day + ' ' + months[monthIdx] + ' ' + year;
}

const THAI_MONTHS_FULL_INSP_ = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function inspectionChristianYear_(d) {
  let y = d.getFullYear();
  if (y > 2400) y -= 543;
  return y;
}

function inspectionNormalizeBeYear_(beYear) {
  if (beYear >= 3000) return beYear - 543;
  return beYear;
}

/** แสดงวันที่แผนส่งมอบ/ส่งมอบจริง: 10 สิงหาคม 2569 */
function formatInspectionDateDisplay_(val) {
  if (val == null || val === '') return '';
  const s = cellStr_(val).replace(/\s+/g, ' ').trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    if (!isNaN(d.getTime())) {
      return d.getDate() + ' ' + THAI_MONTHS_FULL_INSP_[d.getMonth()] + ' ' + (inspectionChristianYear_(d) + 543);
    }
  }
  const m = s.match(/^(\d{1,2})\s+([ก-๙][ก-๙\.]*)\s+(\d{4})$/);
  if (m) {
    const d = parseThaiDate_(s);
    if (d) {
      const beYear = inspectionNormalizeBeYear_(parseInt(m[3], 10));
      return d.getDate() + ' ' + THAI_MONTHS_FULL_INSP_[d.getMonth()] + ' ' + beYear;
    }
  }
  const d = parseThaiDate_(val);
  if (!d) return s;
  return d.getDate() + ' ' + THAI_MONTHS_FULL_INSP_[d.getMonth()] + ' ' + (inspectionChristianYear_(d) + 543);
}

function formatTimeRangeForSheet_(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return '';
  const tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
  const fmt = function(d) { return Utilities.formatDate(d, tz, 'HH.mm') + ' น.'; };
  return fmt(start) + ' – ' + fmt(end);
}

/** เขียนชื่อ/วัน/หมายเหตุ/รายละเอียดชีทกลับไปชีทกำหนดการ (สองทาง) */
function writeOutageSheetDetailsToSource_(srcSheet, ref, map, sheetDetails) {
  const sd = sheetDetails || {};
  const dc = map.detailCols || {};
  const detailKeys = ['tcDocNo', 'peaTcReceivedDate', 'outageDate', 'outageTime', 'outageDateNew', 'outageTimeNew',
    'powerStatus', 'peaPwaDoc', 'peaPwaDocNo', 'peaPwaReceivedDate', 'peaPeaSiteDoc', 'peaPeaSiteDocNo',
    'peaPeaSiteReceivedDate', 'peaCoordinator', 'peaPosition', 'peaDept', 'peaPhoneEgat', 'peaContact',
    'tcCoordinator', 'tcContact', 'coordRequestDocNo', 'notifyAgency'];

  if (sd.outageDate != null && map.date != null) srcSheet.getRange(ref.row, map.date + 1).setValue(sd.outageDate || '');
  if (sd.outageTime != null && map.time != null) srcSheet.getRange(ref.row, map.time + 1).setValue(sd.outageTime || '');
  if (sd.outageDateNew != null && map.dateNew != null) srcSheet.getRange(ref.row, map.dateNew + 1).setValue(sd.outageDateNew || '');
  if (sd.outageTimeNew != null && map.timeNew != null) srcSheet.getRange(ref.row, map.timeNew + 1).setValue(sd.outageTimeNew || '');

  detailKeys.forEach(function(key) {
    if (sd[key] == null) return;
    const col = dc[key];
    if (col == null) return;
    srcSheet.getRange(ref.row, col + 1).setValue(sd[key] || '');
  });

  const headers = map.headerLabels || [];
  (sd._extras || []).forEach(function(ex) {
    if (!ex || !ex.label) return;
    const want = cellStr_(ex.label).replace(/\s+/g, ' ').trim();
    for (let c = 0; c < headers.length; c++) {
      const h = cellStr_(headers[c]).replace(/\s+/g, ' ').trim();
      if (h === want) {
        srcSheet.getRange(ref.row, c + 1).setValue(ex.value || '');
        break;
      }
    }
  });
}

function writeOutageBackToSource_(id, formObj, startDate, endDate) {
  const ref = parseSyncedOutageRowRef_(id);
  if (!ref) throw new Error('รหัสรายการจากชีทไม่ถูกต้อง');

  const srcSs = getOutageSourceSs_();
  const sheets = srcSs.getSheets();
  let srcSheet = null;
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === ref.sheetId) {
      srcSheet = sheets[i];
      break;
    }
  }
  if (!srcSheet) throw new Error('ไม่พบแท็บชีทต้นทาง');

  const lastCol = Math.min(Math.max(srcSheet.getLastColumn(), 3), 40);
  const headerScanRows = Math.min(Math.max(srcSheet.getLastRow(), ref.row), Math.max(ref.row, 12));
  const values = srcSheet.getRange(1, 1, headerScanRows, lastCol).getValues();
  const map = findOutageHeaderMap_(values);

  if (map.place != null) srcSheet.getRange(ref.row, map.place + 1).setValue(formObj.projectName || '');
  if (map.remark != null) srcSheet.getRange(ref.row, map.remark + 1).setValue(formObj.remark || '');

  if (startDate && endDate) {
    const dateText = formatThaiDateForSheet_(startDate);
    const timeText = formatTimeRangeForSheet_(startDate, endDate);
    if (map.date != null) srcSheet.getRange(ref.row, map.date + 1).setValue(dateText);
    if (map.dateNew != null) srcSheet.getRange(ref.row, map.dateNew + 1).setValue('');
    if (map.time != null) srcSheet.getRange(ref.row, map.time + 1).setValue(timeText);
    if (map.timeNew != null) srcSheet.getRange(ref.row, map.timeNew + 1).setValue('');
    if (formObj.sheetDetails) {
      formObj.sheetDetails.outageDate = dateText;
      formObj.sheetDetails.outageTime = timeText;
      if (formObj.sheetDetails.outageDateNew != null) formObj.sheetDetails.outageDateNew = '';
      if (formObj.sheetDetails.outageTimeNew != null) formObj.sheetDetails.outageTimeNew = '';
    }
  } else {
    if (map.date != null) srcSheet.getRange(ref.row, map.date + 1).setValue('');
    if (map.dateNew != null) srcSheet.getRange(ref.row, map.dateNew + 1).setValue('');
    if (map.time != null) srcSheet.getRange(ref.row, map.time + 1).setValue('');
    if (map.timeNew != null) srcSheet.getRange(ref.row, map.timeNew + 1).setValue('');
  }

  if (formObj.sheetDetails) writeOutageSheetDetailsToSource_(srcSheet, ref, map, formObj.sheetDetails);
  return true;
}

function updateOutageStatus(id, field, isChecked, sessionToken) {
  assertOutageFromSession_(sessionToken);
  const ALLOWED = { checkVendor: 7, checkPEAPwa: 8, checkPEASite: 9, checkPEAPhone: 10, checkDone: 11 };
  if (!ALLOWED.hasOwnProperty(field)) throw new Error('ฟิลด์สถานะไม่ถูกต้อง');

  const ss = getSpreadsheet_();
  const sheet = ensureOutageSheet_(ss);
  const data = sheet.getDataRange().getValues();
  const colIndex = ALLOWED[field];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === id.toString()) {
      sheet.getRange(i + 1, colIndex).setValue(!!isChecked);
      return true;
    }
  }
  throw new Error('ไม่พบรายการดับไฟ');
}

function deleteOutage(id, sessionToken) {
  assertOutageFromSession_(sessionToken);
  if (isSyncedOutageId_(id)) {
    throw new Error('รายการจากชีทกำหนดการลบไม่ได้ — แก้หรือลบที่ชีทต้นทาง');
  }
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(OUTAGE_SHEET);
  if (!sheet) throw new Error('ไม่พบตารางแผนดับไฟ');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  throw new Error('ไม่พบรายการที่ต้องการลบ');
}

// --- แผนการเข้าตรวจรับงานเฟส3-4 ---
const INSPECTION_HEADERS = [
  'ID', 'Seq', 'Phase', 'Place', 'PwaBranch', 'PwaDistrict', 'PeaZone', 'PeaOffice',
  'HandoverPlan', 'HandoverRound', 'InspectSchedule', 'Inspectors', 'FileComment',
  'Committee', 'InspectLetterDate', 'PassLetterStatus', 'Visited', 'TcCoordinator', 'TcContact', 'Region'
];

const INSPECTION_SOURCE_COL_KEYS_ = [
  'seq', 'phase', 'place', 'pwaBranch', 'pwaDistrict', 'peaZone', 'peaOffice',
  'handoverPlan', 'handoverRound', 'inspectSchedule', 'inspectors', 'fileComment',
  'committee', 'inspectLetterDate', 'passLetterStatus', 'visited', 'tcCoordinator', 'tcContact'
];

function ensureInspectionSheet_(ss) {
  let sheet = ss.getSheetByName(INSPECTION_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(INSPECTION_SHEET);
    sheet.appendRow(INSPECTION_HEADERS);
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim());
  if (headers[0] !== 'ID') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setValues([INSPECTION_HEADERS]);
  } else {
    INSPECTION_HEADERS.forEach((name, i) => {
      if (headers[i] !== name) sheet.getRange(1, i + 1).setValue(name);
    });
  }
  if (headers.length < INSPECTION_HEADERS.length || headers[19] !== 'Region') {
    if (sheet.getLastColumn() < INSPECTION_HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getLastColumn(), INSPECTION_HEADERS.length - sheet.getLastColumn());
    }
    sheet.getRange(1, 20).setValue('Region');
  }
  return sheet;
}

function isSyncedInspectionId_(id) {
  return id != null && id.toString().indexOf('insp-') === 0;
}

function buildSyncedInspectionId_(sheetId, rowIndex1Based) {
  return 'insp-' + sheetId + '-r' + rowIndex1Based;
}

function parseSyncedInspectionRowRef_(id) {
  const m = String(id || '').match(/^insp-(\d+)-r(\d+)$/);
  if (!m) return null;
  return { sheetId: Number(m[1]), row: Number(m[2]) };
}

function parseInspectionVisited_(val) {
  if (val === true || val === false) return val;
  const s = cellStr_(val).toLowerCase();
  if (!s) return false;
  if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s.indexOf('ไปแล้ว') >= 0) return true;
  if (s === 'false' || s === 'no' || s === '0') return false;
  return s === 'TRUE';
}

function mapInspectionRow_(row) {
  const id = row[0];
  const fromSheet = isSyncedInspectionId_(id);
  return {
    id: id,
    seq: cellStr_(row[1]),
    phase: cellStr_(row[2]),
    place: cellStr_(row[3]),
    pwaBranch: cellStr_(row[4]),
    pwaDistrict: cellStr_(row[5]),
    peaZone: cellStr_(row[6]),
    peaOffice: cellStr_(row[7]),
    handoverPlan: formatInspectionDateDisplay_(row[8]),
    handoverRound: formatInspectionDateDisplay_(row[9]),
    inspectSchedule: formatInspectionDateDisplay_(row[10]),
    inspectors: cellStr_(row[11]),
    fileComment: cellStr_(row[12]),
    committee: cellStr_(row[13]),
    inspectLetterDate: cellStr_(row[14]),
    passLetterStatus: cellStr_(row[15]),
    visited: parseInspectionVisited_(row[16]),
    tcCoordinator: cellStr_(row[17]),
    tcContact: cellStr_(row[18]),
    region: cellStr_(row[19]) || '',
    fromSheet: fromSheet,
    sourceTitle: fromSheet ? INSPECTION_SOURCE_TITLE : '',
    sourceUrl: fromSheet ? INSPECTION_SOURCE_URL : ''
  };
}

function readInspectionsMapped_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).filter(r => r[3]).map(mapInspectionRow_);
}

function findInspectionHeaderMap_(values) {
  const fallback = {
    headerRow: 0,
    cols: { seq: 0, phase: 1, place: 2, pwaBranch: 3, pwaDistrict: 4, peaZone: 5, peaOffice: 6,
      handoverPlan: 7, handoverRound: 8, inspectSchedule: 9, inspectors: 10, fileComment: 11,
      committee: 12, inspectLetterDate: 13, passLetterStatus: 14, visited: 15, tcCoordinator: 16, tcContact: 17 }
  };
  if (!values || !values.length) return fallback;
  for (let r = 0; r < Math.min(values.length, 8); r++) {
    const row = values[r];
    const map = { headerRow: r, cols: {} };
    for (let c = 0; c < row.length; c++) {
      const t = cellStr_(row[c]).replace(/\s+/g, ' ').trim();
      const h = t.toLowerCase();
      if (!t) continue;
      if (t === 'ลำดับที่' || h.indexOf('ลำดับ') === 0) map.cols.seq = c;
      else if (h === 'phase' || t === 'Phase') map.cols.phase = c;
      else if (t === 'สถานที่') map.cols.place = c;
      else if (h.indexOf('กปภ') >= 0 && h.indexOf('สาขา') >= 0) map.cols.pwaBranch = c;
      else if (h.indexOf('กปภ') >= 0 && h.indexOf('เขต') >= 0) map.cols.pwaDistrict = c;
      else if (h.indexOf('กฟภ') >= 0 && h.indexOf('ความรับผิดชอบ') >= 0) map.cols.peaZone = c;
      else if (h.indexOf('แผนส่งมอบงาน') >= 0) map.cols.handoverPlan = c;
      else if (h.indexOf('รอบส่งมอบงานจริง') >= 0) map.cols.handoverRound = c;
      else if (h.indexOf('กำหนดตรวจงาน') >= 0) map.cols.inspectSchedule = c;
      else if (h.indexOf('รายชื่อคนเข้าตรวจ') >= 0) map.cols.inspectors = c;
      else if (h.indexOf('file comment') >= 0) map.cols.fileComment = c;
      else if (h.indexOf('คณะกรรมการตรวจรับ') >= 0) map.cols.committee = c;
      else if (h.indexOf('วันตรวจงาน') >= 0 || h.indexOf('หนังสือตรวจรับ') >= 0) map.cols.inspectLetterDate = c;
      else if (h.indexOf('ใบนำตัว') >= 0) map.cols.passLetterStatus = c;
      else if (h.indexOf('ไปแล้ว') >= 0) map.cols.visited = c;
      else if (h.indexOf('ผู้ประสานงาน tc') >= 0) map.cols.tcCoordinator = c;
      else if (h.indexOf('เบอร์ติดต่อ tc') >= 0) map.cols.tcContact = c;
      else if (h.indexOf('กฟจ') >= 0 || h.indexOf('กฟน') >= 0) {
        if (map.cols.peaOffice == null && map.cols.peaZone != null && c === map.cols.peaZone + 1) map.cols.peaOffice = c;
      }
    }
    if (map.cols.place != null) {
      if (map.cols.peaOffice == null && map.cols.peaZone != null) map.cols.peaOffice = map.cols.peaZone + 1;
      return map;
    }
  }
  return fallback;
}

function isInspectionSourceDataRow_(row, map) {
  if (!row || !map || !map.cols || map.cols.place == null) return false;
  const place = cellStr_(row[map.cols.place]);
  if (!place || place === 'สถานที่') return false;
  if (place.indexOf('ลำดับ') >= 0) return false;
  return place.length >= 2;
}

function extractInspectionFieldsFromSourceRow_(row, map) {
  const cols = map.cols;
  const out = {};
  INSPECTION_SOURCE_COL_KEYS_.forEach(function(key) {
    const col = cols[key];
    if (col == null) { out[key] = ''; return; }
    if (key === 'visited') out[key] = parseInspectionVisited_(row[col]);
    else if (key === 'handoverPlan' || key === 'handoverRound' || key === 'inspectSchedule') out[key] = formatInspectionDateDisplay_(row[col]);
    else out[key] = cellStr_(row[col]);
  });
  return out;
}

function inspectionFieldsToLocalRow_(id, fields) {
  return [
    id,
    fields.seq || '',
    fields.phase || '',
    fields.place || '',
    fields.pwaBranch || '',
    fields.pwaDistrict || '',
    fields.peaZone || '',
    fields.peaOffice || '',
    fields.handoverPlan || '',
    fields.handoverRound || '',
    fields.inspectSchedule || '',
    fields.inspectors || '',
    fields.fileComment || '',
    fields.committee || '',
    fields.inspectLetterDate || '',
    fields.passLetterStatus || '',
    !!fields.visited,
    fields.tcCoordinator || '',
    fields.tcContact || '',
    (fields.region || '').toString().trim().toUpperCase()
  ];
}

function isInspectionRegionSheet_(name) {
  const n = (name || '').toString().trim().toUpperCase();
  return n === 'NC' || n === 'NE' || n === 'S';
}

function findInspectionSourceSheet_(srcSs, sheetId) {
  const sheets = srcSs.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) return sheets[i];
  }
  return null;
}

function collectSourceInspectionRows_() {
  const srcSs = SpreadsheetApp.openById(INSPECTION_SOURCE_SS_ID);
  const collected = [];
  srcSs.getSheets().forEach(function(srcSheet) {
    const sheetName = srcSheet.getName();
    if (!isInspectionRegionSheet_(sheetName)) return;
    const region = sheetName.trim().toUpperCase();
    const lastRow = srcSheet.getLastRow();
    const lastCol = Math.max(srcSheet.getLastColumn(), 18);
    if (lastRow < 2) return;
    const values = srcSheet.getRange(1, 1, lastRow, lastCol).getValues();
    const map = findInspectionHeaderMap_(values);
    const sheetId = srcSheet.getSheetId();
    for (let r = map.headerRow + 1; r < values.length; r++) {
      const row = values[r];
      if (!isInspectionSourceDataRow_(row, map)) continue;
      const fields = extractInspectionFieldsFromSourceRow_(row, map);
      fields.region = region;
      collected.push({
        id: buildSyncedInspectionId_(sheetId, r + 1),
        fields: fields,
        sourceRow: r + 1
      });
    }
  });
  return collected;
}

function syncInspectionsFromSource_(destSheet, precollected) {
  const rows = precollected || collectSourceInspectionRows_();
  const oldData = destSheet.getDataRange().getValues();
  const oldById = {};
  for (let i = 1; i < oldData.length; i++) {
    const id = oldData[i][0];
    if (id != null && id !== '') oldById[id.toString()] = mapInspectionRow_(oldData[i]);
  }
  const preserveKeys = ['inspectSchedule', 'inspectors', 'committee', 'inspectLetterDate', 'passLetterStatus', 'visited', 'fileComment', 'tcCoordinator', 'tcContact'];
  const newData = [INSPECTION_HEADERS];
  rows.forEach(function(item) {
    const old = oldById[item.id];
    if (old) {
      preserveKeys.forEach(function(key) {
        const v = old[key];
        if (v === true || (v != null && v !== '')) item.fields[key] = v;
      });
    }
    newData.push(inspectionFieldsToLocalRow_(item.id, item.fields));
  });
  destSheet.clearContents();
  destSheet.getRange(1, 1, newData.length, INSPECTION_HEADERS.length).setValues(newData);
  return rows.length;
}

function getInspectionPlans() {
  const ss = getSpreadsheet_();
  const sheet = ensureInspectionSheet_(ss);
  return readInspectionsMapped_(sheet);
}

const INSPECTION_SYNC_CACHE_KEY = 'inspection_src_sync_v1';
const INSPECTION_SYNC_TTL_SEC = 300;
const INSPECTION_SYNC_SOFT_LOCK_KEY = 'inspection_src_sync_running';

function refreshInspectionPlansFromSource(force) {
  const wantForce = !!force;
  const cache = CacheService.getScriptCache();
  if (!wantForce && cache.get(INSPECTION_SYNC_CACHE_KEY)) {
    return { synced: false, plans: getInspectionPlans(), sourceTitle: INSPECTION_SOURCE_TITLE, sourceUrl: INSPECTION_SOURCE_URL };
  }
  if (cache.get(INSPECTION_SYNC_SOFT_LOCK_KEY)) {
    return { synced: false, plans: getInspectionPlans(), sourceTitle: INSPECTION_SOURCE_TITLE, sourceUrl: INSPECTION_SOURCE_URL };
  }
  cache.put(INSPECTION_SYNC_SOFT_LOCK_KEY, '1', 120);
  try {
    if (!wantForce && cache.get(INSPECTION_SYNC_CACHE_KEY)) {
      return { synced: false, plans: getInspectionPlans(), sourceTitle: INSPECTION_SOURCE_TITLE, sourceUrl: INSPECTION_SOURCE_URL };
    }
    let rows;
    try {
      rows = collectSourceInspectionRows_();
    } catch (e) {
      Logger.log('inspection sync read failed: ' + e.message);
      try { logAction('ซิงก์แผนตรวจรับล้มเหลว (อ่านชีท): ' + e.message); } catch (ignore) {}
      return {
        synced: false,
        error: e.message,
        plans: getInspectionPlans(),
        sourceTitle: INSPECTION_SOURCE_TITLE,
        sourceUrl: INSPECTION_SOURCE_URL
      };
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return { synced: false, plans: getInspectionPlans(), sourceTitle: INSPECTION_SOURCE_TITLE, sourceUrl: INSPECTION_SOURCE_URL };
    }
    try {
      if (!wantForce && cache.get(INSPECTION_SYNC_CACHE_KEY)) {
        return { synced: false, plans: getInspectionPlans(), sourceTitle: INSPECTION_SOURCE_TITLE, sourceUrl: INSPECTION_SOURCE_URL };
      }
      const ss = getSpreadsheet_();
      const sheet = ensureInspectionSheet_(ss);
      try {
        const n = syncInspectionsFromSource_(sheet, rows);
        cache.put(INSPECTION_SYNC_CACHE_KEY, String(Date.now()), INSPECTION_SYNC_TTL_SEC);
        return {
          synced: true,
          count: n,
          plans: readInspectionsMapped_(sheet),
          sourceTitle: INSPECTION_SOURCE_TITLE,
          sourceUrl: INSPECTION_SOURCE_URL
        };
      } catch (e) {
        Logger.log('inspection sync failed: ' + e.message);
        try { logAction('ซิงก์แผนตรวจรับล้มเหลว: ' + e.message); } catch (ignore) {}
        return {
          synced: false,
          error: e.message,
          plans: readInspectionsMapped_(sheet),
          sourceTitle: INSPECTION_SOURCE_TITLE,
          sourceUrl: INSPECTION_SOURCE_URL
        };
      }
    } finally {
      lock.releaseLock();
    }
  } finally {
    try { cache.remove(INSPECTION_SYNC_SOFT_LOCK_KEY); } catch (ignore) {}
  }
}

function inspectionFormToFields_(formObj) {
  function normInspDate_(val) {
    const s = (val == null ? '' : val).toString().trim();
    if (!s) return '';
    return formatInspectionDateDisplay_(s) || s;
  }
  return {
    seq: (formObj.seq || '').toString().trim(),
    phase: (formObj.phase || '').toString().trim(),
    place: (formObj.place || '').toString().trim(),
    pwaBranch: (formObj.pwaBranch || '').toString().trim(),
    pwaDistrict: (formObj.pwaDistrict || '').toString().trim(),
    peaZone: (formObj.peaZone || '').toString().trim(),
    peaOffice: (formObj.peaOffice || '').toString().trim(),
    handoverPlan: (formObj.handoverPlan || '').toString().trim(),
    handoverRound: normInspDate_(formObj.handoverRound),
    inspectSchedule: normInspDate_(formObj.inspectSchedule),
    inspectors: (formObj.inspectors || '').toString().trim(),
    fileComment: (formObj.fileComment || '').toString().trim(),
    committee: (formObj.committee || '').toString().trim(),
    inspectLetterDate: (formObj.inspectLetterDate || '').toString().trim(),
    passLetterStatus: (formObj.passLetterStatus || '').toString().trim(),
    visited: !!formObj.visited,
    tcCoordinator: (formObj.tcCoordinator || '').toString().trim(),
    tcContact: (formObj.tcContact || '').toString().trim(),
    region: (formObj.region || '').toString().trim().toUpperCase()
  };
}

function writeInspectionBackToSource_(id, fields) {
  const ref = parseSyncedInspectionRowRef_(id);
  if (!ref) throw new Error('รหัสรายการจากชีทไม่ถูกต้อง');
  const srcSs = SpreadsheetApp.openById(INSPECTION_SOURCE_SS_ID);
  const srcSheet = findInspectionSourceSheet_(srcSs, ref.sheetId);
  if (!srcSheet) throw new Error('ไม่พบแท็บชีทต้นทาง');
  const lastCol = Math.max(srcSheet.getLastColumn(), 18);
  const headerScanRows = Math.min(Math.max(srcSheet.getLastRow(), ref.row), Math.max(ref.row, 8));
  const values = srcSheet.getRange(1, 1, headerScanRows, lastCol).getValues();
  const map = findInspectionHeaderMap_(values);
  const cols = map.cols;
  INSPECTION_SOURCE_COL_KEYS_.forEach(function(key) {
    const col = cols[key];
    if (col == null) return;
    let val = fields[key];
    if (key === 'visited') val = val ? 'TRUE' : '';
    srcSheet.getRange(ref.row, col + 1).setValue(val == null ? '' : val);
  });
  return true;
}

function saveInspectionPlan(formObj, sessionToken) {
  assertInspectionFromSession_(sessionToken);
  const fields = inspectionFormToFields_(formObj);
  if (!fields.place) throw new Error('กรุณาระบุสถานที่');

  const ss = getSpreadsheet_();
  const sheet = ensureInspectionSheet_(ss);

  if (formObj.id) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === formObj.id.toString()) {
        sheet.getRange(i + 1, 1, 1, INSPECTION_HEADERS.length).setValues([inspectionFieldsToLocalRow_(formObj.id, fields)]);
        if (isSyncedInspectionId_(formObj.id)) {
          try {
            writeInspectionBackToSource_(formObj.id, fields);
            CacheService.getScriptCache().remove(INSPECTION_SYNC_CACHE_KEY);
          } catch (e) {
            logAction('บันทึกแผนตรวจรับแล้ว แต่เขียนกลับชีทไม่สำเร็จ: ' + e.message);
            return { success: true, message: 'บันทึกในแอปแล้ว แต่เขียนกลับชีทไม่สำเร็จ: ' + e.message };
          }
        }
        logAction('แก้ไขแผนตรวจรับ: ' + fields.place);
        return { success: true, message: isSyncedInspectionId_(formObj.id) ? 'อัปเดตแล้ว (แอป + ชีท)' : 'อัปเดตข้อมูลสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
  }

  const newId = new Date().getTime().toString();
  sheet.appendRow(inspectionFieldsToLocalRow_(newId, fields));
  logAction('เพิ่มแผนตรวจรับ: ' + fields.place);
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
}

function deleteInspectionPlan(id, sessionToken) {
  assertInspectionFromSession_(sessionToken);
  if (isSyncedInspectionId_(id)) {
    throw new Error('รายการจากชีทต้นทางลบไม่ได้ — แก้หรือลบที่ Google Sheet');
  }
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(INSPECTION_SHEET);
  if (!sheet) throw new Error('ไม่พบตารางแผนตรวจรับ');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  throw new Error('ไม่พบรายการที่ต้องการลบ');
}

function sanitizeDriveFolderName_(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120) || 'ทั่วไป';
}

function buildInspectionFileFolderName_(plan) {
  const place = ((plan && plan.place) || 'ไม่ระบุสถานที่').toString().trim();
  const reg = ((plan && plan.region) || '').toString().trim().toUpperCase();
  const base = reg ? (reg + ' - ' + place) : place;
  return sanitizeDriveFolderName_(base);
}

function createInspectionCommentFile_(opts) {
  let finalUrl = '';
  try {
    const parent = DriveApp.getFolderById(INSPECTION_FILE_FOLDER_ID);
    const targetFolder = getOrCreateDriveSubFolder_(parent, opts.folderName);
    const decodedFile = Utilities.base64Decode(opts.fileBase64);
    const driveName = opts.fileName.toLowerCase().endsWith('.pdf') ? opts.fileName : (opts.fileName + '.pdf');
    const blob = Utilities.newBlob(decodedFile, 'application/pdf', driveName);
    const file = targetFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    finalUrl = file.getUrl();
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (/Access denied|permission|ไม่มีสิทธิ์|Authorization/i.test(msg)) {
      throw new Error('อัปโหลดไม่สำเร็จ: แชร์โฟลเดอร์ Drive ให้บัญชี Apps Script เป็น Editor — ' + INSPECTION_FILE_FOLDER_URL);
    }
    throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + msg);
  }
  return { success: true, url: finalUrl, fileName: opts.fileName, folderName: opts.folderName };
}

function appendInspectionFileComment_(inspectionId, fileName, url) {
  const ss = getSpreadsheet_();
  const sheet = ensureInspectionSheet_(ss);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== inspectionId.toString()) continue;
    const row = mapInspectionRow_(data[i]);
    const entry = fileName + '|' + url;
    const nextComment = row.fileComment ? (row.fileComment + '\n' + entry) : entry;
    const fields = inspectionFormToFields_({
      id: inspectionId,
      seq: row.seq,
      phase: row.phase,
      place: row.place,
      pwaBranch: row.pwaBranch,
      pwaDistrict: row.pwaDistrict,
      peaZone: row.peaZone,
      peaOffice: row.peaOffice,
      handoverPlan: row.handoverPlan,
      handoverRound: row.handoverRound,
      inspectSchedule: row.inspectSchedule,
      inspectors: row.inspectors,
      fileComment: nextComment,
      committee: row.committee,
      inspectLetterDate: row.inspectLetterDate,
      passLetterStatus: row.passLetterStatus,
      visited: true,
      tcCoordinator: row.tcCoordinator,
      tcContact: row.tcContact,
      region: row.region
    });
    sheet.getRange(i + 1, 1, 1, INSPECTION_HEADERS.length).setValues([inspectionFieldsToLocalRow_(inspectionId, fields)]);
    if (isSyncedInspectionId_(inspectionId)) {
      try {
        writeInspectionBackToSource_(inspectionId, fields);
        CacheService.getScriptCache().remove(INSPECTION_SYNC_CACHE_KEY);
      } catch (e) {
        logAction('อัปโหลด File comment แล้ว แต่เขียนกลับชีทไม่สำเร็จ: ' + e.message);
      }
    }
    return { fileComment: nextComment, visited: true };
  }
  throw new Error('ไม่พบรายการตรวจรับ');
}

function extractDriveFileIdFromUrl_(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return '';
}

function isFolderUnderInspectionRoot_(folder) {
  if (!folder) return false;
  if (folder.getId() === INSPECTION_FILE_FOLDER_ID) return true;
  const parents = folder.getParents();
  while (parents.hasNext()) {
    if (isFolderUnderInspectionRoot_(parents.next())) return true;
  }
  return false;
}

function isInspectionDriveFile_(file) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (isFolderUnderInspectionRoot_(parents.next())) return true;
  }
  return false;
}

function deleteInspectionDriveFileByUrl_(fileUrl) {
  const fileId = extractDriveFileIdFromUrl_(fileUrl);
  if (!fileId) return { deleted: false, reason: 'no_id' };
  try {
    const file = DriveApp.getFileById(fileId);
    if (!isInspectionDriveFile_(file)) {
      logAction('ลบ Drive ข้าม: ไฟล์ไม่อยู่ในโฟลเดอร์ตรวจรับ ' + fileId);
      return { deleted: false, reason: 'wrong_folder' };
    }
    file.setTrashed(true);
    return { deleted: true, fileId: fileId };
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (/not found|Unable to find|Invalid argument/i.test(msg)) return { deleted: false, reason: 'not_found' };
    throw new Error('ลบไฟล์ใน Drive ไม่สำเร็จ: ' + msg);
  }
}

function removeInspectionFileCommentEntry_(inspectionId, fileUrl) {
  const targetUrl = (fileUrl || '').toString().trim();
  if (!targetUrl) throw new Error('ไม่พบ URL ไฟล์');
  const ss = getSpreadsheet_();
  const sheet = ensureInspectionSheet_(ss);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() !== inspectionId.toString()) continue;
    const row = mapInspectionRow_(data[i]);
    const lines = String(row.fileComment || '').split(/\n/).map(function(line) { return line.trim(); }).filter(Boolean);
    const nextLines = lines.filter(function(line) {
      const idx = line.indexOf('|');
      if (idx > 0 && /^https?:\/\//i.test(line.slice(idx + 1).trim())) {
        return line.slice(idx + 1).trim() !== targetUrl;
      }
      if (/^https?:\/\//i.test(line)) return line !== targetUrl;
      return true;
    });
    const nextComment = nextLines.join('\n');
    const fields = inspectionFormToFields_({
      id: inspectionId,
      seq: row.seq,
      phase: row.phase,
      place: row.place,
      pwaBranch: row.pwaBranch,
      pwaDistrict: row.pwaDistrict,
      peaZone: row.peaZone,
      peaOffice: row.peaOffice,
      handoverPlan: row.handoverPlan,
      handoverRound: row.handoverRound,
      inspectSchedule: row.inspectSchedule,
      inspectors: row.inspectors,
      fileComment: nextComment,
      committee: row.committee,
      inspectLetterDate: row.inspectLetterDate,
      passLetterStatus: row.passLetterStatus,
      visited: row.visited,
      tcCoordinator: row.tcCoordinator,
      tcContact: row.tcContact,
      region: row.region
    });
    sheet.getRange(i + 1, 1, 1, INSPECTION_HEADERS.length).setValues([inspectionFieldsToLocalRow_(inspectionId, fields)]);
    if (isSyncedInspectionId_(inspectionId)) {
      try {
        writeInspectionBackToSource_(inspectionId, fields);
        CacheService.getScriptCache().remove(INSPECTION_SYNC_CACHE_KEY);
      } catch (e) {
        logAction('ลบ File comment แล้ว แต่เขียนกลับชีทไม่สำเร็จ: ' + e.message);
      }
    }
    return nextComment;
  }
  throw new Error('ไม่พบรายการตรวจรับ');
}

function deleteInspectionFileComment(formObj, sessionToken) {
  assertInspectionFromSession_(sessionToken);
  const inspectionId = (formObj && formObj.inspectionId != null ? formObj.inspectionId : '').toString().trim();
  const fileUrl = (formObj && formObj.fileUrl != null ? formObj.fileUrl : '').toString().trim();
  if (!inspectionId) throw new Error('ไม่พบรหัสรายการ');
  if (!fileUrl) throw new Error('ไม่พบ URL ไฟล์');
  const driveResult = deleteInspectionDriveFileByUrl_(fileUrl);
  const fileComment = removeInspectionFileCommentEntry_(inspectionId, fileUrl);
  logAction('ลบ File comment: ' + inspectionId + (driveResult.deleted ? ' (+ Drive)' : ''));
  return { success: true, fileComment: fileComment, driveDeleted: !!driveResult.deleted };
}

const INSPECTION_FORM_TEMPLATE_PREFIX = '_แบบฟอร์มตรวจ';
const INSPECTION_FORM_PROP_FILE_ID = 'inspectionFormTemplateFileId';
const INSPECTION_FORM_PROP_FILE_NAME = 'inspectionFormTemplateFileName';
const INSPECTION_FORM_PROP_UPDATED = 'inspectionFormTemplateUpdatedAt';

function getInspectionFormTemplateProps_() {
  const props = PropertiesService.getScriptProperties();
  return {
    fileId: props.getProperty(INSPECTION_FORM_PROP_FILE_ID) || '',
    fileName: props.getProperty(INSPECTION_FORM_PROP_FILE_NAME) || '',
    updatedAt: props.getProperty(INSPECTION_FORM_PROP_UPDATED) || ''
  };
}

function setInspectionFormTemplateProps_(fileId, fileName) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(INSPECTION_FORM_PROP_FILE_ID, fileId);
  props.setProperty(INSPECTION_FORM_PROP_FILE_NAME, fileName);
  props.setProperty(INSPECTION_FORM_PROP_UPDATED, new Date().toISOString());
}

function clearInspectionFormTemplateProps_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(INSPECTION_FORM_PROP_FILE_ID);
  props.deleteProperty(INSPECTION_FORM_PROP_FILE_NAME);
  props.deleteProperty(INSPECTION_FORM_PROP_UPDATED);
}

function findInspectionFormTemplateFile_() {
  const meta = getInspectionFormTemplateProps_();
  if (meta.fileId) {
    try {
      const file = DriveApp.getFileById(meta.fileId);
      if (file && isInspectionDriveFile_(file)) {
        return { file: file, fileName: meta.fileName || file.getName() };
      }
    } catch (e) {}
  }
  const parent = DriveApp.getFolderById(INSPECTION_FILE_FOLDER_ID);
  const files = parent.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (name.indexOf(INSPECTION_FORM_TEMPLATE_PREFIX) === 0) {
      return { file: f, fileName: meta.fileName || name };
    }
  }
  return null;
}

function removeInspectionFormTemplateFile_() {
  const found = findInspectionFormTemplateFile_();
  if (found && found.file) {
    try {
      found.file.setTrashed(true);
    } catch (e) {}
  }
  clearInspectionFormTemplateProps_();
}

/** แบบฟอร์มตรวจรับ — ทุกคนดาวน์โหลดได้ */
function getInspectionFormTemplate() {
  const found = findInspectionFormTemplateFile_();
  if (!found) return { exists: false };
  const meta = getInspectionFormTemplateProps_();
  return {
    exists: true,
    url: found.file.getUrl(),
    fileName: found.fileName || found.file.getName(),
    updatedAt: meta.updatedAt || ''
  };
}

/** อัปโหลด/แทนที่แบบฟอร์มตรวจ — แอดมินหลักเท่านั้น */
function uploadInspectionFormTemplate(formObj, sessionToken) {
  assertAdminFromSession_(sessionToken);
  const fileName = (formObj && formObj.fileName != null ? formObj.fileName : '').toString().trim();
  if (!fileName) throw new Error('กรุณาระบุชื่อไฟล์');
  if (!formObj.fileBase64) throw new Error('กรุณาเลือกไฟล์ PDF');
  const mime = (formObj.mimeType || '').toString().toLowerCase();
  if (mime && mime !== 'application/pdf' && mime !== 'application/x-pdf') {
    throw new Error('อัปโหลดได้เฉพาะไฟล์ PDF เท่านั้น');
  }
  removeInspectionFormTemplateFile_();
  let finalUrl = '';
  try {
    const parent = DriveApp.getFolderById(INSPECTION_FILE_FOLDER_ID);
    const decodedFile = Utilities.base64Decode(formObj.fileBase64);
    const driveName = INSPECTION_FORM_TEMPLATE_PREFIX + '.pdf';
    const blob = Utilities.newBlob(decodedFile, 'application/pdf', driveName);
    const file = parent.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    finalUrl = file.getUrl();
    setInspectionFormTemplateProps_(file.getId(), fileName);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (/Access denied|permission|ไม่มีสิทธิ์|Authorization/i.test(msg)) {
      throw new Error('อัปโหลดไม่สำเร็จ: แชร์โฟลเดอร์ Drive ให้บัญชี Apps Script เป็น Editor — ' + INSPECTION_FILE_FOLDER_URL);
    }
    throw new Error('อัปโหลดแบบฟอร์มตรวจไม่สำเร็จ: ' + msg);
  }
  logAction('อัปโหลดแบบฟอร์มตรวจ: ' + fileName);
  return {
    success: true,
    exists: true,
    url: finalUrl,
    fileName: fileName,
    updatedAt: getInspectionFormTemplateProps_().updatedAt
  };
}

/** ลบแบบฟอร์มตรวจ — แอดมินหลักเท่านั้น */
function deleteInspectionFormTemplate(sessionToken) {
  assertAdminFromSession_(sessionToken);
  removeInspectionFormTemplateFile_();
  logAction('ลบแบบฟอร์มตรวจ');
  return { success: true, exists: false };
}

function saveInspectionFileComment(formObj, sessionToken) {
  assertInspectionFromSession_(sessionToken);
  const inspectionId = (formObj && formObj.inspectionId != null ? formObj.inspectionId : '').toString().trim();
  const fileName = (formObj && formObj.fileName != null ? formObj.fileName : '').toString().trim();
  let folderName = sanitizeDriveFolderName_((formObj && formObj.folderName != null ? formObj.folderName : '').toString().trim());
  if (!folderName && formObj && formObj.place) folderName = buildInspectionFileFolderName_({ place: formObj.place, region: formObj.region });
  if (!inspectionId) throw new Error('ไม่พบรหัสรายการ');
  if (!folderName) throw new Error('ไม่พบชื่อพื้นที่');
  if (!fileName) throw new Error('กรุณาระบุชื่อไฟล์');
  if (!formObj.fileBase64) throw new Error('กรุณาเลือกไฟล์ PDF');
  const mime = (formObj.mimeType || '').toString().toLowerCase();
  if (mime && mime !== 'application/pdf' && mime !== 'application/x-pdf') {
    throw new Error('อัปโหลดได้เฉพาะไฟล์ PDF เท่านั้น');
  }
  const uploaded = createInspectionCommentFile_({
    folderName: folderName,
    fileName: fileName,
    fileBase64: formObj.fileBase64
  });
  const saved = appendInspectionFileComment_(inspectionId, fileName, uploaded.url);
  logAction('อัปโหลด File comment: ' + folderName + ' / ' + fileName);
  return {
    success: true,
    message: 'อัปโหลดไฟล์สำเร็จ',
    url: uploaded.url,
    fileName: fileName,
    folderName: folderName,
    fileComment: saved.fileComment,
    visited: saved.visited
  };
}

function forceAuth() {
  DriveApp.createFile('dummy.txt', 'test');
}

// ==========================================
// ส่วนไฟล์ PDF ต่อสถานที่ (แยกตามโฟลเดอร์) — แอดมินหลัก + แอดมินรอง
// ==========================================
const SITE_DOCS_SHEET = 'SiteDocs';

function listDriveSubFolders_(parentFolder) {
  const folders = [];
  const it = parentFolder.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    folders.push({ id: f.getId(), name: f.getName() });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return folders;
}

function getOrCreateDriveSubFolder_(parentFolder, folderName) {
  const name = (folderName || '').toString().trim();
  if (!name) throw new Error('กรุณาระบุชื่อโฟลเดอร์');
  const it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

/** รายชื่อโฟลเดอร์ย่อยใน Drive (FOLDER_ID) ให้เลือกตอนอัปโหลด */
function getDriveSiteFolders() {
  try {
    const parent = DriveApp.getFolderById(FOLDER_ID);
    return listDriveSubFolders_(parent)
      .map(f => f.name)
      .filter(n => n && n !== '_upload_tmp');
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (/Access denied|permission|Authorization/i.test(msg)) {
      throw new Error('โหลดโฟลเดอร์ไม่สำเร็จ: แชร์โฟลเดอร์ Drive ให้บัญชีเจ้าของ Apps Script เป็น Editor');
    }
    throw new Error('โหลดโฟลเดอร์จาก Drive ไม่สำเร็จ: ' + msg);
  }
}

function getSiteDocs(siteKey) {
  const key = (siteKey == null ? '' : siteKey.toString()).trim();
  if (!key) return [];

  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SITE_DOCS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SITE_DOCS_SHEET);
    sheet.appendRow(['DocID', 'SiteKey', 'FolderName', 'FileName', 'URL', 'UploadedBy', 'Timestamp']);
    sheet.getRange('A1:G1').setFontWeight('bold').setBackground('#e6fcf5');
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  data.shift();

  return data.filter(row => (row[1] || '').toString().trim() === key).map(row => {
    let timestampStr = '';
    if (row[6]) {
      timestampStr = (row[6] instanceof Date) ? row[6].toLocaleString('th-TH') : row[6].toString();
    }
    return {
      id: row[0],
      siteKey: (row[1] || '').toString(),
      folderName: (row[2] || '').toString().trim() || 'ทั่วไป',
      fileName: (row[3] || '').toString(),
      url: row[4] || '',
      uploadedBy: row[5] || '',
      timestamp: timestampStr
    };
  }).sort((a, b) => {
    const f = a.folderName.localeCompare(b.folderName, 'th');
    if (f !== 0) return f;
    return a.fileName.localeCompare(b.fileName, 'th');
  });
}

function saveSiteDoc(formObj, sessionToken) {
  const role = assertEditorOrAdminFromSession_(sessionToken);
  const session = validateSession_(sessionToken);

  const siteKey = (formObj && formObj.siteKey != null ? formObj.siteKey : '').toString().trim();
  const folderName = (formObj && formObj.folderName != null ? formObj.folderName : '').toString().trim();
  const fileName = (formObj && formObj.fileName != null ? formObj.fileName : '').toString().trim();

  if (!siteKey) throw new Error('ไม่พบรหัสสถานที่');
  if (!folderName) throw new Error('กรุณาระบุชื่อโฟลเดอร์');
  if (!fileName) throw new Error('กรุณาระบุชื่อไฟล์');
  if (!formObj.fileBase64) throw new Error('กรุณาเลือกไฟล์ PDF');

  const mime = (formObj.mimeType || '').toString().toLowerCase();
  if (mime && mime !== 'application/pdf' && mime !== 'application/x-pdf') {
    throw new Error('อัปโหลดได้เฉพาะไฟล์ PDF เท่านั้น');
  }

  return createSiteDocFile_({
    siteKey: siteKey,
    folderName: folderName,
    fileName: fileName,
    fileBase64: formObj.fileBase64,
    uploadedBy: session.username || role
  });
}

function getUploadTempFolder_() {
  const parent = DriveApp.getFolderById(FOLDER_ID);
  const it = parent.getFoldersByName('_upload_tmp');
  if (it.hasNext()) return it.next();
  return parent.createFolder('_upload_tmp');
}

function beginSiteDocUpload(meta, sessionToken) {
  const role = assertEditorOrAdminFromSession_(sessionToken);
  const session = validateSession_(sessionToken);
  const uploadId = (meta && meta.uploadId != null ? meta.uploadId : '').toString().trim();
  const siteKey = (meta && meta.siteKey != null ? meta.siteKey : '').toString().trim();
  const folderName = (meta && meta.folderName != null ? meta.folderName : '').toString().trim();
  const fileName = (meta && meta.fileName != null ? meta.fileName : '').toString().trim();
  const chunkTotal = parseInt(meta && meta.chunkTotal, 10) || 0;

  if (!uploadId) throw new Error('ไม่พบรหัสอัปโหลด');
  if (!siteKey) throw new Error('ไม่พบรหัสสถานที่');
  if (!folderName) throw new Error('กรุณาระบุชื่อโฟลเดอร์');
  if (!fileName) throw new Error('กรุณาระบุชื่อไฟล์');
  if (chunkTotal < 1) throw new Error('จำนวนชิ้นไฟล์ไม่ถูกต้อง');

  const info = {
    uploadId: uploadId,
    siteKey: siteKey,
    folderName: folderName,
    fileName: fileName,
    chunkTotal: chunkTotal,
    uploadedBy: session.username || role,
    received: 0
  };
  CacheService.getScriptCache().put('sup:' + uploadId, JSON.stringify(info), 3600);
  return { success: true, uploadId: uploadId, chunkTotal: chunkTotal };
}

function saveSiteDocChunk(formObj, sessionToken) {
  assertEditorOrAdminFromSession_(sessionToken);
  const uploadId = (formObj && formObj.uploadId != null ? formObj.uploadId : '').toString().trim();
  const chunkIndex = parseInt(formObj && formObj.chunkIndex, 10);
  const chunkData = (formObj && formObj.chunkData != null ? formObj.chunkData : '').toString();

  if (!uploadId) throw new Error('ไม่พบรหัสอัปโหลด');
  if (!isFinite(chunkIndex) || chunkIndex < 0) throw new Error('ลำดับชิ้นไม่ถูกต้อง');
  if (!chunkData) throw new Error('ชิ้นข้อมูลว่าง');

  const metaRaw = CacheService.getScriptCache().get('sup:' + uploadId);
  if (!metaRaw) throw new Error('หมดเวลาอัปโหลด หรือยังไม่ได้เริ่มต้น — ลองใหม่');
  const meta = JSON.parse(metaRaw);
  if (chunkIndex >= meta.chunkTotal) throw new Error('ลำดับชิ้นเกินจำนวน');

  const tmp = getUploadTempFolder_();
  const partName = uploadId + '_' + ('00000' + chunkIndex).slice(-5) + '.part';
  const existing = tmp.getFilesByName(partName);
  while (existing.hasNext()) existing.next().setTrashed(true);
  tmp.createFile(Utilities.newBlob(chunkData, 'text/plain', partName));

  meta.received = (parseInt(meta.received, 10) || 0) + 1;
  CacheService.getScriptCache().put('sup:' + uploadId, JSON.stringify(meta), 3600);
  return { success: true, chunkIndex: chunkIndex, received: meta.received, chunkTotal: meta.chunkTotal };
}

function finalizeSiteDocUpload(uploadId, sessionToken) {
  assertEditorOrAdminFromSession_(sessionToken);
  const id = (uploadId == null ? '' : uploadId.toString()).trim();
  if (!id) throw new Error('ไม่พบรหัสอัปโหลด');

  const metaRaw = CacheService.getScriptCache().get('sup:' + id);
  if (!metaRaw) throw new Error('หมดเวลาอัปโหลด หรือยังไม่ได้เริ่มต้น — ลองใหม่');
  const meta = JSON.parse(metaRaw);
  const tmp = getUploadTempFolder_();

  let fileBase64 = '';
  for (let i = 0; i < meta.chunkTotal; i++) {
    const partName = id + '_' + ('00000' + i).slice(-5) + '.part';
    const files = tmp.getFilesByName(partName);
    if (!files.hasNext()) throw new Error('ชิ้นไฟล์ไม่ครบ (ขาดชิ้นที่ ' + (i + 1) + ')');
    const partFile = files.next();
    fileBase64 += partFile.getBlob().getDataAsString();
    partFile.setTrashed(true);
  }

  CacheService.getScriptCache().remove('sup:' + id);
  return createSiteDocFile_({
    siteKey: meta.siteKey,
    folderName: meta.folderName,
    fileName: meta.fileName,
    fileBase64: fileBase64,
    uploadedBy: meta.uploadedBy
  });
}

function createSiteDocFile_(opts) {
  let finalUrl = '';
  try {
    const parent = DriveApp.getFolderById(FOLDER_ID);
    const targetFolder = getOrCreateDriveSubFolder_(parent, opts.folderName);
    const decodedFile = Utilities.base64Decode(opts.fileBase64);
    const driveName = opts.fileName.toLowerCase().endsWith('.pdf') ? opts.fileName : (opts.fileName + '.pdf');
    const blob = Utilities.newBlob(decodedFile, 'application/pdf', driveName);
    const file = targetFolder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // โฟลเดอร์องค์กรบางอันห้ามเปลี่ยน sharing — ยังใช้ลิงก์ไฟล์ได้ถ้ามีสิทธิ์อยู่แล้ว
    }
    finalUrl = file.getUrl();
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    if (/Access denied|permission|ไม่มีสิทธิ์|Authorization/i.test(msg)) {
      throw new Error('อัปโหลดไม่สำเร็จ: ไม่มีสิทธิ์เขียนโฟลเดอร์ Drive — แชร์โฟลเดอร์ให้บัญชีเจ้าของ Apps Script เป็น Editor (แก้ไขได้)');
    }
    throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + msg);
  }

  const ss = getSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, SITE_DOCS_SHEET, ['DocID', 'SiteKey', 'FolderName', 'FileName', 'URL', 'UploadedBy', 'Timestamp']);
  const newId = 'SDOC_' + new Date().getTime();
  sheet.appendRow([
    newId, opts.siteKey, opts.folderName, opts.fileName, finalUrl,
    opts.uploadedBy || '', new Date()
  ]);
  return { success: true, message: 'อัปโหลดไฟล์สำเร็จ', id: newId, url: finalUrl };
}

function deleteSiteDoc(id, sessionToken) {
  assertEditorOrAdminFromSession_(sessionToken);
  const docId = (id == null ? '' : id.toString()).trim();
  if (!docId) return { success: false, message: 'ไม่พบรหัสไฟล์' };

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SITE_DOCS_SHEET);
  if (!sheet) return { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString() === docId) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'ลบไฟล์สำเร็จ' };
    }
  }
  return { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' };
}

// ส่วนระบบจัดการข้อมูลโครงการ (Project Docs)
// ==========================================
const DOCS_SHEET = 'ProjectDocs';

function getProjectDocs() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(DOCS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(DOCS_SHEET);
    sheet.appendRow(['DocID', 'ParentID', 'Type', 'Title', 'URL', 'SortOrder', 'CreatedBy', 'Timestamp', 'Note']);
    sheet.getRange('A1:I1').setFontWeight('bold').setBackground('#e6fcf5');
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  data.shift();

  return data.map(row => {
    let timestampStr = '';
    if (row[7]) {
      timestampStr = (row[7] instanceof Date) ? row[7].toLocaleString('th-TH') : row[7].toString();
    }
    return {
      id: row[0], parentId: row[1], type: row[2], title: row[3],
      url: row[4], sortOrder: parseInt(row[5]) || 0, createdBy: row[6],
      timestamp: timestampStr,
      note: row[8] || ''
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

function saveProjectDoc(formObj, sessionToken) {
  assertAdminFromSession_(sessionToken);
  const role = getRoleFromSession_(sessionToken);

  const ss = getSpreadsheet_();
  let sheet = getOrCreateSheet_(ss, DOCS_SHEET, ['DocID', 'ParentID', 'Type', 'Title', 'URL', 'SortOrder', 'CreatedBy', 'Timestamp', 'Note']);
  let finalUrl = formObj.url || '';

  if (formObj.type === 'FILE' && formObj.fileBase64) {
    try {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const decodedFile = Utilities.base64Decode(formObj.fileBase64);
      const blob = Utilities.newBlob(decodedFile, formObj.mimeType || 'application/pdf', formObj.fileName);
      const file = folder.createFile(blob);
      finalUrl = file.getUrl();
    } catch (e) { throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + e.message); }
  }

  const newId = 'DOC_' + new Date().getTime();
  sheet.appendRow([
    newId, formObj.parentId || '', formObj.type, formObj.title, finalUrl,
    formObj.sortOrder || 999, role, new Date(), formObj.note || ''
  ]);
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
}

function updateDocOrders(orderData, sessionToken) {
  assertAdminFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(DOCS_SHEET);
  if (!sheet) return { success: true };
  let data = sheet.getDataRange().getValues();

  const rowById = {};
  for (let i = 1; i < data.length; i++) {
    rowById[data[i][0]] = i + 1;
  }

  orderData.forEach(item => {
    const row = rowById[item.id];
    if (!row) return;
    sheet.getRange(row, 2).setValue(item.parentId);
    sheet.getRange(row, 6).setValue(item.sortOrder);
  });
  return { success: true };
}

function deleteDoc(id, sessionToken) {
  assertAdminFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(DOCS_SHEET);
  if (!sheet) return { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' };
  let data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'ลบข้อมูลสำเร็จ' };
    }
  }
  return { success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' };
}

function editProjectDoc(id, newTitle, newNote, sessionToken) {
  assertAdminFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(DOCS_SHEET);
  if (!sheet) throw new Error('ไม่พบตารางข้อมูลโครงการ');
  let data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 4).setValue(newTitle);
      sheet.getRange(i + 1, 9).setValue(newNote);
      return { success: true };
    }
  }
  throw new Error('ไม่พบข้อมูลที่ต้องการแก้ไข');
}

// --- ใช้สำหรับ stress test ผ่าน clasp run ---
function runOutageSelfTest() {
  const results = [];
  const assert = (name, cond) => results.push({ name: name, ok: !!cond });

  assert('parseCheckbox TRUE', parseCheckbox_('TRUE') === true);
  assert('parseCheckbox 1', parseCheckbox_(1) === true);
  assert('parseCheckbox false', parseCheckbox_('false') === false);
  assert('normalizeOutageDate ISO', normalizeOutageDate_('2024-06-06T10:00:00') !== null);
  assert('validateHttpUrl ok', validateHttpUrl_('https://drive.google.com/x') !== '');
  let urlErr = false;
  try { validateHttpUrl_('javascript:alert(1)'); } catch (e) { urlErr = true; }
  assert('validateHttpUrl block js', urlErr);
  assert('ALLOWED fields concept', ['checkVendor', 'checkPEAPwa', 'checkPEASite', 'checkPEAPhone', 'checkDone'].length === 5);
  const d1 = parseThaiDate_('4 ส.ค. 2569');
  assert('parseThaiDate ส.ค. 2569', d1 && d1.getFullYear() === 2026 && d1.getMonth() === 7 && d1.getDate() === 4);
  const d2 = parseThaiDate_('23 ก.ค. 69');
  assert('parseThaiDate ก.ค. 69', d2 && d2.getFullYear() === 2026 && d2.getMonth() === 6 && d2.getDate() === 23);
  const tr = parseTimeRange_('22.30 น. – 02.00');
  assert('parseTimeRange overnight', tr && tr.startH === 22 && tr.endH === 2);
  const se = buildOutageStartEnd_('', '4 ส.ค. 2569', '22.30 น. – 02.00');
  assert('buildStartEnd overnight +1 day', se.start && se.end && se.end.getDate() === 5);
  const seEmpty = buildOutageStartEnd_('', '', '');
  assert('buildStartEnd empty stays empty', seEmpty.start === '' && seEmpty.end === '');
  assert('synced id detect', isSyncedOutageId_('ext-0-3') === true);
  assert('app id not synced', isSyncedOutageId_('171000') === false);

  const failed = results.filter(r => !r.ok);
  return {
    passed: failed.length === 0,
    total: results.length,
    failed: failed.length,
    results: results
  };
}
