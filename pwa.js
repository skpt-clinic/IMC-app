(function () {
  const installButton = document.getElementById('install-app-btn');
  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function updateInstallButton() {
    if (!installButton) return;
    installButton.classList.toggle('hidden', isStandalone() || !deferredPrompt);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    updateInstallButton();
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
        updateInstallButton();
      }
    });
  }

  // -------------------------------------------------------------
  // Supabase logout fix
  // -------------------------------------------------------------
  async function performSupabaseLogout() {
    try {
      if (window.supabaseClient && window.supabaseClient.auth) {
        const { error } = await window.supabaseClient.auth.signOut({ scope: 'local' });
        if (error) console.warn('Supabase signOut error:', error);
      }
    } catch (error) {
      console.warn('Supabase signOut exception:', error);
    }

    try {
      localStorage.removeItem('skpt_logged_in_user');
    } catch (error) {
      console.warn('Unable to clear login session:', error);
    }

    try {
      if (typeof loggedInUser !== 'undefined') loggedInUser = null;
      if (typeof currentPatient !== 'undefined') currentPatient = null;
      if (typeof allPatients !== 'undefined') allPatients = [];
      if (typeof currentPatientRecords !== 'undefined') currentPatientRecords = null;
    } catch (_) {}

    const mainApp = document.getElementById('main-app');
    const authContainer = document.getElementById('auth-container');
    if (mainApp) mainApp.style.display = 'none';
    if (authContainer) {
      authContainer.style.removeProperty('display');
      if (window.getComputedStyle(authContainer).display === 'none') authContainer.style.display = 'flex';
    }

    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';

    try {
      if (typeof showLoginView === 'function') showLoginView();
    } catch (error) {
      console.warn('showLoginView error:', error);
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  async function authLogout(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof Swal === 'undefined') {
      await performSupabaseLogout();
      return false;
    }
    const result = await Swal.fire({
      title: 'ออกจากระบบ',
      text: 'คุณต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0d9488',
      cancelButtonColor: '#d33',
      confirmButtonText: 'ใช่, ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      reverseButtons: true
    });
    if (result.isConfirmed) await performSupabaseLogout();
    return false;
  }

  window.authLogout = authLogout;
  window.performLogout = performSupabaseLogout;

  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest ? event.target.closest('a, button') : null;
    if (!target) return;
    const text = (target.textContent || '').trim();
    const inlineHandler = target.getAttribute('onclick') || '';
    const isLogout = text === 'ออกจากระบบ' || /logout\s*\(/i.test(inlineHandler);
    if (!isLogout) return;
    event.preventDefault();
    event.stopPropagation();
    authLogout(event);
  }, true);

  window.logout = function (event) {
    return authLogout(event);
  };

  // Load UI overrides after app.js.
  const summaryFixScript = document.createElement('script');
  summaryFixScript.src = './summary-fix.js?v=20260913_2';
  summaryFixScript.async = false;
  document.head.appendChild(summaryFixScript);

  const patientListFixScript = document.createElement('script');
  patientListFixScript.src = './patient-list-fix.js?v=20260913_1';
  patientListFixScript.async = false;
  document.head.appendChild(patientListFixScript);

  const bodyChartSupabaseScript = document.createElement('script');
  bodyChartSupabaseScript.src = './body-chart-supabase.js?v=20260913_1';
  bodyChartSupabaseScript.async = false;
  document.head.appendChild(bodyChartSupabaseScript);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  updateInstallButton();
})();
