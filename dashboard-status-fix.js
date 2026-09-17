// ============================================================================
// Dashboard status fix
// Status is calculated from DISTINCT scheduled visit dates vs DISTINCT actual
// visit dates, per the clinic's agreed rules.
// ============================================================================
(function () {
  const STATUS = {
    completed: 'สำเร็จ',
    inProgress: 'อยู่ในกระบวนการบำบัด',
    waiting: 'รอเยี่ยม',
    unscheduled: 'ยังไม่กำหนดวันเยี่ยม'
  };

  function dateKey(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  function patientKey(value) {
    return String(value ?? '').trim();
  }

  async function calculateVisitProgress() {
    const client = window.supabaseClient;
    if (!client) throw new Error('Supabase client is not available');

    const [patientsRes, schedulesRes, opdRes, soapRes] = await Promise.all([
      client.from('Patients').select('PatientID, PatientStatus'),
      client.from('Schedules').select('PatientID, ScheduledDate'),
      client.from('OPDRecords').select('PatientID, VisitDate'),
      client.from('SOAPNotes').select('PatientID, VisitDate')
    ]);

    const firstError = [patientsRes, schedulesRes, opdRes, soapRes].find(r => r.error);
    if (firstError) throw firstError.error;

    const scheduled = new Map();
    (schedulesRes.data || []).forEach(row => {
      const pid = patientKey(row.PatientID);
      const day = dateKey(row.ScheduledDate);
      if (!pid || !day) return;
      if (!scheduled.has(pid)) scheduled.set(pid, new Set());
      scheduled.get(pid).add(day);
    });

    const actual = new Map();
    [...(opdRes.data || []), ...(soapRes.data || [])].forEach(row => {
      const pid = patientKey(row.PatientID);
      const day = dateKey(row.VisitDate);
      if (!pid || !day) return;
      if (!actual.has(pid)) actual.set(pid, new Set());
      actual.get(pid).add(day);
    });

    const progress = {
      [STATUS.completed]: 0,
      [STATUS.inProgress]: 0,
      [STATUS.waiting]: 0,
      [STATUS.unscheduled]: 0,
      'เลยกำหนด': 0,
      'สิ้นสุดการรักษา': 0,
      'ปิดบริการ': 0
    };

    (patientsRes.data || []).forEach(patient => {
      if (patient.PatientStatus === 'Discharged') {
        progress['ปิดบริการ']++;
        return;
      }

      const pid = patientKey(patient.PatientID);
      const scheduledDates = scheduled.get(pid) || new Set();
      const actualDates = actual.get(pid) || new Set();
      const total = scheduledDates.size;

      // Only visits that correspond to an actual scheduled date count toward
      // completion. This also prevents duplicate OPD/SOAP rows from inflating
      // the number of completed visit days.
      let completed = 0;
      scheduledDates.forEach(day => {
        if (actualDates.has(day)) completed++;
      });

      if (total === 0) {
        progress[STATUS.unscheduled]++;
      } else if (completed === 0) {
        progress[STATUS.waiting]++;
      } else if (completed < total) {
        progress[STATUS.inProgress]++;
      } else {
        // All scheduled dates have a corresponding actual visit date.
        progress[STATUS.completed]++;
      }
    });

    return progress;
  }

  function install() {
    if (typeof window.renderDashboard !== 'function') return;
    if (window.__imcDashboardStatusFixInstalled) return;

    const originalRenderDashboard = window.renderDashboard;
    window.renderDashboard = async function (data) {
      try {
        const correctedProgress = await calculateVisitProgress();
        const correctedData = { ...(data || {}), visitProgress: correctedProgress };
        return originalRenderDashboard(correctedData);
      } catch (error) {
        console.error('[DashboardStatusFix] Failed to calculate corrected status:', error);
        return originalRenderDashboard(data);
      }
    };

    window.__imcDashboardStatusFixInstalled = true;
    console.info('[DashboardStatusFix] Installed');
  }

  install();
  window.addEventListener('imc-views-loaded', install, { once: false });
  setTimeout(install, 0);
  setTimeout(install, 250);
})();
