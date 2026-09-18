// ============================================================================
// Schedule display / refresh hardening
// Keeps appointment dates consistent in Asia/Bangkok and refreshes every
// schedule-dependent UI directly from Supabase.
// ============================================================================
(function () {
  'use strict';

  const TZ = 'Asia/Bangkok';

  function bangkokDateKey(value) {
    if (!value) return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const get = type => parts.find(p => p.type === type)?.value || '';
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  function localDateInputValue(value) {
    return bangkokDateKey(value);
  }

  function sortSchedules(rows) {
    return (rows || []).slice().sort((a, b) =>
      (Number(a.VisitNumber) || 0) - (Number(b.VisitNumber) || 0)
    );
  }

  async function fetchSchedules() {
    const client = window.supabaseClient;
    if (!client) throw new Error('ไม่พบการเชื่อมต่อ Supabase');
    const { data, error } = await client
      .from('Schedules')
      .select('ScheduleID,PatientID,VisitNumber,ScheduledDate,Status,QueueIndex,ScheduleZone')
      .order('ScheduledDate', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function refreshScheduleState(patientId) {
    try {
      const rows = await fetchSchedules();
      allScheduleData = rows;

      const todayKey = bangkokDateKey(new Date());
      (allPatients || []).forEach(patient => {
        const pid = String(patient.PatientID || '').trim();
        const schedules = rows.filter(r => String(r.PatientID || '').trim() === pid);
        const actual = Array.isArray(patient.actualVisits) ? patient.actualVisits : [];

        const upcoming = schedules
          .map(r => ({ row: r, key: bangkokDateKey(r.ScheduledDate) }))
          .filter(x => x.key && x.key >= todayKey)
          .filter(x => !actual.includes(x.key))
          .sort((a, b) => a.key.localeCompare(b.key));

        patient.NextAppointment = upcoming[0]?.row?.ScheduledDate || null;
        patient.scheduleInfo = {
          completed: actual.length,
          total: schedules.length
        };
      });

      if (typeof filterPatients === 'function') filterPatients();

      if (patientId && typeof currentPatient !== 'undefined' && currentPatient &&
          String(currentPatient.PatientID) === String(patientId)) {
        const fresh = allPatients.find(p => String(p.PatientID) === String(patientId));
        if (fresh) currentPatient = fresh;
      }

      console.info('[ScheduleDisplayFix] Refreshed', rows.length, 'schedule records');
      return rows;
    } catch (error) {
      console.error('[ScheduleDisplayFix] Refresh failed:', error);
      throw error;
    }
  }

  function buildScheduleModal(patientId, records) {
    const container = document.getElementById('schedule-date-inputs');
    if (!container) return;

    const sorted = sortSchedules(records);
    const nextVisitNum = sorted.length
      ? Math.max(...sorted.map(r => Number(r.VisitNumber) || 0)) + 1
      : 1;

    let html = `<div class="mb-4"><h6 class="text-sm font-bold text-gray-700 mb-2">รายการนัดหมาย (${sorted.length})</h6><div class="space-y-2 max-h-[200px] overflow-y-auto pr-1">`;

    if (!sorted.length) {
      html += '<div class="text-center text-gray-400 text-sm py-2 bg-gray-50 rounded">ยังไม่มีรายการนัดหมาย</div>';
    } else {
      sorted.forEach(r => {
        const dateVal = localDateInputValue(r.ScheduledDate);
        const isCompleted = r.Status === 'Completed';
        const displayDate = typeof formatThaiDate === 'function' ? formatThaiDate(r.ScheduledDate) : dateVal;
        html += `
          <div class="flex items-center justify-between bg-white border border-gray-200 p-2 rounded text-sm group">
            <div class="flex items-center gap-2">
              <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-medium">#${r.VisitNumber}</span>
              <span class="${isCompleted ? 'text-green-600 line-through' : 'text-gray-800'}">${displayDate}</span>
            </div>
            <div class="flex items-center gap-2">
              ${isCompleted
                ? '<span class="text-green-600 text-xs flex items-center"><i class="bi bi-check-circle-fill mr-1"></i>เยี่ยมแล้ว</span>'
                : `<input type="date" class="form-control form-control-sm w-32 schedule-existing-input" value="${dateVal}" data-visit="${r.VisitNumber}">
                   <button onclick="deleteScheduleItem('${patientId}', ${r.VisitNumber})" class="text-gray-400 hover:text-red-500 transition px-1" title="ลบรายการ"><i class="bi bi-trash"></i></button>`}
            </div>
          </div>`;
      });
    }

    html += `</div></div>
      <div class="bg-teal-50 p-3 rounded-lg border border-teal-100">
        <label class="block text-teal-800 text-sm font-bold mb-2">
          <i class="bi bi-calendar-plus-fill mr-1"></i> นัดหมายครั้งถัดไป (ครั้งที่ ${nextVisitNum})
        </label>
        <div class="flex gap-2">
          <input type="date" id="new-schedule-date" class="form-control text-sm border-teal-200 focus:ring-teal-500 focus:border-teal-500">
          <input type="hidden" id="new-visit-number" value="${nextVisitNum}">
        </div>
      </div>`;

    container.innerHTML = html;
  }

  async function openScheduleModalFixed(patientId) {
    currentPatient = (allPatients || []).find(p => String(p.PatientID) === String(patientId));
    if (!currentPatient) return;

    showLoading('กำลังโหลดข้อมูลนัด...');
    document.getElementById('schedulePatientId').value = patientId;
    document.getElementById('schedulePatientName').textContent = currentPatient.PatientName;

    const dueDateEl = document.getElementById('scheduleDueDate');
    if (dueDateEl) dueDateEl.textContent = formatThaiDate(currentPatient.DueDate || new Date());

    try {
      const client = window.supabaseClient;
      const { data, error } = await client
        .from('Schedules')
        .select('ScheduleID,PatientID,VisitNumber,ScheduledDate,Status,QueueIndex,ScheduleZone')
        .eq('PatientID', patientId)
        .order('VisitNumber', { ascending: true });

      if (error) throw error;
      buildScheduleModal(patientId, data || []);
      if (typeof scheduleModal !== 'undefined' && scheduleModal) scheduleModal.show();
      Swal.close();
    } catch (error) {
      Swal.close();
      showError(error);
    }
  }

  function showScheduleViewFixed() {
    setActiveView('schedule-view', 'ตารางนัดหมาย');
    showLoading('กำลังโหลดข้อมูลตารางนัด...');

    fetchSchedules().then(rows => {
      allScheduleData = rows;
      const dateFilter = document.getElementById('schedule-date-filter');
      if (!dateFilter) return;

      if (!dateFilter.value) dateFilter.value = bangkokDateKey(new Date());

      dateFilter.onchange = () => renderDailyScheduleList(dateFilter.value);
      renderDailyScheduleList(dateFilter.value);
      renderMonthlyCalendar(currentCalendarDate);

      const prev = document.getElementById('prev-month-btn');
      const next = document.getElementById('next-month-btn');
      if (prev) prev.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderMonthlyCalendar(currentCalendarDate);
      };
      if (next) next.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderMonthlyCalendar(currentCalendarDate);
      };

      Swal.close();
    }).catch(error => {
      Swal.close();
      showError(error);
    });
  }

  // Patch the two existing renderers so ISO timestamps are interpreted in
  // Bangkok time instead of comparing the UTC date portion.
  const originalDaily = window.renderDailyScheduleList;
  if (typeof originalDaily === 'function') {
    window.renderDailyScheduleList = function (dateString) {
      // Temporarily normalize only the records consumed by the original renderer.
      const normalized = (allScheduleData || []).map(s => ({ ...s, __localDate: bangkokDateKey(s.ScheduledDate) }));
      const backup = allScheduleData;
      allScheduleData = normalized.map(s => ({ ...s, ScheduledDate: s.__localDate }));
      try {
        return originalDaily(dateString);
      } finally {
        allScheduleData = backup;
      }
    };
  }

  const originalCalendar = window.renderMonthlyCalendar;
  if (typeof originalCalendar === 'function') {
    window.renderMonthlyCalendar = function (date) {
      const normalized = (allScheduleData || []).map(s => ({ ...s, __localDate: bangkokDateKey(s.ScheduledDate) }));
      const backup = allScheduleData;
      allScheduleData = normalized.map(s => ({ ...s, ScheduledDate: s.__localDate }));
      try {
        return originalCalendar(date);
      } finally {
        allScheduleData = backup;
      }
    };
  }

  window.__imcBangkokScheduleDateKey = bangkokDateKey;
  window.refreshScheduleState = refreshScheduleState;
  window.openScheduleModal = openScheduleModalFixed;
  window.showScheduleView = showScheduleViewFixed;

  console.info('[ScheduleDisplayFix] Installed');
})();
