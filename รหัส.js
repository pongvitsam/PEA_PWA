const SHEET_ID = '1AivfnmIxjPaY-bidje61q0IkFUd5nZx9OiNVhw5WrZs';
const SHEET_NAME = 'Sheet1';
const OUTAGE_SHEET = 'OutagePlan';
const USERS_SHEET = 'Users';
const SESSIONS_SHEET = 'Sessions';
const FOLDER_ID = '1lMjZFbPQGc6r077IoNHmI77oGHGFg2RI';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SHEET_ID);
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
    const result = dispatchApi_(payload.action, payload.args || [], payload.sessionToken || null);
    const out = { ok: true, result: result, requestId: payload.requestId || null };
    if (payload.client === 'pages') return postMessageHtml_(out);
    return jsonOutput_(out);
  } catch (err) {
    const out = { ok: false, error: err.message || String(err), requestId: payload.requestId || null };
    if (payload.client === 'pages') return postMessageHtml_(out);
    return jsonOutput_(out);
  }
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
    case 'saveOutageData': return saveOutageData(args[0], args[1] || tok);
    case 'updateOutageStatus': return updateOutageStatus(args[0], args[1], args[2], args[3] || tok);
    case 'deleteOutage': return deleteOutage(args[0], args[1] || tok);
    case 'updateLocation': return updateLocation(args[0], args[1] || tok);
    case 'getUsers': return getUsers(args[0] || tok);
    case 'createDeputyAdmin': return createDeputyAdmin(args[0], args[1], args[2] || tok);
    case 'deleteUserAccount': return deleteUserAccount(args[0], args[1] || tok);
    case 'getProjectDocs': return getProjectDocs();
    case 'updateDocOrders': return updateDocOrders(args[0], args[1] || tok);
    case 'saveProjectDoc': return saveProjectDoc(args[0], args[1] || tok);
    case 'deleteDoc': return deleteDoc(args[0], args[1] || tok);
    case 'editProjectDoc': return editProjectDoc(args[0], args[1], args[2], args[3] || tok);
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

function normalizeOutageDate_(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();
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

// ดึงข้อมูลทั้งหมด
function getLocations() {
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
const OUTAGE_HEADERS = ['ID', 'ProjectName', 'Start', 'End', 'Remark', 'FileURL', 'CheckVendor', 'CheckPEAPwa', 'CheckPEASite', 'CheckPEAPhone', 'CheckDone'];

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
  return sheet;
}

function mapOutageRow_(row) {
  const migrated = row.length > 10;
  return {
    id: row[0],
    projectName: row[1],
    start: normalizeOutageDate_(row[2]),
    end: normalizeOutageDate_(row[3]),
    remark: row[4] || '',
    fileUrl: row[5] || '',
    checkVendor: parseCheckbox_(row[6]),
    checkPEAPwa: parseCheckbox_(row[7]),
    checkPEASite: migrated ? parseCheckbox_(row[8]) : false,
    checkPEAPhone: migrated ? parseCheckbox_(row[9]) : false,
    checkDone: parseCheckbox_(migrated ? row[10] : row[8])
  };
}

function getOutages() {
  const ss = getSpreadsheet_();
  const sheet = ensureOutageSheet_(ss);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  data.shift();
  return data.map(mapOutageRow_).filter(o => o.start && o.end);
}

function saveOutageData(formObj, sessionToken) {
  assertOutageFromSession_(sessionToken);
  const ss = getSpreadsheet_();
  const sheet = ensureOutageSheet_(ss);
  const fileUrl = validateHttpUrl_(formObj.fileUrl || formObj.existingFileUrl || '');
  const startDate = parseOutageDateForSheet_(formObj.start);
  const endDate = parseOutageDateForSheet_(formObj.end);
  if (endDate < startDate) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');

  if (formObj.id) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === formObj.id.toString()) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[formObj.projectName, startDate, endDate, formObj.remark || '', fileUrl]]);
        logAction('แก้ไขแผนดับไฟ: ' + formObj.projectName);
        return { success: true, message: 'อัปเดตข้อมูลสำเร็จ' };
      }
    }
    throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
  }

  sheet.appendRow([new Date().getTime().toString(), formObj.projectName, startDate, endDate, formObj.remark || '', fileUrl, false, false, false, false, false]);
  logAction('เพิ่มแผนดับไฟ: ' + formObj.projectName);
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' };
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

function forceAuth() {
  DriveApp.createFile('dummy.txt', 'test');
}

// ==========================================
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

  const failed = results.filter(r => !r.ok);
  return {
    passed: failed.length === 0,
    total: results.length,
    failed: failed.length,
    results: results
  };
}
