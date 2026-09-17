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

    window.handleSaveSchedules = function () {
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
      google.script.run
        .withSuccessHandler(async response => {
          if (!response || response.status !== 'success') {
            Swal.close();
            showError(response || { message: 'ไม่สามารถบันทึกนัดหมายได้' });
            return;
          }

          // Verify that Supabase actually contains the saved schedule records.
          google.script.run
            .withSuccessHandler(scheduleResponse => {
              if (!scheduleResponse || scheduleResponse.status !== 'success') {
                Swal.close();
                showError(scheduleResponse || { message: 'บันทึกสำเร็จแต่ไม่สามารถตรวจสอบตารางนัดได้' });
                return;
              }

              allScheduleData = scheduleResponse.records || [];

              // Refresh patients so NextAppointment/scheduleInfo are recalculated.
              google.script.run
                .withSuccessHandler(data => {
                  if (data && !data.error) {
                    allPatients = data.patients || [];
                    allScheduleData = data.schedules?.records || allScheduleData;
                    filterPatients();
                  }

                  if (typeof scheduleModal !== 'undefined' && scheduleModal) {
                    scheduleModal.hide();
                  }
                  Swal.close();
                  showSuccessToast(`บันทึกนัดหมายสำเร็จ ${compactDates.length} ครั้ง`);

                  // If the schedule page is currently visible, redraw it immediately.
                  if (typeof renderDailyScheduleList === 'function') {
                    const dateFilter = document.getElementById('schedule-date-filter');
                    if (dateFilter?.value) renderDailyScheduleList(dateFilter.value);
                  }
                  if (typeof renderMonthlyCalendar === 'function' && typeof currentCalendarDate !== 'undefined') {
                    renderMonthlyCalendar(currentCalendarDate);
                  }
                })
                .withFailureHandler(error => {
                  Swal.close();
                  showError(error);
                })
                .getInitialData();
            })
            .withFailureHandler(error => {
              Swal.close();
              showError(error);
            })
            .getAllSchedules();
        })
        .withFailureHandler(error => {
          Swal.close();
          showError(error);
        })
        .saveSchedules({ patientId, dates: normalizedDates });
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
