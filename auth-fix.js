// Authentication fixes for the Supabase migration.
// Loaded after app.js and pwa.js so the logout handler is unambiguous.
(function () {
  async function authLogout(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const doLogout = async () => {
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
        if (typeof loggedInUser !== 'undefined') loggedInUser = null;
        if (typeof currentPatient !== 'undefined') currentPatient = null;
        if (typeof allPatients !== 'undefined') allPatients = [];
        if (typeof currentPatientRecords !== 'undefined') currentPatientRecords = null;
      } catch (_) {}

      if (typeof showLoginView === 'function') showLoginView();
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };

    if (typeof Swal === 'undefined') {
      await doLogout();
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

    if (result.isConfirmed) {
      await doLogout();
    }

    return false;
  }

  // Use a unique global name so it cannot collide with the legacy function declaration.
  window.authLogout = authLogout;
})();
