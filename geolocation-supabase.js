// Geolocation capture for OPD / SOAP records.
// Location is captured ONLY when the user explicitly clicks the button.
// No automatic GPS capture on patient/service selection.

(function () {
  'use strict';

  const GEO_FIELDS = ['GeoLatitude','GeoLongitude','GeoAddress','GeoLocationTimestamp','GeoTimestamp'];
  let pendingGeo = null;

  function thaiNow() {
    return new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
  }

  function formatAddress(a) {
    if (!a) return '';
    const house = a.house_number || '';
    const road = a.road || '';
    const sub = a.suburb || a.village || a.town || '';
    const district = a.city_district || a.county || '';
    const province = a.state || a.province || '';
    const postcode = a.postcode || '';
    return [
      house && 'บ้านเลขที่ ' + house,
      road && 'ถ.' + road,
      sub && 'ต.' + sub,
      district && 'อ.' + district,
      province && 'จังหวัด' + province,
      postcode
    ].filter(Boolean).join(' ');
  }

  async function reverseGeocode(lat, lon) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&accept-language=th';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('ไม่สามารถค้นหาที่อยู่จากพิกัดได้');
    const data = await res.json();
    return formatAddress(data.address) || data.display_name || '';
  }

  function getPosition(options) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function captureLocation() {
    let pos;
    try {
      pos = await getPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    } catch (e) {
      pos = await getPosition({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0
      });
    }

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const timestamp = new Date(pos.timestamp || Date.now()).toISOString();
    const address = await reverseGeocode(lat, lon);
    const display = 'พิกัด ' + (address || ('ละติจูด ' + lat.toFixed(6) + ' ลองจิจูด ' + lon.toFixed(6))) +
      ' เวลา ' + thaiNow() + ' น.';

    pendingGeo = {
      GeoLatitude: lat,
      GeoLongitude: lon,
      GeoAddress: address,
      GeoLocationTimestamp: display,
      GeoTimestamp: timestamp
    };
    return pendingGeo;
  }

  function findFormContainer(el) {
    return el?.closest('form,[id*="opd" i],[id*="soap" i],[class*="opd" i],[class*="soap" i]') ||
      el?.parentElement;
  }

  function injectButton(form) {
    if (!form || form.querySelector('[data-geo-capture-button]')) return;
    const isOpd = /opd/i.test(form.id || '') || /opd/i.test(form.className || '') ||
      /OPD/i.test(form.innerText || '');
    const isSoap = /soap/i.test(form.id || '') || /soap/i.test(form.className || '') ||
      /SOAP/i.test(form.innerText || '');
    if (!isOpd && !isSoap) return;

    const wrap = document.createElement('div');
    wrap.setAttribute('data-geo-capture-wrap','true');
    wrap.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #d1d5db;border-radius:10px;background:#f9fafb;';
    wrap.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;">📍 พิกัดประทับเวลา</div>' +
      '<button type="button" data-geo-capture-button class="btn btn-outline-primary">' +
      '📍 บันทึกพิกัดประทับเวลา</button>' +
      '<div data-geo-result style="margin-top:8px;font-size:13px;color:#374151;"></div>';

    const button = wrap.querySelector('button');
    const result = wrap.querySelector('[data-geo-result]');
    button.addEventListener('click', async function () {
      button.disabled = true;
      button.textContent = 'กำลังบันทึกพิกัด...';
      result.textContent = '';
      try {
        const geo = await captureLocation();
        form.__pendingGeo = geo;
        GEO_FIELDS.forEach(k => {
          const input = form.querySelector('[name="' + k + '"],#' + k);
          if (input) input.value = geo[k] ?? '';
        });
        result.textContent = geo.GeoLocationTimestamp;
        result.style.color = '#166534';
        button.textContent = '✓ บันทึกพิกัดแล้ว (กดใหม่เพื่ออัปเดต)';
      } catch (err) {
        result.textContent = 'ไม่สามารถบันทึกพิกัดได้: ' + (err.message || err);
        result.style.color = '#b91c1c';
        button.textContent = '📍 บันทึกพิกัดประทับเวลา';
      } finally {
        button.disabled = false;
      }
    });

    // Put the control at the end of the actual form, not on patient selection.
    form.appendChild(wrap);
  }

  function scan() {
    document.querySelectorAll('form').forEach(injectButton);
  }

  // Do not listen to patient/service selection. Capture only by explicit button click.
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  window.getCurrentLocationForRecord = async function () => pendingGeo ? {...pendingGeo} : null;
  window.captureGeoForRecord = captureLocation;

  // Make pending GPS data available to existing OPD/SOAP save payloads.
  function patchBuilders() {
    ['getOpdFormData','getSOAPFormData','getSoapFormData'].forEach(name => {
      if (typeof window[name] !== 'function' || window[name].__geoPatched) return;
      const original = window[name];
      const wrapped = function () {
        const data = original.apply(this, arguments) || {};
        const geo = this?.__pendingGeo || pendingGeo;
        if (geo) Object.assign(data, geo);
        return data;
      };
      wrapped.__geoPatched = true;
      window[name] = wrapped;
    });
  }
  setInterval(patchBuilders, 500);
})();
