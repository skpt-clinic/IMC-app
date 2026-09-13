// ================================================================
// VISIT EVIDENCE PHOTO - OPD / SOAP
// Private Supabase Storage, client-side compression, mobile camera
// ================================================================
(function () {
  const BUCKET = 'visit-evidence';
  const MAX_PHOTOS_PER_VISIT = 3;
  const MAX_OUTPUT_BYTES = 900 * 1024;
  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.72;
  const state = { OPD: [], SOAP: [] };

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  }

  function getForm(type) {
    return document.getElementById(type === 'OPD' ? 'opd-form' : 'soap-note-form');
  }

  function getId(type, form) {
    const name = type === 'OPD' ? 'RecordID' : 'SOAPNoteID';
    return form?.querySelector(`[name="${name}"]`)?.value?.trim() || '';
  }

  function getPatientId() {
    return String(window.currentPatient?.PatientID || '').trim();
  }

  function injectUI(form, type) {
    if (!form || form.querySelector('.visit-evidence-section')) return;
    const section = document.createElement('fieldset');
    section.className = 'visit-evidence-section border p-3 rounded bg-amber-50/50 mt-3';
    section.innerHTML = `
      <legend class="text-lg font-semibold float-none w-auto px-2">
        <i class="bi bi-camera-fill text-amber-600 me-1"></i> ภาพถ่ายหลักฐานการเยี่ยม
      </legend>
      <div class="small text-slate-600 mb-2">
        ถ่ายภาพสถานที่/สภาพแวดล้อม/การให้บริการเพื่อเป็นหลักฐานการเยี่ยม โดยหลีกเลี่ยงการถ่ายใบหน้าหรือข้อมูลส่วนบุคคลที่ไม่จำเป็น
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <label class="btn btn-warning mb-0">
          <i class="bi bi-camera-fill me-1"></i> ถ่ายภาพหลักฐาน
          <input type="file" accept="image/*" capture="environment" class="visit-evidence-input d-none" data-evidence-type="${type}">
        </label>
        <span class="text-xs text-slate-500 evidence-count">ยังไม่มีภาพ</span>
      </div>
      <div class="visit-evidence-preview grid grid-cols-2 md:grid-cols-3 gap-2 mt-3"></div>
      <div class="text-xs text-slate-500 mt-2">สูงสุด ${MAX_PHOTOS_PER_VISIT} ภาพ ระบบจะย่อขนาดอัตโนมัติเพื่อลดเวลาอัปโหลด</div>
    `;
    const submitButton = Array.from(form.querySelectorAll('button')).find(b => /บันทึก OPD Card|บันทึก SOAP Note/.test(b.textContent || ''));
    if (submitButton?.parentElement) submitButton.parentElement.before(section); else form.appendChild(section);
    const input = section.querySelector('.visit-evidence-input');
    input.addEventListener('change', e => handleFiles(type, e.target.files));
    render(type);
  }

  async function handleFiles(type, fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const room = MAX_PHOTOS_PER_VISIT - state[type].length;
    if (room <= 0) {
      Swal.fire({ icon: 'info', title: 'เพิ่มภาพไม่ได้', text: `Visit นี้แนบได้สูงสุด ${MAX_PHOTOS_PER_VISIT} ภาพ` });
      return;
    }
    showLoading('กำลังเตรียมภาพหลักฐาน...');
    try {
      for (const file of files.slice(0, room)) {
        const blob = await compressImage(file);
        state[type].push({ blob, capturedAt: new Date().toISOString(), originalName: file.name });
      }
      render(type);
      Swal.close();
    } catch (error) {
      Swal.close();
      showError({ message: 'ไม่สามารถเตรียมภาพได้: ' + (error.message || error) });
    }
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const finish = quality => canvas.toBlob(blob => {
            if (!blob) return reject(new Error('ไม่สามารถสร้างไฟล์ภาพได้'));
            if (blob.size <= MAX_OUTPUT_BYTES || quality <= 0.45) resolve(blob);
            else finish(Math.max(0.45, quality - 0.08));
          }, 'image/jpeg', quality);
          finish(JPEG_QUALITY);
        } catch (e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านภาพไม่สำเร็จ')); };
      img.src = url;
    });
  }

  function render(type) {
    const form = getForm(type);
    const section = form?.querySelector('.visit-evidence-section');
    if (!section) return;
    const preview = section.querySelector('.visit-evidence-preview');
    const count = section.querySelector('.evidence-count');
    count.textContent = state[type].length ? `แนบแล้ว ${state[type].length}/${MAX_PHOTOS_PER_VISIT} ภาพ` : 'ยังไม่มีภาพ';
    preview.innerHTML = state[type].map((item, index) => {
      const url = URL.createObjectURL(item.blob);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return `<div class="relative rounded-lg overflow-hidden border border-slate-200 bg-white"><img src="${url}" class="w-full h-32 object-cover" alt="หลักฐานการเยี่ยม ${index + 1}"><button type="button" class="absolute top-1 right-1 btn btn-sm btn-danger rounded-full" data-remove-evidence="${index}" aria-label="ลบภาพ"><i class="bi bi-x"></i></button></div>`;
    }).join('');
    preview.querySelectorAll('[data-remove-evidence]').forEach(btn => btn.addEventListener('click', () => {
      state[type].splice(Number(btn.dataset.removeEvidence), 1);
      render(type);
    }));
  }

  async function uploadEvidence(type, recordId, patientId) {
    const items = state[type];
    if (!items.length) return [];
    const uploaded = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const path = `${patientId}/${type}/${recordId}/${Date.now()}_${i + 1}.jpg`;
      const { error } = await window.supabaseClient.storage.from(BUCKET).upload(path, item.blob, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        for (const u of uploaded) await window.supabaseClient.storage.from(BUCKET).remove([u.path]);
        throw new Error(`อัปโหลดภาพที่ ${i + 1} ไม่สำเร็จ: ${error.message}`);
      }
      uploaded.push({ path, capturedAt: item.capturedAt, fileName: item.originalName || `visit-${i + 1}.jpg`, size: item.blob.size });
    }
    return uploaded;
  }

  async function waitForRecord(type, recordId, patientId) {
    const table = type === 'OPD' ? 'OPDRecords' : 'SOAPNotes';
    const idColumn = type === 'OPD' ? 'RecordID' : 'SOAPNoteID';
    for (let attempt = 0; attempt < 15; attempt++) {
      const { data, error } = await window.supabaseClient.from(table).select(idColumn).eq(idColumn, recordId).eq('PatientID', patientId).maybeSingle();
      if (!error && data) return true;
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  async function saveMetadata(type, recordId, patientId, uploaded) {
    if (!uploaded.length) return;
    const rows = uploaded.map(item => ({
      VisitType: type,
      VisitRecordID: recordId,
      PatientID: patientId,
      StoragePath: item.path,
      FileName: item.fileName,
      MimeType: 'image/jpeg',
      FileSize: item.size,
      CapturedAt: item.capturedAt,
      CreatedBy: window.supabaseClient.auth.getUser ? undefined : undefined
    }));
    const { data: authData } = await window.supabaseClient.auth.getUser();
    rows.forEach(r => { r.CreatedBy = authData?.user?.id || null; });
    const { error } = await window.supabaseClient.from('VisitEvidence').insert(rows);
    if (error) throw new Error('บันทึกข้อมูลภาพหลักฐานไม่สำเร็จ: ' + error.message);
  }

  function ensureRecordId(type, form) {
    const name = type === 'OPD' ? 'RecordID' : 'SOAPNoteID';
    let id = getId(type, form);
    if (!id) {
      id = `VISIT-${type}-${crypto.randomUUID()}`;
      const input = form.querySelector(`[name="${name}"]`);
      if (input) input.value = id;
    }
    return id;
  }

  async function runSubmit(type, original, callback) {
    const form = getForm(type);
    if (!form) return original(callback);
    const patientId = getPatientId();
    if (!patientId) {
      showError({ message: 'ไม่พบรหัสผู้ป่วยสำหรับแนบภาพหลักฐาน' });
      return;
    }
    const existingId = getId(type, form);
    const recordId = ensureRecordId(type, form);
    if (!existingId && state[type].length === 0) {
      Swal.fire({ icon: 'warning', title: 'ต้องแนบภาพหลักฐาน', text: 'กรุณาถ่ายภาพหลักฐานการเยี่ยมอย่างน้อย 1 ภาพก่อนบันทึก Visit นี้', confirmButtonText: 'รับทราบ' });
      return;
    }

    let uploaded = [];
    try {
      showLoading('กำลังอัปโหลดภาพหลักฐาน...');
      uploaded = await uploadEvidence(type, recordId, patientId);
      await original(callback);
      if (uploaded.length) {
        const saved = await waitForRecord(type, recordId, patientId);
        if (!saved) throw new Error('บันทึก Visit ไม่พบในฐานข้อมูลหลังจากรอ 7.5 วินาที');
        await saveMetadata(type, recordId, patientId, uploaded);
        state[type] = [];
      }
    } catch (error) {
      for (const item of uploaded) await window.supabaseClient.storage.from(BUCKET).remove([item.path]);
      showError({ message: error.message || String(error) });
    }
  }

  function install() {
    const originalOpd = window.handleOpdFormSubmit;
    if (typeof originalOpd === 'function') {
      window.handleOpdFormSubmit = function (callback) { return runSubmit('OPD', originalOpd, callback); };
    }
    const originalSoap = window.handleSoapNoteSubmit;
    if (typeof originalSoap === 'function') {
      window.handleSoapNoteSubmit = function (callback) { return runSubmit('SOAP', originalSoap, callback); };
    }
    const observer = new MutationObserver(() => {
      injectUI(getForm('OPD'), 'OPD');
      injectUI(getForm('SOAP'), 'SOAP');
    });
    observer.observe(document.body, { childList: true, subtree: true });
    injectUI(getForm('OPD'), 'OPD');
    injectUI(getForm('SOAP'), 'SOAP');
    window.visitEvidence = {
      getState: type => state[type] || [],
      list: async (type, recordId) => {
        const { data, error } = await window.supabaseClient.from('VisitEvidence').select('*').eq('VisitType', type).eq('VisitRecordID', recordId).order('CapturedAt', { ascending: true });
        if (error) throw error;
        return data || [];
      },
      signedUrl: async path => {
        const { data, error } = await window.supabaseClient.storage.from(BUCKET).createSignedUrl(path, 300);
        if (error) throw error;
        return data?.signedUrl || '';
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
