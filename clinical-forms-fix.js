/* ============================================================================
   IMC Plus - GAS-compatible clinical assessment forms
   TMSE / MHQ / Dysphagia
   UI and scoring logic ported from the original GAS system.
   Data operations continue through the Supabase-backed google.script.run adapter.
============================================================================ */
(function () {
  'use strict';

function createTmseFormHtml(isIndependent = false) {
    const title = isIndependent ? 'แบบประเมินสมองเสื่อม TMSE (แก้ไข/ดูข้อมูล)' : 'แบบทดสอบสมองเสื่อม (Thai Mental State Examination : TMSE)';
    return `
        <h4 class="text-xl font-bold text-teal-800 mb-4 flex items-center gap-2">
            <i class="bi bi-clipboard2-pulse-fill"></i> ${title}
        </h4>
        <form id="tmse-form" class="space-y-6">
            <input type="hidden" name="RecordID" id="tmse_RecordID">
            <input type="hidden" name="PatientID" id="tmse_PatientID">
            
            <!-- Patient Info Section -->
            <div class="bg-teal-50 border border-teal-200 p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">ชื่อ-นามสกุล</label>
                    <input type="text" id="tmse_PatientName" name="PatientName" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? currentPatient.PatientName : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">อายุ (ปี)</label>
                    <input type="text" id="tmse_Age" name="Age" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? calculateAge(currentPatient.DateOfBirth) : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">สิทธิ์การรักษา</label>
                    <input type="text" id="tmse_TreatmentRights" name="TreatmentRightsDisplay" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? (currentPatient.TreatmentRightsDisplay || currentPatient.TreatmentRights) : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">วันที่ประเมิน</label>
                    <input type="date" id="tmse_VisitDate" name="VisitDate" class="form-control form-control-sm mt-1">
                </div>
                <div class="col-span-1 md:col-span-2">
                    <label class="block text-xs font-semibold text-teal-700 tracking-wider">ครั้งที่การเยี่ยม (Visit Count)</label>
                    <input type="number" id="tmse_VisitCount" name="VisitCount" class="form-control form-control-sm mt-1">
                </div>
            </div>

            <!-- Score board -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-slate-800 text-white p-4 rounded-xl text-center flex flex-col justify-center">
                    <span class="text-sm font-medium opacity-80">คะแนนรวม TMSE (เต็ม 30)</span>
                    <h2 class="text-4xl font-extrabold mt-1" id="tmse_total_score_display">0</h2>
                </div>
                <div class="bg-indigo-900 text-white p-4 rounded-xl text-center flex flex-col justify-center col-span-2">
                    <span class="text-sm font-medium opacity-80">การประเมินผล</span>
                    <h3 class="text-2xl font-bold mt-1" id="tmse_result_display">ปกติ</h3>
                </div>
            </div>

            <!-- 2.1 Orientation -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>1. Orientation (การรับรู้ - เต็ม 6 คะแนน)</span>
                    <span class="text-teal-600" id="sub_orientation">0/6</span>
                </h5>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_day', 'วันนี้เป็นวันอะไร (จันทร์-อาทิตย์)')}
                    ${createTmseQuestionRow('q_date', 'วันนี้วันที่เท่าไร')}
                    ${createTmseQuestionRow('q_month', 'เดือนนี้เดือนอะไร')}
                    ${createTmseQuestionRow('q_time', 'ขณะนี้เป็นช่วงเวลาอะไรของวัน (เช้า/เที่ยง/บ่าย/เย็น)')}
                    ${createTmseQuestionRow('q_place', 'ที่นี่ที่ไหน')}
                    <div class="border-b pb-3">
                        <div class="flex flex-col md:flex-row md:items-center gap-3">
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <img src="https://i.pinimg.com/564x/53/55/b3/5355b3f17663be5f76acd7ab4adbfb4c.jpg" alt="ภาพอาชีพสำหรับคำถาม TMSE" referrerpolicy="no-referrer"
                                     style="width:130px; height:130px; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0;"
                                     onerror="this.onerror=null; this.replaceWith(Object.assign(document.createElement('div'), { className: 'text-danger small', innerText: 'ไม่สามารถโหลดรูปภาพได้' }));">
                                <span class="text-slate-700">คนที่เห็นในภาพนี้อาชีพอะไร</span>
                            </div>
                            <div class="flex flex-wrap gap-3 mt-2 md:mt-0 md:justify-end">
                                ${createTmseRadioOptions('q_job')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2.2 Registration -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>2. Registration (การบันทึกความจำ - เต็ม 3 คะแนน)</span>
                    <span class="text-teal-600" id="sub_registration">0/3</span>
                </h5>
                <p class="text-sm text-slate-700">ผู้ทดสอบบอกผู้ถูกทดสอบว่า : บอกชื่อของ 3 อย่าง บอกเพียงครั้งเดียวจำไว้เดี๋ยวจะกลับมาถามซ้ำ (พูดห่างกันคำละ 1 วินาที)</p>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_reg_1', 'ต้นไม้')}
                    ${createTmseQuestionRow('q_reg_2', 'รถยนต์')}
                    ${createTmseQuestionRow('q_reg_3', 'มือ')}
                </div>
            </div>

            <!-- 2.3 Attention -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>3. Attention (ความตั้งใจและสมาธิ - เต็ม 5 คะแนน)</span>
                    <span class="text-teal-600" id="sub_attention">0/5</span>
                </h5>
                <p class="text-xs text-slate-500 italic">* ให้ผู้ถูกทดสอบบอกวันในหนึ่งสัปดาห์ถอยหลัง โดยเริ่มจากวันอาทิตย์ ถอยไปเป็นวันเสาร์ถอยต่อไปเรื่อยๆ จนครบสัปดาห์</p>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_fri', 'ศุกร์')}
                    ${createTmseQuestionRow('q_thu', 'พฤหัส')}
                    ${createTmseQuestionRow('q_wed', 'พุธ')}
                    ${createTmseQuestionRow('q_tue', 'อังคาร')}
                    ${createTmseQuestionRow('q_mon', 'จันทร์')}
                </div>
            </div>

            <!-- 2.4 Calculation -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>4. Calculation (การคิดคำนวณ - เต็ม 3 คะแนน)</span>
                    <span class="text-teal-600" id="sub_calculation">0/3</span>
                </h5>
                <p class="text-xs text-slate-500 italic">* ลบเลข 100-7 ถอยหลัง 3 ครั้ง (93, 86, 79)</p>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_calc1', 'ครั้งที่ 1 (ได้ 93)')}
                    ${createTmseQuestionRow('q_calc2', 'ครั้งที่ 2 (ได้ 86)')}
                    ${createTmseQuestionRow('q_calc3', 'ครั้งที่ 3 (ได้ 79)')}
                </div>
            </div>

            <!-- 2.5 Language -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>5. Language (การใช้ภาษา - เต็ม 10 คะแนน)</span>
                    <span class="text-teal-600" id="sub_language">0/10</span>
                </h5>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_watch', 'ชี้ไปที่ นาฬิกาข้อมือ แล้วถามว่า “สิ่งนี้เรียกว่าอะไร” [1 คะแนน]')}
                    ${createTmseQuestionRow('q_shirt', 'ชี้ไปที่ เสื้อของตนเอง แล้วถามว่า “สิ่งนี้เรียกว่าอะไร” [1 คะแนน]')}
                    ${createTmseQuestionRow('q_repeat', 'ฟังประโยคต่อไปนี้แล้วพูดตาม “ยายพาหลานไปซื้อขนมที่ตลาด” [1 คะแนน]')}
                    
                    <p class="text-sm font-semibold text-slate-700 mt-2">* ทำตามคำสั่ง 3 ขั้นตอน [3 คะแนน]:</p>
                    ${createTmseQuestionRow('q_command1', '1) หยิบกระดาษด้วยมือขวา [1 คะแนน]')}
                    ${createTmseQuestionRow('q_command2', '2) พับครึ่งกระดาษ [1 คะแนน]')}
                    ${createTmseQuestionRow('q_command3', '3) ส่งกระดาษคืนให้ผู้ทดสอบ [1 คะแนน]')}
                    
                    ${createTmseQuestionRow('q_read', 'ให้อ่านข้อความว่า “หลับตา” แล้วทำตาม [1 คะแนน]')}
                    
                    <div class="border-b pb-3 mt-2">
                        <div class="flex flex-col md:flex-row md:items-center gap-3">
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <img src="https://mumeaw.com/wp-content/uploads/2024/01/234_1.jpg" alt="ภาพตัวอย่างสำหรับวาดตาม TMSE" referrerpolicy="no-referrer"
                                     style="width:130px; height:130px; object-fit:contain; background:#fff; border-radius:8px; border:1px solid #e2e8f0;"
                                     onerror="this.onerror=null; this.replaceWith(Object.assign(document.createElement('div'), { className: 'text-danger small', innerText: 'ไม่สามารถโหลดรูปภาพได้' }));">
                                <span class="text-slate-700">ผู้ทดสอบบอกผู้ถูกทดสอบว่าให้วาดภาพต่อไปนี้ให้เหมือนตัวอย่างมากที่สุด [2 คะแนน]</span>
                            </div>
                            <div class="flex flex-wrap gap-3 mt-2 md:mt-0 md:justify-end">
                                <div class="form-check form-check-inline m-0">
                                    <input class="form-check-input tmse-radio" type="radio" name="q_draw" id="q_draw_2" value="2" onchange="calculateTmseScore()">
                                    <label class="form-check-label text-sm text-green-700 font-medium" for="q_draw_2">ถูก (2)</label>
                                </div>
                                <div class="form-check form-check-inline m-0">
                                    <input class="form-check-input tmse-radio" type="radio" name="q_draw" id="q_draw_0" value="0" onchange="calculateTmseScore()" checked>
                                    <label class="form-check-label text-sm text-red-600 font-medium" for="q_draw_0">ผิด (0)</label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <p class="text-sm font-semibold text-slate-700 mt-2">* ความคล้ายคลึง [1 คะแนน]:</p>
                    ${createTmseQuestionRow('q_similar1', 'กล้วยกับส้มเหมือนกันคือ เป็นผลไม้ [0.5 คะแนน]')}
                    ${createTmseQuestionRow('q_similar2', 'แมวกับหมาเหมือนกันคือ เป็นสัตว์ [0.5 คะแนน]')}
                </div>
            </div>

            <!-- 2.6 Recall -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>6. Recall (การจำ - เต็ม 3 คะแนน)</span>
                    <span class="text-teal-600" id="sub_recall">0/3</span>
                </h5>
                <p class="text-xs text-slate-500 italic">* ผู้ทดสอบให้ผู้ถูกทดสอบบอกสิ่งของ 3 อย่างที่ให้จำไว้ ติ๊กถูกหรือผิดรายคำ คำละ 1 คะแนน</p>
                <div class="space-y-3">
                    ${createTmseQuestionRow('q_tree', 'คำที่ 1 (เช่น ต้นไม้)')}
                    ${createTmseQuestionRow('q_car', 'คำที่ 2 (เช่น รถยนต์)')}
                    ${createTmseQuestionRow('q_hand', 'คำที่ 3 (เช่น มือ)')}
                </div>
            </div>

            ${isIndependent ? `
            <div class="mt-4 flex gap-3">
                <button type="button" class="btn btn-primary" onclick="handleTmseSubmit()">บันทึกข้อมูล TMSE</button>
                <button type="button" class="btn btn-secondary" onclick="displayEMRTab()">กลับไป EMR</button>
            </div>
            ` : ''}
        </form>
    `;
}

function createTmseQuestionRow(name, label) {
    return `
        <div class="row items-center border-b pb-2">
            <div class="col-md-7">
                <span class="text-slate-700">${label}</span>
            </div>
            <div class="col-md-5 d-flex justify-content-end gap-3">
                ${createTmseRadioOptions(name)}
            </div>
        </div>
    `;
}

function createTmseRadioOptions(name) {
    return `
        <div class="form-check form-check-inline m-0">
            <input class="form-check-input tmse-radio" type="radio" name="${name}" id="${name}_1" value="1" onchange="calculateTmseScore()">
            <label class="form-check-label text-sm text-green-700 font-medium" for="${name}_1">ถูก (1)</label>
        </div>
        <div class="form-check form-check-inline m-0">
            <input class="form-check-input tmse-radio" type="radio" name="${name}" id="${name}_0" value="0" onchange="calculateTmseScore()" checked>
            <label class="form-check-label text-sm text-red-600 font-medium" for="${name}_0">ผิด (0)</label>
        </div>
    `;
}

function calculateTmseScore() {
    let orientation = 0;
    const oKeys = ['q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job'];
    oKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) orientation += parseInt(checked.value);
    });
    const subO = document.getElementById('sub_orientation');
    if (subO) subO.textContent = `${orientation}/6`;

    let registration = 0;
    const regKeys = ['q_reg_1', 'q_reg_2', 'q_reg_3'];
    regKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) registration += parseInt(checked.value);
    });
    const subReg = document.getElementById('sub_registration');
    if (subReg) subReg.textContent = `${registration}/3`;

    let recall = 0;
    const rKeys = ['q_tree', 'q_car', 'q_hand'];
    rKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) recall += parseInt(checked.value);
    });
    const subR = document.getElementById('sub_recall');
    if (subR) subR.textContent = `${recall}/3`;

    let attention = 0;
    const aKeys = ['q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon'];
    aKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) attention += parseInt(checked.value);
    });
    const subA = document.getElementById('sub_attention');
    if (subA) subA.textContent = `${attention}/5`;

    let calculation = 0;
    const cKeys = ['q_calc1', 'q_calc2', 'q_calc3'];
    cKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) calculation += parseInt(checked.value);
    });
    const subC = document.getElementById('sub_calculation');
    if (subC) subC.textContent = `${calculation}/3`;

    let language = 0;
    const lKeys = ['q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read'];
    lKeys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) language += parseInt(checked.value);
    });
    const drawChecked = document.querySelector(`input[name="q_draw"]:checked`);
    if (drawChecked) language += parseInt(drawChecked.value);
    
    let similarities = 0;
    const sim1 = document.querySelector(`input[name="q_similar1"]:checked`);
    const sim2 = document.querySelector(`input[name="q_similar2"]:checked`);
    if (sim1 && parseInt(sim1.value) === 1) similarities += 0.5;
    if (sim2 && parseInt(sim2.value) === 1) similarities += 0.5;
    language += similarities;
    
    const subL = document.getElementById('sub_language');
    if (subL) subL.textContent = `${language}/10`;

    const total = orientation + registration + recall + attention + calculation + language;
    const totalScoreDisplay = document.getElementById('tmse_total_score_display');
    if (totalScoreDisplay) totalScoreDisplay.textContent = total;

    const resultDisplay = document.getElementById('tmse_result_display');
    if (resultDisplay) {
        if (total < 23) {
            resultDisplay.textContent = 'ภาวะสมองเสื่อม';
            resultDisplay.className = 'text-2xl font-bold mt-1 text-red-400';
        } else if (total < 26) {
            resultDisplay.textContent = 'ผิดปกติ Cognitive impairment';
            resultDisplay.className = 'text-2xl font-bold mt-1 text-warning';
        } else {
            resultDisplay.textContent = 'ปกติ';
            resultDisplay.className = 'text-2xl font-bold mt-1 text-green-400';
        }
    }
}

function renderTmseHistory(records) {
    const columns = [
        { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) },
        { header: 'คะแนน', key: r => `${r.total_score} / 30` },
        { header: 'แปลผล', key: r => r.result_status }
    ];
    const actions = r => `
        <button class="btn btn-outline-secondary btn-sm" onclick="editTMSEForm('${r.RecordID}')">แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('TMSE', '${r.RecordID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('TMSE', '${r.RecordID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewTMSEForm()">ประเมิน TMSE ใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการประเมิน TMSE', newButton, columns, actions);
}

function openNewTMSEForm() {
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createTmseFormHtml(true);
    formContainer.style.display = 'block';

    document.getElementById('tmse_PatientID').value = currentPatient.PatientID;
    document.getElementById('tmse_VisitDate').value = toBangkokDateStr(new Date());

    google.script.run.withSuccessHandler(data => {
        if (data.status === 'success') {
            document.getElementById('tmse_VisitCount').value = data.visitCount;
        }
    }).getNextVisitCount(currentPatient.PatientID);

    calculateTmseScore();
}

function editTMSEForm(recordId) {
    showLoading('กำลังโหลดข้อมูล TMSE...');
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createTmseFormHtml(true);
    formContainer.style.display = 'block';

    google.script.run.withSuccessHandler(response => {
        Swal.close();
        if (response.status === 'success' && response.record) {
            const data = response.record;
            document.getElementById('tmse_RecordID').value = data.RecordID;
            document.getElementById('tmse_PatientID').value = data.PatientID;
            document.getElementById('tmse_VisitDate').value = data.VisitDate ? toBangkokDateStr(data.VisitDate) : '';
            document.getElementById('tmse_VisitCount').value = data.VisitCount;

            const binaryFields = [
                'q_day', 'q_date', 'q_month', 'q_time', 'q_place', 'q_job',
                'q_reg_1', 'q_reg_2', 'q_reg_3',
                'q_tree', 'q_car', 'q_hand',
                'q_fri', 'q_thu', 'q_wed', 'q_tue', 'q_mon',
                'q_calc1', 'q_calc2', 'q_calc3',
                'q_watch', 'q_shirt', 'q_repeat', 'q_command1', 'q_command2', 'q_command3', 'q_read',
                'q_similar1', 'q_similar2'
            ];

            binaryFields.forEach(field => {
                const val = data[field];
                if (val !== undefined) {
                    const radio = document.querySelector(`input[name="${field}"][value="${val}"]`);
                    if (radio) radio.checked = true;
                }
            });

            if (data.q_draw !== undefined) {
                const radio = document.querySelector(`input[name="q_draw"][value="${data.q_draw}"]`);
                if (radio) radio.checked = true;
            }

            calculateTmseScore();
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).getTMSERecordById(recordId);
}

function getTmseFormData() {
    const form = document.getElementById('tmse-form');
    if (!form) return {};
    const data = Object.fromEntries(new FormData(form).entries());
    const totalScoreDisplay = document.getElementById('tmse_total_score_display');
    const resultDisplay = document.getElementById('tmse_result_display');
    data.total_score = totalScoreDisplay ? totalScoreDisplay.textContent : '0';
    data.result_status = resultDisplay ? resultDisplay.textContent : 'ปกติ';
    return data;
}

function handleTmseSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก...');
    const data = getTmseFormData();
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            google.script.run.updateScheduleStatus(data.PatientID, data.VisitCount);
            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('TMSE');
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).saveTMSERecord(data);
}

function toggleTmseForm(checked) {
    const section = document.getElementById('tmse_form_section');
    if (section) {
        section.style.display = checked ? 'block' : 'none';
        if (checked && !section.innerHTML) {
            section.innerHTML = createTmseFormHtml(false);
            calculateTmseScore();
            // Set initial Date input to today
            const tmseDate = document.getElementById('tmse_VisitDate');
            if (tmseDate) {
                tmseDate.value = toBangkokDateStr(new Date());
            }
        }
    }
}

function saveTmseFromParent(patientId, visitCount, visitDate, callback) {
    const checkbox = document.getElementById('want_tmse');
    if (checkbox && checkbox.checked) {
        const tmseData = getTmseFormData();
        tmseData.PatientID = patientId;
        tmseData.VisitCount = visitCount;
        // If tmseDate was modified, keep it, otherwise use visitDate
        const tmseDateInput = document.getElementById('tmse_VisitDate');
        tmseData.VisitDate = (tmseDateInput && tmseDateInput.value) ? tmseDateInput.value : visitDate;
        google.script.run.withSuccessHandler(response => {
            if (response.status === 'success') {
                if (callback) callback();
            } else {
                showError(response);
            }
        }).withFailureHandler(showError).saveTMSERecord(tmseData);
    } else {
        if (callback) callback();
    }
}

function createMHQFormHtml(isIndependent = true) {
    const title = 'แบบประเมินภาวะสุขภาพจิต (2Q / 9Q / 8Q)';
    return `
        <h4 class="text-xl font-bold text-teal-800 mb-4 flex items-center gap-2">
            <i class="bi bi-heart-pulse-fill"></i> ${title}
        </h4>
        <form id="mhq-form" class="space-y-6">
            <input type="hidden" name="RecordID" id="mhq_RecordID">
            <input type="hidden" name="PatientID" id="mhq_PatientID">
            <span id="mhq_total_score_display" class="hidden">0</span>
            <span id="mhq_result_display" class="hidden">-</span>

            <!-- Patient Info -->
            <div class="bg-teal-50 border border-teal-200 p-4 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">ชื่อ-นามสกุล</label>
                    <input type="text" id="mhq_PatientName" name="PatientName" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? currentPatient.PatientName : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">อายุ (ปี)</label>
                    <input type="text" id="mhq_Age" name="Age" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? calculateAge(currentPatient.DateOfBirth) : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">สิทธิ์การรักษา</label>
                    <input type="text" id="mhq_TreatmentRights" name="TreatmentRightsDisplay" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? (currentPatient.TreatmentRightsDisplay || currentPatient.TreatmentRights) : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">วันที่ประเมิน</label>
                    <input type="date" id="mhq_VisitDate" name="VisitDate" class="form-control form-control-sm mt-1">
                </div>
            </div>

            <!-- Group 1: 2Q -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                <h5 class="font-bold text-slate-800 border-b pb-2">Group 1 &nbsp; แบบคัดกรองโรคซึมเศร้า 2 คำถาม (2Q)</h5>
                <div class="space-y-3">
                    ${createMHQ2QRow('q2_1', '1. ใน 2 สัปดาห์ที่ผ่านมา รวมวันนี้ ท่านรู้สึก หดหู่ เศร้า หรือท้อแท้สิ้นหวัง หรือไม่')}
                    ${createMHQ2QRow('q2_2', '2. ใน 2 สัปดาห์ที่ผ่านมา รวมวันนี้ท่านรู้สึก เบื่อ ทำอะไรก็ไม่เพลิดเพลิน หรือไม่')}
                </div>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2 space-y-1">
                    <p class="text-sm font-semibold text-slate-700 underline">แปลผล</p>
                    <div class="flex items-center gap-2">
                        <span id="mhq_2q_no_icon" class="text-lg">☐</span>
                        <span class="text-sm">NO : 2 ข้อ</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span id="mhq_2q_yes_icon" class="text-lg">☐</span>
                        <span class="text-sm">YES : &gt; 1 ข้อ - เป็นผู้มีความเสี่ยง หรือ มีแนวโน้มที่จะเป็นโรคซึมเศร้า - <strong>ประเมิน Group 2 ต่อ</strong></span>
                    </div>
                </div>
            </div>

            <!-- Group 2: 9Q -->
            <div id="mhq_9q_section" class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4" style="display:none;">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>Group 2 &nbsp; แบบประเมินโรคซึมเศร้า 9 คำถาม (9Q)</span>
                    <span class="text-teal-600" id="mhq_9q_total">0/27</span>
                </h5>
                <p class="text-sm text-slate-600">ในช่วง 2 สัปดาห์ที่ผ่านมารวมทั้งวันนี้ ท่านมีอาการเหล่านี้บ่อยแค่ไหน</p>
                <div class="overflow-x-auto">
                    <table class="table table-sm table-bordered text-center align-middle">
                        <thead>
                            <tr class="bg-slate-50">
                                <th class="text-start" style="min-width:220px;">อาการ</th>
                                <th>ไม่มีเลย<br>(0)</th>
                                <th>เป็นบางวัน<br>1-7 วัน (1)</th>
                                <th>เป็นบ่อย<br>&gt; 7 วัน (2)</th>
                                <th>เป็นทุกวัน<br>(3)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${createMHQ9QRow('q9_1', '1. เบื่อ ไม่สนใจอยากทำอะไร')}
                            ${createMHQ9QRow('q9_2', '2. ไม่สบายใจ ซึมเศร้า ท้อแท้')}
                            ${createMHQ9QRow('q9_3', '3. หลับยากหรือหลับๆตื่นๆหรือหลับมากไป')}
                            ${createMHQ9QRow('q9_4', '4. เหนื่อยง่ายหรือไม่ค่อยมีแรง')}
                            ${createMHQ9QRow('q9_5', '5. เบื่ออาหารหรือกินมากเกินไป')}
                            ${createMHQ9QRow('q9_6', '6. รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลวหรือครอบครัวผิดหวัง')}
                            ${createMHQ9QRow('q9_7', '7. สมาธิไม่ดี เวลาทำอะไร เช่น ดูโทรทัศน์ ฟังวิทยุ หรือทำงานที่ต้องใช้ความตั้งใจ')}
                            ${createMHQ9QRow('q9_8', '8. พูดช้า ทำอะไรช้าลงจนคนอื่นสังเกตเห็นได้หรือกระสับกระส่าย ไม่สามารถ อยู่นิ่งได้เหมือนที่เคยเป็น')}
                            ${createMHQ9QRow('q9_9', '9. คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี')}
                        </tbody>
                    </table>
                </div>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                    <p class="text-sm font-semibold text-slate-700 underline">แปลผล (คะแนนรวมทั้งหมด: <span id="mhq_9q_score_display">0</span>)</p>
                    <div class="flex items-center gap-2"><span id="mhq_9q_lt7_icon" class="text-lg">☐</span><span class="text-sm">&lt; 7 &nbsp; ไม่มีอาการของโรคซึมเศร้าหรือมีอาการของโรคซึมเศร้าระดับน้อยมาก</span></div>
                    <div class="flex items-center gap-2"><span id="mhq_9q_7to12_icon" class="text-lg">☐</span><span class="text-sm">7-12 &nbsp; มีอาการของโรคซึมเศร้า ระดับน้อย &nbsp; <strong class="text-orange-600">(คะแนน 9Q ≥ 7 ประเมิน Group 3 ต่อ)</strong></span></div>
                    <div class="flex items-center gap-2"><span id="mhq_9q_13to18_icon" class="text-lg">☐</span><span class="text-sm">13-18 &nbsp; มีอาการของโรคซึมเศร้า ระดับปานกลาง</span></div>
                    <div class="flex items-center gap-2"><span id="mhq_9q_gte19_icon" class="text-lg">☐</span><span class="text-sm">≥ 19 &nbsp; มีอาการของโรคซึมเศร้า ระดับรุนแรง</span></div>
                </div>
            </div>

            <!-- Group 3: 8Q -->
            <div id="mhq_8q_section" class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4" style="display:none;">
                <h5 class="font-bold text-slate-800 border-b pb-2 flex justify-between items-center">
                    <span>Group 3 &nbsp; แบบประเมินการฆ่าตัวตาย 8 คำถาม (8Q)</span>
                    <span class="text-teal-600" id="mhq_8q_total">0</span>
                </h5>
                <p class="text-sm text-slate-600">ใน 1 เดือนที่ผ่านมาจนถึงทุกวันนี้ ท่านมีอาการเหล่านี้หรือไม่</p>
                <div class="space-y-3">
                    ${createMHQ8QRow('q8_1', '1. คิดอยากตาย หรือ คิดว่าตายไปจะดีกว่า')}
                    ${createMHQ8QRow('q8_2', '2. อยากทำร้ายตัวเอง หรือ ทำให้ตัวเองบาดเจ็บ')}
                    ${createMHQ8QRow('q8_3', '3. คิดเกี่ยวกับการฆ่าตัวตาย', 'toggleMHQ8Q3Sub()')}
                    <div id="mhq_q8_3b_row" style="display:none;" class="pl-3 border-l-4 border-orange-300 bg-orange-50 rounded p-3">
                        <div class="flex flex-col md:flex-row md:items-center gap-2 justify-between">
                            <span class="text-sm text-slate-700 flex-grow">(ถ้าตอบว่าคิดเกี่ยวกับฆ่าตัวตายให้ถามต่อ) ท่านสามารถควบคุมความอยากฆ่าตัวตายที่ท่านคิดอยู่นั้นได้หรือไม่ หรือบอกได้ไหมว่าคงจะไม่ทำตามความคิดนั้นในขณะนี้</span>
                            <div class="flex gap-3 flex-wrap flex-shrink-0">
                                <div class="form-check form-check-inline m-0">
                                    <input class="form-check-input mhq-radio" type="radio" name="q8_3b" id="q8_3b_0" value="0" onchange="calculateMHQScore()">
                                    <label class="form-check-label text-sm text-green-700 font-medium" for="q8_3b_0">ได้ (0)</label>
                                </div>
                                <div class="form-check form-check-inline m-0">
                                    <input class="form-check-input mhq-radio" type="radio" name="q8_3b" id="q8_3b_1" value="1" onchange="calculateMHQScore()">
                                    <label class="form-check-label text-sm text-red-600 font-medium" for="q8_3b_1">ไม่ได้ (8)</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    ${createMHQ8QRow('q8_4', '4. มีแผนการที่จะฆ่าตัวตาย')}
                    ${createMHQ8QRow('q8_5', '5. ได้เตรียมการที่จะทำร้ายตนเองหรือเตรียมการจะฆ่าตัวตายโดยตั้งใจว่าจะให้ตายจริง ๆ')}
                    ${createMHQ8QRow('q8_6', '6. ได้ทำให้ตนเองบาดเจ็บแต่ไม่ตั้งใจที่จะทำให้เสียชีวิต')}
                    ${createMHQ8QRow('q8_7', '7. ได้พยายามฆ่าตัวตายโดยคาดหวัง/ตั้งใจที่จะให้ตาย')}
                    ${createMHQ8QRow('q8_8', '8. (ตลอดชีวิตที่ผ่านมา) ท่านเคยพยายามฆ่าตัวตาย')}
                </div>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                    <p class="text-sm font-semibold text-slate-700 underline">แปลผล (คะแนนรวมทั้งหมด: <span id="mhq_8q_score_display">0</span>)</p>
                    <div class="flex items-center gap-2"><span id="mhq_8q_0_icon" class="text-lg">☐</span><span class="text-sm">0 &nbsp; ไม่มีแนวโน้มฆ่าตัวตายในปัจจุบัน</span></div>
                    <div class="flex items-center gap-2"><span id="mhq_8q_1to8_icon" class="text-lg">☐</span><span class="text-sm">1-8 &nbsp; มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับน้อย</span></div>
                    <div class="flex items-center gap-2"><span id="mhq_8q_9to16_icon" class="text-lg">☐</span><span class="text-sm">9-16 &nbsp; มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับปานกลาง</span></div>
                    <div class="flex items-center gap-2"><span id="mhq_8q_gte17_icon" class="text-lg">☐</span><span class="text-sm">≥ 17 &nbsp; มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับรุนแรง &nbsp; <strong class="text-red-600">ถ้าคะแนน 8Q ≥ 17 ส่งต่อโรงพยาบาลมีจิตแพทย์ด่วน</strong></span></div>
                </div>
                <div id="mhq_urgent_alert" class="hidden bg-red-100 border-2 border-red-400 text-red-800 rounded-lg p-3 font-bold text-center">
                    <i class="bi bi-exclamation-triangle-fill"></i> คะแนน 8Q ≥ 17 : ส่งต่อโรงพยาบาลมีจิตแพทย์ด่วน
                </div>
            </div>

            ${isIndependent ? `
            <div class="mt-4 flex gap-3">
                <button type="button" class="btn btn-primary" onclick="handleMHQSubmit()">บันทึกข้อมูลการประเมิน</button>
                <button type="button" class="btn btn-secondary" onclick="displayEMRTab()">กลับไป EMR</button>
            </div>
            ` : ''}
        </form>
    `;
}

function createMHQ2QRow(name, label) {
    return `
        <div class="flex flex-col md:flex-row md:items-center gap-2 border-b pb-2">
            <span class="text-slate-700 text-sm flex-grow">${label}</span>
            <div class="flex gap-3 flex-wrap md:justify-end flex-shrink-0">
                <div class="form-check form-check-inline m-0">
                    <input class="form-check-input mhq-radio" type="radio" name="${name}" id="${name}_yes" value="YES" onchange="calculateMHQScore()">
                    <label class="form-check-label text-sm text-red-600 font-medium" for="${name}_yes">YES</label>
                </div>
                <div class="form-check form-check-inline m-0">
                    <input class="form-check-input mhq-radio" type="radio" name="${name}" id="${name}_no" value="NO" onchange="calculateMHQScore()" checked>
                    <label class="form-check-label text-sm text-green-700 font-medium" for="${name}_no">NO</label>
                </div>
            </div>
        </div>
    `;
}

function createMHQ9QRow(name, label) {
    return `
        <tr>
            <td class="text-start">${label}</td>
            <td><input class="form-check-input mhq-radio" type="radio" name="${name}" value="0" onchange="calculateMHQScore()" checked></td>
            <td><input class="form-check-input mhq-radio" type="radio" name="${name}" value="1" onchange="calculateMHQScore()"></td>
            <td><input class="form-check-input mhq-radio" type="radio" name="${name}" value="2" onchange="calculateMHQScore()"></td>
            <td><input class="form-check-input mhq-radio" type="radio" name="${name}" value="3" onchange="calculateMHQScore()"></td>
        </tr>
    `;
}

function createMHQ8QRow(name, label, extraOnchange) {
    const extra = extraOnchange ? `${extraOnchange};` : '';
    return `
        <div class="flex flex-col md:flex-row md:items-center gap-2 border-b pb-2">
            <span class="text-slate-700 text-sm flex-grow">${label}</span>
            <div class="flex gap-3 flex-wrap md:justify-end flex-shrink-0">
                <div class="form-check form-check-inline m-0">
                    <input class="form-check-input mhq-radio" type="radio" name="${name}" id="${name}_yes" value="1" onchange="${extra}calculateMHQScore()">
                    <label class="form-check-label text-sm text-red-600 font-medium" for="${name}_yes">มี</label>
                </div>
                <div class="form-check form-check-inline m-0">
                    <input class="form-check-input mhq-radio" type="radio" name="${name}" id="${name}_no" value="0" onchange="${extra}calculateMHQScore()" checked>
                    <label class="form-check-label text-sm text-green-700 font-medium" for="${name}_no">ไม่มี</label>
                </div>
            </div>
        </div>
    `;
}

function toggleMHQ8Q3Sub() {
    const q3Checked = document.querySelector('input[name="q8_3"]:checked');
    const row = document.getElementById('mhq_q8_3b_row');
    if (row) row.style.display = (q3Checked && q3Checked.value === '1') ? 'block' : 'none';
}

function calculateMHQScore() {
    // --- Group 1: 2Q ---
    const q2_1 = document.querySelector('input[name="q2_1"]:checked');
    const q2_2 = document.querySelector('input[name="q2_2"]:checked');
    const has2qYes = (q2_1 && q2_1.value === 'YES') || (q2_2 && q2_2.value === 'YES');

    const el2qNo = document.getElementById('mhq_2q_no_icon');
    const el2qYes = document.getElementById('mhq_2q_yes_icon');
    if (el2qNo) el2qNo.textContent = has2qYes ? '☐' : '☑';
    if (el2qYes) el2qYes.textContent = has2qYes ? '☑' : '☐';

    const section9q = document.getElementById('mhq_9q_section');
    if (section9q) section9q.style.display = has2qYes ? 'block' : 'none';

    // --- Group 2: 9Q ---
    let score9q = 0;
    const q9Keys = ['q9_1', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_9'];
    q9Keys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked) score9q += parseInt(checked.value);
    });
    const total9qEl = document.getElementById('mhq_9q_total');
    if (total9qEl) total9qEl.textContent = `${score9q}/27`;
    const score9qDisplay = document.getElementById('mhq_9q_score_display');
    if (score9qDisplay) score9qDisplay.textContent = score9q;

    const setIcon = (id, cond) => { const el = document.getElementById(id); if (el) el.textContent = cond ? '☑' : '☐'; };
    setIcon('mhq_9q_lt7_icon', score9q < 7);
    setIcon('mhq_9q_7to12_icon', score9q >= 7 && score9q <= 12);
    setIcon('mhq_9q_13to18_icon', score9q >= 13 && score9q <= 18);
    setIcon('mhq_9q_gte19_icon', score9q >= 19);

    const showGroup3 = has2qYes && score9q >= 7;
    const section8q = document.getElementById('mhq_8q_section');
    if (section8q) section8q.style.display = showGroup3 ? 'block' : 'none';

    // --- Group 3: 8Q ---
    const q8Weights = { q8_1: 1, q8_2: 2, q8_3: 6, q8_3b: 8, q8_4: 8, q8_5: 9, q8_6: 4, q8_7: 10, q8_8: 4 };
    const q8Keys = ['q8_1', 'q8_2', 'q8_3', 'q8_4', 'q8_5', 'q8_6', 'q8_7', 'q8_8'];
    let score8q = 0;
    q8Keys.forEach(k => {
        const checked = document.querySelector(`input[name="${k}"]:checked`);
        if (checked && checked.value === '1') score8q += q8Weights[k];
    });
    const q3Checked = document.querySelector('input[name="q8_3"]:checked');
    const q3bChecked = document.querySelector('input[name="q8_3b"]:checked');
    if (q3Checked && q3Checked.value === '1' && q3bChecked && q3bChecked.value === '1') {
        score8q += q8Weights.q8_3b;
    }

    const total8qEl = document.getElementById('mhq_8q_total');
    if (total8qEl) total8qEl.textContent = score8q;
    const score8qDisplay = document.getElementById('mhq_8q_score_display');
    if (score8qDisplay) score8qDisplay.textContent = score8q;

    setIcon('mhq_8q_0_icon', score8q === 0);
    setIcon('mhq_8q_1to8_icon', score8q >= 1 && score8q <= 8);
    setIcon('mhq_8q_9to16_icon', score8q >= 9 && score8q <= 16);
    setIcon('mhq_8q_gte17_icon', score8q >= 17);

    const urgentAlert = document.getElementById('mhq_urgent_alert');
    if (urgentAlert) urgentAlert.classList.toggle('hidden', !(showGroup3 && score8q >= 17));

    // --- สรุปคะแนน/ผลรวมสำหรับตารางประวัติ ---
    let totalScore = 0;
    let resultStatus = '';
    if (!has2qYes) {
        totalScore = 0;
        resultStatus = '2Q : NO ทั้ง 2 ข้อ (ไม่มีความเสี่ยงซึมเศร้าเบื้องต้น)';
    } else {
        totalScore = score9q;
        if (score9q < 7) resultStatus = `9Q (${score9q} คะแนน) : ไม่มีอาการ/อาการน้อยมาก`;
        else if (score9q <= 12) resultStatus = `9Q (${score9q} คะแนน) : ซึมเศร้าระดับน้อย`;
        else if (score9q <= 18) resultStatus = `9Q (${score9q} คะแนน) : ซึมเศร้าระดับปานกลาง`;
        else resultStatus = `9Q (${score9q} คะแนน) : ซึมเศร้าระดับรุนแรง`;

        if (showGroup3) {
            totalScore = score8q;
            let level8q = '';
            if (score8q === 0) level8q = 'ไม่มีแนวโน้มฆ่าตัวตาย';
            else if (score8q <= 8) level8q = 'แนวโน้มฆ่าตัวตายระดับน้อย';
            else if (score8q <= 16) level8q = 'แนวโน้มฆ่าตัวตายระดับปานกลาง';
            else level8q = 'แนวโน้มฆ่าตัวตายระดับรุนแรง ⚠️ ส่งต่อด่วน';
            resultStatus += ` | 8Q (${score8q} คะแนน) : ${level8q}`;
        }
    }

    const totalDisplay = document.getElementById('mhq_total_score_display');
    if (totalDisplay) totalDisplay.textContent = totalScore;
    const resultDisplay = document.getElementById('mhq_result_display');
    if (resultDisplay) resultDisplay.textContent = resultStatus;
}

function getMHQFormData() {
    const form = document.getElementById('mhq-form');
    if (!form) return {};
    const data = Object.fromEntries(new FormData(form).entries());

    const totalScoreDisplay = document.getElementById('mhq_total_score_display');
    const resultDisplay = document.getElementById('mhq_result_display');
    data.total_score = totalScoreDisplay ? totalScoreDisplay.textContent : '0';
    data.result_status = resultDisplay ? resultDisplay.textContent : '';

    data.result_2q = (data.q2_1 === 'YES' || data.q2_2 === 'YES') ? 'YES' : 'NO';

    const score9qEl = document.getElementById('mhq_9q_score_display');
    const score9qNum = score9qEl ? (parseInt(score9qEl.textContent) || 0) : 0;
    data.score_9q = score9qNum;
    if (score9qNum < 7) data.result_9q = 'ไม่มีอาการ/น้อยมาก';
    else if (score9qNum <= 12) data.result_9q = 'ระดับน้อย';
    else if (score9qNum <= 18) data.result_9q = 'ระดับปานกลาง';
    else data.result_9q = 'ระดับรุนแรง';

    const score8qEl = document.getElementById('mhq_8q_score_display');
    const score8qNum = score8qEl ? (parseInt(score8qEl.textContent) || 0) : 0;
    data.score_8q = score8qNum;
    if (score8qNum === 0) data.result_8q = 'ไม่มีแนวโน้ม';
    else if (score8qNum <= 8) data.result_8q = 'ระดับน้อย';
    else if (score8qNum <= 16) data.result_8q = 'ระดับปานกลาง';
    else data.result_8q = 'ระดับรุนแรง';

    return data;
}

function openNewMHQForm() {
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createMHQFormHtml(true);
    formContainer.style.display = 'block';

    document.getElementById('mhq_PatientID').value = currentPatient.PatientID;
    document.getElementById('mhq_VisitDate').value = toBangkokDateStr(new Date());

    calculateMHQScore();
}

function editMHQForm(recordId) {
    showLoading('กำลังโหลดข้อมูลแบบประเมินสุขภาพจิต...');
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createMHQFormHtml(true);
    formContainer.style.display = 'block';

    google.script.run.withSuccessHandler(response => {
        Swal.close();
        if (response.status === 'success' && response.record) {
            const data = response.record;
            document.getElementById('mhq_RecordID').value = data.RecordID;
            document.getElementById('mhq_PatientID').value = data.PatientID;
            document.getElementById('mhq_VisitDate').value = data.VisitDate ? toBangkokDateStr(data.VisitDate) : '';

            const fields2q = ['q2_1', 'q2_2'];
            fields2q.forEach(field => {
                const val = data[field];
                if (val !== undefined) {
                    const radio = document.querySelector(`input[name="${field}"][value="${val}"]`);
                    if (radio) radio.checked = true;
                }
            });

            const fields9q = ['q9_1', 'q9_2', 'q9_3', 'q9_4', 'q9_5', 'q9_6', 'q9_7', 'q9_8', 'q9_9'];
            fields9q.forEach(field => {
                const val = data[field];
                if (val !== undefined && val !== '') {
                    const radio = document.querySelector(`input[name="${field}"][value="${val}"]`);
                    if (radio) radio.checked = true;
                }
            });

            const fields8q = ['q8_1', 'q8_2', 'q8_3', 'q8_3b', 'q8_4', 'q8_5', 'q8_6', 'q8_7', 'q8_8'];
            fields8q.forEach(field => {
                const val = data[field];
                if (val !== undefined && val !== '') {
                    const radio = document.querySelector(`input[name="${field}"][value="${val}"]`);
                    if (radio) radio.checked = true;
                }
            });

            toggleMHQ8Q3Sub();
            calculateMHQScore();
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).getMHQRecordById(recordId);
}

function handleMHQSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก...');
    const data = getMHQFormData();
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('MHQ');
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).saveMHQRecord(data);
}

function renderMHQHistory(records) {
    const columns = [
        { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) },
        { header: 'คะแนน', key: r => r.total_score },
        { header: 'แปลผล', key: r => r.result_status }
    ];
    const actions = r => `
        <button class="btn btn-outline-secondary btn-sm" onclick="editMHQForm('${r.RecordID}')">แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('MHQ', '${r.RecordID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('MHQ', '${r.RecordID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewMHQForm()">ประเมินสุขภาพจิตใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการประเมินสุขภาพจิต (2Q/9Q/8Q)', newButton, columns, actions);
}

function createDysphagiaFormHtml(isIndependent = true) {
    const title = 'แบบประเมินการกลืน (Dysphagia Swallowing Test)';
    return `
        <h4 class="text-xl font-bold text-teal-800 mb-4 flex items-center gap-2">
            <i class="bi bi-cup-straw"></i> ${title}
        </h4>
        <form id="dysphagia-form" class="space-y-6">
            <input type="hidden" name="RecordID" id="dys_RecordID">
            <input type="hidden" name="PatientID" id="dys_PatientID">
            <span id="dys_result_display" class="hidden">-</span>

            <!-- Patient Info -->
            <div class="bg-teal-50 border border-teal-200 p-4 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">ชื่อ-นามสกุลผู้รับบริการ</label>
                    <input type="text" id="dys_PatientName" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? currentPatient.PatientName : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">อายุ (ปี)</label>
                    <input type="text" id="dys_Age" class="form-control form-control-sm mt-1 bg-white" readonly value="${currentPatient ? calculateAge(currentPatient.DateOfBirth) : ''}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-teal-700 uppercase tracking-wider">วันที่ประเมิน</label>
                    <input type="date" id="dys_VisitDate" name="VisitDate" class="form-control form-control-sm mt-1">
                </div>
            </div>

            <!-- Group 1 -->
            <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                <h5 class="font-bold text-slate-800 border-b pb-2">Group 1 &nbsp; ประเมินความพร้อมในการทดสอบ</h5>
                <div class="space-y-3">
                    ${createDysRow('q1_1', '1. ผู้ป่วยรู้สึกตัวดี GCS ≥ 11 คะแนน')}
                    ${createDysRow('q1_2', '2. นั่งทรงตัวได้อย่างน้อย 15 นาที')}
                    ${createDysRow('q1_3', '3. สามารถทำตามคำสั่งได้อย่างน้อย 1 คำสั่ง')}
                </div>
                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                    <p class="text-sm font-semibold text-slate-700 underline">แปลผล</p>
                    <div class="flex items-center gap-2"><span id="dys_g1_fail_icon" class="text-lg">☐</span><span class="text-sm">NO อย่างน้อย 1 ข้อ</span></div>
                    <div class="flex items-center gap-2"><span id="dys_g1_pass_icon" class="text-lg">☐</span><span class="text-sm">YES ทั้ง 3 ข้อ - <strong>ประเมิน Group 2 ต่อ</strong></span></div>
                </div>
                <div id="dys_g1_fail_box" class="hidden bg-red-50 border-2 border-red-300 rounded-lg p-3 text-sm text-red-800 space-y-1">
                    <p class="font-bold"><i class="bi bi-exclamation-triangle-fill"></i> แนวทางการดูแล</p>
                    <ul class="list-disc pl-5 space-y-0.5">
                        <li>งดน้ำและอาหารทางปาก</li>
                        <li>Feeding tube</li>
                        <li>Oromotor stimulation</li>
                        <li>Proper oral care</li>
                        <li>Consult PM&amp;R</li>
                    </ul>
                </div>
            </div>

            <!-- Group 2 -->
            <div id="dys_g2_section" class="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3" style="display:none;">
                <h5 class="font-bold text-slate-800 border-b pb-2">Group 2 &nbsp; ขั้นตอนการประเมินการกลืน (LIST รายการประเมิน)</h5>
                <div class="space-y-3">
                    ${createDysRow('q2_1', '1. กลืนน้ำลายได้')}
                    ${createDysRow('q2_2', '2. ประเมินความสะอาดช่องปาก', false, 'handleOralCareChange()')}
                    ${createDysRow('q2_3', '3. จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 1', true)}
                    ${createDysRow('q2_4', '4. จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 2', true)}
                    ${createDysRow('q2_5', '5. จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 3', true)}
                    ${createDysRow('q2_6', '6. ดื่มน้ำเปล่าจากแก้ว 90 cc.', true)}
                    ${createDysRow('q2_7', '7. รับประทาน Regular diet โดยสังเกตอาการผิดปกติขณะรับประทานมื้อแรก', true)}
                </div>
                <div id="dys_g2_result_box" class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                    <p class="font-semibold underline mb-1">สรุปผลการประเมิน</p>
                    <p id="dys_g2_result_text">รอผลการประเมิน</p>
                </div>
            </div>

            ${isIndependent ? `
            <div class="mt-4 flex gap-3">
                <button type="button" class="btn btn-primary" onclick="handleDysphagiaSubmit()">บันทึกข้อมูลการประเมิน</button>
                <button type="button" class="btn btn-secondary" onclick="displayEMRTab()">กลับไป EMR</button>
            </div>
            ` : ''}
        </form>
    `;
}

function createDysRow(name, label, withSymptoms, extraOnchange) {
    const extra = extraOnchange ? `${extraOnchange};` : '';
    const symptomsHtml = withSymptoms ? `
        <div id="dys_${name}_symptoms" class="hidden mt-2 ml-1 pl-3 border-l-4 border-orange-300 bg-orange-50 rounded p-2">
            <p class="text-xs font-semibold text-slate-600 mb-1">ระบุอาการที่เกิดขึ้น:</p>
            <div class="flex flex-wrap gap-3">
                ${createDysSymCheckbox(name.replace(/^q/, ''), 'cough', 'ไอ')}
                ${createDysSymCheckbox(name.replace(/^q/, ''), 'choke', 'สำลัก')}
                ${createDysSymCheckbox(name.replace(/^q/, ''), 'tachypnea', 'หอบเหนื่อยหายใจเร็ว')}
                ${createDysSymCheckbox(name.replace(/^q/, ''), 'wetvoice', 'มีเสียงน้ำในลำคอ หลังจิบน้ำ')}
            </div>
        </div>
    ` : '';
    return `
        <div id="dys_${name}_row" class="border-b pb-3 transition-opacity">
            <div class="flex flex-col md:flex-row md:items-center gap-2">
                <span class="text-slate-700 text-sm flex-grow">${label}</span>
                <div class="flex gap-3 flex-wrap md:justify-end flex-shrink-0">
                    <div class="form-check form-check-inline m-0">
                        <input class="form-check-input dys-radio" type="radio" name="${name}" id="${name}_yes" value="YES" onchange="${extra}calculateDysphagiaResult()">
                        <label class="form-check-label text-sm text-green-700 font-medium" for="${name}_yes">YES</label>
                    </div>
                    <div class="form-check form-check-inline m-0">
                        <input class="form-check-input dys-radio" type="radio" name="${name}" id="${name}_no" value="NO" onchange="${extra}calculateDysphagiaResult()">
                        <label class="form-check-label text-sm text-red-600 font-medium" for="${name}_no">NO</label>
                    </div>
                </div>
            </div>
            ${symptomsHtml}
        </div>
    `;
}

function createDysSymCheckbox(step, sym, label) {
    return `
        <div class="form-check m-0">
            <input class="form-check-input" type="checkbox" id="sym${step}_${sym}" name="sym${step}_${sym}" value="1" onchange="calculateDysphagiaResult()">
            <label class="form-check-label text-xs" for="sym${step}_${sym}">${label}</label>
        </div>
    `;
}

function handleOralCareChange() {
    const checked = document.querySelector('input[name="q2_2"]:checked');
    if (checked && checked.value === 'NO') {
        Swal.fire({
            icon: 'warning',
            title: 'ทำความสะอาดช่องปาก',
            text: 'กรุณาทำความสะอาดช่องปากให้ผู้ป่วยก่อนประเมินข้อถัดไป',
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#0d9488',
            allowOutsideClick: false,
            allowEscapeKey: false
        });
    }
}

function calculateDysphagiaResult() {
    const getVal = (name) => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : null; };
    const setIcon = (id, cond) => { const el = document.getElementById(id); if (el) el.textContent = cond ? '☑' : '☐'; };

    // --- Group 1 ---
    const q1_1 = getVal('q1_1'), q1_2 = getVal('q1_2'), q1_3 = getVal('q1_3');
    const g1HasNo = (q1_1 === 'NO' || q1_2 === 'NO' || q1_3 === 'NO');
    const g1AllYes = (q1_1 === 'YES' && q1_2 === 'YES' && q1_3 === 'YES');

    setIcon('dys_g1_fail_icon', g1HasNo);
    setIcon('dys_g1_pass_icon', g1AllYes);

    const g1FailBox = document.getElementById('dys_g1_fail_box');
    if (g1FailBox) g1FailBox.classList.toggle('hidden', !g1HasNo);

    const g2Section = document.getElementById('dys_g2_section');
    if (g2Section) g2Section.style.display = g1AllYes ? 'block' : 'none';

    let resultText = 'รอผลการประเมิน';
    if (g1HasNo) {
        resultText = 'Group 1: NO อย่างน้อย 1 ข้อ - งดน้ำและอาหารทางปาก, Feeding tube, Oromotor stimulation, Proper oral care, Consult PM&R';
    }

    if (g1AllYes) {
        // --- Group 2: ประเมินตามลำดับขั้นตอน ---
        const steps = [
            { name: 'q2_1', label: 'กลืนน้ำลายได้', withSymptoms: false, blockOnNo: true },
            { name: 'q2_2', label: 'ความสะอาดช่องปาก', withSymptoms: false, blockOnNo: false },
            { name: 'q2_3', label: 'จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 1', withSymptoms: true, blockOnNo: true },
            { name: 'q2_4', label: 'จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 2', withSymptoms: true, blockOnNo: true },
            { name: 'q2_5', label: 'จิบน้ำเปล่า 1 ช้อนชา ครั้งที่ 3', withSymptoms: true, blockOnNo: true },
            { name: 'q2_6', label: 'ดื่มน้ำเปล่าจากแก้ว 90 cc.', withSymptoms: true, blockOnNo: true },
            { name: 'q2_7', label: 'รับประทาน Regular diet', withSymptoms: true, blockOnNo: true, isLast: true }
        ];

        let stopped = false;
        let stopStep = null;

        steps.forEach(step => {
            const row = document.getElementById(`dys_${step.name}_row`);
            const inputs = row ? row.querySelectorAll('input') : [];

            if (stopped) {
                inputs.forEach(inp => inp.disabled = true);
                if (row) row.classList.add('opacity-40');
                return;
            }
            inputs.forEach(inp => inp.disabled = false);
            if (row) row.classList.remove('opacity-40');

            const val = getVal(step.name);
            const symBox = document.getElementById(`dys_${step.name}_symptoms`);

            if (val === 'NO') {
                if (symBox) symBox.classList.remove('hidden');
                if (step.blockOnNo) { stopped = true; stopStep = step; }
            } else {
                if (symBox) symBox.classList.add('hidden');
                if (val === null) stopped = true; // ยังไม่ตอบ ให้รอก่อนประเมินข้อถัดไป
            }
        });

        if (stopStep) {
            if (stopStep.name === 'q2_1') {
                resultText = 'ข้อ 1 กลืนน้ำลายไม่ได้ - งดน้ำและอาหารทางปาก, Feeding tube';
            } else if (stopStep.name === 'q2_7') {
                resultText = 'ข้อ 7 พบอาการผิดปกติขณะรับประทาน Regular diet - ปรับอาหาร (Diet modification: โจ๊กข้นปั่น/ข้าวต้มบดละเอียด), Compensation technique, Consult PM&R';
            } else {
                resultText = `หยุดที่ข้อ ${stopStep.name.replace('q2_', '')} (${stopStep.label}) พบอาการผิดปกติ - งดน้ำและอาหารทางปาก, Feeding tube, Oromotor stimulation, Proper oral care, Consult PM&R`;
            }
        } else {
            const allAnswered = steps.every(s => getVal(s.name) !== null);
            if (allAnswered && getVal('q2_7') === 'YES') {
                resultText = 'ผ่านการประเมินครบทุกขั้นตอน - รับประทาน Regular diet';
            } else if (!allAnswered) {
                resultText = 'กำลังประเมิน Group 2 (ยังตอบไม่ครบทุกข้อ)';
            }
        }

        const g2ResultText = document.getElementById('dys_g2_result_text');
        if (g2ResultText) g2ResultText.textContent = resultText;
    }

    const resultDisplay = document.getElementById('dys_result_display');
    if (resultDisplay) resultDisplay.textContent = resultText;
}

function getDysphagiaFormData() {
    const form = document.getElementById('dysphagia-form');
    if (!form) return {};
    const data = Object.fromEntries(new FormData(form).entries());

    const resultDisplay = document.getElementById('dys_result_display');
    data.result_status = resultDisplay ? resultDisplay.textContent : '';
    data.total_score = data.result_status ? data.result_status.split(' - ')[0] : '-';
    data.result_group1 = (data.q1_1 === 'NO' || data.q1_2 === 'NO' || data.q1_3 === 'NO')
        ? 'FAIL'
        : ((data.q1_1 === 'YES' && data.q1_2 === 'YES' && data.q1_3 === 'YES') ? 'PASS' : '');

    return data;
}

function openNewDysphagiaForm() {
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createDysphagiaFormHtml(true);
    formContainer.style.display = 'block';

    document.getElementById('dys_PatientID').value = currentPatient.PatientID;
    document.getElementById('dys_VisitDate').value = toBangkokDateStr(new Date());

    calculateDysphagiaResult();
}

function editDysphagiaForm(recordId) {
    showLoading('กำลังโหลดข้อมูลแบบประเมินการกลืน...');
    const area = document.getElementById('history-container');
    if (area) area.style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = createDysphagiaFormHtml(true);
    formContainer.style.display = 'block';

    google.script.run.withSuccessHandler(response => {
        Swal.close();
        if (response.status === 'success' && response.record) {
            const data = response.record;
            document.getElementById('dys_RecordID').value = data.RecordID;
            document.getElementById('dys_PatientID').value = data.PatientID;
            document.getElementById('dys_VisitDate').value = data.VisitDate ? toBangkokDateStr(data.VisitDate) : '';

            const radioFields = ['q1_1', 'q1_2', 'q1_3', 'q2_1', 'q2_2', 'q2_3', 'q2_4', 'q2_5', 'q2_6', 'q2_7'];
            radioFields.forEach(field => {
                const val = data[field];
                if (val) {
                    const radio = document.querySelector(`input[name="${field}"][value="${val}"]`);
                    if (radio) radio.checked = true;
                }
            });

            const symSteps = ['2_3', '2_4', '2_5', '2_6', '2_7'];
            symSteps.forEach(step => {
                ['cough', 'choke', 'tachypnea', 'wetvoice'].forEach(sym => {
                    const field = `sym${step}_${sym}`;
                    if (Number(data[field]) === 1) {
                        const cb = document.getElementById(field);
                        if (cb) cb.checked = true;
                    }
                });
            });

            calculateDysphagiaResult();
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).getDysphagiaRecordById(recordId);
}

function handleDysphagiaSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก...');
    const data = getDysphagiaFormData();
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('Dysphagia');
        } else {
            showError(response);
        }
    }).withFailureHandler(showError).saveDysphagiaRecord(data);
}

function renderDysphagiaHistory(records) {
    const columns = [
        { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) },
        { header: 'ผลการประเมิน', key: r => r.result_status }
    ];
    const actions = r => `
        <button class="btn btn-outline-secondary btn-sm" onclick="editDysphagiaForm('${r.RecordID}')">แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('Dysphagia', '${r.RecordID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('Dysphagia', '${r.RecordID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewDysphagiaForm()">ประเมินการกลืนใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการประเมินการกลืน (Dysphagia)', newButton, columns, actions);
}

  const exactTypes = new Set(['TMSE','MHQ','Dysphagia']);

  async function showExactHistory(type) {
    const area = document.getElementById('service-form-area');
    if (!area || !window.currentPatient && typeof currentPatient === 'undefined') return;
    const patient = (typeof currentPatient !== 'undefined') ? currentPatient : window.currentPatient;
    if (!patient?.PatientID) return;
    area.style.display = 'block';
    area.innerHTML = '<div class="text-center p-5">กำลังโหลดประวัติ...</div>';

    const methodMap = {
      TMSE: 'getTMSERecordsByPatientId',
      MHQ: 'getMHQRecordsByPatientId',
      Dysphagia: 'getDysphagiaRecordsByPatientId'
    };
    const renderMap = {
      TMSE: renderTmseHistory,
      MHQ: renderMHQHistory,
      Dysphagia: renderDysphagiaHistory
    };
    try {
      const res = await window.google.script.run[methodMap[type]](patient.PatientID);
      if (!res || res.status !== 'success') {
        showError(res || {message:'โหลดประวัติไม่สำเร็จ'});
        return;
      }
      renderMap[type](res.records || []);
    } catch (err) {
      showError({message: err?.message || String(err)});
    }
  }

  const originalShowHistory = window.showHistory;
  window.showHistory = function(type) {
    if (exactTypes.has(type)) return showExactHistory(type);
    return originalShowHistory.apply(this, arguments);
  };

  const originalSubView = window.showServiceSubView;
  window.showServiceSubView = function(type, recordId = null) {
    if (exactTypes.has(type)) {
      if (recordId) {
        if (type === 'TMSE') return editTMSEForm(recordId);
        if (type === 'MHQ') return editMHQForm(recordId);
        if (type === 'Dysphagia') return editDysphagiaForm(recordId);
      }
      return showExactHistory(type);
    }
    return originalSubView.apply(this, arguments);
  };

  window.createTmseFormHtml = createTmseFormHtml;
  window.createTmseQuestionRow = createTmseQuestionRow;
  window.createTmseRadioOptions = createTmseRadioOptions;
  window.calculateTmseScore = calculateTmseScore;
  window.renderTmseHistory = renderTmseHistory;
  window.openNewTMSEForm = openNewTMSEForm;
  window.editTMSEForm = editTMSEForm;
  window.getTmseFormData = getTmseFormData;
  window.handleTmseSubmit = handleTmseSubmit;
  window.toggleTmseForm = toggleTmseForm;
  window.saveTmseFromParent = saveTmseFromParent;

  window.createMHQFormHtml = createMHQFormHtml;
  window.createMHQ2QRow = createMHQ2QRow;
  window.createMHQ9QRow = createMHQ9QRow;
  window.createMHQ8QRow = createMHQ8QRow;
  window.toggleMHQ8Q3Sub = toggleMHQ8Q3Sub;
  window.calculateMHQScore = calculateMHQScore;
  window.getMHQFormData = getMHQFormData;
  window.openNewMHQForm = openNewMHQForm;
  window.editMHQForm = editMHQForm;
  window.handleMHQSubmit = handleMHQSubmit;
  window.renderMHQHistory = renderMHQHistory;

  window.createDysphagiaFormHtml = createDysphagiaFormHtml;
  window.createDysRow = createDysRow;
  window.createDysSymCheckbox = createDysSymCheckbox;
  window.handleOralCareChange = handleOralCareChange;
  window.calculateDysphagiaResult = calculateDysphagiaResult;
  window.getDysphagiaFormData = getDysphagiaFormData;
  window.openNewDysphagiaForm = openNewDysphagiaForm;
  window.editDysphagiaForm = editDysphagiaForm;
  window.handleDysphagiaSubmit = handleDysphagiaSubmit;
  window.renderDysphagiaHistory = renderDysphagiaHistory;

  console.log('[IMC] Exact GAS TMSE/MHQ/Dysphagia forms loaded');
})();
