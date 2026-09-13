// ================================================================
// GEOLOCATION SUPPORT - Android/iOS friendly capture for OPD/SOAP
// ================================================================
(function () {
  const GEO_CACHE_MS = 2 * 60 * 1000;
  const LOW_ACCURACY_TIMEOUT_MS = 8000;
  const HIGH_ACCURACY_TIMEOUT_MS = 12000;

  function getPosition(options) {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) {
        reject(new Error('ระบบต้องเปิดผ่าน HTTPS จึงจะใช้พิกัดได้'));
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getCurrentLocation() {
    try {
      const pos = await getPosition({
        enableHighAccuracy: false,
        timeout: LOW_ACCURACY_TIMEOUT_MS,
        maximumAge: GEO_CACHE_MS
      });
      return normalizePosition(pos, 'balanced');
    } catch (firstError) {
      try {
        const pos = await getPosition({
          enableHighAccuracy: true,
          timeout: HIGH_ACCURACY_TIMEOUT_MS,
          maximumAge: 0
        });
        return normalizePosition(pos, 'high');
      } catch (secondError) {
        const error = secondError || firstError;
        const code = error && error.code;
        let message = 'ไม่สามารถดึงพิกัดได้';
        if (code === 1) message = 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาเปิด Location และอนุญาตเบราว์เซอร์';
        if (code === 2) message = 'ไม่พบตำแหน่งของอุปกรณ์ กรุณาเปิด GPS/Location แล้วลองใหม่';
        if (code === 3) message = 'ค้นหาพิกัดนานเกินกำหนด กรุณาเปิด GPS/Location แล้วลองใหม่';
        throw new Error(message);
      }
    }
  }

  function normalizePosition(position, source) {
    const coords = position.coords;
    return {
      GeoLatitude: Number(coords.latitude),
      GeoLongitude: Number(coords.longitude),
      GeoAccuracy: Number.isFinite(coords.accuracy) ? Number(coords.accuracy) : null,
      GeoLocationTimestamp: new Date(position.timestamp || Date.now()).toISOString(),
      GeoTimestamp: new Date().toISOString(),
      GeoAddress: '',
      GeoSource: source
    };
  }

  async function captureGeoForRecord(record) {
    try {
      const location = await getCurrentLocation();
      Object.assign(record, location);
      return { ok: true, location };
    } catch (error) {
      console.warn('Geolocation unavailable:', error);
      return { ok: false, error };
    }
  }

  window.getCurrentLocationForRecord = getCurrentLocation;
  window.captureGeoForRecord = captureGeoForRecord;

  // Patch data builders first so the existing Supabase adapter receives
  // the captured coordinates without any database schema change.
  const originalGetOpdFormData = window.getOpdFormData;
  if (typeof originalGetOpdFormData === 'function') {
    window.getOpdFormData = function () {
      const data = originalGetOpdFormData();
      if (window.__pendingGeoLocation) Object.assign(data, window.__pendingGeoLocation);
      return data;
    };
  }

  const originalGetSoapFormData = window.getSoapFormData;
  if (typeof originalGetSoapFormData === 'function') {
    window.getSoapFormData = function () {
      const result = originalGetSoapFormData();
      if (window.__pendingGeoLocation) {
        Object.assign(result.soapData, window.__pendingGeoLocation);
      }
      return result;
    };
  }

  function confirmWithoutLocation(message) {
    if (typeof Swal !== 'undefined') {
      return Swal.fire({
        icon: 'warning',
        title: 'ไม่สามารถดึงพิกัดได้',
        text: `${message} ต้องการบันทึกข้อมูลต่อโดยไม่มีพิกัดหรือไม่?`,
        showCancelButton: true,
        confirmButtonText: 'บันทึกต่อ',
        cancelButtonText: 'ยกเลิก'
      });
    }
    return Promise.resolve({ isConfirmed: confirm(`${message}\n\nต้องการบันทึกต่อโดยไม่มีพิกัดหรือไม่?`) });
  }

  // Wrap the existing OPD submit. body-chart-supabase.js remains the
  // actual save layer for Body Chart/signatures; this wrapper only supplies GPS.
  const originalOpdSubmit = window.handleOpdFormSubmit;
  if (typeof originalOpdSubmit === 'function') {
    window.handleOpdFormSubmit = async function (onSuccessCallback) {
      showLoading('กำลังตรวจสอบตำแหน่ง...');
      const geo = await captureGeoForRecord({});
      if (!geo.ok) {
        const proceed = await confirmWithoutLocation(geo.error.message);
        if (!proceed.isConfirmed) return;
        return originalOpdSubmit(onSuccessCallback);
      }

      window.__pendingGeoLocation = geo.location;
      try {
        return await originalOpdSubmit(onSuccessCallback);
      } finally {
        window.__pendingGeoLocation = null;
      }
    };
  }

  // Wrap SOAP submit using the same location strategy.
  const originalSoapSubmit = window.handleSoapNoteSubmit;
  if (typeof originalSoapSubmit === 'function') {
    window.handleSoapNoteSubmit = async function (onSuccessCallback) {
      showLoading('กำลังตรวจสอบตำแหน่ง...');
      const geo = await captureGeoForRecord({});
      if (!geo.ok) {
        const proceed = await confirmWithoutLocation(geo.error.message);
        if (!proceed.isConfirmed) return;
        return originalSoapSubmit(onSuccessCallback);
      }

      window.__pendingGeoLocation = geo.location;
      try {
        return await originalSoapSubmit(onSuccessCallback);
      } finally {
        window.__pendingGeoLocation = null;
      }
    };
  }
})();
