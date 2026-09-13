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
  // The migrated app still uses the legacy logout flow, which only
  // clears local UI state. Explicitly sign out from Supabase Auth first.
  // -------------------------------------------------------------
  async function performSupabaseLogout() {
    try {
      if (window.supabaseClient && window.supabaseClient.auth) {
        const { error } = await window.supabaseClient.auth.signOut({ scope: 'local' });
        if (error) {
          console.warn('Supabase signOut error:', error);
        }
      }
    } catch (error) {
      console.warn('Supabase signOut exception:', error);
    }

    try {
      if (typeof loggedInUser !== 'undefined') loggedInUser = null;
    } catch (_) {}

    try {
      if (typeof clearLoginSession === 'function') {
        clearLoginSession();
      }
    } catch (error) {
      console.warn('clearLoginSession error:', error);
    }

    try {
      if (typeof currentPatient !== 'undefined') currentPatient = null;
      if (typeof allPatients !== 'undefined') allPatients = [];
      if (typeof currentPatientRecords !== 'undefined') currentPatientRecords = null;
    } catch (_) {}

    const mainApp = document.getElementById('main-app');
    const authContainer = document.getElementById('auth-container');

    if (mainApp) mainApp.style.display = 'none';
    if (authContainer) {
      authContainer.style.removeProperty('display');
      if (window.getComputedStyle(authContainer).display === 'none') {
        authContainer.style.display = 'flex';
      }
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

    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // Override the legacy logout implementation after app.js is loaded.
  window.performLogout = performSupabaseLogout;
  window.logout = function (event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (typeof Swal === 'undefined') {
      performSupabaseLogout();
      return false;
    }

    Swal.fire({
      title: 'ออกจากระบบ',
      text: 'คุณต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0d9488',
      cancelButtonColor: '#d33',
      confirmButtonText: 'ใช่, ออกจากระบบ',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        return performSupabaseLogout();
      }
      return null;
    });

    return false;
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  updateInstallButton();
})();