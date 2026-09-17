// ============================================================================
// Address dropdown fix
// Loads the complete AddressData table from Supabase in pages instead of the
// default REST limit, then initializes Province -> Amphoe -> Tambon -> Zipcode.
// ============================================================================
(function () {
  'use strict';

  const PAGE_SIZE = 1000;
  let loadedPromise = null;
  let installed = false;

  function clean(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  async function loadAllAddressData() {
    if (loadedPromise) return loadedPromise;
    loadedPromise = (async () => {
      const client = window.supabaseClient;
      if (!client) throw new Error('Supabase client is not available');

      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await client
          .from('AddressData')
          .select('province, amphoe, tambon, zipcode')
          .order('province', { ascending: true })
          .order('amphoe', { ascending: true })
          .order('tambon', { ascending: true })
          .range(from, to);

        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }

      // Keep the same global used by the rest of the application.
      window.allAddressData = rows;
      console.info(`[AddressDropdownFix] Loaded ${rows.length} AddressData records`);
      return rows;
    })().catch(error => {
      loadedPromise = null;
      console.error('[AddressDropdownFix] Failed to load AddressData:', error);
      throw error;
    });
    return loadedPromise;
  }

  function setNativeOptions($select, values, placeholder) {
    const current = clean($select.val());
    $select.empty().append(new Option(placeholder, ''));
    values.forEach(value => $select.append(new Option(value, value)));
    if (current && values.includes(current)) $select.val(current);
    $select.trigger('change.select2');
  }

  async function setupCompleteAddressDropdowns() {
    if (!window.jQuery) throw new Error('jQuery is not available');
    const $ = window.jQuery;
    const $province = $('#Province');
    const $amphoe = $('#Amphoe');
    const $tambon = $('#Tambon');
    const $zipcode = $('#PostalCode');
    if (!$province.length || !$amphoe.length || !$tambon.length || !$zipcode.length) return false;

    const rows = await loadAllAddressData();
    if (!rows.length) return false;

    // Destroy/rebind only this feature's handlers; do not disturb other form events.
    [$province, $amphoe, $tambon].forEach($el => {
      if ($el.hasClass('select2-hidden-accessible')) $el.select2('destroy');
    });

    $province.select2({
      theme: 'bootstrap-5',
      dropdownParent: $('#patientModal'),
      width: '100%',
      placeholder: 'เลือกจังหวัด...'
    });
    $amphoe.select2({
      theme: 'bootstrap-5',
      dropdownParent: $('#patientModal'),
      width: '100%',
      placeholder: 'เลือกอำเภอ...'
    });
    $tambon.select2({
      theme: 'bootstrap-5',
      dropdownParent: $('#patientModal'),
      width: '100%',
      placeholder: 'เลือกตำบล...'
    });

    const provinces = [...new Set(rows.map(r => clean(r.province)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    setNativeOptions($province, provinces, 'เลือกจังหวัด...');
    setNativeOptions($amphoe, [], 'เลือกอำเภอ...');
    setNativeOptions($tambon, [], 'เลือกตำบล...');
    $zipcode.val('');

    $province.off('change.imcAddress').on('change.imcAddress', function () {
      const province = clean($(this).val());
      const amphoes = [...new Set(rows
        .filter(r => clean(r.province) === province)
        .map(r => clean(r.amphoe))
        .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));

      setNativeOptions($amphoe, amphoes, 'เลือกอำเภอ...');
      setNativeOptions($tambon, [], 'เลือกตำบล...');
      $zipcode.val('');
    });

    $amphoe.off('change.imcAddress').on('change.imcAddress', function () {
      const province = clean($province.val());
      const amphoe = clean($(this).val());
      const tambons = [...new Set(rows
        .filter(r => clean(r.province) === province && clean(r.amphoe) === amphoe)
        .map(r => clean(r.tambon))
        .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));

      setNativeOptions($tambon, tambons, 'เลือกตำบล...');
      $zipcode.val('');
    });

    $tambon.off('change.imcAddress').on('change.imcAddress', function () {
      const province = clean($province.val());
      const amphoe = clean($amphoe.val());
      const tambon = clean($(this).val());
      const record = rows.find(r =>
        clean(r.province) === province &&
        clean(r.amphoe) === amphoe &&
        clean(r.tambon) === tambon
      );
      $zipcode.val(record ? clean(record.zipcode) : '');
    });

    installed = true;
    window.__imcAddressDropdownFixInstalled = true;
    console.info(`[AddressDropdownFix] Ready: ${rows.length} records / ${provinces.length} provinces`);
    return true;
  }

  function installWhenReady() {
    if (installed) return;
    if (typeof window.setupAddressDropdowns !== 'function') return;

    // Replace the legacy implementation. It receives allAddressData from
    // getInitialData, but this fixed version deliberately fetches all rows.
    window.setupAddressDropdowns = function () {
      return setupCompleteAddressDropdowns().catch(error => {
        console.error('[AddressDropdownFix] setup failed:', error);
        return false;
      });
    };

    installed = true;
    // setupInitialUI may call the function after this script loads.
    window.setupAddressDropdowns();
  }

  installWhenReady();
  window.addEventListener('imc-views-loaded', installWhenReady);
  setTimeout(installWhenReady, 0);
  setTimeout(installWhenReady, 100);
  setTimeout(installWhenReady, 500);
})();
