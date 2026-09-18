// ============================================================================
// Schedule save/display hardening
// Ensures a newly saved appointment is immediately reflected in the patient
// list and schedule view, and provides a clear verification step after save.
// ============================================================================
(function () {
  'use strict';

  function install() {
    if (typeof window.handleSaveSchedules !== 'function') return false;
    if (window.__imcScheduleFixInstalled) return true;

    const original = window.handleSaveSchedules;

    window.handleSaveSchedules = async function () {
      const patientId = document.getElementById('schedulePatientId')?.value;
      if (!patientId) {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบรหัสผู้ป่วยสำหรับบันทึกนัดหมาย', 'error');
        return;
      }

      const dates = [];
      document.querySelectorAll('.schedule-existing-input').forEach(input => {
        if (!input.disabled && input.value) {
          const visitNumber = Number.parseInt(input.dataset.visit, 10);
          if (Number.isFinite(visitNumber) && visitNumber > 0) {
            dates[visitNumber - 1] = input.value;
          }
        }
      });

      const newDateInput = document.getElementById('new-schedule-date');
      const newVisitNumberInput = document.getElementById('new-visit-number');
      if (newDateInput?.value && newVisitNumberInput) {
        const visitNumber = Number.parseInt(newVisitNumberInput.value, 10);
        if (Number.isFinite(visitNumber) && visitNumber > 0) {
          dates[visitNumber - 1] = newDateInput.value;
        }
      }

      const compactDates = dates.map((value, index) => value ? { visitNumber: index + 1, date: value } : null)
        .filter(Boolean);

      if (!compactDates.length) {
        // Fall back to the original handler so existing validation remains intact.
        return original();
      }

      const normalizedDates = [];
      compactDates.forEach(item => {
        normalizedDates[item.visitNumber - 1] = item.date;
      });

      showLoading('กำลังบันทึกนัดหมาย...');

      // Use the already-initialized Supabase client directly here.
      // The Schedules table does not have a Notes column, so the older
      // adapter implementation was producing HTTP 400 on INSERT.
      const client = window.supabaseClient;
      if (!client) {
        Swal.close();
        showError({ message: 'ไม่พบการเชื่อมต่อ Supabase' });
        return;
      }

      try {
        // Replace this patient's existing appointment plan with the submitted plan.
        const { error: deleteError } = await client
          .from('Schedules')
          .delete()
          .eq('PatientID', patientId);
        if (deleteError) throw deleteError;

        const rows = normalizedDates
          .map((dateStr, idx) => {
            if (!dateStr) return null;
            return {
              ScheduleID: `SCH${Date.now()}_${idx + 1}`,
              PatientID: patientId,
              VisitNumber: idx + 1,
              ScheduledDate: new Date(dateStr + 'T00:00:00+07:00').toISOString(),
              Status: 'Scheduled'
            };
          })
          .filter(Boolean);

        if (!rows.length) {
          throw new Error('ไม่พบวันที่นัดหมายที่ต้องการบันทึก');
        }

        const { error: insertError } = await client
          .from('Schedules')
          .insert(rows);
        if (insertError) throw insertError;

        // Read back immediately to verify persistence.
        const { data: savedRows, error: verifyError } = await client
          .from('Schedules')
          .select('ScheduleID,PatientID,VisitNumber,ScheduledDate,Status,QueueIndex,ScheduleZone')
          .eq('PatientID', patientId)
          .order('VisitNumber', { ascending: true });
        if (verifyError) throw verifyError;

        if (!savedRows || savedRows.length !== rows.length) {
          throw new Error('บันทึกนัดหมายแล้ว แต่ตรวจสอบจำนวนรายการที่บันทึกกลับมาไม่ครบ');
        }

        allScheduleData = savedRows;

        // Refresh the patient list using the existing application bridge.
        if (typeof window.refreshScheduleState === 'function') {
          await window.refreshScheduleState(patientId);
        } else {
          allScheduleData = savedRows;
        }

        if (typeof scheduleModal !== 'undefined' && scheduleModal) scheduleModal.hide();
        Swal.close();
        showSuccessToast(`บันทึกนัดหมายสำเร็จ ${rows.length} ครั้ง`);

        if (typeof renderDailyScheduleList === 'function') {
          const dateFilter = document.getElementById('schedule-date-filter');
          if (dateFilter?.value) renderDailyScheduleList(dateFilter.value);
        }
        if (typeof renderMonthlyCalendar === 'function' && typeof currentCalendarDate !== 'undefined') {
          renderMonthlyCalendar(currentCalendarDate);
        }
      } catch (error) {
        console.error('[ScheduleFix] Save failed:', error);
        Swal.close();
        showError(error);
      }
    };

    window.__imcScheduleFixInstalled = true;
    console.info('[ScheduleFix] Installed');
    return true;
  }

  function installWhenReady() {
    if (install()) return;
    setTimeout(installWhenReady, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installWhenReady, 0), { once: true });
  } else {
    setTimeout(installWhenReady, 0);
  }
})();
