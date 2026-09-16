// ============================================================================
// IMC Plus - Google Docs Template Adapter fix
// Fixes IMC Cover generation in adapter-v2.
// ============================================================================
(() => {
  'use strict';

  const IMC_COVER_TEMPLATE_ID = '1cImx394ZD2zh-H6Szn8G_ED46MlvfF3wvp9D5oaze3s';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function client() {
    if (!window.supabaseClient) throw new Error('Supabase client ยังไม่พร้อม');
    return window.supabaseClient;
  }

  function thaiDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
  }

  function age(v) {
    if (!v) return '';
    const d = new Date(v), now = new Date();
    if (Number.isNaN(d.getTime())) return '';
    let n = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) n--;
    return n >= 0 ? n : '';
  }

  function clean(value, seen = new WeakSet()) {
    if (value === undefined || typeof value === 'function') return null;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (seen.has(value)) return null;
      seen.add(value);
      if (Array.isArray(value)) return value.map(v => clean(v, seen));
      const out = {};
      Object.keys(value).forEach(k => out[k] = clean(value[k], seen));
      return out;
    }
    return String(value);
  }

  async function generateIMCCoverPdf(patientId) {
    const { data: p, error } = await client().from('Patients').select('*').eq('PatientID', patientId).maybeSingle();
    if (error) throw error;
    if (!p) throw new Error(`ไม่พบข้อมูลผู้ป่วย: ${patientId}`);

    const data = { ...p };
    data.Age = age(p.DateOfBirth);
    data.DateOfBirth = thaiDate(p.DateOfBirth);
    data.AdmitDate = thaiDate(p.AdmitDate);
    data.DischargeDate = thaiDate(p.DischargeDate);
    data.DueDate = thaiDate(p.DueDate);
    data.Address = p.FullAddress || [
      p.HouseNumber && `บ้านเลขที่ ${p.HouseNumber}`,
      p.Moo && `หมู่ ${p.Moo}`,
      p.Tambon && `ต.${p.Tambon}`,
      p.Amphoe && `อ.${p.Amphoe}`,
      p.Province && `จ.${p.Province}`,
      p.PostalCode
    ].filter(Boolean).join(' ');
    data['Caregiver Relationship'] = p.CaregiverRelationship || '';
    data['ชื่อผู้ป่วย'] = p.PatientName || '';

    ['Stroke', 'TBI', 'Fx.HIP', 'SCI'].forEach(dx => {
      data[`${dx.replace('.', '')}_check`] = p.IMCDx === dx;
    });
    ['Hemorrhage', 'Ischemic'].forEach(type => {
      data[`Stroke_${type}_check`] = p.StrokeType === type;
    });

    data.PatientPhotoURL = p.PatientPhotoURL || p.PatientPhotoUrl || '';

    let result;
    if (typeof window.generatePdfAsBase64 === 'function') {
      result = await window.generatePdfAsBase64(IMC_COVER_TEMPLATE_ID, clean(data), 'IMC-Cover');
    } else if (typeof window.gasBridgeCall === 'function') {
      result = await window.gasBridgeCall('generatePdfAsBase64', [IMC_COVER_TEMPLATE_ID, clean(data), 'IMC-Cover']);
    } else {
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        if (typeof window.generatePdfAsBase64 === 'function') {
          result = await window.generatePdfAsBase64(IMC_COVER_TEMPLATE_ID, clean(data), 'IMC-Cover');
          break;
        }
        if (typeof window.gasBridgeCall === 'function') {
          result = await window.gasBridgeCall('generatePdfAsBase64', [IMC_COVER_TEMPLATE_ID, clean(data), 'IMC-Cover']);
          break;
        }
      }
    }

    if (!result || result.status !== 'success') throw new Error(result?.message || 'GAS ไม่สามารถสร้าง IMC Cover PDF ได้');

    if (result.base64) {
      const bytes = atob(result.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName || 'IMC-Cover.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return result;
  }

  window.generateIMCCoverPdf = generateIMCCoverPdf;
})();
