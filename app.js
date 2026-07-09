// =================================================================
// 1. GLOBAL STATE & CONFIGURATION
// =================================================================
Chart.register(ChartDataLabels);
let allPatients = [], nextCN = "", clinicSettings = {}, allTherapists = [], allAddressData = [], currentPatient = null, allScheduleData = [];
let currentPatientRecords = null, currentDetailVisitDate = '';
let loggedInUser = null;
let patientModal, scheduleModal;
let signaturePads = {};
const LOGIN_STORAGE_KEY = 'skpt_logged_in_user';
const allergyOptions = ['Falling doing ambulation', 'Dypnea on exertion', 'Wight bearing', 'Over exercise', 'ยา Phenytoin'];
const BODY_CHART_IMAGE_ID = '15GkXRz3FQeKoASYfXQEtS__lq1ax44iI';
let currentCalendarDate = new Date();
let currentPatientTab = 'Active';
// =================================================================
// REAL-TIME CLOCK
// =================================================================
function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok' };
    const dateString = now.toLocaleDateString('th-TH', options);
    const timeString = now.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
    document.getElementById('real-time-clock').textContent = `${dateString} | เวลา ${timeString}`;
}
function saveLoginSession(user) {
    try {
        localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(user));
    } catch (error) {
        console.warn('Unable to persist login session', error);
    }
}
function getSavedLoginSession() {
    try {
        const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw);
        return user && user.fullName ? user : null;
    } catch (error) {
        console.warn('Unable to restore login session', error);
        return null;
    }
}
function clearLoginSession() {
    try {
        localStorage.removeItem(LOGIN_STORAGE_KEY);
    } catch (error) {
        console.warn('Unable to clear login session', error);
    }
}
function updateLoggedInUserUI() {
    const userDisplay = document.getElementById('username-display-sidebar');
    if (userDisplay) userDisplay.textContent = loggedInUser?.fullName || 'Username';
}
function openMainAppForUser(user, persistSession = true) {
    loggedInUser = user;
    if (persistSession) saveLoginSession(user);
    updateLoggedInUserUI();
    const authContainer = document.getElementById('auth-container');
    const mainApp = document.getElementById('main-app');
    if (authContainer) authContainer.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';
    showLoading('กำลังโหลดข้อมูลเริ่มต้น...');
    google.script.run
        .withSuccessHandler(setupInitialUI)
        .withFailureHandler(error => {
            clearLoginSession();
            performLogout();
            showError(error);
        })
        .getInitialData();
}
// =================================================================
// 2. INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', function() {
    if (typeof SERVER_VIEW_MODE !== 'undefined' && SERVER_VIEW_MODE === 'reset' && SERVER_RESET_TOKEN) {
        // ซ่อนหน้า Login ปกติ
        document.getElementById('auth-container').style.display = 'none';
        // เรียก Modal ตั้งค่ารหัสผ่านใหม่ทันที
        showNewPasswordModal(SERVER_RESET_TOKEN);
    }
    patientModal = new bootstrap.Modal(document.getElementById('patientModal'));
    scheduleModal = new bootstrap.Modal(document.getElementById('scheduleModal'));
    downloadModal = new bootstrap.Modal(document.getElementById('downloadModal')); 
    // Event Listeners for Auth Forms
    document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
    document.getElementById('register-form').addEventListener('submit', handleRegistrationSubmit);
    document.getElementById('show-register-link').addEventListener('click', showRegisterView);
    document.getElementById('show-login-link').addEventListener('click', showLoginView);
    // --- END: สิ้นสุดการเพิ่มโค้ด ---
    // Setup real-time clock
    updateClock();
    setInterval(updateClock, 1000);

    // Event Listener for Mobile Menu Toggle
    document.getElementById('menu-toggle').addEventListener('click', toggleMobileMenu);
    if (!(typeof SERVER_VIEW_MODE !== 'undefined' && SERVER_VIEW_MODE === 'reset' && SERVER_RESET_TOKEN)) {
        const savedUser = getSavedLoginSession();
        if (savedUser) {
            openMainAppForUser(savedUser, false);
        } else {
            showLoginView();
        }
    }
});

function setupInitialUI(data) {
    // 1. ตรวจสอบ Error จากฝั่ง Server
    if (data.error) { 
        showError({ message: data.error }); 
        return; 
    }
    
    // 2. จัดการข้อมูลผู้ป่วย (Patients)
    // Server ส่งข้อมูลที่เรียงลำดับมาให้แล้ว ไม่ต้อง sort ที่นี่ซ้ำ
    let patients = data.patients || [];
    
    allPatients = patients; // เก็บลงตัวแปร Global

    // 3. จัดการตัวแปร Global อื่นๆ
    nextCN = data.nextCN || "";
    clinicSettings = data.settings || {};
    allTherapists = data.therapists || [];
    allAddressData = data.addressData || [];
    
    // สำคัญ: เก็บข้อมูลนัดหมายลง Global เพื่อใช้ใน Dashboard และปฏิทิน
    allScheduleData = data.schedules && data.schedules.records ? data.schedules.records : [];

    // 4. อัปเดต UI Sidebar (Logo & Name)
    // ใช้ ID ใหม่ที่แก้ไขไป (clinic-logo-sidebar, clinic-name-sidebar)
    const logoImg = document.getElementById('clinic-logo-sidebar');
    if (logoImg) {
        logoImg.src = clinicSettings.ClinicLogoURL || SERVER_DEFAULT_CLINIC_LOGO_URL || logoImg.src;
    }

    // 5. ตั้งค่า Dropdown และ Input ต่างๆ
    // Filter หน้าทะเบียน
    populateSelect('zoneFilter', data.zones, true, 'แสดงตามโซน');
    
    // ตั้งค่า Helper Functions (ต้องมีอยู่ในโค้ดส่วนอื่น)
    setupAddressDropdowns();
    setupAllergyCheckboxes();
    
    // Dropdown ใน Modal ผู้ป่วย
    populateSelect('AssignedPT', allTherapists, true);
    populateSelect('CaregiverRelationship', ['บิดา', 'มารดา', 'สามี', 'ภรรยา', 'บุตร', 'ผู้ดูแล'], true);
    populateSelect('Zone', data.zones, true);
    
    // 6. แสดงหน้าแรก (Dashboard) และปิด Loading
    showDashboardView();
    Swal.close();
}

// =================================================================
// 3. VIEW MANAGEMENT & NAVIGATION
// =================================================================
function toggleMobileMenu() {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');

    if (!sidebar || !overlay) return;

    // ตรวจสอบว่ามี class hidden หรือ -translate-x-full อยู่หรือไม่
    const isClosed = sidebar.classList.contains('-translate-x-full');

    if (isClosed) {
        // เปิดเมนู
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        // ปิดเมนู
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}
/**
 * ฟังก์ชันย่อ/ขยาย Sidebar สำหรับ Desktop
 */
function toggleDesktopSidebar() {
    const sidebar = document.getElementById('desktop-sidebar');
    const logoText = document.getElementById('sidebar-logo-text');
    const userText = document.getElementById('sidebar-user-text');
    const toggleIcon = document.getElementById('sidebar-toggle-icon');
    
    // Elements ที่ต้องการซ่อน/แสดง
    const texts = document.querySelectorAll('.sidebar-text');
    const labels = document.querySelectorAll('.sidebar-section-label');
    const navLinks = document.querySelectorAll('.nav-link');

    // ตรวจสอบสถานะปัจจุบัน (ถ้ากว้าง 64 = ขยายอยู่ -> ต้องย่อ)
    const isExpanded = sidebar.classList.contains('w-64');

    if (isExpanded) {
        // --- ย่อ (Collapse) ---
        sidebar.classList.replace('w-64', 'w-20'); // ลดความกว้างเหลือ 5rem (80px)
        
        // ซ่อนข้อความ
        logoText.classList.add('hidden');
        userText.classList.add('hidden');
        texts.forEach(el => el.classList.add('hidden'));
        labels.forEach(el => el.classList.add('hidden'));
        
        // ปรับแต่ง Link ให้ Icon อยู่ตรงกลาง
        navLinks.forEach(link => {
            link.classList.remove('px-3');
            link.classList.add('justify-center', 'px-0');
        });

        // เปลี่ยนไอคอนปุ่ม Toggle
        toggleIcon.classList.remove('bi-list-nested');
        toggleIcon.classList.add('bi-list');

    } else {
        // --- ขยาย (Expand) ---
        sidebar.classList.replace('w-20', 'w-64'); // คืนความกว้าง
        
        // แสดงข้อความ (ใช้ Timeout เล็กน้อยเพื่อให้ Animation สมูท)
        setTimeout(() => {
            logoText.classList.remove('hidden');
            userText.classList.remove('hidden');
            texts.forEach(el => el.classList.remove('hidden'));
            labels.forEach(el => el.classList.remove('hidden'));
        }, 150);

        // คืนค่า Link
        navLinks.forEach(link => {
            link.classList.add('px-3');
            link.classList.remove('justify-center', 'px-0');
        });

        // เปลี่ยนไอคอนปุ่ม Toggle
        toggleIcon.classList.remove('bi-list');
        toggleIcon.classList.add('bi-list-nested');
    }
}
function setActiveView(viewId, headerText) {
    // Hide all main views
    document.querySelectorAll('main > div[id$="-view"]').forEach(v => v.style.display = 'none');
    // Show the active view
    const view = document.getElementById(viewId);
    if(view) view.style.display = 'block';
    
    // Set the header title (เพิ่ม Safety Check)
    const headerTitle = document.getElementById('main-header-title');
    if(headerTitle) headerTitle.textContent = headerText;

    // Update active state for all nav links
    const navLinks = document.querySelectorAll('.nav-link, .nav-link-mobile');
    navLinks.forEach(link => link.classList.remove('active'));

    let linkIndex = -1;
    if (viewId.includes('dashboard')) linkIndex = 0;
    else if (viewId.includes('list') || viewId.includes('detail')) linkIndex = 1;
    else if (viewId.includes('service')) linkIndex = 2;
    else if (viewId.includes('schedule')) linkIndex = 3;
    else if (viewId.includes('summary')) linkIndex = 4;

    if (linkIndex !== -1) {
        // ใช้ Optional Chaining (?.) ป้องกัน Error กรณีหา Element ไม่เจอ
        document.querySelectorAll('.nav-link')[linkIndex]?.classList.add('active');
        document.querySelectorAll('.nav-link-mobile')[linkIndex]?.classList.add('active');
    }
    
    // Hide mobile menu after selection (Auto close)
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (sidebar && overlay && !sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

function showDashboardView() { setActiveView('dashboard-view', 'ภาพรวม (Dashboard)'); showLoading('กำลังโหลดข้อมูล...'); google.script.run.withSuccessHandler(renderDashboard).withFailureHandler(showError).getDashboardData(); }
function showListView() { setActiveView('patient-list-view', 'ทะเบียนผู้ป่วย'); displayPatients(allPatients); }
function showServiceView() { setActiveView('service-view', 'เข้ารับบริการ'); document.getElementById('service-search-panel').style.display = 'block'; document.getElementById('patient-service-dashboard').style.display = 'none'; document.getElementById('serviceSearchInput').value = ''; document.getElementById('service-search-results').innerHTML = ''; currentPatient = null; }

function showScheduleView() {
    setActiveView('schedule-view', 'ตารางนัดหมาย');
    showLoading('กำลังโหลดข้อมูลตารางนัด...');
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                allScheduleData = response.records;
                const dateFilter = document.getElementById('schedule-date-filter');
                
                if (!dateFilter.value) {
                    const today = new Date();
                    dateFilter.value = today.toISOString().split('T')[0];
                }

                dateFilter.onchange = () => renderDailyScheduleList(dateFilter.value);
                renderDailyScheduleList(dateFilter.value);

                // --- New Calendar Logic ---
                renderMonthlyCalendar(currentCalendarDate);

                document.getElementById('prev-month-btn').onclick = () => {
                    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
                    renderMonthlyCalendar(currentCalendarDate);
                };
                document.getElementById('next-month-btn').onclick = () => {
                    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
                    renderMonthlyCalendar(currentCalendarDate);
                };
                // --------------------------
            
            } else {
                showError(response);
            }
            Swal.close();
        })
        .withFailureHandler(showError)
        .getAllSchedules();
}
// 1. ฟังก์ชันแสดงหน้า Summary และโหลดข้อมูลอัตโนมัติ
function showSummaryView() {
    // สลับหน้าจอ
    setActiveView('summary-view', 'สรุปผลการเยี่ยม');

    const startDateEl = document.getElementById('summary-start-date');
    const endDateEl = document.getElementById('summary-end-date');

    if (startDateEl && endDateEl) {
        // ถ้ายังไม่มีวันที่ ให้ตั้งเป็นวันนี้ (Timezone ไทย)
        if (!startDateEl.value || !endDateEl.value) {
            const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
            startDateEl.value = todayStr;
            endDateEl.value = todayStr;
        }
        // โหลดข้อมูลทันทีเมื่อเปิดหน้า
        filterSummary(); 
    }
}

// 2. ฟังก์ชันกรองข้อมูล (กดปุ่มค้นหา)
function filterSummary() {
    const start = document.getElementById('summary-start-date').value;
    const end = document.getElementById('summary-end-date').value;
    
    if (!start || !end) {
        Swal.fire('แจ้งเตือน', 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด', 'warning');
        return;
    }
    
    renderDailySummary(start, end);
}

// 3. ฟังก์ชัน Render ข้อมูลลงตาราง
function renderDailySummary(start, end) {
    showLoading('กำลังโหลดข้อมูลสรุป...');
    
    google.script.run.withSuccessHandler(response => {
        Swal.close();
        if (response.status !== 'success') return showError({ message: response.message });

        const formatThaiDateSafe = (isoStr) => {
            const [y, m, d] = isoStr.split('-');
            const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
            return `${parseInt(d)} ${months[parseInt(m)]} ${parseInt(y) + 543}`;
        };

        const getBudgetMeta = (status) => {
            const normalizedStatus = status === 'รับยอด' ? 'รับยอด' : 'รอโอน';
            return normalizedStatus === 'รับยอด'
                ? { status: normalizedStatus, icon: 'bi-check-circle-fill', badgeClass: 'bg-sky-50 border-sky-200 text-sky-700' }
                : { status: normalizedStatus, icon: 'bi-clock-history', badgeClass: 'bg-amber-50 border-amber-200 text-amber-700' };
        };

        const updateBudgetBadgeUI = (select) => {
            const badge = select.closest('[data-budget-badge]');
            const icon = badge ? badge.querySelector('[data-budget-icon]') : null;
            const meta = getBudgetMeta(select.value);
            if (badge) {
                badge.className = `inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${meta.badgeClass}`;
            }
            if (icon) {
                icon.className = `bi ${meta.icon}`;
            }
            select.dataset.currentStatus = meta.status;
        };

        const bindBudgetSelects = () => {
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
                            if (result.status !== 'success') {
                                select.value = previousStatus;
                                updateBudgetBadgeUI(select);
                                return showError({ message: result.message || 'ไม่สามารถบันทึกสถานะ Budget ได้' });
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
        };

        const generateTableHTML = (containerId, data, isPending) => {
            const tbody = document.getElementById(containerId);
            const columnCount = isPending ? 5 : 6;
            tbody.innerHTML = '';
            
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${columnCount}" class="text-center py-6 text-gray-400">ไม่พบรายการ</td></tr>`;
                return;
            }

            const groups = data.reduce((acc, item) => {
                if (!acc[item.date]) acc[item.date] = [];
                acc[item.date].push(item);
                return acc;
            }, {});

            Object.keys(groups).sort().forEach(date => {
                tbody.innerHTML += `
                    <tr class="${isPending ? 'bg-orange-50' : 'bg-teal-50'}">
                        <td colspan="${columnCount}" class="px-3 py-1.5 font-bold text-[11px] ${isPending ? 'text-orange-700' : 'text-teal-700'}">
                            <i class="bi bi-calendar3 mr-2"></i> วันที่ ${formatThaiDateSafe(date)}
                        </td>
                    </tr>`;

                groups[date].forEach(item => {
                    const biHTML = isPending
                        ? `<span class="text-gray-700 font-bold">${item.biBefore}</span> <span class="text-[10px] text-gray-400">(ล่าสุด)</span>`
                        : `<span class="text-gray-400 text-xs">${item.biBefore}</span> <i class="bi bi-arrow-right mx-1 text-gray-300"></i> <span class="text-teal-600 font-bold">${item.biAfter}</span>`;

                    const statusText = isPending ? `รอเยี่ยมครั้งที่ ${item.visitNumber}` : `เยี่ยมแล้วครั้งที่ ${item.visitNumber}`;
                    const statusIcon = isPending ? 'bi-clock-history' : 'bi-check-circle-fill';
                    const badgeClass = isPending ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
                    const budgetMeta = getBudgetMeta(item.budgetStatus);

                    const impsText = (item.multipleImpairment && item.multipleImpairment.imps)
                        ? `<span class="text-blue-600 font-medium">${item.multipleImpairment.imps}</span>` : "";
                    const fxsText = (item.multipleImpairment && item.multipleImpairment.fxs)
                        ? `<span class="text-orange-500 font-medium">${item.multipleImpairment.fxs}</span>` : "";
                    const separator = (impsText && fxsText) ? "<br>" : "";
                    const budgetHTML = isPending ? '' : `
                        <td class="p-2 text-center">
                            <div data-budget-badge class="inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${budgetMeta.badgeClass}">
                                <i data-budget-icon class="bi ${budgetMeta.icon}"></i>
                                <select class="summary-budget-select bg-transparent text-[11px] font-semibold focus:outline-none cursor-pointer" data-patient-id="${item.patientId}" data-visit-date="${item.date}">
                                    <option value="รอโอน" ${budgetMeta.status === 'รอโอน' ? 'selected' : ''}>รอโอน</option>
                                    <option value="รับยอด" ${budgetMeta.status === 'รับยอด' ? 'selected' : ''}>รับยอด</option>
                                </select>
                            </div>
                        </td>`;

                    tbody.innerHTML += `
                        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td class="p-2 pl-4">
                                <div class="text-sm font-bold text-gray-800">${item.patientName}</div>
                                <div class="text-[10px] text-gray-500">CN: ${item.cn}</div>
                            </td>
                            <td class="p-2 text-xs text-center text-gray-600">${item.zone}</td>
                            <td class="p-2">
                                <div class="text-[10px] leading-tight break-words" style="max-width:180px;">
                                    ${impsText}${separator}${fxsText}
                                    ${(!impsText && !fxsText) ? '-' : ''}
                                </div>
                            </td>
                            <td class="p-2 text-center text-sm">${biHTML}</td>
                            <td class="p-2 text-center">
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold ${badgeClass}">
                                    <i class="bi ${statusIcon} mr-1"></i> ${statusText}
                                </span>
                            </td>
                            ${budgetHTML}
                        </tr>`;
                });
            });
        };

        generateTableHTML('summary-pending-table-body', response.pending, true);
        generateTableHTML('summary-completed-table-body', response.visited, false);
        bindBudgetSelects();

        document.getElementById('summary-pending-count').textContent = response.pending.length;
        document.getElementById('summary-completed-count').textContent = response.visited.length;

    }).getDailySummaryData(start, end);
}
/**
 * Renders a monthly calendar view with scheduled appointments.
 * @param {Date} date - The date to determine the month and year to render.
 */
function renderMonthlyCalendar(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearEl = document.getElementById('calendar-month-year');
    
    if (!calendarGrid || !monthYearEl) return;

    calendarGrid.innerHTML = '';
    const month = date.getMonth();
    const year = date.getFullYear();

    monthYearEl.textContent = new Date(year, month).toLocaleDateString('th-TH', {
        month: 'long',
        year: 'numeric'
    });
    
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarGrid.innerHTML += `<div class="border rounded-md bg-gray-50"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell border rounded-md p-1 h-28 overflow-y-auto cursor-pointer hover:bg-teal-50 transition-colors';
        const dayId = `day-${year}-${month + 1}-${day}`;
        dayCell.id = dayId;
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'font-bold text-right text-gray-700 pr-1';
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const monthStr = String(month + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const currentDateStr = `${year}-${monthStr}-${dayStr}`;

        dayCell.onclick = function() {
            const filterInput = document.getElementById('schedule-date-filter');
            if(filterInput) {
                filterInput.value = currentDateStr;
                renderDailyScheduleList(currentDateStr);
            }
            document.querySelectorAll('.calendar-day-cell').forEach(cell => {
                cell.classList.remove('bg-teal-100', 'border-teal-300');
            });
            this.classList.add('bg-teal-100', 'border-teal-300');
        };

        // --- [แก้ไข Logic การกรองข้อมูล] ---
        const todaysSchedules = allScheduleData.filter(s => {
            if (!s.ScheduledDate) return false;
            const isSameDay = s.ScheduledDate.substring(0, 10) === currentDateStr;
            if (!isSameDay) return false;

            // ตรวจสอบจากสถานะในชีท (ถ้า Manual เปลี่ยนเป็น Completed)
            if (s.Status === 'Completed') return false;

            // ตรวจสอบจาก "เอกสารที่มีอยู่จริง" (Actual Visits) ณ วันนั้น
            const patient = allPatients.find(p => String(p.PatientID) === String(s.PatientID));
            if (patient && patient.actualVisits) {
                // actualVisits ควรเป็น Array ของวันที่ที่เคยเยี่ยมจริง เช่น ['2026-01-29', '2026-01-15']
                const hasVisitedToday = patient.actualVisits.includes(currentDateStr);
                if (hasVisitedToday) return false; // ถ้าเจอเอกสารในวันนี้แล้ว ให้เอาออกจากปฏิทิน
            }
            
            return true;
        });

        if (todaysSchedules.length > 0) {
            const appointmentsContainer = document.createElement('div');
            appointmentsContainer.className = 'space-y-1';
            
            const checkDate = new Date(currentDateStr);
            const todayDate = new Date();
            todayDate.setHours(0,0,0,0);
            const isOverdue = checkDate < todayDate;

            todaysSchedules.forEach(schedule => {
                const patient = allPatients.find(p => p.PatientID === schedule.PatientID);
                if (patient) {
                    const appointmentEl = document.createElement('div');
                    appointmentEl.className = `text-[10px] md:text-xs p-1 rounded-md truncate font-semibold border ${isOverdue ? 'bg-red-50 text-red-700 border-red-100' : 'text-teal-900 border-transparent'}`;
                    
                    if (!isOverdue) {
                        appointmentEl.style.backgroundColor = typeof getZoneColor === 'function' ? getZoneColor(patient.Zone) : '#f0fdfa';
                    }
                    
                    appointmentEl.textContent = `${patient.ClinicNumber}-${patient.PatientName}`;
                    appointmentsContainer.appendChild(appointmentEl);
                }
            });
            dayCell.appendChild(appointmentsContainer);
        }
        calendarGrid.appendChild(dayCell);
    }
    
    // รักษาการเลือกวัน
    const filterInput = document.getElementById('schedule-date-filter');
    if (filterInput && filterInput.value) {
        const [sYear, sMonth, sDay] = filterInput.value.split('-');
        if (parseInt(sYear) === year && parseInt(sMonth) === month + 1) {
             const selectedCell = document.getElementById(`day-${parseInt(sYear)}-${parseInt(sMonth)}-${parseInt(sDay)}`);
             if (selectedCell) selectedCell.classList.add('bg-teal-100', 'border-teal-300');
        }
    }
}
function goBackToList() { currentPatient = null; showListView(); }

// =================================================================
// 4. UTILITY & HELPER FUNCTIONS
// =================================================================
function clearFxHipStatus() {
    document.querySelectorAll('input[name="FxHIP_Status"]').forEach(radio => radio.checked = false);
    document.getElementById('fxhip_pwb_details').style.display = 'none';
    document.querySelector('input[name="FxHIP_PWB_Percent"]').value = '';
}
function showLoading(message = 'กำลังประมวลผล...') { Swal.fire({ title: message, allowOutsideClick: false, didOpen: () => Swal.showLoading() }); }
function showSuccessToast(message) { Swal.fire({ icon: 'success', title: message, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true }); }
function showError(error) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || (typeof error === 'string' ? error : 'มีบางอย่างผิดพลาด') }); }
function formatThaiDate(iso) { if (!iso) return '-'; try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { return 'Invalid Date'; } }
function calculateAge(dateString) { if (!dateString) return ''; const birthDate = new Date(dateString); let age = new Date().getFullYear() - birthDate.getFullYear(); const m = new Date().getMonth() - birthDate.getMonth(); if (m < 0 || (m === 0 && new Date().getDate() < birthDate.getDate())) age--; return age >= 0 ? age : ''; }
function getZoneColor(zoneName) { if (!zoneName) return '#FFFFFF'; const colors = ['#f0fdfa', '#f0fdf4', '#fefce8', '#fdf2f8', '#f5f3ff', '#faf5ff']; let hash = 0; for (let i = 0; i < zoneName.length; i++) { hash = zoneName.charCodeAt(i) + ((hash << 5) - hash); } return colors[Math.abs(hash % colors.length)]; }
function populateSelect(id, opts, addDefault = false, defaultText = 'เลือก...') { const select = document.getElementById(id); select.innerHTML = ''; if (addDefault) select.add(new Option(defaultText, '')); opts.forEach(opt => select.add(new Option(opt, opt))); }
function initializeSignaturePad(canvasId, padName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // --- ส่วนที่แก้ไข: ปรับขนาด Canvas ให้ถูกต้อง ---
    // ทำให้ขนาด Bitmap ของ Canvas ตรงกับขนาด Element ที่แสดงผลจริง
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    // --- สิ้นสุดการแก้ไข ---

    signaturePads[padName] = new SignaturePad(canvas);
}
function downloadFile(base64, name) { const link = document.createElement('a'); link.href = `data:application/pdf;base64,${base64}`; link.download = name; link.click(); }
function loadCanvasImage(canvasId, base64Url, fallbackServerId = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // เราใช้ offsetWidth/Height เพราะนี่คือขนาดจริงที่แสดงบนจอ (ไม่สน devicePixelRatio)
    // ซึ่ง context ถูก .scale() ไปแล้วใน initializeSignaturePad
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // ล้าง Canvas (ต้องใช้ขนาด bitmap จริงที่คูณ ratio แล้ว)
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    const drawImageScaled = (img) => {
        if (!img.width || !img.height) {
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight); 
            return;
        }

        // --- START: ใช้วิธี "Contain" (พอดีในกรอบ) ---
        // คำนวณอัตราส่วนที่เหมาะสมที่สุด (ไม่ล้นกรอบ)
        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
        const destWidth = img.width * scale;
        const destHeight = img.height * scale;
        // --- END ---
        
        // จัดให้รูปอยู่กึ่งกลาง
        const destX = (canvasWidth - destWidth) / 2;
        const destY = (canvasHeight - destHeight) / 2;
        
        // วาดภาพลงบน context ที่ถูก scale ไว้แล้ว
        ctx.drawImage(img, destX, destY, destWidth, destHeight);
    };

    if (base64Url) {
        const img = new Image();
        img.onload = () => drawImageScaled(img); 
        img.src = base64Url;
    } else if (fallbackServerId) {
        google.script.run
            .withSuccessHandler(base64 => {
                if(base64) {
                    const img = new Image();
                    img.onload = () => drawImageScaled(img); 
                    img.src = base64;
                }
            })
            .withFailureHandler(showError)
            .getImageAsBase64(fallbackServerId);
    }
}
function createCheckboxGroup(containerId, name, options, hasOther = false, defaultValue = null) {
    const container = document.getElementById(containerId);
    if(!container) return;
    // --- ส่วนที่แก้ไข: เพิ่มการเช็ค defaultValue ---
    container.innerHTML = options.map(opt => {
        const isChecked = (opt === defaultValue) ? 'checked' : '';
        return `<div class="form-check form-check-inline">
                    <input class="form-check-input" type="checkbox" name="${name}" value="${opt}" ${isChecked}>
                    <label class="form-check-label small">${opt}</label>
                </div>`;
    }).join('');
    
    if (hasOther) {
        container.insertAdjacentHTML('beforeend', `<div class="form-check form-check-inline"><input type="checkbox" name="${name}" value="อื่นๆ" class="form-check-input"><label class="small">อื่นๆ</label><input type="text" name="${name}_Other" class="form-control form-control-sm d-inline ms-1" style="width: auto;"></div>`);
    }
}

function getCheckboxGroupData(containerId, name) {
    const container = document.getElementById(containerId);
    const values = Array.from(container.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
    const otherInput = container.querySelector(`input[name="${name}_Other"]`);
    if (otherInput && otherInput.value.trim() && values.includes('อื่นๆ')) { values.splice(values.indexOf('อื่นๆ'), 1, otherInput.value.trim()); }
    return values.join(', ');
}

function populateCheckboxGroup(containerId, name, dataString) {
    if (!dataString) return; const dataArray = typeof dataString === 'string' ? dataString.split(', ') : dataString;
    const container = document.getElementById(containerId);
    const options = Array.from(container.querySelectorAll(`input[name="${name}"]`)).map(el => el.value);
    dataArray.forEach(val => { const cb = container.querySelector(`input[name="${name}"][value="${val}"]`); if(cb) cb.checked = true; else { const otherCb = container.querySelector(`input[name="${name}"][value="อื่นๆ"]`); if(otherCb) otherCb.checked = true; const otherInput = container.querySelector(`input[name="${name}_Other"]`); if(otherInput) otherInput.value = val; } });
}

function getCheckboxGroupDataWithDetails(formId, name) {
    const form = document.getElementById(formId);
    if (!form) return ''; // ถ้าไม่พบฟอร์ม ให้ส่งค่าว่างกลับ

    let values = [];
    // ค้นหาเฉพาะภายในฟอร์มที่ระบุ
    form.querySelectorAll(`input[name="${name}"]:checked`).forEach(cb => {
        const detailsInput = form.querySelector(`input[name="${name}_${cb.value.replace(/\s+/g, '')}_Details"]`);
        values.push(cb.value + (detailsInput && detailsInput.value ? `: ${detailsInput.value}` : ''));
    });
    return values.join(', ');
}

function populateCheckboxGroupWithDetails(formId, name, dataString) {
    const form = document.getElementById(formId);
    if (!form || !dataString) return; // Exit if no form or no data

    dataString.split(', ').forEach(item => {
        const parts = item.split(': ');
        // ค้นหาเฉพาะภายในฟอร์มที่ระบุ (form.querySelector)
        const cb = form.querySelector(`input[name="${name}"][value="${parts[0]}"]`); 
        if (cb) {
            cb.checked = true;
            if (parts.length > 1) {
                // ค้นหา details input เฉพาะภายในฟอร์มที่ระบุ (form.querySelector)
                const detailsInput = form.querySelector(`input[name="${name}_${parts[0].replace(/\s+/g, '')}_Details"]`);
                if (detailsInput) detailsInput.value = parts[1];
            }
        }
    });
}
function clearCanvas(padName) {
    if (signaturePads[padName]) {
        signaturePads[padName].clear();
    }
    // ถ้าเป็นการล้าง Body Chart ให้วาดรูปต้นฉบับกลับมา
    if (padName === 'bodyChart') {
        loadCanvasImage('bodyChartCanvas', null, BODY_CHART_IMAGE_ID);
    }
}
// =================================================================
// 5. DASHBOARD (UPDATED DESIGN)
// =================================================================
let charts = {};

function renderDashboard(data) {
    if (data.error) { showError(data); return; }

    document.getElementById('total-patients-card').textContent = data.totalPatients || 0;
    document.getElementById('completed-visits-card').textContent = data.visitProgress['สำเร็จ'] || 0;
    document.getElementById('pending-visits-card').textContent = data.visitProgress['อยู่ในกระบวนการบำบัด'] || 0;
    document.getElementById('waiting-visits-card').textContent = data.visitProgress['รอเยี่ยม'] || 0;
    document.getElementById('unscheduled-visits-card').textContent = data.visitProgress['ยังไม่กำหนดวันเยี่ยม'] || 0;
    
    // --- ส่วนที่แก้ไข: เพิ่มบรรทัดนี้ ---
    const dischargedCard = document.getElementById('discharged-visits-card');
    if (dischargedCard) {
        dischargedCard.textContent = data.visitProgress['ปิดบริการ'] || 0;
    }
    // -------------------------------

    Object.values(charts).forEach(chart => { if (chart) chart.destroy(); });

    charts.zoneChart = createChart('zoneChart', 'bar', data.zoneData, 'ผู้ป่วยแยกตามโซน');
    charts.diagnosisChart = createChart('diagnosisChart', 'bar', data.diagnosisData, 'กลุ่มโรค (Diagnosis)');
    charts.biChart = createChart('biChart', 'doughnut', data.biData, 'ระดับคะแนน BI');
    
    renderProgressBars(data.visitProgress);
    Swal.close();
}

function createChart(canvasId, type, data, label) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // --- 1. กำหนด Theme สี (Teal Palette & Accents) ---
    // ใช้สีหลักเป็น Teal ไล่เฉด และมีสีคู่ตรงข้ามสำหรับกราฟวงกลม
    const backgroundColors = [
        '#0d9488', // Teal 600 (Primary)
        '#2dd4bf', // Teal 400
        '#99f6e4', // Teal 200
        '#fbbf24', // Amber 400 (Contrast)
        '#f87171', // Red 400 (Contrast)
        '#94a3b8'  // Slate 400 (Neutral)
    ];

    // --- 2. ตั้งค่า Font Global ให้ตรงกับเว็บ ---
    Chart.defaults.font.family = "'Prompt', sans-serif";
    Chart.defaults.color = '#64748b'; // Slate 500

    // --- 3. ตั้งค่า Options พื้นฐาน ---
    const options = {
        responsive: true,
        maintainAspectRatio: false, // ให้ยืดหดตาม Container
        layout: {
            padding: { top: 10, bottom: 10, left: 10, right: 10 }
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom', // เอา Legend ไว้ข้างล่าง
                labels: {
                    usePointStyle: true, // ใช้จุดกลมแทนสี่เหลี่ยม
                    padding: 20,
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#111827',
                bodyColor: '#4b5563',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                padding: 10,
                boxPadding: 4,
                usePointStyle: true,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y + ' ราย';
                        } else {
                            // สำหรับ Doughnut
                            label += context.parsed + ' ราย';
                        }
                        return label;
                    }
                }
            },
            datalabels: {
                anchor: 'end',
                align: 'top', // เอาตัวเลขไว้บนแท่ง
                offset: 4,
                formatter: (value) => value > 0 ? value : '',
                font: { weight: 'bold', size: 11 },
                color: '#0f766e' // Teal 700
            }
        }
    };

    // --- 4. การตั้งค่าเฉพาะสำหรับ Bar Chart ---
    if (type === 'bar') {
        options.scales = {
            x: {
                grid: { display: false }, // ซ่อนเส้นตารางแนวตั้ง
                ticks: { font: { size: 11 } }
            },
            y: {
                beginAtZero: true,
                border: { display: false }, // ซ่อนเส้นแกน Y
                grid: { 
                    color: '#f1f5f9', // เส้นตารางแนวนอนสีจางๆ
                    borderDash: [5, 5] 
                },
                ticks: { stepSize: 1 }
            }
        };
        // ทำให้แท่งมนสวยงาม
        options.elements = {
            bar: {
                borderRadius: 4,
                borderSkipped: false // มนทั้ง 4 มุม (หรือลบออกถ้าอยากให้มนแค่ด้านบน)
            }
        };
    }

    // --- 5. การตั้งค่าเฉพาะสำหรับ Doughnut Chart ---
    if (type === 'doughnut') {
        options.cutout = '65%'; // รูตรงกลางกว้างขึ้น ดูทันสมัย
        options.plugins.datalabels = {
            color: '#fff',
            font: { weight: 'bold' },
            formatter: (value, ctx) => {
                let sum = 0;
                let dataArr = ctx.chart.data.datasets[0].data;
                dataArr.map(data => { sum += data; });
                let percentage = (value * 100 / sum).toFixed(0) + "%";
                return value > 0 ? percentage : ''; // แสดง % ในวงกลม
            },
            anchor: 'center',
            align: 'center'
        };
        // ปรับ Legend ของวงกลมให้ไม่ตีกัน
        options.plugins.legend.position = 'right'; 
    }

    // --- 6. สร้าง Dataset ---
    const chartData = {
        labels: Object.keys(data),
        datasets: [{
            label: label,
            data: Object.values(data),
            backgroundColor: type === 'bar' ? '#0d9488' : backgroundColors, // Bar สีเดียว, Doughnut หลายสี
            hoverBackgroundColor: type === 'bar' ? '#0f766e' : undefined,
            borderWidth: 0,
            barThickness: 30, // ความกว้างแท่งกราฟ (สำหรับ bar)
            maxBarThickness: 40
        }]
    };

    // ถ้าเป็นกราฟ Zone หรือ Diagnosis อยากให้แต่ละแท่งคนละสี ก็เปิดบรรทัดนี้
    // if (type === 'bar') chartData.datasets[0].backgroundColor = backgroundColors;

    return new Chart(ctx, {
        type: type,
        data: chartData,
        options: options
    });
}
/**
 * ฟังก์ชันสำหรับแสดง Progress Bar ใน Dashboard
 */
function renderProgressBars(progressData) {
    const container = document.getElementById('progress-bars-container');
    const percentageEl = document.getElementById('progress-percentage');
    
    if (!container || !percentageEl) return;

    // --- ส่วนที่แก้ไข: เพิ่มสีสำหรับ 'ปิดบริการ' ---
    const colors = {
        'ยังไม่กำหนดวันเยี่ยม': '#ef4444', // แดง
        'รอเยี่ยม': '#f97316',            // ส้ม
        'อยู่ในกระบวนการบำบัด': '#eab308', // เหลือง
        'สำเร็จ': '#0d9488',              // เขียว
        'ปิดบริการ': '#64748b'            // เทา (Slate 500)
    };
    
    // คำนวณยอดรวม (ต้องลบยอด 'ปิดบริการ' ออกก่อนคำนวณ % ความสำเร็จของ Active Case หรือไม่ แล้วแต่ Logic แต่สูตรนี้คิดรวมทั้งหมด)
    const total = Object.values(progressData).reduce((sum, val) => sum + val, 0);
    const activeTotal = total - (progressData['ปิดบริการ'] || 0); // ยอดผู้ป่วย Active ทั้งหมด
    const completed = progressData['สำเร็จ'] || 0;
    
    // คำนวณ % เฉพาะเคสที่ยัง Active (หรือจะหาร total ทั้งหมดก็ได้)
    // ในที่นี้หาร activeTotal เพื่อดูความสำเร็จของเคสที่ดูแลอยู่
    const successPercentage = activeTotal > 0 ? ((completed / activeTotal) * 100).toFixed(1) : 0;
    
    percentageEl.textContent = `${successPercentage}% สำเร็จ (Active)`;

    let individualBarsHtml = '';
    // --- ส่วนที่แก้ไข: เพิ่ม 'ปิดบริการ' ใน Order ---
    const orderedKeys = ['ยังไม่กำหนดวันเยี่ยม', 'รอเยี่ยม', 'อยู่ในกระบวนการบำบัด', 'สำเร็จ', 'ปิดบริการ'];

    orderedKeys.forEach(key => {
        if (progressData.hasOwnProperty(key)) {
            const value = progressData[key];
            const percentage = total > 0 ? (value / total) * 100 : 0;
            const color = colors[key] || '#cbd5e1';

            individualBarsHtml += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between mb-1">
                        <span class="text-xs text-gray-600 font-medium">${key}</span>
                        <span class="text-xs text-gray-800 font-bold">${value} ราย</span>
                    </div>
                    <div class="progress" style="height: 6px; background-color: #f1f5f9; border-radius: 999px;">
                        <div class="progress-bar" role="progressbar" 
                             style="width: ${percentage}%; background-color: ${color}; border-radius: 999px;" 
                             aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                </div>
            `;
        }
    });

    let combinedBarHtml = `
        <div class="mt-4 pt-3 border-t border-gray-100">
            <h5 class="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">ภาพรวมทั้งหมด (${total} ราย)</h5>
            <div class="d-flex overflow-hidden" style="height: 12px; border-radius: 6px; background-color: #f1f5f9;">
    `;
    
    orderedKeys.forEach(key => {
        if (progressData.hasOwnProperty(key) && progressData[key] > 0) {
            const value = progressData[key];
            const percentage = (value / total) * 100;
            const color = colors[key] || '#cbd5e1';
            
            combinedBarHtml += `
                <div style="width: ${percentage}%; background-color: ${color};" 
                     title="${key}: ${value} ราย"
                     class="h-100"></div>`;
        }
    });
    
    combinedBarHtml += `</div></div>`;

    container.innerHTML = individualBarsHtml + combinedBarHtml;
}
// =================================================================
// 6. PATIENT LIST & DETAIL VIEW
// =================================================================
/**
 * Generates the HTML for the schedule status button or progress bar.
 * @param {object} scheduleInfo - An object with { completed, total } properties.
 * @param {string} patientId - The ID of the patient.
 * @returns {string} The HTML string for the button/progress bar.
 */
function generateScheduleButtonHTML(scheduleInfo, patientId) {
    // --- START: แก้ไขตรรกะการแสดงผลสถานะ ---
    if (scheduleInfo) {
        const { completed, total } = scheduleInfo;
        // เงื่อนไข: เยี่ยมครบตามนัดแล้ว หรือ เยี่ยมครบ 10 ครั้งขึ้นไป
        if ((total > 0 && completed >= total) || completed >= 10) {
            return `<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-semibold">
                        <i class="bi bi-check-circle-fill mr-1"></i>เยี่ยมสำเร็จ
                    </span>`;
        }
    }
    // --- END: สิ้นสุดการแก้ไข ---

    if (!scheduleInfo || scheduleInfo.total < 1) {
        return `<button class="bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded" onclick="event.stopPropagation(); openScheduleModal('${patientId}')">กำหนดวันเยี่ยม</button>`;
    }

    const { completed, total } = scheduleInfo;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    let colorClass = 'bg-yellow-400'; // สีเหลืองสำหรับ 'อยู่ในกระบวนการ'
    if (completed === 0) {
         colorClass = 'bg-blue-400'; // สีฟ้าสำหรับ 'รอเยี่ยม'
    }

    return `
        <div class="schedule-progress-container" onclick="event.stopPropagation(); openScheduleModal('${patientId}')">
            <span class="text-xs">เยี่ยมแล้ว ${completed}/${total} ครั้ง</span>
            <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div class="${colorClass} h-1.5 rounded-full" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}
// แทนที่ฟังก์ชัน displayPatients เดิมด้วยอันนี้ครับ
function displayPatients(list) {
    const tbody = document.getElementById('patient-table-body');
    const thead = document.getElementById('patient-table-header');
    tbody.innerHTML = '';
    thead.innerHTML = '';

    if (!list || list.length === 0) {
        // เพิ่ม colSpan เป็น 10 เนื่องจากเราเพิ่มคอลัมน์ใหม่
        const colSpan = 10;
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center py-4 text-gray-500">ไม่พบข้อมูลผู้ป่วย</td></tr>`;
        return;
    }

    // --- สร้าง Header ตาม Tab ---
    if (currentPatientTab === 'Active') {
        thead.innerHTML = `
            <th class="px-6 py-3">CN</th>
            <th class="px-6 py-3 min-w-[220px] w-[18%] whitespace-nowrap">ชื่อ-สกุล</th>
            <th class="px-6 py-3 min-w-[180px] w-[18%]">ที่อยู่</th>
            <th class="px-6 py-3">Zone</th>
            <th class="px-6 py-3 whitespace-nowrap w-[140px]">โทรศัพท์</th>
            <th class="px-6 py-3 text-center">BI</th>
            <th class="px-6 py-3 whitespace-nowrap">สถานะการเยี่ยม</th>
            <th class="px-6 py-3 text-center whitespace-nowrap">วันนัดถัดไป</th>
            <th class="px-6 py-3 text-center whitespace-nowrap">วันครบกำหนด</th> 
            <th class="px-6 py-3 text-center whitespace-nowrap">จัดการ</th>
        `;
    } else {
        thead.innerHTML = `
            <th class="px-6 py-3">CN</th>
            <th class="px-6 py-3 min-w-[220px] w-[18%] whitespace-nowrap">ชื่อ-สกุล</th>
            <th class="px-6 py-3 min-w-[180px] w-[18%]">ที่อยู่</th>
            <th class="px-6 py-3">Zone</th>
            <th class="px-6 py-3 whitespace-nowrap w-[140px]">โทรศัพท์</th>
            <th class="px-6 py-3 text-center">BI</th>
            <th class="px-6 py-3 whitespace-nowrap">สถานะ</th>
            <th class="px-6 py-3 text-center whitespace-nowrap">เก็บเวชระเบียน</th>
            <th class="px-6 py-3 text-center whitespace-nowrap">จัดการ</th>
        `;
    }

    // --- สร้าง Rows ---
    list.forEach(p => {
        const row = tbody.insertRow();
        row.style.backgroundColor = getZoneColor(p.Zone);
        row.className = 'hover:bg-gray-50 cursor-pointer transition-colors';
        
        const scheduleInfo = p.scheduleInfo || { completed: 0 };
        const displayAddress = p.ShortAddress || p.FullAddress || p.Address || '-';
        
        // ข้อมูลพื้นฐาน
        const commonCols = `
            <td class="p-3 border-b font-medium text-gray-700">${p.ClinicNumber}</td>
            <td class="p-3 border-b font-bold text-teal-800 whitespace-nowrap min-w-[220px]">${p.PatientName}</td>
            <td class="p-3 border-b text-gray-600 truncate max-w-[180px] whitespace-nowrap" title="${displayAddress}">${displayAddress}</td>
            <td class="p-3 border-b text-gray-600">${p.Zone}</td>
            <td class="p-3 border-b text-gray-600 whitespace-nowrap w-[140px]">${p.Phone || '-'}</td>
            <td class="p-3 border-b text-center font-semibold">${p.LatestBI || '-'}</td>
        `;

        if (currentPatientTab === 'Active') {
            // ---------------- Active Tab ----------------
            
            // วันนัดถัดไป
            let nextApptHtml;
            if (p.NextAppointment) {
                const d = new Date(p.NextAppointment);
                const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                nextApptHtml = `<button onclick="event.stopPropagation(); openScheduleModal('${p.PatientID}')" class="text-teal-600 hover:text-teal-800 font-bold bg-teal-50 px-2 py-1 rounded border border-teal-100 shadow-sm">${dateStr}</button>`;
            } else {
                nextApptHtml = `<button onclick="event.stopPropagation(); openScheduleModal('${p.PatientID}')" class="text-gray-400 hover:text-teal-600 text-xs border border-dashed border-gray-300 px-2 py-1 rounded">+ นัดหมาย</button>`;
            }

            // --- ส่วนที่เพิ่มใหม่: วันครบกำหนด (DueDate) ---
            let dueDateHtml;
            if (p.DueDate) {
                // p.DueDate มักจะมาเป็น ISO String หรือ Date Object
                const d = new Date(p.DueDate);
                const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                // ใช้สีเหลืองเข้ม (Amber 600) เพื่อความเด่นชัด
                dueDateHtml = `<span class="text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-200 shadow-sm">${dateStr}</span>`;
            } else {
                dueDateHtml = `<span class="text-gray-300">-</span>`;
            }

            // ปุ่มจัดการ
            const manageHtml = `
                <div class="flex justify-center items-center gap-2">
                    <button onclick="event.stopPropagation(); openScheduleModal('${p.PatientID}')" class="text-white bg-teal-500 hover:bg-teal-600 p-1.5 rounded-lg shadow-sm transition" title="กำหนดวันนัด">
                        <i class="bi bi-calendar-plus"></i>
                    </button>
                    <button onclick="event.stopPropagation(); confirmDischarge('${p.PatientID}', '${p.PatientName}')" class="text-white bg-red-500 hover:bg-red-600 p-1.5 rounded-lg shadow-sm transition" title="ปิดบริการ">
                        <i class="bi bi-person-x"></i>
                    </button>
                </div>
            `;

            row.innerHTML = commonCols + `
                <td class="p-3 border-b text-sm text-gray-600 whitespace-nowrap">เยี่ยมแล้ว ${scheduleInfo.completed} ครั้ง</td>
                <td class="p-3 border-b text-center whitespace-nowrap">${nextApptHtml}</td>
                <td class="p-3 border-b text-center whitespace-nowrap">${dueDateHtml}</td> 
                <td class="p-3 border-b text-center whitespace-nowrap">${manageHtml}</td>
            `;

        } else {
            // ---------------- Discharged Tab ----------------
            const recordKeptCheckbox = `
                <input type="checkbox" class="w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500" 
                    ${p.RecordKept ? 'checked' : ''} 
                    onclick="event.stopPropagation();" 
                    onchange="updateRecordKeptStatus('${p.PatientID}', this.checked)">
            `;
            
            const downloadBtn = `
                <button class="text-gray-600 hover:text-teal-600 transition" onclick="event.stopPropagation(); openDownloadModal('${p.PatientID}', '${p.PatientName}')" title="ดาวน์โหลดเวชระเบียน">
                    <i class="bi bi-file-earmark-arrow-down-fill text-xl"></i>
                </button>
            `;

            row.innerHTML = commonCols + `
                <td class="p-3 border-b whitespace-nowrap"><span class="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-0.5 rounded border border-gray-200">ปิดบริการ</span></td>
                <td class="p-3 border-b text-center whitespace-nowrap">${recordKeptCheckbox}</td>
                <td class="p-3 border-b text-center whitespace-nowrap">${downloadBtn}</td>
            `;
        }

        row.onclick = () => viewPatientDetail(p.PatientID);
    });
}
function filterPatients() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const selectedZone = document.getElementById('zoneFilter').value;

    const filtered = allPatients.filter(p => {
        // 1. Filter by Tab Status
        const pStatus = p.PatientStatus || 'Active'; // ถ้าไม่มีสถานะ ถือว่าเป็น Active
        const tabStatusMatch = (currentPatientTab === 'Active') 
                               ? (pStatus !== 'Discharged') 
                               : (pStatus === 'Discharged');

        if (!tabStatusMatch) return false;

        // 2. Filter by Zone
        const inZone = !selectedZone || p.Zone === selectedZone;

        // 3. Filter by Search Term
        const nameMatch = (p.PatientName || '').toLowerCase().includes(searchTerm);
        const cnMatch = String(p.ClinicNumber || '').toLowerCase().includes(searchTerm);
        const matchesSearch = !searchTerm || nameMatch || cnMatch;

        return inZone && matchesSearch;
    });
    displayPatients(filtered);
}
function confirmDischarge(patientId, patientName) {
    Swal.fire({
        title: 'ปิดบริการผู้ป่วย?',
        html: `ต้องการปิดบริการ <b>${patientName}</b> ใช่หรือไม่?<br>รายชื่อจะถูกย้ายไปยัง "ทะเบียนผู้ป่วยที่ปิดบริการ"`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ใช่, ปิดบริการ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading('กำลังดำเนินการ...');
            google.script.run
                .withSuccessHandler(response => {
                    if (response.status === 'success') {
                        showSuccessToast(response.message);

                        // อัปเดตข้อมูลใน Local Variable
                        const pIndex = allPatients.findIndex(p => p.PatientID === patientId);
                        if (pIndex !== -1) {
                            allPatients[pIndex].PatientStatus = 'Discharged';
                        }

                        // รีเฟรชหน้า
                        filterPatients();
                        Swal.close();
                    } else {
                        showError(response);
                    }
                })
                .withFailureHandler(showError)
                .dischargePatient(patientId);
        }
    });
}

function viewPatientDetail(id) {
    showLoading('กำลังโหลดรายละเอียด...');
    google.script.run
        .withSuccessHandler(patient => {
            if (!patient) {
                showError({ message: 'ไม่พบข้อมูลผู้ป่วย' });
                showListView();
                return;
            }
            currentPatient = patient;
            currentPatientRecords = null;
            currentDetailVisitDate = '';
            setActiveView('patient-detail-view', `รายละเอียดผู้ป่วย: ${patient.PatientName}`);
            
            document.getElementById('detail-photo').src = patient.PatientPhotoBase64 || "https://placehold.co/150x200";
            
            document.getElementById('patient-info-grid').innerHTML = `<div class="rounded-xl bg-slate-50 p-4 text-sm text-center text-gray-500">กำลังโหลดประวัติเข้ารับบริการ...</div>`;

            document.getElementById('detail-edit-button').onclick = () => editPatient(patient.PatientID);
            document.getElementById('detail-delete-button').onclick = () => confirmDeletePatient(patient.PatientID, patient.PatientName);
            
            switchDetailTab(null, 'info-tab');
        })
        .withFailureHandler(showError)
        .getPatientById(id);
}

function getActiveDetailTabId() {
    const activeTab = document.querySelector('.detail-tab-link.active');
    if (!activeTab) return '';
    const onclickText = activeTab.getAttribute('onclick') || '';
    const match = onclickText.match(/'([^']+)'/);
    return match ? match[1] : '';
}

function parseJsonSafe(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (error) { return fallback; }
}

function normalizePatientDetailDate(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function splitDisplayValues(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item).trim()).filter(Boolean);
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function formatTimeDisplay(value) {
    if (!value) return '-';
    const stringValue = String(value);
    if (/^\d{2}:\d{2}/.test(stringValue)) return stringValue.slice(0, 5);
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return stringValue;
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

function getPatientVisitGroups(records = currentPatientRecords) {
    if (!records) return [];
    const groups = {};
    const register = (items, bucket, dateField) => {
        (items || []).forEach(record => {
            const dateKey = normalizePatientDetailDate(record[dateField]);
            if (!dateKey) return;
            if (!groups[dateKey]) groups[dateKey] = { date: dateKey, consents: [], biAssessments: [], opdRecords: [], soapNotes: [] };
            groups[dateKey][bucket].push(record);
        });
    };
    register(records.consents, 'consents', 'ConsentDate');
    register(records.biAssessments, 'biAssessments', 'AssessmentDate');
    register(records.opdRecords, 'opdRecords', 'VisitDate');
    register(records.soapNotes, 'soapNotes', 'VisitDate');
    return Object.values(groups).map(group => ({
        ...group,
        totalRecords: group.consents.length + group.biAssessments.length + group.opdRecords.length + group.soapNotes.length
    })).sort((a, b) => b.date.localeCompare(a.date));
}

function loadPatientDetailRecords(onReady) {
    if (!currentPatient) return;
    google.script.run
        .withSuccessHandler(response => {
            if (response.status !== 'success') return showError(response);
            currentPatientRecords = response.records || { consents: [], biAssessments: [], opdRecords: [], soapNotes: [] };
            const visitGroups = getPatientVisitGroups();
            if (visitGroups.length > 0) {
                const hasSelectedDate = visitGroups.some(group => group.date === currentDetailVisitDate);
                if (!hasSelectedDate) currentDetailVisitDate = visitGroups[0].date;
            } else {
                currentDetailVisitDate = '';
            }
            renderPatientVisitTimeline();
            if (typeof onReady === 'function') onReady();
            else Swal.close();
        })
        .withFailureHandler(showError)
        .getAllRecordsForPatient(currentPatient.PatientID);
}

function renderPatientVisitTimeline() {
    const container = document.getElementById('patient-info-grid');
    if (!container) return;
    const visitGroups = getPatientVisitGroups();
    if (visitGroups.length === 0) {
        container.innerHTML = `
            <div class="space-y-2">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">ประวัติเข้ารับบริการ</p>
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-gray-500">ยังไม่พบข้อมูลการเข้ารับบริการ</div>
            </div>`;
        return;
    }
    container.innerHTML = `
        <div class="space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">ประวัติเข้ารับบริการ</p>
            <div class="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                ${visitGroups.map(group => `
                    <button type="button" onclick="selectPatientVisitDate('${group.date}')" class="w-full rounded-lg border px-3 py-2 text-left transition ${group.date === currentDetailVisitDate ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50'}">
                        <div class="flex items-center justify-between gap-2">
                            <p class="text-sm font-semibold leading-tight">${formatThaiDate(group.date)}</p>
                            ${group.date === currentDetailVisitDate ? '<i class="bi bi-chevron-right text-xs"></i>' : ''}
                        </div>
                    </button>`).join('')}
            </div>
        </div>`;
}

function selectPatientVisitDate(date) {
    currentDetailVisitDate = date;
    renderPatientVisitTimeline();
    if (getActiveDetailTabId() === 'info-tab') displayPatientMedicalInfo();
}

function switchDetailTab(event, tabId) { if(event) event.preventDefault(); document.querySelectorAll('.detail-tab-link').forEach(t => t.classList.remove('active')); if(event) event.target.classList.add('active'); else document.querySelector(`.detail-tab-link[onclick*="${tabId}"]`).classList.add('active'); const contentEl = document.getElementById('detail-tab-content'); contentEl.innerHTML = '<p class="text-center p-4">กำลังโหลดข้อมูล...</p>'; if (tabId === 'info-tab') displayPatientMedicalInfo(); if (tabId === 'schedule-tab') displayPatientScheduleTab(); if (tabId === 'emr-tab') displayEMRTab(); }
function displayPatientMedicalInfo() {
    const container = document.getElementById('detail-tab-content');
    if (!container || !currentPatient) return;
    if (!currentPatientRecords) {
        container.innerHTML = '<p class="text-center p-4 text-gray-500">กำลังโหลดข้อมูลการรักษา...</p>';
        loadPatientDetailRecords(() => displayPatientMedicalInfo());
        return;
    }
    const safeThaiDate = value => value ? formatThaiDate(value) : '-';
    const safeValue = value => value === 0 ? '0' : (value ? value : '-');
    const visitGroups = getPatientVisitGroups();
    const selectedVisit = visitGroups.find(group => group.date === currentDetailVisitDate) || visitGroups[0] || null;
    if (selectedVisit) currentDetailVisitDate = selectedVisit.date;
    renderPatientVisitTimeline();

    const createField = (label, value, spanClass = '') => `<div class="${spanClass}"><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">${label}</p><p class="mt-0.5 text-sm leading-snug text-gray-800 whitespace-pre-line break-words">${safeValue(value)}</p></div>`;
    const renderPills = (value, tone = 'slate') => {
        const toneMap = { slate: 'bg-slate-100 text-slate-700', emerald: 'bg-emerald-50 text-emerald-700', indigo: 'bg-indigo-50 text-indigo-700', amber: 'bg-amber-50 text-amber-700', sky: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700' };
        const values = splitDisplayValues(value);
        if (!values.length) return '<span class="text-sm text-gray-400">-</span>';
        return `<div class="flex flex-wrap gap-1.5">${values.map(item => `<span class="rounded-full px-2 py-0.5 text-[11px] font-medium ${toneMap[tone] || toneMap.slate}">${item}</span>`).join('')}</div>`;
    };
    const renderObjectGrid = (obj) => {
        if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) return '<p class="text-sm text-gray-400">-</p>';
        const flatten = (source, prefix = '') => Object.entries(source).flatMap(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) return flatten(value, prefix ? `${prefix} ${key}` : key);
            return [{ label: prefix ? `${prefix} ${key}` : key, value: safeValue(value) }];
        });
        return `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${flatten(obj).map(item => `<div class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2"><p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">${item.label}</p><p class="mt-0.5 text-sm leading-snug text-gray-700 whitespace-pre-line">${item.value}</p></div>`).join('')}</div>`;
    };
    const createActions = (type, recordId) => `<div class="flex flex-wrap gap-1.5"><button class="btn btn-outline-secondary btn-sm py-1 px-2" onclick="editRecordFromEMR('${type}', '${recordId}')"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-outline-info btn-sm py-1 px-2" onclick="printRecord('${type}', '${recordId}')"><i class="bi bi-printer-fill"></i></button><button class="btn btn-outline-danger btn-sm py-1 px-2" onclick="confirmDeleteFromEMR('${type}', '${recordId}')"><i class="bi bi-trash-fill"></i></button></div>`;
    const createCollapsibleCard = (title, toneClass, metaText, bodyHtml, actionsHtml, open = false) => `<details class="rounded-xl border ${toneClass} bg-white shadow-sm" ${open ? 'open' : ''}><summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5"><div><p class="text-sm font-bold text-gray-800">${title}</p><p class="text-[11px] text-gray-500 leading-tight">${metaText}</p></div><i class="bi bi-chevron-down text-xs text-gray-400"></i></summary><div class="border-t border-slate-100 px-3 py-3 space-y-3">${actionsHtml}${bodyHtml}</div></details>`;
    const createSubSection = (title, content, wide = false) => `<div class="rounded-lg border border-slate-200 bg-slate-50 p-3 ${wide ? 'md:col-span-2' : ''}"><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">${title}</p><div class="mt-1 text-sm leading-snug text-gray-700 whitespace-pre-line">${content || '-'}</div></div>`;
    const createSignatureCard = (title, name, signature) => (!name && !signature) ? '' : `<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">${title}</p><p class="mt-0.5 text-sm leading-snug text-gray-800">${safeValue(name)}</p>${signature ? `<img src="${signature}" class="mt-2 max-h-20 rounded border border-slate-200 bg-white p-1">` : ''}</div>`;
    const treatmentLabelMap = { QualityMove: 'Quality move train', BedMobility: 'Bed mobility train', Balance: 'Balance train', Gait: 'Gait training', Other: 'Other' };
    const renderTreatmentCards = (jsonString) => {
        const data = parseJsonSafe(jsonString, {});
        if (!data || Object.keys(data).length === 0) return '<p class="text-sm text-gray-400">-</p>';
        const cards = Object.entries(data).map(([key, value]) => {
            if (!value || typeof value !== 'object') return '';
            if (key === 'Ambulation') return `<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="text-sm font-semibold text-gray-800">Ambulation</p><p class="mt-1 text-sm leading-snug text-gray-700">สถานะ: ${safeValue(value.Status)}${value.PWB_Percent ? ` (${value.PWB_Percent}%)` : ''}</p></div>`;
            const details = Array.isArray(value.details) ? value.details.join(', ') : '-';
            return `<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="text-sm font-semibold text-gray-800">${treatmentLabelMap[key] || key}</p><p class="mt-1 text-sm text-gray-600">เวลา: ${safeValue(value.time)} นาที</p><p class="mt-1 text-sm leading-snug text-gray-700 whitespace-pre-line">${details || '-'}</p></div>`;
        }).filter(Boolean);
        return cards.length ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${cards.join('')}</div>` : '<p class="text-sm text-gray-400">-</p>';
    };

    const generalInfoHtml = `
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center gap-2">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><i class="bi bi-person-vcard-fill"></i></span>
                <h3 class="text-sm font-bold text-gray-800">ข้อมูลผู้ป่วย</h3>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            ${createField('CN', currentPatient.ClinicNumber)}
            ${createField('เลขบัตรประชาชน', currentPatient.NationalID)}
            ${createField('ชื่อ-สกุล', currentPatient.PatientName, 'xl:col-span-2')}
            ${createField('เพศ', currentPatient.Gender)}
            ${createField('วันเกิด / อายุ', currentPatient.DateOfBirth ? `${safeThaiDate(currentPatient.DateOfBirth)} (${calculateAge(currentPatient.DateOfBirth)} ปี)` : '-')}
            ${createField('สถานภาพ', currentPatient.MaritalStatus)}
            ${createField('สิทธิ์การรักษา', currentPatient.TreatmentRightsDisplay || currentPatient.TreatmentRights, 'xl:col-span-2')}
            ${createField('ที่อยู่', currentPatient.FullAddress, 'xl:col-span-4')}
            ${createField('น้ำหนัก (กก.)', currentPatient.Weight)}
            ${createField('ส่วนสูง (ซม.)', currentPatient.Height)}
            ${createField('IMC Dx.', currentPatient.IMCDx)}
            ${createField('ชนิด Stroke', currentPatient.StrokeType)}
            ${createField('ICD 10', currentPatient.ICD10)}
            ${createField('BI แรกรับ', currentPatient.InitialBI)}
            ${createField('Admit Date', safeThaiDate(currentPatient.AdmitDate))}
            ${createField('Discharge Date', safeThaiDate(currentPatient.DischargeDate))}
            ${createField('วันครบกำหนด', safeThaiDate(currentPatient.DueDate))}
            ${createField('ชื่อผู้ดูแลหลัก', currentPatient.CaregiverName)}
            ${createField('ความเกี่ยวข้อง', currentPatient.CaregiverRelationship)}
            ${createField('เบอร์โทรศัพท์', currentPatient.Phone)}
            ${createField('Zone', currentPatient.Zone)}
            ${createField('นักกายภาพผู้ดูแล', currentPatient.AssignedPT, 'xl:col-span-2')}
            ${createField('แพ้ยา / ข้อควรระวัง', currentPatient.Allergies, 'xl:col-span-4')}
            </div>
        </div>
    `;

    const renderConsentCards = (records) => (records || []).map(record => {
        const bodyHtml = `<div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('วันที่', safeThaiDate(record.ConsentDate))}${createSubSection('ชื่อ-สกุลผู้ให้คำยินยอม', safeValue(record.ConsenterName))}</div>`;
        return createCollapsibleCard('ใบยินยอม', 'border-emerald-200', `${safeThaiDate(record.ConsentDate)} | ${safeValue(record.ConsenterName)}`, bodyHtml, createActions('Consent', record.ConsentID));
    }).join('');
    const renderBiCards = (records) => (records || []).map(record => {
        const bodyHtml = `<div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('คะแนนรวม', safeValue(record.TotalScore))}${createSubSection('ครั้งที่', safeValue(record.VisitCount))}${createSubSection('Multiple Impairment', renderPills([record.impairment_swallowing && 'Swallowing', record.impairment_communicate && 'Communicate', record.impairment_mobility && 'Mobility', record.impairment_cognitive && 'Cognitive / Perception', record.impairment_bowel && 'Bowel and Bladder'].filter(Boolean), 'indigo'))}${createSubSection('FX. AROUND HIP', renderPills([record.fx_bathroom && 'เข้าห้องน้ำ', record.fx_bed && 'ขึ้นลงจากเตียง', record.fx_movement && 'เคลื่อนไหว / ยืน / นั่ง / เดิน', record.fx_stairs && 'ขึ้นลงบันได'].filter(Boolean), 'amber'))}</div>`;
        return createCollapsibleCard('BI', 'border-indigo-200', `${safeThaiDate(record.AssessmentDate)} | คะแนนรวม ${safeValue(record.TotalScore)}`, bodyHtml, createActions('BI', record.AssessmentID));
    }).join('');
    const renderOpdCards = (records) => (records || []).map(record => {
        const physicalExamHtml = `<div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Level of consciousness', safeValue(record.LevelOfConsciousness))}${createSubSection('Communication', `${safeValue(record.Communication)}${record.Communication === 'Aphasia' && record.CommunicationAphasiaType ? ` (${record.CommunicationAphasiaType})` : ''}`)}${createSubSection('Equipment', (() => { const items = String(record.Equipment || '').split(', ').filter(Boolean).map(item => item === 'Other' ? (record.EquipmentOther ? `Other: ${record.EquipmentOther}` : 'Other') : item); return items.length ? renderPills(items, 'slate') : '-'; })())}${createSubSection('Bed mobility', safeValue(record.BedMobility))}${createSubSection('Gross motor', safeValue(record.GrossMotor))}${createSubSection('Gait analysis', renderObjectGrid(parseJsonSafe(record.GaitAnalysis_Details, {})))}${createSubSection('Quality of movement', renderObjectGrid(parseJsonSafe(record.QualityMovement, {})))}${createSubSection('Joint / Sensation UE', renderObjectGrid(parseJsonSafe(record.JointSensation_UE_Details, {})))}${createSubSection('Joint / Sensation LE', renderObjectGrid(parseJsonSafe(record.JointSensation_LE_Details, {})))}${createSubSection('Balance', renderObjectGrid(parseJsonSafe(record.Balance, {})))}${createSubSection('PROM', renderPills(record.PROM, 'rose'))}${createSubSection('Length', renderPills(record.Length, 'rose'))}${createSubSection('Tone', renderPills(record.Tone, 'rose'))}${createSubSection('Other', safeValue(record.OtherPhysical))}</div>`;
        const bodyHtml = `<div class="space-y-3"><div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Visit Info & Vital signs', `เวลา ${formatTimeDisplay(record.StartTime)} - ${formatTimeDisplay(record.EndTime)}\nBarthel Index: ${safeValue(record.BarthelIndex)}\nBT: ${safeValue(record.BT)} | Pulse: ${safeValue(record.Pulse)} | RR: ${safeValue(record.RR)}\nBP: ${safeValue(record.BP)} | SpO2: ${safeValue(record.SpO2)}`, true)}${createSubSection('Diagnosis', renderPills(record.Diagnosis, 'amber'))}${createSubSection('Chief complaint (CC)', safeValue(record.ChiefComplaint))}${createSubSection('Present Illness (PH/PI)', safeValue(record.PHPI))}${createSubSection('Medical Treatment', safeValue(record.MedicalTreatment))}${createSubSection('U/D', renderPills(record.UD, 'slate'))}${createSubSection('Fx.Around HIP status', `${safeValue(record.FxHIP_Status)}${record.FxHIP_PWB_Percent ? ` (${record.FxHIP_PWB_Percent}%)` : ''}`)}</div><div>${physicalExamHtml}</div>${record.BodyChartDrawingBase64 ? `<div class="rounded-lg border border-slate-200 bg-white p-3"><p class="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">Body Chart</p><img src="${record.BodyChartDrawingBase64}" class="mt-2 max-h-64 rounded border border-slate-200 bg-white p-1"></div>` : ''}<div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Problem List', renderPills(record.ProblemList, 'rose'))}${createSubSection('Goals of Treatment', renderPills(record.GoalsOfTreatment, 'emerald'))}${createSubSection('Plan of Treatment', renderPills(record.PlanOfTreatment, 'sky'))}${createSubSection('Treatment', renderTreatmentCards(record.Treatment_Details), true)}</div><div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSignatureCard('ลายมือชื่อผู้ตรวจรักษา', record.TherapistName, record.TherapistSignatureBase64)}${createSignatureCard('ลายมือชื่อผู้รับบริการ / ญาติ', record.PatientNameFull, record.PatientSignatureBase64)}</div></div>`;
        return createCollapsibleCard('OPD Card', 'border-amber-200', `${safeThaiDate(record.VisitDate)} | ครั้งที่ ${safeValue(record.VisitCount)}`, bodyHtml, createActions('Opd', record.RecordID));
    }).join('');
    const renderSoapCards = (records) => (records || []).map(record => {
        const objective = parseJsonSafe(record.ObjectiveJSON, {});
        const objectiveHtml = `<div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Quality of movement', objective.QualityMovement_Check ? renderObjectGrid(objective.QualityMovement || {}) : '-')}${createSubSection('Other', objective.Other_Check || objective.Other_Details ? safeValue(objective.Other_Details) : '-')}</div>`;
        const bodyHtml = `<div class="space-y-3"><div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Visit Info & Vital signs', `เวลา ${formatTimeDisplay(record.StartTime)} - ${formatTimeDisplay(record.EndTime)}\nBT: ${safeValue(record.BT)} | Pulse: ${safeValue(record.Pulse)} | RR: ${safeValue(record.RR)}\nBP: ${safeValue(record.BP)} | SpO2: ${safeValue(record.SpO2)}`, true)}${createSubSection('Diagnosis', renderPills(parseJsonSafe(record.DiagnosisJSON, []), 'sky'))}${createSubSection('Subjective', safeValue(record.Subjective))}${createSubSection('Analysis / Assessment', safeValue(record.Analysis))}</div><div>${objectiveHtml}</div><div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSubSection('Treatment', renderTreatmentCards(record.TreatmentJSON), true)}${createSubSection('Plan of treatment', renderPills(record.Plan, 'emerald'))}</div><div class="grid grid-cols-1 gap-2 md:grid-cols-2">${createSignatureCard('ลายมือชื่อผู้ตรวจรักษา', record.TherapistName, record.TherapistSignatureBase64)}${createSignatureCard('ลายมือชื่อผู้รับบริการ / ญาติ', record.PatientNameFull, record.PatientSignatureBase64)}</div></div>`;
        return createCollapsibleCard('SOAP Note', 'border-sky-200', `${safeThaiDate(record.VisitDate)} | ครั้งที่ ${safeValue(record.VisitCount)} | คะแนน BI ${safeValue(record.BI_TotalScore)}`, bodyHtml, createActions('SOAP', record.SOAPNoteID));
    }).join('');

    const selectedVisitHtml = selectedVisit ? [
        renderConsentCards(selectedVisit.consents),
        renderBiCards(selectedVisit.biAssessments),
        renderOpdCards(selectedVisit.opdRecords),
        renderSoapCards(selectedVisit.soapNotes)
    ].filter(Boolean).join('') : '';

    container.innerHTML = `
        <div class="space-y-4">
            ${generalInfoHtml}
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">ข้อมูลการเข้ารับบริการ</p>
                <p class="mt-1 text-base font-bold text-gray-800">${selectedVisit ? safeThaiDate(selectedVisit.date) : 'ยังไม่มีวันที่เข้ารับบริการ'}</p>
            </div>
            ${selectedVisitHtml ? `<div class="space-y-3">${selectedVisitHtml}</div>` : '<div class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-gray-500">ยังไม่พบรายละเอียดการเข้ารับบริการในวันที่เลือก</div>'}
        </div>`;
    Swal.close();
}
/**
 * แสดงแท็บตารางนัดหมายและประวัติการเยี่ยมในหน้ารายละเอียดผู้ป่วย
 * ปรับปรุง: ใช้รูปแบบเดียวกับหน้าสรุปผลรายวัน (BI ก่อน/หลัง และ Multiple Impairment)
 */
function displayPatientScheduleTab() {
    const container = document.getElementById('detail-tab-content');
    if (!container) return;

    // 1. สร้างโครงสร้างพื้นฐานของแท็บ
    container.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-md border border-gray-100">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-gray-800">
                    <i class="bi bi-calendar3 mr-2 text-teal-600"></i>ตารางการเข้าเยี่ยมและพัฒนาการ BI
                </h3>
                <button onclick="openScheduleModal(currentPatient.PatientID)" class="btn btn-sm btn-outline-teal px-3 py-1 rounded-lg transition-all">
                    <i class="bi bi-plus-circle mr-1"></i>จัดการวันนัด
                </button>
            </div>
            <div class="p-3 bg-red-50 border border-red-100 rounded-xl mb-4 flex items-center">
                <i class="bi bi-clock-history text-red-500 mr-3 text-xl"></i>
                <div>
                    <p class="text-red-700 m-0 font-bold text-sm">วันครบกำหนด (Due Date)</p>
                    <p class="text-red-600 m-0 text-base">${formatThaiDate(currentPatient.DueDate)}</p>
                </div>
            </div>
            <div id="patient-schedule-table-container" class="overflow-x-auto min-h-[200px]">
                <div class="flex justify-center items-center py-10">
                    <div class="spinner-border text-teal-500 spinner-border-sm mr-2"></div>
                    <span class="text-gray-500">กำลังประมวลผลข้อมูลประวัติ...</span>
                </div>
            </div>
        </div>
    `;

    // 2. เรียกข้อมูลที่คำนวณ BI Chaining มาจาก Server (ใช้ฟังก์ชัน getPatientScheduleWithStats ที่เพิ่งแก้ใน code.gs)
    google.script.run.withSuccessHandler(res => {
        const tableContainer = document.getElementById('patient-schedule-table-container');
        if (!tableContainer) return;

        if (res.status === 'success') {
            if (!res.records || res.records.length === 0) {
                tableContainer.innerHTML = `
                    <div class="text-center py-10">
                        <i class="bi bi-calendar-x text-gray-300" style="font-size: 3rem;"></i>
                        <p class="text-gray-400 mt-2">ไม่พบประวัติการนัดหมายหรือการเยี่ยม</p>
                    </div>`;
                return;
            }

            let tableHTML = `
                <table class="w-full text-sm align-middle">
                    <thead>
                        <tr class="border-b bg-gray-50 text-gray-600 font-semibold">
                            <th class="p-3 text-center w-16">ครั้งที่</th>
                            <th class="p-3 text-left">วันที่นัด/วันที่เยี่ยม</th>
                            <th class="p-3 text-left">Multiple Impairment</th>
                            <th class="p-3 text-center">BI (ก่อน/หลัง)</th>
                            <th class="p-3 text-center">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">`;

            res.records.forEach(s => {
                // BI ก่อน: ดึงค่าที่ Server คำนวณ chaining มาให้แล้ว
                const biBefore = s.biBefore;
                // BI หลัง: ถ้ายังไม่เยี่ยมในวันนั้น Server จะส่งค่าว่างมา ให้โชว์เครื่องหมาย -
                const biAfter = s.biAfter !== "" 
                    ? `<span class="text-teal-600 font-bold">${s.biAfter}</span>` 
                    : `<span class="text-gray-300">-</span>`;
                
                // จัดการการแสดงผล Impairment
                const impairmentHtml = s.multipleImpairment !== "-" 
                    ? `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">${s.multipleImpairment}</span>`
                    : `<span class="text-gray-300">-</span>`;

                // จัดการ Badge สถานะ
                let statusBadge = '';
                if (s.status === 'Completed') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700"><i class="bi bi-check-circle-fill mr-1"></i>เยี่ยมสำเร็จ</span>';
                } else if (s.status === 'Overdue') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700">เลยกำหนด</span>';
                } else {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">รอเยี่ยม</span>';
                }

                tableHTML += `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="p-3 text-center font-bold text-gray-700">${s.visitNumber}</td>
                        <td class="p-3 whitespace-nowrap text-gray-600">${formatThaiDate(s.date)}</td>
                        <td class="p-3">${impairmentHtml}</td>
                        <td class="p-3 text-center">
                            <span class="text-gray-400 font-medium">${biBefore}</span>
                            <span class="text-gray-300 mx-1">/</span>
                            ${biAfter}
                        </td>
                        <td class="p-3 text-center">${statusBadge}</td>
                    </tr>
                `;
            });

            tableHTML += '</tbody></table>';
            tableContainer.innerHTML = tableHTML;
        } else {
            tableContainer.innerHTML = `<div class="alert alert-danger m-3">${res.message}</div>`;
        }
    }).withFailureHandler(err => {
        showError(err);
    }).getPatientScheduleWithStats(currentPatient.PatientID);
}

function displayEMRTab() {
    const contentEl = document.getElementById('detail-tab-content');
    contentEl.innerHTML = '<p class="text-center p-4">กำลังโหลดข้อมูล EMR...</p>';
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                const { consents, biAssessments, opdRecords, soapNotes } = response.records;
                
                const createRecordTable = (title, records, columns, type) => {
                    if (!records || records.length === 0) { return `<div class="p-3 bg-light rounded border text-center text-muted">ยังไม่มีประวัติ${title}</div>`; }
                    
                    let tableHtml = '<div class="table-responsive"><table class="table table-sm table-hover align-middle">';
                    tableHtml += `<thead><tr>${columns.map(c => `<th class="py-2">${c.header}</th>`).join('')}<th class="py-2">จัดการ</th></tr></thead><tbody>`;
                     
                    records.forEach(rec => {
                        // --- ส่วนที่แก้ไข ---
                        // เพิ่มเงื่อนไขเพื่อหา ID ที่ถูกต้องของแต่ละประเภทฟอร์ม
                        let recordId;
                        if (type === 'SOAP') {
                            recordId = rec.SOAPNoteID;
                        } else if (type === 'Opd') {
                            recordId = rec.RecordID;
                        } else if (type === 'BI') {
                            recordId = rec.AssessmentID;
                        } else { // สำหรับ Consent และอื่นๆ
                            recordId = rec[type + 'ID'];
                        }
                        // --- สิ้นสุดส่วนที่แก้ไข ---

                        tableHtml += `<tr style="cursor: pointer;" onclick="editRecordFromEMR('${type}', '${recordId}')">`;
                        columns.forEach(c => { tableHtml += `<td>${c.key(rec) || '-'}</td>`; });
                        tableHtml += `
                            <td class="text-nowrap">
                                <button class="btn btn-outline-secondary btn-sm" onclick="event.stopPropagation(); editRecordFromEMR('${type}', '${recordId}')" title="รายละเอียด/แก้ไข"><i class="bi bi-pencil-fill"></i></button>
                                <button class="btn btn-outline-info btn-sm" onclick="event.stopPropagation(); printRecord('${type}', '${recordId}')" title="พิมพ์"><i class="bi bi-printer-fill"></i></button>
                                <button class="btn btn-outline-danger btn-sm" onclick="event.stopPropagation(); confirmDeleteFromEMR('${type}', '${recordId}')" title="ลบ"><i class="bi bi-trash-fill"></i></button>
                            </td>`;
                        tableHtml += `</tr>`;
                    });
                    
                    tableHtml += '</tbody></table></div>';
                    return tableHtml;
                };

                const consentColumns = [ { header: 'วันที่', key: r => formatThaiDate(r.ConsentDate) }, { header: 'ครั้งที่', key: r => r.VisitCount }, { header: 'ผู้ให้คำยินยอม', key: r => r.ConsenterName }];
                const biColumns = [ { header: 'วันที่', key: r => formatThaiDate(r.AssessmentDate) }, { header: 'ครั้งที่', key: r => r.VisitCount }, { header: 'คะแนนรวม', key: r => r.TotalScore }];
                const opdColumns = [ { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) }, { header: 'ครั้งที่', key: r => r.VisitCount }, { header: 'อาการสำคัญ', key: r => r.ChiefComplaint }];
                const soapColumns = [ { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) }, { header: 'ครั้งที่', key: r => r.VisitCount }, { header: 'คะแนน BI', key: r => r.BI_TotalScore }];

                contentEl.innerHTML = `
                    <div class="accordion" id="emrAccordion">
                        <div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseConsent">ใบบันทึกคำยินยอม (${consents.length})</button></h2><div id="collapseConsent" class="accordion-collapse collapse" data-bs-parent="#emrAccordion"><div class="accordion-body">${createRecordTable('คำยินยอม', consents, consentColumns, 'Consent')}</div></div></div>
                        <div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseBI">ใบประเมิน BI (${biAssessments.length})</button></h2><div id="collapseBI" class="accordion-collapse collapse" data-bs-parent="#emrAccordion"><div class="accordion-body">${createRecordTable('BI', biAssessments, biColumns, 'BI')}</div></div></div>
                        <div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOPD">OPD Card (${opdRecords.length})</button></h2><div id="collapseOPD" class="accordion-collapse collapse" data-bs-parent="#emrAccordion"><div class="accordion-body">${createRecordTable('OPD Card', opdRecords, opdColumns, 'Opd')}</div></div></div>
                        <div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseSOAP">SOAP Note (${soapNotes.length})</button></h2><div id="collapseSOAP" class="accordion-collapse collapse" data-bs-parent="#emrAccordion"><div class="accordion-body">${createRecordTable('SOAP Note', soapNotes, soapColumns, 'SOAP')}</div></div></div>
                    </div>`;
            } else { showError(response); }
        })
        .withFailureHandler(showError)
        .getAllRecordsForPatient(currentPatient.PatientID);
}
/**
 * จัดการการลบข้อมูลจากหน้า EMR และ รีเฟรชหน้า EMR อีกครั้ง
 */
function confirmDeleteFromEMR(type, recordId) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: "คุณต้องการลบรายการนี้ใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ใช่, ลบเลย'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading('กำลังลบข้อมูล...');
            let deleteFunction;
            switch(type) {
                case 'Consent': deleteFunction = 'deleteConsentById'; break;
                case 'BI': deleteFunction = 'deleteBIAssessmentById'; break;
                case 'Opd': deleteFunction = 'deleteOpdRecordById'; break;
                case 'SOAP': deleteFunction = 'deleteSOAPNoteById'; break;
                default: return;
            }
            google.script.run
                .withSuccessHandler(response => {
                    if(response.status === 'success') {
                        showSuccessToast(response.message);
                        if (currentPatient && document.getElementById('patient-detail-view').style.display !== 'none') {
                            currentPatientRecords = null;
                            loadPatientDetailRecords();
                        }
                        displayEMRTab(); // <<-- Refresh EMR tab after delete
                    } else {
                        showError(response);
                    }
                })
                .withFailureHandler(showError)
                [deleteFunction](recordId);
        }
    });
}

/**
 * จัดการการเปิดฟอร์มแก้ไขจากหน้า EMR
 */
function editRecordFromEMR(type, recordId) {
    // ใช้พื้นที่แสดงผลของ EMR tab เพื่อแสดงฟอร์ม
    const contentEl = document.getElementById('detail-tab-content');
    contentEl.innerHTML = `<div id="history-container"></div><div id="form-container-inner" class="mt-4"></div>`;

    // ฟังก์ชันสำหรับเปลี่ยนปุ่ม "ยกเลิก" และ "บันทึก" ในฟอร์ม
    const setupFormButtonsForEMR = () => {
        const cancelButton = contentEl.querySelector('button[onclick*="showHistory"]');
        if (cancelButton) {
            cancelButton.setAttribute('onclick', 'displayEMRTab()');
            cancelButton.textContent = 'กลับไป EMR';
        }

        const saveButton = contentEl.querySelector('button[onclick*="Submit"]');
        if (saveButton) {
            const originalOnclick = saveButton.getAttribute('onclick');
            const submitFunctionName = originalOnclick.replace('()', '');
            // ทำให้เมื่อบันทึกสำเร็จ จะกลับมาหน้า EMR
            saveButton.setAttribute('onclick', `${submitFunctionName}(displayEMRTab)`);
        }
    };
    
    // เรียกฟังก์ชันแก้ไขที่เหมาะสม
    // ใช้ setTimeout เพื่อให้แน่ใจว่าฟอร์มถูกสร้างขึ้นใน DOM ก่อนที่เราจะเข้าไปแก้ไขปุ่ม
    switch(type) {
        case 'Consent': editConsentForm(recordId); setTimeout(setupFormButtonsForEMR, 500); break;
        case 'BI': editBIAssessment(recordId); setTimeout(setupFormButtonsForEMR, 500); break;
        case 'Opd': editOpdRecord(recordId); setTimeout(setupFormButtonsForEMR, 500); break;
        case 'SOAP': editSoapNote(recordId); setTimeout(setupFormButtonsForEMR, 500); break;
    }
}
function confirmDeletePatient(id, name) { Swal.fire({ title: 'ยืนยันการลบ', html: `คุณต้องการลบข้อมูลของ <strong>${name}</strong> ใช่หรือไม่?<br><strong class="text-danger">การกระทำนี้ไม่สามารถย้อนกลับได้!</strong>`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#6c757d', confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก' }).then(result => { if (result.isConfirmed) { showLoading('กำลังลบข้อมูล...'); google.script.run.withSuccessHandler(res => { if (res.status === 'success') { showSuccessToast(res.message); allPatients = res.patients; showListView(); } else { showError(res); } }).withFailureHandler(showError).deletePatientById(id); } }); }
/**
 * อัปเดตสถานะการเก็บเวชระเบียน (Checkbox)
 */
function updateRecordKeptStatus(patientId, status) {
    // อัปเดตใน array หลักทันทีเพื่อความรวดเร็ว
    const patient = allPatients.find(p => p.PatientID === patientId);
    if (patient) {
        patient.RecordKept = status;
    }
    // ส่งข้อมูลไปบันทึกที่ server
    google.script.run
        .withSuccessHandler(response => {
            if (response.status !== 'success') {
                showError(response);
                // ถ้า server พลาด, revert ค่ากลับ
                if (patient) patient.RecordKept = !status;
                // อาจจะต้อง re-render แถวนั้นๆ แต่ตอนนี้ปล่อยไว้ก่อน
            }
        })
        .withFailureHandler(showError)
        .updateRecordKeptStatus(patientId, status);
}

/**
 * เปิด Modal สำหรับดาวน์โหลดเอกสาร
 */
function openDownloadModal(patientId, patientName) {
    document.getElementById('downloadPatientName').textContent = patientName;
    const container = document.getElementById('download-list-container');
    container.innerHTML = '<p class="text-center">กำลังโหลดรายการเอกสาร...</p>';
    // เก็บ patientId ไว้ใน modal เพื่อใช้ตอนกดดาวน์โหลด
    container.dataset.patientId = patientId;
    
    downloadModal.show();

    // เรียกข้อมูลเอกสารทั้งหมดของผู้ป่วย
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                populateDownloadModal(patientId, response.records);
            } else {
                showError(response);
                container.innerHTML = '<p class="text-center text-danger">ไม่สามารถโหลดข้อมูลได้</p>';
            }
        })
        .withFailureHandler(showError)
        .getAllRecordsForPatient(patientId);
}

/**
 * สร้างรายการเอกสารใน Modal
 */
function populateDownloadModal(patientId, records) {
    const { consents, biAssessments, opdRecords, soapNotes } = records;
    const container = document.getElementById('download-list-container');
    let html = '';

    const createCheckbox = (type, id, label) => `
        <div class="form-check">
            <input class="form-check-input download-item" type="checkbox" value="" 
                   data-type="${type}" data-id="${id}">
            <label class="form-check-label">${label}</label>
        </div>`;

    // 1. IMC Cover (มีเสมอ)
    html += `<h5><i class="bi bi-file-person-fill"></i> ปกเวชระเบียน</h5>`;
    html += createCheckbox('IMCCover', patientId, `ปกเวชระเบียน (IMC Cover)`);
    html += '<hr>';

    // 2. Consents
    html += `<h5><i class="bi bi-file-earmark-check-fill"></i> ใบยินยอม (${consents.length})</h5>`;
    if (consents.length > 0) {
        consents.forEach(c => {
            html += createCheckbox('Consent', c.ConsentID, `ใบยินยอม (ครั้งที่ ${c.VisitCount}) - ${formatThaiDate(c.ConsentDate)}`);
        });
    } else { html += '<p class="text-muted small">ไม่พบข้อมูล</p>'; }
    html += '<hr>';

    // 3. BI Assessments
    html += `<h5><i class="bi bi-bar-chart-fill"></i> ใบประเมิน BI (${biAssessments.length})</h5>`;
    if (biAssessments.length > 0) {
        biAssessments.forEach(b => {
            html += createCheckbox('BI', b.AssessmentID, `BI (ครั้งที่ ${b.VisitCount}) - ${formatThaiDate(b.AssessmentDate)} - (คะแนน ${b.TotalScore})`);
        });
    } else { html += '<p class="text-muted small">ไม่พบข้อมูล</p>'; }
    html += '<hr>';

    // 4. OPD Records
    html += `<h5><i class="bi bi-clipboard-pulse-fill"></i> OPD Card (${opdRecords.length})</h5>`;
    if (opdRecords.length > 0) {
        opdRecords.forEach(o => {
            html += createCheckbox('Opd', o.RecordID, `OPD (ครั้งที่ ${o.VisitCount}) - ${formatThaiDate(o.VisitDate)}`);
        });
    } else { html += '<p class="text-muted small">ไม่พบข้อมูล</p>'; }
    html += '<hr>';

    // 5. SOAP Notes
    html += `<h5><i class="bi bi-file-earmark-medical-fill"></i> SOAP Note (${soapNotes.length})</h5>`;
    if (soapNotes.length > 0) {
        soapNotes.forEach(s => {
            html += createCheckbox('SOAP', s.SOAPNoteID, `SOAP (ครั้งที่ ${s.VisitCount}) - ${formatThaiDate(s.VisitDate)}`);
        });
    } else { html += '<p class="text-muted small">ไม่พบข้อมูล</p>'; }

    container.innerHTML = html;
}

/**
 * จัดการการดาวน์โหลดไฟล์ที่เลือก
 */
function handleDownloadSelected() {
    const selectedItems = document.querySelectorAll('#download-list-container .download-item:checked');
    
    if (selectedItems.length === 0) {
        Swal.fire('กรุณาเลือกเอกสาร', 'คุณยังไม่ได้เลือกเอกสารที่ต้องการดาวน์โหลด', 'info');
        return;
    }

    showLoading('กำลังเตรียมไฟล์ดาวน์โหลด...');

    selectedItems.forEach((item, index) => {
        const type = item.dataset.type;
        const id = item.dataset.id;
        
        // ใช้ setTimeout เพื่อหน่วงเวลาการเรียกแต่ละไฟล์เล็กน้อย
        // ป้องกันบราวเซอร์บล็อก pop-up หรือการดาวน์โหลดหลายไฟล์พร้อมกัน
        setTimeout(() => {
            printRecord(type, id);
            
            // ปิด Loading เมื่อดาวน์โหลดไฟล์สุดท้าย
            if (index === selectedItems.length - 1) {
                Swal.close();
                downloadModal.hide();
                showSuccessToast(`กำลังดาวน์โหลด ${selectedItems.length} ไฟล์...`);
            }
        }, index * 1000); // หน่วงเวลา 1 วินาทีต่อไฟล์
    });
}
function switchPatientTab(tabName) {
    currentPatientTab = tabName;

    // จัดการ UI ของ Tabs (Visual Active State)
    document.getElementById('active-tab').classList.toggle('active', tabName === 'Active');
    document.getElementById('active-tab').classList.toggle('text-teal-700', tabName === 'Active');
    document.getElementById('active-tab').classList.toggle('text-gray-500', tabName !== 'Active');

    document.getElementById('discharged-tab').classList.toggle('active', tabName === 'Discharged');
    document.getElementById('discharged-tab').classList.toggle('text-teal-700', tabName === 'Discharged');
    document.getElementById('discharged-tab').classList.toggle('text-gray-500', tabName !== 'Discharged');

    // ซ่อน/แสดงปุ่มเพิ่มผู้ป่วย
    document.getElementById('btn-new-patient').style.display = (tabName === 'Active') ? 'flex' : 'none';

    // รีโหลดตาราง
    filterPatients(); 
}
// =================================================================
// 7. PATIENT REGISTRATION MODAL
// =================================================================
function toggleTreatmentRightsOther() { const rightsSelect = document.getElementById('TreatmentRights'); const otherContainer = document.getElementById('treatment-rights-other-container'); const otherInput = document.getElementById('TreatmentRightsOther'); const isOther = rightsSelect && rightsSelect.value === 'อื่นๆ'; if (otherContainer) otherContainer.style.display = isOther ? 'block' : 'none'; if (!isOther && otherInput) otherInput.value = ''; }
function setupAllergyCheckboxes() { const container = document.getElementById('allergies-container'); container.innerHTML = allergyOptions.map(opt => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="Allergies" value="${opt}"><label class="form-check-label text-sm">${opt}</label></div>`).join(''); container.insertAdjacentHTML('beforeend', `<div class="mt-2"><input type="text" id="AllergiesOther" class="form-control form-control-sm" placeholder="อื่นๆ ระบุ..."></div>`); }
function setupAddressDropdowns() { const $province = $('#Province'), $amphoe = $('#Amphoe'), $tambon = $('#Tambon'), $zipcode = $('#PostalCode'); $province.select2({ theme: 'bootstrap-5', dropdownParent: $('#patientModal') }); $amphoe.select2({ theme: 'bootstrap-5', dropdownParent: $('#patientModal') }); $tambon.select2({ theme: 'bootstrap-5', dropdownParent: $('#patientModal') }); const provinces = [...new Set(allAddressData.map(item => item.province))].sort(); populateSelect('Province', provinces, true, 'เลือกจังหวัด...'); $province.on('change', function() { const selected = $(this).val(); $amphoe.html('<option value="">เลือกอำเภอ...</option>').val(null); if (selected) { const amphoes = [...new Set(allAddressData.filter(item => item.province === selected).map(item => item.amphoe))].sort(); populateSelect('Amphoe', amphoes, true, 'เลือกอำเภอ...'); } $amphoe.trigger('change'); }); $amphoe.on('change', function() { const selectedAmphoe = $(this).val(); const selectedProvince = $province.val(); $tambon.html('<option value="">เลือกตำบล...</option>').val(null); if (selectedAmphoe) { const tambons = [...new Set(allAddressData.filter(item => item.province === selectedProvince && item.amphoe === selectedAmphoe).map(item => item.tambon))].sort(); populateSelect('Tambon', tambons, true, 'เลือกตำบล...'); } $tambon.trigger('change'); }); $tambon.on('change', function() { const selected = $(this).val(); const record = allAddressData.find(item => item.tambon === selected && item.amphoe === $amphoe.val()); $zipcode.val(record ? record.zipcode : ''); }); }
function openNewPatientForm() { document.getElementById('patient-form').reset(); $('#patient-form').find('select.input').val(null).trigger('change'); document.getElementById('PatientID').value = ''; document.getElementById('ClinicNumber').value = nextCN; document.getElementById('patientModalLabel').textContent = 'ลงทะเบียนผู้ป่วยใหม่'; document.getElementById('photoPreview').src = 'https://placehold.co/200x250/E2E8F0/A0AEC0?text=รูปภาพ'; document.getElementById('photoData').value = ''; document.getElementById('PatientPhotoURL').value = ''; document.getElementById('stroke-type-container').style.display = 'none'; document.getElementById('calculatedAge').textContent = ''; toggleTreatmentRightsOther(); patientModal.show(); }
function editPatient(id) {
    showLoading('กำลังโหลดข้อมูล...');
    google.script.run.withSuccessHandler(patient => {
        if (!patient) {
            showError({
                message: `ไม่พบข้อมูลผู้ป่วย ID: ${id}`
            });
            return;
        }
        document.getElementById('patient-form').reset();
        document.getElementById('patientModalLabel').textContent = 'แก้ไขข้อมูลผู้ป่วย';

        // --- START: ส่วนที่แก้ไข ---
        // วนลูปเพื่อใส่ข้อมูลลงในฟอร์มทั้งหมด
        for (const key in patient) {
            const el = document.getElementById(key);
            if (el) {
                // ตรวจสอบว่าเป็น input ประเภท date หรือไม่
                if (el.type === 'date') {
                    // ถ้ามีข้อมูลวันที่ ให้แปลงเป็นรูปแบบ YYYY-MM-DD ก่อน
                    if (patient[key]) {
                        el.value = new Date(patient[key]).toISOString().split('T')[0];
                    } else {
                        el.value = '';
                    }
                } else {
                    // สำหรับ input ประเภทอื่น ๆ (text, select)
                    // ใช้ || '' เพื่อป้องกันค่า null หรือ undefined
                    el.value = patient[key] || '';
                }
            }
        }
        // --- END: ส่วนที่แก้ไข ---

        // จัดการ Address Dropdowns ที่ซับซ้อนด้วย Select2
        $('#Province').val(patient.Province).trigger('change');
        setTimeout(() => {
            $('#Amphoe').val(patient.Amphoe).trigger('change');
            setTimeout(() => {
                $('#Tambon').val(patient.Tambon).trigger('change');
            }, 200);
        }, 200);

        // จัดการ Checkbox ของการแพ้ยา
        const savedAllergies = (patient.Allergies || '').split(', ').filter(Boolean);
        document.querySelectorAll('input[name="Allergies"]').forEach(cb => {
            cb.checked = savedAllergies.includes(cb.value);
        });
        const otherAllergy = savedAllergies.find(a => !allergyOptions.includes(a));
        document.getElementById('AllergiesOther').value = otherAllergy || '';

        // แสดงรูปภาพและคำนวณอายุ
        document.getElementById('photoPreview').src = patient.PatientPhotoBase64 || 'https://placehold.co/200x250';
        if (patient.DateOfBirth) {
            document.getElementById('calculatedAge').textContent = calculateAge(patient.DateOfBirth);
        }
        
        // แสดง/ซ่อนช่อง StrokeType ตาม IMC Dx
        toggleStrokeType();
        toggleTreatmentRightsOther();
        
        patientModal.show();
        Swal.close();
    }).withFailureHandler(showError).getPatientById(id);
}
function handleFormSubmit() { const form = document.getElementById('patient-form'); if (!form.checkValidity()) { form.reportValidity(); return; } let patientObject = Object.fromEntries(new FormData(form).entries()); const allergies = Array.from(document.querySelectorAll('input[name="Allergies"]:checked')).map(cb => cb.value); const otherAllergy = document.getElementById('AllergiesOther').value.trim(); if (otherAllergy) allergies.push(otherAllergy); patientObject.Allergies = allergies.join(', '); if (patientObject.TreatmentRights !== 'อื่นๆ') patientObject.TreatmentRightsOther = ''; showLoading('กำลังบันทึกข้อมูล...'); google.script.run.withSuccessHandler(response => { if (response.status === 'success') { showSuccessToast(response.message); allPatients = response.patients; displayPatients(allPatients); patientModal.hide(); if (patientObject.PatientID) viewPatientDetail(patientObject.PatientID); } else { showError(response); } }).withFailureHandler(showError).savePatient(patientObject); }
function handlePhotoUpload(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = e => { document.getElementById('photoData').value = e.target.result; document.getElementById('photoPreview').src = e.target.result; }; reader.readAsDataURL(file); }
function toggleStrokeType() { document.getElementById('stroke-type-container').style.display = document.getElementById('IMCDx').value === 'Stroke' ? 'block' : 'none'; if (document.getElementById('IMCDx').value !== 'Stroke') document.getElementById('StrokeType').value = ''; }

// =================================================================
// 8. SERVICE VIEW (Main Functions)
// =================================================================
function searchServicePatient(event, force = false) {
    // 1. ลบเงื่อนไขที่เช็คปุ่ม Enter ออก เพื่อให้พิมพ์แล้วค้นหาทันที (Real-time search)
    // if (event && event.key !== 'Enter' && !force) { return; } 

    const searchTerm = document.getElementById('serviceSearchInput').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('service-search-results');
    
    // 2. ถ้าไม่มีคำค้นหา ให้ล้างผลลัพธ์และ "ซ่อน" กล่องผลลัพธ์กลับไป
    if (!searchTerm) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden'); // เพิ่ม class hidden
        return;
    }

    // 3. กรองข้อมูลผู้ป่วย
    const filtered = allPatients.filter(p => {
        // แปลงข้อมูลเป็น String ป้องกัน Error กรณีข้อมูลเป็น null/undefined
        const nameMatch = (p.PatientName || '').toLowerCase().includes(searchTerm);
        const cnMatch = String(p.ClinicNumber || '').toLowerCase().includes(searchTerm);
        const nationalIdMatch = String(p.NationalID || '').includes(searchTerm);
        
        return nameMatch || cnMatch || nationalIdMatch;
    });

    // 4. แสดงผลลัพธ์
    if (filtered.length > 0) {
        // สั่งให้แสดงกล่องผลลัพธ์ (ลบ class hidden ออก)
        resultsContainer.classList.remove('hidden'); 
        
        resultsContainer.innerHTML = filtered.map(p => 
            `<a href="#" class="list-group-item list-group-item-action border-bottom" onclick="selectPatientForService('${p.PatientID}')">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold text-teal-700">${p.PatientName}</div>
                        <small class="text-muted">CN: ${p.ClinicNumber} | ID: ${p.NationalID || '-'}</small>
                    </div>
                    <i class="bi bi-chevron-right text-gray-300"></i>
                </div>
            </a>`
        ).join('');
    } else {
        // กรณีไม่พบข้อมูล ก็ต้องแสดงกล่องเพื่อบอกว่าไม่พบ
        resultsContainer.classList.remove('hidden');
        resultsContainer.innerHTML = '<div class="list-group-item text-center text-muted py-3">ไม่พบข้อมูลผู้ป่วย</div>';
    }
}

function selectPatientForService(patientId, directToVisitNumber = null) {
    // 1. [จุดแก้ที่ 1] แปลง ID เป็น String และ Trim ช่องว่าง เพื่อให้หาเจอชัวร์ๆ
    const pIdStr = String(patientId).trim();
    const patientLocal = allPatients.find(p => String(p.PatientID).trim() === pIdStr);

    if (!patientLocal) {
        showError({ message: "ไม่พบข้อมูลผู้ป่วยในระบบ (ID mismatch)" });
        console.error("Searching for:", pIdStr, "in", allPatients);
        return;
    }
    
    currentPatient = patientLocal; 

    // 2. แสดงข้อมูลส่วนหัว (Header)
    document.getElementById('service-patient-name').textContent = patientLocal.PatientName;
    document.getElementById('service-patient-info').textContent = `อายุ: ${calculateAge(patientLocal.DateOfBirth)} ปี | เพศ: ${patientLocal.Gender || '-'} | CN: ${patientLocal.ClinicNumber || '-'}`;
    document.getElementById('service-patient-zone-display').textContent = patientLocal.Zone || '-';
    document.getElementById('service-patient-cid').textContent = patientLocal.NationalID || '-';
    document.getElementById('service-patient-phone').textContent = patientLocal.Phone || '-';
    
    if (patientLocal.DayEnd) {
        const dateStr = typeof patientLocal.DayEnd === 'string' ? patientLocal.DayEnd.split('T')[0] : patientLocal.DayEnd;
        document.getElementById('service-patient-dayend').textContent = formatThaiDate(dateStr);
    } else {
        document.getElementById('service-patient-dayend').textContent = '-';
    }
    document.getElementById('service-patient-address').textContent = patientLocal.FullAddress || '-';

    // 3. ตั้งรูป Loading และดึงรูปจริง
    const photoEl = document.getElementById('service-patient-photo');
    photoEl.src = 'https://placehold.co/100x100?text=Loading...';
    google.script.run.withSuccessHandler(fullPatient => {
        if(fullPatient && fullPatient.PatientPhotoBase64) photoEl.src = fullPatient.PatientPhotoBase64;
        else photoEl.src = 'https://placehold.co/100x100?text=No+Image';
    }).getPatientById(pIdStr);

    // 4. เตรียมหน้าจอ
    document.getElementById('service-search-panel').style.display = 'none';
    document.getElementById('patient-service-dashboard').style.display = 'block';
    document.getElementById('service-form-area').innerHTML = '';
    document.getElementById('service-form-area').style.display = 'none';
    document.getElementById('service-visit-status').innerHTML = '<span class="text-sm text-gray-400">Loading...</span>';

    // 5. [จุดแก้ที่ 2] โหลดข้อมูลนัดล่าสุด และแสดงปุ่มเสมอ (ไม่ซ่อน)
    google.script.run
        .withSuccessHandler(data => {
            const completed = data.completed || 0;
            const nextVisit = data.visitCount; // ครั้งที่จะทำต่อไป

            // อัปเดตสถานะมุมขวาบน
            document.getElementById('service-visit-status').textContent = `เยี่ยมแล้ว ${completed} ครั้ง`;
            
            const menuBar = document.getElementById('service-menu-bar');
            let alertHtml = '';

            // สร้างข้อความแจ้งเตือน (แต่ไม่บล็อกปุ่ม)
            if (data.total === 0) {
                alertHtml = `<div class="w-full mb-3 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded text-sm"><i class="bi bi-exclamation-circle"></i> ผู้ป่วยรายนี้ยังไม่มีตารางนัดหมายในระบบ</div>`;
            } else if (completed >= data.total) {
                alertHtml = `<div class="w-full mb-3 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm"><i class="bi bi-info-circle"></i> เยี่ยมครบตามแผนเดิมแล้ว (กำลังเยี่ยมเพิ่มครั้งที่ ${nextVisit})</div>`;
            }

            // สร้างปุ่มกด (Buttons) - แสดงเสมอ!
            let buttonsHtml = '';
            if (nextVisit <= 1) { 
                // ครั้งที่ 1: ชุดใหญ่
                buttonsHtml = `
                    <h4 class="w-full text-md font-semibold mb-2">บริการครั้งแรก:</h4>
                    <button class="btn btn-outline-primary" onclick="showServiceSubView('Consent')">1. ใบยินยอม</button>
                    <button class="btn btn-outline-primary" onclick="showServiceSubView('BI')">2. ประเมิน BI</button>
                    <button class="btn btn-outline-primary" onclick="showServiceSubView('OPD')">3. บันทึก OPD</button>
                `;
            } else { 
                // ครั้งที่ 2+: SOAP
                buttonsHtml = `
                    <h4 class="w-full text-md font-semibold mb-2">บริการครั้งที่ ${nextVisit}:</h4>
                    <button class="btn btn-success" onclick="showServiceSubView('SOAP')">
                        <i class="bi bi-file-earmark-medical-fill mr-2"></i> บันทึก SOAP Note
                    </button>
                `;
            }

            menuBar.innerHTML = alertHtml + buttonsHtml;
        })
        .withFailureHandler(showError)
        .getNextVisitCount(pIdStr);
}

function goToServiceFromSchedule(patientId) {
    // 1. สลับหน้าจอหลักไปที่ Service View ทันที
    setActiveView('service-view', 'เข้ารับบริการ');
    
    // 2. ซ่อนแผงค้นหาและแสดง Loading เพื่อความราบรื่น
    document.getElementById('service-search-panel').style.display = 'none';
    
    // 3. เรียกฟังก์ชันเดิมเพื่อโหลดข้อมูลผู้ป่วยและแสดง Dashboard การรักษา
    selectPatientForService(patientId);
}

function showServiceSubView(type, recordId = null) {
    const area = document.getElementById('service-form-area');
    area.style.display = 'block';
    area.innerHTML = `<div class="text-center p-5">กำลังโหลด...</div>`;
    
    // Logic to either open a new form or edit an existing one
    if (recordId) {
        if (type === 'Consent') editConsentForm(recordId);
        if (type === 'BI') editBIAssessment(recordId);
        if (type === 'OPD') editOpdRecord(recordId);
        if (type === 'SOAP') editSoapNote(recordId);
    } else {
        // Display history table first
        showHistory(type);
    }
}

function showHistory(type) {
    let fetchFunction;
    let renderFunction;
    let title;
    let newButtonHtml;

    switch (type) {
        case 'Consent':
            fetchFunction = 'getConsentsByPatientId';
            renderFunction = renderConsentHistory;
            title = 'ประวัติการให้คำยินยอม';
            newButtonHtml = `<button class="btn btn-success btn-sm" onclick="openNewConsentForm()">สร้างใบยินยอมใหม่</button>`;
            break;
        case 'BI':
            fetchFunction = 'getBIAssessmentsByPatientId';
            renderFunction = renderBiHistory;
            title = 'ประวัติการประเมิน BI';
            newButtonHtml = `<button class="btn btn-success btn-sm" onclick="openNewBIAssessmentForm()">ประเมิน BI ใหม่</button>`;
            break;
         case 'OPD':
            fetchFunction = 'getOpdRecordsByPatientId';
            renderFunction = renderOpdHistory;
            title = 'ประวัติการบันทึก OPD';
            newButtonHtml = `<button class="btn btn-success btn-sm" onclick="openNewOpdForm()">สร้าง OPD Card ใหม่</button>`;
            break;
        case 'SOAP':
            fetchFunction = 'getSOAPNotesByPatientId';
            renderFunction = renderSoapHistory;
            title = 'ประวัติการบันทึก SOAP Note';
            newButtonHtml = `<button class="btn btn-success btn-sm" onclick="openNewSoapForm()">สร้าง SOAP Note ใหม่</button>`;
            break;
        default: return;
    }

    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                renderFunction(response.records, title, newButtonHtml);
            } else {
                showError(response);
            }
        })
        .withFailureHandler(showError)
        [fetchFunction](currentPatient.PatientID);
}
function renderHistoryTable(records, title, newButtonHtml, columns, actionButtonsGenerator) {
    const area = document.getElementById('service-form-area');
    let tableHtml = `
        <div id="history-container">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="text-xl font-semibold">${title}</h4>
                ${newButtonHtml}
            </div>
            <table class="table table-sm table-hover">
                <thead>
                    <tr>
                        ${columns.map(c => `<th>${c.header}</th>`).join('')}
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (records.length > 0) {
        records.forEach(rec => {
            tableHtml += `
                <tr>
                    ${columns.map(c => `<td>${c.key(rec) || '-'}</td>`).join('')}
                    <td>${actionButtonsGenerator(rec)}</td>
                </tr>
            `;
        });
    } else {
        tableHtml += `<tr><td colspan="${columns.length + 1}" class="text-center p-3">ยังไม่มีประวัติ</td></tr>`;
    }

    tableHtml += `</tbody></table></div><div id="form-container-inner" class="mt-4" style="display:none;"></div>`;
    area.innerHTML = tableHtml;
}

function printRecord(type, recordId) {
    showLoading('กำลังสร้างไฟล์ PDF...');
    let printFunction;
    switch(type) {
        case 'Consent': printFunction = 'generateConsentPdf'; break;
        case 'BI': printFunction = 'generateBIPdf'; break;
        case 'Opd': printFunction = 'generateOpdPdf'; break;
        case 'SOAP': printFunction = 'generateSOAPPdf'; break;
        case 'IMCCover': printFunction = 'generateIMCCoverPdf'; break;
        default: Swal.close(); return;
    }
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                downloadFile(response.base64, response.fileName);
                showSuccessToast('ไฟล์ PDF พร้อมสำหรับดาวน์โหลด');
            } else {
                showError(response);
            }
        })
        .withFailureHandler(showError)
        [printFunction](recordId);
}
function confirmDelete(type, recordId) {
    Swal.fire({
        title: 'ยืนยันการลบ',
        text: "คุณต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
             showLoading('กำลังลบข้อมูล...');
            let deleteFunction;
            switch(type) {
                case 'Consent': deleteFunction = 'deleteConsentById'; break;
                case 'BI': deleteFunction = 'deleteBIAssessmentById'; break;
                case 'OPD': deleteFunction = 'deleteOpdRecordById'; break;
                case 'SOAP': deleteFunction = 'deleteSOAPNoteById'; break;
                default: Swal.close(); return;
            }
            google.script.run
                .withSuccessHandler(response => {
                    if(response.status === 'success') {
                        showSuccessToast(response.message);
                        showHistory(type); // Refresh the history view
                    } else {
                        showError(response);
                    }
                })
                .withFailureHandler(showError)
                [deleteFunction](recordId);
        }
    });
}

// =================================================================
// 9. SERVICE VIEW - CONSENT FORM
// =================================================================
function renderConsentHistory(records) {
    const columns = [
        { header: 'วันที่', key: r => formatThaiDate(r.ConsentDate) },
        { header: 'ครั้งที่', key: r => r.VisitCount },
        { header: 'ผู้ให้คำยินยอม', key: r => r.ConsenterName }
    ];
    const actions = r => `
        <button class="btn btn-outline-secondary btn-sm" onclick="editConsentForm('${r.ConsentID}')">แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('Consent', '${r.ConsentID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('Consent', '${r.ConsentID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewConsentForm()">สร้างใบยินยอมใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการให้คำยินยอม', newButton, columns, actions);
}

function openNewConsentForm() {
    // HTML Structure for the form
    const formHtml = `
        <h4 class="text-xl font-semibold mb-3">หนังสือให้ความยินยอมการรับบริการทางกายภาพบำบัด</h4>
        <form id="consent-form">
            <input type="hidden" name="ConsentID">
            <div class="row g-3">
                <div class="col-md-6"><label class="form-label">วันที่</label><input type="date" name="ConsentDate" class="form-control"></div>
                <div class="col-md-6"><label class="form-label">ครั้งที่</label><input type="number" name="VisitCount" class="form-control"></div>
                <div class="col-12"><label class="form-label">ผู้ให้คำยินยอม</label>
                    <div>
                        <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="ConsenterType" value="Patient" id="isPatient" checked><label class="form-check-label" for="isPatient">ผู้ป่วย</label></div>
                        <div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="ConsenterType" value="Caregiver" id="isCaregiver"><label class="form-check-label" for="isCaregiver">ญาติ/ผู้ดูแล</label></div>
                    </div>
                </div>
                <div class="col-md-4"><label class="form-label">ชื่อ-สกุล ผู้ให้คำยินยอม</label><input type="text" name="ConsenterName" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">อายุ</label><input type="number" name="ConsenterAge" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">เลขบัตรประชาชน</label><input type="text" name="ConsenterNationalID" class="form-control"></div>
                <div class="col-12"><p class="p-3 bg-light rounded border small">"ข้าพเจ้ามีความประสงค์รับบริการจาก สุขกายคลินิกกายภาพบำบัด โดยยินยอมเปิดเผยข้อมูลการเจ็บป่วยประวัติการรักษาที่เกี่ยวข้องกับการส่งต่อบริการและติดตามผลการรักษาของหน่วยบริการและเครือข่าย ข้าพเจ้ารับทราบถึงการเปิดเผยข้อมูลดังกล่าว และยินยอมที่จะปฏิบัติตามคำแนะนำที่เป็นประโยชน์สูงสุดจากเจ้าหน้าที่ที่เกี่ยวข้องข้าพเจ้ายินยอมให้เจ้าหน้าที่สามารถบันทึกภาพ/วิดิทัศน์ขณะรับบริการ โดยปกปิดใบหน้าและไม่ระบุตัวตน ตลอดการรับบริการนี้"</p></div>
                <div class="col-md-6">
                    <label class="form-label">ลายมือชื่อผู้ให้คำยินยอม</label>
                    <canvas id="consenterSignatureCanvas" class="signature-pad"></canvas>
                    <button type="button" class="btn btn-sm btn-outline-secondary mt-1" onclick="clearCanvas('consenter')">ล้าง</button>
                </div>
                <div class="col-md-6">
                    <label class="form-label">ลายมือชื่อพยาน</label>
                    <canvas id="witnessSignatureCanvas" class="signature-pad"></canvas>
                    <button type="button" class="btn btn-sm btn-outline-secondary mt-1" onclick="clearCanvas('witness')">ล้าง</button>
                    <input type="text" name="WitnessName" class="form-control mt-2" placeholder="ชื่อ-สกุล พยาน">
                </div>
            </div>
            <div class="mt-4">
                <button type="button" class="btn btn-primary" onclick="handleConsentFormSubmit()">บันทึก</button>
                <button type="button" class="btn btn-secondary" onclick="showHistory('Consent')">ยกเลิก</button>
            </div>
        </form>
    `;
    document.getElementById('history-container').style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = formHtml;
    formContainer.style.display = 'block';

    // Initialize logic
    initializeSignaturePad('consenterSignatureCanvas', 'consenter');
    initializeSignaturePad('witnessSignatureCanvas', 'witness');
    
    document.querySelector('input[name="ConsentDate"]').valueAsDate = new Date();
    google.script.run.withSuccessHandler(visitCount => {
        document.querySelector('input[name="VisitCount"]').value = visitCount;
    }).getNextVisitCount(currentPatient.PatientID);

    document.querySelectorAll('input[name="ConsenterType"]').forEach(radio => {
        radio.addEventListener('change', handleConsenterTypeChange);
    });
    handleConsenterTypeChange(); // Trigger on load
}
// --- เพิ่มฟังก์ชันใหม่นี้เข้าไป ---
// ฟังก์ชันนี้เรียกใช้ getConsentById และเติมข้อมูลลงฟอร์ม
function editConsentForm(consentId) {
    showLoading('กำลังโหลดข้อมูล...');
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success' && response.record) {
                openNewConsentForm(); // ใช้ฟังก์ชันนี้เพื่อสร้างโครงฟอร์ม
                
                // ใช้ Timeout เพื่อให้แน่ใจว่า Canvas ถูกสร้างใน DOM ก่อน
                setTimeout(() => {
                    const form = document.getElementById('consent-form');
                    const data = response.record;

                    for (const key in data) {
                        const el = form.querySelector(`[name="${key}"]`);
                        if (el) {
                            if (el.type === 'date') {
                                el.value = data[key] ? new Date(data[key]).toISOString().split('T')[0] : '';
                            } else if (el.type === 'radio') {
                                const radioEl = form.querySelector(`input[name="${key}"][value="${data[key]}"]`);
                                if(radioEl) radioEl.checked = true;
                            } else {
                                el.value = data[key];
                            }
                        }
                    }
                    
                    // เรียกใช้เพื่อให้สถานะ read-only ถูกต้อง และโหลดลายเซ็น
                    handleConsenterTypeChange();
                    loadCanvasImage('consenterSignatureCanvas', data.ConsenterSignatureBase64);
                    loadCanvasImage('witnessSignatureCanvas', data.WitnessSignatureBase64);
                    Swal.close();
                }, 200);

            } else {
                showError(response);
            }
        })
        .withFailureHandler(showError)
        .getConsentById(consentId);
}
function handleConsenterTypeChange() {
    const isPatient = document.getElementById('isPatient').checked;
    const nameInput = document.querySelector('input[name="ConsenterName"]');
    const ageInput = document.querySelector('input[name="ConsenterAge"]');
    const idInput = document.querySelector('input[name="ConsenterNationalID"]');

    if (isPatient) {
        nameInput.value = currentPatient.PatientName;
        ageInput.value = calculateAge(currentPatient.DateOfBirth);
        idInput.value = currentPatient.NationalID;
        [nameInput, ageInput, idInput].forEach(el => el.readOnly = true);
    } else {
        [nameInput, ageInput, idInput].forEach(el => {
            el.value = '';
            el.readOnly = false;
        });
        nameInput.focus();
    }
}

function handleConsentFormSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก...');
    const form = document.getElementById('consent-form');
    const data = Object.fromEntries(new FormData(form).entries());
    data.PatientID = currentPatient.PatientID;
    data.ConsenterSignatureBase64 = signaturePads.consenter.isEmpty() ? '' : signaturePads.consenter.toDataURL();
    data.WitnessSignatureBase64 = signaturePads.witness.isEmpty() ? '' : signaturePads.witness.toDataURL();
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            google.script.run.updateScheduleStatus(data.PatientID, data.VisitCount);
            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('Consent');
        } else { showError(response); }
    }).withFailureHandler(showError).saveConsent(data);
}

// =================================================================
// 10. SERVICE VIEW - BI ASSESSMENT
// =================================================================
function renderBiHistory(records) {
    const columns = [
        { header: 'วันที่ประเมิน', key: r => formatThaiDate(r.AssessmentDate) },
        { header: 'ครั้งที่', key: r => r.VisitCount },
        { header: 'คะแนนรวม', key: r => r.TotalScore }
    ];
    const actions = r => `
        <button class="btn btn-outline-secondary btn-sm" onclick="editBIAssessment('${r.AssessmentID}')">แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('BI', '${r.AssessmentID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('BI', '${r.AssessmentID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewBIAssessmentForm()">ประเมิน BI ใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการประเมิน BI', newButton, columns, actions);
}
function openNewBIAssessmentForm() {
    const questions = [
        { q: 'q1', text: '(1) รับประทานอาหารเมื่อเตรียมสำรับไว้ให้เรียบร้อยต่อหน้า', options: [{val: 0, text: 'ไม่สามารถตักอาหารเข้าปากได้'}, {val: 1, text: 'ตักอาหารเองได้ แต่ต้องมีคนช่วย เช่น ช่วยใช้ช้อนตักเตรียมให้/ตัดเป็นชิ้นเล็กๆให้'}, {val: 2, text: 'ตักอาหารและช่วยตัวเองได้ปกติ'}] },
        { q: 'q2', text: '(2) การล้างหน้า หวีผม แปรงฟัน โกนหนวด ในระยะเวลา 24-48 ชั่วโมงที่ผ่านมา', options: [{val: 0, text: 'ต้องการความช่วยเหลือ'}, {val: 1, text: 'ทำได้เอง รวมทั้งทำได้เองถ้าเตรียมอุปกรณ์ไว้ให้'}] },
        { q: 'q3', text: '(3) ลุกนั่งจากที่นอน หรือจากเตียงไปเก้าอี้', options: [{val: 0, text: 'ไม่สามารถนั่งได้ (นั่งแล้วจะล้มเสมอ) หรือต้องใช้คน 2 คนช่วยกันยกขึ้น'}, {val: 1, text: 'ต้องใช้คนแข็งแรงหรือมีทักษะ 1 คน / ใช้คนทั่วไป 2 คนพยุงดันขึ้นมาจะนั่งอยู่ได้'}, {val: 2, text: 'ต้องการความช่วยเหลือบ้าง เช่นช่วยพยุงเล็กน้อย/ต้องมีคนดูแลเพื่อความปลอดภัย'}, {val: 3, text: 'ทำได้เอง'}] },
        { q: 'q4', text: '(4) การใช้ห้องน้ำ', options: [{val: 0, text: 'ช่วยเหลือตัวเองไม่ได้'}, {val: 1, text: 'ทำเองได้บ้าง ต้องการความช่วยเหลือในบางสิ่ง'}, {val: 2, text: 'ช่วยเหลือตัวเองได้ดี'}] },
        { q: 'q5', text: '(5) การเคลื่อนที่ภายในห้องหรือบ้าน', options: [{val: 0, text: 'เคลื่อนที่ไปไหนไม่ได้'}, {val: 1, text: 'ใช้รถเข็นช่วยให้เคลื่อนที่ได้เอง (ไม่ต้องมีคนเข็นให้) เข้าออกมุมห้องหรือประตูได้'}, {val: 2, text: 'เดินหรือเคลื่อนที่โดยมีคนช่วยพยุง'}, {val: 3, text: 'เดินหรือเคลื่อนที่ได้เอง'}] },
        { q: 'q6', text: '(6) การสวมใส่เสื้อผ้า', options: [{val: 0, text: 'ต้องมีคนสวมใส่ให้ ช่วยเหลือตัวเองแทบไม่ได้หรือได้น้อย'}, {val: 1, text: 'ช่วยเหลือตัวเองได้ประมาณร้อยละ 50 ที่เหลือต้องมีคนช่วย'}, {val: 2, text: 'ช่วยเหลือตัวเองได้ดี (รวมทั้งติดกระดุม รูดซิปใส่เสื้อผ้าที่ดัดแปลงให้เหมาะสมได้)'}] },
        { q: 'q7', text: '(7) การขึ้นลงบันได 1 ชั้น', options: [{val: 0, text: 'ไม่สามารถทำได้'}, {val: 1, text: 'ต้องการคนช่วย'}, {val: 2, text: 'ขึ้นลงได้เอง (ถ้าต้องใช้เครื่องช่วยเดิน เช่น Walker จะต้องเอาขึ้นลงได้ด้วย)'}] },
        { q: 'q8', text: '(8) การอาบน้ำ', options: [{val: 0, text: 'ต้องมีคนช่วยหรือทำให้'}, {val: 1, text: 'อาบน้ำได้เอง'}] },
        { q: 'q9', text: '(9) การกลั้นอุจจาระ ใน 1 สัปดาห์ที่ผ่านมา', options: [{val: 0, text: 'กลั้นไม่ได้ หรือต้องการการสวนอุจจาระอยู่เสมอ'}, {val: 1, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกิน 1 ครั้งต่อสัปดาห์)'}, {val: 2, text: 'กลั้นได้เป็นปกติ'}] },
        { q: 'q10', text: '(10) การกลั้นปัสสาวะ ใน 1 สัปดาห์ที่ผ่านมา', options: [{val: 0, text: 'กลั้นไม่ได้ หรือใส่สายสวนปัสสาวะ แต่ไม่สามารถดูแลเองได้'}, {val: 1, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกิน วันละ 1 ครั้ง)'}, {val: 2, text: 'กลั้นได้เป็นปกติ'}] }
    ];
    const multipleImpairments = [ {id: 'impairment_swallowing', label: '1. Swallowing'}, {id: 'impairment_communicate', label: '2. Communicate'}, {id: 'impairment_mobility', label: '3. Mobility'}, {id: 'impairment_cognitive', label: '4. Cognitive / Perception'}, {id: 'impairment_bowel', label: '5. Bowel and Bladder'} ];
    const fxHip = [ {id: 'fx_bathroom', label: '1. เข้าห้องน้ำ'}, {id: 'fx_bed', label: '2. ขึ้นลงจากเตียง'}, {id: 'fx_movement', label: '3. เคลื่อนไหว ยืน นั่ง และเดิน'}, {id: 'fx_stairs', label: '4. ขึ้นลงบันใด'} ];

    let formHtml = `
        <h4 class="text-xl font-semibold mb-3">แบบประเมินกิจวัตรประจําวัน (Barthel Activities of Daily Living : ADL) </h4>
        <form id="bi-assessment-form">
            <input type="hidden" name="AssessmentID">
            <div class="row g-3 mb-4 align-items-end">
                <div class="col-md-4"><label class="form-label">วันที่ประเมิน</label><input type="date" name="AssessmentDate" class="form-control"></div>
                <div class="col-md-4"><label class="form-label">ครั้งที่</label><input type="number" name="VisitCount" class="form-control"></div>
                <div class="col-md-4"><div class="card text-center"><div class="card-header">Barthel Index</div><div class="card-body"><h5 class="card-title" id="biTotalScore">0</h5></div></div></div>
            </div>
            ${questions.map(item => `
                <div class="mb-3 p-3 border rounded">
                    <p class="font-semibold">${item.text}</p>
                    ${item.options.map(opt => `<div class="form-check"><input class="form-check-input bi-question" type="radio" name="${item.q}" value="${opt.val}" onchange="updateTotalBIScore()"><label class="form-check-label">${opt.text} (${opt.val})</label></div>`).join('')}
                </div>
            `).join('')}
            <div class="row g-3">
                <div class="col-md-6"><div class="p-3 border rounded h-100"><h5>Multiple impairment (กรณี BI >= 15)</h5>${multipleImpairments.map(item => `<div class="form-check"><input class="form-check-input" type="checkbox" name="${item.id}" id="${item.id}"><label class="form-check-label" for="${item.id}">${item.label}</label></div>`).join('')}</div></div>
                <div class="col-md-6"><div class="p-3 border rounded h-100"><h5>Fx.Around HIP (กรณี BI >= 15)</h5>${fxHip.map(item => `<div class="form-check"><input class="form-check-input" type="checkbox" name="${item.id}" id="${item.id}"><label class="form-check-label" for="${item.id}">${item.label}</label></div>`).join('')}</div></div>
            </div>
            <div class="mt-4"><button type="button" class="btn btn-primary" onclick="handleBIAssessmentSubmit()">บันทึก</button> <button type="button" class="btn btn-secondary" onclick="showHistory('BI')">ยกเลิก</button></div>
        </form>
    `;
    
    document.getElementById('history-container').style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = formHtml;
    formContainer.style.display = 'block';

    document.querySelector('input[name="AssessmentDate"]').valueAsDate = new Date();
    google.script.run.withSuccessHandler(visitCount => { document.querySelector('input[name="VisitCount"]').value = visitCount; }).getNextVisitCount(currentPatient.PatientID);
}
function editBIAssessment(assessmentId) {
    showLoading('กำลังโหลดข้อมูล...');
    google.script.run
        .withSuccessHandler(response => {
            if(response.status === 'success') {
                openNewBIAssessmentForm(); // สร้างโครงฟอร์มก่อน
                const form = document.getElementById('bi-assessment-form');
                const data = response.record;

                for (const key in data) {
                    const el = form.querySelector(`[name="${key}"]`);
                    if (el) {
                        // ตั้งค่าให้กับ Checkbox (สำหรับ Multiple impairment และ Fx.HIP)
                        if (el.type === 'checkbox') {
                           el.checked = data[key] === true || data[key] === 'true';
                        }
                        else if (el.type === 'date') {
                           el.value = data[key] ? data[key].split('T')[0] : '';
                        }
                        else {
                           el.value = data[key];
                        }
                    }
                }

                // ตั้งค่าให้กับ Radio Buttons ของคำถาม BI 10 ข้อ
                for (let i = 1; i <= 10; i++) {
                    const q_val = data[`q${i}`];
                    if (q_val !== undefined) {
                        const radio = form.querySelector(`input[name="q${i}"][value="${q_val}"]`);
                        if (radio) radio.checked = true;
                    }
                }
                
                updateTotalBIScore(); // อัปเดตคะแนนรวมให้ตรงกับข้อมูลที่โหลดมา
                Swal.close();
            } else {
                showError(response);
            }
        })
        .withFailureHandler(showError)
        .getBIAssessmentById(assessmentId);
}

function updateTotalBIScore(scoreId = 'biTotalScore', formSelector = '#bi-assessment-form') {
    let totalScore = 0;
    // ค้นหาเฉพาะ radio button ที่ถูกเลือกภายในฟอร์มที่ระบุ
    document.querySelectorAll(`${formSelector} input.bi-question:checked`).forEach(radio => {
        totalScore += parseInt(radio.value);
    });
    
    const scoreElement = document.getElementById(scoreId);
    if (scoreElement) {
        scoreElement.textContent = totalScore;
    }
}
function handleBIAssessmentSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก...');
    const form = document.getElementById('bi-assessment-form');
    const data = Object.fromEntries(new FormData(form).entries());
    data.PatientID = currentPatient.PatientID;
    data.TotalScore = document.getElementById('biTotalScore').textContent;
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked; });
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            google.script.run.updateScheduleStatus(data.PatientID, data.VisitCount);
            google.script.run.withSuccessHandler(data => { allPatients = data.patients; }).getInitialData();
            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('BI');
        } else { showError(response); }
    }).withFailureHandler(showError).saveBIAssessment(data);
}
// (ในไฟล์ JavaScript.html)

function createBiFormHtml(isSoap = false) {
    const questions = [
        { q: 'q1', text: '(1) รับประทานอาหารเมื่อเตรียมสำรับไว้ให้เรียบร้อยต่อหน้า', options: [{val: 0, text: 'ไม่สามารถตักอาหารเข้าปากได้'}, {val: 1, text: 'ตักอาหารเองได้ แต่ต้องมีคนช่วย เช่น ช่วยใช้ช้อนตักเตรียมให้/ตัดเป็นชิ้นเล็กๆให้'}, {val: 2, text: 'ตักอาหารและช่วยตัวเองได้ปกติ'}] },
        { q: 'q2', text: '(2) การล้างหน้า หวีผม แปรงฟัน โกนหนวด ในระยะเวลา 24-48 ชั่วโมงที่ผ่านมา', options: [{val: 0, text: 'ต้องการความช่วยเหลือ'}, {val: 1, text: 'ทำได้เอง รวมทั้งทำได้เองถ้าเตรียมอุปกรณ์ไว้ให้'}] },
        { q: 'q3', text: '(3) ลุกนั่งจากที่นอน หรือจากเตียงไปเก้าอี้', options: [{val: 0, text: 'ไม่สามารถนั่งได้ (นั่งแล้วจะล้มเสมอ) หรือต้องใช้คน 2 คนช่วยกันยกขึ้น'}, {val: 1, text: 'ต้องใช้คนแข็งแรงหรือมีทักษะ 1 คน / ใช้คนทั่วไป 2 คนพยุงดันขึ้นมาจะนั่งอยู่ได้'}, {val: 2, text: 'ต้องการความช่วยเหลือบ้าง เช่นช่วยพยุงเล็กน้อย/ต้องมีคนดูแลเพื่อความปลอดภัย'}, {val: 3, text: 'ทำได้เอง'}] },
        { q: 'q4', text: '(4) การใช้ห้องน้ำ', options: [{val: 0, text: 'ช่วยเหลือตัวเองไม่ได้'}, {val: 1, text: 'ทำเองได้บ้าง ต้องการความช่วยเหลือในบางสิ่ง'}, {val: 2, text: 'ช่วยเหลือตัวเองได้ดี'}] },
        { q: 'q5', text: '(5) การเคลื่อนที่ภายในห้องหรือบ้าน', options: [{val: 0, text: 'เคลื่อนที่ไปไหนไม่ได้'}, {val: 1, text: 'ใช้รถเข็นช่วยให้เคลื่อนที่ได้เอง (ไม่ต้องมีคนเข็นให้) เข้าออกมุมห้องหรือประตูได้'}, {val: 2, text: 'เดินหรือเคลื่อนที่โดยมีคนช่วยพยุง'}, {val: 3, text: 'เดินหรือเคลื่อนที่ได้เอง'}] },
        { q: 'q6', text: '(6) การสวมใส่เสื้อผ้า', options: [{val: 0, text: 'ต้องมีคนสวมใส่ให้ ช่วยเหลือตัวเองแทบไม่ได้หรือได้น้อย'}, {val: 1, text: 'ช่วยเหลือตัวเองได้ประมาณร้อยละ 50 ที่เหลือต้องมีคนช่วย'}, {val: 2, text: 'ช่วยเหลือตัวเองได้ดี (รวมทั้งติดกระดุม รูดซิปใส่เสื้อผ้าที่ดัดแปลงให้เหมาะสมได้)'}] },
        { q: 'q7', text: '(7) การขึ้นลงบันได 1 ชั้น', options: [{val: 0, text: 'ไม่สามารถทำได้'}, {val: 1, text: 'ต้องการคนช่วย'}, {val: 2, text: 'ขึ้นลงได้เอง (ถ้าต้องใช้เครื่องช่วยเดิน เช่น Walker จะต้องเอาขึ้นลงได้ด้วย)'}] },
        { q: 'q8', text: '(8) การอาบน้ำ', options: [{val: 0, text: 'ต้องมีคนช่วยหรือทำให้'}, {val: 1, text: 'อาบน้ำได้เอง'}] },
        { q: 'q9', text: '(9) การกลั้นอุจจาระ ใน 1 สัปดาห์ที่ผ่านมา', options: [{val: 0, text: 'กลั้นไม่ได้ หรือต้องการการสวนอุจจาระอยู่เสมอ'}, {val: 1, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกิน 1 ครั้งต่อสัปดาห์)'}, {val: 2, text: 'กลั้นได้เป็นปกติ'}] },
        { q: 'q10', text: '(10) การกลั้นปัสสาวะ ใน 1 สัปดาห์ที่ผ่านมา', options: [{val: 0, text: 'กลั้นไม่ได้ หรือใส่สายสวนปัสสาวะ แต่ไม่สามารถดูแลเองได้'}, {val: 1, text: 'กลั้นไม่ได้บางครั้ง (ไม่เกิน วันละ 1 ครั้ง)'}, {val: 2, text: 'กลั้นได้เป็นปกติ'}] }
    ];
    const multipleImpairments = [ {id: 'impairment_swallowing', label: '1. Swallowing'}, {id: 'impairment_communicate', label: '2. Communicate'}, {id: 'impairment_mobility', label: '3. Mobility'}, {id: 'impairment_cognitive', label: '4. Cognitive / Perception'}, {id: 'impairment_bowel', label: '5. Bowel and Bladder'} ];
    const fxHip = [ {id: 'fx_bathroom', label: '1. เข้าห้องน้ำ'}, {id: 'fx_bed', label: '2. ขึ้นลงจากเตียง'}, {id: 'fx_movement', label: '3. เคลื่อนไหว ยืน นั่ง และเดิน'}, {id: 'fx_stairs', label: '4. ขึ้นลงบันใด'} ];
    
    const scoreId = isSoap ? 'soapBiTotalScore' : 'biTotalScore';
    const formSelector = isSoap ? '#soap-bi-form-inner' : '#bi-assessment-form';

    // --- START: ส่วนที่แก้ไข ---
    // สร้างตัวแปรเก็บ onchange event
    const onchangeHandler = isSoap ? 
        `updateTotalBIScore('${scoreId}', '${formSelector}')` : 
        `updateTotalBIScore()`;
    // --- END ---

    const formContent = `
        ${questions.map(item => `
            <div class="mb-3 p-2 border rounded bg-light">
                <p class="font-semibold small">${item.text}</p>
                ${item.options.map(opt => `
                    <div class="form-check">
                        <input class="form-check-input bi-question" type="radio" name="${item.q}" value="${opt.val}" onchange="${onchangeHandler}">
                        <label class="form-check-label small">${opt.text} (${opt.val})</label>
                    </div>
                `).join('')}
            </div>
        `).join('')}
        <div class="row g-3">
            <div class="col-md-6"><div class="p-3 border rounded h-100"><h6>Multiple impairment</h6>${multipleImpairments.map(item => `<div class="form-check"><input class="form-check-input" type="checkbox" name="BI_${item.id}" id="BI_${item.id}"><label class="form-check-label small" for="BI_${item.id}">${item.label}</label></div>`).join('')}</div></div>
            <div class="col-md-6"><div class="p-3 border rounded h-100"><h6>Fx.Around HIP</h6>${fxHip.map(item => `<div class="form-check"><input class="form-check-input" type="checkbox" name="BI_${item.id}" id="BI_${item.id}"><label class="form-check-label small" for="BI_${item.id}">${item.label}</label></div>`).join('')}</div></div>
        </div>`;

    if (!isSoap) {
        return `<h4 class="text-xl font-semibold mb-3">แบบประเมินกิจวัตรประจําวัน (Barthel Activities of Daily Living : ADL) </h4>
            <form id="bi-assessment-form">
                <input type="hidden" name="AssessmentID">
                <div class="row g-3 mb-4 align-items-end">
                    <div class="col-md-4"><label class="form-label">วันที่ประเมิน</label><input type="date" name="AssessmentDate" class="form-control"></div>
                    <div class="col-md-4"><label class="form-label">ครั้งที่</label><input type="number" name="VisitCount" class="form-control"></div>
                    <div class="col-md-4"><div class="card text-center"><div class="card-header">Barthel Index</div><div class="card-body"><h5 class="card-title" id="${scoreId}">0</h5></div></div></div>
                </div>
                ${formContent}
                <div class="mt-4"><button type="button" class="btn btn-primary" onclick="handleBIAssessmentSubmit()">บันทึก</button> <button type="button" class="btn btn-secondary" onclick="showHistory('BI')">ยกเลิก</button></div>
            </form>`;
    } else {
        return `<div class="d-flex justify-content-end mb-2"><div class="card text-center" style="width: 150px;"><div class="card-header p-1">Barthel Index</div><div class="card-body p-1"><h5 class="card-title m-0" id="${scoreId}">0</h5></div></div></div>` + formContent;
    }
}

// =================================================================
// 11. SERVICE VIEW - OPD RECORD
// =================================================================
function renderOpdHistory(records) {
    const columns = [
        { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) },
        { header: 'ครั้งที่', key: r => r.VisitCount },
        { header: 'อาการสำคัญ', key: r => r.ChiefComplaint },
        { header: 'การวินิจฉัย', key: r => r.Diagnosis }
    ];
    const actions = r => `
        <button class="btn btn-outline-primary btn-sm" onclick="editOpdRecord('${r.RecordID}')">รายละเอียด/แก้ไข</button>
        <button class="btn btn-outline-info btn-sm" onclick="printRecord('Opd', '${r.RecordID}')">พิมพ์</button>
        <button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('Opd', '${r.RecordID}')">ลบ</button>
    `;
    const newButton = `<button class="btn btn-success" onclick="openNewOpdForm()">สร้าง OPD Card ใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการบันทึก OPD', newButton, columns, actions);
}

function openNewOpdForm() {
    showLoading('กำลังเตรียมฟอร์ม...');
    setupOpdForm(); // สร้างโครงฟอร์ม

    // ตั้งค่าวันปัจจุบัน
    document.querySelector('#opd-form input[name="VisitDate"]').valueAsDate = new Date();
    populateCheckboxGroup('opd-diagnosis-container', 'Diagnosis', currentPatient.IMCDx || '');
    initializeOpdCanvases();

    // ดึงข้อมูลจาก Server
    google.script.run
        .withSuccessHandler(data => {
            if (data.status === 'success') {
                // [จุดแก้ไข] ใส่เลขครั้งที่อัตโนมัติ
                document.querySelector('#opd-form input[name="VisitCount"]').value = data.visitCount;
                
                // ใส่คะแนน BI
                document.querySelector('#opd-form [name="BarthelIndex"]').value = data.initialBI || '';
            } else {
                showError(data);
            }
            Swal.close();
        })
        .withFailureHandler(showError)
        .getOpdData(currentPatient.PatientID, currentPatient.InitialBI);
}
/**
 * Helper function to create the basic structure of the OPD form.
 */
function setupOpdForm() {
    const formHtml = createOpdFormHtml();
    document.getElementById('history-container').style.display = 'none';
    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = formHtml;
    formContainer.style.display = 'block';

    // Dynamically create complex form parts
    createCheckboxGroup('opd-diagnosis-container', 'Diagnosis', ['Stroke', 'Fx.HIP', 'SCI', 'TBI'], true);
    createOpdPhysicalExamHtml('physical-exam-container');
    createOpdTreatmentHtml('opd-treatment-container');

    // --- START: เพิ่ม 3 บรรทัดนี้ ---
    // (ย้ายมาจาก createOpdPhysicalExamHtml)
    createCheckboxGroup('opd-problemlist-container', 'ProblemList', ['Weakness', 'Poor balance', 'Poor ambulation', 'Abnormal m. length/tone', 'Risk of complication'], true);
    createCheckboxGroup('opd-goals-container', 'GoalsOfTreatment', ['Walking independent w/i 6 month', 'Walking with gait aids independent w/i 6 month', 'Trasfer by W/C independent w/i 6 month'], true);
    createCheckboxGroup('opd-plan-container', 'PlanOfTreatment', ['F/U Program PT ต่อเนื่อง', 'OFF PT Program', 'ส่งต่อ รพ. ดูแลต่อเนื่อง']);
    // --- END: สิ้นสุดการเพิ่ม ---

    document.querySelector('#opd-form input[name="PatientNameFull"]').value = currentPatient.PatientName;
    populateSelect('opdTherapistName', allTherapists, true);
}
function editOpdRecord(recordId) {
    showLoading('กำลังโหลดข้อมูล OPD Card...');
    setupOpdForm(); // 1. เรียกใช้ฟังก์ชันสร้างโครงฟอร์มที่ว่างเปล่าก่อน

    // 2. ดึงข้อมูลที่บันทึกไว้ของ Record ID นี้โดยเฉพาะ
    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success' && response.record) {
                // 3. เติมข้อมูลที่เคยบันทึกไว้ลงในฟอร์ม
                populateOpdForm(response.record);
                initializeOpdCanvases(response.record); // โหลดรูปภาพและลายเซ็นที่เคยบันทึก
                Swal.close();
            } else {
                showError(response);
        
            }
        })
        .withFailureHandler(showError)
        .getOpdRecordById(recordId);
}

function getOpdFormData() {
    const form = document.getElementById('opd-form');
    const data = Object.fromEntries(new FormData(form).entries());
    data.PatientID = currentPatient.PatientID;

    // Gather complex data
    data.Diagnosis = getCheckboxGroupData('opd-diagnosis-container', 'Diagnosis');
    data.UD = getCheckboxGroupData('opd-ud-container', 'UD');
    data.ProblemList = getCheckboxGroupData('opd-problemlist-container', 'ProblemList');
    data.GoalsOfTreatment = getCheckboxGroupData('opd-goals-container', 'GoalsOfTreatment');
    data.PlanOfTreatment = getCheckboxGroupData('opd-plan-container', 'PlanOfTreatment');

    Object.assign(data, getPhysicalExamData()); // Merge PE data

    // --- START: นี่คือจุดแก้ไขที่สำคัญ ---
    data.Treatment_Details = getTreatmentData('opd-form'); // ส่ง ID ของฟอร์มไปด้วย
    // --- END: สิ้นสุดการแก้ไข ---

    data.Treatment_TotalTime = calculateTotalTreatmentTime();

    // Signatures and Drawings
    data.BodyChartDrawingBase64 = signaturePads.bodyChart && !signaturePads.bodyChart.isEmpty() ? signaturePads.bodyChart.toDataURL() : '';
    data.TherapistSignatureBase64 = signaturePads.therapist && !signaturePads.therapist.isEmpty() ? signaturePads.therapist.toDataURL() : '';
    data.PatientSignatureBase64 = signaturePads.patient && !signaturePads.patient.isEmpty() ? signaturePads.patient.toDataURL() : '';

    return data;
}
function handleOpdFormSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก OPD Card...');
    const record = getOpdFormData();
    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            showSuccessToast(response.message);
            google.script.run.updateScheduleStatus(record.PatientID, record.VisitCount);
            
            // --- เพิ่มบรรทัดนี้เพื่อรีเฟรชข้อมูล Real-time ---
            onSaveSuccess(); 
            // ------------------------------------------

            if (typeof onSuccessCallback === 'function') onSuccessCallback();
            else showHistory('OPD');
        } else { showError(response); }
    }).withFailureHandler(showError).saveOpdRecord(record);
}
// (ในไฟล์ JavaScript.html)

function createOpdFormHtml(isEdit = false) {
    const title = isEdit ? 'แก้ไขใบบันทึกผู้ป่วยนอก (OPD Card)' : 'บันทึกผู้ป่วยนอกทางกายภาพบำบัด (OPD Card)';
    
    // --- START: โค้ดที่แก้ไข ---
    // เราจะย้าย Body Chart ออกจาก row g-3 ที่มี Physical Exam
    
    return `<h4 class="text-xl font-semibold mb-3">${title}</h4>
        <form id="opd-form" class="space-y-4">
            <input type="hidden" name="RecordID">

            ${createServiceTypeHtml()}
            
            <fieldset class="border p-3 rounded">
                <legend class="text-lg font-semibold float-none w-auto px-2">Visit Info & Vital signs</legend>
                <div class="row g-3">
                    <div class="col-md-3"><label>วันที่</label><input type="date" name="VisitDate" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>ครั้งที่</label><input type="number" name="VisitCount" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>เวลาเริ่ม</label><input type="time" name="StartTime" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>เวลาสิ้นสุด</label><input type="time" name="EndTime" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>Barthel Index</label><input type="number" name="BarthelIndex" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>BT (°C)</label><input type="text" name="BT" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>Pulse (bpm)</label><input type="text" name="Pulse" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>RR (bpm)</label><input type="text" name="RR" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>BP (mmHg)</label><input type="text" name="BP" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>SpO2 (%)</label><input type="text" name="SpO2" class="form-control form-control-sm"></div>
                </div>
            </fieldset>

            <fieldset class="border p-3 rounded">
                <legend class="text-lg font-semibold float-none w-auto px-2">Medical Information</legend>
                <div class="row g-3">
                    <div class="col-12"><label>Diagnosis</label><div id="opd-diagnosis-container"></div></div>
                    <div class="col-12"><label>Chief complaint (CC)</label><textarea name="ChiefComplaint" class="form-control" rows="2"></textarea></div>
                    <div class="col-12"><label>Present Illness (P็H/PI)</label><textarea name="PHPI" class="form-control" rows="2"></textarea></div>
                    <div class="col-12"><label>การรักษาทางการแพทย์ (Medical Treatment)</label><textarea name="MedicalTreatment" class="form-control" rows="2"></textarea></div>
                    <div class="col-12"><label>U/D</label><div id="opd-ud-container"></div></div>
                    <div class="col-12"><label>Fx.Around HIP status</label><div id="opd-fxhip-container"></div></div>
                </div>
            </fieldset>

            <fieldset class="border p-3 rounded h-100">
                <legend class="text-lg font-semibold float-none w-auto px-2">Physical Examination</legend>
                <div id="physical-exam-container" class="space-y-3"></div>
            </fieldset>

            <fieldset class="border p-3 rounded h-100">
                <legend class="text-lg font-semibold float-none w-auto px-2">Body Chart</legend>
                <div class="text-center mb-2"> <canvas id="bodyChartCanvas" class="body-chart-pad"></canvas>
                </div>
                <div class="text-center mt-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="clearCanvas('bodyChart')">ล้าง</button>
                    <button type="button" class="btn btn-sm btn-outline-info" onclick="refreshBodyChart()">
                        <i class="bi bi-arrow-repeat"></i> โหลดรูปใหม่
                    </button>
                </div>
            </fieldset>
            
            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Problem List & Goals</legend>
                <div class="mb-3"><label class="form-label font-semibold">Problem List</label><div id="opd-problemlist-container"></div></div>
                <div class="mb-3"><label class="form-label font-semibold">Goals of Treatment</label><div id="opd-goals-container"></div></div>
            </fieldset>
            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Treatment</legend><div id="opd-treatment-container"></div></fieldset>
            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Plan of Treatment</legend><div id="opd-plan-container"></div></fieldset>
            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Signatures</legend>
                <div class="row g-3">
                    <div class="col-md-6"><label>ลายมือชื่อผู้ตรวจรักษา</label><canvas id="therapistSignatureCanvas" class="signature-pad"></canvas><div class="mt-1"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="clearCanvas('therapist')">ล้าง</button></div><select name="TherapistName" id="opdTherapistName" class="form-select form-select-sm mt-2"></select></div>
                    <div class="col-md-6"><label>ลายมือชื่อผู้รับบริการ/ญาติ</label><canvas id="patientSignatureCanvas" class="signature-pad"></canvas><div class="mt-1"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="clearCanvas('patient')">ล้าง</button></div><input type="text" name="PatientNameFull" class="form-control form-control-sm mt-2" placeholder="ชื่อ-สกุลเต็ม"></div>
                </div>
            </fieldset>
            
            <div class="mt-4"><button type="button" class="btn btn-primary" onclick="handleOpdFormSubmit()">บันทึก OPD Card</button> <button type="button" class="btn btn-secondary" onclick="showHistory('OPD')">ยกเลิก</button></div>
        </form>`;
    // --- END: โค้ดที่แก้ไข ---
}
function createOpdPhysicalExamHtml(containerId) {
    const container = document.getElementById(containerId);

    // --- 1. ส่วนที่เพิ่มใหม่: Level of Consciousness ---
    const locOptions = ['Alert', 'Drowsiness', 'Confuse', 'Stupor', 'Semi-coma', 'Coma'];
    const locHtml = `
        <div class="mb-4 pb-3 border-bottom">
            <label class="form-label fw-bold d-block mb-2">Level of consciousness</label>
            <div class="d-flex flex-wrap gap-3">
                ${locOptions.map(opt => `
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="PE_LOC" value="${opt}" id="loc_${opt.replace(/\s+/g, '')}">
                        <label class="form-check-label" for="loc_${opt.replace(/\s+/g, '')}">${opt}</label>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="mb-4 pb-3 border-bottom">
            <label class="form-label fw-bold d-block mb-2">Communication</label>
            <div class="d-flex flex-wrap gap-3">
                ${['Normal', 'Dysarthria', 'Aphasia'].map(opt => `
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="Communication" value="${opt}" id="communication_${opt}" onchange="document.getElementById('communication_aphasia_details').style.display = (this.value === 'Aphasia' && this.checked) ? 'block' : 'none'">
                        <label class="form-check-label" for="communication_${opt}">${opt}</label>
                    </div>
                `).join('')}
            </div>
            <div id="communication_aphasia_details" class="mt-2 ps-3" style="display:none;">
                <label class="form-label d-block small mb-1">Aphasia type</label>
                <div class="d-flex flex-wrap gap-3">
                    ${['Global', 'Motor', 'Sensory'].map(opt => `
                        <div class="form-check">
                            <input class="form-check-input" type="radio" name="CommunicationAphasiaType" value="${opt}" id="communicationAphasia_${opt}">
                            <label class="form-check-label" for="communicationAphasia_${opt}">${opt}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="mb-4 pb-3 border-bottom">
            <label class="form-label fw-bold d-block mb-2">Equipment</label>
            <div class="d-flex flex-wrap gap-3">
                ${['No', "Foley's cath", 'NG tube', 'Tracheostomy tube', 'Other'].map(opt => `
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" name="EquipmentOption" value="${opt}" id="equipment_${opt.replace(/[^A-Za-z0-9]+/g, '')}" onchange="if (this.value === 'Other') document.getElementById('equipment_other_details').style.display = this.checked ? 'block' : 'none'">
                        <label class="form-check-label" for="equipment_${opt.replace(/[^A-Za-z0-9]+/g, '')}">${opt}</label>
                    </div>
                `).join('')}
            </div>
            <div id="equipment_other_details" class="mt-2 ps-3" style="display:none;">
                <input type="text" name="EquipmentOther" class="form-control form-control-sm" placeholder="Other ระบุ...">
            </div>
        </div>
    `;

    // --- 2. ส่วนเดิม: U/D Options ---
    // (ส่วนนี้จะไปแสดงผลใน div id="opd-ud-container" ที่อยู่นอกเหนือ containerId หลัก แต่เรียกใช้ในฟังก์ชันนี้)
    const udOptions = ['NO U/D', 'DM', 'HT', 'DLP', 'Old CVA', 'Heart Disease', 'AF on wafarin'];
    createCheckboxGroup('opd-ud-container', 'UD', udOptions, true);
    
    // --- 3. ส่วนเดิม: Fx.HIP Status Options ---
    // (ส่วนนี้จะไปแสดงผลใน div id="opd-fxhip-container")
    const fxHipContainer = document.getElementById('opd-fxhip-container');
    if (fxHipContainer) {
        const fxHipOptions = ['NWB', 'PWB', 'FWB', 'W/C', 'Bed rest'];
        fxHipContainer.innerHTML = fxHipOptions.map(opt => `
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="FxHIP_Status" value="${opt}" id="fxhip_${opt}" onchange="document.getElementById('fxhip_pwb_details').style.display = (this.value === 'PWB' && this.checked) ? 'inline-flex' : 'none'">
                <label class="form-check-label" for="fxhip_${opt}">${opt}</label>
            </div>
        `).join('') + `
            <div id="fxhip_pwb_details" class="align-items-center" style="display:none; vertical-align: middle;">
                 <input type="number" name="FxHIP_PWB_Percent" class="form-control form-control-sm" style="width: 70px;">
                 <span class="ms-1">%</span>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm ms-2" onclick="clearFxHipStatus()">ยกเลิก</button>
        `;
    }

    // --- 4. ส่วนเดิม: Bed Mobility HTML ---
    const bedMobilityHtml = `
        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label d-block">Independent</label>
                <select name="BedMobility_Independent" class="form-select form-select-sm">
                    <option value="">เลือก...</option>
                    <option value="contract">contract</option>
                    <option value="close">close</option>
                    <option value="supervision">supervision</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label d-block">Dependent</label>
                <select name="BedMobility_Dependent" class="form-select form-select-sm">
                    <option value="">เลือก...</option>
                    <option value="Minimal assisted">Minimal assisted</option>
                    <option value="Moderate assisted">Moderate assisted</option>
                    <option value="Maximum assisted">Maximum assisted</option>
                </select>
            </div>
        </div>`;

    // --- 5. ส่วนเดิม: Gross Motor HTML ---
    const grossMotorHtml = `
        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label d-block">Side lying to sitting</label>
                <select name="GrossMotor_SideLying" class="form-select form-select-sm">
                    <option value="">เลือก...</option>
                    <option value="Poor">Poor</option>
                    <option value="Fair">Fair</option>
                    <option value="Good">Good</option>
                    <option value="Normal">Normal</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label d-block">Sit to stand</label>
                <select name="GrossMotor_SitToStand" class="form-select form-select-sm">
                    <option value="">เลือก...</option>
                    <option value="Poor">Poor</option>
                    <option value="Fair">Fair</option>
                    <option value="Good">Good</option>
                    <option value="Normal">Normal</option>
                </select>
            </div>
        </div>`;

    // --- 6. ส่วนเดิม: Main PE Items List ---
    const peItems = [
        { id: 'BedMobility', label: 'Bed mobility', details: bedMobilityHtml },
        { id: 'GrossMotor', label: 'Gross motor', details: grossMotorHtml },
        { id: 'GaitAnalysis', label: 'Gait analysis', details: createGaitAnalysisHtml() },
        { id: 'QualityMovement', label: 'Quality of movement', details: createQualityMovementHtml() },
        { id: 'JointPropio', label: 'Joint propioception / Sensation', details: createJointPropioHtml() },
        { id: 'Balance', label: 'Balance', details: createBalanceHtml() },
        { id: 'PROM', label: 'PROM / Length / Tone', details: createPromLengthToneHtml() },
        { id: 'Other', label: 'Other', details: createDetailInputHtml('OtherPhysical') }
    ];

    // --- 7. รวม HTML และแสดงผล ---
    // นำ locHtml มาต่อด้านหน้า peItems
    container.innerHTML = locHtml + peItems.map(item => `
        <div>
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="PE_${item.id}_Check" id="pe_${item.id}_check" onchange="document.getElementById('pe_${item.id}_details').style.display = this.checked ? 'block' : 'none'">
                <label class="form-check-label fw-bold" for="pe_${item.id}_check">${item.label}</label>
            </div>
            <div id="pe_${item.id}_details" class="ps-4 mt-2" style="display:none;">${item.details}</div>
        </div>
    `).join('');
}

function createOpdTreatmentHtml(containerId) {
    const container = document.getElementById(containerId);
    const timeOptions = [10, 15, 20, 25, 30, 35, 40, 45].map(t => `<option value="${t}">${t}</option>`).join('');
    const treatments = [
        { id: 'QualityMove', label: 'Quality move train', details: ['Rt.UE', 'Rt.LE', 'Lt.UE', 'Lt.LE'] },
        { id: 'BedMobility', label: 'Bed mobility train', details: ['Move up', 'Move down', 'Move RT', 'Move LT', 'Side lying', 'Side lying to sitting'] },
        { id: 'Balance', label: 'Balance train', details: ['Sitting : static', 'Sitting : dynamic', 'Standing : static', 'Standing : dynamic'] },
        { id: 'Gait', label: 'Gait training', details: ['walking with gait aids', 'Adjust pattern'] },
        { id: 'Other', label: 'Other', details: ['Chest PT', 'Pumping exs.', 'Sit to stand', 'Positioning', 'Incentive spiro', 'Breathing exs.', 'Prolong stretching', 'PNF D1F/D1E'] }
    ];
    let html = treatments.map(treat => `
    <div class="border-bottom py-2">
        <div class="row g-2 align-items-center">
            <div class="col-sm-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="Treatment_Check" value="${treat.id}" id="treat_check_${treat.id}"><label class="form-check-label fw-bold" for="treat_check_${treat.id}">${treat.label}</label></div></div>
            <div class="col-sm-6"><div class="input-group input-group-sm"><label class="input-group-text">เวลา</label><select name="Treatment_Time_${treat.id}" class="form-select"><option value="">-</option>${timeOptions}</select><span class="input-group-text">นาที</span></div></div>

            <div class="col-12 ps-4">
                ${treat.details.map(d => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="Treatment_Detail_${treat.id}" value="${d}"><label class="form-check-label small">${d}</label></div>`).join('')}
                ${treat.id === 'Other' ? `
                    <div class="form-check form-check-inline align-middle">
                        <input class="form-check-input" type="checkbox" name="Treatment_Detail_Other_Checkbox" value="อื่นๆ">
                        <label class="form-check-label small">อื่นๆ:</label>
                    </div>
                    <input type="text" name="Treatment_Detail_Other_Custom" class="form-control form-control-sm d-inline-block" style="width: auto;" placeholder="ระบุ...">
                ` : ''}
            </div>
            </div>
    </div>`).join('');
        container.innerHTML = html;
}
// =================================================================
// SERVICE VIEW - OPD RECORD (HTML Generation Helpers)
// =================================================================

function initializeOpdCanvases(record = null) {
    // หน่วงเวลา 100ms (0.1 วินาที) เพื่อให้แท็บเล็ตมีเวลาวาด Layout เสร็จก่อน
    setTimeout(() => {
        initializeSignaturePad('bodyChartCanvas', 'bodyChart');
        initializeSignaturePad('therapistSignatureCanvas', 'therapist');
        initializeSignaturePad('patientSignatureCanvas', 'patient');
        
        loadCanvasImage('bodyChartCanvas', record ? record.BodyChartDrawingBase64 : null, BODY_CHART_IMAGE_ID);
        loadCanvasImage('therapistSignatureCanvas', record ? record.TherapistSignatureBase64 : null);
        loadCanvasImage('patientSignatureCanvas', record ? record.PatientSignatureBase64 : null);
    }, 100); // <-- แก้ไขจาก 0 เป็น 100
}
/**
 * ฟังก์ชันสำหรับปุ่ม "โหลดรูปใหม่"
 * ใช้เพื่อบังคับให้คำนวณขนาดและวาด Canvas ใหม่
 */
function refreshBodyChart() {
    showLoading('กำลังโหลด Body Chart...');
    
    // 1. บังคับให้คำนวณขนาด Canvas ใหม่
    initializeSignaturePad('bodyChartCanvas', 'bodyChart'); 
    
    // 2. วาดภาพต้นฉบับลงไปใหม่
    loadCanvasImage('bodyChartCanvas', null, BODY_CHART_IMAGE_ID);
    
    Swal.close();
}
function createDetailInputHtml(name) {
    return `<textarea name="${name}" class="form-control form-control-sm" rows="2"></textarea>`;
}

function createServiceTypeHtml() {
    return `
        <fieldset class="border p-3 rounded bg-slate-50">
            <legend class="text-lg font-semibold float-none w-auto px-2">ประเภทการให้บริการ</legend>
            <div class="d-flex flex-column gap-2">
                <label class="form-check m-0">
                    <input class="form-check-input" type="checkbox" name="ServiceType_Home" value="1" onchange="syncServiceTypeSelection(this, 'ServiceType_Clinic')">
                    <span class="form-check-label">ให้บริการที่บ้านหรือที่พักอาศัยของผู้ป่วย</span>
                </label>
                <label class="form-check m-0">
                    <input class="form-check-input" type="checkbox" name="ServiceType_Clinic" value="1" onchange="syncServiceTypeSelection(this, 'ServiceType_Home')">
                    <span class="form-check-label">ผู้ป่วยนอก - เข้ารับบริการที่คลินิก</span>
                </label>
            </div>
        </fieldset>`;
}

function syncServiceTypeSelection(changedInput, otherName) {
    if (!changedInput || !changedInput.checked) return;
    const form = changedInput.form;
    if (!form) return;
    const otherInput = form.querySelector(`[name="${otherName}"]`);
    if (otherInput) otherInput.checked = false;
}

function getServiceTypeSelection(form) {
    return {
        home: !!form.querySelector('[name="ServiceType_Home"]')?.checked,
        clinic: !!form.querySelector('[name="ServiceType_Clinic"]')?.checked
    };
}

function createGaitAnalysisHtml() {
    const phases = ['Heel strike', 'Flat foot', 'Heel off', 'Toe off', 'Swing phase'];
    const grades = ['Independent', 'Less', 'Lack'];
    return phases.map(phase => `
        <div class="form-check form-check-inline">
            <input class="form-check-input" type="checkbox" name="GaitAnalysis_Phase" value="${phase}">
            <label class="form-check-label">${phase}</label>
            <select name="GaitAnalysis_Grade_${phase.replace(/\s+/g, '')}" class="form-select form-select-sm ms-2" style="width: auto; display: inline-block;">
                <option value="">เลือก...</option>
                ${grades.map(g => `<option value="${g}">${g}</option>`).join('')}
            </select>
        </div>
    `).join('');
}

function createQualityMovementHtml() {
    const grades = ['Zero', 'Poor', 'Fair', 'Good', 'Normal'];
    const options = grades.map(g => `<option value="${g}">${g}</option>`).join('');
    return `
        <div class="row g-2">
            <div class="col-md-6"><label class="form-label small">UE Rt.</label><select name="QM_UE_Rt" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
            <div class="col-md-6"><label class="form-label small">UE Lt.</label><select name="QM_UE_Lt" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
            <div class="col-md-6"><label class="form-label small">LE Rt.</label><select name="QM_LE_Rt" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
            <div class="col-md-6"><label class="form-label small">LE Lt.</label><select name="QM_LE_Lt" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
        </div>`;
}

function createJointPropioHtml() {
    const grades = ['Intract', 'Impair'];
    const options = grades.map(g => `<option value="${g}">${g}</option>`).join('');
    const createRow = (limb) => `
        <div class="row g-2 mb-2 align-items-center">
            <div class="col-2"><b>${limb}</b></div>
            <div class="col-5"><label class="form-label small">Rt. (Joint/Sensation)</label><div class="input-group input-group-sm"><select name="Joint_${limb}_Rt" class="form-select"><option value="">-</option>${options}</select><select name="Sensation_${limb}_Rt" class="form-select"><option value="">-</option>${options}</select></div></div>
            <div class="col-5"><label class="form-label small">Lt. (Joint/Sensation)</label><div class="input-group input-group-sm"><select name="Joint_${limb}_Lt" class="form-select"><option value="">-</option>${options}</select><select name="Sensation_${limb}_Lt" class="form-select"><option value="">-</option>${options}</select></div></div>
        </div>`;
    return createRow('UE') + createRow('LE');
}

function createBalanceHtml() {
    const grades = ['Zero', 'Poor', 'Fair', 'Good', 'Normal'];
    const options = grades.map(g => `<option value="${g}">${g}</option>`).join('');
    return `
        <div class="row g-2">
            <div class="col-md-6"><label class="form-label small">Sitting</label><select name="Balance_Sitting" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
            <div class="col-md-6"><label class="form-label small">Standing</label><select name="Balance_Standing" class="form-select form-select-sm"><option value="">-</option>${options}</select></div>
        </div>`;
}

function createPromLengthToneHtml() {
    const promOptions = [{ name: 'Full ROM' }, { name: 'Limit ROM', hasInput: true }];
    const lengthOptions = [{ name: 'Normal length' }, { name: 'Tightness', hasInput: true }, { name: 'Shortening', hasInput: true }, { name: 'Contracture', hasInput: true }];
    const toneOptions = [{ name: 'Normal Tone' }, { name: 'Hypertone', hasInput: true }, { name: 'Hypotone', hasInput: true }];
    const createSection = (title, name, options) => `
        <div class="col-md-4"><div class="p-2 border rounded h-100"><strong class="d-block mb-2">${title}</strong>${options.map(opt => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="${name}" value="${opt.name}">
                <label class="form-check-label small">${opt.name}</label>
            </div>
            ${opt.hasInput ? `<input type="text" name="${name}_${opt.name.replace(/\s+/g, '')}_Details" class="form-control form-control-sm mb-2" placeholder="ระบุตำแหน่ง...">` : ''}
        `).join('')}</div></div>`;
    return `<div class="row g-2">${createSection('PROM', 'PROM', promOptions)}${createSection('Length', 'Length', lengthOptions)}${createSection('Tone', 'Tone', toneOptions)}</div>`;
}


function populateOpdForm(record) {
    const form = document.getElementById('opd-form');
    // 1. เติมข้อมูลในช่อง Input, Textarea, Select ทั่วไป
    for (const key in record) {
        const el = form.querySelector(`[name="${key}"]`);
        if (el) {
            if (el.type === 'date' && record[key]) {
                // --- START: แก้ไขเรื่อง Timezone ---
                const date = new Date(record[key]);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                el.value = `${year}-${month}-${day}`;
                // --- END: สิ้นสุดการแก้ไข ---
            } else if (el.type === 'checkbox') {
                el.checked = record[key] === true || record[key] === 'true' || record[key] === 'TRUE' || record[key] === 1 || record[key] === '1' || record[key] === 'on';
            } else if (el.type === 'radio') {
                const radioEl = form.querySelector(`input[name="${key}"][value="${record[key]}"]`);
                if(radioEl) radioEl.checked = true;
            }
            else el.value = record[key];
        }
    }

    // จัดการเวลาให้ถูกต้อง
    const formatTime = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    form.querySelector('[name="StartTime"]').value = formatTime(record.StartTime);
    form.querySelector('[name="EndTime"]').value = formatTime(record.EndTime);

    // 2. เติมข้อมูลใน Checkbox Groups
    populateCheckboxGroup('opd-diagnosis-container', 'Diagnosis', record.Diagnosis);
    populateCheckboxGroup('opd-ud-container', 'UD', record.UD);
    populateCheckboxGroup('opd-problemlist-container', 'ProblemList', record.ProblemList);
    populateCheckboxGroup('opd-goals-container', 'GoalsOfTreatment', record.GoalsOfTreatment);
    populateCheckboxGroup('opd-plan-container', 'PlanOfTreatment', record.PlanOfTreatment);
    
    // 3. จัดการ Fx.HIP Status
    if(record.FxHIP_Status) {
        const fxhipRadio = form.querySelector(`input[name="FxHIP_Status"][value="${record.FxHIP_Status}"]`);
        if (fxhipRadio) {
            fxhipRadio.checked = true;
            if(record.FxHIP_Status === 'PWB') {
                document.getElementById('fxhip_pwb_details').style.display = 'inline-flex';
                form.querySelector(`input[name="FxHIP_PWB_Percent"]`).value = record.FxHIP_PWB_Percent || '';
            }
        }
    }
    
    // 4. เติมข้อมูล Physical Exam และ Treatment ที่ซับซ้อน
    populatePhysicalExamForm(record);
    populateTreatmentForm(record.Treatment_Details);
}

function populatePhysicalExamForm(record) {
    const form = document.getElementById('opd-form');
    if (record.LevelOfConsciousness) {
        const locs = record.LevelOfConsciousness.split(', ');
        locs.forEach(val => {
            // ใช้ querySelector ค้นหาค่าที่ตรงกันแล้วสั่ง checked
            const cb = form.querySelector(`input[name="PE_LOC"][value="${val}"]`);
            if (cb) cb.checked = true;
        });
    }
    const communicationAphasiaDetails = document.getElementById('communication_aphasia_details');
    if (communicationAphasiaDetails) communicationAphasiaDetails.style.display = record.Communication === 'Aphasia' ? 'block' : 'none';
    const equipmentValues = String(record.Equipment || '').split(', ').filter(Boolean);
    equipmentValues.forEach(val => {
        const cb = form.querySelector(`input[name="EquipmentOption"][value="${val}"]`);
        if (cb) cb.checked = true;
    });
    const equipmentOtherDetails = document.getElementById('equipment_other_details');
    if (equipmentOtherDetails) equipmentOtherDetails.style.display = equipmentValues.includes('Other') ? 'block' : 'none';
    form.querySelectorAll('input[name^="PE_"]').forEach(cb => { if(record[cb.name]) { cb.checked = true; document.getElementById(cb.id.replace('check', 'details')).style.display = 'block'; } });
    try {
        const gaitDetails = JSON.parse(record.GaitAnalysis_Details || '{}');
        for (const p in gaitDetails) { const cb = form.querySelector(`input[name="GaitAnalysis_Phase"][value="${p}"]`); if (cb) cb.checked = true; const sel = form.querySelector(`select[name="GaitAnalysis_Grade_${p.replace(/\s+/g, '')}"]`); if (sel) sel.value = gaitDetails[p]; }
        const qm = JSON.parse(record.QualityMovement || '{}');
        for(const l in qm) { for(const s in qm[l]) { const sel = form.querySelector(`[name="QM_${l}_${s}"]`); if(sel) sel.value = qm[l][s]; } }
        const jUE = JSON.parse(record.JointSensation_UE_Details || '{}');
        for(const k in jUE) { const sel = form.querySelector(`[name="${k.replace(/\s+/g, '_')}_UE"]`); if(sel) sel.value = jUE[k]; }
        const jLE = JSON.parse(record.JointSensation_LE_Details || '{}');
        for(const k in jLE) { const sel = form.querySelector(`[name="${k.replace(/\s+/g, '_')}_LE"]`); if(sel) sel.value = jLE[k]; }
        const bal = JSON.parse(record.Balance || '{}');
        if(bal.Sitting) form.querySelector('[name="Balance_Sitting"]').value = bal.Sitting; if(bal.Standing) form.querySelector('[name="Balance_Standing"]').value = bal.Standing;
        
        // --- START: นี่คือจุดแก้ไข ---
        // ส่ง 'opd-form' เป็นพารามิเตอร์แรก
        ['PROM', 'Length', 'Tone'].forEach(cat => populateCheckboxGroupWithDetails('opd-form', cat, record[cat]));
        // --- END: สิ้นสุดการแก้ไข ---
    
    } catch(e) { console.error("Error parsing PE JSON:", e); }
}

function populateTreatmentForm(jsonString) {
    try {
        const formData = JSON.parse(jsonString || '{}');
        for (const treatId in formData) {
            const check = document.getElementById(`treat_check_${treatId}`);
            if (check) check.checked = true;
            const timeSelect = document.querySelector(`[name="Treatment_Time_${treatId}"]`);
            if (timeSelect) timeSelect.value = formData[treatId].time;

            if (formData[treatId].details) {
                const savedDetails = formData[treatId].details;

                savedDetails.forEach(val => {
                    const detailCheck = document.querySelector(`input[name="Treatment_Detail_${treatId}"][value="${val}"]`);
                    if (detailCheck) {
                        // This is a predefined checkbox
                        detailCheck.checked = true;
                    } else if (treatId === 'Other') {
                        // This must be the custom text
                        const otherCheckbox = document.querySelector('input[name="Treatment_Detail_Other_Checkbox"]');
                        const otherTextInput = document.querySelector('input[name="Treatment_Detail_Other_Custom"]');
                        if (otherCheckbox) otherCheckbox.checked = true;
                        if (otherTextInput) otherTextInput.value = val;
                    }
                });
            }
        }
    } catch (e) {
        console.error("Error parsing Treatment JSON:", e);
    }
}

function getPhysicalExamData() {
    const data = {};
    const form = document.getElementById('opd-form'); // ระบุฟอร์ม
    const locValues = Array.from(form.querySelectorAll('input[name="PE_LOC"]:checked')).map(cb => cb.value);
    data.LevelOfConsciousness = locValues.join(', ');
    data.Communication = (form.querySelector('input[name="Communication"]:checked') || {}).value || '';
    data.CommunicationAphasiaType = data.Communication === 'Aphasia' ? ((form.querySelector('input[name="CommunicationAphasiaType"]:checked') || {}).value || '') : '';
    const equipmentValues = Array.from(form.querySelectorAll('input[name="EquipmentOption"]:checked')).map(cb => cb.value);
    data.Equipment = equipmentValues.join(', ');
    data.EquipmentOther = equipmentValues.includes('Other') ? (form.querySelector('[name="EquipmentOther"]').value || '').trim() : '';
    form.querySelectorAll('input[name^="PE_"]').forEach(cb => data[cb.name] = cb.checked);

    // --- NEW Bed Mobility & Gross Motor Data Gathering ---
    const bedMobilityInd = form.querySelector('[name="BedMobility_Independent"]').value;
    const bedMobilityDep = form.querySelector('[name="BedMobility_Dependent"]').value;
    data.BedMobility = [bedMobilityInd, bedMobilityDep].filter(Boolean).join(', ');

    const grossMotorSide = form.querySelector('[name="GrossMotor_SideLying"]').value;
    const grossMotorSit = form.querySelector('[name="GrossMotor_SitToStand"]').value;
    data.GrossMotor = [
        grossMotorSide ? `Side lying to sitting: ${grossMotorSide}` : '',
        grossMotorSit ? `Sit to stand: ${grossMotorSit}` : ''
    ].filter(Boolean).join('; ');

    // --- ส่วนที่เหลือเหมือนเดิม ---
    const gait = {}; form.querySelectorAll('input[name="GaitAnalysis_Phase"]:checked').forEach(cb => { const p = cb.value; const sel = form.querySelector(`select[name="GaitAnalysis_Grade_${p.replace(/\s+/g, '')}"]`); gait[p] = sel ? sel.value : 'N/A'; }); data.GaitAnalysis_Details = JSON.stringify(gait);
    data.QualityMovement = JSON.stringify({ UE: { Rt: form.querySelector('[name="QM_UE_Rt"]').value, Lt: form.querySelector('[name="QM_UE_Lt"]').value }, LE: { Rt: form.querySelector('[name="QM_LE_Rt"]').value, Lt: form.querySelector('[name="QM_LE_Lt"]').value } });
    const getJoint = (l) => ({ 'Rt. Joint': form.querySelector(`[name="Joint_${l}_Rt"]`).value, 'Rt. Sensation': form.querySelector(`[name="Sensation_${l}_Rt"]`).value, 'Lt. Joint': form.querySelector(`[name="Joint_${l}_Lt"]`).value, 'Lt. Sensation': form.querySelector(`[name="Sensation_${l}_Lt"]`).value }); data.JointSensation_UE_Details = JSON.stringify(getJoint('UE')); data.JointSensation_LE_Details = JSON.stringify(getJoint('LE'));
    data.Balance = JSON.stringify({ Sitting: form.querySelector('[name="Balance_Sitting"]').value, Standing: form.querySelector('[name="Balance_Standing"]').value });

    // --- START: นี่คือจุดแก้ไขที่สำคัญ ---
    // ส่ง 'opd-form' เข้าไปเป็นพารามิเตอร์แรก
    data.PROM = getCheckboxGroupDataWithDetails('opd-form', 'PROM');
    data.Length = getCheckboxGroupDataWithDetails('opd-form', 'Length');
    data.Tone = getCheckboxGroupDataWithDetails('opd-form', 'Tone');
    // --- END: สิ้นสุดการแก้ไข ---
    
    return data;
}

function getTreatmentData(formId) {
    const form = document.getElementById(formId);
    if (!form) return '{}'; // ถ้าไม่พบฟอร์ม ให้ส่ง JSON ว่างกลับ

    const data = {};
    // ค้นหาเฉพาะภายในฟอร์มที่ระบุ
    form.querySelectorAll('input[name="Treatment_Check"]:checked').forEach(cb => {
        const id = cb.value;
        
        // ค้นหา details เฉพาะภายในฟอร์ม
        let details = Array.from(form.querySelectorAll(`input[name="Treatment_Detail_${id}"]:checked`)).map(d => d.value);

        // จัดการ "อื่นๆ" (Other) เฉพาะภายในฟอร์ม
        if (id === 'Other') {
            const otherCheckbox = form.querySelector('input[name="Treatment_Detail_Other_Checkbox"]');
            const otherTextInput = form.querySelector('input[name="Treatment_Detail_Other_Custom"]');

            if (otherCheckbox && otherCheckbox.checked && otherTextInput && otherTextInput.value.trim() !== '') {
                details.push(otherTextInput.value.trim());
            }
        }
        
        // ค้นหาเวลา เฉพาะภายในฟอร์ม
        const time = form.querySelector(`[name="Treatment_Time_${id}"]`).value;
        data[id] = { time, details };
    });
    return JSON.stringify(data);
}

function calculateTotalTreatmentTime() {
    // ค้นหาฟอร์มที่กำลังแสดงอยู่ (OPD หรือ SOAP)
    const form = document.getElementById('opd-form') || document.getElementById('soap-note-form');
    if (!form) return 0;

    let total = 0;
    // ค้นหาเฉพาะภายในฟอร์มที่ระบุ
    form.querySelectorAll('input[name="Treatment_Check"]:checked').forEach(cb => {
        const time = parseInt(form.querySelector(`[name="Treatment_Time_${cb.value}"]`).value || '0');
        total += time;
    });
    return total;
}

// =================================================================
// 12. SERVICE VIEW - SOAP NOTE
// =================================================================
function renderSoapHistory(records) {
    const columns = [ { header: 'วันที่', key: r => formatThaiDate(r.VisitDate) }, { header: 'ครั้งที่', key: r => r.VisitCount }, { header: 'คะแนน BI', key: r => r.BI_TotalScore } ];
    const actions = r => `<button class="btn btn-outline-primary btn-sm" onclick="editSoapNote('${r.SOAPNoteID}')">รายละเอียด/แก้ไข</button><button class="btn btn-outline-info btn-sm" onclick="printRecord('SOAP', '${r.SOAPNoteID}')">พิมพ์</button><button class="btn btn-outline-danger btn-sm" onclick="confirmDelete('SOAP', '${r.SOAPNoteID}')">ลบ</button>`;
    const newButton = `<button class="btn btn-success" onclick="openNewSoapForm()">สร้าง SOAP Note ใหม่</button>`;
    renderHistoryTable(records, 'ประวัติการบันทึก SOAP Note', newButton, columns, actions);
}
/**
 * Helper function to create the basic structure of the SOAP Note form.
 */
function setupSoapForm() {
    const formHtml = createSoapFormHtml();
    const historyContainer = document.getElementById('history-container');
    if (historyContainer) historyContainer.style.display = 'none';

    const formContainer = document.getElementById('form-container-inner');
    formContainer.innerHTML = formHtml;
    formContainer.style.display = 'block';

    // Create sub-parts of the form
    createSoapObjectiveHtml('soap-objective-container');
    createSoapTreatmentHtml('soap-treatment-container', currentPatient.IMCDx);
    formContainer.querySelector('input[name="PatientNameFull"]').value = currentPatient.PatientName;
    populateSelect('soapTherapistName', allTherapists, true);

    // Initialize signature pads
    initializeSignaturePad('soapTherapistSignatureCanvas', 'soapTherapist');
    initializeSignaturePad('soapPatientSignatureCanvas', 'soapPatient');
}
// (ในไฟล์ JavaScript.html)

function openNewSoapForm() {
    showLoading('กำลังเตรียมฟอร์ม SOAP Note...');
    setupSoapForm(); 

    google.script.run
        .withSuccessHandler(data => {
            // data ตอนนี้ส่งมาเป็น Object { visitCount: ..., ... } จากการแก้ครั้งก่อน
            // แต่ถ้า getNextVisitCount ส่งกลับเป็น int (แบบเก่า) โค้ดนี้จะรองรับทั้งคู่
            const vCount = (typeof data === 'object') ? data.visitCount : data;

            const form = document.getElementById('soap-note-form');
            form.querySelector('input[name="VisitDate"]').valueAsDate = new Date();
            
            // [จุดแก้ไข] ใส่เลขครั้งที่อัตโนมัติ
            form.querySelector('input[name="VisitCount"]').value = vCount;
            
            Swal.close();
        })
        .withFailureHandler(showError)
        .getNextVisitCount(currentPatient.PatientID);
}
function editSoapNote(recordId) {
    showLoading('กำลังโหลดข้อมูล SOAP Note...');
    setupSoapForm(); // 1. สร้างโครงฟอร์มที่ว่างเปล่าก่อน

    // 2. ดึงข้อมูล SOAP Note ที่ต้องการแก้ไขโดยใช้ ID
    google.script.run.withSuccessHandler(res => {
        if (res.status === 'success' && res.record) {
            // 3. เติมข้อมูลที่เคยบันทึกไว้ทั้งหมดลงในฟอร์ม
            populateSoapForm(res.record);

            // 4. โหลดลายเซ็นที่เคยบันทึกไว้
            loadCanvasImage('soapTherapistSignatureCanvas', res.record.TherapistSignatureBase64);
            loadCanvasImage('soapPatientSignatureCanvas', res.record.PatientSignatureBase64);
            
            Swal.close();
        } else {
            showError(res);
        }
    }).withFailureHandler(showError).getSOAPNoteById(recordId);
}

function createSoapTreatmentHtml(containerId, defaultDiagnosis = null) {
    const container = document.getElementById(containerId); // containerId คือ 'soap-treatment-container'
    if (!container) return;

    // 1. สร้าง Checkbox ของ Diagnosis (เหมือนเดิม)
    createCheckboxGroup('soap-diagnosis-container', 'Diagnosis', ['Stroke', 'Fx.HIP', 'SCI', 'TBI'], false, defaultDiagnosis);
    
    // 2. สร้าง Checkbox ของ Plan (เหมือนเดิม)
    createCheckboxGroup('soap-plan-container', 'Plan', ['F/U Program PT ต่อเนื่อง', 'OFF PT Program', 'ส่งต่อ รพ. ดูแลต่อเนื่อง']);
    
    // --- START: ส่วนที่แก้ไข ---
    // 3. เรียกใช้ฟังก์ชันใหม่ที่เราเพิ่งเพิ่ม (createSoapTreatmentSectionHtml) 
    //    เพื่อสร้าง HTML ของ Treatment
    const treatmentHtml = createSoapTreatmentSectionHtml();
    
    // 4. นำ HTML ที่ได้ไปใส่ใน <div id="soap-treatment-container">
    container.innerHTML = treatmentHtml;
    // --- END: ส่วนที่แก้ไข ---
}


// (ในไฟล์ JavaScript.html)

function createSoapFormHtml(isEdit = false) {
    const title = isEdit ? 'แก้ไข SOAP Note' : 'บันทึกความก้าวหน้าทางกายภาพบำบัด (SOAP Note)';
    const biFormContent = createBiFormHtml(true); 

    return `<h4 class="text-xl font-semibold mb-3">${title}</h4>
        <form id="soap-note-form" class="space-y-4">
            <input type="hidden" name="SOAPNoteID">
            <input type="hidden" name="BI_AssessmentID"> 

            ${createServiceTypeHtml()}

            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Visit Info & Vital signs</legend>
                <div class="row g-3">
                    <div class="col-md-3"><label>วันที่</label><input type="date" name="VisitDate" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>ครั้งที่</label><input type="number" name="VisitCount" class="form-control form-control-sm" readonly></div>
                    <div class="col-md-3"><label>เวลาเริ่ม</label><input type="time" name="StartTime" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>เวลาสิ้นสุด</label><input type="time" name="EndTime" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>BT</label><input type="text" name="BT" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>Pulse</label><input type="text" name="Pulse" class="form-control form-control-sm"></div>
                    <div class="col-md-2"><label>RR</label><input type="text" name="RR" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>BP</label><input type="text" name="BP" class="form-control form-control-sm"></div>
                    <div class="col-md-3"><label>SpO2</label><input type="text" name="SpO2" class="form-control form-control-sm"></div>
                </div>
            </fieldset>
            
            <div class="row g-3">
                <div class="col-lg-7">
                    <fieldset class="border p-3 rounded h-100"><legend class="text-lg font-semibold float-none w-auto px-2">S.O.A.P</legend>
                        <div class="mb-3"><label class="form-label fw-bold">การวินิจฉัย (Diagnosis)</label><div id="soap-diagnosis-container"></div></div>
                        <div class="mb-3"><label class="form-label fw-bold">Subjective</label><textarea name="Subjective" class="form-control" rows="3"></textarea></div>
                        <div class="mb-3"><label class="form-label fw-bold">Objective</label><div id="soap-objective-container" class="p-2 border rounded"></div></div>
                        <div class="mb-3"><label class="form-label fw-bold">Analysis / Assessment</label><textarea name="Analysis" class="form-control" rows="3"></textarea></div>
                    </fieldset>
                </div>

                <div class="col-lg-5">
                    <fieldset class="border p-3 rounded h-100"><legend class="text-lg font-semibold float-none w-auto px-2">Barthel Index</legend>
                        <div id="soap-bi-form-inner" style="max-height: 500px; overflow-y: auto;">
                            ${biFormContent} 
                        </div>
                    </fieldset>
                </div>
            </div>

            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Treatment & Plan</legend>
                <div class="row g-3">
                    <div class="col-md-7"><div id="soap-treatment-container"></div></div>
                    
                    <div class="col-md-5">
                        <label class="form-label fw-bold">Plan of treatment</label>
                        <div id="soap-plan-container"></div> </div>
                    </div>
            </fieldset>

            <fieldset class="border p-3 rounded"><legend class="text-lg font-semibold float-none w-auto px-2">Signatures</legend>
                <div class="row g-3">
                    <div class="col-md-6"><label>ลายมือชื่อผู้ตรวจรักษา</label><canvas id="soapTherapistSignatureCanvas" class="signature-pad"></canvas><div class="mt-1"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="clearCanvas('soapTherapist')">ล้าง</button></div><select name="TherapistName" id="soapTherapistName" class="form-select form-select-sm mt-2"></select></div>
                    <div class="col-md-6"><label>ลายมือชื่อผู้รับบริการ/ญาติ</label><canvas id="soapPatientSignatureCanvas" class="signature-pad"></canvas><div class="mt-1"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="clearCanvas('soapPatient')">ล้าง</button></div><input type="text" name="PatientNameFull" class="form-control form-control-sm mt-2" placeholder="ชื่อ-สกุลเต็ม"></div>
                </div>
            </fieldset>
            
            <div class="mt-4"><button type="button" class="btn btn-primary" onclick="handleSoapNoteSubmit()">บันทึก SOAP Note</button> <button type="button" class="btn btn-secondary" onclick="showHistory('SOAP')">ยกเลิก</button></div>
       </form>`;
}

function getSoapFormData() {
    const form = document.getElementById('soap-note-form');
    const data = Object.fromEntries(new FormData(form).entries());
    const soapData = {
        SOAPNoteID: data.SOAPNoteID,
        PatientID: currentPatient.PatientID,
        VisitDate: data.VisitDate,
        VisitCount: data.VisitCount,
        StartTime: data.StartTime,
        EndTime: data.EndTime,
        BT: data.BT,
        Pulse: data.Pulse,
        RR: data.RR,
        BP: data.BP,
        SpO2: data.SpO2,
        DiagnosisJSON: JSON.stringify(Array.from(document.querySelectorAll('#soap-diagnosis-container input:checked')).map(el => el.value)),
        Subjective: data.Subjective,
        ObjectiveJSON: JSON.stringify({
            QualityMovement_Check: form.Objective_QualityMovement_Check.checked,
            QualityMovement: { UE: { Rt: form.QM_UE_Rt.value, Lt: form.QM_UE_Lt.value }, LE: { Rt: form.QM_LE_Rt.value, Lt: form.QM_LE_Lt.value } },
            Other_Check: form.Objective_Other_Check.checked,
            Other_Details: form.Objective_Other_Details.value
        }),
        Analysis: data.Analysis,
        Plan: getCheckboxGroupData('soap-plan-container', 'Plan'), 
        TherapistName: data.TherapistName,
        PatientNameFull: data.PatientNameFull,
        TherapistSignatureBase64: signaturePads.soapTherapist && !signaturePads.soapTherapist.isEmpty() ?
signaturePads.soapTherapist.toDataURL() : '',
        PatientSignatureBase64: signaturePads.soapPatient && !signaturePads.soapPatient.isEmpty() ?
signaturePads.soapPatient.toDataURL() : '',

        // --- START: ส่วนที่แก้ไข (เพิ่ม 1 บรรทัดนี้) ---
        BI_TotalScore: document.getElementById('soapBiTotalScore').textContent
        // --- END: สิ้นสุดการแก้ไข ---
    };
    
    let treatmentData = JSON.parse(getTreatmentData('soap-note-form'));

    treatmentData.Ambulation = { Status: data.Ambulation, PWB_Percent: data.Ambulation_PWB_Percent };
    soapData.TreatmentJSON = JSON.stringify(treatmentData);
    const biData = {
        AssessmentID: data.BI_AssessmentID,
        PatientID: currentPatient.PatientID,
        // --- START: ส่วนที่แก้ไข (เปลี่ยน VisitDate เป็น AssessmentDate) ---
        AssessmentDate: data.VisitDate, 
        // --- END: สิ้นสุดการแก้ไข ---
        VisitCount: data.VisitCount, 
        TotalScore: document.getElementById('soapBiTotalScore').textContent
    };
    for (let i = 1; i <= 10; i++) {
        const q = form.querySelector(`input[name="q${i}"]:checked`);
        biData[`q${i}`] = q ? q.value : null;
    }
    form.querySelectorAll('#soap-bi-form-inner input[type="checkbox"]').forEach(cb => {
        const cleanName = cb.name.replace('BI_', '');
        biData[cleanName] = cb.checked;
    });
    return { soapData, biData };
}

// 3. แทนที่ฟังก์ชันนี้:
function handleSoapNoteSubmit(onSuccessCallback) {
    showLoading('กำลังบันทึก SOAP Note...');
    const { soapData, biData } = getSoapFormData();

    google.script.run.withSuccessHandler(soapResponse => {
        if (soapResponse.status === 'success') {
            google.script.run.withSuccessHandler(biResponse => {
                if (biResponse.status === 'success') {
                    showSuccessToast('บันทึก SOAP Note และ BI สำเร็จ!');
                    google.script.run.updateScheduleStatus(soapData.PatientID, soapData.VisitCount);
                    
                    // --- เพิ่มบรรทัดนี้เพื่อรีเฟรชข้อมูล Real-time ---
                    onSaveSuccess();
                    // ------------------------------------------
                    
                    if (typeof onSuccessCallback === 'function') onSuccessCallback();
                    else showHistory('SOAP');
                } else {
                    showError(biResponse);
                }
            })
            .withFailureHandler(showError)
            .saveBIAssessment(biData);
        } else {
            showError(soapResponse);
        }
    })
    .withFailureHandler(showError)
    .saveSOAPNote(soapData);
}

// 4. แทนที่ฟังก์ชันนี้:
function editSoapNote(recordId) {
    showLoading('กำลังโหลดข้อมูล SOAP Note...');
    setupSoapForm(); // 1. สร้างโครงฟอร์มที่ว่างเปล่าก่อน

    // 2. ดึงข้อมูล SOAP Note
    google.script.run.withSuccessHandler(soapRes => {
        if (soapRes.status === 'success' && soapRes.record) {
            const soapRecord = soapRes.record;
            populateSoapForm(soapRecord); // 3. เติมข้อมูล SOAP
            loadCanvasImage('soapTherapistSignatureCanvas', soapRes.record.TherapistSignatureBase64);
            loadCanvasImage('soapPatientSignatureCanvas', soapRes.record.PatientSignatureBase64);

            // 4. ดึงข้อมูล BI ที่เกี่ยวข้อง (VisitCount เดียวกัน)
            google.script.run.withSuccessHandler(biRes => {
                if (biRes.status === 'success' && biRes.record) {
                    const biRecord = biRes.record;
                    const form = document.getElementById('soap-note-form');
                    
                    // 5. เติมข้อมูล BI ลงในฟอร์ม
                    form.querySelector('[name="BI_AssessmentID"]').value = biRecord.AssessmentID;
                    // (เติมคำถาม q1-q10)
                    for (let i = 1; i <= 10; i++) {
                        const q_val = biRecord[`q${i}`];
                        if (q_val !== undefined) {
                            const radio = form.querySelector(`#soap-bi-form-inner input[name="q${i}"][value="${q_val}"]`);
                            if (radio) radio.checked = true;
                        }
                    }
                    // (เติม Checkboxes)
                    form.querySelectorAll('#soap-bi-form-inner input[type="checkbox"]').forEach(cb => {
                        const cleanName = cb.name.replace('BI_', '');
                        if (biRecord[cleanName] === true) {
                            cb.checked = true;
                        }
                    });
                    
                    updateTotalBIScore('soapBiTotalScore', '#soap-bi-form-inner'); // อัปเดตคะแนนรวม
                }
                Swal.close();
            }).withFailureHandler(showError).getBIAssessmentByVisit(soapRecord.PatientID, soapRecord.VisitCount);
            
        } else {
            showError(soapRes);
        }
    }).withFailureHandler(showError).getSOAPNoteById(recordId);
}

function createSoapObjectiveHtml(containerId) {
    document.getElementById(containerId).innerHTML = `
        <div class="form-check"><input class="form-check-input" type="checkbox" name="Objective_QualityMovement_Check"><label class="form-check-label fw-bold">Quality of movement</label></div>
        <div class="ps-4 mt-1">${createQualityMovementHtml()}</div>
        <div class="form-check mt-2"><input class="form-check-input" type="checkbox" name="Objective_Other_Check"><label class="form-check-label fw-bold">Other</label></div>
        <div class="ps-4 mt-1"><textarea name="Objective_Other_Details" class="form-control form-control-sm"></textarea></div>`;
}

/**
 * (ฟังก์ชันใหม่ที่ขาดหายไป)
 * สร้าง HTML สำหรับส่วน Treatment ภายใน SOAP Note
 */
function createSoapTreatmentSectionHtml() {
    const timeOptions = [10, 15, 20, 25, 30, 35, 40, 45].map(t => `<option value="${t}">${t}</option>`).join('');
    const treatments = [
        { id: 'QualityMove', label: 'Quality move. train', details: ['RT UE', 'RT LE', 'LT UE', 'LT LE'] },
        { id: 'BedMobility', label: 'Bed mobility train', details: ['Move up', 'Move down', 'Move RT', 'Move LT', 'Side lying', 'Side lying to sitting'] },
        { id: 'Balance', label: 'Balance train', details: ['Sitting : static', 'Sitting : dynamic', 'Standing : static', 'Standing : dynamic'] },
        { id: 'Gait', label: 'Gait trainig', details: ['walking with gait aids', 'Adjust pattern'] },
        { id: 'Other', label: 'Other', details: ['Chest PT', 'Pumping exs.', 'Sit to stand', 'Positioning', 'Incentive spiro', 'Breathing exs.', 'Prolong stretching', 'PNF D1F/D1E'] }
    ];
    
    let treatmentHtml = treatments.map(treat => `
    <div class="border-bottom py-2">
        <div class="row g-2 align-items-center">
            <div class="col-sm-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="Treatment_Check" value="${treat.id}" id="treat_check_${treat.id}"><label class="form-check-label fw-bold" for="treat_check_${treat.id}">${treat.label}</label></div></div>
            <div class="col-sm-6"><div class="input-group input-group-sm"><label class="input-group-text">เวลา</label><select name="Treatment_Time_${treat.id}" class="form-select"><option value="">-</option>${timeOptions}</select><span class="input-group-text">นาที</span></div></div>

            <div class="col-12 ps-4">
                ${treat.details.map(d => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="Treatment_Detail_${treat.id}" value="${d}"><label class="form-check-label small">${d}</label></div>`).join('')}
                ${treat.id === 'Other' ? `
                    <div class="form-check form-check-inline align-middle">
                        <input class="form-check-input" type="checkbox" name="Treatment_Detail_Other_Checkbox" value="อื่นๆ">
                        <label class="form-check-label small">อื่นๆ:</label>
                    </div>
                    <input type="text" name="Treatment_Detail_Other_Custom" class="form-control form-control-sm d-inline-block" style="width: auto;" placeholder="ระบุ...">
                ` : ''}
            </div>
            </div>
    </div>`).join('');

    // Add Ambulation section
    treatmentHtml += `
        <div class="border-bottom py-2 mt-3">
            <label class="fw-bold">Ambulation</label>
            <div class="ps-4">
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="NWB" class="form-check-input"><label>NWB</label></div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="PWB" class="form-check-input"><label>PWB</label><input type="text" name="Ambulation_PWB_Percent" class="form-control form-control-sm d-inline ms-1" style="width: 60px;"> %</div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="FWB" class="form-check-input"><label>FWB</label></div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="WC" class="form-check-input"><label>W/C</label></div>
            </div>
        </div>`;
        
    return treatmentHtml;
}

/**
 * Creates the HTML for the Treatment section specifically for the SOAP Note form.
 * @returns {string} The HTML string for the treatment section.
 */
function createSoapTreatmentSectionHtml() {
    const timeOptions = [10, 15, 20, 25, 30, 35, 40, 45].map(t => `<option value="${t}">${t}</option>`).join('');
    const treatments = [
        { id: 'QualityMove', label: 'Quality move. train', details: ['RT UE', 'RT LE', 'LT UE', 'LT LE'] },
        { id: 'BedMobility', label: 'Bed mobility train', details: ['Move up', 'Move down', 'Move RT', 'Move LT', 'Side lying', 'Side lying to sitting'] },
        { id: 'Balance', label: 'Balance train', details: ['Sitting : static', 'Sitting : dynamic', 'Standing : static', 'Standing : dynamic'] },
        { id: 'Gait', label: 'Gait trainig', details: ['walking with gait aids', 'Adjust pattern'] },
        { id: 'Other', label: 'Other', details: ['Chest PT', 'Pumping exs.', 'Sit to stand', 'Positioning', 'Incentive spiro', 'Breathing exs.', 'Prolong stretching', 'PNF D1F/D1E'] }
    ];
    
    let treatmentHtml = treatments.map(treat => `
    <div class="border-bottom py-2">
        <div class="row g-2 align-items-center">
            <div class="col-sm-6"><div class="form-check"><input class="form-check-input" type="checkbox" name="Treatment_Check" value="${treat.id}" id="treat_check_${treat.id}"><label class="form-check-label fw-bold" for="treat_check_${treat.id}">${treat.label}</label></div></div>
            <div class="col-sm-6"><div class="input-group input-group-sm"><label class="input-group-text">เวลา</label><select name="Treatment_Time_${treat.id}" class="form-select"><option value="">-</option>${timeOptions}</select><span class="input-group-text">นาที</span></div></div>

            <div class="col-12 ps-4">
                ${treat.details.map(d => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="Treatment_Detail_${treat.id}" value="${d}"><label class="form-check-label small">${d}</label></div>`).join('')}
                ${treat.id === 'Other' ? `
                    <div class="form-check form-check-inline align-middle">
                        <input class="form-check-input" type="checkbox" name="Treatment_Detail_Other_Checkbox" value="อื่นๆ">
                        <label class="form-check-label small">อื่นๆ:</label>
                    </div>
                    <input type="text" name="Treatment_Detail_Other_Custom" class="form-control form-control-sm d-inline-block" style="width: auto;" placeholder="ระบุ...">
                ` : ''}
            </div>
            </div>
    </div>`).join('');

    // Add Ambulation section
    treatmentHtml += `
        <div class="border-bottom py-2 mt-3">
            <label class="fw-bold">Ambulation</label>
            <div class="ps-4">
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="NWB" class="form-check-input"><label>NWB</label></div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="PWB" class="form-check-input"><label>PWB</label><input type="text" name="Ambulation_PWB_Percent" class="form-control form-control-sm d-inline ms-1" style="width: 60px;"> %</div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="FWB" class="form-check-input"><label>FWB</label></div>
                <div class="form-check form-check-inline"><input type="radio" name="Ambulation" value="WC" class="form-check-input"><label>W/C</label></div>
            </div>
        </div>`;
        
    return treatmentHtml;
}

function populateSoapForm(record) {
    const form = document.getElementById('soap-note-form');
    // 1. เติมข้อมูล Input ทั่วไป
    for (const key in record) {
        const el = form.querySelector(`[name="${key}"]`);
        if (el) {
             if (el.type === 'date' && record[key]) {
                // --- START: แก้ไขเรื่อง Timezone ---
                const date = new Date(record[key]);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                el.value = `${year}-${month}-${day}`;
                // --- END: สิ้นสุดการแก้ไข ---
             } else if (el.type === 'checkbox') {
                el.checked = record[key] === true || record[key] === 'true' || record[key] === 'TRUE' || record[key] === 1 || record[key] === '1' || record[key] === 'on';
             } else if (el.type === 'radio') {
                const radioEl = form.querySelector(`input[name="${key}"][value="${record[key]}"]`);
                if (radioEl) radioEl.checked = true;
             } else {
                el.value = record[key];
             }
        }
    }

    // จัดการเวลาให้ถูกต้อง
    const formatTime = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    form.querySelector('[name="StartTime"]').value = formatTime(record.StartTime);
    form.querySelector('[name="EndTime"]').value = formatTime(record.EndTime);

    try {
        // 2. เติมข้อมูล Checkbox Groups
        populateCheckboxGroup('soap-diagnosis-container', 'Diagnosis', JSON.parse(record.DiagnosisJSON || '[]'));
        populateCheckboxGroup('soap-plan-container', 'Plan', record.Plan);

        // 3. เติมข้อมูล Objective และอื่นๆ (ส่วนที่เหลือของฟังก์ชัน)
        const objective = JSON.parse(record.ObjectiveJSON || '{}');
        if (objective.QualityMovement_Check) form.querySelector('[name="Objective_QualityMovement_Check"]').checked = true;
        if (objective.Other_Check) form.querySelector('[name="Objective_Other_Check"]').checked = true;
        if (objective.Other_Details) form.querySelector('[name="Objective_Other_Details"]').value = objective.Other_Details;
        if (objective.QualityMovement) {
            const qm = objective.QualityMovement;
            if(qm.UE) {
                form.querySelector('[name="QM_UE_Rt"]').value = qm.UE.Rt || '';
                form.querySelector('[name="QM_UE_Lt"]').value = qm.UE.Lt || '';
            }
            if(qm.LE) {
                form.querySelector('[name="QM_LE_Rt"]').value = qm.LE.Rt || '';
                form.querySelector('[name="QM_LE_Lt"]').value = qm.LE.Lt || '';
            }
        }

        const treatment = JSON.parse(record.TreatmentJSON || '{}');
        populateTreatmentForm(JSON.stringify(treatment)); 
        if(treatment.Ambulation) {
            const amb = treatment.Ambulation;
            const ambRadio = form.querySelector(`input[name="Ambulation"][value="${amb.Status}"]`);
            if(ambRadio) ambRadio.checked = true;
            if(amb.Status === 'PWB') form.querySelector(`[name="Ambulation_PWB_Percent"]`).value = amb.PWB_Percent || '';
        }

    } catch (e) { console.error("Error populating SOAP form:", e); }
}


// =================================================================
// 13. SCHEDULE VIEW & MODAL (UPDATED)
// =================================================================
let draggedItem = null;

function renderDailyScheduleList(dateString) {
    const listContainer = document.getElementById('daily-schedule-list');
    if (!listContainer) return;

    // 1. กรองนัดหมาย: เอาเฉพาะนัดวันนี้ และยังไม่ได้บันทึกเอกสาร (actualVisits)
    let pendingSchedules = allScheduleData.filter(s => {
        if (!s.ScheduledDate) return false;
        // รองรับทั้ง ISO String และรูปแบบอื่นที่อาจมาจาก Server
        const sDate = s.ScheduledDate.substring(0, 10);
        if (sDate !== dateString) return false;
        
        // ตัดนัดที่ Status ใน Sheet เป็น Completed ออกก่อน
        if (s.Status === 'Completed') return false;

        const p = allPatients.find(pat => String(pat.PatientID) === String(s.PatientID));
        // กรองออกถ้าตรวจพบว่ามีวันที่บันทึกงาน (actualVisits) ตรงกับวันนี้แล้ว
        if (p && p.actualVisits && p.actualVisits.includes(dateString)) return false; 
        
        return true;
    });

    // 2. เรียงลำดับตาม QueueIndex ที่บันทึกไว้ในระบบ
    pendingSchedules.sort((a, b) => (parseInt(a.QueueIndex) || 999) - (parseInt(b.QueueIndex) || 999));

    const totalToday = allScheduleData.filter(s => s.ScheduledDate && s.ScheduledDate.substring(0, 10) === dateString).length;
    const completedCount = totalToday - pendingSchedules.length;
    const getScheduleZone = (schedule, patient) => schedule.ScheduleZone || schedule.Zone || patient?.Zone || 'ไม่ระบุโซน';

    // 3. จัดกลุ่มตามโซนพื้นที่ (Zones)
    const schedulesByZone = pendingSchedules.reduce((groups, s) => {
        const p = allPatients.find(pat => String(pat.PatientID) === String(s.PatientID));
        if (p) {
            const zone = getScheduleZone(s, p);
            if (!groups[zone]) groups[zone] = [];
            groups[zone].push({ schedule: s, patient: p });
        }
        return groups;
    }, {});

    // 4. สร้าง HTML ส่วนหัว
    let html = `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4 flex justify-between items-center">
            <div>
                <h5 class="font-bold text-gray-800 m-0 flex items-center">
                    <i class="bi bi-calendar-check-fill text-teal-600 mr-2"></i>
                    ${typeof formatThaiDate === 'function' ? formatThaiDate(dateString) : dateString}
                </h5>
                <p class="text-sm text-gray-500 mt-1">
                    นัดหมายทั้งหมด <span class="font-bold text-gray-800">${totalToday}</span> คน / 
                    เยี่ยมสำเร็จแล้ว <span class="font-bold text-green-600">${completedCount}</span> คน
                </p>
                <div id="save-order-status" class="text-[10px] mt-1 h-4"></div>
            </div>
        </div>
        <div id="schedule-zones-container" class="space-y-6 pb-20">
    `;

    if (pendingSchedules.length === 0) {
        html += `<div class="text-center py-10 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">เยี่ยมครบทุกคนแล้ว หรือไม่มีรายการนัดหมายในวันนี้</div>`;
    } else {
        let globalQueueIndex = 1; 
        Object.keys(schedulesByZone).forEach(zone => {
            html += `
                <div class="zone-group">
                    <div class="bg-teal-50/50 border-l-4 border-teal-500 px-3 py-2 mb-3 rounded-r-lg flex justify-between items-center">
                        <h6 class="font-bold text-teal-800 m-0 text-base">${zone}</h6>
                        <span class="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">${schedulesByZone[zone].length} รายการ</span>
                    </div>
                    <div class="space-y-3 zone-list" data-zone="${zone}">
            `;

            schedulesByZone[zone].forEach(item => {
                const { schedule, patient } = item;
                const displayAddress = patient.FullAddress || patient.ShortAddress || patient.Address || '-';
                // ดึงวันที่ครบกำหนด (DueDate) มาแสดงผล
                const dayEndDisplay = patient.DayEnd ? (typeof formatThaiDate === 'function' ? formatThaiDate(patient.DayEnd.split('T')[0]) : patient.DayEnd.split('T')[0]) : '-';

                html += `
                    <div class="schedule-item bg-white border border-slate-100 rounded-xl p-4 shadow-sm relative group hover:shadow-md transition-shadow"
                         data-patient-id="${patient.PatientID}" 
                         data-visit-number="${schedule.VisitNumber}"
                         data-zone="${zone}">
                        
                        <div class="drag-handle absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-teal-600 hover:bg-teal-50 rounded-l-xl transition-colors">
                            <i class="bi bi-grip-vertical text-2xl"></i>
                        </div>

                        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pl-8">
                            <div class="flex-grow">
                                <div class="flex items-center gap-2 mb-1">
                                    <h5 class="font-bold text-gray-800 text-lg m-0">${patient.PatientName}</h5>
                                    <span class="text-gray-400 text-sm">(CN: ${patient.ClinicNumber})</span>
                                </div>

                                <div class="flex flex-wrap gap-2 mb-2 text-[11px]">
                                    <span class="bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200"><i class="bi bi-person-vcard mr-1"></i>CID: ${patient.NationalID || '-'}</span>
                                    <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100"><i class="bi bi-telephone-fill mr-1"></i>${patient.Phone || '-'}</span>
                                    <span class="bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100"><i class="bi bi-calendar-check-fill mr-1"></i>ครบกำหนด: ${dayEndDisplay}</span>
                                </div>
                                
                                <div class="text-sm text-gray-600 mb-2 flex items-center">
                                    <span class="font-semibold text-teal-600">นัดครั้งที่: ${patient.scheduleInfo ? patient.scheduleInfo.completed + 1 : schedule.VisitNumber}</span>
                                    <span class="mx-2 text-gray-300">|</span>
                                    <span class="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-bold shadow-sm">BI ล่าสุด: ${patient.LatestBI !== undefined ? patient.LatestBI : '-'}</span>
                                </div>

                                <div class="text-xs text-gray-500">
                                    <i class="bi bi-geo-alt-fill text-red-400 mr-1"></i>${displayAddress}
                                </div>
                            </div>

                            <div class="flex flex-col items-end gap-2 w-full md:w-auto">
                                <span class="text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">ลำดับคิว <span class="queue-number font-bold text-gray-800">${globalQueueIndex++}</span></span>
                                <button onclick="goToServiceFromSchedule('${patient.PatientID}')" 
                                        class="btn btn-primary btn-sm w-full md:w-auto px-4 shadow-sm hover:scale-105 transition-transform">
                                    <i class="bi bi-play-circle-fill mr-1"></i> เข้ารับบริการ
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div></div>`;
        });
    }

    html += '</div>';
    listContainer.innerHTML = html;

    // 5. เปิดการทำงานของ SortableJS (ใส่ดีเลย์เล็กน้อยเพื่อให้ DOM เรนเดอร์เสร็จ)
    setTimeout(() => {
        const zoneLists = document.querySelectorAll('.zone-list');
        zoneLists.forEach(el => {
            new Sortable(el, {
                group: 'shared', 
                handle: '.drag-handle',
                animation: 200,
                ghostClass: 'bg-teal-50',
                chosenClass: 'shadow-lg',
                onEnd: function () {
                    const statusDiv = document.getElementById('save-order-status');
                    statusDiv.innerHTML = '<span class="text-orange-500"><i class="bi bi-arrow-repeat animate-spin"></i> กำลังบันทึกลำดับคิว...</span>';
                    
                    const allItems = document.querySelectorAll('.schedule-item');
                    const updates = [];
                    
                    allItems.forEach((item, index) => {
                        // อัปเดตตัวเลขลำดับในหน้าจอทันที
                        const queueNumSpan = item.querySelector('.queue-number');
                        if (queueNumSpan) queueNumSpan.textContent = index + 1;
                        const zone = item.closest('.zone-list')?.getAttribute('data-zone') || item.getAttribute('data-zone') || '';
                        item.setAttribute('data-zone', zone);
                        
                        updates.push({
                            patientId: item.getAttribute('data-patient-id'),
                            visitNumber: item.getAttribute('data-visit-number'),
                            queueIndex: index + 1,
                            zone
                        });
                    });

                    // บันทึกลำดับกลับไปยัง Google Sheet
                    google.script.run
                        .withSuccessHandler(response => {
                            if (!response || response.status !== 'success') {
                                statusDiv.innerHTML = '<span class="text-red-500">บันทึกลำดับล้มเหลว: ' + (response?.message || 'ไม่สามารถบันทึกข้อมูลได้') + '</span>';
                                return;
                            }
                            updates.forEach(update => {
                                const scheduleRecord = allScheduleData.find(schedule => String(schedule.PatientID) === String(update.patientId) && String(schedule.VisitNumber) === String(update.visitNumber));
                                if (scheduleRecord) {
                                    scheduleRecord.QueueIndex = update.queueIndex;
                                    scheduleRecord.ScheduleZone = update.zone;
                                }
                            });
                            statusDiv.innerHTML = '<span class="text-green-600"><i class="bi bi-check-circle-fill"></i> บันทึกลำดับคิวสำเร็จ</span>';
                            setTimeout(() => { statusDiv.innerHTML = ''; }, 3000);
                        })
                        .withFailureHandler(err => {
                            statusDiv.innerHTML = '<span class="text-red-500">บันทึกลำดับล้มเหลว: ' + err.message + '</span>';
                        })
                        .saveScheduleOrder(updates);
                }
            });
        });
    }, 150);
}

// --- Updated Drag & Drop Logic (รองรับการลากภายใน Zone) ---

function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    draggedItem = ev.target.closest('.schedule-item');
    ev.dataTransfer.effectAllowed = "move";
    // เพิ่ม visual feedback
    setTimeout(() => draggedItem.classList.add('opacity-50', 'bg-gray-50'), 0);
}

function drop(ev) {
    ev.preventDefault();
    if (draggedItem) {
        draggedItem.classList.remove('opacity-50', 'bg-gray-50');
    }
    
    // หาโซนที่กำลังวาง (Drop Zone)
    const dropZoneList = ev.target.closest('.zone-list');
    
    // ถ้าไม่ได้วางในโซนลิสต์ หรือวางในโซนอื่น (Optional: ถ้าต้องการห้ามข้ามโซน)
    if (!dropZoneList) return;

    // หาเป้าหมายที่จะวาง (Target Item)
    const targetItem = ev.target.closest('.schedule-item');
    
    // ตรวจสอบว่า targetItem อยู่ใน dropZoneList เดียวกันหรือไม่ (เพื่อให้แน่ใจว่าลากในโซน)
    if (targetItem && dropZoneList.contains(targetItem) && draggedItem !== targetItem) {
        
        const allItems = [...dropZoneList.querySelectorAll('.schedule-item')];
        const dragIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(targetItem);

        if (dragIndex < targetIndex) {
            targetItem.after(draggedItem);
        } else {
            targetItem.before(draggedItem);
        }
        
        // อัปเดตเลขคิวใหม่ทั้งหมด (Global Update)
        updateListNumbers();
    } else if (!targetItem && dropZoneList) {
        // กรณีวางในพื้นที่ว่างของโซน (ต่อท้าย)
        dropZoneList.appendChild(draggedItem);
        updateListNumbers();
    }
}

function updateListNumbers() {
    let index = 1;
    // วนลูปหา .queue-number ทั้งหมดในหน้าแล้วรันเลขใหม่
    document.querySelectorAll('.queue-number').forEach(el => {
        el.textContent = index++;
    });
}

// =================================================================
// SCHEDULE MODAL
// =================================================================

/**
 * Opens the modal to set or edit the 10 visit dates for a patient.
 * @param {string} patientId - The ID of the patient.
 */
function openScheduleModal(patientId) {
    currentPatient = allPatients.find(p => p.PatientID === patientId);
    if (!currentPatient) return;
    
    showLoading('กำลังโหลดข้อมูลนัด...');
    document.getElementById('schedulePatientId').value = patientId;
    document.getElementById('schedulePatientName').textContent = currentPatient.PatientName;
    
    const dueDateEl = document.getElementById('scheduleDueDate');
    if(dueDateEl) dueDateEl.textContent = formatThaiDate(currentPatient.DueDate || new Date());

    google.script.run.withSuccessHandler(response => {
        if (response.status === 'success') {
            const container = document.getElementById('schedule-date-inputs');
            container.innerHTML = ''; 
            const records = response.records || [];
            
            let nextVisitNum = 1;
            if (records.length > 0) {
                nextVisitNum = Math.max(...records.map(r => Number(r.VisitNumber))) + 1;
            }

            // --- ส่วนที่แก้ไข: เปลี่ยนหัวข้อ และเพิ่มปุ่มลบ ---
            let listHtml = `<div class="mb-4"><h6 class="text-sm font-bold text-gray-700 mb-2">รายการนัดหมาย (${records.length})</h6><div class="space-y-2 max-h-[200px] overflow-y-auto pr-1">`;
            
            if (records.length === 0) {
                listHtml += `<div class="text-center text-gray-400 text-sm py-2 bg-gray-50 rounded">ยังไม่มีรายการนัดหมาย</div>`;
            } else {
                records.sort((a,b) => a.VisitNumber - b.VisitNumber);
                records.forEach(r => {
                    const dateVal = r.ScheduledDate ? new Date(r.ScheduledDate).toISOString().split('T')[0] : '';
                    const isCompleted = r.Status === 'Completed';
                    const displayDate = formatThaiDate(r.ScheduledDate);
                    
                    listHtml += `
                    <div class="flex items-center justify-between bg-white border border-gray-200 p-2 rounded text-sm group">
                        <div class="flex items-center gap-2">
                            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-medium">#${r.VisitNumber}</span>
                            <span class="${isCompleted ? 'text-green-600 line-through' : 'text-gray-800'}">${displayDate}</span>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            ${isCompleted 
                                ? '<span class="text-green-600 text-xs flex items-center"><i class="bi bi-check-circle-fill mr-1"></i>เยี่ยมแล้ว</span>' 
                                : `
                                <input type="date" class="form-control form-control-sm w-32 schedule-existing-input" value="${dateVal}" data-visit="${r.VisitNumber}">
                                <button onclick="deleteScheduleItem('${patientId}', ${r.VisitNumber})" class="text-gray-400 hover:text-red-500 transition px-1" title="ลบรายการ">
                                    <i class="bi bi-trash"></i>
                                </button>
                                `
                            }
                        </div>
                    </div>`;
                });
            }
            listHtml += `</div></div>`;

            // --- ส่วนที่แก้ไข: เปลี่ยนข้อความหัวข้อเพิ่มนัด ---
            const addHtml = `
                <div class="bg-teal-50 p-3 rounded-lg border border-teal-100">
                    <label class="block text-teal-800 text-sm font-bold mb-2">
                        <i class="bi bi-calendar-plus-fill mr-1"></i> นัดหมายครั้งถัดไป (ครั้งที่ ${nextVisitNum})
                    </label>
                    <div class="flex gap-2">
                        <input type="date" id="new-schedule-date" class="form-control text-sm border-teal-200 focus:ring-teal-500 focus:border-teal-500">
                        <input type="hidden" id="new-visit-number" value="${nextVisitNum}">
                    </div>
                </div>
            `;

            container.innerHTML = listHtml + addHtml;
            scheduleModal.show();
            Swal.close();
        } else {
            showError(response);
        }
    }).getSchedulesByPatientId(patientId);
}
// ฟังก์ชันลบรายการนัดหมาย
function deleteScheduleItem(patientId, visitNumber) {
    Swal.fire({
        title: 'ลบรายการนัด?',
        text: `ต้องการลบนัดหมายครั้งที่ ${visitNumber} ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading('กำลังลบ...');
            google.script.run.withSuccessHandler(res => {
                if(res.status === 'success') {
                    openScheduleModal(patientId); // รีโหลด Modal
                    // รีโหลดข้อมูลตารางนัด Global ด้วย
                    google.script.run.withSuccessHandler(data => { 
                         allScheduleData = data.schedules.records; 
                         allPatients = data.patients;
                         filterPatients(); // รีโหลดหน้าทะเบียน
                    }).getInitialData();
                } else {
                    showError(res);
                }
            }).deleteSchedule(patientId, visitNumber);
        }
    });
}
/**
 * Gathers the dates from the schedule modal and saves them.
 */
function handleSaveSchedules() {
    const patientId = document.getElementById('schedulePatientId').value;
    
    // เตรียม Array สำหรับส่งไป GAS (Sparse Array: index = visitNum-1)
    const dates = [];

    // 1. เก็บค่าจากการแก้ไขรายการเดิม (เฉพาะที่ยังไม่ Completed และมีการแก้ไข)
    document.querySelectorAll('.schedule-existing-input').forEach(input => {
        if (!input.disabled && input.value) {
            const vNum = parseInt(input.dataset.visit);
            dates[vNum - 1] = input.value;
        }
    });

    // 2. เก็บค่าจากการเพิ่มรายการใหม่
    const newDateInput = document.getElementById('new-schedule-date');
    const newVisitNumInput = document.getElementById('new-visit-number');
    
    if (newDateInput && newDateInput.value) {
        const newVNum = parseInt(newVisitNumInput.value);
        dates[newVNum - 1] = newDateInput.value;
    }

    // เช็คว่ามีการเปลี่ยนแปลงหรือไม่
    // (Array.keys() check is a bit tricky with sparse arrays, easiest is checking filtered length or just sending)
    const hasData = dates.some(d => d !== undefined);
    
    if (!hasData) {
        Swal.fire('ไม่ได้ระบุวันที่', 'กรุณาเลือกวันที่ต้องการนัดหมาย', 'warning');
        return;
    }

    showLoading('กำลังบันทึกนัดหมาย...');
    
    // ส่งไปที่ Google Apps Script
    google.script.run.withSuccessHandler(() => {
        showSuccessToast('บันทึกการนัดหมายเรียบร้อย');
        scheduleModal.hide();
        
        // Refresh ข้อมูลในตาราง
        google.script.run.withSuccessHandler(data => {
            // อัปเดตข้อมูล Global
            allPatients = data.patients || []; 
            // อัปเดตตาราง
            filterPatients(); 
        }).getInitialData(); // หรือใช้ฟังก์ชันย่อยถ้ามี เพื่อความเร็ว
        
    }).withFailureHandler(showError).saveSchedules({ patientId, dates });
}
// =================================================================
// AUTHENTICATION UI FUNCTIONS
// =================================================================

function showLoginView(e) {
  if(e) e.preventDefault();
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('register-view').style.display = 'none';
  document.getElementById('register-form').reset();
}

function showRegisterView(e) {
  if(e) e.preventDefault();
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('register-view').style.display = 'block';
  document.getElementById('login-form').reset();
}

function handleRegistrationSubmit(e) {
  e.preventDefault();

  // --- START: แก้ไขโค้ดส่วนนี้ ---
  // ใช้ .trim() เพื่อลบช่องว่างหน้า-หลัง ออกจากข้อมูลก่อนนำไปใช้
  const fullName = document.getElementById('register-fullname').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value; // รหัสผ่านไม่ต้อง trim
  // --- END: สิ้นสุดการแก้ไข ---

  if (!fullName || !email || !username || !password) {
    showError({ message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    return;
  }
  showLoading('กำลังสมัครสมาชิก...');

  const userInfo = { fullName, email, username, password };
  google.script.run
    .withSuccessHandler(response => {
      if (response.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'สมัครสำเร็จ!',
          text: 'กรุณาตรวจสอบอีเมลของคุณเพื่อทำการยืนยันบัญชี',
          confirmButtonText: 'ตกลง'
        }).then(() => {
          showLoginView(); // กลับไปหน้า Login หลังสมัครสำเร็จ
        });
      } else {
        showError(response);
      }
    })
    .withFailureHandler(showError)
    .registerUser(userInfo);
}
function handleLoginSubmit(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    
    // Safety check ป้องกัน error ถ้ายงโหลดหน้าไม่เสร็จ
    if(!usernameInput || !passwordInput) return;

    const username = usernameInput.value;
    const password = passwordInput.value;

    showLoading('กำลังเข้าสู่ระบบ...');

    google.script.run
        .withSuccessHandler(response => {
            if (response.status === 'success') {
                Swal.close();

                openMainAppForUser(response.user);

            } else {
                showError(response);
            }
        })
        .withFailureHandler(showError)
        .loginUser({ username, password });
}
/**
 * Handles user logout.
 */
/**
 * Handles user logout.
 */
function logout() {
    // 1. ถามยืนยันก่อนออก (Optional: ถ้าไม่ต้องการ Pop-up ลบส่วน Swal.fire นี้ออกได้เลยครับ)
    Swal.fire({
        title: 'ออกจากระบบ',
        text: "คุณต้องการออกจากระบบหรือไม่?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0d9488', // สี teal
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            performLogout();
        }
    });
}

// ฟังก์ชันทำงานจริง (แยกออกมาเพื่อให้เรียกใช้ได้ง่าย)
function performLogout() {
    // 1. ล้างสถานะผู้ใช้
    loggedInUser = null;
    clearLoginSession();

    // 2. สลับหน้าจอ: ซ่อน App หลัก -> แสดงหน้า Login
    const mainApp = document.getElementById('main-app');
    const authContainer = document.getElementById('auth-container');

    if (mainApp) {
        mainApp.style.display = 'none';
    }

    if (authContainer) {
        // ล้าง style="display: none;" ออกเพื่อให้กลับไปใช้ CSS ตั้งต้น (ซึ่งน่าจะเป็น flex หรือ block)
        authContainer.style.removeProperty('display');
        
        // กันเหนียว: ถ้า CSS ตั้งต้นมองไม่เห็น ให้บังคับแสดงผล
        if (window.getComputedStyle(authContainer).display === 'none') {
            authContainer.style.display = 'flex'; 
        }
    }

    // 3. ล้างช่องกรอกข้อมูลในหน้า Login
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    
    // 4. (เพิ่มเติม) ล้างข้อมูล Global อื่นๆ เพื่อความปลอดภัย (Optional)
    currentPatient = null;
    showLoginView();
    // allPatients = []; // ถ้าต้องการให้โหลดใหม่หมดเมื่อ Login ครั้งหน้า ให้เปิดบรรทัดนี้
}

/**
 * Placeholder function for showing the change password modal.
 * (We will implement this in the next step)
 */
function showChangePasswordModal() {
    Swal.fire('เร็วๆ นี้!', 'ฟังก์ชันสำหรับเปลี่ยนรหัสผ่านกำลังอยู่ในระหว่างการพัฒนา', 'info');
    // TODO: Create a modal and form for changing the password.
}
// =================================================================
// PASSWORD RESET FUNCTIONS
// =================================================================

// 1. Modal กรอกอีเมล (เรียกเมื่อกดลิงก์ "ลืมรหัสผ่าน")
function showForgotPasswordModal() {
    Swal.fire({
        title: 'ลืมรหัสผ่าน',
        input: 'email',
        inputLabel: 'กรุณากรอกอีเมลที่ท่านใช้ในระบบ',
        inputPlaceholder: 'example@email.com',
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-send"></i> ส่งลิงก์รีเซ็ต',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0d9488',
        showLoaderOnConfirm: true,
        preConfirm: (email) => {
            return new Promise((resolve, reject) => {
                google.script.run
                    .withSuccessHandler((response) => {
                        if (response.status === 'success') {
                            resolve(response.message);
                        } else {
                            Swal.showValidationMessage(response.message);
                            resolve(false); 
                        }
                    })
                    .withFailureHandler((error) => {
                        Swal.showValidationMessage('เกิดข้อผิดพลาด: ' + error);
                    })
                    .requestPasswordReset(email);
            });
        },
        allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: 'ส่งสำเร็จ!',
                text: result.value, // ข้อความจาก Server
                confirmButtonColor: '#0d9488'
            });
        }
    });
}

// 2. Modal ตั้งค่ารหัสผ่านใหม่ (เรียกเมื่อเปิดจาก Link ในอีเมล)
function showNewPasswordModal(token) {
    Swal.fire({
        title: 'ตั้งค่าบัญชีใหม่',
        html: `
            <div class="text-left mb-3">
                <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้ใหม่ (Username)</label>
                <input id="reset-username" class="swal2-input m-0 w-full" placeholder="ตั้งชื่อผู้ใช้">
            </div>
            <div class="text-left">
                <label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่านใหม่ (Password)</label>
                <input id="reset-password" type="password" class="swal2-input m-0 w-full" placeholder="ตั้งรหัสผ่าน">
            </div>
        `,
        confirmButtonText: 'บันทึกข้อมูล',
        confirmButtonColor: '#0d9488',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            // โฟกัสช่องแรก
            document.getElementById('reset-username').focus();
        },
        preConfirm: () => {
            const newUsername = document.getElementById('reset-username').value;
            const newPassword = document.getElementById('reset-password').value;
            
            if (!newUsername || !newPassword) {
                Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
                return false;
            }
            if (newPassword.length < 4) {
                 Swal.showValidationMessage('รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
                 return false;
            }
            
            return new Promise((resolve) => {
                google.script.run
                    .withSuccessHandler(res => resolve(res))
                    .withFailureHandler(err => {
                        Swal.showValidationMessage(err);
                    })
                    .submitNewPassword(token, newUsername, newPassword);
            });
        }
    }).then((result) => {
        if (result.isConfirmed && result.value.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: 'เรียบร้อย',
                text: 'เปลี่ยนชื่อผู้ใช้และรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่',
                confirmButtonColor: '#0d9488'
            }).then(() => {
                // ล้าง URL ให้กลับไปหน้า Login ปกติ (ลบ query param ทิ้ง)
                window.location.href = window.location.origin + window.location.pathname;
            });
        } else if (result.value && result.value.status === 'error') {
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: result.value.message,
                confirmButtonText: 'กลับหน้าหลัก',
                confirmButtonColor: '#d33'
            }).then(() => {
                window.location.href = window.location.origin + window.location.pathname;
            });
        }
    });
}
function onSaveSuccess() {
    // โหลดข้อมูลเบื้องต้นใหม่เพื่ออัปเดตตัวแปร Global
    google.script.run.withSuccessHandler(function(res) {
        allPatients = res.patients;
        allScheduleData = res.schedules;
        
        const detailView = document.getElementById('patient-detail-view');
        if (currentPatient && detailView && detailView.style.display !== 'none') {
            const latestPatient = allPatients.find(p => p.PatientID === currentPatient.PatientID);
            if (latestPatient) currentPatient = latestPatient;
            currentPatientRecords = null;
            loadPatientDetailRecords(() => { if (getActiveDetailTabId() === 'info-tab') displayPatientMedicalInfo(); });
        }
        
        // 1. วาดปฏิทินใหม่ (อัปเดตสถานะนัดในปฏิทิน)
        renderMonthlyCalendar(currentCalendarDate);
        
        // 2. วาดรายการนัดหมายหน้าแรกใหม่
        const selectedDate = document.getElementById('schedule-date-filter').value;
        if(selectedDate) renderDailyScheduleList(selectedDate);

        // 3. รีเฟรชหน้าสรุปผลการเยี่ยม (ถ้าหน้าจอนี้เปิดอยู่)
        const summaryView = document.getElementById('summary-view');
        if (summaryView && summaryView.style.display !== 'none') {
            const summaryStart = document.getElementById('summary-start-date').value;
            const summaryEnd = document.getElementById('summary-end-date').value;
            if (summaryStart && summaryEnd) {
                renderDailySummary(summaryStart, summaryEnd);
            }
        }
        
        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ',
            text: 'บันทึกข้อมูลและอัปเดตสถานะนัดหมายเรียบร้อยแล้ว',
            timer: 2000,
            showConfirmButton: false
        });
    }).getInitialData();
}
