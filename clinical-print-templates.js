/**
 * ============================================================================
 * IMC Plus - Standalone Clinical Print Templates Module (100% Template Format)
 * ============================================================================
 * Generates exact 100% template-accurate A4 printable layouts for all 8 documents:
 *  1. IMC Cover (ปกเวชระเบียนกายภาพบำบัดผู้ป่วยใน IMC)
 *  2. Consent (ใบยินยอมรับการรักษาทางกายภาพบำบัด)
 *  3. BI Assessment (แบบประเมินดัชนีบาร์เธล ADL)
 *  4. OPD Card (แบบบันทึกการตรวจประเมินทางกายภาพบำบัด)
 *  5. SOAP Note (แบบบันทึกความก้าวหน้าการรักษา)
 *  6. TMSE (แบบทดสอบสมรรถภาพสมองไทย 30 คะแนน)
 *  7. MHQ (แบบคัดกรองสุขภาพจิต 2Q, 9Q, 8Q)
 *  8. Dysphagia (แบบคัดกรองและประเมินภาวะกลืนลำบาก)
 * ============================================================================
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helper Formatting Functions
  // ---------------------------------------------------------------------------

  function _val(v, fallback = '-') {
    if (v === null || v === undefined) return fallback;
    const str = String(v).trim();
    return str !== '' ? str : fallback;
  }

  function _thaiDate(d) {
    if (!d) return '-';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      const day = date.getDate();
      const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear() + 543;
      return `${day} ${month} ${year}`;
    } catch (_) {
      return String(d);
    }
  }

  function _thaiDateShort(d) {
    if (!d) return '-';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear() + 543;
      return `${day}/${month}/${year}`;
    } catch (_) {
      return String(d);
    }
  }

  function _calculateAge(dob) {
    if (!dob) return '';
    try {
      const birth = new Date(dob);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      return age >= 0 ? age : '';
    } catch (_) {
      return '';
    }
  }

  function _formatTime(v) {
    if (!v) return '';
    const str = String(v).trim();
    if (str.includes('T')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
    const match = str.match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : str;
  }

  function _chk(cond) {
    return (cond === true || cond === 'true' || cond === 'TRUE' || cond === 1 || cond === '1' || cond === '☑' || cond === 'YES')
      ? '<span class="chk-box checked">☑</span>'
      : '<span class="chk-box">☐</span>';
  }

  function _parseObj(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return {}; }
  }

  function _parseArr(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      return String(v).split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  function _getTherapistLicense() {
    try {
      const raw = localStorage.getItem('skpt_logged_in_user');
      if (raw) {
        const u = JSON.parse(raw);
        return u?.license || '';
      }
    } catch (_) {}
    return '';
  }

  // ---------------------------------------------------------------------------
  // Master Print Stylesheet (Crisp A4, Sarabun font, Medical form rules)
  // ---------------------------------------------------------------------------

  const PRINT_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Sarabun', 'TH Sarabun New', Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: #111;
      background: #525659;
      margin: 0;
      padding: 20px 0;
      -webkit-font-smoothing: antialiased;
    }

    .top-toolbar {
      position: sticky;
      top: 0;
      z-index: 9999;
      background: #1e293b;
      color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 24px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .top-toolbar .title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .top-toolbar .btn {
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 16px;
      border-radius: 6px;
      border: none;
      transition: all 0.2s;
    }
    .top-toolbar .btn-print {
      background: #0284c7;
      color: #fff;
      margin-right: 10px;
    }
    .top-toolbar .btn-print:hover {
      background: #0369a1;
    }
    .top-toolbar .btn-close {
      background: #475569;
      color: #fff;
    }
    .top-toolbar .btn-close:hover {
      background: #334155;
    }

    .sheet {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 25px auto;
      padding: 14mm 16mm 14mm 16mm;
      box-shadow: 0 4px 18px rgba(0,0,0,0.3);
      position: relative;
    }

    .header-block {
      text-align: center;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .clinic-name {
      font-size: 16px;
      font-weight: 700;
      color: #0f766e;
      letter-spacing: 0.5px;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .doc-subtitle {
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
    }

    .section-title {
      font-size: 13px;
      font-weight: 700;
      background: #f1f5f9;
      border-left: 4px solid #0d9488;
      padding: 3px 8px;
      margin: 8px 0 6px 0;
      color: #0f172a;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
      margin-bottom: 5px;
    }
    .field {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
    }
    .label {
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
    }
    .val {
      color: #000;
      border-bottom: 1px dotted #64748b;
      min-width: 60px;
      padding: 0 4px;
      font-weight: 500;
    }
    .val.long { min-width: 220px; }
    .val.full { width: 100%; border-bottom: 1px dotted #64748b; display: block; }
    .val.bold { font-weight: 700; }

    .chk-box {
      font-size: 14px;
      font-weight: bold;
      display: inline-block;
      min-width: 16px;
      color: #334155;
      vertical-align: middle;
    }
    .chk-box.checked {
      color: #0f766e;
    }
    .chk-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-right: 12px;
      margin-bottom: 3px;
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 8px 0;
      font-size: 12px;
    }
    table.report-table th, table.report-table td {
      border: 1px solid #94a3b8;
      padding: 3px 6px;
      vertical-align: middle;
    }
    table.report-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: center;
    }
    table.report-table td.center { text-align: center; }
    table.report-table td.right { text-align: right; }
    table.report-table tr.total-row {
      background: #f8fafc;
      font-weight: 700;
    }

    .summary-card {
      border: 1.5px solid #0f766e;
      border-radius: 6px;
      padding: 8px 12px;
      background: #f0fdfa;
      margin: 8px 0;
    }

    .signatures-block {
      display: flex;
      justify-content: space-around;
      margin-top: 20px;
      page-break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      min-width: 180px;
    }
    .sig-img {
      height: 42px;
      max-width: 170px;
      object-fit: contain;
      display: block;
      margin: 0 auto 2px auto;
    }
    .sig-placeholder {
      height: 42px;
    }
    .sig-line {
      border-bottom: 1px solid #475569;
      margin: 0 auto 4px auto;
      width: 170px;
    }
    .sig-name {
      font-size: 12px;
      font-weight: 600;
    }
    .sig-role {
      font-size: 11px;
      color: #475569;
    }

    .patient-photo-box {
      width: 110px;
      height: 135px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-left: auto;
    }
    .patient-photo-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 2px;
    }

    .bodychart-box {
      text-align: center;
      margin: 8px 0;
    }
    .bodychart-box img {
      max-width: 260px;
      height: auto;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #fff;
    }

    @media print {
      body {
        background: #fff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .top-toolbar {
        display: none !important;
      }
      .sheet {
        box-shadow: none !important;
        margin: 0 !important;
        width: 100% !important;
        min-height: auto !important;
        padding: 8mm 10mm !important;
        page-break-after: always;
      }
      @page {
        size: A4 portrait;
        margin: 8mm 8mm 8mm 8mm;
      }
    }
  `;

  // ---------------------------------------------------------------------------
  // 1. IMC Cover (ปกเวชระเบียน IMC)
  // ---------------------------------------------------------------------------

  function buildIMCCoverHtml(p) {
    const pPhoto = p.PatientPhotoURL || p.PatientPhotoUrl || p.PatientPhoto || '';
    const dx = p.IMCDx || '';
    const strokeType = p.StrokeType || '';

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>ปกเวชระเบียน IMC - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์ปกเวชระเบียนกายภาพบำบัดผู้ป่วยใน (IMC Cover)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">ปกเวชระเบียนกายภาพบำบัดผู้ป่วยใน (IMC)</div>
      <div class="doc-subtitle">Intermediate Care Inpatient Record Cover Sheet</div>
    </div>

    <div style="display: flex; gap: 16px; margin-bottom: 10px;">
      <div style="flex: 1;">
        <div class="section-title">ข้อมูลทั่วไปของผู้ป่วย (Patient Identification)</div>
        <div class="row">
          <div class="field"><span class="label">เลขที่คลินิก (CN):</span><span class="val bold">${_val(p.ClinicNumber)}</span></div>
          <div class="field"><span class="label">HN:</span><span class="val bold">${_val(p.HN)}</span></div>
          <div class="field"><span class="label">Zone:</span><span class="val">${_val(p.Zone)}</span></div>
        </div>
        <div class="row">
          <div class="field" style="width: 100%;"><span class="label">ชื่อ-นามสกุล:</span><span class="val long bold" style="font-size: 15px;">${_val(p.PatientName)}</span></div>
        </div>
        <div class="row">
          <div class="field"><span class="label">เลขประจำตัวประชาชน:</span><span class="val">${_val(p.NationalID)}</span></div>
        </div>
        <div class="row">
          <div class="field"><span class="label">วัน/เดือน/ปีเกิด:</span><span class="val">${_thaiDateShort(p.DateOfBirth)}</span></div>
          <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || _calculateAge(p.DateOfBirth))} ปี</span></div>
          <div class="field"><span class="label">เพศ:</span><span class="val">${_val(p.Gender)}</span></div>
          <div class="field"><span class="label">สัญชาติ:</span><span class="val">${_val(p.Nationality, 'ไทย')}</span></div>
        </div>
        <div class="row">
          <div class="field" style="width: 100%;"><span class="label">ที่อยู่:</span><span class="val long" style="flex: 1;">${_val(p.FullAddress || p.Address)}</span></div>
        </div>
        <div class="row">
          <div class="field"><span class="label">โทรศัพท์:</span><span class="val">${_val(p.Phone || p.Telephone)}</span></div>
          <div class="field"><span class="label">สิทธิการรักษา:</span><span class="val">${_val(p.TreatmentRightsDisplay || p.TreatmentRights)}</span></div>
        </div>
      </div>

      <div style="width: 120px; flex-shrink: 0; text-align: center;">
        <div class="patient-photo-box">
          ${pPhoto ? `<img src="${pPhoto}" alt="รูปถ่ายผู้ป่วย">` : '<span style="color:#94a3b8;font-size:11px;">รูปถ่ายผู้ป่วย</span>'}
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 4px;">ภาพถ่ายผู้ป่วย</div>
      </div>
    </div>

    <div class="section-title">ข้อมูลผู้ดูแล / ผู้ติดต่อฉุกเฉิน (Caregiver Information)</div>
    <div class="row">
      <div class="field"><span class="label">ชื่อผู้ดูแล:</span><span class="val long">${_val(p.CaregiverName)}</span></div>
      <div class="field"><span class="label">ความสัมพันธ์:</span><span class="val">${_val(p.CaregiverRelationship || p['Caregiver Relationship'])}</span></div>
      <div class="field"><span class="label">เบอร์โทรศัพท์:</span><span class="val">${_val(p.CaregiverPhone)}</span></div>
    </div>

    <div class="section-title">การวินิจฉัยโรคตามกลุ่มเป้าหมาย (IMC Diagnosis)</div>
    <div style="padding: 6px 10px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 8px;">
      <div class="row" style="margin-bottom: 4px;">
        <span class="chk-item">${_chk(dx === 'Stroke')} <strong>Stroke (โรคหลอดเลือดสมอง)</strong></span>
        <span style="margin-left: 15px;">
          ${_chk(dx === 'Stroke' && strokeType === 'Ischemic')} Ischemic (สมองขาดเลือด) &nbsp;&nbsp;&nbsp;
          ${_chk(dx === 'Stroke' && strokeType === 'Hemorrhage')} Hemorrhagic (เลือดออกในสมอง)
        </span>
      </div>
      <div class="row" style="margin-top: 6px;">
        <span class="chk-item">${_chk(dx === 'TBI')} <strong>TBI</strong> (Traumatic Brain Injury : บาดเจ็บทางสมอง)</span>
        <span class="chk-item" style="margin-left: 15px;">${_chk(dx === 'Fx.HIP' || dx === 'FxHIP')} <strong>Fx.Around HIP</strong> (กระดูกสะโพกหัก)</span>
        <span class="chk-item" style="margin-left: 15px;">${_chk(dx === 'SCI')} <strong>SCI</strong> (Spinal Cord Injury : บาดเจ็บไขสันหลัง)</span>
      </div>
    </div>

    <div class="section-title">ข้อมูลการรับบริการและการนัดหมาย (Service & Schedule)</div>
    <div class="row">
      <div class="field"><span class="label">วันที่เริ่มรับบริการ (Admit Date):</span><span class="val bold">${_thaiDate(p.AdmitDate)}</span></div>
      <div class="field"><span class="label">วันที่ครบกำหนดแผน (Due Date):</span><span class="val bold">${_thaiDate(p.DueDate)}</span></div>
      <div class="field"><span class="label">วันที่จำหน่าย (Discharge Date):</span><span class="val bold">${_thaiDate(p.DischargeDate)}</span></div>
    </div>
    <div class="row" style="margin-top: 4px;">
      <div class="field"><span class="label">จำนวนครั้งการเยี่ยมตามแผน:</span><span class="val bold">${_val(p.VisitCount)}</span> ครั้ง</div>
      <div class="field"><span class="label">ประเภทผู้ป่วย:</span><span class="val">${_val(p.PatientType, 'IMC Patient')}</span></div>
    </div>

    <div class="summary-card" style="margin-top: 14px;">
      <div style="font-weight: 700; color: #0f766e; margin-bottom: 2px;">เป้าหมายและแผนการฟื้นฟูเบื้องต้น (Initial IMC Plan)</div>
      <div style="font-size: 12px; color: #334155;">
        ดำเนินการฟื้นฟูสมรรถภาพทางการแพทย์ระยะกลาง (Intermediate Care) ต่อเนื่องตามมาตรฐานสหวิชาชีพ เพื่อเพิ่มระดับความสามารถในการดำเนินกิจวัตรประจำวัน (Barthel Index) และส่งเสริมการฟื้นฟูสู่ชุมชน
      </div>
    </div>

    <div class="signatures-block" style="margin-top: 35px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">${_val(p.CaregiverName || p.PatientName)}</div>
        <div class="sig-role">ผู้ป่วย / ผู้ดูแล</div>
      </div>
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">นักกายภาพบำบัดผู้รับผิดชอบ</div>
        <div class="sig-role">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 10mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>เอกสารเวชระเบียนคลินิกกายภาพบำบัดสุขกาย IMC Plus</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 2. Consent (ใบยินยอมรับการรักษาทางกายภาพบำบัด)
  // ---------------------------------------------------------------------------

  function buildConsentHtml(p, c) {
    const isPatient = (c.ConsenterType === 'Patient' || c.ConsenterType === 'ผู้ป่วย');
    const consenterSig = c.ConsenterSignatureUrl || c.ConsenterSignature || '';
    const witnessSig = c.WitnessSignatureUrl || c.WitnessSignature || '';

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>ใบยินยอมรับการรักษา - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์ใบยินยอมรับการรักษาทางกายภาพบำบัด (Informed Consent Form)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">ใบยินยอมรับการตรวจและรักษาทางกายภาพบำบัด</div>
      <div class="doc-subtitle">Informed Consent for Physical Therapy Treatment</div>
    </div>

    <div class="row" style="justify-content: flex-end; margin-bottom: 8px;">
      <div class="field"><span class="label">วันที่ทำหนังสือ:</span><span class="val bold">${_thaiDate(c.ConsentDate || c.Timestamp)}</span></div>
    </div>

    <div class="section-title">ข้อมูลผู้ป่วย (Patient Information)</div>
    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">เลขที่คลินิก (CN):</span><span class="val bold">${_val(p.ClinicNumber)}</span></div>
      <div class="field"><span class="label">HN:</span><span class="val">${_val(p.HN)}</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || _calculateAge(p.DateOfBirth))} ปี</span></div>
      <div class="field"><span class="label">การวินิจฉัยโรค (Dx):</span><span class="val long">${_val(p.IMCDx || c.Diagnosis)}</span></div>
      <div class="field"><span class="label">ครั้งที่:</span><span class="val">${_val(c.VisitCount, '1')}</span></div>
    </div>

    <div class="section-title">ข้อมูลผู้ให้คำยินยอม (Consenter Information)</div>
    <div class="row" style="margin-bottom: 6px;">
      <span class="chk-item">${_chk(isPatient)} <strong>ข้าพเจ้าเป็นผู้ป่วยเอง</strong></span>
      <span class="chk-item">${_chk(!isPatient)} <strong>ข้าพเจ้าเป็นผู้แทนโดยชอบธรรม / ผู้ดูแลผู้ป่วย</strong></span>
    </div>
    <div class="row">
      <div class="field"><span class="label">ชื่อ-นามสกุล (ผู้ให้คำยินยอม):</span><span class="val long bold">${_val(c.ConsenterName || p.PatientName)}</span></div>
      <div class="field"><span class="label">อายุ:</span><span class="val">${_val(c.ConsenterAge || p.Age)} ปี</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">เลขประจำตัวประชาชน:</span><span class="val">${_val(c.ConsenterNationalID || p.NationalID)}</span></div>
      <div class="field"><span class="label">ความเกี่ยวข้องกับผู้ป่วย:</span><span class="val">${_val(c.ConsenterRelationship, isPatient ? 'ตนเอง' : 'ผู้ดูแล')}</span></div>
    </div>
    <div class="row">
      <div class="field" style="width: 100%;"><span class="label">ที่อยู่ปัจจุบัน:</span><span class="val long" style="flex: 1;">${_val(c.Address || p.FullAddress)}</span></div>
    </div>

    <div class="section-title">ข้อความแสดงความยินยอม (Informed Consent Declarations)</div>
    <div style="font-size: 13px; line-height: 1.7; text-align: justify; padding: 4px 6px; color: #1e293b;">
      <p style="margin-bottom: 8px; text-indent: 24px;">
        ข้าพเจ้าได้รับการชี้แจงและอธิบายจากนักกายภาพบำบัดวิชาชีพ เกี่ยวกับการตรวจประเมินทางกายภาพบำบัด สภาพปัญหา วินิจฉัยทางกายภาพบำบัด เป้าหมายและขั้นตอนวิธีการรักษาทางกายภาพบำบัด ประโยชน์ที่คาดว่าจะได้รับ ข้อจำกัด ตลอดจนความเสี่ยงหรือภาวะไม่พึงประสงค์ที่อาจเกิดขึ้นจากการรักษา เช่น อาการปวดเมื่อยกล้ามเนื้อ รอยฟกช้ำ ความเมื่อยล้า หรือการเปลี่ยนแปลงของสัญญาณชีพ เป็นต้น
      </p>
      <p style="margin-bottom: 8px; text-indent: 24px;">
        ข้าพเจ้าได้มีโอกาสซักถามข้อสงสัย และได้รับคำตอบและคำอธิบายจนเป็นที่เข้าใจอย่างแจ่มแจ้ง ชัดเจน ข้าพเจ้าเข้าใจดีว่าสามารถสอบถามหรือแจ้งความประสงค์ขอหยุดการรักษาได้ตลอดเวลาหากเกิดความไม่สุขสบาย
      </p>
      <p style="margin-bottom: 8px; text-indent: 24px;">
        ดังนั้น ข้าพเจ้าจึงลงลายมือชื่อไว้เป็นหลักฐานเพื่อแสดงความยินยอม ให้นักกายภาพบำบัดดำเนินการตรวจประเมินและให้การบำบัดรักษาฟื้นฟูสมรรถภาพทางกายภาพบำบัดตามแผนการรักษาต่อไป
      </p>
    </div>

    ${c.Notes ? `
    <div class="section-title">บันทึกเพิ่มเติม / เงื่อนไขเฉพาะ (Notes)</div>
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 12px; background: #fafafa; min-height: 38px;">
      ${_val(c.Notes)}
    </div>` : ''}

    <div class="signatures-block" style="margin-top: 36px;">
      <div class="sig-box">
        ${consenterSig ? `<img class="sig-img" src="${consenterSig}" alt="ลายมือชื่อผู้ให้ความยินยอม">` : '<div class="sig-placeholder"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(c.ConsenterName || p.PatientName)})</div>
        <div class="sig-role">ผู้ให้ความยินยอม (ผู้ป่วย/ผู้แทน)</div>
      </div>

      <div class="sig-box">
        ${witnessSig ? `<img class="sig-img" src="${witnessSig}" alt="ลายมือชื่อพยาน">` : '<div class="sig-placeholder"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(c.WitnessName, '..................................................')})</div>
        <div class="sig-role">พยาน</div>
      </div>

      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(c.TherapistName, 'นักกายภาพบำบัดผู้ให้ข้อมูล')})</div>
        <div class="sig-role">นักกายภาพบำบัดผู้ให้ข้อมูล</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 10mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัดสุขกาย IMC Plus - แบบฟอร์มยินยอมมาตรฐาน</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 3. BI Assessment (แบบประเมิน Barthel Index ADL)
  // ---------------------------------------------------------------------------

  function buildBIAssessmentHtml(p, a, license) {
    const biQuestions = [
      {
        num: '1', name: 'การรับประทานอาหารเมื่อเตรียมสำรับไว้เรียบร้อย (Feeding)', key: 'q1',
        opts: [
          { score: 0, text: 'ไม่สามารถตักอาหารเข้าปากได้ ต้องป้อน' },
          { score: 5, text: 'ตักอาหารเองได้ แต่ต้องมีคนช่วยเตรียม/หั่น' },
          { score: 10, text: 'รับประทานและตักอาหารเองได้ตามปกติ' }
        ]
      },
      {
        num: '2', name: 'การล้างหน้า หวีผม แปรงฟัน โกนหนวด (Grooming)', key: 'q2',
        opts: [
          { score: 0, text: 'ต้องการความช่วยเหลือทั้งหมด' },
          { score: 5, text: 'ทำได้เอง (รวมทั้งถ้าเตรียมอุปกรณ์ไว้ให้)' }
        ]
      },
      {
        num: '3', name: 'การลุกนั่งจากที่นอน หรือย้ายจากเตียงไปเก้าอี้ (Transfer)', key: 'q3',
        opts: [
          { score: 0, text: 'ไม่สามารถนั่งได้ หรือต้องใช้คน 2 คนช่วยยก' },
          { score: 5, text: 'ต้องใช้คนแข็งแรง 1 คน หรือคนทั่วไป 2 คนช่วยพยุง' },
          { score: 10, text: 'ต้องการความช่วยเหลือเล็กน้อย / มีคนดูแลความปลอดภัย' },
          { score: 15, text: 'ทำได้เองอย่างปลอดภัย' }
        ]
      },
      {
        num: '4', name: 'การใช้ห้องน้ำและขับถ่าย (Toilet Use)', key: 'q4',
        opts: [
          { score: 0, text: 'ช่วยเหลือตัวเองไม่ได้เลย' },
          { score: 5, text: 'ทำเองได้บ้าง ต้องการความช่วยเหลือในบางขั้นตอน' },
          { score: 10, text: 'ช่วยเหลือตัวเองได้ดีทุกขั้นตอน (ทำความสะอาดได้เอง)' }
        ]
      },
      {
        num: '5', name: 'การเคลื่อนที่ภายในห้องหรือบ้าน (Mobility)', key: 'q5',
        opts: [
          { score: 0, text: 'เคลื่อนที่ไม่ได้ ติดเตียง' },
          { score: 5, text: 'ใช้รถเข็น Wheelchair ได้เอง เข้าออกประตูได้' },
          { score: 10, text: 'เดินได้โดยมีคนช่วยพยุง 1 คน' },
          { score: 15, text: 'เดินได้เอง (อาจใช้เครื่องช่วยเดินได้)' }
        ]
      },
      {
        num: '6', name: 'การสวมใส่เสื้อผ้า (Dressing)', key: 'q6',
        opts: [
          { score: 0, text: 'ต้องมีคนสวมใส่ให้ ช่วยตัวเองแทบไม่ได้' },
          { score: 5, text: 'ช่วยตัวเองได้ประมาณร้อยละ 50 ที่เหลือมีคนช่วย' },
          { score: 10, text: 'สวมใส่เสื้อผ้า ติดกระดุม รูดซิป ได้เองทั้งหมด' }
        ]
      },
      {
        num: '7', name: 'การขึ้นลงบันได 1 ชั้น (Stair Climbing)', key: 'q7',
        opts: [
          { score: 0, text: 'ไม่สามารถทำได้' },
          { score: 5, text: 'ต้องการคนช่วยพยุง' },
          { score: 10, text: 'ขึ้นลงบันไดได้เอง (จับราวมือได้)' }
        ]
      },
      {
        num: '8', name: 'การอาบน้ำ (Bathing)', key: 'q8',
        opts: [
          { score: 0, text: 'ต้องมีคนช่วยอาบน้ำให้' },
          { score: 5, text: 'อาบน้ำได้เองทั้งหมด' }
        ]
      },
      {
        num: '9', name: 'การกลั้นอุจจาระใน 1 สัปดาห์ที่ผ่านมา (Bowel Control)', key: 'q9',
        opts: [
          { score: 0, text: 'กลั้นไม่ได้ หรือต้องการสวนอุจจาระเสมอ' },
          { score: 5, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกิน 1 ครั้ง/สัปดาห์)' },
          { score: 10, text: 'กลั้นได้เป็นปกติต่อเนื่อง' }
        ]
      },
      {
        num: '10', name: 'การกลั้นปัสสาวะใน 1 สัปดาห์ที่ผ่านมา (Bladder Control)', key: 'q10',
        opts: [
          { score: 0, text: 'กลั้นไม่ได้ หรือใส่สายสวนปัสสาวะและดูแลไม่ได้' },
          { score: 5, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกินวันละ 1 ครั้ง)' },
          { score: 10, text: 'กลั้นได้เป็นปกติต่อเนื่อง' }
        ]
      }
    ];

    let rowsHtml = '';
    biQuestions.forEach(item => {
      const selectedScore = Number(a[item.key]);
      const optsHtml = item.opts.map(opt => {
        const isSel = (selectedScore === opt.score);
        return `<span class="chk-item" style="margin-right:8px;font-size:11.5px;">${_chk(isSel)} ${opt.text} <strong>(${opt.score})</strong></span>`;
      }).join(' ');

      rowsHtml += `
        <tr>
          <td style="width: 28%; font-weight: 600;">${item.num}. ${item.name}</td>
          <td style="width: 62%;"><div style="display:flex; flex-wrap:wrap; gap:2px 8px;">${optsHtml}</div></td>
          <td class="center bold" style="width: 10%; font-size: 13px; color:#0f766e;">${isNaN(selectedScore) ? '-' : selectedScore}</td>
        </tr>
      `;
    });

    const totalScore = Number(a.TotalScore !== undefined ? a.TotalScore : a.BarthelIndex);
    let levelDesc = 'พึ่งพาปานกลาง (Moderate Dependence)';
    if (totalScore >= 12 || totalScore >= 80) levelDesc = 'ช่วยเหลือตนเองได้ดี / พึ่งพาน้อย (Independent / Slight Dependence)';
    else if (totalScore <= 4 || totalScore <= 20) levelDesc = 'พึ่งพาโดยสมบูรณ์ (Total Dependence)';
    else if (totalScore <= 8 || totalScore <= 45) levelDesc = 'พึ่งพารุนแรง (Severe Dependence)';

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>แบบประเมิน BI - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์แบบประเมิน Barthel Activities of Daily Living (BI Assessment)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">แบบประเมินดัชนีบาร์เธลเอดีแอล (Barthel Index : ADL)</div>
      <div class="doc-subtitle">Activities of Daily Living Assessment Record</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">เลขที่คลินิก (CN):</span><span class="val bold">${_val(p.ClinicNumber)}</span></div>
      <div class="field"><span class="label">HN:</span><span class="val">${_val(p.HN)}</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val bold">${_thaiDate(a.AssessmentDate || a.VisitDate || a.Date)}</span></div>
      <div class="field"><span class="label">การประเมินครั้งที่:</span><span class="val bold">${_val(a.VisitCount, '1')}</span></div>
      <div class="field"><span class="label">นักกายภาพบำบัด:</span><span class="val">${_val(a.TherapistName)}</span></div>
      <div class="field"><span class="label">เลขใบประกอบฯ:</span><span class="val">${_val(license || a.TherapistLicenseNo)}</span></div>
    </div>

    <table class="report-table" style="margin-top: 8px;">
      <thead>
        <tr>
          <th>กิจกรรมที่ประเมิน</th>
          <th>ระดับความสามารถและเกณฑ์คะแนน</th>
          <th>คะแนนที่ได้</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row" style="background: #f0fdfa; border-top: 2px solid #0f766e;">
          <td colspan="2" class="right" style="font-size: 13px; font-weight: 700; color: #0f766e;">คะแนนรวมทั้งสิ้น (Total Barthel Index Score):</td>
          <td class="center" style="font-size: 16px; font-weight: 800; color: #0f766e;">${isNaN(totalScore) ? '-' : totalScore}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary-card" style="margin: 6px 0;">
      <div class="row" style="margin-bottom: 0;">
        <span class="label">ระดับการพึ่งพา (Level of Dependency):</span>
        <span class="val bold" style="color: #0f766e;">${levelDesc}</span>
      </div>
    </div>

    <div class="section-title">ความบกพร่องที่พบ (Multiple Impairments)</div>
    <div class="row" style="padding: 4px 6px;">
      <span class="chk-item">${_chk(a.impairment_swallowing)} 1. Swallowing (การกลืน)</span>
      <span class="chk-item">${_chk(a.impairment_communicate)} 2. Communicate (การสื่อสาร)</span>
      <span class="chk-item">${_chk(a.impairment_mobility)} 3. Mobility (การเคลื่อนไหว)</span>
      <span class="chk-item">${_chk(a.impairment_cognitive)} 4. Cognitive / Perception (การรู้คิด)</span>
      <span class="chk-item">${_chk(a.impairment_bowel)} 5. Bowel & Bladder (ระบบขับถ่าย)</span>
    </div>

    <div class="section-title">ข้อควรระวังสำหรับผู้ป่วย Fx. Around HIP (Precaution Activities)</div>
    <div class="row" style="padding: 4px 6px;">
      <span class="chk-item">${_chk(a.fx_bathroom)} เข้าห้องน้ำ</span>
      <span class="chk-item">${_chk(a.fx_bed)} ขึ้นลงจากเตียง</span>
      <span class="chk-item">${_chk(a.fx_movement)} เคลื่อนไหว ยืน นั่ง เดิน</span>
      <span class="chk-item">${_chk(a.fx_stairs)} ขึ้นลงบันได</span>
    </div>

    ${a.Notes ? `
    <div class="section-title">หมายเหตุและข้อสังเกตเพิ่มเติม (Clinical Remarks)</div>
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 12px; background: #fafafa;">
      ${_val(a.Notes)}
    </div>` : ''}

    <div class="signatures-block" style="margin-top: 24px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">${_val(p.PatientName)}</div>
        <div class="sig-role">ผู้ป่วย / ผู้ให้ข้อมูล</div>
      </div>
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(a.TherapistName, 'นักกายภาพบำบัดผู้ประเมิน')})</div>
        <div class="sig-role">นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license || a.TherapistLicenseNo)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัดสุขกาย IMC Plus - Barthel Index Form</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 4. OPD Card (แบบบันทึกการตรวจประเมินทางกายภาพบำบัดผู้ป่วยนอก)
  // ---------------------------------------------------------------------------

  function buildOPDCardHtml(p, r, license) {
    const diag = String(r.Diagnosis || '');
    const loc = String(r.LevelOfConsciousness || '');
    const comm = String(r.Communication || '');
    const aphasia = String(r.CommunicationAphasiaType || '');
    const equip = String(r.Equipment || '');
    const fxStatus = String(r.FxHIP_Status || '');
    const sa = String(r.SpecialAssessment || '');

    // Gross motor function
    const gm = _parseObj(r.GrossMotorFunction);
    const gmRows = [
      { key: 'MoveUp', name: 'Move Up' },
      { key: 'MoveDown', name: 'Move Down' },
      { key: 'MoveRight', name: 'Move Right' },
      { key: 'MoveLeft', name: 'Move Left' },
      { key: 'SubSideLying', name: 'Side Lying' },
      { key: 'SideLyingSit', name: 'Side Lying to Sit' },
      { key: 'SitStand', name: 'Sit to Stand' }
    ];
    const gmGrades = ['Independent', 'Continuous', 'Minimal', 'Moderate', 'Maximum', 'Dependent'];

    // Hand function
    const hf = _parseObj(r.HandFunction);
    const hfRows = [
      { key: 'Reaching', name: 'Reaching' },
      { key: 'GraspRelease', name: 'Grasp & Release' },
      { key: 'PassObj', name: 'Pass Object' },
      { key: 'ThumbOpp', name: 'Thumb Opposition' },
      { key: 'PinchGrasp', name: 'Pinch Grasp' }
    ];
    const hfGrades = ['Zero', 'Poor', 'Fair', 'Good', 'Normal'];

    // Balance
    const bal = _parseObj(r.BalanceGrid || r.Balance);
    const balRows = [
      { key: 'SitStatic', name: 'Sitting : Static' },
      { key: 'SitDynamic', name: 'Sitting : Dynamic' },
      { key: 'StandStatic', name: 'Standing : Static' },
      { key: 'StandDynamic', name: 'Standing : Dynamic' }
    ];

    // Treatment details
    const treat = _parseObj(r.Treatment_Details);
    const treatKeys = [
      { id: 'QualityMove', name: 'Quality move train' },
      { id: 'BedMobility', name: 'Bed mobility train' },
      { id: 'Balance', name: 'Balance train' },
      { id: 'Gait', name: 'Gait training' },
      { id: 'Other', name: 'Other treatment' }
    ];

    let treatRowsHtml = '';
    treatKeys.forEach(item => {
      const t = treat[item.id];
      if (t && Object.keys(t).length > 0) {
        const details = Array.isArray(t.details) ? t.details.join(', ') : (t.details || '-');
        treatRowsHtml += `
          <tr>
            <td style="font-weight:600;">☑ ${item.name}</td>
            <td class="center bold">${_val(t.time)} นาที</td>
            <td>${details}</td>
          </tr>
        `;
      }
    });

    const bodyChartImg = r.BodyChartDrawingBase64 || r.BodyChartDrawingUrl || r.BodyChartUrl || '';
    const therapistSig = r.TherapistSignatureBase64 || r.TherapistSignatureUrl || '';
    const patientSig = r.PatientSignatureBase64 || r.PatientSignatureUrl || '';

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>OPD Card - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์แบบบันทึกการตรวจประเมินผู้ป่วยนอก (OPD Card)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <!-- Page 1: Assessment, Medical Info, Physical Exam Grids -->
  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">แบบบันทึกการตรวจประเมินทางกายภาพบำบัด (OPD Card)</div>
      <div class="doc-subtitle">Outpatient Physical Therapy Evaluation & Record</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold" style="font-size: 14px;">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">เลขที่คลินิก (CN):</span><span class="val bold">${_val(p.ClinicNumber)}</span></div>
      <div class="field"><span class="label">HN:</span><span class="val">${_val(p.HN)}</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">วันที่:</span><span class="val bold">${_thaiDate(r.VisitDate)}</span></div>
      <div class="field"><span class="label">เวลา:</span><span class="val">${_formatTime(r.StartTime)} - ${_formatTime(r.EndTime)}</span></div>
      <div class="field"><span class="label">ครั้งที่:</span><span class="val bold">${_val(r.VisitCount, '1')}</span></div>
      <div class="field"><span class="label">สิทธิการรักษา:</span><span class="val">${_val(p.TreatmentRightsDisplay || p.TreatmentRights)}</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">ประเภทบริการ:</span>
        <span class="chk-item">${_chk(r.ServiceType_Home || r.ServiceType === 'Home')} ให้บริการที่บ้าน</span>
        <span class="chk-item">${_chk(r.ServiceType_Clinic || r.ServiceType === 'Clinic')} ที่คลินิก</span>
      </div>
      ${r.GeoLocationTimestamp ? `<div class="field" style="width:100%;"><span class="label">พิกัด/เวลา:</span><span class="val long" style="font-size:11px;">${_val(r.GeoLocationTimestamp)}</span></div>` : ''}
    </div>

    <div class="section-title">สัญญาณชีพและการประเมินเบื้องต้น (Vital Signs)</div>
    <div class="row" style="background:#f8fafc; padding: 4px 8px; border:1px solid #e2e8f0; border-radius:4px;">
      <div class="field"><span class="label">BT:</span><span class="val">${_val(r.BT)} °C</span></div>
      <div class="field"><span class="label">Pulse:</span><span class="val">${_val(r.Pulse)} bpm</span></div>
      <div class="field"><span class="label">RR:</span><span class="val">${_val(r.RR)} /min</span></div>
      <div class="field"><span class="label">BP:</span><span class="val bold">${_val(r.BP)} mmHg</span></div>
      <div class="field"><span class="label">SpO2:</span><span class="val bold">${_val(r.SpO2)} %</span></div>
      <div class="field"><span class="label">Barthel Index:</span><span class="val bold" style="color:#0f766e;">${_val(r.BarthelIndex)} คะแนน</span></div>
    </div>

    <div class="section-title">ข้อมูลทางการแพทย์และอาการสำคัญ (Medical History)</div>
    <div class="row">
      <span class="label">Diagnosis:</span>
      <span class="chk-item">${_chk(diag.includes('Stroke'))} Stroke</span>
      <span class="chk-item">${_chk(diag.includes('Fx.HIP') || diag.includes('FxHIP'))} Fx.HIP</span>
      <span class="chk-item">${_chk(diag.includes('SCI'))} SCI</span>
      <span class="chk-item">${_chk(diag.includes('TBI'))} TBI</span>
      ${r.ChiefComplaint ? `<div class="field" style="width:100%; margin-top:2px;"><span class="label">Chief Complaint (CC):</span><span class="val long" style="flex:1;">${_val(r.ChiefComplaint)}</span></div>` : ''}
      ${r.PHPI ? `<div class="field" style="width:100%; margin-top:2px;"><span class="label">Present Illness (PH/PI):</span><span class="val long" style="flex:1;">${_val(r.PHPI)}</span></div>` : ''}
      ${r.MedicalTreatment ? `<div class="field" style="width:100%; margin-top:2px;"><span class="label">Medical Treatment:</span><span class="val long" style="flex:1;">${_val(r.MedicalTreatment)}</span></div>` : ''}
    </div>
    <div class="row" style="margin-top: 3px;">
      <span class="label">Fx.Around HIP Status:</span>
      <span class="chk-item">${_chk(fxStatus === 'NWB')} NWB</span>
      <span class="chk-item">${_chk(fxStatus === 'PWB')} PWB ${_val(r.FxHIP_PWB_Percent)} %</span>
      <span class="chk-item">${_chk(fxStatus === 'FWB')} FWB</span>
      <span class="chk-item">${_chk(fxStatus === 'W/C' || fxStatus === 'WC')} W/C</span>
      <span class="chk-item">${_chk(fxStatus === 'Bed rest')} Bed rest</span>
    </div>

    <div class="section-title">การตรวจร่างกาย (Physical Examination)</div>
    <div class="row">
      <span class="label">LOC:</span>
      <span class="chk-item">${_chk(loc.includes('Alert'))} Alert</span>
      <span class="chk-item">${_chk(loc.includes('Drowsiness'))} Drowsiness</span>
      <span class="chk-item">${_chk(loc.includes('Confuse'))} Confuse</span>
      <span class="chk-item">${_chk(loc.includes('Stupor'))} Stupor</span>
      <span class="chk-item">${_chk(loc.includes('Semi-coma'))} Semi-coma</span>
      <span class="chk-item">${_chk(loc.includes('Coma'))} Coma</span>
    </div>
    <div class="row" style="margin-top: 2px;">
      <span class="label">Communication:</span>
      <span class="chk-item">${_chk(comm === 'Normal')} Normal</span>
      <span class="chk-item">${_chk(comm === 'Dysarthria')} Dysarthria</span>
      <span class="chk-item">${_chk(comm === 'Aphasia')} Aphasia</span>
      ${comm === 'Aphasia' ? `<span style="font-size:11.5px;">(${_chk(aphasia === 'Global')} Global ${_chk(aphasia === 'Motor')} Motor ${_chk(aphasia === 'Sensory')} Sensory)</span>` : ''}
    </div>
    <div class="row" style="margin-top: 2px;">
      <span class="label">Equipment:</span>
      <span class="chk-item">${_chk(equip.includes('No'))} No</span>
      <span class="chk-item">${_chk(equip.includes("Foley's cath") || equip.includes('Foleys'))} Foley's Cath</span>
      <span class="chk-item">${_chk(equip.includes('NG tube'))} NG Tube</span>
      <span class="chk-item">${_chk(equip.includes('Tracheostomy'))} Tracheostomy</span>
      <span class="chk-item">${_chk(equip.includes('Other'))} Other: ${_val(r.EquipmentOther)}</span>
    </div>

    <div style="display: flex; gap: 12px; margin-top: 6px;">
      <!-- Gross Motor Function Grid -->
      <div style="flex: 1;">
        <div style="font-size: 11px; font-weight: 700; color: #0f766e; margin-bottom: 2px;">Gross Motor Function</div>
        <table class="report-table" style="font-size: 10.5px;">
          <thead>
            <tr><th>ท่าทาง</th><th>ระดับ</th></tr>
          </thead>
          <tbody>
            ${gmRows.map(row => `
              <tr>
                <td>${row.name}</td>
                <td class="center">${_val(gm[row.key], '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Hand Function Grid -->
      <div style="flex: 1;">
        <div style="font-size: 11px; font-weight: 700; color: #0f766e; margin-bottom: 2px;">Hand Function (Rt. / Lt.)</div>
        <table class="report-table" style="font-size: 10.5px;">
          <thead>
            <tr><th>ฟังก์ชัน</th><th>ระดับ</th></tr>
          </thead>
          <tbody>
            ${hfRows.map(row => `
              <tr>
                <td>${row.name}</td>
                <td class="center">${_val(hf[row.key], '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Balance Grid -->
      <div style="flex: 1;">
        <div style="font-size: 11px; font-weight: 700; color: #0f766e; margin-bottom: 2px;">Balance Assessment</div>
        <table class="report-table" style="font-size: 10.5px;">
          <thead>
            <tr><th>การทรงท่า</th><th>ระดับ</th></tr>
          </thead>
          <tbody>
            ${balRows.map(row => `
              <tr>
                <td>${row.name}</td>
                <td class="center">${_val(bal[row.key], '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="row" style="margin-top: 4px;">
      <div class="field" style="width: 100%;">
        <span class="label">Special Assessments:</span>
        <span class="chk-item">${_chk(sa.includes('MRI'))} MRI</span>
        <span class="chk-item">${_chk(sa.includes('CT'))} CT-scan</span>
        <span class="chk-item">${_chk(sa.includes('X-ray'))} X-ray</span>
        <span class="chk-item">${_chk(sa.includes('ASIA'))} ASIA (${_val(r.SpecialAssessment_ASIA_NLI)}, AIS: ${_val(r.SpecialAssessment_ASIA_AIS)})</span>
        <span class="val long" style="flex:1;">${_val(r.SpecialAssessment_Details)}</span>
      </div>
    </div>
  </div>

  <!-- Page 2: Treatment, Body Chart, Plan, Signatures -->
  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">แผนการรักษาและแผนภาพร่างกาย (OPD Card - หน้า 2)</div>
      <div class="doc-subtitle">Patient: ${_val(p.PatientName)} | CN: ${_val(p.ClinicNumber)} | ครั้งที่: ${_val(r.VisitCount)}</div>
    </div>

    <div style="display: flex; gap: 16px;">
      <div style="flex: 1.2;">
        <div class="section-title">รายการปัญหาและเป้าหมายการรักษา (Problem List & Goals)</div>
        <div class="row">
          <div class="field" style="width: 100%;"><span class="label">Problem List:</span><span class="val full">${_val(r.ProblemList)}</span></div>
        </div>
        <div class="row" style="margin-top: 3px;">
          <div class="field" style="width: 100%;"><span class="label">Goals of Treatment:</span><span class="val full">${_val(r.GoalsOfTreatment)}</span></div>
        </div>
        <div class="row" style="margin-top: 3px;">
          <div class="field" style="width: 100%;"><span class="label">Plan of Treatment:</span><span class="val full">${_val(r.PlanOfTreatment)}</span></div>
        </div>

        <div class="section-title">การให้การรักษาทางกายภาพบำบัด (Physical Therapy Interventions)</div>
        <table class="report-table">
          <thead>
            <tr>
              <th style="width: 38%;">รายการรักษา</th>
              <th style="width: 20%;">เวลา</th>
              <th>รายละเอียดการรักษา</th>
            </tr>
          </thead>
          <tbody>
            ${treatRowsHtml || '<tr><td colspan="3" class="center">ไม่ได้บันทึกรายการเฉพาะ</td></tr>'}
          </tbody>
        </table>
        ${r.Treatment_TotalTime ? `<div style="text-align: right; font-size: 12px; font-weight: 700; color: #0f766e;">เวลารักษารวมทั้งหมด: ${r.Treatment_TotalTime} นาที</div>` : ''}
      </div>

      <div style="width: 260px; flex-shrink: 0; text-align: center;">
        <div class="section-title">แผนภาพตำแหน่งอาการ (Body Chart)</div>
        <div class="bodychart-box">
          ${bodyChartImg ? `<img src="${bodyChartImg}" alt="Body Chart Drawing">` : '<div style="height:220px; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px;">ไม่ได้บันทึกภาพวาด Body Chart</div>'}
        </div>
      </div>
    </div>

    ${r.Notes ? `
    <div class="section-title">หมายเหตุเพิ่มเติม (Clinical Notes)</div>
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 12px; background: #fafafa; min-height: 40px;">
      ${_val(r.Notes)}
    </div>` : ''}

    <div class="signatures-block" style="margin-top: 35px;">
      <div class="sig-box">
        ${patientSig ? `<img class="sig-img" src="${patientSig}" alt="ลายมือชื่อผู้รับบริการ">` : '<div class="sig-placeholder"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">${_val(r.PatientNameFull || p.PatientName)}</div>
        <div class="sig-role">ผู้รับบริการ / ญาติ</div>
      </div>

      <div class="sig-box">
        ${therapistSig ? `<img class="sig-img" src="${therapistSig}" alt="ลายมือชื่อนักกายภาพบำบัด">` : '<div class="sig-placeholder"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(r.TherapistName, 'นักกายภาพบำบัดผู้ตรวจรักษา')})</div>
        <div class="sig-role">นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license || r.TherapistLicenseNo)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัดสุขกาย IMC Plus - OPD Card</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 5. SOAP Note (แบบบันทึกความก้าวหน้าการรักษา)
  // ---------------------------------------------------------------------------

  function buildSOAPNoteHtml(p, note, biData, license) {
    const diag = _parseArr(note.DiagnosisJSON);
    const obj = _parseObj(note.ObjectiveJSON);
    const treat = _parseObj(note.TreatmentJSON);
    const plan = String(note.Plan || '');

    const qm = obj.QualityMovement || {};
    const biScore = (biData && biData.TotalScore !== undefined) ? biData.TotalScore : note.BarthelIndex;

    const treatKeys = [
      { id: 'QualityMove', name: 'Quality move train' },
      { id: 'BedMobility', name: 'Bed mobility train' },
      { id: 'Balance', name: 'Balance train' },
      { id: 'Gait', name: 'Gait training' },
      { id: 'Other', name: 'Other treatment' }
    ];

    let treatRowsHtml = '';
    treatKeys.forEach(item => {
      const t = treat[item.id];
      if (t && Object.keys(t).length > 0) {
        const details = Array.isArray(t.details) ? t.details.join(', ') : (t.details || '-');
        treatRowsHtml += `
          <tr>
            <td style="font-weight:600;">☑ ${item.name}</td>
            <td class="center bold">${_val(t.time)} นาที</td>
            <td>${details}</td>
          </tr>
        `;
      }
    });

    if (treat.Ambulation) {
      const amb = treat.Ambulation;
      treatRowsHtml += `
        <tr>
          <td style="font-weight:600;">☑ Ambulation Training</td>
          <td class="center bold">-</td>
          <td>Status: ${amb.Status || '-'} ${amb.PWB_Percent ? `(${amb.PWB_Percent}%)` : ''}</td>
        </tr>
      `;
    }

    const therapistSig = note.TherapistSignatureBase64 || note.TherapistSignatureUrl || '';

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>SOAP Note - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์บันทึกการรักษาทางกายภาพบำบัด (SOAP Note)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
      <div class="doc-title">แบบบันทึกความก้าวหน้าการรักษาทางกายภาพบำบัด (SOAP Note)</div>
      <div class="doc-subtitle">Physical Therapy Daily Progress & Treatment Note</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">เลขที่คลินิก (CN):</span><span class="val bold">${_val(p.ClinicNumber)}</span></div>
      <div class="field"><span class="label">HN:</span><span class="val">${_val(p.HN)}</span></div>
    </div>
    <div class="row">
      <div class="field"><span class="label">วันที่ตรวจรักษา:</span><span class="val bold">${_thaiDate(note.VisitDate)}</span></div>
      <div class="field"><span class="label">เวลา:</span><span class="val">${_formatTime(note.StartTime)} - ${_formatTime(note.EndTime)}</span></div>
      <div class="field"><span class="label">ครั้งที่:</span><span class="val bold">${_val(note.VisitCount, '1')}</span></div>
      <div class="field"><span class="label">นักกายภาพบำบัด:</span><span class="val">${_val(note.TherapistName)}</span></div>
    </div>
    <div class="row">
      <span class="label">Diagnosis:</span>
      <span class="chk-item">${_chk(diag.includes('Stroke'))} Stroke</span>
      <span class="chk-item">${_chk(diag.includes('Fx.HIP') || diag.includes('FxHIP'))} Fx.HIP</span>
      <span class="chk-item">${_chk(diag.includes('SCI'))} SCI</span>
      <span class="chk-item">${_chk(diag.includes('TBI'))} TBI</span>
    </div>

    <!-- S: Subjective -->
    <div class="section-title">S : ข้อมูลจากการบอกเล่าของผู้ป่วย/ผู้ดูแล (Subjective)</div>
    <div style="padding: 6px 10px; background:#fafafa; border:1px solid #e2e8f0; border-radius:4px; min-height:45px; font-size:12.5px;">
      ${_val(note.Subjective, 'ผู้ป่วยรู้สึกตัวดี ไม่มีอาการวิงเวียนศีรษะ สามารถสื่อสารและให้ความร่วมมือได้ตามปกติ')}
    </div>

    <!-- O: Objective -->
    <div class="section-title">O : ผลการตรวจประเมินและสิ่งที่สังเกตพบ (Objective)</div>
    <div style="padding: 6px 10px; background:#fafafa; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:6px;">
      ${obj.QualityMovement_Check ? `
        <div style="margin-bottom: 4px;">
          <strong>Quality of Movement :</strong>
          UE Rt: <span class="val">${_val(qm.UE?.Rt)}</span> &nbsp; Lt: <span class="val">${_val(qm.UE?.Lt)}</span> |
          LE Rt: <span class="val">${_val(qm.LE?.Rt)}</span> &nbsp; Lt: <span class="val">${_val(qm.LE?.Lt)}</span>
        </div>` : ''}
      <div class="row">
        <div class="field"><span class="label">Barthel Index (คะแนนความสามารถ ADL):</span><span class="val bold" style="color:#0f766e;">${_val(biScore)} คะแนน</span></div>
      </div>
      ${obj.Other_Check ? `<div><strong>การประเมินอื่น:</strong> ${_val(obj.Other_Details)}</div>` : ''}
    </div>

    <!-- A: Assessment -->
    <div class="section-title">A : การประเมินผลการฟื้นตัวและความก้าวหน้า (Assessment)</div>
    <div style="padding: 6px 10px; background:#fafafa; border:1px solid #e2e8f0; border-radius:4px; min-height:45px; font-size:12.5px;">
      ${_val(note.Assessment, 'ผู้ป่วยมีแนวโน้มการฟื้นตัวที่ดี สามารถทำกิจกรรมการฝึกได้อย่างมีประสิทธิภาพตามเป้าหมาย')}
    </div>

    <!-- P: Plan / Treatment -->
    <div class="section-title">P : แผนการรักษาและรายการกิจกรรมบำบัด (Plan & Treatment Interventions)</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 36%;">รายการรักษา</th>
          <th style="width: 18%;">เวลา</th>
          <th>รายละเอียดการฝึกและเทคนิคที่ใช้</th>
        </tr>
      </thead>
      <tbody>
        ${treatRowsHtml || '<tr><td colspan="3" class="center">ไม่ได้ระบุรายการรักษา</td></tr>'}
      </tbody>
    </table>

    <div style="padding: 6px 10px; background:#f0fdfa; border:1.5px solid #0f766e; border-radius:4px; margin-top:8px;">
      <div class="label" style="color:#0f766e; margin-bottom:4px;">แผนการดูแลต่อเนื่อง (Continuing Care Plan):</div>
      <div class="row">
        <span class="chk-item">${_chk(plan.includes('F/U Program PT'))} F/U Program PT ต่อเนื่อง</span>
        <span class="chk-item">${_chk(plan.includes('OFF PT Program'))} OFF PT Program (สิ้นสุดการฟื้นฟู)</span>
        <span class="chk-item">${_chk(plan.includes('ส่งต่อ รพ.'))} ส่งต่อ รพ. ดูแลต่อเนื่อง</span>
      </div>
    </div>

    ${note.Notes ? `
    <div class="section-title">หมายเหตุเพิ่มเติม (Clinical Notes)</div>
    <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 12px; background: #fafafa;">
      ${_val(note.Notes)}
    </div>` : ''}

    <div class="signatures-block" style="margin-top: 38px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">${_val(p.PatientName)}</div>
        <div class="sig-role">ผู้ป่วย / ผู้รับบริการ</div>
      </div>

      <div class="sig-box">
        ${therapistSig ? `<img class="sig-img" src="${therapistSig}" alt="ลายเซ็นนักกายภาพบำบัด">` : '<div class="sig-placeholder"></div>'}
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(note.TherapistName, 'นักกายภาพบำบัดผู้ตรวจรักษา')})</div>
        <div class="sig-role">นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license || note.TherapistLicenseNo)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัดสุขกาย IMC Plus - SOAP Progress Note</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 6. TMSE (แบบทดสอบสมรรถภาพสมองไทย 30 คะแนน)
  // ---------------------------------------------------------------------------

  function buildTMSEHtml(p, r, license) {
    const totalScore = Number(r.total_score);
    const scoreVal = isNaN(totalScore) ? 0 : totalScore;

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>TMSE - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์แบบทดสอบสมรรถภาพสมองไทย (Thai Mental State Examination : TMSE)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัด สุขกาย</div>
      <div class="doc-title">แบบทดสอบสมรรถภาพสมองไทย (TMSE)</div>
      <div class="doc-subtitle">Thai Mental State Examination (คะแนนเต็ม 30 คะแนน)</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">HN/CN:</span><span class="val bold">${_val(p.ClinicNumber || p.HN)}</span></div>
      <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || _calculateAge(p.DateOfBirth))} ปี</span></div>
      <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val bold">${_thaiDate(r.VisitDate)}</span></div>
    </div>

    <!-- 1. Orientation -->
    <div class="section-title">1. Orientation (การรับรู้เกี่ยวกับเวลาและสถานที่ - เต็ม 6 คะแนน)</div>
    <table class="report-table">
      <thead>
        <tr><th style="width: 10%;">ข้อ</th><th>คำถาม / หัวข้อการทดสอบ</th><th style="width: 20%;">ผลการประเมิน</th><th style="width: 12%;">คะแนน</th></tr>
      </thead>
      <tbody>
        <tr><td class="center">1</td><td>วันนี้ วันอะไร (วันจันทร์ - อาทิตย์)</td><td>${_chk(r.q_day == 1)} ถูกต้อง &nbsp; ${_chk(r.q_day == 0)} ผิด</td><td class="center bold">${r.q_day == 1 ? 1 : 0}</td></tr>
        <tr><td class="center">2</td><td>วันนี้ วันที่เท่าไหร่</td><td>${_chk(r.q_date == 1)} ถูกต้อง &nbsp; ${_chk(r.q_date == 0)} ผิด</td><td class="center bold">${r.q_date == 1 ? 1 : 0}</td></tr>
        <tr><td class="center">3</td><td>เดือนนี้ เดือนอะไร</td><td>${_chk(r.q_month == 1)} ถูกต้อง &nbsp; ${_chk(r.q_month == 0)} ผิด</td><td class="center bold">${r.q_month == 1 ? 1 : 0}</td></tr>
        <tr><td class="center">4</td><td>ช่วงนี้ เวลาอะไร (เช้า / กลางวัน / บ่าย / เย็น)</td><td>${_chk(r.q_time == 1)} ถูกต้อง &nbsp; ${_chk(r.q_time == 0)} ผิด</td><td class="center bold">${r.q_time == 1 ? 1 : 0}</td></tr>
        <tr><td class="center">5</td><td>ที่นี่ ที่ไหน (บ้าน / รพ. / คลินิก)</td><td>${_chk(r.q_place == 1)} ถูกต้อง &nbsp; ${_chk(r.q_place == 0)} ผิด</td><td class="center bold">${r.q_place == 1 ? 1 : 0}</td></tr>
        <tr><td class="center">6</td><td>ผู้ตรวจทำงานอะไร / สวมชุดสีอะไร</td><td>${_chk(r.q_job == 1)} ถูกต้อง &nbsp; ${_chk(r.q_job == 0)} ผิด</td><td class="center bold">${r.q_job == 1 ? 1 : 0}</td></tr>
      </tbody>
    </table>

    <!-- 2. Registration & Attention -->
    <div class="section-title">2. Registration & Attention & Calculation (เต็ม 11 คะแนน)</div>
    <table class="report-table">
      <thead>
        <tr><th>หมวดการทดสอบ</th><th>รายละเอียดคำถาม</th><th style="width: 12%;">คะแนน</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Registration</strong> (เต็ม 3)</td>
          <td>จำคำ 3 คำ: ต้นไม้ (${_chk(r.q_reg_1 == 1)}), รถยนต์ (${_chk(r.q_reg_2 == 1)}), มือ (${_chk(r.q_reg_3 == 1)})</td>
          <td class="center bold">${Number(r.q_reg_1 || 0) + Number(r.q_reg_2 || 0) + Number(r.q_reg_3 || 0)} / 3</td>
        </tr>
        <tr>
          <td><strong>Attention</strong> (เต็ม 5)</td>
          <td>สะกดคำย้อนหลัง ศ-พ-พ-อ-จ: ศ(${_chk(r.q_fri == 1)}) พ(${_chk(r.q_thu == 1)}) พ(${_chk(r.q_wed == 1)}) อ(${_chk(r.q_tue == 1)}) จ(${_chk(r.q_mon == 1)})</td>
          <td class="center bold">${Number(r.q_fri || 0) + Number(r.q_thu || 0) + Number(r.q_wed || 0) + Number(r.q_tue || 0) + Number(r.q_mon || 0)} / 5</td>
        </tr>
        <tr>
          <td><strong>Calculation</strong> (เต็ม 3)</td>
          <td>คิดเลขลบ 7 หรือคิดเลข: ข้อ 1 (${_chk(r.q_calc1 == 1)}), ข้อ 2 (${_chk(r.q_calc2 == 1)}), ข้อ 3 (${_chk(r.q_calc3 == 1)})</td>
          <td class="center bold">${Number(r.q_calc1 || 0) + Number(r.q_calc2 || 0) + Number(r.q_calc3 || 0)} / 3</td>
        </tr>
      </tbody>
    </table>

    <!-- 3. Recall & Language -->
    <div class="section-title">3. Recall & Language & Visuospatial (เต็ม 13 คะแนน)</div>
    <table class="report-table">
      <thead>
        <tr><th>หมวดการทดสอบ</th><th>รายละเอียดการทดสอบ</th><th style="width: 12%;">คะแนน</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Recall</strong> (เต็ม 3)</td>
          <td>ระลึกคำ 3 คำที่จำไว้: ต้นไม้ (${_chk(r.q_tree == 1)}), รถยนต์ (${_chk(r.q_car == 1)}), มือ (${_chk(r.q_hand == 1)})</td>
          <td class="center bold">${Number(r.q_tree || 0) + Number(r.q_car || 0) + Number(r.q_hand || 0)} / 3</td>
        </tr>
        <tr>
          <td><strong>Naming</strong> (เต็ม 2)</td>
          <td>บอกชื่อสิ่งของ: นาฬิกา (${_chk(r.q_watch == 1)}), เสื้อ (${_chk(r.q_shirt == 1)})</td>
          <td class="center bold">${Number(r.q_watch || 0) + Number(r.q_shirt || 0)} / 2</td>
        </tr>
        <tr>
          <td><strong>Repetition</strong> (เต็ม 1)</td>
          <td>พูดตาม: "ใครใคร่ค้าม้าค้า ใครใคร่ค้าช้างค้า"</td>
          <td class="center bold">${r.q_repeat == 1 ? 1 : 0} / 1</td>
        </tr>
        <tr>
          <td><strong>Command</strong> (เต็ม 3)</td>
          <td>คำสั่ง 3 ขั้น: หยิบกระดาษ (${_chk(r.q_command1 == 1)}), พับครึ่ง (${_chk(r.q_command2 == 1)}), วางบนตัก (${_chk(r.q_command3 == 1)})</td>
          <td class="center bold">${Number(r.q_command1 || 0) + Number(r.q_command2 || 0) + Number(r.q_command3 || 0)} / 3</td>
        </tr>
        <tr>
          <td><strong>Reading</strong> (เต็ม 1)</td>
          <td>อ่านป้ายข้อความ "หลับตา" แล้วปฏิบัติตาม</td>
          <td class="center bold">${r.q_read == 1 ? 1 : 0} / 1</td>
        </tr>
        <tr>
          <td><strong>Drawing</strong> (เต็ม 2)</td>
          <td>วาดภาพรูปทรงห้าเหลี่ยมซ้อนกัน</td>
          <td class="center bold">${_val(r.q_draw, '0')} / 2</td>
        </tr>
        <tr>
          <td><strong>Similarity</strong> (เต็ม 1)</td>
          <td>ความคล้ายคลึง: ส้ม-กล้วย (${_chk(r.q_similar1 == 1)}: 0.5), โต๊ะ-เก้าอี้ (${_chk(r.q_similar2 == 1)}: 0.5)</td>
          <td class="center bold">${(Number(r.q_similar1 || 0) * 0.5) + (Number(r.q_similar2 || 0) * 0.5)} / 1</td>
        </tr>
      </tbody>
    </table>

    <!-- Total & Interpretation -->
    <div class="summary-card" style="margin-top: 10px;">
      <div class="row" style="align-items: center;">
        <span style="font-size: 14px; font-weight: 700;">คะแนนรวมทั้งสิ้น (Total TMSE Score):</span>
        <span style="font-size: 20px; font-weight: 800; color: #0f766e; margin-left: 10px;">${scoreVal}</span>
        <span style="font-size: 14px; font-weight: 700;">/ 30 คะแนน</span>
      </div>
      <div class="row" style="margin-top: 6px;">
        <span class="label">การแปลผล:</span>
        <span class="chk-item">${_chk(scoreVal >= 26)} ปกติ (Normal : >= 26)</span>
        <span class="chk-item">${_chk(scoreVal >= 23 && scoreVal < 26)} มีความบกพร่องเล็กน้อย (Mild Impairment : 23 - 25)</span>
        <span class="chk-item">${_chk(scoreVal < 23)} ภาวะสมองเสื่อม (Cognitive Impairment / Dementia : < 23)</span>
      </div>
    </div>

    <div class="signatures-block" style="margin-top: 30px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(r.TherapistName, 'นักกายภาพบำบัดผู้ประเมิน')})</div>
        <div class="sig-role">ผู้ประเมิน / นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัด สุขกาย - แบบทดสอบสมรรถภาพสมอง TMSE</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 7. MHQ (แบบคัดกรองสุขภาพจิต 2Q, 9Q, 8Q)
  // ---------------------------------------------------------------------------

  function buildMHQHtml(p, r, license) {
    const q9Items = [
      'เบื่อ ไม่สนใจอยากทำอะไร',
      'ไม่สบายใจ ซึมเศร้า หรือท้อแท้',
      'หลับยาก หรือหลับๆ ตื่นๆ หรือหลับมากเกินไป',
      'เหนื่อยง่าย หรือไม่ค่อยมีแรง',
      'เบื่ออาหาร หรือกินมากเกินไป',
      'รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว หรือทำให้ครอบครัวผิดหวัง',
      'สมาธิไม่ดีเวลาทำอะไร เช่น ดูโทรทัศน์ หรือทำงานที่ต้องตั้งใจ',
      'พูดช้าหรือทำอะไรช้าลง จนคนอื่นสังเกตเห็นได้ หรือกระสับกระส่าย',
      'คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี'
    ];

    const score9q = Number(r.score_9q || 0);
    const score8q = Number(r.score_8q || 0);
    const has2qRisk = (r.q2_1 === 'YES' || r.q2_2 === 'YES');

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>MHQ - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์แบบคัดกรองสุขภาพจิตและภาวะซึมเศร้า (MHQ: 2Q, 9Q, 8Q)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัด สุขกาย</div>
      <div class="doc-title">แบบคัดกรองสุขภาพจิตและภาวะซึมเศร้า (MHQ)</div>
      <div class="doc-subtitle">Mental Health Screening & Depression Questionnaire (2Q, 9Q, 8Q)</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">HN/CN:</span><span class="val bold">${_val(p.ClinicNumber || p.HN)}</span></div>
      <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || _calculateAge(p.DateOfBirth))} ปี</span></div>
      <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val bold">${_thaiDate(r.VisitDate)}</span></div>
    </div>

    <!-- Section 1: 2Q -->
    <div class="section-title">1. แบบคัดกรองโรคซึมเศร้า 2 คำถาม (2Q) ในช่วง 2 สัปดาห์ที่ผ่านมา</div>
    <table class="report-table">
      <thead>
        <tr><th style="width: 8%;">ข้อ</th><th>ข้อคำถาม</th><th style="width: 25%;">ผลการประเมิน</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="center">1</td>
          <td>ใน 2 สัปดาห์ที่ผ่านมา ท่านรู้สึกหดหู่ เศร้า หรือท้อแท้สิ้นหวังหรือไม่</td>
          <td class="center">${_chk(r.q2_1 === 'YES')} มี (YES) &nbsp;&nbsp; ${_chk(r.q2_1 === 'NO')} ไม่มี (NO)</td>
        </tr>
        <tr>
          <td class="center">2</td>
          <td>ใน 2 สัปดาห์ที่ผ่านมา ท่านรู้สึกเบื่อ ทำอะไรก็ไม่เพลิดเพลินหรือไม่</td>
          <td class="center">${_chk(r.q2_2 === 'YES')} มี (YES) &nbsp;&nbsp; ${_chk(r.q2_2 === 'NO')} ไม่มี (NO)</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:12px; font-weight:600; padding:4px 8px; background:${has2qRisk ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${has2qRisk ? '#fca5a5' : '#86efac'}; border-radius:4px; margin-bottom:6px;">
      สรุปผล 2Q: ${has2qRisk ? '⚠️ พบความเสี่ยง (มีอาการอย่างน้อย 1 ข้อ) -> ประเมินต่อด้วยแบบประเมิน 9Q' : '✅ ปกติ (ไม่มีความเสี่ยงต่อภาวะซึมเศร้า)'}
    </div>

    <!-- Section 2: 9Q -->
    <div class="section-title">2. แบบประเมินโรคซึมเศร้า 9 คำถาม (9Q)</div>
    <table class="report-table" style="font-size: 11.5px;">
      <thead>
        <tr>
          <th style="width: 8%;">ข้อ</th>
          <th>ข้อคำถาม (ใน 2 สัปดาห์ที่ผ่านมา)</th>
          <th style="width: 14%;">คะแนน (0-3)</th>
        </tr>
      </thead>
      <tbody>
        ${q9Items.map((text, i) => {
          const val = r[`q9_${i + 1}`];
          return `
            <tr>
              <td class="center">${i + 1}</td>
              <td>${text}</td>
              <td class="center bold">${val !== null && val !== undefined ? val : '-'}</td>
            </tr>
          `;
        }).join('')}
        <tr class="total-row" style="background:#f0fdfa;">
          <td colspan="2" class="right">คะแนนรวม 9Q (Total 9Q Score):</td>
          <td class="center" style="font-size: 14px; color:#0f766e;">${score9q} / 27</td>
        </tr>
      </tbody>
    </table>
    <div class="row" style="padding: 2px 6px; font-size:11.5px;">
      <span class="label">ระดับความรุนแรง 9Q:</span>
      <span class="chk-item">${_chk(score9q < 7)} ไม่มี (< 7)</span>
      <span class="chk-item">${_chk(score9q >= 7 && score9q <= 12)} เล็กน้อย (7-12)</span>
      <span class="chk-item">${_chk(score9q >= 13 && score9q <= 18)} ปานกลาง (13-18)</span>
      <span class="chk-item">${_chk(score9q >= 19)} รุนแรง (>= 19)</span>
    </div>

    <!-- Section 3: 8Q -->
    <div class="section-title" style="margin-top: 8px;">3. แบบประเมินการฆ่าตัวตาย 8 คำถาม (8Q)</div>
    <div class="summary-card" style="margin: 4px 0;">
      <div class="row">
        <div class="field"><span class="label">คะแนนรวม 8Q:</span><span class="val bold" style="color:#0f766e; font-size:15px;">${score8q} คะแนน</span></div>
        <div class="field" style="margin-left: 20px;"><span class="label">ระดับความเสี่ยง:</span>
          <span class="chk-item">${_chk(score8q === 0)} ไม่มี (0)</span>
          <span class="chk-item">${_chk(score8q >= 1 && score8q <= 8)} น้อย (1-8)</span>
          <span class="chk-item">${_chk(score8q >= 9 && score8q <= 16)} ปานกลาง (9-16)</span>
          <span class="chk-item">${_chk(score8q >= 17)} รุนแรง (>= 17 - ต้องส่งต่อด่วน)</span>
        </div>
      </div>
    </div>

    <div class="signatures-block" style="margin-top: 26px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(r.TherapistName, 'นักกายภาพบำบัดผู้ประเมิน')})</div>
        <div class="sig-role">ผู้ประเมิน / นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัด สุขกาย - แบบคัดกรองสุขภาพจิต MHQ (2Q, 9Q, 8Q)</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // 8. Dysphagia (แบบคัดกรองและประเมินภาวะกลืนลำบาก)
  // ---------------------------------------------------------------------------

  function buildDysphagiaHtml(p, r, license) {
    const symList = (step) => {
      const syms = [];
      if (r[`sym${step}_cough`] == 1) syms.push('ไอ (Cough)');
      if (r[`sym${step}_choke`] == 1) syms.push('สำลัก (Choke)');
      if (r[`sym${step}_tachypnea`] == 1) syms.push('หายใจเหนื่อย/เร็ว');
      if (r[`sym${step}_wetvoice`] == 1) syms.push('เสียงเปลี่ยน (Wet voice)');
      return syms.length > 0 ? syms.join(', ') : 'ปกติ / ไม่มีอาการผิดปกติ';
    };

    const g1Pass = (r.q1_1 === 'YES' && r.q1_2 === 'YES' && r.q1_3 === 'YES');

    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>Dysphagia Test - ${_val(p.PatientName)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="top-toolbar">
    <span class="title">พิมพ์แบบประเมินภาวะกลืนลำบาก (Dysphagia Screening & Swallowing Test)</span>
    <div>
      <button class="btn btn-print" onclick="window.print()">🖨️ สั่งพิมพ์ / Save as PDF</button>
      <button class="btn btn-close" onclick="window.close()">ปิด</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header-block">
      <div class="clinic-name">คลินิกกายภาพบำบัด สุขกาย</div>
      <div class="doc-title">แบบคัดกรองและประเมินภาวะกลืนลำบาก (Dysphagia Form)</div>
      <div class="doc-subtitle">Swallowing Assessment & Water Swallowing Test Protocol</div>
    </div>

    <div class="row">
      <div class="field"><span class="label">ชื่อ-สกุลผู้ป่วย:</span><span class="val long bold">${_val(p.PatientName)}</span></div>
      <div class="field"><span class="label">HN/CN:</span><span class="val bold">${_val(p.ClinicNumber || p.HN)}</span></div>
      <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || _calculateAge(p.DateOfBirth))} ปี</span></div>
      <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val bold">${_thaiDate(r.VisitDate)}</span></div>
    </div>

    <!-- Part 1: Pre-requisite -->
    <div class="section-title">ตอนที่ 1: การประเมินความพร้อมก่อนทดสอบการกลืนน้ำ (Pre-requisite Evaluation)</div>
    <table class="report-table">
      <thead>
        <tr><th style="width: 8%;">ข้อ</th><th>รายการประเมินความพร้อม</th><th style="width: 25%;">ผลการประเมิน</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="center">1</td>
          <td>ระดับความรู้สึกตัว (Alert & Cooperative ไม่ง่วงซึม ปลุกตื่นง่าย ให้ความร่วมมือได้)</td>
          <td class="center">${_chk(r.q1_1 === 'YES')} ผ่าน &nbsp;&nbsp; ${_chk(r.q1_1 === 'NO')} ไม่ผ่าน</td>
        </tr>
        <tr>
          <td class="center">2</td>
          <td>การทรงท่า (สามารถนั่งตัวตรง 90 องศาได้ หรือศีรษะตั้งตรงมั่นคง)</td>
          <td class="center">${_chk(r.q1_2 === 'YES')} ผ่าน &nbsp;&nbsp; ${_chk(r.q1_2 === 'NO')} ไม่ผ่าน</td>
        </tr>
        <tr>
          <td class="center">3</td>
          <td>สามารถควบคุมน้ำลายได้เอง ไม่สำลักน้ำลายตนเอง</td>
          <td class="center">${_chk(r.q1_3 === 'YES')} ผ่าน &nbsp;&nbsp; ${_chk(r.q1_3 === 'NO')} ไม่ผ่าน</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:12px; font-weight:600; padding:4px 8px; background:${g1Pass ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${g1Pass ? '#86efac' : '#fca5a5'}; border-radius:4px; margin-bottom:6px;">
      สรุปผลตอนที่ 1: ${g1Pass ? '✅ ผ่านเกณฑ์ความพร้อม -> สามารถทำการทดสอบการกลืนน้ำในตอนที่ 2 ได้' : '⚠️ ไม่ผ่านเกณฑ์ความพร้อม (ห้ามทดสอบการกลืนน้ำเด็ดขาด / แนะนำใส่สายให้อาหาร)'}
    </div>

    <!-- Part 2: Water Swallowing Test -->
    <div class="section-title">ตอนที่ 2: การทดสอบการกลืนน้ำ (Water Swallowing Test)</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 8%;">ระดับ</th>
          <th>ขั้นตอนการทดสอบ</th>
          <th style="width: 22%;">ผลการกลืน</th>
          <th style="width: 32%;">อาการสำลัก / เสียงเปลี่ยน</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="center">1</td>
          <td>จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 1</td>
          <td class="center">${_chk(r.q2_1 === 'YES')} กลืนได้ &nbsp; ${_chk(r.q2_1 === 'NO')} ไม่ได้</td>
          <td style="font-size:11.5px;">${symList('2_3')}</td>
        </tr>
        <tr>
          <td class="center">2</td>
          <td>จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 2</td>
          <td class="center">${_chk(r.q2_2 === 'YES')} กลืนได้ &nbsp; ${_chk(r.q2_2 === 'NO')} ไม่ได้</td>
          <td style="font-size:11.5px;">${symList('2_4')}</td>
        </tr>
        <tr>
          <td class="center">3</td>
          <td>จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 3</td>
          <td class="center">${_chk(r.q2_3 === 'YES')} กลืนได้ &nbsp; ${_chk(r.q2_3 === 'NO')} ไม่ได้</td>
          <td style="font-size:11.5px;">${symList('2_5')}</td>
        </tr>
        <tr>
          <td class="center">4</td>
          <td>ดื่มน้ำ 1 แก้ว (50 - 90 ml) ต่อเนื่อง</td>
          <td class="center">${_chk(r.q2_6 === 'YES')} กลืนได้ต่อเนื่อง &nbsp; ${_chk(r.q2_6 === 'NO')} สะดุด/สำลัก</td>
          <td style="font-size:11.5px;">${symList('2_6')}</td>
        </tr>
        <tr>
          <td class="center">5</td>
          <td>ทดสอบอาหารข้น / อาหารปกติ</td>
          <td class="center">${_chk(r.q2_7 === 'YES')} ผ่าน &nbsp; ${_chk(r.q2_7 === 'NO')} ไม่ผ่าน</td>
          <td style="font-size:11.5px;">${symList('2_7')}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary-card" style="margin-top: 8px;">
      <div class="row">
        <div class="field"><span class="label">ระดับภาวะการกลืน (Dysphagia Level / Score):</span><span class="val bold" style="color:#0f766e; font-size:15px;">${_val(r.total_score)}</span></div>
      </div>
      <div class="row" style="margin-top: 4px;">
        <span class="label">ผลสรุปและแผนการดูแล (Recommendations):</span>
        <span class="val long bold" style="flex:1;">${_val(r.result_status || r.Recommendations, 'รับประทานอาหารดัดแปลงและฝึกการกลืนร่วมกับนักกายภาพบำบัด')}</span>
      </div>
    </div>

    <div class="signatures-block" style="margin-top: 30px;">
      <div class="sig-box">
        <div class="sig-placeholder"></div>
        <div class="sig-line"></div>
        <div class="sig-name">(${_val(r.TherapistName, 'นักกายภาพบำบัดผู้ประเมิน')})</div>
        <div class="sig-role">ผู้ประเมิน / นักกายภาพบำบัดวิชาชีพ (วภ. ${_val(license)})</div>
      </div>
    </div>

    <div style="position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px;">
      <span>คลินิกกายภาพบำบัด สุขกาย - แบบคัดกรองภาวะกลืนลำบาก (Dysphagia)</span>
      <span>พิมพ์เมื่อ: ${_thaiDate(new Date())}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // Print Dispatcher & Window Opener
  // ---------------------------------------------------------------------------

  function openPrintWindow(html) {
    if (typeof Swal !== 'undefined') Swal.close();
    const win = window.open('', '_blank', 'width=1000,height=850,resizable=yes,scrollbars=yes');
    if (!win) {
      alert('กรุณาอนุญาต Pop-up บนเบราว์เซอร์ เพื่อเปิดหน้าพิมพ์เอกสาร');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.warn('Auto print trigger error:', e);
      }
    }, 600);
  }

  async function getClient() {
    return window.supabaseClient || null;
  }

  async function printDocument(type, id) {
    const normType = String(type).toLowerCase().replace(/[^a-z]/g, '');
    const client = await getClient();
    if (!client) throw new Error('ไม่พบการเชื่อมต่อฐานข้อมูล Supabase');

    const license = _getTherapistLicense();

    if (normType === 'imccover') {
      const { data: p, error } = await client.from('Patients').select('*').eq('PatientID', String(id).trim()).maybeSingle();
      if (error || !p) throw new Error(`ไม่พบข้อมูลผู้ป่วย ID: ${id}`);
      openPrintWindow(buildIMCCoverHtml(p));
      return { status: 'success' };
    }

    if (normType === 'consent') {
      const { data: c, error } = await client.from('Consents').select('*').eq('ConsentID', String(id).trim()).maybeSingle();
      if (error || !c) throw new Error(`ไม่พบข้อมูลใบยินยอม ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', c.PatientID).maybeSingle();
      openPrintWindow(buildConsentHtml(p || {}, c));
      return { status: 'success' };
    }

    if (normType === 'bi') {
      const { data: a, error } = await client.from('BIAssessments').select('*').eq('AssessmentID', String(id).trim()).maybeSingle();
      if (error || !a) throw new Error(`ไม่พบข้อมูลแบบประเมิน BI ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', a.PatientID).maybeSingle();
      openPrintWindow(buildBIAssessmentHtml(p || {}, a, license));
      return { status: 'success' };
    }

    if (normType === 'opd') {
      const { data: r, error } = await client.from('OPDRecords').select('*').eq('RecordID', String(id).trim()).maybeSingle();
      if (error || !r) throw new Error(`ไม่พบข้อมูล OPD Record ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', r.PatientID).maybeSingle();
      openPrintWindow(buildOPDCardHtml(p || {}, r, license));
      return { status: 'success' };
    }

    if (normType === 'soap') {
      const { data: note, error } = await client.from('SOAPNotes').select('*').eq('SOAPNoteID', String(id).trim()).maybeSingle();
      if (error || !note) throw new Error(`ไม่พบข้อมูล SOAP Note ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', note.PatientID).maybeSingle();
      let biData = {};
      if (note.PatientID && note.VisitCount) {
        const { data: bi } = await client.from('BIAssessments').select('*').eq('PatientID', note.PatientID).eq('VisitCount', note.VisitCount).maybeSingle();
        if (bi) biData = bi;
      }
      openPrintWindow(buildSOAPNoteHtml(p || {}, note, biData, license));
      return { status: 'success' };
    }

    if (normType === 'tmse') {
      const { data: r, error } = await client.from('TMSE_Records').select('*').eq('RecordID', String(id).trim()).maybeSingle();
      if (error || !r) throw new Error(`ไม่พบข้อมูล TMSE Record ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', r.PatientID).maybeSingle();
      openPrintWindow(buildTMSEHtml(p || {}, r, license));
      return { status: 'success' };
    }

    if (normType === 'mhq') {
      const { data: r, error } = await client.from('MHQ_Records').select('*').eq('RecordID', String(id).trim()).maybeSingle();
      if (error || !r) throw new Error(`ไม่พบข้อมูล MHQ Record ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', r.PatientID).maybeSingle();
      openPrintWindow(buildMHQHtml(p || {}, r, license));
      return { status: 'success' };
    }

    if (normType === 'dysphagia') {
      const { data: r, error } = await client.from('Dysphagia_Records').select('*').eq('RecordID', String(id).trim()).maybeSingle();
      if (error || !r) throw new Error(`ไม่พบข้อมูล Dysphagia Record ID: ${id}`);
      const { data: p } = await client.from('Patients').select('*').eq('PatientID', r.PatientID).maybeSingle();
      openPrintWindow(buildDysphagiaHtml(p || {}, r, license));
      return { status: 'success' };
    }

    throw new Error(`ไม่รู้จักชนิดเอกสาร: ${type}`);
  }

  // ---------------------------------------------------------------------------
  // Global Exports and Adapters Overrides
  // ---------------------------------------------------------------------------

  window.ClinicalPrintTemplates = {
    buildIMCCoverHtml,
    buildConsentHtml,
    buildBIAssessmentHtml,
    buildOPDCardHtml,
    buildSOAPNoteHtml,
    buildTMSEHtml,
    buildMHQHtml,
    buildDysphagiaHtml,
    printDocument,
    openPrintWindow
  };

  // Direct shortcuts
  window.generateIMCCoverPdf = id => printDocument('imccover', id);
  window.generateConsentPdf = id => printDocument('consent', id);
  window.generateBIPdf = id => printDocument('bi', id);
  window.generateOpdPdf = id => printDocument('opd', id);
  window.generateSOAPPdf = id => printDocument('soap', id);
  window.generateTMSEPdf = id => printDocument('tmse', id);
  window.generateMHQPdf = id => printDocument('mhq', id);
  window.generateDysphagiaPdf = id => printDocument('dysphagia', id);

  // Hook into IMCDocsTemplateAdapter if present
  window.IMCDocsTemplateAdapter = window.IMCDocsTemplateAdapter || {};
  window.IMCDocsTemplateAdapter.generate = async (type, id) => printDocument(type, id);
  window.IMCDocsTemplateAdapter.generateIMCCoverPdf = id => printDocument('imccover', id);
  window.IMCDocsTemplateAdapter.generateConsentPdf = id => printDocument('consent', id);
  window.IMCDocsTemplateAdapter.generateBIPdf = id => printDocument('bi', id);
  window.IMCDocsTemplateAdapter.generateOpdPdf = id => printDocument('opd', id);
  window.IMCDocsTemplateAdapter.generateSOAPPdf = id => printDocument('soap', id);
  window.IMCDocsTemplateAdapter.generateTMSEPdf = id => printDocument('tmse', id);
  window.IMCDocsTemplateAdapter.generateMHQPdf = id => printDocument('mhq', id);
  window.IMCDocsTemplateAdapter.generateDysphagiaPdf = id => printDocument('dysphagia', id);

  console.info('[ClinicalPrintTemplates] 100% Template-Accurate Print Engine initialized.');
})();
