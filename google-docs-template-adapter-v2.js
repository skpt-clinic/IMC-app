// ============================================================================
// IMC Plus - Google Docs Template Adapter v2
// Supabase clinical data -> GAS Bridge -> Google Docs Template -> PDF
// ============================================================================

(() => {
  'use strict';

  const TEMPLATES = {
    IMCCover: '1cImx394ZD2zh-H6Szn8G_ED46MlvfF3wvp9D5oaze3s',
    SOAP: '1q_DBudqfmr_C8eiPjz5WdXb4QTdKrT6RPf-uJQYkxKU',
    OPD: '1L7QGkwA-8KiMjHVmQjCqE3rWZ2hlxWuJ_CkgReqlAWs',
    BI: '19dcvgpwgFUbJFeDNRXSSYC_O0oIQg8G9_xtfbI5xgKI',
    Consent: '1mXw6MdoAz0NMdZ2o51jlrGhe3i3uGQm5i8vCZ7Z4Z0',
    TMSE: '1SYy3_6R75qrlPuhSRfLTAo4k81WEQJiG-gah9ZyX7Ks',
    Dysphagia: '1C_Ul9KUU_iqBcYVCV7JTrHO_DCL_YXAbdcJS1OqZesI',
    MHQ: '1hVK9JiJHpN2EbBW9AoRwLWgDVHKRpAJOl8PvflDBuys'
  };

  const TYPE_CONFIG = {
    opd: { table: 'OPDRecords', id: 'RecordID', template: 'OPD', name: 'OPD-Card' },
    soap: { table: 'SOAPNotes', id: 'SOAPNoteID', template: 'SOAP', name: 'SOAP-Note' },
    bi: { table: 'BIAssessments', id: 'AssessmentID', template: 'BI', name: 'BI-Assessment' },
    consent: { table: 'Consents', id: 'ConsentID', template: 'Consent', name: 'Consent-Form' },
    tmse: { table: 'TMSE_Records', id: 'RecordID', template: 'TMSE', name: 'TMSE' },
    dysphagia: { table: 'Dysphagia_Records', id: 'RecordID', template: 'Dysphagia', name: 'Dysphagia' },
    mhq: { table: 'MHQ_Records', id: 'RecordID', template: 'MHQ', name: 'Mental-Health' }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function getClient() {
    const c = window.supabaseClient;
    if (!c) throw new Error('Supabase client ยังไม่พร้อม');
    return c;
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    return v;
  }

  function asObject(v, fallback = {}) {
    if (!v) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_) { return fallback; }
  }

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    try { return JSON.parse(v); } catch (_) { return String(v).split(',').map(s => s.trim()).filter(Boolean); }
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

  function time(v) {
    if (!v) return '';
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(v);
  }

  function address(p) {
    return p.FullAddress || [p.HouseNumber && `บ้านเลขที่ ${p.HouseNumber}`, p.Moo && `หมู่ ${p.Moo}`, p.Tambon && `ต.${p.Tambon}`, p.Amphoe && `อ.${p.Amphoe}`, p.Province && `จ.${p.Province}`, p.PostalCode].filter(Boolean).join(' ');
  }

  async function one(table, key, value) {
    const { data, error } = await getClient().from(table).select('*').eq(key, value).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function patient(id) {
    return one('Patients', 'PatientID', id);
  }

  function baseData(p, r) {
    const d = { ...(p || {}), ...(r || {}) };
    d.Age = d.Age || age(p?.DateOfBirth);
    d.DateOfBirth = thaiDate(p?.DateOfBirth);
    d.AdmitDate = thaiDate(p?.AdmitDate);
    d.DischargeDate = thaiDate(p?.DischargeDate);
    d.DueDate = thaiDate(p?.DueDate);
    d.Address = address(p || {});
    d.VisitDate = thaiDate(r?.VisitDate || r?.AssessmentDate || r?.ConsentDate);
    d.AssessmentDate = thaiDate(r?.AssessmentDate);
    d.ConsentDate = thaiDate(r?.ConsentDate);
    d.StartTime = time(r?.StartTime);
    d.EndTime = time(r?.EndTime);
    d['Caregiver Relationship'] = p?.CaregiverRelationship || '';
    d['ชื่อผู้ป่วย'] = p?.PatientName || '';
    d.PatientNameFull = r?.PatientNameFull || p?.PatientName || '';
    d.TreatmentRightsDisplay = r?.TreatmentRightsDisplay || p?.TreatmentRightsOther || p?.TreatmentRights || '';
    return d;
  }

  function checkbox(d, key, condition) { d[key] = !!condition; }

  function enrichOPD(d) {
    const dx = String(d.Diagnosis || '');
    ['Stroke', 'Fx.HIP', 'SCI', 'TBI'].forEach(x => checkbox(d, `Dx_${x.replace('.', '')}`, dx.includes(x)));
    const fx = String(d.FxHIP_Status || '');
    checkbox(d, 'Fx_NWB', fx === 'NWB');
    checkbox(d, 'Fx_PWB', fx === 'PWB');
    checkbox(d, 'Fx_FWB', fx === 'FWB');
    checkbox(d, 'Fx_WC', fx === 'W/C' || fx === 'WC');
    checkbox(d, 'Fx_BedRest', fx === 'Bed rest');
    d.Fx_PWB_Percent = fx === 'PWB' ? (d.FxHIP_PWB_Percent || '') : '';

    const loc = String(d.LevelOfConsciousness || '');
    ['Alert','Drowsiness','Confuse','Stupor','Semi-coma','Coma'].forEach(x => checkbox(d, `LOC_${x.replace('-', '')}_Check`, loc.includes(x)));
    const comm = String(d.Communication || ''), aph = String(d.CommunicationAphasiaType || '');
    checkbox(d, 'Comm_Normal_Check', comm === 'Normal');
    checkbox(d, 'Comm_Dysarthria_Check', comm === 'Dysarthria');
    checkbox(d, 'Comm_Aphasia_Check', comm === 'Aphasia');
    ['Global','Motor','Sensory'].forEach(x => checkbox(d, `Comm_Aphasia_${x}_Check`, comm === 'Aphasia' && aph === x));

    const q = asObject(d.QualityMovement); d.QM_UE_Rt = q.UE?.Rt || ''; d.QM_UE_Lt = q.UE?.Lt || ''; d.QM_LE_Rt = q.LE?.Rt || ''; d.QM_LE_Lt = q.LE?.Lt || '';
    const b = asObject(d.Balance); d.Balance_Sitting = b.Sitting || ''; d.Balance_Standing = b.Standing || '';
    const je = asObject(d.JointSensation_UE_Details); const jl = asObject(d.JointSensation_LE_Details);
    d.UE_Rt_Joint = je['Rt. Joint'] || '-'; d.UE_Rt_Sensation = je['Rt. Sensation'] || '-'; d.UE_Lt_Joint = je['Lt. Joint'] || '-'; d.UE_Lt_Sensation = je['Lt. Sensation'] || '-';
    d.LE_Rt_Joint = jl['Rt. Joint'] || '-'; d.LE_Rt_Sensation = jl['Rt. Sensation'] || '-'; d.LE_Lt_Joint = jl['Lt. Joint'] || '-'; d.LE_Lt_Sensation = jl['Lt. Sensation'] || '-';

    const pl = String(d.ProblemList || '');
    [['Weakness','PL_Weakness'],['Poor balance','PL_PoorBalance'],['Poor ambulation','PL_PoorAmbulation'],['Abnormal m. length/tone','PL_AbnormalLengthTone'],['Risk for complication','PL_RiskOfComplication']].forEach(([s,k]) => checkbox(d,k,pl.includes(s)));
    const other = pl.split(',').map(s => s.trim()).find(s => s && !['Weakness','Poor balance','Poor ambulation','Abnormal m. length/tone','Risk for complication'].includes(s));
    d.PL_Other_Check = !!other; d.PL_Other_Details = other || '';

    const t = asObject(d.Treatment_Details);
    ['QualityMove','BedMobility','Balance','Gait','Other','Ambulation'].forEach(k => {
      const x = t[k];
      d[`Treat_${k}_Check`] = !!x && Object.keys(x).length > 0;
      d[`Treat_${k}_Time`] = x?.time || '';
      d[`Treat_${k}_Details`] = Array.isArray(x?.details) ? x.details.join(', ') : (x?.details || '');
    });
    const a = t.Ambulation || {};
    ['NWB','PWB','FWB','WC'].forEach(s => checkbox(d, `Amb_${s}_Check`, a.Status === s));
    d.Amb_PWB_Percent = a.PWB_Percent || '';
    return d;
  }

  function enrichSOAP(d) {
    const dx = asArray(d.DiagnosisJSON);
    ['Stroke','Fx.HIP','SCI','TBI'].forEach(x => checkbox(d, `Dx_${x.replace('.', '')}`, dx.includes(x)));
    const o = asObject(d.ObjectiveJSON);
    const q = o.QualityMovement || {};
    d.QM_UE_Rt = q.UE?.Rt || ''; d.QM_UE_Lt = q.UE?.Lt || ''; d.QM_LE_Rt = q.LE?.Rt || ''; d.QM_LE_Lt = q.LE?.Lt || '';
    d.Objective_QualityMovement_Check = !!o.QualityMovement_Check;
    d.Objective_Other_Check = !!o.Other_Check; d.Objective_Other_Details = o.Other_Details || '';
    const t = asObject(d.TreatmentJSON);
    ['QualityMove','BedMobility','Balance','Gait','Other','Ambulation'].forEach(k => {
      const x=t[k]; d[`Treat_${k}_Check`]=!!x && Object.keys(x).length>0; d[`Treat_${k}_Time`]=x?.time||''; d[`Treat_${k}_Details`]=Array.isArray(x?.details)?x.details.join(', '):(x?.details||'');
    });
    const a=t.Ambulation||{}; ['NWB','PWB','FWB','WC'].forEach(s=>checkbox(d,`Amb_${s}_Check`,a.Status===s)); d.Amb_PWB_Percent=a.PWB_Percent||'';
    const plan=String(d.Plan||''); d.Plan_FU=plan.includes('F/U Program PT ต่อเนื่อง'); d.Plan_OFF=plan.includes('OFF PT Program'); d.Plan_Refer=plan.includes('ส่งต่อ รพ. ดูแลต่อเนื่อง');
    return d;
  }

  function enrichBI(d) {
    for(let i=1;i<=10;i++){const score=Number(d[`q${i}`]); for(let j=0;j<=3;j++) checkbox(d,`q${i}_opt${j}_check`,j===score);}
    ['swallowing','communicate','mobility','cognitive','bowel'].forEach(k=>checkbox(d,`impairment_${k}_check`,d[`impairment_${k}`]===true||d[`impairment_${k}`]==='true'));
    ['bathroom','bed','movement','stairs'].forEach(k=>checkbox(d,`fx_${k}_check`,d[`fx_${k}`]===true||d[`fx_${k}`]==='true'));
    d.Date=thaiDate(d.AssessmentDate); return d;
  }

  function enrichConsent(d) {
    d['ชื่อผู้ให้ความยินยอม']=d.ConsenterName||''; d['อายุ']=d.ConsenterAge||''; d['เลขปชช.ผู้ให้ความยินยอม']=d.ConsenterNationalID||''; d['ที่อยู่']=d.Address||''; d['วันที่']=thaiDate(d.ConsentDate); d['ชื่อ-สกุลผู้ยินยอม']=d.ConsenterName||''; d['ชื่อ-สกุลพยาน']=d.WitnessName||'';
    d['check_ผู้ป่วย']=d.ConsenterType==='Patient'; d['check_ผู้ดูแล']=d.ConsenterType==='Caregiver'; return d;
  }

  function enrichGeneric(d) {
    Object.keys(d).forEach(k=>{
      const v=d[k];
      if(typeof v==='boolean') d[k]=v;
    });
    if(d.total_score!==undefined && d.TotalScore===undefined) d.TotalScore=d.total_score;
    if(d.result_status!==undefined && d.ResultStatus===undefined) d.ResultStatus=d.result_status;
    return d;
  }

  function cleanForBridge(value, seen = new WeakSet()) {
    if (value === undefined || typeof value === 'function') return null;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (seen.has(value)) return null;
      seen.add(value);
      if (Array.isArray(value)) return value.map(v => cleanForBridge(v, seen));
      const out={}; Object.keys(value).forEach(k=>out[k]=cleanForBridge(value[k],seen)); return out;
    }
    return String(value);
  }

  async function buildData(type, recordId) {
    const cfg=TYPE_CONFIG[type]; if(!cfg) throw new Error(`ไม่รู้จักชนิดเอกสาร: ${type}`);
    const r=await one(cfg.table,cfg.id,recordId); if(!r) throw new Error(`ไม่พบข้อมูล ${cfg.id}: ${recordId}`);
    const p=await patient(r.PatientID); if(!p) throw new Error(`ไม่พบผู้ป่วย: ${r.PatientID}`);
    let d=baseData(p,r);
    if(type==='opd') d=enrichOPD(d); else if(type==='soap') d=enrichSOAP(d); else if(type==='bi') d=enrichBI(d); else if(type==='consent') d=enrichConsent(d); else d=enrichGeneric(d);
    // Always expose the image URL fields under the exact placeholder names expected by GAS.
    d.PatientPhotoURL=p.PatientPhotoURL||p.PatientPhotoUrl||'';
    d.BodyChartDrawingUrl=r.BodyChartDrawingUrl||'';
    d.TherapistSignatureUrl=r.TherapistSignatureUrl||'';
    d.PatientSignatureUrl=r.PatientSignatureUrl||'';
    d.ConsenterSignatureUrl=r.ConsenterSignatureUrl||'';
    d.WitnessSignatureUrl=r.WitnessSignatureUrl||'';
    return cleanForBridge(d);
  }

  async function callGAS(templateId, data, name) {
    if(typeof window.generatePdfAsBase64==='function') return window.generatePdfAsBase64(templateId,data,name);
    if(typeof window.gasBridgeCall==='function') return window.gasBridgeCall('generatePdfAsBase64',[templateId,data,name]);
    // Give the bridge a short time to finish attaching after scripts are loaded.
    for(let i=0;i<30;i++){await sleep(100); if(typeof window.generatePdfAsBase64==='function') return window.generatePdfAsBase64(templateId,data,name); if(typeof window.gasBridgeCall==='function') return window.gasBridgeCall('generatePdfAsBase64',[templateId,data,name]);}
    throw new Error('ไม่พบ GAS Bridge สำหรับสร้าง PDF');
  }

  async function generate(type, recordId) {
    try {
      const cfg=TYPE_CONFIG[type];
      const data=await buildData(type,recordId);
      console.info('[IMC PRINT] template=',cfg.template,'templateId=',TEMPLATES[cfg.template],'recordId=',recordId);
      const result=await callGAS(TEMPLATES[cfg.template],data,cfg.name);
      if(!result || result.status!=='success') throw new Error(result?.message || 'GAS ไม่สามารถสร้าง PDF ได้');
      return result;
    } catch(e) {
      console.error('[IMC PRINT]',type,recordId,e);
      throw e;
    }
  }

  function expose(name,type){
    window[name]=async id=>{
      const result=await generate(type,id);
      if(result?.base64){
        const bytes=atob(result.base64); const arr=new Uint8Array(bytes.length); for(let i=0;i<bytes.length;i++) arr[i]=bytes.charCodeAt(i);
        const blob=new Blob([arr],{type:'application/pdf'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=result.fileName||`${type}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
      return result;
    };
  }

  expose('generateIMCCoverPdf','imccover');
  expose('generateConsentPdf','consent');
  expose('generateBIPdf','bi');
  expose('generateOpdPdf','opd');
  expose('generateSOAPPdf','soap');
  expose('generateTMSEPdf','tmse');
  expose('generateMHQPdf','mhq');
  expose('generateDysphagiaPdf','dysphagia');
  window.IMCDocsTemplateAdapter={templates:TEMPLATES,generate};
})();
