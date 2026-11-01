/* IMC Plus - Native PDF print engine (no GAS / Google Docs)
 * Uses the clinic's blank A4 master PDF as the immutable background and writes
 * Supabase data on top of it. The master file must be /print-templates-8-forms.pdf.
 */
(() => {
  'use strict';
  const TEMPLATE_URL = './print-templates-8-forms.pdf.pdf';
  const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  const FONTKIT_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
  const THAI_FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwght%5D.ttf';
  const A4 = { w: 595.32, h: 841.92 };
  const PAGE = { cover: 0, consent: 1, bi: 2, opd1: 3, opd2: 4, soap: 5, dys: 6, mhq1: 7, mhq2: 8, tmse: 9 };
  const PAGE_SETS = { imccover:[0], consent:[1], bi:[2], opd:[3,4], soap:[5], dysphagia:[6], mhq:[7,8], tmse:[9] };

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
  function data(p,r){return Object.assign({},p||{},r||{},{Age:age(p?.DateOfBirth),Address:address(p),PatientNameFull:val(r,'PatientNameFull')||val(p,'PatientName'),VisitDate:val(r,'VisitDate','AssessmentDate','ConsentDate'),GeoLocationTimestamp:val(r,'GeoLocationTimestamp','GeoTimestamp'),TherapistName:val(r,'TherapistName','ProviderName'),TherapistLicenseNo:val(r,'TherapistLicenseNo','License'),PatientPhotoURL:val(p,'PatientPhotoURL','PatientPhotoUrl')})}
  async function bytes(url){const r=await fetch(url);if(!r.ok)throw new Error('โหลดไฟล์ไม่สำเร็จ: '+url);return new Uint8Array(await r.arrayBuffer())}
  async function makeDoc(type){const PDFLib=await libs();const master=await PDFLib.PDFDocument.load(await bytes(TEMPLATE_URL));const sourcePages=PAGE_SETS[type];if(!sourcePages)throw new Error('ไม่รู้จักเอกสาร: '+type);const pdf=await PDFLib.PDFDocument.create();const pages=await pdf.copyPages(master,sourcePages);pages.forEach(p=>pdf.addPage(p));pdf.__sourcePages=sourcePages;pdf.registerFontkit(window.fontkit);const font=await pdf.embedFont(await bytes(THAI_FONT_URL),{subset:true});return {pdf,font,PDFLib}}
  function getPage(pdf,sourcePage){const i=pdf.__sourcePages.indexOf(sourcePage);if(i<0)throw new Error('ไม่พบหน้าเอกสารต้นฉบับ: '+sourcePage);return pdf.getPage(i)}
  function clear(page,x,y,w,h){page.drawRectangle({x,y:A4.h-y-h,width:w,height:h,color:window.PDFLib.rgb(1,1,1),borderWidth:0})}
  function Y(y){return A4.h-y}
  function txt(page,font,s,x,y,size=8,maxWidth){s=clean(s);if(!s)return;page.drawText(s,{x,y:Y(y)-size*0.82,size,font,maxWidth,lineHeight:size*1.15});}
  function line(page,x1,y1,x2,y2){page.drawLine({start:{x:x1,y:Y(y1)},end:{x:x2,y:Y(y2)},thickness:0.8})}
  function check(page,x,y,on,size=7){if(!on)return;line(page,x+1,y+size*0.35,x+size*0.65,y+size);line(page,x+size*0.65,y+size,x+size*1.9,y-size*0.15)}
  function yes(v){return v===true||v==='true'||v==='YES'||v==='Yes'||v===1||v==='1'}
  function save(pdf,name){return pdf.save().then(b=>{const u=URL.createObjectURL(new Blob([b],{type:'application/pdf'}));const a=document.createElement('a');a.href=u;a.download=name+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);return {status:'success',fileName:name+'.pdf'}})}
  async function imageBytes(value){
    const s=clean(value);if(!s)return null;
    const comma=s.indexOf(',');
    if(s.startsWith('data:image/')&&comma>0){const mime=s.slice(0,comma).toLowerCase();const bin=atob(s.slice(comma+1));return {bytes:Uint8Array.from(bin,c=>c.charCodeAt(0)),type:mime.includes('png')?'png':'jpg'};}
    const raw=s.replaceAll(' ','').replaceAll(String.fromCharCode(10),'').replaceAll(String.fromCharCode(13),'');
    if(raw.length>100&&Array.from(raw).every(c=>(c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c==='+'||c==='/'||c==='=')){const bin=atob(raw);return {bytes:Uint8Array.from(bin,c=>c.charCodeAt(0)),type:raw.startsWith('iVBOR')?'png':'jpg'};}
    if(s.startsWith('https://')||s.startsWith('http://')){const res=await fetch(s);if(!res.ok)throw new Error('โหลดรูปแนบไม่สำเร็จ');const type=(res.headers.get('content-type')||'').toLowerCase();const data=new Uint8Array(await res.arrayBuffer());return {bytes:data,type:type.includes('png')?'png':'jpg'};}
    return null;
  }
  async function drawImageTop(pdf,page,value,x,y,w,h){
    try{
      const img=await imageBytes(value);if(!img)return;
      const embedded=img.type==='png'?await pdf.embedPng(img.bytes):await pdf.embedJpg(img.bytes);
      const scale=Math.min(w/embedded.width,h/embedded.height),dw=embedded.width*scale,dh=embedded.height*scale;
      page.drawImage(embedded,{x:x+(w-dw)/2,y:A4.h-y-dh+(h-dh)/2,width:dw,height:dh});
    }catch(err){console.warn('[IMCPrintEngine] ข้ามรูปแนบที่อ่านไม่ได้',err);}
  }

  async function cover(pdf,font,d,p){
    const q=getPage(pdf,PAGE.cover);clear(q,65,72,105,34);
    await drawImageTop(pdf,q,val(p,'PatientPhotoURL','PatientPhotoUrl','PatientPhoto'),55,42,124,153);
    txt(q,font,val(p,'TreatmentRightsDisplay','TreatmentRights'),95,237,7,125);
    txt(q,font,val(p,'NationalID','CID','PersonalID'),230,237,8,210);
    txt(q,font,val(p,'ClinicNumber','ClinicNo','HN'),449,237,8,90);
    txt(q,font,val(p,'PatientName'),95,315,8,210);txt(q,font,address(p),314,315,7,220);
    txt(q,font,val(p,'Sex','Gender'),95,388);txt(q,font,val(p,'MaritalStatus','MarryStatus'),162,388);txt(q,font,thaiDate(p.DateOfBirth),263,388);txt(q,font,clean(d.Age),489,388);
    txt(q,font,val(p,'Weight'),95,460);txt(q,font,val(p,'Height'),162,460);txt(q,font,val(p,'Contraindication','Contraindications','Precautions'),230,460,7,185);
    txt(q,font,val(p,'CaregiverName','AttendantName'),95,535,8,210);txt(q,font,val(p,'CaregiverRelationship'),314,535);txt(q,font,val(p,'CaregiverPhone','Phone'),430,535);
    const dx=String(val(p,'IMCDx','Diagnosis'));[['Stroke',94,602],['Hemorrhage',160,602],['Ischemic',240,602],['TBI',94,618],['Fx.HIP',94,633],['SCI',94,646]].forEach(([k,x,y])=>check(q,x,y,dx.includes(k)));
    txt(q,font,val(p,'ICD10','ICD_10'),324,602);txt(q,font,thaiDate(p.AdmitDate),371,625);txt(q,font,val(p,'BIScore','BI','TotalScore'),333,650);txt(q,font,thaiDate(p.DischargeDate),371,655);txt(q,font,thaiDate(p.DueDate),371,682);
    txt(q,font,val(p,'TherapistName','PhysioTherapyName'),122,729,8,180);txt(q,font,val(p,'TherapistLicenseNo','License'),210,752,7);return q;
  }
  async function consent(pdf,font,d,p){
    const q=getPage(pdf,PAGE.consent);clear(q,185,326,250,14);clear(q,170,340,90,14);clear(q,344,340,90,14);clear(q,202,362,220,16);
    txt(q,font,val(p,'PatientName'),155,65,9,250);txt(q,font,clean(d.Age),392,86);txt(q,font,val(d,'ConsenterNationalID','NationalID'),230,108,8,240);txt(q,font,address(p),75,129,8,445);
    check(q,190,306,val(d,'ConsenterType')==='Patient');check(q,230,306,val(d,'ConsenterType')==='Caregiver');
    await drawImageTop(pdf,q,val(d,'ConsenterSignatureBase64','ConsenterSignatureUrl'),185,318,100,24);await drawImageTop(pdf,q,val(d,'WitnessSignatureBase64','WitnessSignatureUrl'),365,318,100,24);
    txt(q,font,'('+val(d,'ConsenterName')+')',172,342,8,150);txt(q,font,'('+val(d,'WitnessName')+')',344,342,8,120);txt(q,font,thaiDate(d.ConsentDate||d.VisitDate),209,366);txt(q,font,thaiDate(d.ConsentDate||d.VisitDate),376,366);return q;
  }
  function bi(pdf,font,d,p){
    const q=getPage(pdf,PAGE.bi);txt(q,font,val(p,'PatientName'),95,52,8,200);txt(q,font,thaiDate(d.AssessmentDate),342,52);
    const xy=[[[48,93],[48,109],[50,125]],[[48,170],[48,186]],[[48,230],[48,246],[48,262],[48,278]],[[48,322],[148,322],[48,339]],[[48,383],[48,399],[48,415],[48,431]],[[48,475],[48,491],[48,507]],[[48,552],[140,552],[48,568]],[[48,612],[160,612]],[[48,656],[48,672],[227,672]],[[48,716],[48,732],[213,732]]];
    for(let i=0;i<10;i++){const score=Number(val(d,'q'+(i+1),'Q'+(i+1)));xy[i].forEach((pt,j)=>check(q,pt[0],pt[1],score===j));}
    txt(q,font,val(d,'TotalScore','BIScore','score'),510,113,9);return q;
  }
  async function opd(pdf,font,d,p){
    const q=getPage(pdf,PAGE.opd1);clear(q,140,220,125,155);await drawImageTop(pdf,q,val(d,'BodyChartDrawingBase64','BodyChartDrawingUrl','BodyChartUrl'),145,225,110,130);
    txt(q,font,thaiDate(d.VisitDate),113,22,8);txt(q,font,val(d,'StartTime','TreatmentStartTime'),215,22);txt(q,font,val(d,'EndTime','TreatmentEndTime'),370,22);txt(q,font,val(d,'PatientNameFull')||val(p,'PatientName'),370,49,8,140);txt(q,font,val(d,'VisitCount','VisitNumber','VisitNo'),545,49);
    txt(q,font,val(d,'Temperature','BT'),116,49);txt(q,font,val(d,'RespiratoryRate','RR'),184,49);txt(q,font,val(d,'SpO2'),251,49);txt(q,font,val(d,'BloodPressure','BP'),126,75);txt(q,font,val(d,'Pulse'),263,75);clear(q,270,114,120,15);txt(q,font,d.GeoLocationTimestamp?thaiDateTime(d.GeoLocationTimestamp):'',272,116,7,290);
    const dx=asArr(val(d,'Diagnosis','DiagnosisJSON'));[['Stroke',72],['Fx.HIP',109],['SCI',146],['TBI',173]].forEach(([k,x])=>check(q,x,148,dx.some(v=>String(v).includes(k))));
    txt(q,font,val(d,'ChiefComplaint'),68,160,7,195);txt(q,font,val(d,'UnderlyingDisease','U_D','UD'),68,172,7,195);txt(q,font,val(d,'HistoryOfPresentIllness','PH_PI','PHPI'),68,184,7,195);txt(q,font,val(d,'MedicalTreatment'),120,192,7,140);txt(q,font,val(d,'BarthelIndex','BIScore','BarthelScore'),75,225,8);
    const fx=String(val(d,'FxHIP_Status')).toUpperCase();[['NWB',266],['PWB',276],['FWB',287],['W/C',297],['Bed rest',308]].forEach(([k,y])=>check(q,18,y,fx.includes(k)));txt(q,font,val(d,'FxHIP_PWB_Percent'),75,276,7);
    const loc=String(val(d,'LevelOfConsciousness'));['Alert','Drowsiness','Confuse','Stupor','Semi-coma','Coma'].forEach((k,i)=>check(q,39,338+i*11,loc.toLowerCase().includes(k.toLowerCase())));const comm=String(val(d,'Communication'));['Normal','Dysarthria','Aphasia'].forEach((k,i)=>check(q,150,338+i*11,comm===k));const equipment=String(val(d,'Equipment')).toLowerCase();[['Foley',83,412],['NG Tube',140,412],['Tracheostomy',67,423],['Other',67,433]].forEach(([k,x,y])=>check(q,x,y,equipment.includes(String(k).toLowerCase())));txt(q,font,val(d,'EquipmentOther'),99,433,7,210);const special=String(val(d,'SpecialAssessments','SpecialAssessment'));[['MRI',19,460],['CT',52,460],['X-ray',99,460]].forEach(([k,x,y])=>check(q,x,y,special.includes(k)||yes(d['PE_'+k])));check(q,359,443,yes(val(d,'HF_Side_RT','HandFunctionRt')));check(q,401,443,yes(val(d,'HF_Side_LT','HandFunctionLt')));
    const gm=asObj(d.GrossMotorFunction);const gmRows=['MoveUp','MoveDown','MoveRight','MoveLeft','SubSideLying','SideLyingSit','SitStand'];const gmGrades=['Independent','Continuous','Minimal','Moderate','Maximum','Dependent'];const gridX=[379,411,438,468,502,535];gmRows.forEach((key,i)=>{const v=val(gm,key,'GM_'+key);const n=typeof v==='number'?v:gmGrades.findIndex(g=>String(v).toLowerCase()===g.toLowerCase());if(n>=0)gridX.forEach((x,j)=>check(q,x,[192,213,235,256,277,299,320][i],n===j));});
    const hand=asObj(d.HandFunction),balance=asObj(d.BalanceGrid),grades=['Zero','Poor','Fair','Good','Normal'];const handKeys=['Reaching','GraspRelease','PassObj','ThumbOpp','PinchGrasp'];handKeys.forEach((key,i)=>{const v=val(hand,key,'HF_'+key);const n=grades.findIndex(g=>String(v).toLowerCase()===g.toLowerCase());if(n>=0)[409,437,468,500,534].forEach((x,j)=>check(q,x,[369,391,412,433,455][i],n===j));});[['SitStatic',512],['SitDynamic',534],['StandStatic',564],['StandDynamic',594]].forEach(([key,y])=>{const v=val(balance,key,'Bal_'+key);const n=grades.findIndex(g=>String(v).toLowerCase()===g.toLowerCase());if(n>=0)[409,437,468,500,534].forEach((x,j)=>check(q,x,y,n===j));});
    const gait=asObj(d.GaitAnalysis_Details),qm=asObj(d.QualityMovement),jointUE=asObj(d.JointSensation_UE_Details),jointLE=asObj(d.JointSensation_LE_Details);const gaitText=Object.entries(gait).map(([k,v])=>`${k}: ${v}`).join(', ');txt(q,font,gaitText,315,621,7,250);txt(q,font,val(qm.UE||{},'Rt'),355,663);txt(q,font,val(qm.UE||{},'Lt'),460,663);txt(q,font,val(qm.LE||{},'Rt'),355,680);txt(q,font,val(qm.LE||{},'Lt'),460,680);txt(q,font,val(jointUE,'Rt. Joint'),390,718);txt(q,font,val(jointUE,'Lt. Joint'),510,718);txt(q,font,val(jointLE,'Rt. Joint'),390,735);txt(q,font,val(jointLE,'Lt. Joint'),510,735);txt(q,font,val(d,'PROM'),92,751,7,420);txt(q,font,val(d,'Length'),92,763,7,420);txt(q,font,val(d,'Tone'),92,775,7,420);txt(q,font,val(d,'OtherPhysical'),120,787,7,300);return q;
  }
  async function opd2(pdf,font,d,p){
    const q=getPage(pdf,PAGE.opd2);clear(q,90,220,145,37);clear(q,380,220,120,28);await drawImageTop(pdf,q,val(d,'TherapistSignatureBase64','TherapistSignatureUrl'),105,206,105,28);await drawImageTop(pdf,q,val(d,'PatientSignatureBase64','PatientSignatureUrl'),390,206,105,28);
    const pl=String(val(d,'ProblemList'));[['Weakness',36],['Poor balance',47],['Poor ambulation',59],['Abnormal m. length/tone',71],['Risk of complication',83]].forEach(([k,y])=>check(q,12,y,pl.includes(k)));txt(q,font,val(d,'GoalsOfTreatment'),112,117,7,120);
    const det=asObj(d.Treatment_Details);const rows=[['QualityMove','Treat_QualityMove_Details',52],['BedMobility','Treat_BedMobility_Details',71],['Balance','Treat_Balance_Details',94],['Gait','Treat_Gait_Details',117],['Other','Treat_Other_Details',139]];rows.forEach(([key,alt,y])=>{const item=det[key]||{};const selected=Array.isArray(item.details)?item.details.length>0:!!item.details;check(q,318,y,selected||!!d[alt]);clear(q,327,y-2,205,18);const details=Array.isArray(item.details)?item.details.join(', '):(item.details||d[alt]||'');txt(q,font,clean(details),328,y,7,205);if(item.time)txt(q,font,item.time,472,y,7,40);});clear(q,88,164,350,20);txt(q,font,val(d,'Plan','PlanOfTreatment','PlanOfTherapy'),175,167,7,340);
    txt(q,font,val(d,'TherapistName'),110,232,8,145);txt(q,font,val(d,'TherapistLicenseNo'),96,243,7,145);txt(q,font,val(d,'PatientNameFull','PatientName'),390,232,7,160);return q;
  }
  async function soap(pdf,font,d,p){
    const q=getPage(pdf,PAGE.soap);clear(q,88,733,150,40);clear(q,380,736,130,22);await drawImageTop(pdf,q,val(d,'TherapistSignatureBase64','TherapistSignatureUrl'),100,714,135,30);await drawImageTop(pdf,q,val(d,'PatientSignatureBase64','PatientSignatureUrl'),385,714,135,30);
    const obj=asObj(d.ObjectiveJSON);txt(q,font,thaiDate(d.VisitDate),112,81,8);txt(q,font,val(d,'StartTime'),215,81);txt(q,font,val(d,'EndTime'),360,81);txt(q,font,val(d,'PatientNameFull')||val(p,'PatientName'),380,106,8,150);txt(q,font,val(d,'VisitCount','VisitNumber','VisitNo'),545,106);txt(q,font,val(d,'Temperature','BT'),117,106);txt(q,font,val(d,'RespiratoryRate','RR'),185,106);txt(q,font,val(d,'SpO2'),260,106);txt(q,font,val(d,'BloodPressure','BP'),126,131);txt(q,font,val(d,'Pulse'),269,131);clear(q,263,170,130,16);txt(q,font,d.GeoLocationTimestamp?thaiDateTime(d.GeoLocationTimestamp):'',263,172,7,250);
    const dx=asArr(val(d,'Diagnosis','DiagnosisJSON'));[['Stroke',62],['Fx.HIP',99],['SCI',136],['TBI',163]].forEach(([k,x])=>check(q,x,207,dx.some(v=>String(v).includes(k))));txt(q,font,val(d,'Subjective'),63,215,7,190);const objective=val(d,'Objective')||((obj.QualityMovement_Check||obj.Other_Check)?[obj.QualityMovement?.UE?.Rt,obj.QualityMovement?.UE?.Lt,obj.QualityMovement?.LE?.Rt,obj.QualityMovement?.LE?.Lt,obj.Other_Details].filter(Boolean).join(' '):'');txt(q,font,objective,63,241,7,190);clear(q,20,370,270,16);txt(q,font,val(d,'Analysis'),25,371,7,520);
    const treat=asObj(d.TreatmentJSON||d.Treatment_Details);const keys=[['QualityMove','Treat_QualityMove_Details',414],['BedMobility','Treat_BedMobility_Details',435],['Balance','Treat_Balance_Details',456],['Gait','Treat_Gait_Details',477],['Other','Treat_Other_Details',498]];keys.forEach(([k,f,y])=>{const item=treat[k]||{};const other=k==='Other';check(q,17,y,!!(item.details||d[f]));clear(q,other?45:110,y-2,other?210:145,17);txt(q,font,clean(item.details||d[f]),other?49:112,y,7,other?205:140);if(item.time)txt(q,font,item.time,211,y,7,35);});
    const plan=String(val(d,'Plan','PlanOfTreatment'));[['F/U Program PT ต่อเนื่อง',596],['OFF PT Program',608],['ส่งต่อ รพ. ดูแลต่อเนื่อง',619]].forEach(([k,y])=>check(q,12,y,plan.includes(k)));clear(q,10,628,330,17);txt(q,font,val(d,'OtherPlan','PlanOther'),108,631,7,260);txt(q,font,val(d,'TherapistName'),105,748,8,145);txt(q,font,val(d,'TherapistLicenseNo'),92,760,7,145);txt(q,font,val(d,'PatientNameFull','PatientName'),385,748,7,160);return q;
  }
  function dys(pdf,font,d,p){
    const q=getPage(pdf,PAGE.dys);txt(q,font,thaiDate(d.AssessmentDate||d.VisitDate),120,68,8);txt(q,font,val(p,'PatientName'),155,91,8,260);txt(q,font,clean(d.Age),445,91);
    for(let i=1;i<=3;i++){const a=String(val(d,'q1_'+i,'Q1_'+i,'G1Q'+i)).toUpperCase();check(q,278,158+(i-1)*30,a==='YES');check(q,313,158+(i-1)*30,a==='NO');}
    const ys=[401,431,461,519,578,636,695];for(let i=1;i<=7;i++){const a=String(val(d,'q2_'+i,'Q2_'+i,'Q'+i)).toUpperCase();check(q,154,ys[i-1],a==='YES');check(q,196,ys[i-1],a==='NO');}
    const g1=String(val(d,'result_group1','ResultGroup1')).toUpperCase();check(q,356,126,g1==='FAIL'||g1==='NO');check(q,356,248,g1==='FAIL');check(q,356,278,g1==='PASS');
    txt(q,font,val(d,'result_status','Result','ResultStatus','total_score'),360,796,7,160);return q;
  }
  function mhq(pdf,font,d,p){
    const q=getPage(pdf,PAGE.mhq1);txt(q,font,thaiDate(d.AssessmentDate||d.VisitDate),154,53,8);txt(q,font,val(p,'PatientName'),154,75,8,260);txt(q,font,clean(d.Age),445,75);
    for(let i=1;i<=2;i++){const a=String(val(d,'q2_'+i,'Q2_'+i,'Q2_'+i)).toUpperCase();check(q,479,157+(i-1)*31,a==='YES');check(q,511,157+(i-1)*31,a==='NO');}
    const q9y=[376,406,429,452,475,497,520,556,593];let score9=Number(val(d,'score_9q','Score9Q','Total9Q'));for(let i=1;i<=9;i++){const v=Number(val(d,'q9_'+i,'Q9_'+i,'Q9Q'+i));const xs=[356,403,454,505];xs.forEach((x,j)=>check(q,x,q9y[i-1],v===j));}
    if(!Number.isFinite(score9))score9=0;clear(q,404,617,100,18);txt(q,font,String(score9),442,618,9);check(q,73,697,score9<7);check(q,73,728,score9>=7&&score9<=12);check(q,73,759,score9>=13&&score9<=18);check(q,73,790,score9>=19);check(q,376,742,score9>=7);
    const q2=getPage(pdf,PAGE.mhq2);const q8y=[104,137,170,205,278,311,356,389,422];for(let i=1;i<=8;i++){const a=String(val(d,'q8_'+i,'Q8_'+i,'Q8Q'+i)).toUpperCase();check(q2,477,q8y[i-1],a==='NO');check(q2,515,q8y[i-1],a==='YES');}
    let score8=Number(val(d,'score_8q','Score8Q','Total8Q'));if(!Number.isFinite(score8))score8=0;clear(q2,470,472,85,18);txt(q2,font,String(score8),494,474,9);check(q2,75,553,score8===0);check(q2,75,583,score8>=1&&score8<=8);check(q2,75,614,score8>=9&&score8<=16);check(q2,75,644,score8>=17);check(q2,317,659,score8>=17);return q2;
  }
  function tmse(pdf,font,d,p){
    const q=getPage(pdf,PAGE.tmse);txt(q,font,thaiDate(d.AssessmentDate||d.VisitDate),160,32,8,140);txt(q,font,val(p,'PatientName'),220,32,8,250);txt(q,font,clean(d.Age),515,32,8);
    const sum=(keys)=>keys.reduce((n,k)=>n+(Number(val(d,k))||0),0);const groups=[['orientation',134,542,128,['q_day','q_date','q_month','q_time','q_place','q_job']],['registration',246,542,234,['q_reg_1','q_reg_2','q_reg_3']],['attention',338,542,326,['q_fri','q_thu','q_wed','q_tue','q_mon']],['calculation',435,542,422,['q_calc1','q_calc2','q_calc3']],['language',676,542,664,['q_watch','q_shirt','q_repeat','q_command1','q_command2','q_command3','q_read','q_draw','q_similar1','q_similar2']],['recall',768,542,756,['q_tree','q_car','q_hand']]];groups.forEach(([g,y,x,top,keys])=>{clear(q,540,top,30,32);let score=val(d,'score_'+g,'Score_'+g);if(score===''&&g==='language')score=sum(keys.slice(0,8))+((Number(val(d,'q_similar1'))===1)?0.5:0)+((Number(val(d,'q_similar2'))===1)?0.5:0);else if(score==='')score=sum(keys);txt(q,font,score,x,y,8,30);});
    const rows=[['q_day',97],['q_date',116],['q_month',134],['q_time',152],['q_place',171],['q_job',189],['q_reg_1',228],['q_reg_2',246],['q_reg_3',263],['q_fri',303],['q_thu',322],['q_wed',341],['q_tue',359],['q_mon',377],['q_calc1',416],['q_calc2',435],['q_calc3',453],['q_watch',492],['q_shirt',511],['q_repeat',529],['q_command1',568],['q_command2',586],['q_command3',604],['q_read',623],['q_draw',643],['q_similar1',684],['q_similar2',703],['q_tree',741],['q_car',759],['q_hand',783]];
    for(const [key,y] of rows){const v=Number(val(d,key));if(!Number.isFinite(v))continue;check(q,456,y,v>0);check(q,507,y,v===0);}
    const total=Number(val(d,'total_score','TotalScore','Total'));clear(q,145,802,60,20);txt(q,font,Number.isFinite(total)?total:'',155,804,9);check(q,283,806,total<23);check(q,381,806,total>=23&&total<26);check(q,519,806,total>=26);return q;
  }
  async function render(type,id){
    if(!window.supabaseClient)throw new Error('Supabase client ยังไม่พร้อม');
    const {p,r}=await bundle(type,id);const d=data(p,r);const {pdf,font}=await makeDoc(type);
    if(type==='imccover')await cover(pdf,font,d,p);
    else if(type==='consent')await consent(pdf,font,d,p);
    else if(type==='bi')bi(pdf,font,d,p);
    else if(type==='opd'){await opd(pdf,font,d,p);await opd2(pdf,font,d,p)}
    else if(type==='soap')await soap(pdf,font,d,p);
    else if(type==='dysphagia')dys(pdf,font,d,p);
    else if(type==='mhq')mhq(pdf,font,d,p);
    else if(type==='tmse')tmse(pdf,font,d,p);
    const name={imccover:'IMC-Cover',consent:'Consent',bi:'BI-Assessment',opd:'OPD-Card',soap:'SOAP-Note',dysphagia:'Dysphagia',mhq:'MHQ',tmse:'TMSE'}[type]||type;
    return await save(pdf,name+'-'+(val(p,'PatientID','ClinicNumber','HN')||id));
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
