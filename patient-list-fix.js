// ============================================================================
// PATIENT LIST IMPROVEMENTS
// - Add Plan column after Next Appointment (latest SOAP visit Plan)
// - Disable appointment actions when registered DueDate has been reached
// - Mark patients whose DueDate is today or earlier in red with a warning icon
// ============================================================================
(function () {
  'use strict';

  let planLoadPromise = null;
  let planMap = {};
  let originalDisplayPatients = null;

  function dateOnly(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const raw = value.trim();
      const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      const thai = raw.match(/^(\d{1,2})[\\/-](\d{1,2})[\\/-](\d{4})$/);
      if (thai) {
        const year = Number(thai[3]) > 2400 ? Number(thai[3]) - 543 : Number(thai[3]);
        return `${year}-${String(thai[2]).padStart(2, '0')}-${String(thai[1]).padStart(2, '0')}`;
      }
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayBangkok() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  }

  function isDueReached(patient) {
    const due = dateOnly(patient && patient.DueDate);
    return !!due && due <= todayBangkok();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadLatestPlans() {
    if (planLoadPromise) return planLoadPromise;
    planLoadPromise = (async () => {
      const client = window.supabaseClient;
      if (!client) return;
      const { data, error } = await client
        .from('SOAPNotes')
        .select('PatientID, VisitDate, VisitCount, Plan')
        .order('VisitDate', { ascending: false });
      if (error) {
        console.warn('Unable to load latest SOAP Plans:', error);
        return;
      }

      const latest = {};
      (data || []).forEach(row => {
        const pid = String(row.PatientID || '').trim();
        if (!pid || latest[pid]) return;
        latest[pid] = row;
      });
      planMap = latest;

      if (Array.isArray(allPatients)) {
        allPatients.forEach(patient => {
          const pid = String(patient.PatientID || '').trim();
          patient.LatestPlan = latest[pid]?.Plan ?? '';
          patient.LatestPlanVisitDate = latest[pid]?.VisitDate ?? null;
        });
      }
    })().catch(error => console.warn('Latest Plan load exception:', error));
    return planLoadPromise;
  }

  function addPlanColumn() {
    const thead = document.getElementById('patient-table-header');
    const tbody = document.getElementById('patient-table-body');
    if (!thead || !tbody || (typeof currentPatientTab !== 'undefined' && currentPatientTab !== 'Active')) return;

    const headers = Array.from(thead.querySelectorAll('th'));
    if (!headers.length || headers.some(th => th.textContent.trim() === 'Plan')) return;

    const nextIndex = headers.findIndex(th => th.textContent.trim() === 'วันนัดถัดไป');
    const planTh = document.createElement('th');
    planTh.className = 'px-6 py-3 text-center whitespace-nowrap min-w-[220px]';
    planTh.textContent = 'Plan';
    if (nextIndex >= 0 && headers[nextIndex].nextSibling) thead.insertBefore(planTh, headers[nextIndex].nextSibling);
    else thead.appendChild(planTh);

    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
      const cells = Array.from(row.children);
      if (cells.length !== headers.length) return;
      if (!cells[1]?.textContent?.trim()) return;

      const planCell = document.createElement('td');
      planCell.className = 'p-3 border-b text-sm text-gray-600 min-w-[220px] max-w-[320px]';
      const patient = findPatientForRow(row);
      const pid = patient ? String(patient.PatientID || '').trim() : '';
      const plan = patient?.LatestPlan ?? planMap[pid]?.Plan ?? '';
      planCell.innerHTML = plan
        ? `<div class="whitespace-pre-line leading-relaxed" title="${escapeHtml(plan)}">${escapeHtml(plan)}</div>`
        : '<span class="text-gray-300">-</span>';

      const nextCell = cells[nextIndex >= 0 ? nextIndex : cells.length - 3];
      if (nextCell?.nextSibling) row.insertBefore(planCell, nextCell.nextSibling);
      else row.appendChild(planCell);
    });
  }

  function findPatientForRow(row) {
    if (!Array.isArray(allPatients)) return null;
    const cells = row ? Array.from(row.children) : [];
    const cn = cells[0]?.textContent?.trim();
    if (!cn) return null;
    return allPatients.find(p => String(p.ClinicNumber || '').trim() === cn) || null;
  }

  function markDuePatients() {
    const tbody = document.getElementById('patient-table-body');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(row => {
      const patient = findPatientForRow(row);
      if (!patient) return;

      const warningClass = 'imc-due-warning-icon';
      const existing = row.querySelector(`.${warningClass}`);
      const dueReached = isDueReached(patient);

      if (!dueReached) {
        if (existing) existing.remove();
        row.classList.remove('imc-due-patient');
        return;
      }

      row.classList.add('imc-due-patient');
      row.style.setProperty('color', '#dc2626', 'important');
      row.querySelectorAll('*').forEach(el => {
        // Keep warning icon styling under our control; all normal row text becomes red.
        if (!el.classList.contains(warningClass)) {
          el.style.setProperty('color', '#dc2626', 'important');
        }
      });

      if (existing) return;

      const cells = Array.from(row.children);
      let nameCell = null;
      const patientName = String(patient.PatientName || '').trim();
      if (patientName) {
        nameCell = cells.find(cell => String(cell.textContent || '').includes(patientName));
      }
      // Fallback: in the current registry the patient name is the second cell.
      if (!nameCell) nameCell = cells[1] || cells[0];
      if (!nameCell) return;

      const icon = document.createElement('span');
      icon.className = warningClass;
      icon.setAttribute('title', 'ถึงวันครบกำหนด/เลยวันครบกำหนดแล้ว');
      icon.setAttribute('aria-label', 'ถึงวันครบกำหนด');
      icon.style.cssText = 'display:inline-block;margin-left:6px;font-weight:700;color:#dc2626 !important;';
      icon.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i>';
      nameCell.appendChild(icon);
    });
  }

  function updateAppointmentControls() {
    const tbody = document.getElementById('patient-table-body');
    if (!tbody || (typeof currentPatientTab !== 'undefined' && currentPatientTab !== 'Active')) return;

    tbody.querySelectorAll('tr').forEach(row => {
      const patient = findPatientForRow(row);
      if (!patient || !isDueReached(patient)) return;

      row.querySelectorAll('[onclick*="openScheduleModal"]').forEach(el => {
        el.removeAttribute('onclick');
        el.classList.remove('bg-teal-500', 'hover:bg-teal-600', 'text-teal-600', 'hover:text-teal-800');
        el.classList.add('bg-gray-300', 'text-gray-500', 'cursor-not-allowed', 'opacity-70');
        el.setAttribute('title', 'ครบกำหนดการให้บริการแล้ว ไม่สามารถลงนัดหมายได้');
        el.setAttribute('aria-disabled', 'true');
        if (el.tagName === 'BUTTON') el.disabled = true;
        el.innerHTML = el.innerHTML.replace(/calendar-plus/g, 'calendar-x');
      });
    });
  }

  async function refreshPatientListEnhancements() {
    await loadLatestPlans();
    addPlanColumn();
    markDuePatients();
    updateAppointmentControls();
  }

  function installWrapper() {
    if (typeof window.displayPatients !== 'function') return false;
    if (window.displayPatients.__patientListImproved) return true;
    originalDisplayPatients = window.displayPatients;

    const wrapped = function (list) {
      originalDisplayPatients(list);
      markDuePatients();
      addPlanColumn();
      updateAppointmentControls();
      refreshPatientListEnhancements();
    };
    wrapped.__patientListImproved = true;
    window.displayPatients = wrapped;
    return true;
  }

  if (!installWrapper()) {
    const timer = setInterval(() => {
      if (installWrapper()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  }

  document.addEventListener('click', function (event) {
    const target = event.target?.closest?.('[onclick*="openScheduleModal"]');
    if (!target) return;
    const row = target.closest('tr');
    const patient = findPatientForRow(row);
    if (patient && isDueReached(patient)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'info',
          title: 'ครบกำหนดการให้บริการแล้ว',
          text: 'ผู้ป่วยรายนี้ไม่สามารถลงนัดหมายได้ เนื่องจากถึงวันครบกำหนดที่ลงทะเบียนไว้แล้ว',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0d9488'
        });
      }
    }
  }, true);
})();