/* IMC Plus - Native PDF print engine (no GAS / Google Docs)
 * Uses the clinic's blank A4 master PDF as the immutable background and writes
 * Supabase data on top of it. The master file must be /print-templates-8-forms.pdf.
 */
(() => {
  'use strict';
  const TEMPLATE_URL = './print-templates-8-forms.pdf';
  const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  const FONTKIT_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
  const THAI_FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwght%5D.ttf';
  const A4 = { w: 595.32, h: 841.92 };
  const PAGE = { cover: 0, consent: 1, bi: 2, opd1: 3, opd2: 4, soap: 5, dys: 6, mhq1: 7, mhq2: 8, tmse: 9 };

  let libsPromise;
  async function libs() {
    if (libsPromise) return libsPromise;
    libsPromise = (async () => {
      if (!window.PDFLib) await loadScript(PDFLIB_URL);
      if (!window.fontkit) await loadScript(FONTKIT_URL);
      return window.PDFLib;
    })();
    return libsPromise;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('โหลด PDF engine ไม่สำเร็จ: '+src)); document.head.appendChild(s);
    });
  }
  const val = (o, ...keys) => {
    for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return v; }
    return '';
  };
  const clean = v => v == null ? '' : String(v).trim();
  function thaiDate(v) {
    if (!v) return '';
    const d = new Date(v); if (Number.isNaN(d.getTime())) return clean(v);
    return [String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),String(d.getFullYear()+543)].join('/');
  }
  function thaiDateTime(v) {
    if (!v) return '';
    const d = new Date(v); if (Number.isNaN(d.getTime())) return clean(v);
    return thaiDate(d)+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' น.';
  }
  function age(v) {
    if (!v) return '';
    const d = new Date(v), n = new Date(); if (Number.isNaN(d.getTime())) return '';
    let a=n.getFullYear()-d.getFullYear(); if (n.getMonth()<d.getMonth() || (n.getMonth()===d.getMonth()&&n.getDate()<d.getDate())) a--; return a>=0?a:'';
  }
  function asObj(v){ if(!v)return{}; if(typeof v==='object')return v; try{return JSON.parse(v)||{}}catch(_){return{}} }
  function asArr(v){ if(Array.isArray(v))return v; if(!v)return[]; try{return JSON.parse(v)||[]}catch(_){return String(v).split(',').map(x=>x.trim()).filter(Boolean)} }
  async function one(table,key,id){ const {data,error}=await window.supabaseClient.from(table).select('*').eq(key,id).maybeSingle(); if(error)throw error; return data; }
  async function bundle(type,id){
    const cfg={
      consent:['Consents','ConsentID'],bi:['BIAssessments','AssessmentID'],opd:['OPDRecords','RecordID'],
      soap:['SOAPNotes','SOAPNoteID'],tmse:['TMSE_Records','RecordID'],mhq:['MHQ_Records','RecordID'],dysphagia:['Dysphagia_Records','RecordID']
    }[type];
    if(type==='imccover'){ const p=await one('Patients','PatientID',id); if(!p)throw new Error('ไม่พบผู้ป่วย: '+id); return {p,r:null}; }
    if(!cfg)throw new Error('ไม่รู้จักเอกสาร: '+type);
    const r=await one(cfg[0],cfg[1],id); if(!r)throw new Error('ไม่พบข้อมูล: '+id);
    const p=await one('Patients','PatientID',r.PatientID); if(!p)throw new Error('ไม่พบผู้ป่วย: '+r.PatientID);
    return {p,r};
  }
  function address(p){return clean(val(p,'FullAddress')) || [p.HouseNumber&&('บ้านเลขที่ '+p.HouseNumber),p.Moo&&('หมู่ '+p.Moo),p.Tambon&&('ต.'+p.Tambon),p.Amphoe&&('อ.'+p.Amphoe),p.Province&&('จ.'+p.Province),p.PostalCode].filter(Boolean).join(' ')}
  function data(p,r){return Object.assign({},p||{},r||{},{Age:age(p?.DateOfBirth),Address:address(p),PatientNameFull:val(r,'PatientNameFull')||val(p,'PatientName'),VisitDate:thaiDate(val(r,'VisitDate','AssessmentDate','ConsentDate')),GeoLocationTimestamp:val(r,'GeoLocationTimestamp','GeoTimestamp'),TherapistName:val(r,'TherapistName','ProviderName'),TherapistLicenseNo:val(r,'TherapistLicenseNo','License'),PatientPhotoURL:val(p,'PatientPhotoURL','PatientPhotoUrl')})}
  async function bytes(url){const r=await fetch(url);if(!r.ok)throw new Error('โหลดไฟล์ไม่สำเร็จ: '+url);return new Uint8Array(await r.arrayBuffer())}
  async function makeDoc(){const PDFLib=await libs();const pdf=await PDFLib.PDFDocument.load(await bytes(TEMPLATE_URL));pdf.registerFontkit(window.fontkit);const font=await pdf.embedFont(await bytes(THAI_FONT_URL),{subset:true});return {pdf,font,PDFLib}}
  function Y(y){return A4.h-y}
  function txt(page,font,s,x,y,size=8,maxWidth){s=clean(s);if(!s)return;page.drawText(s,{x,y:Y(y)-size*0.82,size,font,maxWidth,lineHeight:size*1.15});}
  function line(page,x1,y1,x2,y2){page.drawLine({start:{x:x1,y:Y(y1)},end:{x:x2,y:Y(y2)},thickness:0.8})}
  function check(page,x,y,on,size=8){if(!on)return;line(page,x,y+size*0.75,x+size*0.8,y);line(page,x+size*0.8,y,x+size*2.0,y+size*1.25)}
  function yes(v){return v===true||v==='true'||v==='YES'||v==='Yes'||v===1||v==='1'}
  function save(pdf,name){return pdf.save().then(b=>{const u=URL.createObjectURL(new Blob([b],{type:'application/pdf'}));const a=document.createElement('a');a.href=u;a.download=name+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);return b})}

  function cover(pdf,font,d,p){const q=pdf.getPage(PAGE.cover);txt(q,font,val(p,'TreatmentRightsDisplay','TreatmentRights'),95,223);txt(q,font,val(p,'NationalID','CID','PersonalID'),230,223);txt(q,font,val(p,'ClinicNumber','ClinicNo','HN'),450,223);txt(q,font,val(p,'PatientName'),95,297);txt(q,font,address(p),314,297,7,230);txt(q,font,val(p,'Sex'),95,370);txt(q,font,val(p,'MaritalStatus','MarryStatus'),162,370);txt(q,font,thaiDate(p.DateOfBirth),263,370);txt(q,font,clean(d.Age),450,370);txt(q,font,val(p,'Weight'),95,443);txt(q,font,val(p,'Height'),162,443);txt(q,font,val(p,'Contraindication','Contraindications','Precautions'),230,443,7,185);txt(q,font,val(p,'CaregiverName','AttendantName'),95,516);txt(q,font,val(p,'CaregiverRelationship'),314,516);txt(q,font,val(p,'CaregiverPhone','Phone'),430,516);const dx=val(p,'IMCDx','Diagnosis');[['Stroke',94,584],['Hemorrhage',176,584],['Ischemic',244,584],['TBI',321,584],['Fx.HIP',390,584],['SCI',454,584]].forEach(([k,x,y])=>check(q,x,y,String(dx).includes(k)));txt(q,font,val(p,'ICD10','ICD_10'),324,584);txt(q,font,thaiDate(p.AdmitDate),371,617);txt(q,font,val(p,'BIScore','BI','TotalScore'),333,649);txt(q,font,thaiDate(p.DischargeDate),371,649);txt(q,font,thaiDate(p.DueDate),371,682);txt(q,font,val(p,'TherapistName','PhysioTherapyName'),95,714);txt(q,font,val(p,'TherapistLicenseNo','License'),210,753,7);return q}

  function consent(pdf,font,d,p){const q=pdf.getPage(PAGE.consent);txt(q,font,val(p,'PatientName'),180,69);txt(q,font,clean(d.Age),300,69);txt(q,font,val(p,'ConsenterNationalID','NationalID'),390,69);txt(q,font,address(p),75,112,7,445);check(q,166,306,val(d,'ConsenterType')==='Patient');check(q,260,306,val(d,'ConsenterType')==='Caregiver');txt(q,font,val(d,'ConsenterName'),190,340,8,150);txt(q,font,val(d,'WitnessName'),365,340,8,120);txt(q,font,thaiDate(d.ConsentDate||d.VisitDate),205,372);txt(q,font,thaiDate(d.ConsentDate||d.VisitDate),410,372);return q}

  function bi(pdf,font,d,p){const q=pdf.getPage(PAGE.bi);txt(q,font,val(p,'PatientName'),160,20);txt(q,font,thaiDate(d.AssessmentDate),420,20);const scores=[];for(let i=1;i<=10;i++)scores.push(Number(val(d,'q'+i,'Q'+i)));const xs=[[86,110,160],[86,170,220],[86,235,285],[86,330,385],[86,380,435],[86,475,525]];scores.forEach((s,i)=>{const yy=[106,184,242,329,390,475,550,610,675,735][i]||106; const options= i===0?[0,1,2]:i===1?[0,1,2]:i===2?[0,1,2,3]:[0,1,2]; options.forEach((o,j)=>check(q,400+j*28,yy,s===o));});txt(q,font,val(d,'TotalScore','BIScore','score'),510,104,9);return q}

  function opd(pdf,font,d,p){const q=pdf.getPage(PAGE.opd1);txt(q,font,thaiDate(d.VisitDate),90,26);txt(q,font,val(d,'StartTime','TreatmentStartTime'),170,26);txt(q,font,val(d,'EndTime','TreatmentEndTime'),270,26);txt(q,font,val(p,'PatientName'),365,54,8,150);txt(q,font,val(d,'VisitNumber','VisitNo'),510,54);txt(q,font,val(d,'Temperature','BT'),110,48);txt(q,font,val(d,'RespiratoryRate','RR'),205,48);txt(q,font,val(d,'SpO2'),300,48);txt(q,font,val(d,'BloodPressure','BP'),110,75);txt(q,font,val(d,'Pulse'),255,75);txt(q,font,d.GeoLocationTimestamp?thaiDateTime(d.GeoLocationTimestamp):'',272,124,7,290);const dx=String(val(d,'Diagnosis','DiagnosisJSON'));[['Stroke',70,151],['Fx.HIP',122,151],['SCI',170,151],['TBI',210,151]].forEach(([k,x,y])=>check(q,x,y,dx.includes(k)));txt(q,font,val(d,'ChiefComplaint'),18,184,7,225);txt(q,font,val(d,'UnderlyingDisease','U_D'),18,198,7,225);txt(q,font,val(d,'HistoryOfPresentIllness','PH_PI'),18,211,7,225);txt(q,font,val(d,'BIScore','BarthelScore'),120,235);const fx=String(val(d,'FxHIP_Status'));[['NWB',50,267],['PWB',95,267],['FWB',150,267],['W/C',200,267],['Bed rest',250,267]].forEach(([k,x,y])=>check(q,x,y,fx.includes(k)));txt(q,font,val(d,'FxHIP_PWB_Percent'),125,267);const loc=String(val(d,'LevelOfConsciousness'));['Alert','Drowsiness','Confuse','Stupor','Semi-coma','Coma'].forEach((k,i)=>check(q,40+(i%2)*45,350+Math.floor(i/2)*21,loc.includes(k)));const comm=String(val(d,'Communication'));['Normal','Dysarthria','Aphasia'].forEach((k,i)=>check(q,150+i*42,350,comm===k));txt(q,font,val(d,'GaitAnalysis'),272,630,7,270);txt(q,font,val(d,'QM_UE_Rt'),300,667);txt(q,font,val(d,'QM_UE_Lt'),410,667);txt(q,font,val(d,'QM_LE_Rt'),300,684);txt(q,font,val(d,'QM_LE_Lt'),410,684);return q}
  function opd2(pdf,font,d,p){const q=pdf.getPage(PAGE.opd2);const pl=String(val(d,'ProblemList'));[['Weakness',40],['Poor balance',140],['Poor ambulation',240],['Abnormal m. length/tone',380],['Risk of complication',500]].forEach(([k,x])=>check(q,x,31,pl.includes(k)));const rows=[['QualityMove','Treat_QualityMove_Details'],['BedMobility','Treat_BedMobility_Details'],['Balance','Treat_Balance_Details'],['Gait','Treat_Gait_Details'],['Other','Treat_Other_Details']];rows.forEach((r,i)=>txt(q,font,val(d,r[1],r[0]),260,57+i*22,7,225));txt(q,font,val(d,'Plan','PlanOfTreatment'),15,180,7,550);txt(q,font,val(d,'TherapistName'),95,250,8,150);txt(q,font,val(d,'TherapistLicenseNo'),125,262,7);txt(q,font,val(d,'PatientNameFull','PatientName'),390,232,7,160);return q}

  function soap(pdf,font,d,p){const q=pdf.getPage(PAGE.soap);txt(q,font,thaiDate(d.VisitDate),90,87);txt(q,font,val(d,'StartTime'),165,87);txt(q,font,val(d,'EndTime'),260,87);txt(q,font,val(p,'PatientName'),380,111,8,170);txt(q,font,val(d,'VisitNumber','VisitNo'),520,111);txt(q,font,val(d,'Temperature','BT'),110,111);txt(q,font,val(d,'RespiratoryRate','RR'),205,111);txt(q,font,val(d,'SpO2'),300,111);txt(q,font,val(d,'BloodPressure','BP'),110,136);txt(q,font,val(d,'Pulse'),255,136);txt(q,font,d.GeoLocationTimestamp?thaiDateTime(d.GeoLocationTimestamp):'',263,180,7,250);const dx=String(val(d,'Diagnosis','DiagnosisJSON'));[['Stroke',60,212],['Fx.HIP',115,212],['SCI',170,212],['TBI',215,212]].forEach(([k,x,y])=>check(q,x,y,dx.includes(k)));txt(q,font,val(d,'Subjective'),80,240,7,180);txt(q,font,val(d,'Objective'),80,255,7,180);txt(q,font,val(d,'Analysis'),20,378,7,230);[['Treat_QualityMove_Details',420],['Treat_BedMobility_Details',441],['Treat_Balance_Details',462],['Treat_Gait_Details',483],['Treat_Other_Details',504]].forEach(([k,y])=>txt(q,font,val(d,k),120,y,7,360));txt(q,font,val(d,'Plan','PlanOfTreatment'),20,592,7,530);txt(q,font,val(d,'TherapistName'),92,756,8,150);txt(q,font,val(d,'TherapistLicenseNo'),125,777,7);txt(q,font,val(d,'PatientNameFull','PatientName'),380,757,7,160);return q}

  function dys(pdf,font,d,p){const q=pdf.getPage(PAGE.dys);txt(q,font,thaiDate(d.AssessmentDate),95,74);txt(q,font,val(p,'PatientName'),110,98,8,260);txt(q,font,clean(d.Age),390,98);const g1=asObj(d.Group1||d.group1);[0,1,2].forEach((i)=>{const a=val(d,'G1Q'+(i+1),'group1_q'+(i+1));check(q,350,158+i*30,a==='YES'||a===true);check(q,390,158+i*30,a==='NO'||a===false)});for(let i=1;i<=7;i++){const y=404+(i-1)*59;const a=val(d,'Q'+i,'q'+i);check(q,235,y,a==='YES'||a===true);check(q,275,y,a==='NO'||a===false)};txt(q,font,val(d,'Result','ResultStatus'),370,780,7,160);return q}

  function mhq(pdf,font,d,p){const q=pdf.getPage(PAGE.mhq1);txt(q,font,thaiDate(d.AssessmentDate),95,57);txt(q,font,val(p,'PatientName'),110,80,8,260);txt(q,font,clean(d.Age),390,80);for(let i=1;i<=2;i++){const a=val(d,'Q2_'+i,'q2_'+i,'Q'+i);check(q,440,168+(i-1)*31,a==='YES'||a===true);check(q,490,168+(i-1)*31,a==='NO'||a===false)};for(let i=1;i<=9;i++){const s=Number(val(d,'Q9_'+i,'q9_'+i,'Q9Q'+i));for(let j=0;j<4;j++)check(q,355+j*52,387+(i-1)*23,s===j)};txt(q,font,val(d,'score_9q','Score9Q','Total9Q'),195,627,9);const q2=pdf.getPage(PAGE.mhq2);for(let i=1;i<=8;i++){const a=val(d,'Q8_'+i,'q8_'+i,'Q8Q'+i);check(q2,485,115+(i-1)*34,a==='NO'||a===false);check(q2,515,115+(i-1)*34,a==='YES'||a===true)};txt(q2,font,val(d,'score_8q','Score8Q','Total8Q'),420,483,9);return q2}

  function tmse(pdf,font,d,p){const q=pdf.getPage(PAGE.tmse);txt(q,font,thaiDate(d.AssessmentDate),300,29);txt(q,font,val(p,'PatientName'),395,29,8,140);txt(q,font,clean(d.Age),545,29);const groups=[['orientation',105],['registration',234],['attention',310],['calculation',425],['language',505],['recall',748]];groups.forEach(([g,y])=>txt(q,font,val(d,'score_'+g,'Score_'+g,g),542,y,8));txt(q,font,val(d,'total_score','TotalScore','Total'),460,817,9);return q}

  async function render(type,id){
    if(!window.supabaseClient)throw new Error('Supabase client ยังไม่พร้อม');
    const {p,r}=await bundle(type,id);const d=data(p,r);const {pdf,font}=await makeDoc();
    if(type==='imccover')cover(pdf,font,d,p);
    else if(type==='consent')consent(pdf,font,d,p);
    else if(type==='bi')bi(pdf,font,d,p);
    else if(type==='opd'){opd(pdf,font,d,p);opd2(pdf,font,d,p)}
    else if(type==='soap')soap(pdf,font,d,p);
    else if(type==='dysphagia')dys(pdf,font,d,p);
    else if(type==='mhq')mhq(pdf,font,d,p);
    else if(type==='tmse')tmse(pdf,font,d,p);
    const name={imccover:'IMC-Cover',consent:'Consent',bi:'BI-Assessment',opd:'OPD-Card',soap:'SOAP-Note',dysphagia:'Dysphagia',mhq:'MHQ',tmse:'TMSE'}[type]||type;
    await save(pdf,name+'-'+(val(p,'PatientID','ClinicNumber','HN')||id));
  }
  window.IMCPrintEngine={render,templateUrl:TEMPLATE_URL};
  window.generateIMCCoverPdf=id=>render('imccover',id);
  window.generateConsentPdf=id=>render('consent',id);
  window.generateBIPdf=id=>render('bi',id);
  window.generateOpdPdf=id=>render('opd',id);
  window.generateSOAPPdf=id=>render('soap',id);
  window.generateTMSEPdf=id=>render('tmse',id);
  window.generateMHQPdf=id=>render('mhq',id);
  window.generateDysphagiaPdf=id=>render('dysphagia',id);
})();