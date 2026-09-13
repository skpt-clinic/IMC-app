// ============================================================================
// SUMMARY VIEW FIXES
// - Normalize summary dates
// - Show completed visits in one full-width table
// - Add therapist/ผู้เยี่ยม column with per-therapist row colors
// - Add EMR button after Budget
// - Remove pending/waiting table
// ============================================================================
(function () {
  'use strict';

  const THERAPIST_PALETTE = [
    { bg: '#eff6ff', border: '#60a5fa', text: '#1d4ed8' },
    { bg: '#f0fdf4', border: '#4ade80', text: '#15803d' },
    { bg: '#fefce8', border: '#facc15', text: '#a16207' },
    { bg: '#fdf2f8', border: '#f472b6', text: '#be185d' },
    { bg: '#f5f3ff', border: '#a78bfa', text: '#6d28d9' },
    { bg: '#fff7ed', border: '#fb923c', text: '#c2410c' },
    { bg: '#ecfeff', border: '#22d3ee', text: '#0e7490' },
    { bg: '#f8fafc', border: '#94a3b8', text: '#475569' }
  ];

  function normalizeSummaryDate(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const raw = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
      if (match) return match[1];
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatSummaryDate(value) {
    const iso = normalizeSummaryDate(value);
    if (!iso) return '-';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d} ${months[m]} ${y + 543}`;
  }

  function therapistStyle(name) {
    const key = String(name || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
    return THERAPIST_PALETTE[Math.abs(hash) % THERAPIST_PALETTE.length];
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.openSummaryEMR = function (patientId) {
    const pid = String(patientId || '').trim();
    if (!pid) return;
    viewPatientDetail(pid);

    let attempts = 0;
    const openTab = () => {
      attempts += 1;
      if (typeof currentPatient !== 'undefined' && currentPatient && String(currentPatient.PatientID).trim() === pid) {
        switchDetailTab(null, 'emr-tab');
        return;
      }
      if (attempts < 20) setTimeout(openTab, 150);
    };
    setTimeout(openTab, 150);
  };

  // Keep Budget UI behavior from the original implementation.
  function getBudgetMeta(status) {
    const normalized = status === 'รับยอด' ? 'รับยอด' : 'รอโอน';
    return normalized === 'รับยอด'
      ? { status: normalized, icon: 'bi-check-circle-fill', badgeClass: 'bg-sky-50 border-sky-200 text-sky-700' }
      : { status: normalized, icon: 'bi-clock-history', badgeClass: 'bg-amber-50 border-amber-200 text-amber-700' };
  }

  function updateBudgetBadgeUI(select) {
    const badge = select.closest('[data-budget-badge]');
    const icon = badge ? badge.querySelector('[data-budget-icon]') : null;
    const meta = getBudgetMeta(select.value);
    if (badge) badge.className = `inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${meta.badgeClass}`;
    if (icon) icon.className = `bi ${meta.icon}`;
    select.dataset.currentStatus = meta.status;
  }

  function bindBudgetSelects() {
    document.querySelectorAll('.summary-budget-select').forEach(select => {
      if (select.dataset.bound === 'true') return;
      select.dataset.bound = 'true';
      select.dataset.currentStatus = select.value || 'รอโอน';
      updateBudgetBadgeUI(select);

      select.addEventListener('change', () => {
        const previousStatus = select.dataset.currentStatus || 'รอโอน';
        const nextStatus = getBudgetMeta(select.value).status;
        select.value = nextStatus;
        updateBudgetBadgeUI(select);
        select.disabled = true;

        google.script.run
          .withSuccessHandler(result => {
            select.disabled = false;
            if (!result || result.status !== 'success') {
              select.value = previousStatus;
              updateBudgetBadgeUI(select);
              return showError({ message: result?.message || 'ไม่สามารถบันทึกสถานะ Budget ได้' });
            }
            select.value = result.budgetStatus || nextStatus;
            updateBudgetBadgeUI(select);
          })
          .withFailureHandler(error => {
            select.disabled = false;
            select.value = previousStatus;
            updateBudgetBadgeUI(select);
            showError(error);
          })
          .updateBudgetStatus({
            patientId: select.dataset.patientId,
            visitDate: select.dataset.visitDate,
            budgetStatus: nextStatus
          });
      });
    });
  }

  function renderSummaryTable(data) {
    const tbody = document.getElementById('summary-completed-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rows = Array.isArray(data) ? data : [];
    const columnCount = 8;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${columnCount}" class="text-center py-10 text-gray-400">ไม่พบรายการเยี่ยมในช่วงวันที่เลือก</td></tr>`;
      return;
    }

    const groups = rows.reduce((acc, item) => {
      const date = normalizeSummaryDate(item.date || item.visitDate);
      if (!date) return acc;
      if (!acc[date]) acc[date] = [];
      acc[date].push({ ...item, date });
      return acc;
    }, {});

    Object.keys(groups).sort().forEach(date => {
      tbody.innerHTML += `
        <tr class="bg-teal-50 border-y border-teal-100">
          <td colspan="${columnCount}" class="px-4 py-2 font-bold text-[12px] text-teal-700">
            <i class="bi bi-calendar3 mr-2"></i>วันที่ ${formatSummaryDate(date)}
          </td>
        </tr>`;

      groups[date].forEach(item => {
        const therapist = String(item.therapistName || item.TherapistName || '-').trim() || '-';
        const style = therapistStyle(therapist);
        const biBefore = item.biBefore ?? item.initialBI ?? '-';
        const biAfterValue = item.biAfter ?? item.latestBI ?? '-';
        const biHTML = `
          <span class="text-gray-400 text-xs">${escapeHtml(biBefore)}</span>
          <i class="bi bi-arrow-right mx-1 text-gray-300"></i>
          <span class="text-teal-600 font-bold">${escapeHtml(biAfterValue)}</span>`;

        const imps = item.multipleImpairment?.imps ?? '';
        const fxs = item.multipleImpairment?.fxs ?? '';
        const impsText = imps ? `<span class="text-blue-600 font-medium">${escapeHtml(imps)}</span>` : '';
        const fxsText = fxs ? `<span class="text-orange-500 font-medium">${escapeHtml(fxs)}</span>` : '';
        const impairmentHtml = impsText || fxsText
          ? `${impsText}${impsText && fxsText ? '<br>' : ''}${fxsText}`
          : '<span class="text-gray-400">-</span>';

        const statusText = `เยี่ยมแล้วครั้งที่ ${item.visitNumber ?? '-'}`;
        const budgetMeta = getBudgetMeta(item.budgetStatus);
        const rowStyle = `background-color:${style.bg}; border-left:5px solid ${style.border};`;

        const budgetHTML = `
          <td class="p-2 text-center">
            <div data-budget-badge class="inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${budgetMeta.badgeClass}">
              <i data-budget-icon class="bi ${budgetMeta.icon}"></i>
              <select class="summary-budget-select bg-transparent text-[11px] font-semibold focus:outline-none cursor-pointer" data-patient-id="${escapeHtml(item.patientId)}" data-visit-date="${escapeHtml(date)}">
                <option value="รอโอน" ${budgetMeta.status === 'รอโอน' ? 'selected' : ''}>รอโอน</option>
                <option value="รับยอด" ${budgetMeta.status === 'รับยอด' ? 'selected' : ''}>รับยอด</option>
              </select>
            </div>
          </td>`;

        tbody.innerHTML += `
          <tr class="border-b border-white/70 hover:brightness-95 transition-all" style="${rowStyle}">
            <td class="p-2 pl-4">
              <div class="text-sm font-bold text-gray-800">${escapeHtml(item.patientName)}</div>
              <div class="text-[10px] text-gray-500">CN: ${escapeHtml(item.cn)}</div>
            </td>
            <td class="p-2 text-xs text-center text-gray-600">${escapeHtml(item.zone)}</td>
            <td class="p-2"><div class="text-[10px] leading-tight break-words" style="max-width:220px;">${impairmentHtml}</div></td>
            <td class="p-2 text-center text-sm">${biHTML}</td>
            <td class="p-2 text-center">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                <i class="bi bi-check-circle-fill mr-1"></i>${escapeHtml(statusText)}
              </span>
            </td>
            <td class="p-2 text-center whitespace-nowrap">
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold" style="background:${style.bg};color:${style.text};border:1px solid ${style.border};">
                <span class="inline-block h-2 w-2 rounded-full" style="background:${style.border};"></span>${escapeHtml(therapist)}
              </span>
            </td>
            ${budgetHTML}
            <td class="p-2 text-center">
              <button type="button" onclick="event.stopPropagation(); openSummaryEMR('${escapeHtml(item.patientId)}')" class="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-[11px] font-bold shadow-sm transition" title="เปิด EMR ผู้ป่วย">
                <i class="bi bi-file-earmark-medical-fill"></i> EMR
              </button>
            </td>
          </tr>`;
      });
    });

    bindBudgetSelects();
  }

  // Override the original summary renderer so the existing menu continues to work.
  window.renderDailySummary = function (start, end) {
    showLoading('กำลังโหลดข้อมูลสรุป...');
    google.script.run
      .withSuccessHandler(response => {
        Swal.close();
        if (!response || response.status !== 'success') {
          return showError({ message: response?.message || 'ไม่สามารถโหลดข้อมูลสรุปได้' });
        }

        // Supabase adapter now returns `visited`; support the legacy names too.
        const visited = Array.isArray(response.visited) ? response.visited : (response.completedVisits || []);
        renderSummaryTable(visited);

        const completedCount = document.getElementById('summary-completed-count');
        if (completedCount) completedCount.textContent = visited.length;

        const pendingCount = document.getElementById('summary-pending-count');
        if (pendingCount) pendingCount.textContent = 0;
      })
      .withFailureHandler(error => {
        Swal.close();
        showError(error);
      })
      .getDailySummaryData(start, end);
  };
})();
