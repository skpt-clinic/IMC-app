/* ============================================================================
   Clinical forms compatibility layer - TMSE / MHQ / Dysphagia
   Direct Supabase CRUD, history, edit, validation and service-menu integration.
============================================================================ */
(function () {
  'use strict';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

  const configs = {
    TMSE: {
      title: 'แบบประเมิน TMSE',
      get: 'getTMSERecordsByPatientId', save: 'saveTMSERecord', id: 'RecordID',
      fields: [
        ['VisitDate','date','วันที่ประเมิน'],['VisitCount','number','ครั้งที่'],
        ['q_day','number','วัน'],['q_date','number','วันที่'],['q_month','number','เดือน'],['q_time','number','ช่วงเวลา'],['q_place','number','สถานที่'],['q_job','number','อาชีพ/ผู้ตรวจ'],
        ['score_orientation','text','คะแนน Orientation'],
        ['q_tree','number','Registration 1'],['q_car','number','Registration 2'],['q_hand','number','Registration 3'],['q_reg_1','number','Recall 1'],['q_reg_2','number','Recall 2'],['q_reg_3','number','Recall 3'],
        ['score_registration','text','คะแนน Registration'],['score_recall','text','คะแนน Recall'],
        ['q_fri','number','Attention ศุกร์'],['q_thu','number','Attention พฤหัส'],['q_wed','number','Attention พุธ'],['q_tue','number','Attention อังคาร'],['q_mon','number','Attention จันทร์'],['score_attention','text','คะแนน Attention'],
        ['q_calc1','number','Calculation 1'],['q_calc2','number','Calculation 2'],['q_calc3','number','Calculation 3'],['score_calculation','text','คะแนน Calculation'],
        ['q_watch','number','บอกชื่อนาฬิกา'],['q_shirt','number','บอกชื่อเสื้อ'],['q_repeat','number','พูดตาม'],['q_command1','number','คำสั่ง 1'],['q_command2','number','คำสั่ง 2'],['q_command3','number','คำสั่ง 3'],['q_read','number','อ่านและทำตาม'],['q_draw','number','วาดภาพ'],['q_similar1','number','ความคล้าย 1'],['q_similar2','number','ความคล้าย 2'],['score_language','text','คะแนน Language'],
        ['total_score','number','คะแนนรวม'],['result_status','text','ผลการประเมิน']
      ]
    },
    MHQ: {
      title: 'แบบคัดกรองสุขภาพจิต MHQ (2Q, 9Q, 8Q)',
      get: 'getMHQRecordsByPatientId', save: 'saveMHQRecord', id: 'RecordID',
      fields: [
        ['VisitDate','date','วันที่ประเมิน'],
        ['q2_1','select','2Q ข้อ 1',['','YES','NO']],['q2_2','select','2Q ข้อ 2',['','YES','NO']],['result_2q','text','ผล 2Q'],
        ...Array.from({length:9},(_,i)=>['q9_'+(i+1),'number','9Q ข้อ '+(i+1)]),
        ['score_9q','number','คะแนน 9Q'],['result_9q','text','ผล 9Q'],
        ...Array.from({length:8},(_,i)=>['q8_'+(i+1),'number','8Q ข้อ '+(i+1)]),
        ['q8_3b','number','8Q ข้อ 3b'],['score_8q','number','คะแนน 8Q'],['result_8q','text','ระดับความเสี่ยง 8Q'],
        ['total_score','number','คะแนนรวม'],['result_status','text','สรุปผลการประเมิน']
      ]
    },
    Dysphagia: {
      title: 'แบบคัดกรองและประเมินภาวะกลืนลำบาก (Dysphagia)',
      get: 'getDysphagiaRecordsByPatientId', save: 'saveDysphagiaRecord', id: 'RecordID',
      fields: [
        ['VisitDate','date','วันที่ประเมิน'],
        ['q1_1','select','ความพร้อม 1',['','YES','NO']],['q1_2','select','ความพร้อม 2',['','YES','NO']],['q1_3','select','ความพร้อม 3',['','YES','NO']],['result_group1','text','สรุปความพร้อม'],
        ['q2_1','select','ทดสอบกลืน 1',['','YES','NO']],['q2_2','select','ทดสอบกลืน 2',['','YES','NO']],['q2_3','select','ทดสอบกลืน 3',['','YES','NO']],
        ['sym2_3_cough','text','อาการ 1 ไอ'],['sym2_3_choke','text','อาการ 1 สำลัก'],['sym2_3_tachypnea','text','อาการ 1 หายใจเร็ว'],['sym2_3_wetvoice','text','อาการ 1 เสียงเปลี่ยน'],
        ['q2_4','select','ทดสอบกลืน 4',['','YES','NO']],['sym2_4_cough','text','อาการ 2 ไอ'],['sym2_4_choke','text','อาการ 2 สำลัก'],['sym2_4_tachypnea','text','อาการ 2 หายใจเร็ว'],['sym2_4_wetvoice','text','อาการ 2 เสียงเปลี่ยน'],
        ['q2_5','select','ทดสอบกลืน 5',['','YES','NO']],['sym2_5_cough','text','อาการ 3 ไอ'],['sym2_5_choke','text','อาการ 3 สำลัก'],['sym2_5_tachypnea','text','อาการ 3 หายใจเร็ว'],['sym2_5_wetvoice','text','อาการ 3 เสียงเปลี่ยน'],
        ['q2_6','select','ดื่มน้ำต่อเนื่อง',['','YES','NO']],['sym2_6_cough','text','อาการ 4 ไอ'],['sym2_6_choke','text','อาการ 4 สำลัก'],['sym2_6_tachypnea','text','อาการ 4 หายใจเร็ว'],['sym2_6_wetvoice','text','อาการ 4 เสียงเปลี่ยน'],
        ['q2_7','select','ทดสอบอาหารข้น',['','YES','NO']],['sym2_7_cough','text','อาการ 5 ไอ'],['sym2_7_choke','text','อาการ 5 สำลัก'],['sym2_7_tachypnea','text','อาการ 5 หายใจเร็ว'],['sym2_7_wetvoice','text','อาการ 5 เสียงเปลี่ยน'],
        ['symq2_6_choke','text','อาการ q2_6 สำลัก'],['symq2_7_cough','text','อาการ q2_7 ไอ'],['symq2_7_choke','text','อาการ q2_7 สำลัก'],['symq2_7_tachypnea','text','อาการ q2_7 หายใจเร็ว'],
        ['total_score','text','ระดับภาวะการกลืน'],['result_status','text','ผลการประเมินและแผนการดูแล']
      ]
    }
  };

  function formShell(type, record) {
    const cfg = configs[type], r = record || {};
    const isEdit = !!r.RecordID;
    const patientId = window.currentPatient?.PatientID || '';
    let html = '<div id="clinical-form-wrap" class="mt-3"><div class="d-flex justify-content-between align-items-center mb-3"><h4 class="mb-0">'+esc(isEdit?'แก้ไข':'บันทึกใหม่')+' '+esc(cfg.title)+'</h4><span class="badge bg-light text-dark">'+esc(window.currentPatient?.PatientName||'')+'</span></div>';
    html += '<form id="clinical-document-form" class="row g-3">';
    html += '<input type="hidden" name="RecordID" value="'+esc(r.RecordID||'')+'"><input type="hidden" name="PatientID" value="'+esc(patientId)+'">';
    cfg.fields.forEach(f=>{
      const [name,kind,label,opts]=f;
      const val=r[name] ?? (name==='VisitDate'?today():'');
      html += '<div class="'+(kind==='text' && ['result_status','result_9q','result_8q','result_group1'].includes(name)?'col-12':'col-md-4')+'">';
      html += '<label class="form-label fw-semibold">'+esc(label)+'</label>';
      if(kind==='select'){
        html += '<select class="form-select" name="'+esc(name)+'">'+(opts||[]).map(o=>'<option value="'+esc(o)+'" '+(String(o)===String(val)?'selected':'')+'>'+esc(o||'เลือก...')+'</option>').join('')+'</select>';
      } else {
        html += '<input class="form-control" type="'+esc(kind==='number'?'number':kind==='date'?'date':'text')+'" name="'+esc(name)+'" value="'+esc(val)+'">';
      }
      html += '</div>';
    });
    html += '<div class="col-12 d-flex gap-2 mt-2"><button type="submit" class="btn btn-primary">บันทึก</button><button type="button" class="btn btn-secondary" onclick="showHistory(\''+type+'\')">ยกเลิก</button></div></form></div>';
    return html;
  }

  function scoreTMSE(form){
    const nums=['q_day','q_date','q_month','q_time','q_place','q_job','q_tree','q_car','q_hand','q_fri','q_thu','q_wed','q_tue','q_mon','q_calc1','q_calc2','q_calc3','q_watch','q_shirt','q_repeat','q_command1','q_command2','q_command3','q_read','q_draw','q_similar1','q_similar2','q_reg_1','q_reg_2','q_reg_3'];
    return nums.reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
  }
  function autoCalculate(type, form){
    if(type==='TMSE'){
      const total=scoreTMSE(form); form.elements.total_score.value=total;
      form.elements.result_status.value=total>=24?'ปกติ/ผ่านเกณฑ์ (>=24)':total>=18?'ผ่านเกณฑ์สำหรับผู้ไม่ได้รับการศึกษา (>=18)':'ต่ำกว่าเกณฑ์';
      form.elements.score_orientation.value=['q_day','q_date','q_month','q_time','q_place','q_job'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
      form.elements.score_registration.value=['q_tree','q_car','q_hand'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
      form.elements.score_recall.value=['q_reg_1','q_reg_2','q_reg_3'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
      form.elements.score_attention.value=['q_fri','q_thu','q_wed','q_tue','q_mon'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
      form.elements.score_calculation.value=['q_calc1','q_calc2','q_calc3'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
      form.elements.score_language.value=['q_watch','q_shirt','q_repeat','q_command1','q_command2','q_command3','q_read','q_draw','q_similar1','q_similar2'].reduce((s,n)=>s+(Number(form.elements[n]?.value)||0),0);
    }
    if(type==='MHQ'){
      const q9=Array.from({length:9},(_,i)=>Number(form.elements['q9_'+(i+1)]?.value)||0).reduce((a,b)=>a+b,0);
      const q8=Array.from({length:8},(_,i)=>Number(form.elements['q8_'+(i+1)]?.value)||0).reduce((a,b)=>a+b,0)+(Number(form.elements.q8_3b?.value)||0);
      form.elements.score_9q.value=q9; form.elements.score_8q.value=q8;
      form.elements.result_2q.value=(form.elements.q2_1.value==='YES'||form.elements.q2_2.value==='YES')?'YES':'NO';
      form.elements.result_9q.value=q9===0?'ปกติ':q9<=6?'มีอาการระดับเล็กน้อย':q9<=12?'มีอาการระดับปานกลาง':'มีอาการระดับรุนแรง';
      form.elements.result_8q.value=q8===0?'ไม่พบความเสี่ยง':q8<9?'เฝ้าระวัง':'มีความเสี่ยง';
      form.elements.total_score.value=q9+q8;
      form.elements.result_status.value=form.elements.result_8q.value;
    }
    if(type==='Dysphagia'){
      form.elements.result_group1.value=(form.elements.q1_1.value==='YES'&&form.elements.q1_2.value==='YES'&&form.elements.q1_3.value==='YES')?'PASS':'FAIL';
      const tests=['q2_1','q2_2','q2_3','q2_4','q2_5','q2_6','q2_7'];
      const failed=tests.filter(n=>form.elements[n].value==='NO').length;
      form.elements.total_score.value=failed===0?'ผ่านการคัดกรอง':'พบความเสี่ยง/ผิดปกติ';
      form.elements.result_status.value=failed===0?'แนะนำติดตามตามอาการ':'แนะนำประเมินภาวะกลืนลำบากเพิ่มเติมและวางแผนดูแล';
    }
  }

  function mountForm(type, record){
    const area=document.getElementById('service-form-area');
    if(!area) return;
    area.style.display='block';
    area.innerHTML=formShell(type,record);
    const form=document.getElementById('clinical-document-form');
    form.addEventListener('input',()=>autoCalculate(type,form));
    form.addEventListener('change',()=>autoCalculate(type,form));
    autoCalculate(type,form);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(form).entries());
      data.PatientID=window.currentPatient?.PatientID||data.PatientID;
      if(!data.PatientID){showError({message:'ไม่พบผู้ป่วยที่กำลังทำรายการ'});return;}
      autoCalculate(type,form);
      showLoading('กำลังบันทึก '+configs[type].title+'...');
      const res=await window.google.script.run[configs[type].save](data);
      Swal.close();
      if(res?.status==='success'){
        showSuccessToast(res.message||'บันทึกสำเร็จ');
        if(typeof updateScheduleStatus==='function' && data.VisitCount) window.google.script.run.updateScheduleStatus(data.PatientID,data.VisitCount);
        showHistory(type);
      }else showError(res||{message:'ไม่สามารถบันทึกข้อมูลได้'});
    });
  }

  async function loadHistory(type){
    const cfg=configs[type], area=document.getElementById('service-form-area');
    if(!area) return;
    area.style.display='block'; area.innerHTML='<div class="text-center p-4">กำลังโหลดประวัติ...</div>';
    const res=await window.google.script.run[cfg.get](window.currentPatient?.PatientID);
    if(!res || res.status!=='success'){showError(res||{message:'โหลดข้อมูลไม่สำเร็จ'});return;}
    const records=res.records||[];
    const rows=records.length?records.map(r=>'<tr><td>'+esc(r.VisitDate?formatThaiDate(r.VisitDate):'-')+'</td><td>'+esc(r.total_score??r.result_status??'-')+'</td><td class="text-nowrap"><button class="btn btn-outline-secondary btn-sm me-1" onclick="editClinicalDocument(\''+type+'\',\''+esc(r.RecordID)+'\')">แก้ไข</button><button class="btn btn-outline-info btn-sm me-1" onclick="printRecord(\''+type+'\',\''+esc(r.RecordID)+'\')">พิมพ์</button><button class="btn btn-outline-danger btn-sm" onclick="confirmDelete(\''+type+'\',\''+esc(r.RecordID)+'\')">ลบ</button></td></tr>').join(''):'<tr><td colspan="3" class="text-center p-4 text-muted">ยังไม่มีประวัติ</td></tr>';
    area.innerHTML='<div class="d-flex justify-content-between align-items-center mb-3"><h4 class="mb-0">'+esc(cfg.title)+' - ประวัติ</h4><button class="btn btn-success" onclick="openClinicalDocument(\''+type+'\')">สร้างรายการใหม่</button></div><div class="table-responsive"><table class="table table-hover table-sm"><thead><tr><th>วันที่</th><th>ผล/คะแนน</th><th>จัดการ</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  window.openClinicalDocument=(type)=>mountForm(type,null);
  window.editClinicalDocument=async(type,id)=>{
    showLoading('กำลังโหลดข้อมูล...');
    const getter={TMSE:'getTMSERecordById',MHQ:'getMHQRecordById',Dysphagia:'getDysphagiaRecordById'}[type];
    const res=await window.google.script.run[getter](id); Swal.close();
    if(res?.status==='success') mountForm(type,res.record); else showError(res||{message:'ไม่พบข้อมูล'});
  };
  window.showHistory=(function(original){
    return function(type){
      if(configs[type]) return loadHistory(type);
      return original.apply(this,arguments);
    };
  })(window.showHistory);

  // Add the three assessment choices to the service menu without disturbing existing buttons.
  function ensureMenuButtons(){
    const bar=document.getElementById('service-menu-bar');
    if(!bar || bar.dataset.extended==='true') return;
    bar.dataset.extended='true';
    const wrapper=document.createElement('div');
    wrapper.className='w-full flex flex-wrap gap-2 mt-2';
    wrapper.innerHTML='<div class="w-full text-sm font-semibold text-gray-600">แบบประเมินเพิ่มเติม:</div>'+
      '<button class="btn btn-outline-primary" onclick="showServiceSubView(\'TMSE\')">TMSE</button>'+
      '<button class="btn btn-outline-primary" onclick="showServiceSubView(\'MHQ\')">MHQ</button>'+
      '<button class="btn btn-outline-primary" onclick="showServiceSubView(\'Dysphagia\')">Dysphagia</button>';
    bar.appendChild(wrapper);
  }
  const observer=new MutationObserver(ensureMenuButtons);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setInterval(ensureMenuButtons,1000);

  // Extend showServiceSubView for these three forms while preserving the original four.
  const originalSubView=window.showServiceSubView;
  window.showServiceSubView=function(type,recordId=null){
    if(configs[type]){
      if(recordId) return window.editClinicalDocument(type,recordId);
      return window.showHistory(type);
    }
    return originalSubView.apply(this,arguments);
  };

  console.log('[IMC] TMSE/MHQ/Dysphagia clinical forms layer ready');
})();
