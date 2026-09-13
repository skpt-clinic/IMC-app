// ============================================================================
// PATIENT LIST IMPROVEMENTS
// - Add Plan column after Next Appointment (latest SOAP visit Plan)
// - Disable appointment actions when registered DueDate has been reached
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

      if (Array.isArray(window.allPatients)) {
        window.allPatients.forEach(patient => {
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
    if (!thead || !tbody || typeof currentPatientTab !== 'undefined' && currentPatientTab !== 'Active') return;

    const headers = Array.from(thead.querySelectorAll('th'));
    if (!headers.length) return;
    if (headers.some(th => th.textContent.trim() === 'Plan')) return;

    // Plan goes immediately after Next Appointment.
    const nextIndex = headers.findIndex(th => th.textContent.trim() === 'วันนัดถัดไป');
    const planTh = document.createElement('th');
    planTh.className = 'px-6 py-3 text-center whitespace-nowrap min-w-[220px]';
    planTh.textContent = 'Plan';
    if (nextIndex >= 0 && headers[nextIndex].nextSibling) {
      thead.insertBefore(planTh, headers[nextIndex].nextSibling);
    } else {
      thead.appendChild(planTh);
    }

    Array.from(tbody.querySelectorAll('tr')).forEach(row => {
      const cells = Array.from(row.children);
      // Date/group/empty rows are handled by colspan and should not get a Plan cell.
      if (cells.length !== headers.length) return;
      const patientCell = cells[1];
      const name = patientCell?.textContent?.trim() || '';
      if (!name) return;

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
    if (!Array.isArray(window.allPatients)) return null;
    const cells = row ? Array.from(row.children) : [];
    const cn = cells[0]?.textContent?.trim();
    if (!cn) return null;
    return window.allPatients.find(p => String(p.ClinicNumber || '').trim() === cn) || null;
  }

  function updateAppointmentControls() {
    const tbody = document.getElementById('patient-table-body');
    if (!tbody || typeof currentPatientTab !== 'undefined' && currentPatientTab !== 'Active') return;

    tbody.querySelectorAll('tr').forEach(row => {
      const patient = findPatientForRow(row);
      if (!patient || !isDueReached(patient)) return;

      // Disable every appointment trigger in this patient row.
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
    if (typeof currentPatientTab !== 'undefined' && currentPatientTab !== 'Active') return;
    await loadLatestPlans();
    if (Array.isArray(window.allPatients)) {
      window.allPatients.forEach(patient => {
        const pid = String(patient.PatientID || '').trim();
        if (planMap[pid]) patient.LatestPlan = planMap[pid].Plan ?? '';
      });
    }
    addPlanColumn();
    updateAppointmentControls();
  }

  function installWrapper() {
    if (typeof window.displayPatients !== 'function') return false;
    if (window.displayPatients.__patientListImproved) return true;
    originalDisplayPatients = window.displayPatients;

    const wrapped = function (list) {
      originalDisplayPatients(list);
      // Render immediately with cached data, then refresh after latest Plans are loaded.
      addPlanColumn();
      updateAppointmentControls();
      refreshPatientListEnhancements();
    };
    wrapped.__patientListImproved = true;
    window.displayPatients = wrapped;
    return true;
  }

  // displayPatients is declared by app.js before this file is loaded.
  if (!installWrapper()) {
    const timer = setInterval(() => {
      if (installWrapper()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  }

  // Defense in depth: even if another UI path tries to trigger the appointment button,
  // block it for patients whose registered DueDate has been reached.
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
