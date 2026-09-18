// ============================================================================
// Immediate patient-detail appointment refresh
// ============================================================================
(function () {
  'use strict';

  const TZ = 'Asia/Bangkok';

  function dateKey(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const get = t => parts.find(p => p.type === t)?.value || '';
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  function render(records) {
    const tableContainer = document.getElementById('patient-schedule-table-container');
    if (!tableContainer) return;

    if (!records.length) {
      tableContainer.innerHTML = '<div class="text-center py-10"><i class="bi bi-calendar-x text-gray-300" style="font-size:3rem"></i><p class="text-gray-400 mt-2">ไม่พบประวัติการนัดหมายหรือการเยี่ยม</p></div>';
      return;
    }

    let html = '<table class="w-full text-sm align-middle"><thead><tr class="border-b bg-gray-50 text-gray-600 font-semibold"><th class="p-3 text-center w-16">ครั้งที่</th><th class="p-3 text-left">วันที่นัด/วันที่เยี่ยม</th><th class="p-3 text-left">Multiple Impairment</th><th class="p-3 text-center">BI (ก่อน/หลัง)</th><th class="p-3 text-center">สถานะ</th></tr></thead><tbody class="divide-y divide-gray-100">';

    records.sort((a,b) => (Number(a.VisitNumber)||0) - (Number(b.VisitNumber)||0));
    records.forEach((s, index) => {
      const date = dateKey(s.ScheduledDate || s.VisitDate);
      const visited = !!s.__visited;
      const status = visited ? 'Completed' : (date < dateKey(new Date()) ? 'Overdue' : 'Pending');
      const badge = status === 'Completed'
        ? '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700"><i class="bi bi-check-circle-fill mr-1"></i>เยี่ยมสำเร็จ</span>'
        : status === 'Overdue'
          ? '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700">เลยกำหนด</span>'
          : '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">รอเยี่ยม</span>';
      html += `<tr class="hover:bg-gray-50 transition-colors">
        <td class="p-3 text-center font-bold text-gray-700">${s.VisitNumber || index + 1}</td>
        <td class="p-3 whitespace-nowrap text-gray-600">${typeof formatThaiDate === 'function' ? formatThaiDate(date) : date}</td>
        <td class="p-3"><span class="text-gray-300">-</span></td>
        <td class="p-3 text-center"><span class="text-gray-300">-</span></td>
        <td class="p-3 text-center">${badge}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableContainer.innerHTML = html;
  }

  async function loadPatientScheduleTabDirect() {
    if (!currentPatient) return;
    const container = document.getElementById('detail-tab-content');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-white p-6 rounded-lg shadow-md border border-gray-100">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-800"><i class="bi bi-calendar3 mr-2 text-teal-600"></i>ตารางการเข้าเยี่ยมและพัฒนาการ BI</h3>
          <button onclick="openScheduleModal(currentPatient.PatientID)" class="btn btn-sm btn-outline-teal px-3 py-1 rounded-lg transition-all"><i class="bi bi-plus-circle mr-1"></i>จัดการวันนัด</button>
        </div>
        <div class="p-3 bg-red-50 border border-red-100 rounded-xl mb-4 flex items-center">
          <i class="bi bi-clock-history text-red-500 mr-3 text-xl"></i><div><p class="text-red-700 m-0 font-bold text-sm">วันครบกำหนด (Due Date)</p><p class="text-red-600 m-0 text-base">${formatThaiDate(currentPatient.DueDate)}</p></div>
        </div>
        <div id="patient-schedule-table-container" class="overflow-x-auto min-h-[200px]">
          <div class="flex justify-center items-center py-10"><span class="text-gray-500">กำลังโหลดข้อมูลนัด...</span></div>
        </div>
      </div>`;

    const client = window.supabaseClient;
    if (!client) return;

    const pid = String(currentPatient.PatientID).trim();
    const [sRes, oRes, soRes] = await Promise.all([
      client.from('Schedules').select('ScheduleID,PatientID,VisitNumber,ScheduledDate,Status,QueueIndex,ScheduleZone').eq('PatientID', pid),
      client.from('OPDRecords').select('VisitDate').eq('PatientID', pid),
      client.from('SOAPNotes').select('VisitDate').eq('PatientID', pid)
    ]);
    if (sRes.error) throw sRes.error;

    const visits = new Set();
    [...(oRes.data || []), ...(soRes.data || [])].forEach(r => { const d = dateKey(r.VisitDate); if (d) visits.add(d); });

    render((sRes.data || []).map(r => ({...r, __visited: visits.has(dateKey(r.ScheduledDate))})));
  }

  window.displayPatientScheduleTab = function () {
    loadPatientScheduleTabDirect().catch(err => {
      console.error('[PatientScheduleRefreshFix] Load failed:', err);
      showError(err);
    });
  };

  window.refreshPatientScheduleTab = async function () {
    const tab = document.getElementById('patient-schedule-table-container');
    if (!tab || !currentPatient) return;
    try {
      const pid = String(currentPatient.PatientID).trim();
      const client = window.supabaseClient;
      const { data, error } = await client.from('Schedules')
        .select('ScheduleID,PatientID,VisitNumber,ScheduledDate,Status,QueueIndex,ScheduleZone')
        .eq('PatientID', pid)
        .order('VisitNumber', {ascending:true});
      if (error) throw error;
      render(data || []);
    } catch (err) {
      console.error('[PatientScheduleRefreshFix] Refresh failed:', err);
    }
  };

  console.info('[PatientScheduleRefreshFix] Installed');
})();