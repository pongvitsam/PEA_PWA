const SHEET_ID_PORTAL = '1-bTU1X8fgcSGOBWWQHVYdwrFgGddciORQvPuYtqzCk4';
const DRIVE_FOLDER_ID = '1UU2U11ve_75YQbs0WiP0WzaVQK5ZVwS6';
const CACHE_TTL_INITIAL_SEC = 900;
const CACHE_TTL_APPS_SEC = 300;
const CACHE_TTL_ADMIN_SEC = 120;
const CACHE_TTL_SETTINGS_SEC = 600;
const CACHE_KEY_INITIAL = 'appInitialDataV2';
const CACHE_KEY_APPS = 'appsDataV2';
const CACHE_KEY_ADMIN = 'adminDashboardV2';
const CACHE_KEY_SETTINGS = 'settingsMapV2';

let SS_MEMO_ = null;

function getSpreadsheetPortal_() {
  if (!SS_MEMO_) SS_MEMO_ = SpreadsheetApp.openById(SHEET_ID_PORTAL);
  return SS_MEMO_;
}

function invalidateAppCaches_() {
  const cache = CacheService.getScriptCache();
  cache.remove(CACHE_KEY_INITIAL);
  cache.remove(CACHE_KEY_APPS);
  cache.remove(CACHE_KEY_ADMIN);
  cache.remove(CACHE_KEY_SETTINGS);
}

function doGetPortal() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('กองบริการธุรกิจจัดการพลังงาน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// ---------------- API & Functions ----------------

// ---------------- API & Functions ----------------

function getInitialData() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get(CACHE_KEY_INITIAL);
  const email = Session.getActiveUser().getEmail() || "ผู้ใช้งานทั่วไป";

  // 1. ถ้ามี Cache อยู่แล้ว ให้ดึงมาใช้เลย (เร็วมาก < 0.2 วินาที)
  if (cachedData) {
    const data = JSON.parse(cachedData);
    data.email = email; // อัปเดตอีเมลผู้ใช้ปัจจุบัน
    return data;
  }

  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(1500);
  try {
    const secondCheck = cache.get(CACHE_KEY_INITIAL);
    if (secondCheck) {
      const data = JSON.parse(secondCheck);
      data.email = email;
      return data;
    }
    const settingsMap = getSettingsMap_();
    const apps = getApps();

    const result = {
      email: email,
      apps: apps,
      bgImage: settingsMap['BackgroundImage'] || '',
      logoImage: settingsMap['LogoImage'] || '',
      bannerText: settingsMap['BannerText'] || '',
      bannerVisible: settingsMap['BannerVisible'] || ''
    };

    cache.put(CACHE_KEY_INITIAL, JSON.stringify(result), CACHE_TTL_INITIAL_SEC);
    return result;
  } finally {
    if (locked) lock.releaseLock();
  }
}

// สร้างฟังก์ชันสำหรับล้าง Cache เมื่อ Admin อัปเดตข้อมูล
function clearAppCache() {
  invalidateAppCaches_();
}

function getSettingsMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_SETTINGS);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  const sheet = getSpreadsheetPortal_().getSheetByName('Settings');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(1, 1, lastRow, 2).getValues();
  const map = {};
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] !== '') map[values[i][0]] = values[i][1];
  }
  cache.put(CACHE_KEY_SETTINGS, JSON.stringify(map), CACHE_TTL_SETTINGS_SEC);
  return map;
}

function saveSettingValue(key, value) {
  const sheet = getSpreadsheetPortal_().getSheetByName('Settings');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();
  let found = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow([key, value]);
}

function updateBanner(text, isVisible) {
  const sheet = getSpreadsheetPortal_().getSheetByName('Settings');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();
  let textRow = -1;
  let visibleRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'BannerText') textRow = i + 1;
    if (data[i][0] === 'BannerVisible') visibleRow = i + 1;
  }
  if (textRow > 0) sheet.getRange(textRow, 2).setValue(text);
  else sheet.appendRow(['BannerText', text]);
  if (visibleRow > 0) sheet.getRange(visibleRow, 2).setValue(isVisible);
  else sheet.appendRow(['BannerVisible', isVisible]);
  clearAppCache(); // <--- เพิ่มคำสั่งล้างคุกกี้ตรงนี้
  return true;
}

function getApps() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_APPS);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  const sheet = getSpreadsheetPortal_().getSheetByName('Apps');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 6).getValues();
  data.shift();
  const apps = data.map(row => ({
    id: row[0], name: row[1], url: row[2], imageUrl: row[3], status: row[4], clicks: row[5] || 0
  }));
  cache.put(CACHE_KEY_APPS, JSON.stringify(apps), CACHE_TTL_APPS_SEC);
  return apps;
}

function hashPassword(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256; 
    if (hashVal.toString(16).length == 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function verifyLogin(username, password) {
  const sheet = getSpreadsheetPortal_().getSheetByName('Settings');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();
  const hashedInput = hashPassword(password);
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === hashedInput) return true;
  }
  return false;
}

function recordClick(appId, appName) {
  const email = Session.getActiveUser().getEmail() || "ผู้ใช้งานทั่วไป";
  const timestamp = new Date();
  
  const ss = getSpreadsheetPortal_();
  const logSheet = ss.getSheetByName('Logs');
  logSheet.appendRow([timestamp, email, appId, appName]);
  
  const appSheet = ss.getSheetByName('Apps');
  const finder = appSheet.getRange(2, 1, Math.max(appSheet.getLastRow() - 1, 0), 1).createTextFinder(String(appId)).matchEntireCell(true);
  const hit = finder.findNext();
  if (hit) {
    const rowNo = hit.getRow();
    const current = Number(appSheet.getRange(rowNo, 6).getValue()) || 0;
    appSheet.getRange(rowNo, 6).setValue(current + 1);
  }
}

// อัปโหลดรูปลง Drive และบันทึกใน Settings
function updateSettingImage(key, fileData) {
  let imageUrl = '';
  if (fileData && fileData.data) {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
    const file = folder.createFile(blob);
    
    // ตั้งค่าให้ทุกคนที่มีลิ้งก์สามารถดูได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // แก้ปัญหาภาพไม่ขึ้น: ใช้ URL แบบ Thumbnail ซึ่งเสถียรที่สุดสำหรับเว็บ
    imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  }

  const sheet = getSpreadsheetPortal_().getSheetByName('Settings');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 2).getValues();
  let found = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(imageUrl);
      found = true; break;
    }
  }
  if(!found) sheet.appendRow([key, imageUrl]);
  clearAppCache(); // <--- เพิ่มคำสั่งล้างคุกกี้ตรงนี้
  return imageUrl;
}

function updateBackgroundImage(fileData) { return updateSettingImage('BackgroundImage', fileData); }
function updateLogoImage(fileData) { return updateSettingImage('LogoImage', fileData); }

// เพิ่มหรือแก้ไขโปรแกรม
function saveProject(projectData, fileData) {
  let imageUrl = projectData.imageUrl || ''; 
  if (fileData && fileData.data) {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
    const file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  }

  const sheet = getSpreadsheetPortal_().getSheetByName('Apps');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 6).getValues();

  if (projectData.id) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == projectData.id) {
        sheet.getRange(i + 1, 2).setValue(projectData.name);
        sheet.getRange(i + 1, 3).setValue(projectData.url);
        if(imageUrl) sheet.getRange(i + 1, 4).setValue(imageUrl);
        sheet.getRange(i + 1, 5).setValue(projectData.status);
        break;
      }
    }
  } else {
    sheet.appendRow([new Date().getTime(), projectData.name, projectData.url, imageUrl, projectData.status, 0]);
  }
  clearAppCache(); // <--- เพิ่มคำสั่งล้างคุกกี้ตรงนี้
  return getApps();
}

function getAdminDashboardData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY_ADMIN);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  const logSheet = getSpreadsheetPortal_().getSheetByName('Logs');
  const lastRow = Math.max(logSheet.getLastRow(), 1);
  const logs = logSheet.getRange(1, 1, lastRow, 4).getValues();
  logs.shift(); 
  const formattedLogs = logs.map(row => ({
    time: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
    email: row[1], appName: row[3]
  })).reverse().slice(0, 50); 
  const payload = { logs: formattedLogs };
  cache.put(CACHE_KEY_ADMIN, JSON.stringify(payload), CACHE_TTL_ADMIN_SEC);
  return payload;
}

// ฟังก์ชันสำหรับลบโปรเจกต์
function deleteProject(projectId) {
  const sheet = getSpreadsheetPortal_().getSheetByName('Apps');
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, lastRow, 1).getValues();
  
  // วนลูปหา ID ที่ตรงกัน (เริ่มที่ i=1 เพื่อข้าม Header)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == projectId) {
      sheet.deleteRow(i + 1); // ลบแถว (i+1 เพราะแถวใน Sheet เริ่มที่ 1)
      break;
    }
  }
  
  clearAppCache(); // ล้างคุกกี้เพื่อให้ข้อมูลอัปเดตทันที
  return getApps(); // ส่งรายการแอพใหม่กลับไปให้หน้าเว็บ
}

function warmupAppCache() {
  getInitialData();
  getAdminDashboardData();
  return { ok: true, warmedAt: new Date() };
}

function createWarmupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'warmupAppCache'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('warmupAppCache').timeBased().everyMinutes(10).create();
  return { ok: true };
}