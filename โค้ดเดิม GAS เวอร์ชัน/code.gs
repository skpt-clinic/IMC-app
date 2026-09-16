// =================================================================
// CONFIGURATION
// =================================================================
const SPREADSHEET_ID = '1vWF8QFwqSD5pebORQxvdGNzfJNp1oIO71knWnf2OzRA';
const DOC_TEMPLATE_ID = '1Im3IMg32mu3yEm_S6GvCeaid24z3rAUgnDl_Xzmcfy8';
const BI_TEMPLATE_ID = '19dcvgpwgFUbJFeDNRXSSYC_O0oIQg8G9_xtfbI5xgKI';
const OPD_TEMPLATE_ID = '1L7QGkwA-8KiMjHVmQjCqE3rWZ2hlxWuJ_CkgReqlAWs';
const CONSENT_TEMPLATE_ID = '1mXw6MdoAzI0NMdZ2o51jlrGhe3i3uGQm5i8vCZ7Z4Z0';
const SOAP_TEMPLATE_ID = '1q_DBudqfmr_C8eiPjz5WdXb4QTdKrT6RPf-uJQYkxKU';
const IMC_COVER_TEMPLATE_ID = '1cImx394ZD2zh-H6Szn8G_ED46MlvfF3wvp9D5oaze3s';

const PHOTO_FOLDER_ID = '10gWEXaEEDx3R0F8tSB67mOfr_3-nG4c8'; 
const BODY_CHART_IMAGE_ID = '15GkXRz3FQeKoASYfXQEtS__lq1ax44iI';
const DEFAULT_CLINIC_LOGO_URL = 'https://skpt-clinic.github.io/IMC-app/icon.jpg';

// Sheet Connections
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
const patientSheet = ss.getSheetByName('Patients');
const dropdownSheet = ss.getSheetByName('Dropdowns');
const biSheet = ss.getSheetByName('BIAssessments');
const opdSheet = ss.getSheetByName('OPDRecords');
const consentSheet = ss.getSheetByName('Consents');
const soapSheet = ss.getSheetByName('SOAPNotes');
const scheduleSheet = ss.getSheetByName('Schedules');
const addressSheet = ss.getSheetByName('AddressData');
const userSheet = ss.getSheetByName('Users');

const TMSE_TEMPLATE_ID = '1SYy3_6R75qrlPuhSRfLTAo4k81WEQJiG-gah9ZyX7Ks';
let tmseSheetPrivate = ss.getSheetByName('TMSE_Records');
if (!tmseSheetPrivate) {
  tmseSheetPrivate = ss.insertSheet('TMSE_Records');
  tmseSheetPrivate.appendRow(['RecordID', 'PatientID', 'VisitCount', 'VisitDate', 'Timestamp']);
}
const tmseSheet = tmseSheetPrivate;

const MHQ_TEMPLATE_ID = '1hVK9JiJHpN2EbBW9AoRwLWgDVHKRpAJOl8PvflDBuys';
let mhqSheetPrivate = ss.getSheetByName('MHQ_Records');
if (!mhqSheetPrivate) {
  mhqSheetPrivate = ss.insertSheet('MHQ_Records');
  mhqSheetPrivate.appendRow(['RecordID', 'PatientID', 'VisitDate', 'Timestamp']);
}
const mhqSheet = mhqSheetPrivate;

const DYSPHAGIA_TEMPLATE_ID = '1C_Ul9KUU_iqBcYVCV7JTrHO_DCL_YXAbdcJS1OqZesI';
let dysphagiaSheetPrivate = ss.getSheetByName('Dysphagia_Records');
if (!dysphagiaSheetPrivate) {
  dysphagiaSheetPrivate = ss.insertSheet('Dysphagia_Records');
  dysphagiaSheetPrivate.appendRow(['RecordID', 'PatientID', 'VisitDate', 'Timestamp']);
}
const dysphagiaSheet = dysphagiaSheetPrivate;
// =================================================================
// WEB APP DEPLOYMENT
// =================================================================
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  // รับค่าพารามิเตอร์จาก URL
  const params = e.parameter;
  template.resetToken = params.resetToken || ''; 
  template.view = params.view || 'login';
  template.defaultClinicLogoUrl = DEFAULT_CLINIC_LOGO_URL;

  return template.evaluate()
      .setTitle('สุขกาย IMC Plus')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =================================================================
// 2. เพิ่มฟังก์ชันจัดการรีเซ็ตรหัสผ่าน (วางไว้ท้ายไฟล์)
// =================================================================

// ฟังก์ชันช่วยสร้าง Hash (ใช้สำหรับการเข้ารหัสรหัสผ่าน)
function _createPasswordHash(password, salt) {
  // รวม password กับ salt แล้ว hash ด้วย SHA-256
  const raw = password + salt;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  // แปลง byte array เป็น base64 string
  return Utilities.base64Encode(digest);
}

// ฟังก์ชันขอรีเซ็ตรหัสผ่าน (ส่งอีเมล)
function requestPasswordReset(email) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName('Users');
  const data = userSheet.getDataRange().getValues();
  
  // อ้างอิง Index ตามไฟล์ PDF (เริ่มนับจาก 0)
  // A=0, B=1, C=2(Email), D=3, E=4, F=5, G=6, H=7(Token), I=8(Expiry)
  const EMAIL_COL = 2; 
  const TOKEN_COL = 7; 
  const EXPIRY_COL = 8; 

  let userRow = -1;
  // วนหาอีเมล (เริ่ม i=1 ข้ามหัวตาราง)
  for (let i = 1; i < data.length; i++) {
    if (data[i][EMAIL_COL] && String(data[i][EMAIL_COL]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      userRow = i + 1; // เก็บเลขแถว (1-based index)
      break;
    }
  }

  if (userRow === -1) {
    return { status: 'error', message: 'ไม่พบอีเมลนี้ในระบบ' };
  }

  // สร้าง Token และเวลาหมดอายุ (1 ชั่วโมง)
  const token = Utilities.getUuid();
  const expiry = new Date().getTime() + (60 * 60 * 1000); 

  // บันทึกลง Sheet
  userSheet.getRange(userRow, TOKEN_COL + 1).setValue(token);
  userSheet.getRange(userRow, EXPIRY_COL + 1).setValue(expiry);

  // สร้าง Link
  const webAppUrl = ScriptApp.getService().getUrl();
  const resetLink = `${webAppUrl}?view=reset&resetToken=${token}`;

  // ส่งอีเมล
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'รีเซ็ตรหัสผ่าน - สุขกาย IMC Plus',
      htmlBody: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0d9488;">ตั้งค่ารหัสผ่านใหม่</h2>
          <p>คุณได้ทำการร้องขอเพื่อเปลี่ยนรหัสผ่านและชื่อผู้ใช้ กรุณาคลิกลิ้งก์ด้านล่างเพื่อดำเนินการ:</p>
          <p>
            <a href="${resetLink}" style="background-color: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              ตั้งรหัสผ่านใหม่
            </a>
          </p>
          <p style="color: #666; font-size: 0.9em;">ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 0.8em; color: #999;">หากคุณไม่ได้ทำรายการนี้ โปรดเพิกเฉยต่ออีเมลฉบับนี้</p>
        </div>
      `
    });
    return { status: 'success', message: 'ส่งลิงก์รีเซ็ตไปที่อีเมลแล้ว กรุณาตรวจสอบ Inbox หรือ Junk Mail' };
  } catch (e) {
    return { status: 'error', message: 'ส่งอีเมลไม่สำเร็จ: ' + e.toString() };
  }
}

function submitNewPassword(token, newUsername, newPassword) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const userSheet = ss.getSheetByName('Users');
  const data = userSheet.getDataRange().getValues();

  // Index ตามไฟล์ PDF
  const USERNAME_COL = 3; // D
  const PASSWORD_COL = 4; // E (Hash)
  const SALT_COL = 5;     // F
  const TOKEN_COL = 7;    // H
  const EXPIRY_COL = 8;   // I

  let targetRow = -1;

  for (let i = 1; i < data.length; i++) {
    // เช็ค Token และดูว่ายังไม่หมดอายุ
    if (String(data[i][TOKEN_COL]) === String(token)) {
      // แปลง Expiry เป็น timestamp
      const expiryVal = data[i][EXPIRY_COL];
      // ตรวจสอบชนิดข้อมูลของวันเวลา
      let expiryTime = 0;
      if (expiryVal instanceof Date) {
        expiryTime = expiryVal.getTime();
      } else {
        expiryTime = Number(expiryVal);
      }

      if (new Date().getTime() < expiryTime) {
        targetRow = i + 1;
        break;
      } else {
        return { status: 'error', message: 'ลิงก์หมดอายุแล้ว กรุณาทำรายการใหม่' };
      }
    }
  }

  if (targetRow === -1) {
    return { status: 'error', message: 'ลิงก์ไม่ถูกต้อง หรือถูกใช้งานไปแล้ว' };
  }

  // 1. ตรวจสอบชื่อผู้ใช้ซ้ำ (Username ต้องไม่ซ้ำกับคนอื่น ยกเว้นตัวเอง)
  for (let i = 1; i < data.length; i++) {
    if (i + 1 !== targetRow && String(data[i][USERNAME_COL]) === newUsername) {
       return { status: 'error', message: 'ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว' };
    }
  }

  // 2. สร้าง Hash รหัสผ่านใหม่
  const newSalt = Utilities.getUuid(); // สร้าง Salt ใหม่
  const passwordHash = _createPasswordHash(newPassword, newSalt);

  // 3. อัปเดตข้อมูลลง Sheet
  userSheet.getRange(targetRow, USERNAME_COL + 1).setValue(newUsername); // New Username
  userSheet.getRange(targetRow, PASSWORD_COL + 1).setValue(passwordHash); // New Hash
  userSheet.getRange(targetRow, SALT_COL + 1).setValue(newSalt);         // New Salt
  
  // 4. ล้าง Token ทิ้ง
  userSheet.getRange(targetRow, TOKEN_COL + 1).setValue('');
  userSheet.getRange(targetRow, EXPIRY_COL + 1).setValue('');

  return { status: 'success', message: 'ตั้งค่าบัญชีเรียบร้อยแล้ว' };
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =================================================================
// INITIAL DATA LOADING
// =================================================================
function getInitialData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 1. ดึงข้อมูลพื้นฐานจาก Dropdown
    const dropdownSheet = ss.getSheetByName('Dropdowns');
    const therapistList = dropdownSheet ? dropdownSheet.getRange('B2:B').getValues().flat().filter(String) : [];
    const zoneList = dropdownSheet ? dropdownSheet.getRange('A2:A').getValues().flat().filter(String) : [];

    // [เพิ่มใหม่] ดึงเลขที่ใบประกอบวิชาชีพของนักกายภาพบำบัด (คอลัมน์ C ของชีต Dropdowns)
    // แล้วจับคู่เป็น Map ชื่อ -> เลขที่ใบประกอบ ส่งให้ฝั่ง Client ใช้เติมอัตโนมัติ
    const therapistLicenseMap = {};
    if (dropdownSheet) {
      const lastDropdownRow = dropdownSheet.getLastRow();
      if (lastDropdownRow > 1) {
        const nameLicenseRows = dropdownSheet.getRange(2, 2, lastDropdownRow - 1, 2).getValues(); // คอลัมน์ B:C
        nameLicenseRows.forEach(row => {
          const name = String(row[0] || '').trim();
          const license = String(row[1] || '').trim();
          if (name) therapistLicenseMap[name] = license;
        });
      }
    }
    
    // 2. ดึงข้อมูลผู้ป่วย (ดึงผ่านฟังก์ชันที่เราแก้ให้มี actualVisits และรายละเอียดครบถ้วน)
    const patients = getPatientsWithDetails(); 
    const nextCN = getNextClinicNumber();
    
    // 3. ดึงข้อมูลที่อยู่ (Address Data)
    const addressSheet = ss.getSheetByName('AddressData');
    const allAddressData = addressSheet ? addressSheet.getDataRange().getValues().slice(1).map(row => {
        return { province: row[0], amphoe: row[1], tambon: row[2], zipcode: row[3] };
    }) : [];

    // 4. ดึงข้อมูลตารางนัดหมาย
    const allSchedules = getAllSchedules(); 

    // 5. ดึงข้อมูลการตั้งค่า (Settings)
    let settings = {};
    try {
      const settingsSheet = ss.getSheetByName('Settings');
      if (settingsSheet) {
        const settingsData = settingsSheet.getDataRange().getValues();
        settingsData.slice(1).forEach(row => { if (row[0]) settings[row[0]] = row[1]; });
      }
    } catch(e) {
      Logger.log('Settings load fallback: ' + e.toString());
    }
    if (!settings.ClinicLogoURL || 
        settings.ClinicLogoURL.includes('pic.in.th') || 
        settings.ClinicLogoURL.includes('photos.fife.usercontent.google.com')) {
      settings.ClinicLogoURL = DEFAULT_CLINIC_LOGO_URL;
    }
    if (!settings.ClinicName) settings.ClinicName = 'สุขกาย IMC Plus';

    return {
      settings,
      therapists: therapistList,
      therapistLicenseMap, // [เพิ่มใหม่] ส่ง Map เลขที่ใบประกอบไปให้ Client
      zones: zoneList,
      nextCN,
      patients, // ข้อมูลที่มีรายละเอียดครบ (Phone, Address, actualVisits)
      addressData: allAddressData,
      schedules: allSchedules
    };
  } catch (e) {
    Logger.log('FATAL Error in getInitialData: ' + e.toString());
    return { error: e.toString() };
  }
}

// =================================================================
// PATIENT DATA FUNCTIONS
// =================================================================
function getNextClinicNumber() {
  const lastRow = patientSheet.getLastRow();
  if (lastRow < 2) {
    const yearBE = (new Date().getFullYear() + 543).toString().slice(-2);
    return yearBE + '0001';
  }
  const lastCN = patientSheet.getRange(lastRow, 3).getValue().toString();
  const currentYearBE = (new Date().getFullYear() + 543).toString().slice(-2);
  
  if (lastCN && lastCN.startsWith(currentYearBE)) {
    let nextNum = parseInt(lastCN.slice(2)) + 1;
    return currentYearBE + nextNum.toString().padStart(4, '0');
  } else {
    return currentYearBE + '0001';
  }
}

function mapHeadersToObject(headers, row) {
  const obj = {};
  headers.forEach((header, i) => {
    // Convert dates to ISO strings for consistency
    obj[header] = row[i] instanceof Date ? row[i].toISOString() : row[i];
  });
  return obj;
}

function getTreatmentRightsDisplay(record) {
  if (!record) return '';
  const rights = String(record.TreatmentRights || '').trim();
  const other = String(record.TreatmentRightsOther || '').trim();
  if (rights === 'อื่นๆ') return other || rights;
  return rights || other || '';
}

function ensureSheetColumn(sheet, columnName) {
  const headerValues = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0] || [];
  let columnIndex = headerValues.indexOf(columnName);
  if (columnIndex === -1) {
    columnIndex = headerValues.length;
    sheet.getRange(1, columnIndex + 1).setValue(columnName);
  }
  return columnIndex;
}

// ปรับให้ทำงานเร็วขึ้นมาก: เดิมวนอ่านหัวตาราง (getValues) แยกทีละคอลัมน์ผ่าน ensureSheetColumn
// ซึ่งฟอร์มอย่าง TMSE/MHQ มีมากถึง 30-60 ฟิลด์ ทำให้แต่ละครั้งที่บันทึกเกิด API call อ่าน/เขียน
// ชีทซ้ำๆ หลายสิบรอบ (ช้ามาก และยิ่งช้าลงไปอีกเมื่อทำงานอยู่ภายใน LockService)
// เปลี่ยนเป็นอ่านหัวตารางครั้งเดียว เช็คในหน่วยความจำ แล้วเขียนคอลัมน์ใหม่ที่ขาดทั้งหมดในครั้งเดียว
function ensureSheetColumns(sheet, columnNames) {
  if (!sheet || !Array.isArray(columnNames) || columnNames.length === 0) return [];
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headerValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  const existing = new Set(headerValues.filter(h => h !== ''));
  const missing = columnNames.filter(name => !existing.has(name));

  if (missing.length > 0) {
    const startCol = headerValues.filter(h => h !== '').length + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    return headerValues.filter(h => h !== '').concat(missing);
  }
  return headerValues;
}

function normalizeBooleanFlag(value) {
  return value === true || value === 'true' || value === 'TRUE' || value === '1' || value === 1 || value === 'on';
}

function applyServiceTypePdfFlags(target, source) {
  const home = normalizeBooleanFlag(source.ServiceType_Home);
  const clinic = normalizeBooleanFlag(source.ServiceType_Clinic);
  const serviceType = String(source.ServiceType || '').trim().toLowerCase();

  target.ServiceType_Home = home || serviceType === 'home' || serviceType === 'house' || serviceType === 'home visit';
  target.ServiceType_Clinic = clinic || serviceType === 'clinic' || serviceType === 'opd' || serviceType === 'outpatient';

  if (!target.ServiceType_Home && !target.ServiceType_Clinic) {
    target.ServiceType_Home = false;
    target.ServiceType_Clinic = false;
  }
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "GMT+7", "yyyy-MM-dd");
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "GMT+7", "yyyy-MM-dd");
  }

  return '';
}

function getBudgetStatusValue(value) {
  const receivedStatus = '\u0e23\u0e31\u0e1a\u0e22\u0e2d\u0e14';
  return String(value || '').trim() === receivedStatus ? receivedStatus : '\u0e23\u0e2d\u0e42\u0e2d\u0e19';
}

// ค้นหาฟังก์ชันเดิมใน code.gs แล้วแทนที่ด้วยส่วนนี้
function getPatientsWithDetails() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const patientSheet = ss.getSheetByName('Patients');
  if (!patientSheet) return [];

  const patientData = patientSheet.getDataRange().getValues();
  const patientHeaders = patientData.shift();

  // --- A. ดึง BI ล่าสุดจากชีท BIAssessments ---
  const latestBIMap = {};
  const biSheet = ss.getSheetByName('BIAssessments');
  if (biSheet) {
    const biData = biSheet.getDataRange().getValues();
    if (biData.length > 1) {
      const biHeaders = biData.shift();
      const pidIdx = biHeaders.indexOf('PatientID');
      const scoreIdx = biHeaders.indexOf('TotalScore');
      const dateIdx = biHeaders.indexOf('AssessmentDate');
      biData.forEach(row => {
        const pid = String(row[pidIdx]).trim();
        const score = row[scoreIdx];
        const date = row[dateIdx] instanceof Date ? row[dateIdx] : new Date(0);
        if (!latestBIMap[pid] || date >= latestBIMap[pid].date) {
          latestBIMap[pid] = { score: score, date: date, record: row, headers: biHeaders };
        }
      });
    }
  }

  // --- A2. ดึงรายชื่อ PatientID ที่มีประวัติแบบประเมิน TMSE / MHQ / Dysphagia (สำหรับคอลัมน์ "คัดกรอง") ---
  const buildPatientIdSet = (sheetObj) => {
    const set = {};
    if (!sheetObj) return set;
    const data = sheetObj.getDataRange().getValues();
    if (data.length < 2) return set;
    const headers = data.shift();
    const pidIdx = headers.indexOf('PatientID');
    if (pidIdx === -1) return set;
    data.forEach(row => { set[String(row[pidIdx]).trim()] = true; });
    return set;
  };
  const tmsePatientSet = buildPatientIdSet(tmseSheet);
  const mhqPatientSet = buildPatientIdSet(mhqSheet);
  const dysphagiaPatientSet = buildPatientIdSet(dysphagiaSheet);

  // --- B. ดึงวันที่เยี่ยมจริงจาก OPD และ SOAP (Actual Visits) ---
  const actualVisitsMap = {}; 
  ['OPDRecords', 'SOAPNotes'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return;
    const h = data[0];
    const pIdx = h.indexOf('PatientID');
    let dIdx = h.indexOf('VisitDate');
    if (dIdx === -1) dIdx = h.indexOf('Date');
    for (let i = 1; i < data.length; i++) {
      const pid = String(data[i][pIdx]).trim();
      const rawD = data[i][dIdx];
      if (pid && rawD instanceof Date) {
        const dStr = Utilities.formatDate(rawD, "GMT+7", "yyyy-MM-dd");
        if (!actualVisitsMap[pid]) actualVisitsMap[pid] = [];
        if (!actualVisitsMap[pid].includes(dStr)) actualVisitsMap[pid].push(dStr);
      }
    }
  });

  // --- C. ดึงข้อมูลตารางนัดหมายทั้งหมด ---
  const schedSheet = ss.getSheetByName('Schedules');
  const allSchedulesData = schedSheet ? schedSheet.getDataRange().getValues() : [];
  const sHeaders = allSchedulesData.shift() || [];
  const sPidIdx = sHeaders.indexOf('PatientID');
  const sDateIdx = sHeaders.indexOf('ScheduledDate');
  const today = new Date();
  today.setHours(0,0,0,0);

  // --- D. ประกอบข้อมูล ---
  return patientData.map(row => {
    let p = mapHeadersToObject(patientHeaders, row);
    const pid = String(p.PatientID).trim();
    p.actualVisits = actualVisitsMap[pid] || [];

    // กู้คืนที่อยู่และเบอร์โทร
    const addr = [];
    if (p.HouseNumber) addr.push(p.HouseNumber);
    if (p.Moo) addr.push(`ม.${p.Moo}`);
    if (p.Tambon) addr.push(`ต.${p.Tambon}`);
    p.ShortAddress = addr.join(' ') || '-';
    p.Phone = p.Phone || p.Telephone || '-';
    const fullAddr = [];
    if (p.HouseNumber) fullAddr.push(`เลขที่ ${p.HouseNumber}`);
    if (p.Moo) fullAddr.push(`ม.${p.Moo}`);
    if (p.Tambon) fullAddr.push(`ต.${p.Tambon}`);
    if (p.Amphoe) fullAddr.push(`อ.${p.Amphoe}`);
    if (p.Province) fullAddr.push(`จ.${p.Province}`);
    if (p.PostalCode) fullAddr.push(p.PostalCode);
    p.FullAddress = fullAddr.join(' ') || '-';
    p.TreatmentRightsDisplay = getTreatmentRightsDisplay(p);

    // จัดการคะแนน BI
    p.LatestBI = latestBIMap[pid] ? latestBIMap[pid].score : (p.InitialBI || 0);
    
    // ดึง Multiple Impairment
    if (latestBIMap[pid]) {
      let biObj = {};
      latestBIMap[pid].headers.forEach((h, i) => biObj[h] = latestBIMap[pid].record[i]);
      p.multipleImpairment = getCombinedImpairmentText(biObj);
    } else { p.multipleImpairment = "-"; }

    // --- กู้คืน "วันนัดถัดไป" (NextAppointment) ---
    // หาวันนัดที่น้อยที่สุดที่ >= วันนี้ และยังไม่มีเอกสารการเยี่ยมในวันนั้น
    let nextDate = allSchedulesData
      .filter(r => String(r[sPidIdx]).trim() === pid)
      .map(r => r[sDateIdx])
      .filter(d => d instanceof Date && d >= today)
      .filter(d => !p.actualVisits.includes(Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd")))
      .sort((a, b) => a - b)[0];

    p.NextAppointment = nextDate ? nextDate.toISOString() : null;
    
    // สรุปข้อมูลการเยี่ยม (เยี่ยมแล้ว / นัดทั้งหมด)
    const totalSched = allSchedulesData.filter(r => String(r[sPidIdx]).trim() === pid).length;
    p.scheduleInfo = { 
      completed: p.actualVisits.length, 
      total: totalSched 
    };
    p.DayEnd = p.DueDate ? new Date(p.DueDate).toISOString() : null;

    // สถานะการคัดกรอง (สำหรับคอลัมน์ "คัดกรอง" ในหน้าทะเบียนผู้ป่วย)
    p.hasTmse = !!tmsePatientSet[pid];
    p.hasMhq = !!mhqPatientSet[pid];
    p.hasDysphagia = !!dysphagiaPatientSet[pid];

    return p;
  }).sort((a, b) => String(b.ClinicNumber).localeCompare(String(a.ClinicNumber), undefined, { numeric: true }));
}

function getPatientById(id) {
  try {
    const data = patientSheet.getDataRange().getValues();
    const headers = data.shift();
    const idIndex = headers.indexOf('PatientID');
    const patientData = data.find(row => String(row[idIndex]).trim() == String(id).trim());

    if (!patientData) {
      Logger.log(`Patient with ID: ${id} not found.`);
      return null;
    }

    const patientObj = mapHeadersToObject(headers, patientData);

    const addressParts = [];
    if (patientObj.HouseNumber) addressParts.push(`บ้านเลขที่ ${patientObj.HouseNumber}`);
    if (patientObj.Moo) addressParts.push(`หมู่ ${patientObj.Moo}`);
    if (patientObj.Tambon) addressParts.push(`ต.${patientObj.Tambon}`);
    if (patientObj.Amphoe) addressParts.push(`อ.${patientObj.Amphoe}`);
    if (patientObj.Province) addressParts.push(`จ.${patientObj.Province}`);
    if (patientObj.PostalCode) addressParts.push(patientObj.PostalCode);
    patientObj.FullAddress = addressParts.join(' ');
    patientObj.TreatmentRightsDisplay = getTreatmentRightsDisplay(patientObj);
    
    if (patientObj.PatientPhotoURL) {
      try {
        const fileId = patientObj.PatientPhotoURL.split('id=')[1];
        if (fileId) {
          patientObj.PatientPhotoBase64 = getImageAsBase64(fileId);
        }
      } catch (e) {
        Logger.log(`Could not get patient photo as Base64 for patient ID ${id}: ${e.message}`);
        patientObj.PatientPhotoBase64 = null;
      }
    }
    return patientObj;

  } catch (e) {
    Logger.log(`Error in getPatientById for ID ${id}: ${e.message}`);
    return null;
  }
}

function savePatient(patientObject) {
  try {
    // [เพิ่มใหม่] ถ้าฟอร์มส่งฟิลด์ใหม่มา (เช่น AssignedPTLicense) แต่ชีต Patients ยังไม่มีคอลัมน์นี้
    // ให้สร้างคอลัมน์เพิ่มให้อัตโนมัติ เพื่อไม่ให้ข้อมูลตกหล่น
    const headers = ensureSheetColumns(patientSheet, Object.keys(patientObject).filter(key => key !== 'photoData'));
    const idColIndex = headers.indexOf('PatientID');
    if (patientObject.photoData) {
      // --- START: ส่วนที่แก้ไข ---
      // เปลี่ยนจาก PatientPhotoURL เป็น PatientPhotoUrl (u ตัวเล็ก)
      patientObject.PatientPhotoURL = saveImageToDrive(patientObject.photoData, `photo-${patientObject.ClinicNumber}`);
    }

    if (patientObject.PatientID) { // Update existing patient
      const data = patientSheet.getDataRange().getValues();
      const rowIndex = data.findIndex(row => String(row[idColIndex]) === String(patientObject.PatientID));
      if (rowIndex > 0) { // rowIndex is 0-based for the data array, but sheet is 1-based
        const newRow = headers.map(header => patientObject[header] !== undefined ? patientObject[header] : '');
        patientSheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([newRow]);
      } else {
        throw new Error('ไม่พบผู้ป่วยที่ต้องการแก้ไข');
      }
    } else { // Create new patient
      patientObject.PatientID = Utilities.getUuid();
      patientObject.Timestamp = new Date();
      const newRow = headers.map(header => patientObject[header] || '');
      patientSheet.appendRow(newRow);
    }
    
    SpreadsheetApp.flush();
    const updatedPatients = getPatientsWithDetails();
    return {
      status: 'success',
      message: 'บันทึกข้อมูลผู้ป่วยสำเร็จ!',
      patients: updatedPatients
    };

  } catch (e) {
    Logger.log(e);
    return { status: 'error', message: e.message };
  }
}

function deletePatientById(patientId) {
  try {
    if (!patientId) {
      throw new Error("ไม่ได้ระบุ ID ผู้ป่วยสำหรับลบ");
    }

    // Array of sheets to check, along with the column index of PatientID
    const sheetsToDeleteFrom = [
      { sheet: patientSheet, idColumn: 'PatientID' },
      { sheet: biSheet, idColumn: 'PatientID' },
      { sheet: opdSheet, idColumn: 'PatientID' },
      { sheet: consentSheet, idColumn: 'PatientID' },
      { sheet: soapSheet, idColumn: 'PatientID' },
      { sheet: scheduleSheet, idColumn: 'PatientID' },
      { sheet: tmseSheet, idColumn: 'PatientID' },
      { sheet: mhqSheet, idColumn: 'PatientID' },
      { sheet: dysphagiaSheet, idColumn: 'PatientID' },
    ];

    sheetsToDeleteFrom.forEach(item => {
      const data = item.sheet.getDataRange().getValues();
      if (data.length < 1) return;
      const headers = data[0];
      const idColIndex = headers.indexOf(item.idColumn);
      if (idColIndex === -1) return;

      // Find rows to delete from bottom to top to avoid shifting indices
      const rowsToDelete = [];
      const patientIdStr = String(patientId).trim();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idColIndex]).trim() === patientIdStr) {
          rowsToDelete.push(i + 1); // Sheet rows are 1-based
        }
      }
      rowsToDelete.forEach(rowIndex => {
        item.sheet.deleteRow(rowIndex);
      });
    });

    const remainingData = getPatientsWithDetails();

    return {
      status: 'success',
      message: 'ลบข้อมูลผู้ป่วยและรายการที่เกี่ยวข้องทั้งหมดสำเร็จ',
      patients: remainingData
    };

  } catch (e) {
    Logger.log('Error in deletePatientById: ' + e);
    return { status: 'error', message: e.toString() };
  }
}
// [เพิ่มฟังก์ชันนี้ต่อท้ายไฟล์ หรือในส่วน PATIENT DATA FUNCTIONS]

/**
 * เปลี่ยนสถานะผู้ป่วยเป็น "Discharged" (ปิดบริการ)
 */
function dischargePatient(patientId) {
  try {
    const headers = patientSheet.getRange(1, 1, 1, patientSheet.getLastColumn()).getValues()[0];
    const idColIndex = headers.indexOf('PatientID');
    // ต้องมีคอลัมน์ PatientStatus ในชีต Patients
    let statusColIndex = headers.indexOf('PatientStatus');

    // ถ้ายังไม่มีคอลัมน์ PatientStatus ให้สร้างใหม่
    if (statusColIndex === -1) {
      statusColIndex = headers.length;
      patientSheet.getRange(1, statusColIndex + 1).setValue('PatientStatus');
    }

    const data = patientSheet.getDataRange().getValues();
    const rowIndex = data.findIndex(row => String(row[idColIndex]) === String(patientId));

    if (rowIndex > 0) {
      patientSheet.getRange(rowIndex + 1, statusColIndex + 1).setValue('Discharged');
      return { status: 'success', message: 'ปิดบริการผู้ป่วยเรียบร้อยแล้ว' };
    } else {
      throw new Error('ไม่พบผู้ป่วย');
    }
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// [แก้ไขฟังก์ชัน getPatientsWithDetails เล็กน้อย เพื่อดึงค่า Status]
// (คุณสามารถใช้โค้ดเดิมได้ แต่ให้แน่ใจว่า mapHeadersToObject ดึงคอลัมน์ใหม่มาด้วย
// ซึ่งฟังก์ชัน mapHeadersToObject เดิมดึงมาทั้งหมดอยู่แล้ว ดังนั้นไม่ต้องแก้โค้ดหลัก
// แต่ต้องมั่นใจว่าในชีตมี Header ชื่อ PatientStatus)
// =================================================================
// UPDATE RECORD KEPT STATUS
// =================================================================

/**
 * อัปเดตสถานะการเก็บเวชระเบียน (Checkbox) ในชีต Patients
 * @param {string} patientId - ID ของผู้ป่วย
 * @param {boolean} status - สถานะ true (checked) หรือ false (unchecked)
 */
function updateRecordKeptStatus(patientId, status) {
  try {
    if (!patientId) {
      throw new Error("ไม่พบ PatientID");
    }

    const headers = patientSheet.getRange(1, 1, 1, patientSheet.getLastColumn()).getValues()[0];
    const idColIndex = headers.indexOf('PatientID');
    const recordKeptColIndex = headers.indexOf('RecordKept'); // <--- **สำคัญ:** คุณต้องเพิ่มคอลัมน์ชื่อ 'RecordKept' ในชีต 'Patients' ของคุณด้วย

    if (recordKeptColIndex === -1) {
      throw new Error("ไม่พบคอลัมน์ 'RecordKept' ในชีต 'Patients'");
    }

    const data = patientSheet.getDataRange().getValues();
    const rowIndex = data.findIndex(row => String(row[idColIndex]) === String(patientId));

    if (rowIndex > 0) { // rowIndex 0 คือ header
      patientSheet.getRange(rowIndex + 1, recordKeptColIndex + 1).setValue(status);
      return { status: 'success', message: 'อัปเดตสถานะสำเร็จ' };
    } else {
      throw new Error('ไม่พบผู้ป่วย');
    }
  } catch (e) {
    Logger.log('Error in updateRecordKeptStatus: ' + e);
    return { status: 'error', message: e.toString() };
  }
}

// =================================================================
// ADDRESS DROPDOWN FUNCTIONS
// =================================================================
function getProvinces() {
  const provinceColumn = addressSheet.getRange('A2:A' + addressSheet.getLastRow()).getValues();
  return [...new Set(provinceColumn.flat())].sort();
}

function getAmphoes(province) {
  const data = addressSheet.getDataRange().getValues();
  return [...new Set(data.filter(row => row[0] === province).map(row => row[1]))].sort();
}

function getTambons(province, amphoe) {
  const data = addressSheet.getDataRange().getValues();
  return [...new Set(data.filter(row => row[0] === province && row[1] === amphoe).map(row => row[2]))].sort();
}

function getPostalCode(province, amphoe, tambon) {
    const data = addressSheet.getDataRange().getValues();
    const found = data.find(row => row[0] === province && row[1] === amphoe && row[2] === tambon);
    return found ? found[3] : '';
}

// =================================================================
// GENERIC CRUD FOR SUB-RECORDS (BI, OPD, CONSENT, SOAP)
// =================================================================

function getRecordsByPatientId(sheet, patientId, returnAll = false) {
  try {
    const allValues = sheet.getDataRange().getValues();
    if (allValues.length < 2) return { status: 'success', records: [] };
    
    const headers = allValues.shift();
    
    if (returnAll) {
      const allRecords = allValues.map(row => mapHeadersToObject(headers, row));
      return { status: 'success', records: allRecords };
    }

    const idIndex = headers.indexOf('PatientID');
    // ใช้เปรียบเทียบแบบ String เสมอ เพราะบางแถวในชีท (โดยเฉพาะข้อมูลเก่า/นำเข้า)
    // อาจถูกเก็บเป็นชนิด Number แทน String ทำให้ === ไม่ตรงกันทั้งที่ ID เดียวกัน
    const patientIdStr = String(patientId).trim();
    const patientRows = allValues.filter(row => String(row[idIndex]).trim() === patientIdStr);
    const records = patientRows.map(row => mapHeadersToObject(headers, row));
    
    const dateCol = headers.find(h => h.toLowerCase().includes('date'));
    if(dateCol){
      records.sort((a, b) => new Date(b[dateCol]) - new Date(a[dateCol]));
    }

    return { status: 'success', records: records };
  } catch (e) {
    Logger.log(`Error in getRecordsByPatientId for sheet ${sheet.getName()}: ${e}`);
    return { status: 'error', message: e.toString() };
  }
}

function getRecordById(sheet, recordId, idColumn) {
   try {
    const allValues = sheet.getDataRange().getValues();
    const headers = allValues.shift();
    const idIndex = headers.indexOf(idColumn);
    // ใช้เปรียบเทียบแบบ String เสมอ ป้องกันปัญหา ID ในชีทถูกเก็บเป็นชนิด Number
    // ทำให้เทียบด้วย === ไม่ตรงทั้งที่เป็น ID เดียวกัน (สาเหตุของ "ไม่พบข้อมูล")
    const recordIdStr = String(recordId).trim();
    const recordRow = allValues.find(row => String(row[idIndex]).trim() === recordIdStr);

    if (!recordRow) {
      return { status: 'error', message: 'ไม่พบข้อมูล' };
    }
    const record = mapHeadersToObject(headers, recordRow);
    
    // Add Base64 images if URLs exist
    for (const key in record) {
        if (key.endsWith('Url') && record[key]) {
            try {
                const base64Key = key.replace('Url', 'Base64');
                const fileId = record[key].split('id=')[1];
                if (fileId) {
                    record[base64Key] = getImageAsBase64(fileId);
                }
            } catch (e) {
                Logger.log(`Could not get Base64 for ${key}: ${e}`);
            }
        }
    }

    return { status: 'success', record: record };
  } catch (e) {
    Logger.log(`Error in getRecordById for sheet ${sheet.getName()}: ${e}`);
    return { status: 'error', message: e.toString() };
  }
}

// (ในไฟล์ code.gs.txt)
// [ลบฟังก์ชัน saveRecord ของเก่าทิ้งทั้งหมด (บรรทัด 93-106)]
// [และวางโค้ดใหม่นี้แทนที่]

function saveRecord(sheet, recordObject, idColumn, prefix) {
  // ป้องกันปัญหา "ไม่พบแถวที่ต้องการแก้ไข" ที่เกิดแบบสุ่ม เมื่อมีผู้ใช้หลายคนบันทึกข้อมูล
  // ในชีทเดียวกันพร้อมกัน (Race Condition): ถ้าคนที่ 2 เริ่มอ่านแถวก่อนคนที่ 1 เขียนเสร็จ
  // ตำแหน่งแถว (rowIndex) ที่อ่านมาอาจคลาดเคลื่อนไปจากตำแหน่งจริงหลังบันทึก ทำให้หาแถวไม่เจอ
  // ใช้ LockService ล็อกให้ทำทีละคนเฉพาะช่วงอ่าน-หา-เขียนแถว แก้ปัญหานี้ได้ตรงจุดที่สุด
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // รอคิวได้สูงสุด 15 วินาที (ลดจาก 30 วิ เพราะ critical section เร็วขึ้นมากแล้ว)
  } catch (lockErr) {
    Logger.log(`Could not obtain lock for saveRecord on sheet ${sheet.getName()}: ${lockErr}`);
    return { status: 'error', message: 'ระบบมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองบันทึกใหม่อีกครั้ง' };
  }
  try {
    const keysToEnsure = Object.keys(recordObject).filter(key => !key.endsWith('Base64'));
    const headers = ensureSheetColumns(sheet, keysToEnsure);
    const recordId = recordObject[idColumn]; 
    let oldRecord = {}; // สร้างตัวแปรสำหรับเก็บข้อมูลเก่า

    // Handle image saving
    for (const key in recordObject) {
      if (key.endsWith('Base64') && recordObject[key]) {
        const urlKey = key.replace('Base64', 'Url');
        recordObject[urlKey] = saveImageToDrive(recordObject[key], `${prefix}-${key.replace('Base64','')}-${recordObject.PatientID}-${Date.now()}`); 
      }
    }
    
    // Check if editing and images are not updated, preserve old URLs
    if (recordId) {
        // --- START: แก้ไขโลจิกส่วนนี้ ---
        const oldRecordData = getRecordById(sheet, recordId, idColumn);
        if (oldRecordData.status === 'success') {
          oldRecord = oldRecordData.record || {};
        }

        headers.forEach(header => {
            if (header.endsWith('Url')) {
                const base64Key = header.replace('Url', 'Base64');
                // ถ้าไม่มีการส่ง Base64 ใหม่มา ให้ใช้ URL เก่า
                if (!recordObject[base64Key]) { 
               
                     recordObject[header] = oldRecord[header] || '';
                }
            }
        });
        // --- END: แก้ไขโลจิกส่วนนี้ ---
    }


    if (recordId) { // Update
      const allValues = sheet.getDataRange().getValues();
      const idIndex = headers.indexOf(idColumn);
      // ใช้เปรียบเทียบแบบ String เสมอ ป้องกันปัญหา ID ในชีทถูกเก็บเป็นชนิด Number
      // (เช่น ID ที่เป็นตัวเลขล้วนจาก Date.now()) ทำให้ === ไม่ตรงกันทั้งที่เป็นแถวเดียวกัน
      // นี่คือสาเหตุของ error "ไม่พบแถวที่ต้องการแก้ไข" ที่เกิดแบบสุ่มกับบางเคส
      const recordIdStr = String(recordId).trim();
      const rowIndex = allValues.findIndex(row => String(row[idIndex]).trim() === recordIdStr);
      if (rowIndex > 0) {
        // --- START: นี่คือจุดแก้ไขที่สำคัญที่สุด ---
        // เราจะรวม object เก่า (oldRecord) กับ object ใหม่ (recordObject)
        // เพื่อให้แน่ใจว่าข้อมูลที่ไม่ถูกแก้ไข (เช่น Timestamp) ไม่หาย
        // และข้อมูลใหม่ (เช่น PlanOfTreatment) จะถูกเขียนทับลงไป
        const updatedData = { ...oldRecord, ...recordObject };
        const newRow = headers.map(header => updatedData[header] !== undefined ? updatedData[header] : '');
        // --- END: แก้ไขบรรทัดนี้ ---
        sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([newRow]);
      } else { throw new Error('ไม่พบแถวที่ต้องการแก้ไข'); 
      }
    } else { // Create
      recordObject[idColumn] = `${prefix}${Date.now()}`;
      recordObject['Timestamp'] = new Date(); 
      const newRow = headers.map(header => recordObject[header] !== undefined ? recordObject[header] : '');
      sheet.appendRow(newRow);
    }

    SpreadsheetApp.flush();
    return { status: 'success', message: 'บันทึกข้อมูลสำเร็จ', recordId: recordObject[idColumn] };
  } catch (e) {
    Logger.log(`Error in saveRecord for sheet ${sheet.getName()}: ${e}`);
    return { status: 'error', message: e.toString() }; 
  } finally {
    lock.releaseLock();
  }
}

function deleteRecordById(sheet, recordId, idColumn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    Logger.log(`Could not obtain lock for deleteRecordById on sheet ${sheet.getName()}: ${lockErr}`);
    return { status: 'error', message: 'ระบบมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองลบใหม่อีกครั้ง' };
  }
  try {
    const data = sheet.getDataRange().getValues();
    const idIndex = data[0].indexOf(idColumn);
    // ใช้เปรียบเทียบแบบ String เสมอ ป้องกันปัญหาชนิดข้อมูล ID ไม่ตรงกันเช่นเดียวกับจุดอื่น
    const recordIdStr = String(recordId).trim();
    const rowIndex = data.findIndex(row => String(row[idIndex]).trim() === recordIdStr);
    if (rowIndex > 0) {
      sheet.deleteRow(rowIndex + 1);
      return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
    } else {
      return { status: 'error', message: 'ไม่พบข้อมูลที่ต้องการลบ' };
    }
  } catch (e) {
    Logger.log(`Error deleting from ${sheet.getName()}: ${e}`);
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}


// =================================================================
// SPECIFIC HANDLERS FOR EACH RECORD TYPE
// =================================================================

// --- BI Assessments ---
function getBIAssessmentsByPatientId(patientId) { return getRecordsByPatientId(biSheet, patientId); }
function getBIAssessmentById(id) { return getRecordById(biSheet, id, 'AssessmentID'); }
function saveBIAssessment(data) { return saveRecord(biSheet, data, 'AssessmentID', 'BI'); }
function deleteBIAssessmentById(id) { return deleteRecordById(biSheet, id, 'AssessmentID'); }

// --- OPD Records ---
/**
 * Fetches necessary data for opening a new OPD form.
 * @param {string} patientId - The ID of the patient.
 * @param {number} initialBIFromPatient - The patient's initial BI score from registration, passed from the client.
 * @returns {object} An object with the latest BI score and the next visit count.
 */
function getOpdData(patientId, initialBIFromPatient) {
    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        
        // 1. ดึงคะแนน BI ล่าสุด (เพื่อเอาไปใส่ใน OPD)
        const biSheet = ss.getSheetByName('BIAssessments');
        let latestBI = initialBIFromPatient; // ค่า Default คือค่าแรกรับ
        
        if (biSheet) {
            const bData = biSheet.getDataRange().getValues();
            if (bData.length > 1) {
                const bHeaders = bData.shift();
                const bPidIdx = bHeaders.indexOf('PatientID');
                const bScoreIdx = bHeaders.indexOf('TotalScore');
                const bDateIdx = bHeaders.indexOf('AssessmentDate');

                if (bPidIdx !== -1 && bScoreIdx !== -1) {
                    let maxDate = new Date(0);
                    bData.forEach(row => {
                        if (String(row[bPidIdx]).trim() === String(patientId).trim()) {
                            const d = row[bDateIdx] ? new Date(row[bDateIdx]) : new Date(0);
                            if (d > maxDate) {
                                maxDate = d;
                                latestBI = row[bScoreIdx];
                            }
                        }
                    });
                }
            }
        }

        // 2. [ส่วนที่เพิ่ม] คำนวณครั้งที่ (Visit Count) อัตโนมัติ
        // โดยนับจากจำนวนเอกสาร OPD + SOAP ที่มีอยู่จริง + 1
        const opdSheet = ss.getSheetByName('OPDRecords');
        const soapSheet = ss.getSheetByName('SOAPNotes');
        
        const countRecords = (sheet) => {
            let c = 0;
            if (sheet) {
                const data = sheet.getDataRange().getValues();
                const pidIdx = data[0].indexOf('PatientID');
                if (pidIdx !== -1) {
                    for(let i=1; i<data.length; i++) {
                        if(String(data[i][pidIdx]).trim() === String(patientId).trim()) c++;
                    }
                }
            }
            return c;
        };

        const totalRecords = countRecords(opdSheet) + countRecords(soapSheet);
        const nextVisitCount = totalRecords + 1; // ครั้งถัดไป

        return { 
            status: 'success', 
            initialBI: latestBI, 
            visitCount: nextVisitCount // ส่งค่าครั้งที่กลับไป
        };

    } catch(e) {
        return { status: 'error', message: e.toString() };
    }
}
function getOpdRecordsByPatientId(patientId) { return getRecordsByPatientId(opdSheet, patientId); }
function getOpdRecordById(id) {
    const result = getRecordById(opdSheet, id, 'RecordID');
    // --- แก้ไขส่วนนี้: ถ้าไม่มีรูปที่วาดไว้ ให้ส่งรูปต้นฉบับไปแทน ---
    if (result.status === 'success' && result.record && !result.record.BodyChartDrawingBase64) {
        result.record.BodyChartDrawingBase64 = getImageAsBase64(BODY_CHART_IMAGE_ID);
    }
    return result;
}
function saveOpdRecord(data) {
    ensureSheetColumns(opdSheet, [
        'ServiceType_Home', 'ServiceType_Clinic',
        'Communication', 'CommunicationAphasiaType',
        'Equipment', 'EquipmentOther',
        'SpecialAssessment',
        'SpecialAssessment_Details',
        'SpecialAssessment_ASIA_NLI', 'SpecialAssessment_ASIA_AIS', 'SpecialAssessment_ASIA_Diagnosis',
        'GeoLocationTimestamp', 'GeoLatitude', 'GeoLongitude', 'GeoAddress', 'GeoTimestamp',
        'GrossMotorFunction', 'HandFunction', 'BalanceGrid',
        'PE_GrossMotorFunction_Check', 'PE_HandFunction_Check', 'PE_Balance_Check', 'PE_ChestOther_Check',
        'HF_Side_Rt', 'HF_Side_Lt'
    ]);
    // --- แก้ไขส่วนนี้: ถ้าไม่ได้วาด Body Chart ใหม่ตอนสร้าง ให้บันทึกรูปต้นฉบับลงไป ---
    if (!data.BodyChartDrawingBase64 && !data.RecordID) {
        const originalImageBase64 = getImageAsBase64(BODY_CHART_IMAGE_ID);
        if (originalImageBase64) {
            data.BodyChartDrawingUrl = saveImageToDrive(originalImageBase64, `opd-bodychart-base-${data.PatientID}-${Date.now()}`);
        }
    }
    return saveRecord(opdSheet, data, 'RecordID', 'OPD');
}

function deleteOpdRecordById(id) { return deleteRecordById(opdSheet, id, 'RecordID'); }
function getNextVisitCount(patientId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. นับจำนวนเอกสารที่ทำเสร็จแล้ว (Completed) จากชีต OPD และ SOAP
  let completedCount = 0;
  const opdSheet = ss.getSheetByName('OPDRecords');
  const soapSheet = ss.getSheetByName('SOAPNotes');
  
  // Helper นับจำนวนแถวที่ PatientID ตรงกัน
  const countRecords = (sheet) => {
    let c = 0;
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const pidIdx = data[0].indexOf('PatientID');
      if (pidIdx !== -1) {
        for(let i=1; i<data.length; i++) {
          // แปลงเป็น String และ Trim เพื่อความชัวร์ในการเปรียบเทียบ
          if(String(data[i][pidIdx]).trim() === String(patientId).trim()) c++;
        }
      }
    }
    return c;
  };

  completedCount += countRecords(opdSheet); // OPD นับ 1
  completedCount += countRecords(soapSheet); // SOAP นับเพิ่ม

  // 2. นับจำนวนนัดทั้งหมด (Total Scheduled)
  let totalScheduled = 0;
  const scheduleSheet = ss.getSheetByName('Schedules');
  if (scheduleSheet) {
    const sData = scheduleSheet.getDataRange().getValues();
    const sPidIdx = sData[0].indexOf('PatientID');
    if (sPidIdx !== -1) {
      for(let i=1; i<sData.length; i++) {
        if(String(sData[i][sPidIdx]).trim() === String(patientId).trim()) totalScheduled++;
      }
    }
  }

  // 3. ส่งข้อมูลกลับ
  return {
    visitCount: completedCount + 1, // ครั้งต่อไป = ที่ทำเสร็จแล้ว + 1
    completed: completedCount,
    total: totalScheduled,
    status: 'success'
  };
}

// --- Consent Forms ---
function getConsentsByPatientId(patientId) { return getRecordsByPatientId(consentSheet, patientId); }
function getConsentById(id) { return getRecordById(consentSheet, id, 'ConsentID'); }
function saveConsent(data) { return saveRecord(consentSheet, data, 'ConsentID', 'CON'); }
function deleteConsentById(id) { return deleteRecordById(consentSheet, id, 'ConsentID'); }

// --- SOAP Notes ---
function getSOAPNotesByPatientId(patientId) { return getRecordsByPatientId(soapSheet, patientId); }
function getSOAPNoteById(id) { return getRecordById(soapSheet, id, 'SOAPNoteID'); }
function saveSOAPNote(data) {
  ensureSheetColumns(soapSheet, [
    'ServiceType_Home', 'ServiceType_Clinic',
    'GeoLocationTimestamp', 'GeoLatitude', 'GeoLongitude', 'GeoAddress', 'GeoTimestamp'
  ]);
  return saveRecord(soapSheet, data, 'SOAPNoteID', 'SOAP');
}
function deleteSOAPNoteById(id) { return deleteRecordById(soapSheet, id, 'SOAPNoteID'); }

// --- TMSE Records ---
function getTMSERecordsByPatientId(patientId) { return getRecordsByPatientId(tmseSheet, patientId); }
function getTMSERecordById(id) { return getRecordById(tmseSheet, id, 'RecordID'); }
function saveTMSERecord(data) {
  ensureSheetColumns(tmseSheet, [
    'PatientID', 'VisitCount', 'VisitDate', 'Timestamp',
    'q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job', 'score_orientation',
    'q_reg_1', 'q_reg_2', 'q_reg_3', 'score_registration',
    'q_tree', 'q_car', 'q_hand', 'score_recall',
    'q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon', 'score_attention',
    'q_calc1', 'q_calc2', 'q_calc3', 'score_calculation',
    'q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read', 'q_draw', 'q_similar1', 'q_similar2', 'score_language',
    'total_score', 'result_status'
  ]);
  return saveRecord(tmseSheet, data, 'RecordID', 'TMSE');
}
function deleteTMSERecordById(id) { return deleteRecordById(tmseSheet, id, 'RecordID'); }

// --- MHQ Records (Mental Health Questionnaire: 2Q / 9Q / 8Q) ---
function getMHQRecordsByPatientId(patientId) { return getRecordsByPatientId(mhqSheet, patientId); }
function getMHQRecordById(id) { return getRecordById(mhqSheet, id, 'RecordID'); }
function saveMHQRecord(data) {
  ensureSheetColumns(mhqSheet, [
    'PatientID', 'VisitDate', 'Timestamp',
    'q2_1', 'q2_2', 'result_2q',
    'q9_1', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_9', 'score_9q', 'result_9q',
    'q8_1', 'q8_2', 'q8_3', 'q8_3b', 'q8_4', 'q8_5', 'q8_6', 'q8_7', 'q8_8', 'score_8q', 'result_8q',
    'total_score', 'result_status'
  ]);
  return saveRecord(mhqSheet, data, 'RecordID', 'MHQ');
}
function deleteMHQRecordById(id) { return deleteRecordById(mhqSheet, id, 'RecordID'); }

// --- Dysphagia Swallowing Test Records ---
function getDysphagiaRecordsByPatientId(patientId) { return getRecordsByPatientId(dysphagiaSheet, patientId); }
function getDysphagiaRecordById(id) { return getRecordById(dysphagiaSheet, id, 'RecordID'); }
function saveDysphagiaRecord(data) {
  ensureSheetColumns(dysphagiaSheet, [
    'PatientID', 'VisitDate', 'Timestamp',
    'q1_1', 'q1_2', 'q1_3', 'result_group1',
    'q2_1',
    'q2_2',
    'q2_3', 'sym2_3_cough', 'sym2_3_choke', 'sym2_3_tachypnea', 'sym2_3_wetvoice',
    'q2_4', 'sym2_4_cough', 'sym2_4_choke', 'sym2_4_tachypnea', 'sym2_4_wetvoice',
    'q2_5', 'sym2_5_cough', 'sym2_5_choke', 'sym2_5_tachypnea', 'sym2_5_wetvoice',
    'q2_6', 'sym2_6_cough', 'sym2_6_choke', 'sym2_6_tachypnea', 'sym2_6_wetvoice',
    'q2_7', 'sym2_7_cough', 'sym2_7_choke', 'sym2_7_tachypnea', 'sym2_7_wetvoice',
    'total_score', 'result_status'
  ]);
  return saveRecord(dysphagiaSheet, data, 'RecordID', 'DYS');
}
function deleteDysphagiaRecordById(id) { return deleteRecordById(dysphagiaSheet, id, 'RecordID'); }

// --- Schedules ---
function getAllSchedules() {
  // This function simply gets all records from the schedule sheet.
  // The client-side code will handle the filtering by date.
  return getRecordsByPatientId(scheduleSheet, null, true);
}
function getSchedulesByPatientId(patientId) { 
  const result = getRecordsByPatientId(scheduleSheet, patientId);
  if(result.status === 'success') {
    result.records.sort((a,b) => a.VisitNumber - b.VisitNumber);
  }
  return result;
}
function parseBangkokDateString(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return new Date(dateStr);
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d);
}
function saveSchedules(data) {
  try {
    const { patientId, dates } = data;
    const allSheetData = scheduleSheet.getDataRange().getValues();
    const headers = allSheetData.shift() || [];
    const idIndex = headers.indexOf('ScheduleID');
    const visitNumIndex = headers.indexOf('VisitNumber');
    const patientIdIndex = headers.indexOf('PatientID');
    const dateIndex = headers.indexOf('ScheduledDate');

    // ค้นหาแถวที่ต้องลบก่อน (กรณีผู้ใช้ลบวันที่ออก)
    const rowsToDelete = [];
    const patientIdStr = String(patientId).trim();
    allSheetData.forEach((row, index) => {
        if (String(row[patientIdIndex]).trim() === patientIdStr) {
            const visitNumber = row[visitNumIndex];
            if (!dates[visitNumber - 1]) { // ถ้าวันที่ในฟอร์มถูกลบ
                rowsToDelete.push(index + 2); // +2 เพราะมี header และ index เริ่มที่ 0
            }
        }
    });

    // ลบแถวจากล่างขึ้นบนเพื่อไม่ให้ index เคลื่อน
    rowsToDelete.sort((a, b) => b - a).forEach(rowIndex => {
        scheduleSheet.deleteRow(rowIndex);
    });

    // อัปเดตหรือเพิ่มแถวใหม่
    const currentSchedulesAfterDelete = scheduleSheet.getDataRange().getValues();
    
    dates.forEach((dateStr, index) => {
        const visitNumber = index + 1;
        if (dateStr) { // ถ้ามีวันที่ระบุในฟอร์ม
            // ใช้ข้อมูลล่าสุดที่อาจมีการลบแถวไปแล้วในการค้นหา
            const existingRowData = currentSchedulesAfterDelete.find(r => String(r[patientIdIndex]).trim() === patientIdStr && r[visitNumIndex] === visitNumber);
            
            if (existingRowData) { // ถ้ามีนัดเดิมอยู่แล้ว -> ให้อัปเดต
                 const rowIndex = scheduleSheet.createTextFinder(existingRowData[idIndex]).findNext().getRow();
                 scheduleSheet.getRange(rowIndex, dateIndex + 1).setValue(parseBangkokDateString(dateStr));
            } else { // ถ้ยังไม่มี -> ให้สร้างใหม่
                scheduleSheet.appendRow([`SCH${Date.now()}${visitNumber}`, patientId, visitNumber, parseBangkokDateString(dateStr), 'Scheduled', '']);
            }
        }
    });

    return { status: 'success', message: 'บันทึกตารางเยี่ยมสำเร็จ!' };
  } catch (e) {
    Logger.log("Error in saveSchedules: " + e);
    return { status: 'error', message: e.toString() };
  }
}

// =================================================================
// PDF GENERATION & IMAGE UTILITIES 
// =================================================================

// ในไฟล์ Code.txt
function generatePdfAsBase64(templateId, data, fileNamePrefix) {
  try {
    const tempFolder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    const newFileName = `${fileNamePrefix}-${data.PatientName || data.ClinicNumber || 'Unknown'}`;
    const tempDocFile = DriveApp.getFileById(templateId).makeCopy(newFileName, tempFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    // (โค้ดสำหรับ Consent Form - คงไว้)
    if (templateId === CONSENT_TEMPLATE_ID) {
        body.replaceText('{{ลายมือชื่อ}}', '{{ConsenterSignature}}');
        body.replaceText('{{ลายมือชื่อพยาน}}', '{{WitnessSignature}}');
    }

    // --- Text & Checkbox Replacement (โค้ดเดิม) ---
    for (const key in data) {
      const placeholder = `{{${key}}}`;
      let value = data[key];

      if (value === true || value === '☑') {
        body.replaceText(placeholder, '☑');
      } else if (value === false || value === '☐') {
        body.replaceText(placeholder, '☐');
      } else {
        body.replaceText(placeholder, value || ' ');
      }
    }

    // --- Image Replacement (โค้ดเดิมที่แก้ไขแล้ว) ---
    const imagePlaceholders = ['PatientPhoto', 'BodyChartDrawing', 'TherapistSignature', 'PatientSignature', 'ConsenterSignature', 'WitnessSignature'];

    imagePlaceholders.forEach(key => {
      const urlProperty = data[key + 'Url'] ? data[key + 'Url'] : data[key + 'URL'];
      if (urlProperty) {
        const fileId = urlProperty.split('id=')[1]
        if (fileId) {
          let imageWidth = 180; // ขนาดมาตรฐานลายเซ็น
          if (key === 'PatientPhoto') { imageWidth = 120; }
          else if (key === 'BodyChartDrawing') { imageWidth = 250; }
          replacePlaceholderWithImage(body, `{{${key}}}`, fileId, imageWidth);
        }
      }
    });

    // --- Cleanup (โค้ดเดิม) ---
    body.replaceText(/{{.*?}}/g, ' '); // ลบ Placeholder ที่ไม่ถูกใช้งานออก

    doc.saveAndClose();
    const pdfBlob = tempDocFile.getAs('application/pdf');
    const base64Data = Utilities.base64Encode(pdfBlob.getBytes());
    tempDocFile.setTrashed(true);
    return { status: 'success', base64: base64Data, fileName: `${newFileName}.pdf` };
  } catch (e) {
    Logger.log(`Error generating PDF for ${fileNamePrefix}: ${e.toString()} \nStack: ${e.stack}`);
    return { status: 'error', message: `เกิดข้อผิดพลาดในการสร้าง PDF: ${e.message}` };
  }
}

/**
 * แทนที่ Placeholder ในเอกสารด้วยรูปภาพจาก Google Drive
 */
function replacePlaceholderWithImage(body, placeholder, fileId, width) {
  try {
    const searchResult = body.findText(placeholder);
    if (searchResult) {
      const element = searchResult.getElement();
      const parent = element.getParent();
      parent.asParagraph().clear(); // ล้าง placeholder ออกก่อน
      const blob = DriveApp.getFileById(fileId).getBlob();
      const image = parent.asParagraph().insertInlineImage(0, blob);
      const aspectRatio = image.getHeight() / image.getWidth();
      image.setWidth(width);
      image.setHeight(width * aspectRatio);
    }
  } catch (e) {
    Logger.log(`Could not replace image for placeholder ${placeholder}: ${e.toString()}`);
    body.replaceText(placeholder, '(ไม่สามารถโหลดรูปได้)');
  }
}

/**
 * ฟังก์ชัน Helper สำหรับแปลงเวลาเป็นรูปแบบ HH:mm (แก้ไขแล้ว)
 */
function formatTimeForPdf(timeValue) {
  // 1. ตรวจสอบว่า timeValue มีค่าหรือไม่ (ไม่ใช่ null, undefined, หรือ string ว่าง)
  if (!timeValue) return ' '; 
  
  try {
    // 2. สร้างอ็อบเจกต์ Date ใหม่จาก 'ข้อความเวลา' (timeValue) ที่ได้รับมา
    const dateObj = new Date(timeValue);
    
    // 3. ตรวจสอบว่าวันที่แปลงมาถูกต้องหรือไม่
    if (isNaN(dateObj.getTime())) return ' '; 
        
    // 4. จัดรูปแบบเวลาที่ถูกต้อง
    return Utilities.formatDate(dateObj, "Asia/Bangkok", "HH:mm");
  } catch (e) {
    Logger.log('Error formatting time: ' + e);
    return ' '; // หากเกิดข้อผิดพลาดอื่น ๆ ให้ส่งค่าว่าง
  }
}
/**
 * ฟังก์ชัน Helper สำหรับแปลงวันที่เป็นรูปแบบไทย (พ.ศ.) สำหรับใช้ใน PDF
 */
function formatThaiDateForPdf(isoDateString) {
  if (!isoDateString) return ' ';
  try {
    const date = new Date(isoDateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear() + 543;
    return `${day}/${month}/${year}`;
  } catch (e) {
    return ' ';
  }
}

/**
 * ฟังก์ชัน Helper สำหรับคำนวณอายุ
 */
function calculateAge(dateString) {
    if (!dateString) return '';
    const birthDate = new Date(dateString);
    let age = new Date().getFullYear() - birthDate.getFullYear();
    const m = new Date().getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && new Date().getDate() < birthDate.getDate())) age--;
    return age >= 0 ? age : '';
}
function saveImageToDrive(base64Data, fileName) {
  try {
    const photoFolder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,') + 7));
    const blob = Utilities.newBlob(bytes, contentType, `${fileName}.png`);
    const file = photoFolder.createFile(blob);
    return `https://drive.google.com/uc?id=${file.getId()}`;
  } catch (e) {
    Logger.log(`Error saving image ${fileName}: ${e}`);
    return null;
  }
}

// --- ฟังก์ชันที่จำเป็น ---
function getImageAsBase64(fileId) {
  try {
    if (!fileId) return null;
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
  } catch (e) {
    Logger.log('Error getting image as Base64 for fileId ' + fileId + ': ' + e);
    return null;
  }
}
// =================================================================
// PDF GENERATION WRAPPERS
// =================================================================

/**
 * สร้างปก OPD (IMC Cover)
 */
// ในไฟล์ Code.txt
function generateIMCCoverPdf(patientId) {
  const patient = getPatientById(patientId);
  if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
  
  patient.Age = calculateAge(patient.DateOfBirth);
  patient.DateOfBirth = formatThaiDateForPdf(patient.DateOfBirth);
  patient.AdmitDate = formatThaiDateForPdf(patient.AdmitDate);
  patient.DischargeDate = formatThaiDateForPdf(patient.DischargeDate);
  patient.DueDate = formatThaiDateForPdf(patient.DueDate);
  patient.Address = patient.FullAddress;

  // --- START: ส่วนที่แก้ไข ---

  // 1. สร้าง Key ใหม่สำหรับ Placeholder ที่มีการเว้นวรรค
  patient['Caregiver Relationship'] = patient.CaregiverRelationship;

  // 2. จัดการ Checkbox สำหรับ IMC Dx
  // (โค้ดเดิมของคุณส่วนนี้ถูกต้องแล้ว)
  ['Stroke', 'TBI', 'Fx.HIP', 'SCI'].forEach(dx => {
    const cleanDx = dx.replace(/\./g, ''); 
    patient[`${cleanDx}_check`] = (patient.IMCDx === dx);
  });

  // (โค้ดเดิมของคุณส่วนนี้ถูกต้องแล้ว)
  ['Hemorrhage', 'Ischemic'].forEach(type => {
    patient[`Stroke_${type}_check`] = (patient.StrokeType === type);
  });
  
  // 3. ลบส่วนที่สร้าง Checkbox ของนักกายภาพบำบัด
  
  // --- END: ส่วนที่แก้ไข ---

  return generatePdfAsBase64(IMC_COVER_TEMPLATE_ID, patient, "IMC-Cover");
}

/**
 * สร้างใบยินยอม (Consent Form)
 */
function generateTMSEPdf(recordId) {
  const record = getRecordById(tmseSheet, recordId, 'RecordID').record;
  const patient = getPatientById(record.PatientID);
  if (!record || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };

  const data = { ...patient, ...record };
  data.VisitDate = formatThaiDateForPdf(data.VisitDate);
  data.Age = calculateAge(patient.DateOfBirth);
  data.TreatmentRightsDisplay = getTreatmentRightsDisplay(patient);

  const binaryKeys = [
    'q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job',
    'q_reg_1', 'q_reg_2', 'q_reg_3',
    'q_tree', 'q_car', 'q_hand',
    'q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon',
    'q_calc1', 'q_calc2', 'q_calc3',
    'q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read',
    'q_similar1', 'q_similar2'
  ];

  binaryKeys.forEach(key => {
    const val = Number(data[key]);
    if (val === 1) {
      data[`${key}_c`] = '☑';
      data[`${key}_w`] = '☐';
    } else {
      data[`${key}_c`] = '☐';
      data[`${key}_w`] = '☑';
    }
  });

  const drawVal = Number(data.q_draw || 0);
  data.q_draw_2_c = (drawVal === 2) ? '☑' : '☐';
  data.q_draw_0_c = (drawVal === 0) ? '☑' : '☐';

  // --- คะแนนรวมแยกตามหมวด (คำนวณจากคำตอบดิบ เพื่อไม่ต้องพึ่งค่าที่ frontend ส่งมา) ---
  const sumFields = (keys) => keys.reduce((sum, k) => sum + (Number(data[k]) || 0), 0);

  data.score_orientation = sumFields(['q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job']);
  data.score_registration = sumFields(['q_reg_1', 'q_reg_2', 'q_reg_3']);
  data.score_attention = sumFields(['q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon']);
  data.score_calculation = sumFields(['q_calc1', 'q_calc2', 'q_calc3']);
  data.score_recall = sumFields(['q_tree', 'q_car', 'q_hand']);
  data.score_language = sumFields(['q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read'])
    + (Number(data.q_draw) || 0)
    + (Number(data.q_similar1) === 1 ? 0.5 : 0)
    + (Number(data.q_similar2) === 1 ? 0.5 : 0);

  // --- สรุปผลการประเมิน: ทำเป็น checkbox ให้ติ๊กตามเกณฑ์คะแนน ---
  const totalScoreNum = parseFloat(data.total_score);
  const scoreForResult = isNaN(totalScoreNum) ? 0 : totalScoreNum;
  data.result_dementia_c = (scoreForResult < 23) ? '☑' : '☐';
  data.result_impairment_c = (scoreForResult >= 23 && scoreForResult < 26) ? '☑' : '☐';
  data.result_normal_c = (scoreForResult >= 26) ? '☑' : '☐';

  return generatePdfAsBase64(TMSE_TEMPLATE_ID, data, "TMSE-Assessment");
}

// --- MHQ (Mental Health Questionnaire: 2Q / 9Q / 8Q) PDF Generation ---
function generateMHQPdf(recordId) {
  const record = getRecordById(mhqSheet, recordId, 'RecordID').record;
  const patient = getPatientById(record.PatientID);
  if (!record || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };

  const data = { ...patient, ...record };
  data.VisitDate = formatThaiDateForPdf(data.VisitDate);
  data.Age = calculateAge(patient.DateOfBirth);
  data.TreatmentRightsDisplay = getTreatmentRightsDisplay(patient);

  const tick = (cond) => cond ? '☑' : '☐';

  // ===== Group 1: 2Q =====
  data.q2_1_yes_c = tick(data.q2_1 === 'YES');
  data.q2_1_no_c = tick(data.q2_1 === 'NO');
  data.q2_2_yes_c = tick(data.q2_2 === 'YES');
  data.q2_2_no_c = tick(data.q2_2 === 'NO');

  const has2qYes = (data.q2_1 === 'YES' || data.q2_2 === 'YES');
  data.result_2q_no_c = tick(!has2qYes);
  data.result_2q_yes_c = tick(has2qYes);

  // ===== Group 2: 9Q =====
  const q9Keys = ['q9_1', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_9'];
  q9Keys.forEach(key => {
    const val = Number(data[key]);
    for (let level = 0; level <= 3; level++) {
      data[`${key}_${level}_c`] = tick(val === level);
    }
  });
  const score9q = q9Keys.reduce((sum, k) => sum + (Number(data[k]) || 0), 0);
  data.score_9q = score9q;
  data.result_9q_lt7_c = tick(score9q < 7);
  data.result_9q_7to12_c = tick(score9q >= 7 && score9q <= 12);
  data.result_9q_13to18_c = tick(score9q >= 13 && score9q <= 18);
  data.result_9q_gte19_c = tick(score9q >= 19);
  // ช่องแยกสำหรับติ๊กเตือนว่าคะแนน 9Q เข้าเกณฑ์ต้องประเมิน Group 3 (8Q) ต่อ
  data.result_9q_ge7_c = tick(score9q >= 7);

  // ===== Group 3: 8Q =====
  // น้ำหนักคะแนนแต่ละข้อ ตามแบบประเมิน 8Q มาตรฐาน
  const q8Weights = { q8_1: 1, q8_2: 2, q8_3: 6, q8_3b: 8, q8_4: 8, q8_5: 9, q8_6: 4, q8_7: 10, q8_8: 4 };
  const q8Keys = ['q8_1', 'q8_2', 'q8_3', 'q8_4', 'q8_5', 'q8_6', 'q8_7', 'q8_8'];

  q8Keys.forEach(key => {
    const isYes = Number(data[key]) === 1;
    data[`${key}_no_c`] = tick(!isYes);
    data[`${key}_yes_c`] = tick(isYes);
  });
  // คำถามย่อยข้อ 3: ถามต่อเฉพาะเมื่อ q8_3 = YES (มี) -- ได้ = 0 คะแนน / ไม่ได้ = 8 คะแนน
  const q3bAnswered = Number(data.q8_3) === 1;
  const q3bCannotControl = q3bAnswered && Number(data.q8_3b) === 1;
  data.q8_3b_yes_c = tick(q3bAnswered && !q3bCannotControl); // "ได้"
  data.q8_3b_no_c = tick(q3bCannotControl); // "ไม่ได้"

  let score8q = 0;
  q8Keys.forEach(key => { if (Number(data[key]) === 1) score8q += q8Weights[key]; });
  if (q3bCannotControl) score8q += q8Weights.q8_3b;
  data.score_8q = score8q;

  data.result_8q_0_c = tick(score8q === 0);
  data.result_8q_1to8_c = tick(score8q >= 1 && score8q <= 8);
  data.result_8q_9to16_c = tick(score8q >= 9 && score8q <= 16);
  data.result_8q_gte17_c = tick(score8q >= 17);
  data.result_8q_urgent_c = tick(score8q >= 17);
  // ช่องแยกสำหรับติ๊กเตือนคะแนน 8Q เข้าเกณฑ์ส่งต่อโรงพยาบาลมีจิตแพทย์ด่วน
  data.result_8q_ge17_c = tick(score8q >= 17);

  return generatePdfAsBase64(MHQ_TEMPLATE_ID, data, "MHQ-Assessment");
}

// --- Dysphagia Swallowing Test PDF Generation ---
function generateDysphagiaPdf(recordId) {
  const record = getRecordById(dysphagiaSheet, recordId, 'RecordID').record;
  const patient = getPatientById(record.PatientID);
  if (!record || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };

  const data = { ...patient, ...record };
  data.VisitDate = formatThaiDateForPdf(data.VisitDate);
  data.Age = calculateAge(patient.DateOfBirth);
  data.TreatmentRightsDisplay = getTreatmentRightsDisplay(patient);

  const tick = (cond) => cond ? '☑' : '☐';

  // ===== Group 1: ความพร้อมในการทดสอบ =====
  const g1Keys = ['q1_1', 'q1_2', 'q1_3'];
  g1Keys.forEach(key => {
    data[`${key}_yes_c`] = tick(data[key] === 'YES');
    data[`${key}_no_c`] = tick(data[key] === 'NO');
  });
  const g1HasNo = g1Keys.some(k => data[k] === 'NO');
  const g1AllYes = g1Keys.every(k => data[k] === 'YES');
  data.result_g1_fail_c = tick(g1HasNo);
  data.result_g1_pass_c = tick(g1AllYes);

  // ===== Group 2: ขั้นตอนการประเมินการกลืน 7 ขั้นตอน =====
  const g2Keys = ['q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5', 'q2_6', 'q2_7'];
  g2Keys.forEach(key => {
    data[`${key}_yes_c`] = tick(data[key] === 'YES');
    data[`${key}_no_c`] = tick(data[key] === 'NO');
  });

  // อาการที่ติ๊กเลือกได้เฉพาะข้อ 3-7 เมื่อตอบ NO
  const symSteps = ['2_3', '2_4', '2_5', '2_6', '2_7'];
  symSteps.forEach(step => {
    ['cough', 'choke', 'tachypnea', 'wetvoice'].forEach(sym => {
      const field = `sym${step}_${sym}`;
      data[`${field}_c`] = tick(Number(data[field]) === 1);
    });
  });

  // ช่องแยก: ถ้าข้อ 3-7 ข้อใดข้อหนึ่งตอบ NO ให้ติ๊กช่อง "แนวทางการดูแล" และ "Consult PM&R"
  const g2Keys3to7 = ['q2_3', 'q2_4', 'q2_5', 'q2_6', 'q2_7'];
  const g2HasNo3to7 = g2Keys3to7.some(key => data[key] === 'NO');
  data.result_g2_pathway_c = tick(g2HasNo3to7);
  data.result_g2_pmr_c = tick(g2HasNo3to7);

  return generatePdfAsBase64(DYSPHAGIA_TEMPLATE_ID, data, "Dysphagia-SwallowingTest");
}

// ในไฟล์ Code.txt
function generateConsentPdf(consentId) {
  const consent = getRecordById(consentSheet, consentId, 'ConsentID').record;
  const patient = getPatientById(consent.PatientID);
  if (!consent || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };
  
  const data = { ...patient, ...consent };

  data['ชื่อผู้ป่วย'] = patient.PatientName;
  data['ชื่อผู้ให้ความยินยอม'] = consent.ConsenterName;
  data['อายุ'] = consent.ConsenterAge;
  data['เลขปชช.ผู้ให้ความยินยอม'] = consent.ConsenterNationalID;
  data['ที่อยู่'] = patient.FullAddress;
  data['วันที่'] = formatThaiDateForPdf(consent.ConsentDate);
  data['ชื่อ-สกุลผู้ยินยอม'] = consent.ConsenterName;
  data['ชื่อ-สกุลพยาน'] = consent.WitnessName;

  // --- START: ส่วนที่แก้ไข ---
  // เปลี่ยนชื่อ Key ให้ตรงกับ Placeholder ใน Template ใหม่ของคุณ
  data['check_ผู้ป่วย'] = (data.ConsenterType === 'Patient') ? '☑' : '☐';
  data['check_ผู้ดูแล'] = (data.ConsenterType === 'Caregiver') ? '☑' : '☐';
  // --- END: ส่วนที่แก้ไข ---

  return generatePdfAsBase64(CONSENT_TEMPLATE_ID, data, "Consent-Form");
}

/**
 * สร้างใบประเมิน BI (BI Assessment)
 */
function generateBIPdf(assessmentId) {
  const assessment = getRecordById(biSheet, assessmentId, 'AssessmentID').record;
  const patient = getPatientById(assessment.PatientID);
  if (!assessment || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };

  const data = { ...patient, ...assessment };
  // แก้บั๊กเดียวกับ OPD/SOAP: บังคับให้ PatientName อ้างอิงจากตาราง Patients เป็นหลักเสมอ
  data.PatientName = patient.PatientName || data.PatientName || '';
  data.Date = formatThaiDateForPdf(data.AssessmentDate);
  
  for (let i = 1; i <= 10; i++) {
    const score = Number(data[`q${i}`]);
    for (let j = 0; j <= 3; j++) {
      data[`q${i}_opt${j}_check`] = (j === score);
    }
  }

  // --- START: ส่วนที่แก้ไข ---
  // เพิ่มการสร้าง Key สำหรับ Checkbox ของ Multiple Impairment และ Fx.HIP
  const impairments = ['swallowing', 'communicate', 'mobility', 'cognitive', 'bowel'];
  impairments.forEach(imp => {
      data[`impairment_${imp}_check`] = assessment[`impairment_${imp}`] === true;
  });

  const fxHipItems = ['bathroom', 'bed', 'movement', 'stairs'];
  fxHipItems.forEach(item => {
      data[`fx_${item}_check`] = assessment[`fx_${item}`] === true;
  });
  // --- END: ส่วนที่แก้ไข ---

  return generatePdfAsBase64(BI_TEMPLATE_ID, data, "BI-Assessment");
}

/**
 * สร้าง OPD Card (ปรับปรุงสำหรับเทมเพลตใหม่ + แยก Joint/Sensation)
 */
function generateOpdPdf(recordId) {
  const record = getRecordById(opdSheet, recordId, 'RecordID').record;
  const patient = getPatientById(record.PatientID);
  if (!record || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };
  
  const data = { ...patient, ...record };
  // แก้บั๊ก: ถ้าชีท OPD มีคอลัมน์ PatientName เดิม (ข้อมูลเก่า) ที่ว่างเปล่าอยู่ ค่านั้นจะไปทับ
  // ชื่อที่ดึงถูกต้องจากตาราง Patients ผ่าน PatientID เสมอ ให้บังคับอ้างอิงจาก patient เป็นหลัก
  data.PatientName = patient.PatientName || data.PatientName || '';
  applyServiceTypePdfFlags(data, record);
  
  // 1. จัดรูปแบบข้อมูลพื้นฐาน
  data.VisitDate = formatThaiDateForPdf(data.VisitDate);
  data.StartTime = formatTimeForPdf(record.StartTime);
  data.EndTime = formatTimeForPdf(record.EndTime);
  data.PHPI = record.PHPI;
  data.MedicalTreatment = record.MedicalTreatment;

  try {
    // 2. จัดการ Diagnosis (Checkboxes)
    const diagnosis = data.Diagnosis || '';
    data.Dx_Stroke = diagnosis.includes('Stroke');
    data.Dx_FxHIP = diagnosis.includes('Fx.HIP');
    data.Dx_SCI = diagnosis.includes('SCI');
    data.Dx_TBI = diagnosis.includes('TBI');

    // 3. จัดการ Fx.HIP Status (Checkboxes + Text)
    const fxStatus = data.FxHIP_Status || '';
    data.Fx_NWB = (fxStatus === 'NWB');
    data.Fx_PWB = (fxStatus === 'PWB');
    data.Fx_PWB_Percent = (fxStatus === 'PWB') ? (data.FxHIP_PWB_Percent || '') : '';
    data.Fx_FWB = (fxStatus === 'FWB');
    data.Fx_WC = (fxStatus === 'W/C');
    data.Fx_BedRest = (fxStatus === 'Bed rest');

    // 4. จัดการ Physical Exam
    const locStr = data.LevelOfConsciousness || '';
    data.LOC_Alert_Check = locStr.includes('Alert');
    data.LOC_Drowsiness_Check = locStr.includes('Drowsiness');
    data.LOC_Confuse_Check = locStr.includes('Confuse');
    data.LOC_Stupor_Check = locStr.includes('Stupor');
    data.LOC_SemiComa_Check = locStr.includes('Semi-coma');
    data.LOC_Coma_Check = locStr.includes('Coma');
    const communication = data.Communication || '';
    const aphasiaType = data.CommunicationAphasiaType || '';
    data.Comm_Normal_Check = (communication === 'Normal');
    data.Comm_Dysarthria_Check = (communication === 'Dysarthria');
    data.Comm_Aphasia_Check = (communication === 'Aphasia');
    data.Comm_Aphasia_Global_Check = (communication === 'Aphasia' && aphasiaType === 'Global');
    data.Comm_Aphasia_Motor_Check = (communication === 'Aphasia' && aphasiaType === 'Motor');
    data.Comm_Aphasia_Sensory_Check = (communication === 'Aphasia' && aphasiaType === 'Sensory');
    const equipmentStr = data.Equipment || '';
    data.Equip_No_Check = equipmentStr.includes('No');
    data.Equip_FoleysCath_Check = equipmentStr.includes("Foley's cath");
    data.Equip_NGTube_Check = equipmentStr.includes('NG tube');
    data.Equip_TracheostomyTube_Check = equipmentStr.includes('Tracheostomy tube');
    data.Equip_Other_Check = equipmentStr.includes('Other');
    data.Equip_Other_Details = data.Equip_Other_Check ? (data.EquipmentOther || '') : '';

    // Special Assessments
    const saStr = record.SpecialAssessment || '';
    data.SA_MRI_Check     = saStr.includes('MRI')     ? '☑' : '☐';
    data.SA_CT_Check      = saStr.includes('CT-scan')  ? '☑' : '☐';
    data.SA_Xray_Check    = saStr.includes('X-ray')    ? '☑' : '☐';
    data.SA_ASIA_Check    = saStr.includes('ASIA')     ? '☑' : '☐';

    // Shared details field for MRI/CT/X-ray or general remarks
    data.SA_Details = record.SpecialAssessment_Details || ' ';

    // ASIA details mapped separately
    data.SA_ASIA_NLI = record.SpecialAssessment_ASIA_NLI || ' ';
    data.SA_ASIA_AIS = record.SpecialAssessment_ASIA_AIS || ' ';
    data.SA_ASIA_Diagnosis = record.SpecialAssessment_ASIA_Diagnosis || ' ';

    // GeoLocation Timestamp
    data.GeoLocationTimestamp = record.GeoLocationTimestamp || '';

    // Gross Motor Function (grid checkmarks)
    data.PE_GrossMotorFunction_Check = record.PE_GrossMotorFunction_Check;
    try {
      const gm = JSON.parse(record.GrossMotorFunction || '{}');
      const gmFunctions = ['MoveUp', 'MoveDown', 'MoveRight', 'MoveLeft', 'SubSideLying', 'SideLyingSit', 'SitStand'];
      const gmGrades = ['Ind', 'Con', 'Min', 'Mod', 'Max', 'Dep'];
      const gmGradeMap = { 'Independent': 'Ind', 'Continuous': 'Con', 'Minimal': 'Min', 'Moderate': 'Mod', 'Maximum': 'Max', 'Dependent': 'Dep' };
      gmFunctions.forEach(fn => {
        const selected = gm[fn] || '';
        gmGrades.forEach(g => {
          data[`GM_${fn}_${g}`] = Object.keys(gmGradeMap).some(k => gmGradeMap[k] === g && selected === k);
        });
      });
    } catch(e) { Logger.log('GrossMotorFunction parse error: ' + e); }

    // Hand Function (new - grid checkmarks)
    data.PE_HandFunction_Check = record.PE_HandFunction_Check;
    data.HF_Right_Check = (record.HF_Side_Rt === true || record.HF_Side_Rt === 'true' || record.HF_Side_Rt === 'on');
    data.HF_Left_Check = (record.HF_Side_Lt === true || record.HF_Side_Lt === 'true' || record.HF_Side_Lt === 'on');
    try {
      const hf = JSON.parse(record.HandFunction || '{}');
      const hfFunctions = ['Reaching', 'GraspRelease', 'PassObj', 'ThumbOpp', 'PinchGrasp'];
      const hfGrades = ['Zero', 'Poor', 'Fair', 'Good', 'Nor'];
      const hfGradeMap = { 'Zero': 'Zero', 'Poor': 'Poor', 'Fair': 'Fair', 'Good': 'Good', 'Normal': 'Nor' };
      hfFunctions.forEach(fn => {
        const selected = hf[fn] || '';
        hfGrades.forEach(g => {
          data[`HF_${fn}_${g}`] = Object.keys(hfGradeMap).some(k => hfGradeMap[k] === g && selected === k);
        });
      });
    } catch(e) { Logger.log('HandFunction parse error: ' + e); }


    data.PE_GaitAnalysis_Check = record.PE_GaitAnalysis_Check;
    try {
        if (record.GaitAnalysis_Details) {
            const gaitObject = JSON.parse(record.GaitAnalysis_Details);
            data.GaitAnalysis_Details = Object.entries(gaitObject)
                                          .map(([key, value]) => `${key}: "${value}"`)
                                          .join(', ');
        }
    } catch (e) { data.GaitAnalysis_Details = record.GaitAnalysis_Details || ''; }

    data.PE_QualityMovement_Check = record.PE_QualityMovement_Check;
    const qm = JSON.parse(record.QualityMovement || '{}');
    data.QM_UE_Rt = qm.UE?.Rt; data.QM_UE_Lt = qm.UE?.Lt; 
    data.QM_LE_Rt = qm.LE?.Rt; data.QM_LE_Lt = qm.LE?.Lt;
    
    // Joint Propioception / Sensation
    data.PE_JointPropio_Check = record.PE_JointPropio_Check;
    const ue = JSON.parse(record.JointSensation_UE_Details || '{}');
    data.UE_Rt_Joint = ue['Rt. Joint'] || '-';
    data.UE_Rt_Sensation = ue['Rt. Sensation'] || '-';
    data.UE_Lt_Joint = ue['Lt. Joint'] || '-';
    data.UE_Lt_Sensation = ue['Lt. Sensation'] || '-';
    const le = JSON.parse(record.JointSensation_LE_Details || '{}');
    data.LE_Rt_Joint = le['Rt. Joint'] || '-';
    data.LE_Rt_Sensation = le['Rt. Sensation'] || '-';
    data.LE_Lt_Joint = le['Lt. Joint'] || '-';
    data.LE_Lt_Sensation = le['Lt. Sensation'] || '-';

    // Balance (new grid structure)
    data.PE_Balance_Check = record.PE_Balance_Check;
    try {
      const bal = JSON.parse(record.BalanceGrid || record.Balance || '{}');
      const balAssessments = ['SitStatic', 'SitDynamic', 'StandStatic', 'StandDynamic'];
      const balGrades = ['Zero', 'Poor', 'Fair', 'Good', 'Nor'];
      const balGradeMap = { 'Zero': 'Zero', 'Poor': 'Poor', 'Fair': 'Fair', 'Good': 'Good', 'Normal': 'Nor' };
      balAssessments.forEach(a => {
        const selected = bal[a] || '';
        balGrades.forEach(g => {
          data[`Bal_${a}_${g}`] = Object.keys(balGradeMap).some(k => balGradeMap[k] === g && selected === k);
        });
      });
      // Legacy fallback: keep old Balance_Sitting/Standing
      data.Balance_Sitting = bal.Sitting || bal.SitStatic || '';
      data.Balance_Standing = bal.Standing || bal.StandStatic || '';
    } catch(e) { Logger.log('Balance parse error: ' + e); }

    // PROM / Length / Tone
    data.PE_PROM_Check = record.PE_PROM_Check;
    data.PROM = record.PROM; 
    data.Lenght = record.Length; // (สะกดตามเทมเพลต 'Lenght')
    data.Tone = record.Tone;
    
    // CHEST - Other (renamed from Other)
    data.PE_Other_Check = record.PE_Other_Check || record.PE_ChestOther_Check;
    data.OtherPhysical = record.OtherPhysical;


    // 5. จัดการ Problem List
    const problemListText = data.ProblemList || '';
    const problemItems = ['Weakness', 'Poor balance', 'Poor ambulation', 'Abnormal m. length/tone', 'Risk for complication'];
    data.PL_Weakness = problemListText.includes('Weakness');
    data.PL_PoorBalance = problemListText.includes('Poor balance');
    data.PL_PoorAmbulation = problemListText.includes('Poor ambulation');
    data.PL_AbnormalLengthTone = problemListText.includes('Abnormal m. length/tone');
    data.PL_RiskOfComplication = problemListText.includes('Risk for complication');
    
    const otherProblem = problemListText.split(', ').find(item => item && !problemItems.includes(item));
    data.PL_Other_Check = !!otherProblem;
    data.PL_Other_Details = otherProblem || '';

    // 6. Goals & Plan (Text)
    data.GoalsOfTreatment = data.GoalsOfTreatment; 
    data.PlanOfTreatment = data.PlanOfTreatment; 

    // 7. จัดการ Treatment
    const treatment = JSON.parse(data.Treatment_Details || '{}');
    const treatItems = ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'];
    
    treatItems.forEach(key => {
      if (treatment[key] && Object.keys(treatment[key]).length > 0) {
        data[`Treat_${key}_Check`] = true;
        data[`Treat_${key}_Time`] = treatment[key].time || '';
        data[`Treat_${key}_Details`] = (treatment[key].details || []).join(', ');
      } else {
        data[`Treat_${key}_Check`] = false;
        data[`Treat_${key}_Time`] = '';
        data[`Treat_${key}_Details`] = '';
      }
    });

  } catch (e) { 
    Logger.log("Error parsing data for NEW OPD PDF: " + e);
  }

  return generatePdfAsBase64(OPD_TEMPLATE_ID, data, "OPD-Card");
}
/**
 * สร้าง SOAP Note (ปรับปรุงสำหรับ Plan of Treatment แบบ Checkbox)
 */
function generateSOAPPdf(noteId) {
  const note = getSOAPNoteById(noteId).record;
  const patient = getPatientById(note.PatientID);
  if (!note || !patient) return { status: 'error', message: 'ไม่พบข้อมูล' };
  
  const biAssessmentResponse = getBIAssessmentByVisit(note.PatientID, note.VisitCount);
  const biData = biAssessmentResponse.status === 'success' ? biAssessmentResponse.record : {};

  const data = { ...patient, ...note, ...biData }; 
  // แก้บั๊กเดียวกับ OPD: บังคับให้ PatientName อ้างอิงจากตาราง Patients (ผ่าน PatientID) เป็นหลักเสมอ
  // ป้องกันคอลัมน์ PatientName เก่าใน SOAP/BI sheet ที่อาจว่างเปล่าไปทับค่าที่ถูกต้อง
  data.PatientName = patient.PatientName || data.PatientName || '';
  applyServiceTypePdfFlags(data, note);
  
  data.VisitDate = formatThaiDateForPdf(data.VisitDate);
  data.StartTime = formatTimeForPdf(note.StartTime);
  data.EndTime = formatTimeForPdf(note.EndTime);
  
  try {
    // 2. จัดการ Diagnosis
    const diagnosis = JSON.parse(data.DiagnosisJSON || '[]');
    data.Dx_Stroke = diagnosis.includes('Stroke');
    data.Dx_FxHIP = diagnosis.includes('Fx.HIP');
    data.Dx_SCI = diagnosis.includes('SCI');
    data.Dx_TBI = diagnosis.includes('TBI');

    // 3. จัดการ Objective
    const objective = JSON.parse(data.ObjectiveJSON || '{}');
    data.Objective_QualityMovement_Check = objective.QualityMovement_Check;
    if (objective.QualityMovement) {
      data.QM_UE_Rt = objective.QualityMovement.UE?.Rt;
      data.QM_UE_Lt = objective.QualityMovement.UE?.Lt;
      data.QM_LE_Rt = objective.QualityMovement.LE?.Rt; 
      data.QM_LE_Lt = objective.QualityMovement.LE?.Lt; 
    }
    data.Objective_Other_Check = objective.Other_Check;
    data.Objective_Other_Details = objective.Other_Details;

    // 4. จัดการ Barthel Index
    if (biData) {
      data.BarthelIndex = biData.TotalScore; 
      for (let i = 1; i <= 10; i++) {
        const score = Number(biData[`q${i}`]);
        for (let j = 0; j <= 3; j++) {
          data[`q${i}_opt${j}_check`] = (j === score);
        }
      }
      const impairments = ['swallowing', 'communicate', 'mobility', 'cognitive', 'bowel'];
      impairments.forEach(imp => data[`impairment_${imp}_check`] = biData[`impairment_${imp}`]);
      const fxHipItems = ['bathroom', 'bed', 'movement', 'stairs'];
      fxHipItems.forEach(item => data[`fx_${item}_check`] = biData[`fx_${item}`]);
    }

    // 5. จัดการ Treatment
    const treatment = JSON.parse(data.TreatmentJSON || '{}');
    const treatItems = ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'];
    
    treatItems.forEach(key => {
      if (treatment[key] && Object.keys(treatment[key]).length > 0) {
        data[`Treat_${key}_Check`] = true;
        data[`Treat_${key}_Time`] = treatment[key].time || '';
        data[`Treat_${key}_Details`] = (treatment[key].details || []).join(', '); 
      } else {
        data[`Treat_${key}_Check`] = false;
        data[`Treat_${key}_Time`] = '';
        data[`Treat_${key}_Details`] = '';
      }
    });

    // 6. จัดการ Ambulation
    if (treatment.Ambulation) {
        data.Treat_Ambulation_Check = true;
        const amb = treatment.Ambulation || {};
        data.Amb_NWB_Check = (amb.Status === 'NWB');
        data.Amb_PWB_Check = (amb.Status === 'PWB');
        data.Amb_FWB_Check = (amb.Status === 'FWB');
        data.Amb_WC_Check = (amb.Status === 'WC');
        data.Amb_PWB_Percent = amb.PWB_Percent || '';
    }

    // --- START: ส่วนที่แก้ไข (Plan of Treatment) ---
    const plan = data.Plan || ''; // data.Plan คือ string ที่เราบันทึก
    data.Plan_FU = plan.includes('F/U Program PT ต่อเนื่อง') || plan.includes('F/U Program PT ตามความเหมาะสม');
    data.Plan_OFF = plan.includes('OFF PT Program');
    data.Plan_Refer = plan.includes('ส่งต่อ รพ. ต้นสังกัด') || plan.includes('ส่งต่อ รพ. ตามความเหมาะสม');
    
    // Extract custom other plan
    const predefinedPlans = [
      'F/U Program PT ต่อเนื่อง', 
      'F/U Program PT ตามความเหมาะสม', 
      'OFF PT Program', 
      'ส่งต่อ รพ. ต้นสังกัด', 
      'ส่งต่อ รพ. ตามความเหมาะสม'
    ];
    const planItems = plan.split(', ').filter(Boolean);
    const otherPlanItems = planItems.filter(item => !predefinedPlans.includes(item));
    data.Plan_Other_Check = otherPlanItems.length > 0 ? '☑' : '☐';
    data.Plan_Other_Details = otherPlanItems.length > 0 ? otherPlanItems.join(', ') : ' ';
    // --- END: ส่วนที่แก้ไข ---

  } catch (e) { 
    Logger.log("Error parsing JSON for SOAP PDF: " + e);
  }

  return generatePdfAsBase64(SOAP_TEMPLATE_ID, data, "SOAP-Note");
}
/**
 * Helper to find a BI assessment for a specific visit.
 */
function getBIAssessmentByVisit(patientId, visitCount) {
    try {
        const allBiAssessments = biSheet.getDataRange().getValues();
        if (allBiAssessments.length < 2) {
            return { status: 'success', record: null }; // Return success but with null record
        }
        const headers = allBiAssessments.shift();
        const patientIdIndex = headers.indexOf('PatientID');
        const visitCountIndex = headers.indexOf('VisitCount');

        const row = allBiAssessments.find(r => r[patientIdIndex] === patientId && String(r[visitCountIndex]) === String(visitCount));
        
        if (row) {
            const record = mapHeadersToObject(headers, row);
            return { status: 'success', record: record };
        } else {
            return { status: 'success', record: null }; // Return success but with null record if not found
        }
    } catch (e) {
        Logger.log(`Error in getBIAssessmentByVisit: ${e.toString()}`);
        return { status: 'error', message: e.toString() };
    }
}


// =================================================================
// DASHBOARD DATA
// =================================================================
function getDashboardData() {
  try {
    const patients = getPatientsWithDetails();
    if (patients.length === 0) {
      return { totalPatients: 0, diagnosisData: {}, zoneData: {}, biData: {}, visitProgress: {} };
    }

    const diagnosisData = patients.reduce((acc, p) => {
      const dx = p.IMCDx || 'ไม่ระบุ';
      acc[dx] = (acc[dx] || 0) + 1;
      return acc;
    }, {});

    const zoneData = patients.reduce((acc, p) => {
      const zone = p.Zone || 'ไม่ระบุ';
      acc[zone] = (acc[zone] || 0) + 1;
      return acc;
    }, {});

    const biData = { '15-20': 0, '10-15': 0, '5-10': 0, '1-5': 0 };
    patients.forEach(p => {
      const bi = p.LatestBI;
      if (bi >= 15) biData['15-20']++;
      else if (bi >= 10) biData['10-15']++;
      else if (bi >= 5) biData['5-10']++;
      else if (bi >= 1) biData['1-5']++;
    });

    // --- ส่วนที่แก้ไข: เพิ่มสถานะ 'ปิดบริการ' ---
    const visitProgress = {
        'ยังไม่กำหนดวันเยี่ยม': 0,
        'รอเยี่ยม': 0,
        'อยู่ในกระบวนการบำบัด': 0,
        'สำเร็จ': 0,
        'ปิดบริการ': 0 // เพิ่ม Key ใหม่
    };
    
    patients.forEach(p => {
        // 1. เช็คสถานะปิดบริการก่อนเป็นอันดับแรก
        if (p.PatientStatus === 'Discharged') {
            visitProgress['ปิดบริการ']++;
            return; // นับแล้วข้ามไปคนถัดไปเลย ไม่ต้องเช็คตารางนัด
        }

        // 2. ถ้ายังไม่ปิดบริการ ค่อยเช็คสถานะการเยี่ยม
        const { completed, total } = p.scheduleInfo;
        if (total === 0) {
            visitProgress['ยังไม่กำหนดวันเยี่ยม']++; 
        } else if (total > 0 && completed === 0) {
            visitProgress['รอเยี่ยม']++; 
        } else if (completed > 0 && completed < total) {
            visitProgress['อยู่ในกระบวนการบำบัด']++; 
        } else if (total > 0 && completed >= total) {
            visitProgress['สำเร็จ']++; 
        }
    });
    // --- สิ้นสุดการแก้ไข ---

    return {
      totalPatients: patients.length,
      diagnosisData,
      zoneData,
      biData,
      visitProgress
    };
  } catch(e) {
    Logger.log("Dashboard Error: " + e);
    return { error: e.toString() };
  }
}
/**
 * ตรวจสอบฟอร์มที่จำเป็นและอัปเดตสถานะในชีต Schedules เป็น "Completed"
 * @param {string} patientId - ID ของผู้ป่วย
 * @param {string|number} visitCount - ลำดับการเยี่ยม
 */
function updateScheduleStatus(patientId, visitCount) {
  try {
    let isCompleted = false;
    const visitNumber = Number(visitCount);

    // Helper: เช็คว่ามีข้อมูลในชีตนั้นๆ หรือไม่
    const checkExist = (sheet) => {
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) return false;
      const headers = data[0];
      const pidIdx = headers.indexOf('PatientID');
      const visitIdx = headers.indexOf('VisitCount'); // ตรวจสอบชื่อคอลัมน์ในชีต OPD/SOAP ว่าใช้ VisitCount
      
      // ถ้าหา VisitCount ไม่เจอ อาจจะเป็น VisitNumber ในบางชีต ให้ลองหาดู
      const visitIdxAlt = headers.indexOf('VisitNumber');
      const finalVisitIdx = visitIdx !== -1 ? visitIdx : visitIdxAlt;

      if (pidIdx === -1 || finalVisitIdx === -1) return false;
      
      return data.some(row => String(row[pidIdx]) === String(patientId) && Number(row[finalVisitIdx]) === visitNumber);
    };

    // เงื่อนไขใหม่: ดูตามหลักการ OPD (ครั้ง 1) และ SOAP (ครั้ง 2+)
    if (visitNumber === 1) {
        // ครั้งที่ 1: ถ้ามี OPD ถือว่าจบ
        if (checkExist(opdSheet)) isCompleted = true;
    } else {
        // ครั้งที่ 2+: ถ้ามี SOAP ถือว่าจบ
        if (checkExist(soapSheet)) isCompleted = true;
    }

    // อัปเดตสถานะใน Schedule
    if (isCompleted) {
      const scheduleData = scheduleSheet.getDataRange().getValues();
      const headers = scheduleData.shift();
      const pidIdx = headers.indexOf('PatientID');
      const visitIdx = headers.indexOf('VisitNumber');
      const statusIdx = headers.indexOf('Status');

      const rowIndex = scheduleData.findIndex(row => String(row[pidIdx]) === String(patientId) && Number(row[visitIdx]) === visitNumber);

      if (rowIndex !== -1) {
        scheduleSheet.getRange(rowIndex + 2, statusIdx + 1).setValue('Completed');
        return { status: 'success', message: 'Updated schedule status to Completed' };
      }
    }
    return { status: 'success', message: 'No schedule update needed' };

  } catch (e) {
    Logger.log(`Error in updateScheduleStatus: ${e.toString()}`);
    return { status: 'error', message: e.toString() };
  }
}
/**
 * ดึงข้อมูลการรักษาทั้งหมด (Consent, BI, OPD, SOAP) ของผู้ป่วยหนึ่งคน
 * @param {string} patientId - ID ของผู้ป่วย
 * @returns {object} - Object ที่มีข้อมูลการรักษาทั้งหมด
 */
function getAllRecordsForPatient(patientId) {
  try {
    const consents = getRecordsByPatientId(consentSheet, patientId).records || [];
    const biAssessments = getRecordsByPatientId(biSheet, patientId).records || [];
    const opdRecords = getRecordsByPatientId(opdSheet, patientId).records || [];
    const soapNotes = getRecordsByPatientId(soapSheet, patientId).records || [];
    const tmseRecords = getRecordsByPatientId(tmseSheet, patientId).records || [];
    const mhqRecords = getRecordsByPatientId(mhqSheet, patientId).records || [];
    const dysphagiaRecords = getRecordsByPatientId(dysphagiaSheet, patientId).records || [];

    return {
      status: 'success',
      records: {
        consents,
        biAssessments,
        opdRecords,
        soapNotes,
        tmseRecords,
        mhqRecords,
        dysphagiaRecords
      }
    };
  } catch (e) {
    Logger.log(`Error in getAllRecordsForPatient: ${e.toString()}`);
    return { status: 'error', message: e.toString() };
  }
}

// =================================================================
// AUTHENTICATION FUNCTIONS
// =================================================================

/**
 * ฟังก์ชันหลักสำหรับจัดการการสมัครสมาชิก
 */
function registerUser(userInfo) {
  try {
    const { fullName, email, username, password } = userInfo;
    const usersData = userSheet.getDataRange().getValues();
    const headers = usersData.length > 0 ? usersData[0] : [];
    
    // ตรวจสอบข้อมูลซ้ำ
    if (usersData.length > 1) {
      const emailColumnIndex = headers.indexOf('Email');
      const usernameColumnIndex = headers.indexOf('Username');
      const emailExists = usersData.slice(1).some(row => row[emailColumnIndex] === email);
      if (emailExists) {
        throw new Error('อีเมลนี้ถูกใช้งานแล้ว');
      }
      const usernameExists = usersData.slice(1).some(row => row[usernameColumnIndex] === username);
      if (usernameExists) {
        throw new Error('Username นี้มีผู้ใช้งานแล้ว');
      }
    }

    // --- ส่วนสำคัญด้านความปลอดภัย: การเข้ารหัสผ่าน ---
    const salt = Utilities.getUuid(); // สร้าง Salt ที่ไม่ซ้ำกันสำหรับผู้ใช้แต่ละคน
    // นำรหัสผ่าน + salt มารวมกันแล้วเข้ารหัสด้วย SHA-256
    const passwordHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt));

    // --- สร้าง Token สำหรับยืนยันอีเมล ---
    const verificationToken = Utilities.getUuid().replace(/-/g, '');
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 24); // Token มีอายุ 24 ชั่วโมง

    const newRow = [
      Utilities.getUuid(),    // UserID
      fullName,               // FullName
      email,                  // Email
      username,               // Username
      passwordHash,           // PasswordHash (ที่เข้ารหัสแล้ว)
      salt,                   // Salt
      false,                  // IsVerified (สถานะเริ่มต้นคือยังไม่ยืนยัน)
      verificationToken,      // VerificationToken
      expiryDate,             // TokenExpiry
      new Date()              // CreatedAt
    ];

    userSheet.appendRow(newRow);

    // ส่งอีเมลยืนยัน
    sendVerificationEmail(email, verificationToken, fullName);

    return { status: 'success', message: 'สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันบัญชี' };

  } catch (e) {
    Logger.log('Registration Error: ' + e.toString());
    return { status: 'error', message: e.message };
  }
}

/**
 * ฟังก์ชันสำหรับส่งอีเมลยืนยัน
 */
function sendVerificationEmail(email, token, fullName) {
  const webAppUrl = getWebAppUrl();
  const verificationUrl = `${webAppUrl}?action=verify&token=${token}`;
  const subject = 'ยืนยันอีเมลของคุณสำหรับ สุขกาย IMC Plus';
  const body = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>สวัสดีคุณ ${fullName},</p>
        <p>ขอบคุณที่สมัครใช้งานระบบสุขกาย IMC Plus กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ:</p>

        <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
          <tr>
            <td align="center" style="border-radius: 5px; background-color: #14B8A6;">
              <a href="${verificationUrl}" target="_blank" style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; display: inline-block; padding: 12px 25px; border-radius: 5px;">
                ยืนยันอีเมล
              </a>
            </td>
          </tr>
        </table>

        <p style="font-size: 12px; color: #666;">
          หากปุ่มไม่ทำงาน สามารถคัดลอกลิงก์ด้านล่างไปวางในเบราว์เซอร์ได้โดยตรง:
          <br>
          <a href="${verificationUrl}" style="color: #14B8A6;">${verificationUrl}</a>
        </p>

        <p>หากคุณไม่ได้ทำการสมัคร กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
        <p><i>ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง</i></p>
      </body>
    </html>
  `;
  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: body
  });
}

/**
 * ฟังก์ชันสำหรับดึง URL ของ Web App ปัจจุบัน
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
/**
 * ตรวจสอบ Token และอัปเดตสถานะผู้ใช้
 */
function verifyUserToken(token) {
  try {
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    const tokenCol = headers.indexOf('VerificationToken');
    const verifiedCol = headers.indexOf('IsVerified');
    const expiryCol = headers.indexOf('TokenExpiry');

    // หาแถวที่มี Token ตรงกัน
    // data.findIndex จะเริ่มค้นจาก index 0 ซึ่งคือ headers, แต่เราไม่ต้องการ เลยต้อง +1 ทีหลัง
    const rowIndexInData = data.slice(1).findIndex(row => row[tokenCol] === token);

    if (rowIndexInData === -1) {
      throw new Error('Token ไม่ถูกต้องหรือไม่พบในระบบ');
    }

    const sheetRowIndex = rowIndexInData + 2; // +1 for header, +1 for 0-based index
    const tokenExpiryDate = new Date(data[rowIndexInData + 1][expiryCol]);
    if (new Date() > tokenExpiryDate) {
       throw new Error('Token หมดอายุแล้ว กรุณาสมัครสมาชิกใหม่อีกครั้ง');
    }

    // อัปเดตสถานะ IsVerified เป็น TRUE และล้าง Token
    userSheet.getRange(sheetRowIndex, verifiedCol + 1).setValue(true);
    userSheet.getRange(sheetRowIndex, tokenCol + 1).setValue(''); // ล้าง Token หลังใช้งาน

    return { status: 'success' };
  } catch (e) {
    Logger.log('Verification Error: ' + e);
    return { status: 'error', message: e.message };
  }
}
/**
 * ตรวจสอบข้อมูล Login
 */
function loginUser(credentials) {
  try {
    const { username, password } = credentials;
    if (!username || !password) {
      throw new Error('กรุณากรอก Username และ Password');
    }

    const data = userSheet.getDataRange().getValues();
    const headers = data.shift(); // เอา header ออก
    const usernameCol = headers.indexOf('Username');
    const userRow = data.find(row => row[usernameCol] === username);

    if (!userRow) {
      throw new Error('Username หรือ Password ไม่ถูกต้อง');
    }

    const verifiedCol = headers.indexOf('IsVerified');
    if (!userRow[verifiedCol]) {
      throw new Error('บัญชีของคุณยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบอีเมลของคุณ');
    }

    const hashCol = headers.indexOf('PasswordHash');
    const saltCol = headers.indexOf('Salt');
    const storedHash = userRow[hashCol];
    const salt = userRow[saltCol];

    const providedHash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt));

    if (providedHash !== storedHash) {
      throw new Error('Username หรือ Password ไม่ถูกต้อง');
    }

    // Login สำเร็จ
    const fullNameCol = headers.indexOf('FullName');
    const user = {
      fullName: userRow[fullNameCol]
    };
    return { status: 'success', user: user };

  } catch (e) {
    Logger.log('Login Error: ' + e);
    return { status: 'error', message: e.message };
  }
}
// =================================================================
// DAILY SUMMARY FUNCTIONS (แก้ไขให้เหลือชุดเดียว)
// =================================================================
function getDailySummaryData(startDateStr, endDateStr) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetPatients = ss.getSheetByName("Patients");
    const sheetSchedules = ss.getSheetByName("Schedules");
    const sheetOPD = ss.getSheetByName("OPDRecords");
    const sheetSOAP = ss.getSheetByName("SOAPNotes");
    const sheetBI = ss.getSheetByName("BIAssessments");

    if (!sheetPatients || !sheetSchedules || !sheetOPD || !sheetSOAP || !sheetBI) {
      throw new Error("ไม่พบแผ่นงานบางส่วน กรุณาตรวจสอบชื่อ Tab");
    }

    const opdBudgetIdx = ensureSheetColumn(sheetOPD, 'BudgetStatus');
    const soapBudgetIdx = ensureSheetColumn(sheetSOAP, 'BudgetStatus');

    // 1. [MAP ข้อมูลคนไข้] PID=A(0), CN=C(2), Name=D(3), Zone=AD(29), InitialBI=AB(27)
    const patientData = sheetPatients.getDataRange().getValues();
    const patientMap = {};
    patientData.slice(1).forEach(row => {
      const pid = row[0];
      if (pid) {
        patientMap[pid] = {
          cn: row[2] || "-",
          name: row[3] || "ไม่ระบุชื่อ",
          zone: row[29] || "-", 
          initialBI: parseFloat(row[27]) || 0,
          history: [], 
          actualVisitCount: 0 
        };
      }
    });

    // 2. [MAP ประวัติการประเมิน] O-S (14-18)=Impairment, T-W (19-22)=Fx.
    const biRows = sheetBI.getDataRange().getValues();
    const mapping = {
      14: "Swallowing", 15: "Communicate", 16: "Mobility", 17: "Cognitive", 18: "Bowel",
      19: "Fx.Bathroom", 20: "Fx.Bed", 21: "Fx.Movement", 22: "Fx.Stairs"
    };

    biRows.slice(1).forEach(row => {
      const pid = row[1];
      const dateVal = row[2];
      if (pid && dateVal && patientMap[pid]) {
        const dStr = Utilities.formatDate(new Date(dateVal), "GMT+7", "yyyy-MM-dd");
        let imps = []; let fxs = [];
        for (let i = 14; i <= 18; i++) if (row[i] === true || row[i] === "TRUE") imps.push(mapping[i]);
        for (let i = 19; i <= 22; i++) if (row[i] === true || row[i] === "TRUE") fxs.push(mapping[i]);

        patientMap[pid].history.push({
          date: dStr,
          score: parseFloat(row[10]) || 0,
          imps: imps.join(", "),
          fxs: fxs.join(", ")
        });
      }
    });

    Object.keys(patientMap).forEach(pid => {
      patientMap[pid].history.sort((a, b) => a.date.localeCompare(b.date));
    });

    // ฟังก์ชันช่วยหาข้อมูลล่าสุดก่อนวันเป้าหมาย
    const getLatestBefore = (pid, targetDate) => {
      const p = patientMap[pid];
      if (!p || p.history.length === 0) return { score: p ? p.initialBI : 0, imps: "", fxs: "" };
      const historyBefore = p.history.filter(h => h.date < targetDate);
      return historyBefore.length > 0 ? historyBefore[historyBefore.length - 1] : { score: p.initialBI, imps: "", fxs: "" };
    };

    // 3. รวบรวมข้อมูลเยี่ยมแล้ว (Visited) - OPD(C) และ SOAP(D)
    const visitedSet = new Set();
    const visitedDetails = [];

    // OPDRecords: Date=C(2), PID=B(1), Count=D(3), BI=J(9)
    sheetOPD.getDataRange().getValues().slice(1).forEach(row => {
      const pid = row[1]; const dateVal = row[2];
      if (pid && dateVal) {
        const dStr = Utilities.formatDate(new Date(dateVal), "GMT+7", "yyyy-MM-dd");
        visitedSet.add(pid + "_" + dStr);
        if (patientMap[pid]) patientMap[pid].actualVisitCount++;
        if (dStr >= startDateStr && dStr <= endDateStr) {
          const p = patientMap[pid];
          const todayAss = p ? p.history.find(h => h.date === dStr) : null;
          const prev = getLatestBefore(pid, dStr);
          visitedDetails.push({
            patientId: String(pid), date: dStr, cn: p?.cn || pid, patientName: p?.name || "-",
            zone: p?.zone || "-", 
            multipleImpairment: { imps: todayAss ? todayAss.imps : prev.imps, fxs: todayAss ? todayAss.fxs : prev.fxs },
            biBefore: prev.score, biAfter: parseFloat(row[9]) || (todayAss ? todayAss.score : prev.score),
            visitNumber: row[3] || 1, status: "Visited",
            budgetStatus: getBudgetStatusValue(row[opdBudgetIdx])
          });
        }
      }
    });

    // SOAPNotes: Date=D(3), PID=B(1), Count=E(4), BI=Q(16)
    sheetSOAP.getDataRange().getValues().slice(1).forEach(row => {
      const pid = row[1]; const dateVal = row[3];
      if (pid && dateVal) {
        const dStr = Utilities.formatDate(new Date(dateVal), "GMT+7", "yyyy-MM-dd");
        if (!visitedSet.has(pid + "_" + dStr)) {
          visitedSet.add(pid + "_" + dStr);
          if (patientMap[pid]) patientMap[pid].actualVisitCount++;
          if (dStr >= startDateStr && dStr <= endDateStr) {
            const p = patientMap[pid];
            const todayAss = p ? p.history.find(h => h.date === dStr) : null;
            const prev = getLatestBefore(pid, dStr);
            visitedDetails.push({
              patientId: String(pid), date: dStr, cn: p?.cn || pid, patientName: p?.name || "-",
              zone: p?.zone || "-", 
              multipleImpairment: { imps: todayAss ? todayAss.imps : prev.imps, fxs: todayAss ? todayAss.fxs : prev.fxs },
              biBefore: prev.score, biAfter: parseFloat(row[16]) || (todayAss ? todayAss.score : prev.score),
              visitNumber: row[4] || 1, status: "Visited",
              budgetStatus: getBudgetStatusValue(row[soapBudgetIdx])
            });
          }
        }
      }
    });

    // 4. หาผู้ป่วยรอเยี่ยม (Schedules: Date=D(3), PID=B(1))
    const pendingDetails = [];
    sheetSchedules.getDataRange().getValues().slice(1).forEach(row => {
      const pid = row[1]; const dateVal = row[3];
      if (pid && dateVal) {
        const sDateStr = Utilities.formatDate(new Date(dateVal), "GMT+7", "yyyy-MM-dd");
        if (sDateStr >= startDateStr && sDateStr <= endDateStr && !visitedSet.has(pid + "_" + sDateStr)) {
          const latest = getLatestBefore(pid, sDateStr);
          pendingDetails.push({
            date: sDateStr, cn: patientMap[pid]?.cn || pid, patientName: patientMap[pid]?.name || "-",
            zone: patientMap[pid]?.zone || "-", 
            multipleImpairment: { imps: latest.imps, fxs: latest.fxs },
            biBefore: latest.score, biAfter: null,
            visitNumber: (patientMap[pid]?.actualVisitCount || 0) + 1, status: "Pending"
          });
        }
      }
    });

    return { status: 'success', pending: pendingDetails, visited: visitedDetails };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function updateBudgetStatus(payload) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      return { status: 'error', message: 'Unable to acquire lock for budget update' };
    }

    const patientId = String(payload && payload.patientId || '').trim();
    const visitDate = normalizeDateKey(payload && payload.visitDate);
    const budgetStatus = getBudgetStatusValue(payload && payload.budgetStatus);

    if (!patientId || !visitDate) {
      return { status: 'error', message: 'Missing patientId or visitDate' };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const targets = [
      { sheet: ss.getSheetByName('OPDRecords'), dateHeaders: ['VisitDate', 'Date'] },
      { sheet: ss.getSheetByName('SOAPNotes'), dateHeaders: ['VisitDate', 'Date'] }
    ];

    let updatedCount = 0;
    targets.forEach(target => {
      if (!target.sheet) return;

      const budgetIdx = ensureSheetColumn(target.sheet, 'BudgetStatus');
      const data = target.sheet.getDataRange().getValues();
      if (data.length < 2) return;

      const headers = data[0];
      const patientIdx = headers.indexOf('PatientID');
      const dateIdx = target.dateHeaders.map(header => headers.indexOf(header)).find(index => index > -1);
      if (patientIdx === -1 || dateIdx === undefined) return;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][patientIdx]).trim() !== patientId) continue;
        if (normalizeDateKey(data[i][dateIdx]) !== visitDate) continue;
        target.sheet.getRange(i + 1, budgetIdx + 1).setValue(budgetStatus);
        updatedCount++;
      }
    });

    if (!updatedCount) {
      return { status: 'error', message: 'Visit record not found' };
    }

    return { status: 'success', budgetStatus: budgetStatus };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
function getBiBefore(pid, targetDate, patientMap) {
  const p = patientMap[pid];
  if (!p) return 0;
  const history = p.biHistory.filter(h => h.date < targetDate).sort((a, b) => b.date.localeCompare(a.date));
  return history.length > 0 ? history[0].score : p.initialBI;
}

// ฟังก์ชันช่วยหา BI ก่อนนัด และสร้าง Item ข้อมูล
function createVisitItem(pid, date, score, count, src, pMap, aMap) {
  const p = pMap[pid] || { name: pid, cn: pid, initialBI: 0 };
  const am = aMap[pid + "_" + date] || { impairments: "-" };
  return {
    date: date, pid: pid, cn: p.cn, patientName: p.name,
    multipleImpairment: am.impairments,
    initialBI: getBiBefore(pid, date, pMap),
    latestBI: score || am.score || 0,
    visitNumber: count || 1, source: src
  };
}

function getBiBefore(pid, visitDate, pMap) {
  const p = pMap[pid];
  if (!p) return 0;
  const history = p.biHistory.filter(h => h.date < visitDate);
  return history.length > 0 ? history[history.length - 1].score : p.initialBI;
}

/**
 * ฟังก์ชันช่วยนับลำดับการเยี่ยมจริงตามจำนวนเอกสาร
 * ครั้งที่ 1 = OPD, ครั้งที่ 2+ = SOAP
 */
function calculateVisitOrder(patientId, targetDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const opdData = ss.getSheetByName("OPDRecords").getDataRange().getValues();
  const soapData = ss.getSheetByName("SOAPNotes").getDataRange().getValues();
  
  let allVisits = [];
  
  // รวบรวมวันที่เยี่ยมทั้งหมดของคนไข้คนนี้
  [opdData, soapData].forEach(data => {
    const headers = data[0];
    const pIdIdx = headers.indexOf('PatientID');
    const dateIdx = headers.indexOf('VisitDate');
    
    data.slice(1).forEach(row => {
      if (String(row[pIdIdx]).trim() === String(patientId).trim()) {
        allVisits.push(new Date(row[dateIdx]).getTime());
      }
    });
  });
  
  // เรียงวันที่จากน้อยไปมาก
  allVisits.sort((a, b) => a - b);
  
  // หาตำแหน่งของ targetDate ในรายการวันที่ทั้งหมด
  const targetTime = new Date(targetDate).getTime();
  const index = allVisits.indexOf(targetTime);
  
  return index !== -1 ? (index + 1) : "-";
}
function getVisitSummary(startDateStr, endDateStr) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const scheduleSheet = ss.getSheetByName("Schedules");
    const opdSheet = ss.getSheetByName("OPDRecords");
    const soapSheet = ss.getSheetByName("SOAPNotes");
    
    // ดึงข้อมูลคนไข้ทั้งหมด
    const patients = getPatientsWithDetails(); 
    const pMap = {};
    patients.forEach(p => pMap[String(p.ClinicNumber).trim()] = p);

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    const completed = [];
    const pending = [];
    const processedKeys = new Set(); // ป้องกันชื่อซ้ำในวันเดียวกัน

    // -------------------------------------------------------
    // ส่วนที่ 1: ดึงจากประวัติการเยี่ยมจริง (แม้ใน Schedules จะถูกลบไปแล้ว)
    // -------------------------------------------------------
    [opdSheet, soapSheet].forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      data.slice(1).forEach(row => {
        const cn = String(row[0]).trim();
        const vDate = new Date(row[1]);
        if (vDate >= start && vDate <= end) {
          const dateStr = Utilities.formatDate(vDate, "GMT+7", "yyyy-MM-dd");
          const key = cn + "_" + dateStr;
          
          if (!processedKeys.has(key) && pMap[cn]) {
            const p = pMap[cn];
            completed.push({
              cn: cn,
              patientName: p.PatientName,
              zone: p.Zone,
              initialBI: p.InitialBI || 0,
              latestBI: p.LatestBI,
              multipleImpairment: p.multipleImpairment,
              visitDate: vDate.toISOString(),
              visitNumber: row[3] || "-", // ดึง VisitCount จากเอกสาร
              isSuccess: true
            });
            processedKeys.add(key);
          }
        }
      });
    });

    // -------------------------------------------------------
    // ส่วนที่ 2: ดึงจาก Schedules (สำหรับคนที่รอนัด/ยังไม่ได้เยี่ยม)
    // -------------------------------------------------------
    const schData = scheduleSheet.getDataRange().getValues();
    schData.slice(1).forEach(row => {
      if (!row[3]) return;
      const cn = String(row[1]).trim();
      const vDate = new Date(row[3]);
      const dateStr = Utilities.formatDate(vDate, "GMT+7", "yyyy-MM-dd");
      const key = cn + "_" + dateStr;

      if (vDate >= start && vDate <= end && !processedKeys.has(key)) {
        const p = pMap[cn];
        if (p) {
          pending.push({
            cn: cn,
            patientName: p.PatientName,
            zone: p.Zone,
            initialBI: p.InitialBI || 0,
            latestBI: p.LatestBI,
            multipleImpairment: p.multipleImpairment,
            visitDate: vDate.toISOString(),
            visitNumber: row[2], // VisitNumber คอลัมน์ C
            isSuccess: false
          });
          processedKeys.add(key);
        }
      }
    });

    return { status: 'success', completedVisits: completed, pendingVisits: pending };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSchedule(patientId, visitNumber) {
    try {
        const data = scheduleSheet.getDataRange().getValues();
        const headers = data.shift();
        const pidIdx = headers.indexOf('PatientID');
        const visitIdx = headers.indexOf('VisitNumber');

        // ค้นหาแถวที่ตรงกัน (ลบจากล่างขึ้นบน)
        for (let i = data.length - 1; i >= 0; i--) {
            if (String(data[i][pidIdx]) === String(patientId) && Number(data[i][visitIdx]) === Number(visitNumber)) {
                scheduleSheet.deleteRow(i + 2); // +2 เพราะ index เริ่ม 0 และมี header
                return { status: 'success', message: 'ลบรายการนัดหมายเรียบร้อย' };
            }
        }
        return { status: 'error', message: 'ไม่พบรายการนัดหมาย' };
    } catch (e) {
        return { status: 'error', message: e.toString() };
    }
}
function saveScheduleOrder(updates) {
  // updates = [{ patientId, visitNumber, queueIndex, zone }, ...]
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      return { status: 'error', message: 'Unable to acquire lock for schedule update' };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Schedules');
    const data = sheet.getDataRange().getValues();
    if (!data.length) {
      return { status: 'error', message: 'Schedules sheet is empty' };
    }

    const headers = data[0];
    const pidIdx = headers.indexOf('PatientID');
    const visitIdx = headers.indexOf('VisitNumber');
    if (pidIdx === -1 || visitIdx === -1) {
      return { status: 'error', message: 'Schedules sheet is missing required columns' };
    }

    const ensureColumn = columnName => {
      let columnIndex = headers.indexOf(columnName);
      if (columnIndex === -1) {
        columnIndex = headers.length;
        sheet.getRange(1, columnIndex + 1).setValue(columnName);
        headers.push(columnName);
      }
      return columnIndex;
    };

    const queueIdx = ensureColumn('QueueIndex');
    const scheduleZoneIdx = ensureColumn('ScheduleZone');

    const rowMap = {};
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][pidIdx]) + '_' + String(data[i][visitIdx]);
      rowMap[key] = i + 1;
    }

    updates.forEach(update => {
      const key = String(update.patientId) + '_' + String(update.visitNumber);
      const rowNum = rowMap[key];
      if (!rowNum) return;

      sheet.getRange(rowNum, queueIdx + 1).setValue(update.queueIndex);
      sheet.getRange(rowNum, scheduleZoneIdx + 1).setValue(update.zone || '');
    });

    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ฟังก์ชันช่วยสร้างข้อความ Multiple Impairment + Fx.HIP รวมกัน
 */
function getCombinedImpairmentText(record) {
  var parts = [];

  // --- 1. Multiple Impairment เดิม ---
  // เช็คทั้งชื่อแบบมี BI_ นำหน้า (จากฟอร์มใหม่) และแบบไม่มี (เผื่อข้อมูลเก่า)
  if (checkTrue(record['BI_impairment_swallowing']) || checkTrue(record['impairment_swallowing'])) parts.push("1.Swallowing");
  if (checkTrue(record['BI_impairment_communicate']) || checkTrue(record['impairment_communicate'])) parts.push("2.Communicate");
  if (checkTrue(record['BI_impairment_mobility']) || checkTrue(record['impairment_mobility'])) parts.push("3.Mobility");
  if (checkTrue(record['BI_impairment_cognitive']) || checkTrue(record['impairment_cognitive'])) parts.push("4.Cognitive/Perception");
  if (checkTrue(record['BI_impairment_bowel']) || checkTrue(record['impairment_bowel'])) parts.push("5.Bowel and Bladder");

  // --- 2. Fx.Around HIP (เพิ่มใหม่) ---
  if (checkTrue(record['BI_fx_bathroom']) || checkTrue(record['fx_bathroom'])) parts.push("Fx:เข้าห้องน้ำ");
  if (checkTrue(record['BI_fx_bed']) || checkTrue(record['fx_bed'])) parts.push("Fx:ขึ้นลงจากเตียง");
  if (checkTrue(record['BI_fx_movement']) || checkTrue(record['fx_movement'])) parts.push("Fx:เคลื่อนไหวฯ");
  if (checkTrue(record['BI_fx_stairs']) || checkTrue(record['fx_stairs'])) parts.push("Fx:ขึ้นลงบันได");

  return parts.length > 0 ? parts.join(", ") : "-";
}

/**
 * Helper function สำหรับเช็คค่าว่าเป็น true หรือไม่
 * รองรับทั้ง Boolean true, String "true", "TRUE"
 */
function checkTrue(val) {
  return val === true || String(val).toUpperCase() === 'TRUE';
}
// เพิ่มฟังก์ชันใน code.gs.txt เพื่อตรวจสอบและอัปเดต Status ที่ค้างอยู่
function syncVisitStatus() {
  const schedSheet = ss.getSheetByName('Schedule');
  const schedData = schedSheet.getDataRange().getValues();
  const visitData = ss.getSheetByName('Assessments').getDataRange().getValues();

  for (let i = 1; i < schedData.length; i++) {
    const cn = schedData[i][0];
    const date = new Date(schedData[i][1]).toDateString();
    const currentStatus = schedData[i][4]; // สมมติ status อยู่คอลัมน์ 5

    const exists = visitData.some(v => 
      v[0] == cn && new Date(v[1]).toDateString() === date
    );

    if (exists && currentStatus !== 'Visited') {
      schedSheet.getRange(i + 1, 5).setValue('Visited'); // อัปเดตสถานะในชีต
    }
  }
}
/**
 * ฟังก์ชันใหม่: ดึงข้อมูลนัดหมายพร้อมตรวจสอบสถานะจริงจากเอกสาร (OPD/SOAP)
 * ยึดวันที่และ HN เป็นสำคัญ เพื่อแก้ปัญหา Status ในชีตไม่เปลี่ยน หรือ Visit Number ซ้ำ
 */
function getScheduleData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const schedSheet = ss.getSheetByName('Schedules');
  const opdSheet = ss.getSheetByName('OPDRecords');
  const soapSheet = ss.getSheetByName('SOAPNotes');
  const patientSheet = ss.getSheetByName('Patients');

  const schedData = schedSheet.getDataRange().getValues();
  const schedHeaders = schedData.shift();
  
  // สร้าง Map ข้อมูลการเยี่ยมจริงจาก OPD และ SOAP (Key: PatientID_Date)
  const actualVisitMap = {};
  
  const processActualVisits = (sheet) => {
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const pidIdx = headers.indexOf('PatientID');
    let dateIdx = headers.indexOf('VisitDate');
    if (dateIdx === -1) dateIdx = headers.indexOf('Date');

    data.forEach(row => {
      const pid = String(row[pidIdx]).trim();
      const vDate = row[dateIdx] instanceof Date ? 
                    Utilities.formatDate(row[dateIdx], "GMT+7", "yyyy-MM-dd") : "";
      if (pid && vDate) {
        actualVisitMap[pid + "_" + vDate] = true;
      }
    });
  };

  processActualVisits(opdSheet);
  processActualVisits(soapSheet);

  // ดึงชื่อคนไข้มา Map
  const pData = patientSheet.getDataRange().getValues();
  const pHeaders = pData.shift();
  const pNameMap = {};
  pData.forEach(r => pNameMap[String(r[pHeaders.indexOf('PatientID')])] = r[pHeaders.indexOf('PatientName')]);

  const pidIdx = schedHeaders.indexOf('PatientID');
  const dateIdx = schedHeaders.indexOf('ScheduledDate');

  return schedData.map(row => {
    const pid = String(row[pidIdx]).trim();
    const sDateRaw = row[dateIdx];
    const sDateStr = sDateRaw instanceof Date ? 
                     Utilities.formatDate(sDateRaw, "GMT+7", "yyyy-MM-dd") : "";
    
    // ตรวจสอบว่าในวันที่นัด HN นี้มีเอกสารบันทึกแล้วหรือไม่
    const hasDocument = actualVisitMap[pid + "_" + sDateStr] === true;
    
    let finalStatus = "รอเยี่ยม";
    if (hasDocument) {
      finalStatus = "เยี่ยมสำเร็จ";
    } else {
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      if (sDateStr < todayStr && sDateStr !== "") {
        finalStatus = "เลยกำหนด/ไม่สำเร็จ";
      }
    }

    return {
      patientId: pid,
      patient_name: pNameMap[pid] || "ไม่พบชื่อ",
      date: sDateRaw,
      actualStatus: finalStatus,
      hn: pid // หรือดึง ClinicNumber มาใส่แทน
    };
  });
}
/**
 * ดึงข้อมูลนัดหมายใหม่ โดยตรวจสอบสถานะจากการมีอยู่ของเอกสารในชีท OPD/SOAP
 */
function getUpdatedScheduleData() {
  const schedSheet = ss.getSheetByName('Schedules');
  const opdSheet = ss.getSheetByName('OPDRecords');
  const soapSheet = ss.getSheetByName('SOAPNotes');
  const patientSheet = ss.getSheetByName('Patients');

  const schedData = schedSheet.getDataRange().getValues();
  const schedHeaders = schedData.shift();
  
  // 1. สร้าง Map ข้อมูลการเยี่ยมจริง (Key: PatientID + Date)
  const actualVisitMap = {};
  const processActual = (sheet) => {
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const pidIdx = headers.indexOf('PatientID');
    let dateIdx = headers.indexOf('VisitDate');
    if (dateIdx === -1) dateIdx = headers.indexOf('Date');

    data.forEach(row => {
      const pid = String(row[pidIdx]).trim();
      const vDate = row[dateIdx] instanceof Date ? 
                    Utilities.formatDate(row[dateIdx], "GMT+7", "yyyy-MM-dd") : "";
      if (pid && vDate) actualVisitMap[pid + "_" + vDate] = true;
    });
  };
  processActual(opdSheet);
  processActual(soapSheet);

  // 2. Map ชื่อคนไข้และข้อมูลจำเป็น
  const pData = patientSheet.getDataRange().getValues();
  const pHeaders = pData.shift();
  const patientInfoMap = {};
  pData.forEach(r => {
    const pid = String(r[pHeaders.indexOf('PatientID')]);
    patientInfoMap[pid] = {
      name: r[pHeaders.indexOf('PatientName')],
      cn: r[pHeaders.indexOf('ClinicNumber')],
      zone: r[pHeaders.indexOf('Zone')]
    };
  });

  const pidIdx = schedHeaders.indexOf('PatientID');
  const dateIdx = schedHeaders.indexOf('ScheduledDate');
  const visitNumIdx = schedHeaders.indexOf('VisitNumber');

  return schedData.map(row => {
    const pid = String(row[pidIdx]).trim();
    const sDate = row[dateIdx];
    const sDateStr = sDate instanceof Date ? Utilities.formatDate(sDate, "GMT+7", "yyyy-MM-dd") : "";
    const p = patientInfoMap[pid] || { name: "ไม่พบข้อมูล", cn: "-", zone: "-" };
    
    // ตรวจสอบสถานะจริงจากเอกสาร
    const hasDoc = actualVisitMap[pid + "_" + sDateStr] === true;
    let status = "รอเยี่ยม";
    if (hasDoc) {
      status = "เยี่ยมสำเร็จ";
    } else {
      const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      if (sDateStr < todayStr && sDateStr !== "") status = "เลยกำหนด";
    }

    return {
      patientId: pid,
      patientName: p.name,
      clinicNumber: p.cn,
      zone: p.zone,
      date: sDateStr,
      visitNumber: row[visitNumIdx],
      actualStatus: status
    };
  });
}
function getActualVisitsMap(ss) {
  const map = {};
  ['OPDRecords', 'SOAPNotes'].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pidIdx = headers.indexOf('PatientID');
    let dateIdx = headers.indexOf('VisitDate');
    if (dateIdx === -1) dateIdx = headers.indexOf('Date');

    if (pidIdx > -1 && dateIdx > -1) {
      data.slice(1).forEach(row => {
        const pid = String(row[pidIdx]);
        const date = row[dateIdx];
        if (pid && date instanceof Date) {
          const dateStr = Utilities.formatDate(date, "GMT+7", "yyyy-MM-dd");
          if (!map[pid]) map[pid] = [];
          if (!map[pid].includes(dateStr)) map[pid].push(dateStr);
        }
      });
    }
  });
  return map;
}
/**
 * ดึงข้อมูลตารางนัดหมายและคะแนน BI (Chaining Scores)
 */
function getPatientScheduleWithStats(patientId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const patientIdStr = String(patientId).trim();
    
    // 1. ดึงข้อมูลพื้นฐานคนไข้ (เพื่อเอา InitialBI)
    const patients = getPatientsWithDetails();
    const patient = patients.find(p => String(p.PatientID).trim() === patientIdStr);
    if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };

    // 2. รวบรวมวันที่ทั้งหมด (นัดหมาย + เยี่ยมจริง)
    let allDatesSet = new Set();
    
    // จาก Schedules
    const schedSheet = ss.getSheetByName('Schedules');
    if (schedSheet) {
      const data = schedSheet.getDataRange().getValues();
      const headers = data.shift();
      const pidIdx = headers.indexOf('PatientID');
      const dateIdx = headers.indexOf('ScheduledDate');
      data.forEach(row => {
        if (String(row[pidIdx]).trim() === patientIdStr && row[dateIdx] instanceof Date) {
          allDatesSet.add(Utilities.formatDate(row[dateIdx], "GMT+7", "yyyy-MM-dd"));
        }
      });
    }

    // จากการเยี่ยมจริง (OPD/SOAP)
    const actualVisitDates = new Set();
    ['OPDRecords', 'SOAPNotes'].forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      const data = sh.getDataRange().getValues();
      const h = data.shift();
      const pidIdx = h.indexOf('PatientID');
      let dateIdx = h.indexOf('VisitDate');
      if (dateIdx === -1) dateIdx = h.indexOf('Date');
      data.forEach(row => {
        if (String(row[pidIdx]).trim() === patientIdStr && row[dateIdx] instanceof Date) {
          const dStr = Utilities.formatDate(row[dateIdx], "GMT+7", "yyyy-MM-dd");
          allDatesSet.add(dStr);
          actualVisitDates.add(dStr);
        }
      });
    });

    // 3. ดึงประวัติ BI ทั้งหมดมาทำ Map {วันที่: ข้อมูลBI}
    const biSheet = ss.getSheetByName('BIAssessments');
    const biMap = {};
    if (biSheet) {
      const data = biSheet.getDataRange().getValues();
      const headers = data.shift();
      const pidIdx = headers.indexOf('PatientID');
      const dateIdx = headers.indexOf('AssessmentDate');
      const scoreIdx = headers.indexOf('TotalScore');
      data.forEach(row => {
        if (String(row[pidIdx]).trim() === patientIdStr && row[dateIdx] instanceof Date) {
          const dStr = Utilities.formatDate(row[dateIdx], "GMT+7", "yyyy-MM-dd");
          let biObj = {};
          headers.forEach((h, i) => biObj[h] = row[i]);
          biMap[dStr] = {
            score: row[scoreIdx],
            impairment: getCombinedImpairmentText(biObj)
          };
        }
      });
    }

    // 4. เรียงลำดับวันที่และคำนวณคะแนนแบบต่อเนื่อง (Chaining Logic)
    const sortedDates = Array.from(allDatesSet).sort();
    const todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    
    let lastKnownScore = patient.InitialBI || 0; // จุดเริ่มต้นคือ BI แรกรับ
    let lastKnownImpairment = "-";

    const result = sortedDates.map((dStr, index) => {
      const isVisited = actualVisitDates.has(dStr);
      const hasBI = biMap[dStr];

      // BI ก่อน: คือคะแนนที่สรุปมาจากครั้งที่แล้ว
      const biBefore = lastKnownScore;

      // BI หลัง: ถ้ามีการประเมินในวันนั้น ให้โชว์คะแนนใหม่ ถ้าไม่มีให้ว่างไว้
      let biAfter = "";
      let currentImpairment = lastKnownImpairment;

      if (hasBI) {
        biAfter = hasBI.score;
        currentImpairment = hasBI.impairment;
        
        // อัปเดตคะแนนล่าสุด เพื่อส่งต่อไปให้ "BI ก่อน" ของบรรทัดถัดไป
        lastKnownScore = hasBI.score;
        lastKnownImpairment = hasBI.impairment;
      }

      return {
        visitNumber: index + 1, // รันลำดับใหม่ 1, 2, 3... ตามวันที่จริง
        date: dStr,
        multipleImpairment: currentImpairment,
        biBefore: biBefore,
        biAfter: biAfter,
        status: isVisited ? 'Completed' : (dStr < todayStr ? 'Overdue' : 'Pending')
      };
    });

    return { status: 'success', records: result };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}
function reverseGeocodeServer(lat, lng) {
  try {
    const response = Maps.newGeocoder().reverseGeocode(lat, lng);
    if (response && response.results && response.results.length > 0) {
      const result = response.results[0];
      let addressStr = '';
      if (result.address_components) {
        let subdistrict = '';
        let district = '';
        let province = '';
        let neighborhood = '';
        
        for (let i = 0; i < result.address_components.length; i++) {
          const comp = result.address_components[i];
          const types = comp.types;
          if (types.includes('sublocality_level_1') || types.includes('sublocality') || types.includes('administrative_area_level_4')) {
            subdistrict = comp.long_name;
          } else if (types.includes('administrative_area_level_3') || types.includes('locality')) {
            district = comp.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            province = comp.long_name;
          } else if (types.includes('neighborhood') || types.includes('route')) {
            neighborhood = comp.long_name;
          }
        }
        
        let parts = [];
        if (neighborhood) parts.push(neighborhood);
        if (subdistrict) {
          if (!subdistrict.startsWith('ตำบล') && !subdistrict.startsWith('ต.')) {
            parts.push('ตำบล ' + subdistrict);
          } else {
            parts.push(subdistrict);
          }
        }
        if (district) {
          if (!district.startsWith('อำเภอ') && !district.startsWith('อ.')) {
            parts.push('อำเภอ ' + district);
          } else {
            parts.push(district);
          }
        }
        if (province) {
          if (province.startsWith('จังหวัด')) {
            parts.push(province.replace('จังหวัด', '').trim());
          } else {
            parts.push(province);
          }
        }
        addressStr = parts.join(' ');
      }
      
      if (!addressStr) {
        addressStr = result.formatted_address;
      }
      return addressStr;
    }
  } catch (e) {
    Logger.log("Geocoding error: " + e.toString());
  }
  return "";
}

// =================================================================
// [เพิ่มใหม่] BACKFILL: เติมเลขที่ใบประกอบวิชาชีพย้อนหลังให้ข้อมูลเก่า
// =================================================================
/**
 * ฟังก์ชันสำหรับรัน "ครั้งเดียว" เพื่อ:
 * 1. สร้างคอลัมน์ AssignedPTLicense ในชีต Patients (ถ้ายังไม่มี)
 * 2. สร้างคอลัมน์ TherapistLicenseNo ในชีต OPDRecords และ SOAPNotes (ถ้ายังไม่มี)
 * 3. เทียบชื่อนักกายภาพในแต่ละแถวกับชีต Dropdowns แล้วเติมเลขที่ใบประกอบให้
 *    (เติมเฉพาะแถวที่ช่องเลขใบประกอบยังว่างอยู่ จะไม่ทับข้อมูลที่มีอยู่แล้ว)
 *
 * วิธีใช้: เปิด Apps Script Editor -> เลือกฟังก์ชัน backfillTherapistLicenseNumbers
 * จาก dropdown ด้านบน -> กด Run (รันครั้งเดียวพอ รันซ้ำได้ไม่มีผลเสีย)
 */
function backfillTherapistLicenseNumbers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const dropdownSheet = ss.getSheetByName('Dropdowns');
  if (!dropdownSheet) {
    Logger.log('ไม่พบชีต Dropdowns');
    return;
  }

  // 1. สร้าง Map ชื่อนักกายภาพ -> เลขที่ใบประกอบ จากชีต Dropdowns (คอลัมน์ B:C)
  const licenseMap = {};
  const lastDropdownRow = dropdownSheet.getLastRow();
  if (lastDropdownRow > 1) {
    dropdownSheet.getRange(2, 2, lastDropdownRow - 1, 2).getValues().forEach(row => {
      const name = String(row[0] || '').trim();
      const license = String(row[1] || '').trim();
      if (name) licenseMap[name] = license;
    });
  }

  // 2. รายชื่อชีตที่ต้องเติมย้อนหลัง
  const targets = [
    { sheetName: 'Patients',   nameCol: 'AssignedPT',    licenseCol: 'AssignedPTLicense' },
    { sheetName: 'OPDRecords', nameCol: 'TherapistName', licenseCol: 'TherapistLicenseNo' },
    { sheetName: 'SOAPNotes',  nameCol: 'TherapistName', licenseCol: 'TherapistLicenseNo' }
  ];

  const summary = [];

  targets.forEach(target => {
    const sheet = ss.getSheetByName(target.sheetName);
    if (!sheet) {
      summary.push(`${target.sheetName}: ไม่พบชีตนี้`);
      return;
    }

    // สร้างคอลัมน์ licenseCol ถ้ายังไม่มี (ใช้ฟังก์ชัน ensureSheetColumns ที่มีอยู่แล้วในไฟล์นี้)
    const headers = ensureSheetColumns(sheet, [target.licenseCol]);
    const nameColIndex = headers.indexOf(target.nameCol);
    const licenseColIndex = headers.indexOf(target.licenseCol);

    if (nameColIndex === -1) {
      summary.push(`${target.sheetName}: ไม่พบคอลัมน์ ${target.nameCol} (ข้ามชีตนี้)`);
      return;
    }

    const lastDataRow = sheet.getLastRow();
    if (lastDataRow < 2) {
      summary.push(`${target.sheetName}: ไม่มีข้อมูลแถว`);
      return;
    }

    const data = sheet.getRange(2, 1, lastDataRow - 1, headers.length).getValues();
    let filledCount = 0;

    data.forEach((row, i) => {
      const currentLicense = String(row[licenseColIndex] || '').trim();
      if (currentLicense) return; // มีข้อมูลอยู่แล้ว ไม่ทับ

      const therapistName = String(row[nameColIndex] || '').trim();
      if (!therapistName) return;

      const license = licenseMap[therapistName];
      if (license) {
        sheet.getRange(i + 2, licenseColIndex + 1).setValue(license);
        filledCount++;
      }
    });

    summary.push(`${target.sheetName}: เติมเลขที่ใบประกอบย้อนหลังสำเร็จ ${filledCount} แถว`);
  });

  Logger.log(summary.join('\n'));
  return summary;
}

/**
 * [ฟังก์ชันสำหรับทดสอบ/debug ชั่วคราว] เรียกทดสอบ generateIMCCoverPdf
 * กับผู้ป่วย ID ที่ระบุ พร้อม log ข้อมูลตรวจสอบให้ครบทุกจุดที่น่าจะมีปัญหา
 *
 * วิธีใช้: วางฟังก์ชันนี้ไว้ท้ายไฟล์ Code.gs -> เลือกฟังก์ชัน debugTestIMCCover
 * จาก dropdown บน Apps Script Editor -> กด Run -> ดูผลที่ Execution log
 */
function debugTestIMCCover() {
  const patientId = 'PT1757951625944';

  // 1. ดึงข้อมูลผู้ป่วยตรงๆ แบบเดียวกับที่ generateIMCCoverPdf ใช้จริง
  const patient = getPatientById(patientId);
  if (!patient) {
    Logger.log('❌ ไม่พบผู้ป่วย ID: ' + patientId);
    return;
  }

  Logger.log('=== 1) ค่าที่ได้จาก getPatientById() ===');
  Logger.log('AssignedPT: [' + patient.AssignedPT + ']');
  Logger.log('AssignedPTLicense: [' + patient.AssignedPTLicense + ']');

  // 2. เช็คชื่อคอลัมน์จริงในชีต Patients (เผื่อมีช่องว่าง/ตัวสะกดไม่ตรงกับที่โค้ดคาดหวัง)
  const headers = patientSheet.getRange(1, 1, 1, patientSheet.getLastColumn()).getValues()[0];
  Logger.log('=== 2) คอลัมน์ที่เกี่ยวข้องในชีต Patients (โชว์วงเล็บ [] เพื่อดูช่องว่างซ่อน) ===');
  headers.forEach((h, i) => {
    const name = String(h);
    if (name.toLowerCase().includes('assign') || name.toLowerCase().includes('license')) {
      Logger.log(`คอลัมน์ #${i + 1}: [${name}]  (ความยาว=${name.length} ตัวอักษร)`);
    }
  });

  // 3. เรียก generateIMCCoverPdf จริง แล้วดูผลลัพธ์
  Logger.log('=== 3) ผลการสร้าง PDF จริง ===');
  const result = generateIMCCoverPdf(patientId);
  Logger.log('Status: ' + result.status);
  if (result.status === 'error') {
    Logger.log('❌ Message: ' + result.message);
  } else {
    Logger.log('✅ สร้างสำเร็จ: ' + result.fileName);
    Logger.log('(ไฟล์ PDF ถูกสร้างชั่วคราวใน Drive แล้วลบทิ้งแล้ว ตามโค้ดเดิมของระบบ ดังนั้นดู log ค่าจากข้อ 1-2 เป็นหลัก)');
  }
}
