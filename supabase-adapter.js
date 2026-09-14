// =================================================================
// SUPABASE CLIENT & BACKEND ADAPTER (Direct replacement for GAS bridge)
// =================================================================
(function() {
  const SUPABASE_URL = "https://jvfivixnmcwsruaktirr.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2Zml2aXhubWN3c3J1YWt0aXJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDkwOTMsImV4cCI6MjEwNDgyNTA5M30.Gml6dYxIp1s_TsBGfP7BWD_w6vH1uU5yXrTT4UcwbX0";

  let client = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase JS SDK not loaded!");
  }
  window.supabaseClient = client;

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  async function computeSha256Base64(str) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hashBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBlob(base64Data) {
    const parts = base64Data.split(';base64,');
    const contentType = parts[0].split(':')[1] || 'image/jpeg';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

  function normalizeImageUrl(url) {
    if (!url) return '';
    const str = String(url).trim();
    if (!str) return '';
    if (str.startsWith('data:image/')) return str;
    
    // Check if it's a Google Drive link and convert to direct CDN URL
    if (str.includes('drive.google.com')) {
      const idMatch = str.match(/id=([a-zA-Z0-9_-]+)/) || str.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
      }
    }
    
    // Check if it's a relative Supabase Storage path
    if (str.startsWith('patient-photos/') || str.startsWith('body-charts/') || str.startsWith('signatures/') || str.startsWith('visit-evidence/')) {
      const parts = str.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      if (client && client.storage) {
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl || str;
      }
    }
    
    return str;
  }

  async function uploadImageToBucket(bucket, path, dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
    try {
      const blob = base64ToBlob(dataUrl);
      const { data, error } = await client.storage
        .from(bucket)
        .upload(path, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });
      if (error) {
        console.warn(`Storage upload to ${bucket} error:`, error);
        return dataUrl;
      }
      const { data: pubData } = client.storage.from(bucket).getPublicUrl(path);
      return pubData?.publicUrl || `${bucket}/${path}`;
    } catch (e) {
      console.warn(`Storage upload exception (${bucket}):`, e);
      return dataUrl;
    }
  }

  async function uploadPatientPhoto(patientId, photoData) {
    if (!photoData || !photoData.startsWith('data:image/')) return photoData;
    try {
      const blob = base64ToBlob(photoData);
      const ext = blob.type.split('/')[1] || 'jpg';
      const fileName = `${patientId}_${Date.now()}.${ext}`;
      const res = await uploadImageToBucket('patient-photos', fileName, photoData);
      return res;
    } catch (e) {
      console.warn("Photo upload exception:", e);
      return photoData;
    }
  }

  function normalizeOpdRecord(row) {
    if (!row) return row;
    const r = { ...row };
    r.BodyChartDrawingUrl = normalizeImageUrl(r.BodyChartDrawingUrl);
    r.BodyChartDrawingBase64 = r.BodyChartDrawingBase64 || r.BodyChartDrawingUrl || '';
    r.TherapistSignatureUrl = normalizeImageUrl(r.TherapistSignatureUrl);
    r.TherapistSignatureBase64 = r.TherapistSignatureBase64 || r.TherapistSignatureUrl || '';
    r.PatientSignatureUrl = normalizeImageUrl(r.PatientSignatureUrl);
    r.PatientSignatureBase64 = r.PatientSignatureBase64 || r.PatientSignatureUrl || '';
    return r;
  }

  function normalizeSoapRecord(row) {
    if (!row) return row;
    const r = { ...row };
    r.TherapistSignatureUrl = normalizeImageUrl(r.TherapistSignatureUrl);
    r.TherapistSignatureBase64 = r.TherapistSignatureBase64 || r.TherapistSignatureUrl || '';
    r.PatientSignatureUrl = normalizeImageUrl(r.PatientSignatureUrl);
    r.PatientSignatureBase64 = r.PatientSignatureBase64 || r.PatientSignatureUrl || '';
    return r;
  }

  function normalizeConsentRecord(row) {
    if (!row) return row;
    const r = { ...row };
    r.ConsenterSignatureUrl = normalizeImageUrl(r.ConsenterSignatureUrl);
    r.ConsenterSignatureBase64 = r.ConsenterSignatureBase64 || r.ConsenterSignatureUrl || '';
    r.WitnessSignatureUrl = normalizeImageUrl(r.WitnessSignatureUrl);
    r.WitnessSignatureBase64 = r.WitnessSignatureBase64 || r.WitnessSignatureUrl || '';
    return r;
  }

  function formatDate(d) {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function checkTrue(val) {
    return val === true || String(val).toUpperCase() === 'TRUE';
  }

  function getCombinedImpairmentText(record) {
    if (!record) return "-";
    const parts = [];
    if (checkTrue(record['BI_impairment_swallowing']) || checkTrue(record['impairment_swallowing'])) parts.push("1.Swallowing");
    if (checkTrue(record['BI_impairment_communicate']) || checkTrue(record['impairment_communicate'])) parts.push("2.Communicate");
    if (checkTrue(record['BI_impairment_mobility']) || checkTrue(record['impairment_mobility'])) parts.push("3.Mobility");
    if (checkTrue(record['BI_impairment_cognitive']) || checkTrue(record['impairment_cognitive'])) parts.push("4.Cognitive/Perception");
    if (checkTrue(record['BI_impairment_bowel']) || checkTrue(record['impairment_bowel'])) parts.push("5.Bowel and Bladder");

    if (checkTrue(record['BI_fx_bathroom']) || checkTrue(record['fx_bathroom'])) parts.push("Fx:เข้าห้องน้ำ");
    if (checkTrue(record['BI_fx_bed']) || checkTrue(record['fx_bed'])) parts.push("Fx:ขึ้นลงจากเตียง");
    if (checkTrue(record['BI_fx_movement']) || checkTrue(record['fx_movement'])) parts.push("Fx:เคลื่อนไหวฯ");
    if (checkTrue(record['BI_fx_stairs']) || checkTrue(record['fx_stairs'])) parts.push("Fx:ขึ้นลงบันได");
    return parts.length > 0 ? parts.join(", ") : "-";
  }

  function getTreatmentRightsDisplay(record) {
    if (!record) return '';
    const rights = String(record.TreatmentRights || '').trim();
    const other = String(record.TreatmentRightsOther || '').trim();
    if (rights === 'อื่นๆ') return other || rights;
    return rights || other || '';
  }

  function processPatientsDetails(patientRows, biRows, opdRows, soapRows, schedRows) {
    // 1. Latest BI map
    const latestBIMap = {};
    (biRows || []).forEach(row => {
      const pid = String(row.PatientID || '').trim();
      const score = row.TotalScore;
      const d = row.AssessmentDate ? new Date(row.AssessmentDate) : new Date(0);
      if (!latestBIMap[pid] || d >= latestBIMap[pid].date) {
        latestBIMap[pid] = { score: score, date: d, record: row };
      }
    });

    // 2. Actual visits map from OPD & SOAP
    const actualVisitsMap = {};
    [opdRows || [], soapRows || []].forEach(records => {
      records.forEach(r => {
        const pid = String(r.PatientID || '').trim();
        const vDate = r.VisitDate || r.Date;
        if (pid && vDate) {
          const dStr = formatDate(vDate);
          if (!actualVisitsMap[pid]) actualVisitsMap[pid] = [];
          if (!actualVisitsMap[pid].includes(dStr)) actualVisitsMap[pid].push(dStr);
        }
      });
    });

    // 3. Schedules
    const today = new Date();
    today.setHours(0,0,0,0);

    return (patientRows || []).map(p => {
      const clone = { ...p };
      const pid = String(clone.PatientID || '').trim();
      clone.actualVisits = actualVisitsMap[pid] || [];

      // Addresses
      const addr = [];
      if (clone.HouseNumber) addr.push(clone.HouseNumber);
      if (clone.Moo) addr.push(`ม.${clone.Moo}`);
      if (clone.Tambon) addr.push(`ต.${clone.Tambon}`);
      clone.ShortAddress = addr.join(' ') || '-';
      clone.Phone = clone.Phone || clone.Telephone || '-';

      const fullAddr = [];
      if (clone.HouseNumber) fullAddr.push(`เลขที่ ${clone.HouseNumber}`);
      if (clone.Moo) fullAddr.push(`ม.${clone.Moo}`);
      if (clone.Tambon) fullAddr.push(`ต.${clone.Tambon}`);
      if (clone.Amphoe) fullAddr.push(`อ.${clone.Amphoe}`);
      if (clone.Province) fullAddr.push(`จ.${clone.Province}`);
      if (clone.PostalCode) fullAddr.push(clone.PostalCode);
      clone.FullAddress = fullAddr.join(' ') || '-';
      clone.TreatmentRightsDisplay = getTreatmentRightsDisplay(clone);

      // Latest BI & Impairments
      clone.LatestBI = latestBIMap[pid] ? latestBIMap[pid].score : (clone.InitialBI || 0);
      if (latestBIMap[pid]) {
        clone.multipleImpairment = getCombinedImpairmentText(latestBIMap[pid].record);
      } else {
        clone.multipleImpairment = "-";
      }

      // NextAppointment
      const patientSchedules = (schedRows || []).filter(r => String(r.PatientID || '').trim() === pid);
      let nextDate = patientSchedules
        .map(r => r.ScheduledDate ? new Date(r.ScheduledDate) : null)
        .filter(d => d && d >= today)
        .filter(d => !clone.actualVisits.includes(formatDate(d)))
        .sort((a, b) => a - b)[0];

      clone.NextAppointment = nextDate ? nextDate.toISOString() : null;
      clone.scheduleInfo = {
        completed: clone.actualVisits.length,
        total: patientSchedules.length
      };
      clone.PatientPhotoURL = normalizeImageUrl(clone.PatientPhotoURL || clone.PatientPhotoUrl);
      clone.PatientPhotoBase64 = clone.PatientPhotoURL || null;

      return clone;
    }).sort((a, b) => String(b.ClinicNumber || '').localeCompare(String(a.ClinicNumber || ''), undefined, { numeric: true }));
  }

  // -------------------------------------------------------------
  // Backend Functions implementation on top of Supabase
  // -------------------------------------------------------------
  const backend = {
    async getInitialData() {
      try {
        const [
          dropRes,
          patientRes,
          biRes,
          opdRes,
          soapRes,
          schedRes,
          settingRes,
          addrRes
        ] = await Promise.all([
          client.from('Dropdowns').select('*'),
          client.from('Patients').select('*'),
          client.from('BIAssessments').select('*'),
          client.from('OPDRecords').select('PatientID, VisitDate, VisitCount'),
          client.from('SOAPNotes').select('PatientID, VisitDate, VisitCount'),
          client.from('Schedules').select('*'),
          client.from('Settings').select('*'),
          client.from('AddressData').select('*')
        ]);

        if (patientRes.error) {
          console.error("Patients query error:", patientRes.error);
          return { error: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง (' + (patientRes.error.message || 'Unauthorized') + ')' };
        }

        const dropdowns = dropRes.data || [];
        const baseTherapists = dropdowns.map(r => r.Therapists).filter(Boolean);
        let therapistList = [...baseTherapists];
        try {
          const { data: uList } = await client.from('Users').select('"FullName", "License"');
          if (uList && Array.isArray(uList)) {
            uList.forEach(u => {
              if (u.FullName) {
                const cleanName = u.FullName.trim();
                const prefixed = cleanName.startsWith('กภ.') ? cleanName : `กภ.${cleanName}`;
                if (!therapistList.includes(prefixed) && !therapistList.includes(cleanName)) {
                  therapistList.push(prefixed);
                }
              }
            });
          }
        } catch (_) {}
        const zoneList = dropdowns.map(r => r.Zone).filter(Boolean);

        // Next CN calculation
        const patients = patientRes.data || [];
        let nextCN = "";
        const currentYearBE = (new Date().getFullYear() + 543).toString().slice(-2);
        const cnList = patients
          .map(p => String(p.ClinicNumber || ''))
          .filter(cn => cn.startsWith(currentYearBE))
          .sort();
        if (cnList.length > 0) {
          const lastCN = cnList[cnList.length - 1];
          const nextNum = parseInt(lastCN.slice(2)) + 1;
          nextCN = currentYearBE + nextNum.toString().padStart(4, '0');
        } else {
          nextCN = currentYearBE + '0001';
        }

        // Settings
        const settings = {};
        (settingRes.data || []).forEach(r => {
          if (r.Settings) settings[r.Settings] = r.Value;
        });
        if (!settings.ClinicLogoURL) settings.ClinicLogoURL = "icon.jpg";
        if (!settings.ClinicName) settings.ClinicName = "สุขกาย IMC Plus";

        const processedPatients = processPatientsDetails(
          patients,
          biRes.data,
          opdRes.data,
          soapRes.data,
          schedRes.data
        );

        return {
          settings,
          therapists: therapistList,
          zones: zoneList,
          nextCN,
          patients: processedPatients,
          addressData: addrRes.data || [],
          schedules: { status: 'success', records: schedRes.data || [] }
        };
      } catch (err) {
        console.error("Error in getInitialData:", err);
        return { error: err.message || String(err) };
      }
    },

    async loginUser(credentials) {
      try {
        const { username, password } = credentials;
        if (!username || !password) {
          throw new Error('กรุณากรอก Username และ Password');
        }

        // 1. Secure Transitional Login RPC (executes server-side in Postgres)
        // Validates credentials securely and provisions/syncs Supabase Auth user
        const { data: res, error: rpcError } = await client.rpc('rpc_transitional_login', {
          p_identifier: username.trim(),
          p_password: password
        });

        if (rpcError) {
          console.error("Transitional login RPC error:", rpcError);
          throw new Error('เกิดข้อผิดพลาดในการตรวจสอบบัญชี กรุณาลองใหม่อีกครั้ง');
        }

        if (!res || res.status !== 'success') {
          throw new Error(res?.message || 'Username หรือ Password ไม่ถูกต้อง');
        }

        // 2. Establish Supabase Auth session (acquires real JWT with role 'authenticated')
        const { data: authData, error: authError } = await client.auth.signInWithPassword({
          email: res.email,
          password: password
        });

        if (authError) {
          console.error("Supabase Auth sign-in failed:", authError);
          throw new Error('ไม่สามารถเข้าสู่ระบบ Authentication ได้ กรุณาลองใหม่อีกครั้ง');
        }

        // 3. Determine user role from app_metadata or Settings table
        let userRole = 'user';
        try {
          const userMetaRole = authData?.user?.app_metadata?.role;
          if (userMetaRole === 'admin') {
            userRole = 'admin';
          } else {
            const { data: setRow } = await client
              .from('Settings')
              .select('Value')
              .eq('Settings', 'AdminUsers')
              .maybeSingle();
            if (setRow && setRow.Value) {
              const admins = setRow.Value.split(',').map(s => s.trim().toLowerCase());
              if (admins.includes(res.username.toLowerCase()) || admins.includes(res.email.toLowerCase())) {
                userRole = 'admin';
              }
            }
          }
        } catch (roleErr) {
          console.warn("Role check notice:", roleErr);
        }

        // 4. Fetch License from Users table
        let userLicense = '';
        try {
          const { data: userRow } = await client
            .from('Users')
            .select('"License"')
            .eq('Username', res.username)
            .maybeSingle();
          if (userRow && userRow.License) userLicense = userRow.License;
        } catch (licErr) {
          console.warn('License fetch notice:', licErr);
        }

        return {
          status: 'success',
          user: {
            fullName: res.fullName || res.username,
            username: res.username,
            email: res.email,
            role: userRole,
            license: userLicense
          }
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async changeOwnPassword(oldPassword, newPassword) {
      try {
        if (!oldPassword || !newPassword) {
          return { status: 'error', message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' };
        }
        if (newPassword.length < 6) {
          return { status: 'error', message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
        }

        // 1. Determine username
        let username = (typeof loggedInUser !== 'undefined' && loggedInUser && loggedInUser.username) ? loggedInUser.username : null;
        if (!username) {
          try {
            const raw = localStorage.getItem('skpt_logged_in_user');
            if (raw) {
              const u = JSON.parse(raw);
              username = u?.username;
            }
          } catch (_) {}
        }

        // 2. Call RPC to update database Users table password hash
        if (username) {
          const { data: rpcRes, error: rpcErr } = await client.rpc('rpc_change_own_password', {
            p_username: username,
            p_old_password: oldPassword,
            p_new_password: newPassword
          });
          if (rpcErr) {
            console.warn('rpc_change_own_password error:', rpcErr);
          } else if (rpcRes) {
            if (rpcRes.status === 'error') {
              return { status: 'error', message: rpcRes.message || 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
            }
          }
        }

        // 3. Also update Supabase Auth if session exists
        try {
          const { data: userData } = await client.auth.getUser();
          if (userData && userData.user) {
            await client.auth.updateUser({ password: newPassword });
          }
        } catch (authErr) {
          console.warn('Supabase auth updateUser notice:', authErr);
        }

        return { status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminListUsers() {
      try {
        // 1. First try dedicated RPC (SECURITY DEFINER, bypasses any restrictive RLS)
        try {
          const { data: rpcUsers, error: rpcErr } = await client.rpc('rpc_admin_list_users');
          if (!rpcErr && rpcUsers && Array.isArray(rpcUsers) && rpcUsers.length > 0) {
            return { status: 'success', users: rpcUsers };
          }
        } catch (rpcEx) {
          console.warn('rpc_admin_list_users notice:', rpcEx);
        }

        // 2. Direct query fallback
        const { data: users, error } = await client
          .from('Users')
          .select('"UserID", "FullName", "Email", "Username", "License", "CreatedAt"')
          .order('UserID', { ascending: true });
        if (error) throw error;

        // Fetch Admin list from Settings
        let adminList = ['nat-admin'];
        const { data: setRow } = await client
          .from('Settings')
          .select('Value')
          .eq('Settings', 'AdminUsers')
          .maybeSingle();
        if (setRow && setRow.Value) {
          adminList = setRow.Value.split(',').map(s => s.trim().toLowerCase());
        }

        const enriched = (users || []).map(u => ({
          ...u,
          Role: adminList.includes(u.Username?.toLowerCase()) || adminList.includes(u.Email?.toLowerCase()) ? 'admin' : 'user'
        }));

        return { status: 'success', users: enriched };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminCreateUser(userInfo) {
      try {
        const { fullName, email, username, password, role, license } = userInfo;
        if (!fullName || !username || !password) {
          return { status: 'error', message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' };
        }
        // Auto-generate email from username if not provided
        const effectiveEmail = (email && email.includes('@')) ? email.trim() : `${username.trim().toLowerCase()}@skpt-clinic.local`;
        const { data: res, error: rpcError } = await client.rpc('rpc_register_user', {
          p_fullname: fullName.trim(),
          p_email: effectiveEmail,
          p_username: username.trim(),
          p_password: password
        });
        if (rpcError || !res || res.status !== 'success') {
          return { status: 'error', message: res?.message || rpcError?.message || 'ไม่สามารถเพิ่มผู้ใช้ได้' };
        }

        // Save License if provided
        if (license) {
          try {
            await client.from('Users').update({ License: license.trim() }).eq('Username', username.trim());
          } catch (licErr) {
            console.warn('Save license error:', licErr);
          }
        }

        if (role === 'admin') {
          const { data: setRow } = await client.from('Settings').select('Value').eq('Settings', 'AdminUsers').maybeSingle();
          const currentAdmins = setRow && setRow.Value ? setRow.Value.split(',').map(s => s.trim()) : ['nat-admin'];
          if (!currentAdmins.map(a => a.toLowerCase()).includes(username.toLowerCase())) {
            currentAdmins.push(username.trim());
            await client.from('Settings').upsert({ Settings: 'AdminUsers', Value: currentAdmins.join(',') });
          }
        }

        return { status: 'success', message: 'เพิ่มผู้ใช้งานสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminUpdateUser(userInfo) {
      try {
        const { username, fullName, email, license, role } = userInfo;
        if (!username || !fullName) {
          return { status: 'error', message: 'กรุณาระบุชื่อผู้ใช้และชื่อ-สกุล' };
        }
        // Try RPC first
        let rpcDone = false;
        try {
          const { data: rpcRes, error: rpcErr } = await client.rpc('rpc_admin_update_user', {
            p_username: username.trim(),
            p_fullname: fullName.trim(),
            p_email: email ? email.trim() : '',
            p_license: license ? license.trim() : ''
          });
          if (!rpcErr && rpcRes && rpcRes.status === 'success') {
            rpcDone = true;
          }
        } catch (_) {}

        // Fallback: direct update
        if (!rpcDone) {
          const updateObj = {
            FullName: fullName.trim()
          };
          if (email) updateObj.Email = email.trim();
          if (license !== undefined) updateObj.License = license ? license.trim() : null;
          const { error: updErr } = await client.from('Users').update(updateObj).eq('Username', username.trim());
          if (updErr) throw updErr;
        }

        // Update role if changed
        if (role) {
          await backend.adminToggleRole(username, role);
        }

        return { status: 'success', message: 'อัปเดตข้อมูลผู้ใช้งานเรียบร้อยแล้ว' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminToggleRole(username, newRole) {
      try {
        // 1. Try dedicated SECURITY DEFINER RPC
        try {
          const { data: rpcRes, error: rpcErr } = await client.rpc('rpc_admin_toggle_role', {
            p_username: username.trim(),
            p_new_role: newRole
          });
          if (!rpcErr && rpcRes && rpcRes.status === 'success') {
            return rpcRes;
          }
        } catch (rpcEx) {
          console.warn('rpc_admin_toggle_role notice:', rpcEx);
        }

        // 2. Direct Settings update fallback
        const { data: setRow } = await client.from('Settings').select('Value').eq('Settings', 'AdminUsers').maybeSingle();
        let admins = setRow && setRow.Value ? setRow.Value.split(',').map(s => s.trim()) : ['nat-admin'];
        const cleanUser = username.trim().toLowerCase();

        if (newRole === 'admin') {
          if (!admins.map(a => a.toLowerCase()).includes(cleanUser)) {
            admins.push(username.trim());
          }
        } else {
          admins = admins.filter(a => a.toLowerCase() !== cleanUser);
        }

        const { error } = await client.from('Settings').upsert({ Settings: 'AdminUsers', Value: admins.join(',') });
        if (error) throw error;
        return { status: 'success', message: `ปรับสิทธิ์ ${username} เป็น ${newRole} เรียบร้อยแล้ว` };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminResetUserPassword(username, newPassword) {
      try {
        if (!newPassword || newPassword.length < 6) {
          return { status: 'error', message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
        }
        // Use the rpc_admin_reset_password RPC (or fallback: update Users table hash)
        // First try the dedicated RPC
        const { data: rpcRes, error: rpcErr } = await client.rpc('rpc_admin_reset_password', {
          p_username: username.trim(),
          p_new_password: newPassword
        });
        if (!rpcErr && rpcRes && rpcRes.status === 'success') {
          return { status: 'success', message: `รีเซ็ตรหัสผ่านของ ${username} สำเร็จ` };
        }
        // Fallback: compute SHA-256 hash and update Users table directly
        const enc = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(newPassword));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const { error: updateErr } = await client
          .from('Users')
          .update({ Password: sha256hex })
          .eq('Username', username.trim());
        if (updateErr) throw updateErr;
        return { status: 'success', message: `รีเซ็ตรหัสผ่านของ ${username} สำเร็จ` };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async registerUser(userInfo) {
      try {
        const { fullName, email, username, password } = userInfo;
        if (!fullName || !email || !username || !password) {
          throw new Error('กรุณากรอกข้อมูลให้ครบทุกช่อง');
        }

        // 1. Secure Server-side registration RPC (validates inputs, provisions auth and profile)
        const { data: res, error: rpcError } = await client.rpc('rpc_register_user', {
          p_fullname: fullName.trim(),
          p_email: email.trim(),
          p_username: username.trim(),
          p_password: password
        });

        if (rpcError) {
          console.error("Registration RPC error:", rpcError);
          throw new Error('ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้ง');
        }

        if (!res || res.status !== 'success') {
          throw new Error(res?.message || 'ไม่สามารถสมัครสมาชิกได้');
        }

        // 2. Auto sign in with Supabase Auth
        try {
          await client.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
          });
        } catch (signInErr) {
          console.warn("Auto-login post register notice:", signInErr);
        }

        return {
          status: 'success',
          message: res.message || 'สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้ทันที',
          user: {
            fullName: res.fullName,
            username: res.username,
            email: res.email
          }
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async requestPasswordReset(email) {
      try {
        if (!email || !email.trim()) {
          return { status: 'error', message: 'กรุณากรอกอีเมล' };
        }
        const { data: res, error } = await client.rpc('rpc_request_password_reset', {
          p_email: email.trim()
        });
        if (error || !res) {
          return { status: 'error', message: 'เกิดข้อผิดพลาดในการขอรีเซ็ตรหัสผ่าน' };
        }
        return res;
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async submitNewPassword(token, newUsername, newPassword) {
      try {
        if (!token || !newPassword) {
          return { status: 'error', message: 'ข้อมูลไม่ครบถ้วน' };
        }
        const { data: res, error } = await client.rpc('rpc_submit_new_password', {
          p_token: token.trim(),
          p_new_password: newPassword
        });
        if (error || !res) {
          return { status: 'error', message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' };
        }
        return res;
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getPatientById(id) {
      try {
        const { data, error } = await client.from('Patients').select('*').eq('PatientID', id).single();
        if (error || !data) return null;

        const p = { ...data };
        const addressParts = [];
        if (p.HouseNumber) addressParts.push(`บ้านเลขที่ ${p.HouseNumber}`);
        if (p.Moo) addressParts.push(`หมู่ ${p.Moo}`);
        if (p.Tambon) addressParts.push(`ต.${p.Tambon}`);
        if (p.Amphoe) addressParts.push(`อ.${p.Amphoe}`);
        if (p.Province) addressParts.push(`จ.${p.Province}`);
        if (p.PostalCode) addressParts.push(p.PostalCode);
        p.FullAddress = addressParts.join(' ');
        p.TreatmentRightsDisplay = getTreatmentRightsDisplay(p);
        p.PatientPhotoURL = normalizeImageUrl(p.PatientPhotoURL || p.PatientPhotoUrl);
        p.PatientPhotoBase64 = p.PatientPhotoURL || null;
        return p;
      } catch (e) {
        console.error("Error getPatientById:", e);
        return null;
      }
    },

    async savePatient(patientObject) {
      try {
        const targetId = patientObject.PatientID || crypto.randomUUID();
        if (patientObject.photoData) {
          patientObject.PatientPhotoURL = await uploadPatientPhoto(targetId, patientObject.photoData);
        }
        delete patientObject.photoData;

        let res;
        if (patientObject.PatientID) {
          // Update
          res = await client.from('Patients').update(patientObject).eq('PatientID', patientObject.PatientID);
        } else {
          // Insert
          patientObject.PatientID = targetId;
          patientObject.Timestamp = new Date().toISOString();
          res = await client.from('Patients').insert([patientObject]);
        }

        if (res.error) throw res.error;

        // Return refreshed patient list
        const initialData = await backend.getInitialData();
        return {
          status: 'success',
          message: 'บันทึกข้อมูลผู้ป่วยสำเร็จ',
          patients: initialData.patients
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deletePatientById(patientId) {
      try {
        if (!patientId) throw new Error("ไม่พบ PatientID");

        await Promise.all([
          client.from('Patients').delete().eq('PatientID', patientId),
          client.from('BIAssessments').delete().eq('PatientID', patientId),
          client.from('Consents').delete().eq('PatientID', patientId),
          client.from('OPDRecords').delete().eq('PatientID', patientId),
          client.from('SOAPNotes').delete().eq('PatientID', patientId),
          client.from('Schedules').delete().eq('PatientID', patientId),
          client.from('TMSE_Records').delete().eq('PatientID', patientId),
          client.from('MHQ_Records').delete().eq('PatientID', patientId),
          client.from('Dysphagia_Records').delete().eq('PatientID', patientId)
        ]);

        const initial = await backend.getInitialData();
        return {
          status: 'success',
          message: 'ลบข้อมูลผู้ป่วยและรายการที่เกี่ยวข้องทั้งหมดสำเร็จ',
          patients: initial.patients
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async dischargePatient(patientId) {
      try {
        const { error } = await client.from('Patients').update({
          PatientStatus: 'Discharged',
          DischargeDate: new Date().toISOString()
        }).eq('PatientID', patientId);

        if (error) throw error;
        return { status: 'success', message: 'ปิดบริการ (Discharge) ผู้ป่วยเรียบร้อย' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async updateRecordKeptStatus(patientId, status) {
      try {
        const { error } = await client.from('Patients').update({ RecordKept: status }).eq('PatientID', patientId);
        if (error) throw error;
        return { status: 'success', message: 'อัปเดตสถานะสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getAllSchedules() {
      try {
        const { data, error } = await client.from('Schedules').select('*');
        if (error) throw error;
        return { status: 'success', records: data || [] };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getSchedulesByPatientId(patientId) {
      try {
        const { data, error } = await client.from('Schedules').select('*').eq('PatientID', patientId);
        if (error) throw error;
        return { status: 'success', records: data || [] };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveSchedules(data) {
      try {
        const { patientId, dates } = data;
        // Delete current schedules
        await client.from('Schedules').delete().eq('PatientID', patientId);

        const newSchedules = [];
        (dates || []).forEach((dateStr, idx) => {
          if (dateStr) {
            newSchedules.push({
              ScheduleID: `SCH${Date.now()}${idx + 1}`,
              PatientID: patientId,
              VisitNumber: idx + 1,
              ScheduledDate: new Date(dateStr).toISOString(),
              Status: 'Scheduled',
              Notes: ''
            });
          }
        });

        if (newSchedules.length > 0) {
          const { error } = await client.from('Schedules').insert(newSchedules);
          if (error) throw error;
        }

        return { status: 'success', message: 'บันทึกตารางเยี่ยมสำเร็จ!' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteSchedule(patientId, visitNumber) {
      try {
        const { error } = await client.from('Schedules').delete()
          .eq('PatientID', patientId)
          .eq('VisitNumber', Number(visitNumber));
        if (error) throw error;
        return { status: 'success', message: 'ลบรายการนัดหมายเรียบร้อย' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async updateScheduleStatus(patientId, visitCount) {
      try {
        const vNum = Number(visitCount);
        const { error } = await client.from('Schedules')
          .update({ Status: 'Completed' })
          .eq('PatientID', patientId)
          .eq('VisitNumber', vNum);
        return { status: 'success' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveScheduleOrder(updates) {
      try {
        for (const u of (updates || [])) {
          await client.from('Schedules')
            .update({ QueueIndex: u.queueIndex, Zone: u.zone })
            .eq('PatientID', u.patientId)
            .eq('VisitNumber', u.visitNumber);
        }
        return { status: 'success' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getPatientScheduleWithStats(patientId) {
      try {
        const pid = String(patientId).trim();
        const [patientRes, schedRes, opdRes, soapRes, biRes] = await Promise.all([
          client.from('Patients').select('*').eq('PatientID', pid).single(),
          client.from('Schedules').select('*').eq('PatientID', pid),
          client.from('OPDRecords').select('VisitDate').eq('PatientID', pid),
          client.from('SOAPNotes').select('VisitDate').eq('PatientID', pid),
          client.from('BIAssessments').select('*').eq('PatientID', pid)
        ]);

        if (!patientRes.data) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const patient = patientRes.data;

        const allDatesSet = new Set();
        (schedRes.data || []).forEach(r => {
          if (r.ScheduledDate) allDatesSet.add(formatDate(r.ScheduledDate));
        });

        const actualVisitDates = new Set();
        [...(opdRes.data || []), ...(soapRes.data || [])].forEach(r => {
          if (r.VisitDate) {
            const d = formatDate(r.VisitDate);
            allDatesSet.add(d);
            actualVisitDates.add(d);
          }
        });

        const biMap = {};
        (biRes.data || []).forEach(r => {
          if (r.AssessmentDate) {
            const d = formatDate(r.AssessmentDate);
            biMap[d] = {
              score: r.TotalScore,
              impairment: getCombinedImpairmentText(r)
            };
          }
        });

        const sortedDates = Array.from(allDatesSet).sort();
        const todayStr = formatDate(new Date());

        let lastKnownScore = patient.InitialBI || 0;
        let lastKnownImpairment = "-";

        const result = sortedDates.map((dStr, index) => {
          const isVisited = actualVisitDates.has(dStr);
          const hasBI = biMap[dStr];
          const biBefore = lastKnownScore;
          let biAfter = "";
          let currentImpairment = lastKnownImpairment;

          if (hasBI) {
            biAfter = hasBI.score;
            currentImpairment = hasBI.impairment;
            lastKnownScore = hasBI.score;
            lastKnownImpairment = hasBI.impairment;
          }

          return {
            visitNumber: index + 1,
            date: dStr,
            multipleImpairment: currentImpairment,
            biBefore: biBefore,
            biAfter: biAfter,
            status: isVisited ? 'Completed' : (dStr < todayStr ? 'Overdue' : 'Pending')
          };
        });

        return { status: 'success', records: result };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getAllRecordsForPatient(patientId) {
      try {
        const pid = String(patientId).trim();
        const [consentRes, biRes, opdRes, soapRes, tmseRes, mhqRes, dysRes] = await Promise.all([
          client.from('Consents').select('*').eq('PatientID', pid).order('ConsentDate', { ascending: false }),
          client.from('BIAssessments').select('*').eq('PatientID', pid).order('AssessmentDate', { ascending: false }),
          client.from('OPDRecords').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false }),
          client.from('SOAPNotes').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false }),
          client.from('TMSE_Records').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false }),
          client.from('MHQ_Records').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false }),
          client.from('Dysphagia_Records').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false })
        ]);

        return {
          status: 'success',
          records: {
            consents: (consentRes.data || []).map(normalizeConsentRecord),
            biAssessments: biRes.data || [],
            opdRecords: (opdRes.data || []).map(normalizeOpdRecord),
            soapNotes: (soapRes.data || []).map(normalizeSoapRecord),
            tmseRecords: tmseRes.data || [],
            mhqRecords: mhqRes.data || [],
            dysphagiaRecords: dysRes.data || []
          }
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getNextVisitCount(patientId) {
      try {
        const pid = String(patientId).trim();
        const [opdRes, soapRes] = await Promise.all([
          client.from('OPDRecords').select('VisitCount').eq('PatientID', pid),
          client.from('SOAPNotes').select('VisitCount').eq('PatientID', pid)
        ]);
        const completedCount = (opdRes.data?.length || 0) + (soapRes.data?.length || 0);
        return { status: 'success', visitCount: completedCount + 1 };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- OPD ---
    async getOpdData(patientId, initialBIFromPatient) {
      try {
        const pid = String(patientId).trim();
        const [nextVisit, biRes] = await Promise.all([
          backend.getNextVisitCount(pid),
          client.from('BIAssessments').select('TotalScore, AssessmentDate').eq('PatientID', pid).order('AssessmentDate', { ascending: false }).limit(1)
        ]);
        let latestBI = initialBIFromPatient;
        if (biRes.data && biRes.data.length > 0 && biRes.data[0].TotalScore !== null) {
          latestBI = biRes.data[0].TotalScore;
        }
        return {
          status: 'success',
          latestBI: latestBI,
          nextVisitCount: nextVisit.visitCount || 1
        };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getOpdRecordById(id) {
      try {
        const { data, error } = await client.from('OPDRecords').select('*').eq('RecordID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล' };
        return { status: 'success', record: normalizeOpdRecord(data) };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveOpdRecord(data) {
      try {
        const record = { ...data };
        const pid = record.PatientID || 'unknown';

        if (record.BodyChartDrawingBase64 && record.BodyChartDrawingBase64.startsWith('data:image/')) {
          record.BodyChartDrawingUrl = await uploadImageToBucket('body-charts', `${pid}/body-chart-${Date.now()}.png`, record.BodyChartDrawingBase64);
        }
        if (record.TherapistSignatureBase64 && record.TherapistSignatureBase64.startsWith('data:image/')) {
          record.TherapistSignatureUrl = await uploadImageToBucket('signatures', `opd-therapist-${pid}-${Date.now()}.png`, record.TherapistSignatureBase64);
        }
        if (record.PatientSignatureBase64 && record.PatientSignatureBase64.startsWith('data:image/')) {
          record.PatientSignatureUrl = await uploadImageToBucket('signatures', `opd-patient-${pid}-${Date.now()}.png`, record.PatientSignatureBase64);
        }
        delete record.BodyChartDrawingBase64;
        delete record.TherapistSignatureBase64;
        delete record.PatientSignatureBase64;

        let res;
        if (record.RecordID) {
          res = await client.from('OPDRecords').update(record).eq('RecordID', record.RecordID);
        } else {
          record.RecordID = `OPD${Date.now()}`;
          record.Timestamp = new Date().toISOString();
          res = await client.from('OPDRecords').insert([record]);
        }
        if (res.error) throw res.error;
        return { status: 'success', message: 'บันทึกข้อมูล OPD Card สำเร็จ', recordId: record.RecordID };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteOpdRecordById(id) {
      try {
        const { error } = await client.from('OPDRecords').delete().eq('RecordID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- SOAP ---
    async getSOAPNoteById(id) {
      try {
        const { data, error } = await client.from('SOAPNotes').select('*').eq('SOAPNoteID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล' };
        return { status: 'success', record: normalizeSoapRecord(data) };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveSOAPNote(data) {
      try {
        const record = { ...data };
        const pid = record.PatientID || 'unknown';

        if (record.TherapistSignatureBase64 && record.TherapistSignatureBase64.startsWith('data:image/')) {
          record.TherapistSignatureUrl = await uploadImageToBucket('signatures', `soap-therapist-${pid}-${Date.now()}.png`, record.TherapistSignatureBase64);
        }
        if (record.PatientSignatureBase64 && record.PatientSignatureBase64.startsWith('data:image/')) {
          record.PatientSignatureUrl = await uploadImageToBucket('signatures', `soap-patient-${pid}-${Date.now()}.png`, record.PatientSignatureBase64);
        }
        delete record.TherapistSignatureBase64;
        delete record.PatientSignatureBase64;

        let res;
        if (record.SOAPNoteID) {
          res = await client.from('SOAPNotes').update(record).eq('SOAPNoteID', record.SOAPNoteID);
        } else {
          record.SOAPNoteID = `SOAP${Date.now()}`;
          record.Timestamp = new Date().toISOString();
          res = await client.from('SOAPNotes').insert([record]);
        }
        if (res.error) throw res.error;
        return { status: 'success', message: 'บันทึกข้อมูล SOAP Note สำเร็จ', recordId: record.SOAPNoteID };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteSOAPNoteById(id) {
      try {
        const { error } = await client.from('SOAPNotes').delete().eq('SOAPNoteID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- BI Assessments ---
    async getBIAssessmentById(id) {
      try {
        const { data, error } = await client.from('BIAssessments').select('*').eq('AssessmentID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล' };
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getBIAssessmentByVisit(patientId, visitCount) {
      try {
        const { data, error } = await client.from('BIAssessments')
          .select('*')
          .eq('PatientID', String(patientId).trim())
          .eq('VisitCount', Number(visitCount))
          .limit(1);
        if (error || !data || data.length === 0) return { status: 'error', message: 'ไม่พบข้อมูล BI' };
        return { status: 'success', record: data[0] };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveBIAssessment(data) {
      try {
        const record = { ...data };
        let res;
        if (record.AssessmentID) {
          res = await client.from('BIAssessments').update(record).eq('AssessmentID', record.AssessmentID);
        } else {
          record.AssessmentID = `BI${Date.now()}`;
          res = await client.from('BIAssessments').insert([record]);
        }
        if (res.error) throw res.error;
        return { status: 'success', message: 'บันทึกการประเมิน BI สำเร็จ', recordId: record.AssessmentID };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteBIAssessmentById(id) {
      try {
        const { error } = await client.from('BIAssessments').delete().eq('AssessmentID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- Consent ---
    async getConsentById(id) {
      try {
        const { data, error } = await client.from('Consents').select('*').eq('ConsentID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล' };
        return { status: 'success', record: normalizeConsentRecord(data) };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveConsent(data) {
      try {
        const record = { ...data };
        const pid = record.PatientID || 'unknown';

        if (record.ConsenterSignatureBase64 && record.ConsenterSignatureBase64.startsWith('data:image/')) {
          record.ConsenterSignatureUrl = await uploadImageToBucket('signatures', `consent-consenter-${pid}-${Date.now()}.png`, record.ConsenterSignatureBase64);
        }
        if (record.WitnessSignatureBase64 && record.WitnessSignatureBase64.startsWith('data:image/')) {
          record.WitnessSignatureUrl = await uploadImageToBucket('signatures', `consent-witness-${pid}-${Date.now()}.png`, record.WitnessSignatureBase64);
        }
        delete record.ConsenterSignatureBase64;
        delete record.WitnessSignatureBase64;

        let res;
        if (record.ConsentID) {
          res = await client.from('Consents').update(record).eq('ConsentID', record.ConsentID);
        } else {
          record.ConsentID = `CON${Date.now()}`;
          record.Timestamp = new Date().toISOString();
          res = await client.from('Consents').insert([record]);
        }
        if (res.error) throw res.error;
        return { status: 'success', message: 'บันทึกใบยินยอมสำเร็จ', recordId: record.ConsentID };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteConsentById(id) {
      try {
        const { error } = await client.from('Consents').delete().eq('ConsentID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- Budget & Analytics ---
    async updateBudgetStatus(payload) {
      try {
        const patientId = String(payload?.patientId || '').trim();
        const visitDate = formatDate(payload?.visitDate);
        const budgetStatus = String(payload?.budgetStatus || '').trim() === 'รับยอด' ? 'รับยอด' : 'รอโอน';

        if (!patientId || !visitDate) throw new Error("Missing patientId or visitDate");

        await Promise.all([
          client.from('OPDRecords').update({ BudgetStatus: budgetStatus }).eq('PatientID', patientId).eq('VisitDate', visitDate),
          client.from('SOAPNotes').update({ BudgetStatus: budgetStatus }).eq('PatientID', patientId).eq('VisitDate', visitDate)
        ]);

        return { status: 'success', budgetStatus };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async getDashboardData() {
      try {
        const initial = await backend.getInitialData();
        const patients = initial.patients || [];
        if (patients.length === 0) {
          return { totalPatients: 0, diagnosisData: {}, zoneData: {}, biData: {}, visitProgress: {} };
        }

        const diagnosisData = patients.reduce((acc, p) => {
          const dx = p.IMCDx || 'ไม่ระบุ';
          acc[dx] = (acc[dx] || 0) + 1;
          return acc;
        }, {});

        const zoneData = patients.reduce((acc, p) => {
          const zone = p.Zone || 'ไม่ระบุ';
          acc[zone] = (acc[zone] || 0) + 1;
          return acc;
        }, {});

        const biData = { '15-20': 0, '10-15': 0, '5-10': 0, '1-5': 0 };
        patients.forEach(p => {
          const bi = p.LatestBI;
          if (bi >= 15) biData['15-20']++;
          else if (bi >= 10) biData['10-15']++;
          else if (bi >= 5) biData['5-10']++;
          else if (bi >= 1) biData['1-5']++;
        });

        const visitProgress = {
          'ยังไม่กำหนดวัน': 0,
          'เลยกำหนด': 0,
          'อยู่ในกระบวนการบำบัด': 0,
          'สิ้นสุดการรักษา': 0,
          'ปิดบริการ': 0
        };

        patients.forEach(p => {
          if (p.PatientStatus === 'Discharged') {
            visitProgress['ปิดบริการ']++;
            return;
          }
          const { completed, total } = p.scheduleInfo || { completed: 0, total: 0 };
          if (total === 0) {
            visitProgress['ยังไม่กำหนดวัน']++;
          } else if (completed >= total) {
            visitProgress['สิ้นสุดการรักษา']++;
          } else {
            visitProgress['อยู่ในกระบวนการบำบัด']++;
          }
        });

        return {
          totalPatients: patients.length,
          diagnosisData,
          zoneData,
          biData,
          visitProgress
        };
      } catch (e) {
        console.error("Error getDashboardData:", e);
        return { totalPatients: 0, diagnosisData: {}, zoneData: {}, biData: {}, visitProgress: {} };
      }
    },

    async getDailySummaryData(startDateStr, endDateStr) {
      try {
        const start = new Date(startDateStr);
        start.setHours(0,0,0,0);
        const end = new Date(endDateStr);
        end.setHours(23,59,59,999);

        const initial = await backend.getInitialData();
        const patients = initial.patients || [];
        const pMap = {};
        patients.forEach(p => pMap[String(p.PatientID).trim()] = p);

        const [opdRes, soapRes, schedRes] = await Promise.all([
          client.from('OPDRecords').select('*'),
          client.from('SOAPNotes').select('*'),
          client.from('Schedules').select('*')
        ]);

        const completed = [];
        const pending = [];
        const processedKeys = new Set();

        [...(opdRes.data || []), ...(soapRes.data || [])].forEach(r => {
          const pid = String(r.PatientID || '').trim();
          if (!r.VisitDate) return;
          const vDate = new Date(r.VisitDate);
          if (vDate >= start && vDate <= end) {
            const dateStr = formatDate(vDate);
            const key = pid + "_" + dateStr;
            if (!processedKeys.has(key) && pMap[pid]) {
              const p = pMap[pid];
              completed.push({
                cn: p.ClinicNumber,
                patientName: p.PatientName,
                zone: p.Zone,
                initialBI: p.InitialBI || 0,
                latestBI: p.LatestBI,
                multipleImpairment: p.multipleImpairment,
                visitDate: vDate.toISOString(),
                visitNumber: r.VisitCount || "-",
                isSuccess: true,
                patientId: pid,
                budgetStatus: r.BudgetStatus || 'รอโอน'
              });
              processedKeys.add(key);
            }
          }
        });

        (schedRes.data || []).forEach(r => {
          if (!r.ScheduledDate) return;
          const pid = String(r.PatientID || '').trim();
          const vDate = new Date(r.ScheduledDate);
          const dateStr = formatDate(vDate);
          const key = pid + "_" + dateStr;
          if (vDate >= start && vDate <= end && !processedKeys.has(key)) {
            const p = pMap[pid];
            if (p) {
              pending.push({
                cn: p.ClinicNumber,
                patientName: p.PatientName,
                zone: p.Zone,
                initialBI: p.InitialBI || 0,
                latestBI: p.LatestBI,
                multipleImpairment: p.multipleImpairment,
                visitDate: vDate.toISOString(),
                visitNumber: r.VisitNumber,
                isSuccess: false,
                patientId: pid,
                budgetStatus: 'รอโอน'
              });
              processedKeys.add(key);
            }
          }
        });

        return { status: 'success', visited: completed, pending: pending };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    getImageAsBase64(fileId) {
      return null;
    },

    // =================================================================
    // PDF GENERATION (HTML Print Window approach)
    // =================================================================

    async generateIMCCoverPdf(patientId) {
      try {
        const patient = await backend.getPatientById(String(patientId).trim());
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        _openPrintWindow(_buildIMCCoverHtml(patient));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateConsentPdf(consentId) {
      try {
        const conRes = await backend.getConsentById(String(consentId).trim());
        if (conRes.status !== 'success') return conRes;
        const consent = conRes.record;
        const patient = await backend.getPatientById(consent.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        _openPrintWindow(_buildConsentHtml(patient, consent));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateBIPdf(assessmentId) {
      try {
        const biRes = await backend.getBIAssessmentById(String(assessmentId).trim());
        if (biRes.status !== 'success') return biRes;
        const assessment = biRes.record;
        const patient = await backend.getPatientById(assessment.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildBIHtml(patient, assessment, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateOpdPdf(recordId) {
      try {
        const opdRes = await backend.getOpdRecordById(String(recordId).trim());
        if (opdRes.status !== 'success') return opdRes;
        const record = opdRes.record;
        const patient = await backend.getPatientById(record.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildOpdHtml(patient, record, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateSOAPPdf(noteId) {
      try {
        const soapRes = await backend.getSOAPNoteById(String(noteId).trim());
        if (soapRes.status !== 'success') return soapRes;
        const note = soapRes.record;
        const patient = await backend.getPatientById(note.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        // Fetch BI for visit
        let biData = {};
        try {
          const biRes = await backend.getBIAssessmentByVisit(note.PatientID, note.VisitCount);
          if (biRes.status === 'success' && biRes.record) biData = biRes.record;
        } catch (_) {}
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildSOAPHtml(patient, note, biData, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    // --- TMSE Records ---
    async getTMSERecordById(id) {
      try {
        const { data, error } = await client.from('TMSE_Records').select('*').eq('RecordID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล TMSE' };
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteTMSERecordById(id) {
      try {
        const { error } = await client.from('TMSE_Records').delete().eq('RecordID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- MHQ Records ---
    async getMHQRecordById(id) {
      try {
        const { data, error } = await client.from('MHQ_Records').select('*').eq('RecordID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล MHQ' };
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteMHQRecordById(id) {
      try {
        const { error } = await client.from('MHQ_Records').delete().eq('RecordID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    // --- Dysphagia Records ---
    async getDysphagiaRecordById(id) {
      try {
        const { data, error } = await client.from('Dysphagia_Records').select('*').eq('RecordID', id).single();
        if (error || !data) return { status: 'error', message: 'ไม่พบข้อมูล Dysphagia' };
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async deleteDysphagiaRecordById(id) {
      try {
        const { error } = await client.from('Dysphagia_Records').delete().eq('RecordID', id);
        if (error) throw error;
        return { status: 'success', message: 'ลบข้อมูลสำเร็จ' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async generateTMSEPdf(recordId) {
      try {
        const res = await backend.getTMSERecordById(String(recordId).trim());
        if (res.status !== 'success') return res;
        const rec = res.record;
        const patient = await backend.getPatientById(rec.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildTMSEHtml(patient, rec, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateMHQPdf(recordId) {
      try {
        const res = await backend.getMHQRecordById(String(recordId).trim());
        if (res.status !== 'success') return res;
        const rec = res.record;
        const patient = await backend.getPatientById(rec.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildMHQHtml(patient, rec, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    },

    async generateDysphagiaPdf(recordId) {
      try {
        const res = await backend.getDysphagiaRecordById(String(recordId).trim());
        if (res.status !== 'success') return res;
        const rec = res.record;
        const patient = await backend.getPatientById(rec.PatientID);
        if (!patient) return { status: 'error', message: 'ไม่พบข้อมูลผู้ป่วย' };
        const therapistLicense = _getTherapistLicense();
        _openPrintWindow(_buildDysphagiaHtml(patient, rec, therapistLicense));
        return { status: 'success' };
      } catch (e) { return { status: 'error', message: e.message }; }
    }
  };

  // =================================================================
  // PDF Helper Functions
  // =================================================================

  function _getTherapistLicense() {
    try {
      const raw = localStorage.getItem('skpt_logged_in_user');
      if (raw) {
        const u = JSON.parse(raw);
        return u?.license || '';
      }
    } catch (_) {}
    return '';
  }

  function _openPrintWindow(html) {
    if (typeof Swal !== 'undefined') Swal.close();
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('กรุณาอนุญาต Pop-up เพื่อพิมพ์เอกสาร'); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      try { win.focus(); win.print(); } catch (_) {}
    }, 800);
  }

  function _chk(val) { return val === true || val === '☑' || String(val).toUpperCase() === 'TRUE' ? '☑' : '☐'; }

  function _thaiDate(d) {
    if (!d) return '-';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return String(d);
      return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) { return String(d); }
  }

  function _val(v, fallback) { return (v !== null && v !== undefined && String(v).trim() !== '') ? String(v) : (fallback || '-'); }

  const _CSS_COMMON = `
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 13px; color: #000; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm 12mm; }
    h1 { font-size: 16px; font-weight: 700; text-align: center; margin-bottom: 4px; }
    h2 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .section { margin-bottom: 8px; }
    .row { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 4px; align-items: baseline; }
    .field { display: inline-flex; align-items: baseline; gap: 4px; min-width: 120px; }
    .label { font-weight: 600; white-space: nowrap; }
    .val { border-bottom: 1px solid #555; min-width: 80px; display: inline-block; padding: 0 4px; }
    .val.long { min-width: 200px; }
    .val.full { min-width: 100%; }
    .chk-row { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 3px 0; align-items: center; }
    .chk-item { display: inline-flex; align-items: center; gap: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 12px; }
    th, td { border: 1px solid #777; padding: 2px 6px; }
    th { background: #e8e8e8; font-weight: 600; text-align: center; }
    .sig-row { display: flex; justify-content: space-around; margin-top: 16px; }
    .sig-box { text-align: center; width: 200px; }
    .sig-line { border-bottom: 1px solid #555; height: 40px; margin-bottom: 4px; }
    .header-logo { font-size: 18px; font-weight: 700; text-align: center; }
    .sub-header { font-size: 13px; text-align: center; margin-bottom: 8px; }
    @media print {
      body { margin: 0; }
      .page { margin: 0; padding: 8mm 10mm; }
      @page { size: A4; margin: 0; }
    }
  `;

  function _buildIMCCoverHtml(p) {
    const dxMap = { Stroke: '☐', TBI: '☐', FxHIP: '☐', SCI: '☐' };
    const dx = p.IMCDx || '';
    if (dx === 'Stroke') dxMap.Stroke = '☑';
    else if (dx === 'TBI') dxMap.TBI = '☑';
    else if (dx === 'Fx.HIP') dxMap.FxHIP = '☑';
    else if (dx === 'SCI') dxMap.SCI = '☑';
    const strokeHemorrhage = p.StrokeType === 'Hemorrhage' ? '☑' : '☐';
    const strokeIschemic = p.StrokeType === 'Ischemic' ? '☑' : '☐';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ปก OPD - ${_val(p.PatientName)}</title><style>${_CSS_COMMON}</style></head><body><div class="page">
<div class="header-logo">คลินิกกายภาพบำบัดสุขกาย IMC Plus</div>
<h1>ปกเวชระเบียนกายภาพบำบัดผู้ป่วยใน (IMC)</h1>
<div class="section">
  <div class="row">
    <span class="label">เลขที่คลินิก:</span><span class="val">${_val(p.ClinicNumber)}</span>
    <span class="label">HN:</span><span class="val">${_val(p.HN)}</span>
  </div>
  <div class="row">
    <span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(p.PatientName)}</span>
    <span class="label">เลขบัตรประชาชน:</span><span class="val">${_val(p.NationalID)}</span>
  </div>
  <div class="row">
    <span class="label">วันเกิด:</span><span class="val">${_thaiDate(p.DateOfBirth)}</span>
    <span class="label">อายุ:</span><span class="val">${_val(p.Age || (_calculateAge(p.DateOfBirth)))}</span>
    <span class="label">เพศ:</span><span class="val">${_val(p.Gender)}</span>
    <span class="label">สัญชาติ:</span><span class="val">${_val(p.Nationality)}</span>
  </div>
  <div class="row">
    <span class="label">ที่อยู่:</span><span class="val long">${_val(p.FullAddress)}</span>
  </div>
  <div class="row">
    <span class="label">โทรศัพท์:</span><span class="val">${_val(p.Phone || p.Telephone)}</span>
    <span class="label">สิทธิการรักษา:</span><span class="val">${_val(p.TreatmentRightsDisplay || p.TreatmentRights)}</span>
  </div>
  <div class="row">
    <span class="label">ผู้ดูแล:</span><span class="val">${_val(p.CaregiverName)}</span>
    <span class="label">ความสัมพันธ์:</span><span class="val">${_val(p.CaregiverRelationship)}</span>
    <span class="label">โทร:</span><span class="val">${_val(p.CaregiverPhone)}</span>
  </div>
</div>
<div class="section">
  <div class="label">วินิจฉัยโรค (IMC Dx):</div>
  <div class="chk-row">
    <span>${dxMap.Stroke} Stroke</span>
    <span style="margin-left:16px">${strokeHemorrhage} Hemorrhage &nbsp; ${strokeIschemic} Ischemic</span>
    <span>&nbsp;&nbsp;${dxMap.TBI} TBI</span>
    <span>&nbsp;&nbsp;${dxMap.FxHIP} Fx.HIP</span>
    <span>&nbsp;&nbsp;${dxMap.SCI} SCI</span>
  </div>
  <div class="row" style="margin-top:4px">
    <span class="label">วันที่รับ:</span><span class="val">${_thaiDate(p.AdmitDate)}</span>
    <span class="label">วันที่สิ้นสุด:</span><span class="val">${_thaiDate(p.DueDate)}</span>
    <span class="label">วันที่จำหน่าย:</span><span class="val">${_thaiDate(p.DischargeDate)}</span>
  </div>
  <div class="row">
    <span class="label">จำนวนครั้งที่นัดหมาย:</span><span class="val">${_val(p.VisitCount)}</span>
    <span class="label">Zone:</span><span class="val">${_val(p.Zone)}</span>
  </div>
</div>
</div></body></html>`;
  }

  function _calculateAge(dob) {
    if (!dob) return '';
    try {
      const birth = new Date(dob);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      return age >= 0 ? age : '';
    } catch (_) { return ''; }
  }

  function _buildConsentHtml(patient, consent) {
    const isPatient = consent.ConsenterType === 'Patient' ? '☑' : '☐';
    const isCaregiver = consent.ConsenterType !== 'Patient' ? '☑' : '☐';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ใบยินยอม - ${_val(patient.PatientName)}</title><style>${_CSS_COMMON}</style></head><body><div class="page">
<h1>ใบยินยอมรับการรักษาทางกายภาพบำบัด</h1>
<h2 style="text-align:center">คลินิกกายภาพบำบัดสุขกาย IMC Plus</h2>
<div class="section" style="margin-top:8px">
  <div class="row"><span class="label">ชื่อผู้ป่วย:</span><span class="val long">${_val(patient.PatientName)}</span><span class="label">เลขคลินิก:</span><span class="val">${_val(patient.ClinicNumber)}</span></div>
  <div class="row"><span class="label">วันที่:</span><span class="val">${_thaiDate(consent.ConsentDate)}</span><span class="label">ครั้งที่:</span><span class="val">${_val(consent.VisitCount)}</span></div>
</div>
<div class="section">
  <p style="margin-bottom:6px">ข้าพเจ้า (ผู้ให้คำยินยอม):</p>
  <div class="row">
    <span class="chk-item">${isPatient} ผู้ป่วยเอง &nbsp;&nbsp; ${isCaregiver} ผู้ดูแล/ผู้ปกครอง</span>
  </div>
  <div class="row">
    <span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(consent.ConsenterName)}</span>
    <span class="label">อายุ:</span><span class="val">${_val(consent.ConsenterAge)}</span>
  </div>
  <div class="row">
    <span class="label">เลขบัตรประชาชน:</span><span class="val">${_val(consent.ConsenterNationalID)}</span>
    <span class="label">ความสัมพันธ์:</span><span class="val">${_val(consent.ConsenterRelationship)}</span>
  </div>
  <div class="row"><span class="label">ที่อยู่:</span><span class="val long">${_val(patient.FullAddress)}</span></div>
</div>
<div class="section" style="margin-top:12px">
  <p>ขอยินยอมให้นักกายภาพบำบัดดำเนินการรักษาทางกายภาพบำบัดแก่ผู้ป่วย โดยได้รับการชี้แจงเกี่ยวกับกระบวนการ ประโยชน์ และความเสี่ยงที่อาจเกิดขึ้นจากการรักษาเป็นที่เรียบร้อยแล้ว</p>
</div>
<div class="section" style="margin-top:8px">
  <div class="label">หมายเหตุ:</div>
  <div style="border: 1px solid #aaa; min-height: 60px; padding: 4px;">${_val(consent.Notes, ' ')}</div>
</div>
<div class="sig-row" style="margin-top:24px">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>${_val(consent.ConsenterName)}</div>
    <div>ผู้ให้คำยินยอม</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>${_val(consent.WitnessName)}</div>
    <div>พยาน</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>นักกายภาพบำบัด</div>
  </div>
</div>
</div></body></html>`;
  }

  function _buildBIHtml(patient, a, therapistLicense) {
    const biItems = [
      { label: '1. การกินอาหาร (Feeding)', opts: ['ต้องให้ผู้อื่นป้อน (0)', 'ต้องการความช่วยเหลือบางส่วน (5)', 'กินเองได้แต่อาจต้องช่วยตัด (8)', 'กินเองได้ทุกอย่าง (10)'], key: 'q1', scores: [0,5,8,10] },
      { label: '2. การอาบน้ำ (Bathing)', opts: ['ต้องการความช่วยเหลือ (0)', 'อาบน้ำเองได้ (5)'], key: 'q2', scores: [0,5] },
      { label: '3. การดูแลตัวเอง (Personal Grooming)', opts: ['ต้องการความช่วยเหลือ (0)', 'ล้างหน้า-หวีผม-แปรงฟัน-โกนหนวดเองได้ (5)'], key: 'q3', scores: [0,5] },
      { label: '4. การแต่งตัว (Dressing)', opts: ['ต้องให้ผู้อื่นช่วยทั้งหมด (0)', 'ต้องการความช่วยเหลือบางส่วน (5)', 'แต่งตัวเองได้ (10)'], key: 'q4', scores: [0,5,10] },
      { label: '5. การขับถ่ายอุจจาระ (Bowel Control)', opts: ['ไม่สามารถควบคุมได้ (0)', 'อุบัติเหตุเกิดขึ้นบ้างเป็นครั้งคราว (5)', 'ควบคุมได้ (10)'], key: 'q5', scores: [0,5,10] },
      { label: '6. การขับถ่ายปัสสาวะ (Bladder Control)', opts: ['ไม่สามารถควบคุมได้ (0)', 'อุบัติเหตุเกิดขึ้นบ้างเป็นครั้งคราว (5)', 'ควบคุมได้ (10)'], key: 'q6', scores: [0,5,10] },
      { label: '7. การใช้ห้องน้ำ (Toilet Use)', opts: ['ต้องการความช่วยเหลือทั้งหมด (0)', 'ต้องการความช่วยเหลือบางส่วน (5)', 'ใช้ห้องน้ำเองได้ (10)'], key: 'q7', scores: [0,5,10] },
      { label: '8. การลุกจากเตียง (Transfer Bed to Chair)', opts: ['ทำไม่ได้ (0)', 'ต้องการความช่วยเหลือมาก (5)', 'ต้องการความช่วยเหลือน้อย (10)', 'ทำเองได้ (15)'], key: 'q8', scores: [0,5,10,15] },
      { label: '9. การเดิน (Mobility)', opts: ['ไม่สามารถเดินได้ (0)', 'ใช้รถเข็นได้เอง (5)', 'เดินโดยมีคนช่วย (10)', 'เดินได้เอง (15)'], key: 'q9', scores: [0,5,10,15] },
      { label: '10. การขึ้นบันได (Stair Climbing)', opts: ['ทำไม่ได้ (0)', 'ต้องการความช่วยเหลือ (5)', 'ขึ้นบันไดได้เอง (10)'], key: 'q10', scores: [0,5,10] }
    ];

    let biRows = '';
    biItems.forEach(item => {
      const score = parseInt(a[item.key] || 0);
      const optsHtml = item.opts.map((opt, j) => {
        const chk = (score === item.scores[j]) ? '☑' : '☐';
        return `<span class="chk-item" style="margin-right:8px">${chk} ${opt}</span>`;
      }).join(' ');
      biRows += `<tr><td>${item.label}</td><td><div class="chk-row">${optsHtml}</div></td><td style="text-align:center">${score}</td></tr>`;
    });

    const impairmentItems = [
      { key: 'impairment_swallowing', label: '1.Swallowing' },
      { key: 'impairment_communicate', label: '2.Communicate' },
      { key: 'impairment_mobility', label: '3.Mobility' },
      { key: 'impairment_cognitive', label: '4.Cognitive/Perception' },
      { key: 'impairment_bowel', label: '5.Bowel and Bladder' }
    ];
    const fxHipItems = [
      { key: 'fx_bathroom', label: 'เข้าห้องน้ำ' },
      { key: 'fx_bed', label: 'ขึ้นลงจากเตียง' },
      { key: 'fx_movement', label: 'เคลื่อนไหว' },
      { key: 'fx_stairs', label: 'ขึ้นลงบันได' }
    ];

    const impHtml = impairmentItems.map(i => `<span class="chk-item">${_chk(a[i.key])} ${i.label}</span>`).join(' &nbsp; ');
    const fxHtml = fxHipItems.map(i => `<span class="chk-item">${_chk(a[i.key])} ${i.label}</span>`).join(' &nbsp; ');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BI Assessment - ${_val(patient.PatientName)}</title><style>${_CSS_COMMON}</style></head><body><div class="page">
<h1>แบบประเมิน Barthel Index (BI)</h1>
<h2 style="text-align:center">คลินิกกายภาพบำบัดสุขกาย IMC Plus</h2>
<div class="section">
  <div class="row">
    <span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(patient.PatientName)}</span>
    <span class="label">เลขคลินิก:</span><span class="val">${_val(patient.ClinicNumber)}</span>
  </div>
  <div class="row">
    <span class="label">วันที่ประเมิน:</span><span class="val">${_thaiDate(a.AssessmentDate)}</span>
    <span class="label">ครั้งที่:</span><span class="val">${_val(a.VisitCount)}</span>
    <span class="label">นักกายภาพบำบัด:</span><span class="val">${_val(a.TherapistName)}</span>
  </div>
  <div class="row">
    <span class="label">เลขที่ใบประกอบวิชาชีพ:</span><span class="val">${_val(therapistLicense)}</span>
  </div>
</div>
<table>
  <thead><tr><th style="width:35%">กิจกรรม</th><th>ระดับความสามารถ</th><th style="width:60px">คะแนน</th></tr></thead>
  <tbody>${biRows}</tbody>
  <tfoot><tr><td colspan="2" style="text-align:right;font-weight:700">คะแนนรวม (Total Score)</td><td style="text-align:center;font-weight:700">${_val(a.TotalScore, '0')}</td></tr></tfoot>
</table>
<div class="section">
  <div class="label">ความบกพร่องที่พบ (Multiple Impairment):</div>
  <div class="chk-row" style="margin-top:4px">${impHtml}</div>
</div>
<div class="section">
  <div class="label">Fx.HIP - กิจกรรมที่ต้องระวัง:</div>
  <div class="chk-row" style="margin-top:4px">${fxHtml}</div>
</div>
<div class="section"><div class="label">หมายเหตุ:</div><div style="border-bottom:1px solid #aaa;min-height:30px">${_val(a.Notes, ' ')}</div></div>
<div class="sig-row">
  <div class="sig-box"><div class="sig-line"></div><div>นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }

  function _buildOpdHtml(patient, r, therapistLicense) {
    let diag = r.Diagnosis || '';
    const dx = { Stroke: '☐', FxHIP: '☐', SCI: '☐', TBI: '☐' };
    if (diag.includes('Stroke')) dx.Stroke = '☑';
    if (diag.includes('Fx.HIP')) dx.FxHIP = '☑';
    if (diag.includes('SCI')) dx.SCI = '☑';
    if (diag.includes('TBI')) dx.TBI = '☑';

    const locStr = r.LevelOfConsciousness || '';
    const loc = {
      Alert: locStr.includes('Alert') ? '☑' : '☐',
      Drowsiness: locStr.includes('Drowsiness') ? '☑' : '☐',
      Confuse: locStr.includes('Confuse') ? '☑' : '☐',
      Stupor: locStr.includes('Stupor') ? '☑' : '☐',
      SemiComa: locStr.includes('Semi-coma') ? '☑' : '☐',
      Coma: locStr.includes('Coma') ? '☑' : '☐',
    };

    const comm = r.Communication || '';
    const commNormal = comm === 'Normal' ? '☑' : '☐';
    const commDysarthria = comm === 'Dysarthria' ? '☑' : '☐';
    const commAphasia = comm === 'Aphasia' ? '☑' : '☐';

    let treatHtml = '';
    try {
      const treatment = JSON.parse(r.Treatment_Details || '{}');
      ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'].forEach(key => {
        if (treatment[key] && Object.keys(treatment[key]).length > 0) {
          const details = (treatment[key].details || []).join(', ');
          const time = treatment[key].time || '';
          treatHtml += `<tr><td>${_chk(true)} ${key}</td><td>${time}</td><td>${details}</td></tr>`;
        } else {
          treatHtml += `<tr><td>${_chk(false)} ${key}</td><td>-</td><td>-</td></tr>`;
        }
      });
    } catch (_) {}

    const problemListText = r.ProblemList || '';
    const plItems = ['Weakness', 'Poor balance', 'Poor ambulation', 'Abnormal m. length/tone', 'Risk for complication'];
    const plHtml = plItems.map(item => `${problemListText.includes(item) ? '☑' : '☐'} ${item}`).join(' &nbsp; ');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OPD Card - ${_val(patient.PatientName)}</title><style>${_CSS_COMMON}</style></head><body><div class="page">
<h1>OPD Card - กายภาพบำบัดผู้ป่วยใน (IMC)</h1>
<h2 style="text-align:center">คลินิกกายภาพบำบัดสุขกาย IMC Plus</h2>
<div class="section">
  <div class="row">
    <span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(patient.PatientName)}</span>
    <span class="label">เลขคลินิก:</span><span class="val">${_val(patient.ClinicNumber)}</span>
  </div>
  <div class="row">
    <span class="label">วันที่:</span><span class="val">${_thaiDate(r.VisitDate)}</span>
    <span class="label">เวลา:</span><span class="val">${_val(r.StartTime)}</span> - <span class="val">${_val(r.EndTime)}</span>
    <span class="label">ครั้งที่:</span><span class="val">${_val(r.VisitCount)}</span>
  </div>
  <div class="row">
    <span class="label">นักกายภาพบำบัด:</span><span class="val">${_val(r.TherapistName)}</span>
    <span class="label">เลขใบประกอบวิชาชีพ:</span><span class="val">${_val(therapistLicense)}</span>
  </div>
  <div class="row">
    <span class="label">Diagnosis:</span>
    <span>${dx.Stroke} Stroke &nbsp; ${dx.FxHIP} Fx.HIP &nbsp; ${dx.SCI} SCI &nbsp; ${dx.TBI} TBI</span>
    <span class="label">สิทธิ์:</span><span class="val">${_val(patient.TreatmentRightsDisplay || patient.TreatmentRights)}</span>
  </div>
</div>
<div class="section">
  <div class="label">ระดับความรู้สึกตัว (LOC):</div>
  <div class="chk-row">${loc.Alert} Alert &nbsp; ${loc.Drowsiness} Drowsiness &nbsp; ${loc.Confuse} Confuse &nbsp; ${loc.Stupor} Stupor &nbsp; ${loc.SemiComa} Semi-coma &nbsp; ${loc.Coma} Coma</div>
  <div class="row" style="margin-top:4px">
    <span class="label">การสื่อสาร:</span>
    <span>${commNormal} Normal &nbsp; ${commDysarthria} Dysarthria &nbsp; ${commAphasia} Aphasia</span>
  </div>
</div>
<div class="section">
  <div class="label">การประเมินทางกาย (Physical Exam):</div>
  <div class="row"><span class="label">Bed Mobility:</span><span class="val long">${_val(r.BedMobility)}</span></div>
  <div class="row"><span class="label">Gross Motor:</span><span class="val long">${_val(r.GrossMotor)}</span></div>
  <div class="row"><span class="label">Balance - นั่ง:</span><span class="val">${_val(_parseJSON(r.Balance, 'Sitting'))}</span> &nbsp; <span class="label">ยืน:</span><span class="val">${_val(_parseJSON(r.Balance, 'Standing'))}</span></div>
  <div class="row"><span class="label">Tone:</span><span class="val long">${_val(r.Tone)}</span></div>
  <div class="row"><span class="label">PROM:</span><span class="val long">${_val(r.PROM)}</span></div>
  <div class="row"><span class="label">Other:</span><span class="val long">${_val(r.OtherPhysical)}</span></div>
</div>
<div class="section">
  <div class="label">Problem List:</div>
  <div class="chk-row">${plHtml}</div>
</div>
<div class="section">
  <div class="row"><span class="label">เป้าหมายการรักษา:</span><span class="val long">${_val(r.GoalsOfTreatment)}</span></div>
  <div class="row"><span class="label">แผนการรักษา:</span><span class="val long">${_val(r.PlanOfTreatment)}</span></div>
</div>
<div class="section">
  <div class="label">การรักษา (Treatment):</div>
  <table><thead><tr><th>รายการ</th><th>เวลา (นาที)</th><th>รายละเอียด</th></tr></thead><tbody>${treatHtml}</tbody></table>
</div>
<div class="section"><div class="label">หมายเหตุ:</div><div style="border-bottom:1px solid #aaa;min-height:30px">${_val(r.Notes, ' ')}</div></div>
<div class="sig-row">
  <div class="sig-box"><div class="sig-line"></div><div>นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }

  function _parseJSON(jsonStr, key) {
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : (jsonStr || {});
      return obj[key] !== undefined ? obj[key] : '';
    } catch (_) { return ''; }
  }

  function _buildSOAPHtml(patient, note, biData, therapistLicense) {
    let diagArr = [];
    try { diagArr = JSON.parse(note.DiagnosisJSON || '[]'); } catch (_) {}
    const dx = {
      Stroke: diagArr.includes('Stroke') ? '☑' : '☐',
      FxHIP: diagArr.includes('Fx.HIP') ? '☑' : '☐',
      SCI: diagArr.includes('SCI') ? '☑' : '☐',
      TBI: diagArr.includes('TBI') ? '☑' : '☐'
    };

    // Objective
    let objHtml = '';
    try {
      const obj = JSON.parse(note.ObjectiveJSON || '{}');
      if (obj.QualityMovement_Check) {
        const qm = obj.QualityMovement || {};
        objHtml += `<div>Quality of Movement - UE Rt: ${_val(qm.UE?.Rt)} Lt: ${_val(qm.UE?.Lt)} &nbsp; LE Rt: ${_val(qm.LE?.Rt)} Lt: ${_val(qm.LE?.Lt)}</div>`;
      }
      if (obj.Other_Check) objHtml += `<div>อื่นๆ: ${_val(obj.Other_Details)}</div>`;
    } catch (_) {}

    // Treatment
    let treatHtml = '';
    try {
      const treatment = JSON.parse(note.TreatmentJSON || '{}');
      ['QualityMove', 'BedMobility', 'Balance', 'Gait', 'Other'].forEach(key => {
        const chk = (treatment[key] && Object.keys(treatment[key]).length > 0) ? '☑' : '☐';
        const details = treatment[key] ? (treatment[key].details || []).join(', ') : '';
        const time = treatment[key] ? (treatment[key].time || '') : '';
        treatHtml += `<tr><td>${chk} ${key}</td><td>${time}</td><td>${details}</td></tr>`;
      });
      if (treatment.Ambulation) {
        const amb = treatment.Ambulation;
        const ambStatus = `${amb.Status === 'NWB' ? '☑' : '☐'} NWB &nbsp; ${amb.Status === 'PWB' ? '☑' : '☐'} PWB &nbsp; ${amb.Status === 'FWB' ? '☑' : '☐'} FWB &nbsp; ${amb.Status === 'WC' ? '☑' : '☐'} W/C`;
        treatHtml += `<tr><td>☑ Ambulation</td><td></td><td>${ambStatus} ${amb.PWB_Percent ? `(${amb.PWB_Percent}%)` : ''}</td></tr>`;
      }
    } catch (_) {}

    // Plan
    const plan = note.Plan || '';
    const planFU = plan.includes('F/U Program PT ต่อเนื่อง') ? '☑' : '☐';
    const planOFF = plan.includes('OFF PT Program') ? '☑' : '☐';
    const planRefer = plan.includes('ส่งต่อ รพ. ดูแลต่อเนื่อง') ? '☑' : '☐';

    // BI Section
    const biScore = biData.TotalScore !== undefined ? biData.TotalScore : '-';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SOAP Note - ${_val(patient.PatientName)}</title><style>${_CSS_COMMON}</style></head><body><div class="page">
<h1>SOAP Note - กายภาพบำบัดผู้ป่วยใน</h1>
<h2 style="text-align:center">คลินิกกายภาพบำบัดสุขกาย IMC Plus</h2>
<div class="section">
  <div class="row">
    <span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(patient.PatientName)}</span>
    <span class="label">เลขคลินิก:</span><span class="val">${_val(patient.ClinicNumber)}</span>
  </div>
  <div class="row">
    <span class="label">วันที่:</span><span class="val">${_thaiDate(note.VisitDate)}</span>
    <span class="label">เวลา:</span><span class="val">${_val(note.StartTime)}</span> - <span class="val">${_val(note.EndTime)}</span>
    <span class="label">ครั้งที่:</span><span class="val">${_val(note.VisitCount)}</span>
  </div>
  <div class="row">
    <span class="label">นักกายภาพบำบัด:</span><span class="val">${_val(note.TherapistName)}</span>
    <span class="label">เลขใบประกอบวิชาชีพ:</span><span class="val">${_val(therapistLicense)}</span>
  </div>
  <div class="row">
    <span class="label">Diagnosis:</span>
    <span>${dx.Stroke} Stroke &nbsp; ${dx.FxHIP} Fx.HIP &nbsp; ${dx.SCI} SCI &nbsp; ${dx.TBI} TBI</span>
  </div>
</div>
<div class="section">
  <div class="label"><strong>S</strong> (Subjective):</div>
  <div style="border-bottom:1px solid #aaa;min-height:30px;padding:2px">${_val(note.Subjective)}</div>
</div>
<div class="section">
  <div class="label"><strong>O</strong> (Objective):</div>
  ${objHtml || '<div style="border-bottom:1px solid #aaa;min-height:30px"></div>'}
  <div class="row" style="margin-top:4px"><span class="label">Barthel Index คะแนน:</span><span class="val">${biScore}</span></div>
</div>
<div class="section">
  <div class="label"><strong>A</strong> (Assessment):</div>
  <div style="border-bottom:1px solid #aaa;min-height:30px;padding:2px">${_val(note.Assessment)}</div>
</div>
<div class="section">
  <div class="label"><strong>P</strong> (Plan / Treatment):</div>
  <table><thead><tr><th>รายการรักษา</th><th>เวลา (นาที)</th><th>รายละเอียด</th></tr></thead><tbody>${treatHtml}</tbody></table>
  <div class="chk-row" style="margin-top:4px">
    <span>${planFU} F/U Program PT ต่อเนื่อง</span>
    <span>&nbsp;&nbsp;${planOFF} OFF PT Program</span>
    <span>&nbsp;&nbsp;${planRefer} ส่งต่อ รพ. ดูแลต่อเนื่อง</span>
  </div>
</div>
<div class="section"><div class="label">หมายเหตุ:</div><div style="border-bottom:1px solid #aaa;min-height:30px">${_val(note.Notes, ' ')}</div></div>
<div class="sig-row">
  <div class="sig-box"><div class="sig-line"></div><div>นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }

  // =================================================================
  // TMSE, MHQ, Dysphagia PDF Builders
  // =================================================================

  function _buildTMSEHtml(p, r, therapistLicense) {
    const total = r.total_score !== null && r.total_score !== undefined ? r.total_score : '-';
    const status = r.result_status || (total >= 24 ? 'ปกติ (Normal)' : 'มีภาวะสมองเสื่อม/บกพร่อง (Cognitive Impairment)');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TMSE - ${p.PatientName || ''}</title>
<style>${_CSS_COMMON}</style></head><body><div class="page">
<div class="header-logo">แบบทดสอบสมรรถภาพสมองไทย (Thai Mental State Examination : TMSE)</div>
<div class="sub-header">คลินิกกายภาพบำบัด สุขกาย</div>
<div class="section">
  <div class="row">
    <div class="field"><span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(p.PatientName)}</span></div>
    <div class="field"><span class="label">HN/CN:</span><span class="val">${_val(p.ClinicNumber)}</span></div>
    <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || r.Age)}</span> ปี</div>
    <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val">${_thaiDate(r.VisitDate)}</span></div>
  </div>
</div>
<div class="section">
  <h2>1. Orientation (การรับรู้เกี่ยวกับเวลาและสถานที่ - 6 คะแนน)</h2>
  <table>
    <thead><tr><th>ข้อที่</th><th>คำถาม / การทดสอบ</th><th style="width:120px">ผลการทดสอบ</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>วันนี้ วันอะไร (วันจันทร์-อาทิตย์)</td><td style="text-align:center">${r.q_day == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>2</td><td>วันนี้ วันที่เท่าไหร่</td><td style="text-align:center">${r.q_date == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>3</td><td>เดือนนี้ เดือนอะไร</td><td style="text-align:center">${r.q_month == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>4</td><td>ช่วงนี้ เวลาอะไร (เช้า / กลางวัน / บ่าย / เย็น)</td><td style="text-align:center">${r.q_time == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>5</td><td>ที่นี่ ที่ไหน (บ้าน / โรงพยาบาล / คลินิก)</td><td style="text-align:center">${r.q_place == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>6</td><td>ผู้ตรวจทำงานอะไร / สวมเสื้อสีอะไร</td><td style="text-align:center">${r.q_job == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
    </tbody>
  </table>
</div>
<div class="section">
  <h2>2. Registration & Attention & Calculation</h2>
  <table>
    <thead><tr><th>หมวด</th><th>การทดสอบ</th><th style="width:120px">ผลการทดสอบ</th></tr></thead>
    <tbody>
      <tr><td>Registration (3)</td><td>จำคำ 3 คำ: ดอกไม้ (${r.q_tree == 1 ? '1' : '0'}), แม่น้ำ (${r.q_car == 1 ? '1' : '0'}), รถไฟ (${r.q_hand == 1 ? '1' : '0'})</td><td style="text-align:center">${(Number(r.q_tree||0)+Number(r.q_car||0)+Number(r.q_hand||0))} / 3</td></tr>
      <tr><td>Attention (5)</td><td>สะกดคำย้อนหลัง (ศ-พ-พ-อ-จ): ศ(${r.q_fri==1?1:0}) พ(${r.q_thu==1?1:0}) พ(${r.q_wed==1?1:0}) อ(${r.q_tue==1?1:0}) จ(${r.q_mon==1?1:0})</td><td style="text-align:center">${(Number(r.q_fri||0)+Number(r.q_thu||0)+Number(r.q_wed||0)+Number(r.q_tue||0)+Number(r.q_mon||0))} / 5</td></tr>
      <tr><td>Calculation (3)</td><td>ลบเลขทีละ 7 หรือ คิดเลข: ข้อ 1 (${r.q_calc1==1?1:0}), ข้อ 2 (${r.q_calc2==1?1:0}), ข้อ 3 (${r.q_calc3==1?1:0})</td><td style="text-align:center">${(Number(r.q_calc1||0)+Number(r.q_calc2||0)+Number(r.q_calc3||0))} / 3</td></tr>
    </tbody>
  </table>
</div>
<div class="section">
  <h2>3. Language & Visuoperception</h2>
  <table>
    <thead><tr><th>การทดสอบ</th><th>รายละเอียด</th><th style="width:120px">ผลการทดสอบ</th></tr></thead>
    <tbody>
      <tr><td>บอกชื่อสิ่งของ (2)</td><td>นาฬิกา (${r.q_watch==1?1:0}), เสื้อ (${r.q_shirt==1?1:0})</td><td style="text-align:center">${(Number(r.q_watch||0)+Number(r.q_shirt||0))} / 2</td></tr>
      <tr><td>พูดตาม (1)</td><td>"ใครใคร่ค้าม้าค้า ใครใคร่ค้าช้างค้า"</td><td style="text-align:center">${r.q_repeat == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>คำสั่ง 3 ขั้นตอน (3)</td><td>หยิบกระดาษ (${r.q_command1==1?1:0}), พับครึ่ง (${r.q_command2==1?1:0}), วางบนตัก (${r.q_command3==1?1:0})</td><td style="text-align:center">${(Number(r.q_command1||0)+Number(r.q_command2||0)+Number(r.q_command3||0))} / 3</td></tr>
      <tr><td>อ่านและทำตาม (1)</td><td>อ่านป้าย "หลับตา" แล้วปฏิบัติตาม</td><td style="text-align:center">${r.q_read == 1 ? 'ถูกต้อง (1)' : 'ไม่ถูกต้อง (0)'}</td></tr>
      <tr><td>วาดภาพรูปทรง (2)</td><td>วาดภาพห้าเหลี่ยมตัดกัน หรือรูปทรงตามแบบ</td><td style="text-align:center">${_val(r.q_draw, '0')} / 2</td></tr>
      <tr><td>ความคล้ายคลึง (2)</td><td>ส้ม-กล้วย (${r.q_similar1==1?1:0}), โต๊ะ-เก้าอี้ (${r.q_similar2==1?1:0})</td><td style="text-align:center">${(Number(r.q_similar1||0)+Number(r.q_similar2||0))} / 2</td></tr>
    </tbody>
  </table>
</div>
<div class="section" style="border: 2px solid #333; padding: 10px; border-radius: 6px; margin-top: 10px; background: #fdfdfd;">
  <div class="row" style="font-size: 14px; font-weight: bold;">
    <span>คะแนนรวม (Total Score): <span style="font-size: 18px; color: #0284c7;">${total}</span> / 30 คะแนน</span>
  </div>
  <div class="row" style="margin-top: 6px;">
    <span>ผลการประเมิน: <strong>${status}</strong></span>
  </div>
  <div style="font-size: 11px; color: #666; margin-top: 4px;">* เกณฑ์ปกติ: คะแนนมากกว่าหรือเท่ากับ 24 คะแนน (สำหรับผู้มีการศึกษา) หรือ 18 คะแนน (สำหรับผู้ไม่ได้รับการศึกษา)</div>
</div>
<div class="sig-row" style="margin-top: 24px;">
  <div class="sig-box"><div class="sig-line"></div><div>ผู้ประเมิน / นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }

  function _buildMHQHtml(p, r, therapistLicense) {
    const q9Items = [
      'เบื่อ ไม่สนใจอยากทำอะไร',
      'ไม่สบายใจ ซึมเศร้า หรือท้อแท้',
      'หลับยาก หรือหลับๆ ตื่นๆ หรือหลับมากเกินไป',
      'เหนื่อยง่าย หรือไม่ค่อยมีแรง',
      'เบื่ออาหาร หรือกินมากเกินไป',
      'รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว หรือทำให้ครอบครัวผิดหวัง',
      'สมาธิไม่ดีเวลาทำอะไร เช่น ดูโทรทัศน์ ฟังวิทยุ หรือทำงานที่ต้องใช้ความตั้งใจ',
      'พูดช้าหรือทำอะไรช้าลง จนคนอื่นสังเกตเห็นได้ หรือกระสับกระส่ายจนอยู่ไม่สุข',
      'คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี'
    ];
    let q9RowsHtml = '';
    for (let i = 0; i < 9; i++) {
      const val = r['q9_' + (i + 1)];
      q9RowsHtml += `<tr><td>${i + 1}. ${q9Items[i]}</td><td style="text-align:center">${val !== null && val !== undefined ? val : '-'}</td></tr>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MHQ - ${p.PatientName || ''}</title>
<style>${_CSS_COMMON}</style></head><body><div class="page">
<div class="header-logo">แบบคัดกรองสุขภาพจิตและภาวะซึมเศร้า (MHQ: 2Q, 9Q, 8Q)</div>
<div class="sub-header">คลินิกกายภาพบำบัด สุขกาย</div>
<div class="section">
  <div class="row">
    <div class="field"><span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(p.PatientName)}</span></div>
    <div class="field"><span class="label">HN/CN:</span><span class="val">${_val(p.ClinicNumber)}</span></div>
    <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age || r.Age)}</span> ปี</div>
    <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val">${_thaiDate(r.VisitDate)}</span></div>
  </div>
</div>
<div class="section">
  <h2>1. แบบคัดกรองโรคซึมเศร้า 2 คำถาม (2Q)</h2>
  <table>
    <thead><tr><th>คำถาม</th><th style="width:120px">ผลการตอบ</th></tr></thead>
    <tbody>
      <tr><td>1. ใน 2 สัปดาห์ที่ผ่านมา รู้สึกหดหู่ เศร้า หรือท้อแท้สิ้นหวังหรือไม่</td><td style="text-align:center">${r.q2_1 === 'YES' ? 'มี (YES)' : (r.q2_1 === 'NO' ? 'ไม่มี (NO)' : '-')}</td></tr>
      <tr><td>2. ใน 2 สัปดาห์ที่ผ่านมา รู้สึกเบื่อ ทำอะไรก็ไม่เพลิดเพลินหรือไม่</td><td style="text-align:center">${r.q2_2 === 'YES' ? 'มี (YES)' : (r.q2_2 === 'NO' ? 'ไม่มี (NO)' : '-')}</td></tr>
      <tr style="font-weight:bold; background:#f0f9ff;"><td colspan="2">สรุปผล 2Q: ${r.result_2q === 'YES' ? 'พบความเสี่ยง (มีอาการอย่างน้อย 1 ข้อ) -> ประเมินต่อด้วย 9Q' : 'ปกติ (ไม่มีความเสี่ยง)'}</td></tr>
    </tbody>
  </table>
</div>
<div class="section">
  <h2>2. แบบประเมินโรคซึมเศร้า 9 คำถาม (9Q)</h2>
  <table>
    <thead><tr><th>ข้อคำถาม (ใน 2 สัปดาห์ที่ผ่านมา)</th><th style="width:120px">คะแนน (0-3)</th></tr></thead>
    <tbody>
      ${q9RowsHtml}
      <tr style="font-weight:bold; background:#f0fdf4;">
        <td>คะแนนรวม 9Q: ${_val(r.score_9q, '0')} / 27 คะแนน</td>
        <td style="text-align:center">${_val(r.result_9q, '-')}</td>
      </tr>
    </tbody>
  </table>
</div>
<div class="section">
  <h2>3. แบบประเมินการฆ่าตัวตาย 8 คำถาม (8Q)</h2>
  <div class="row">
    <span class="label">คะแนนรวม 8Q:</span><span class="val">${_val(r.score_8q, '0')}</span>
    <span class="label" style="margin-left:20px">ระดับความเสี่ยง:</span><span class="val long">${_val(r.result_8q, '-')}</span>
  </div>
</div>
<div class="section" style="border: 2px solid #333; padding: 10px; border-radius: 6px; margin-top: 10px; background: #fafafa;">
  <div class="row" style="font-size: 14px; font-weight: bold;">
    <span>สรุปผลการประเมินสุขภาพจิต:</span>
  </div>
  <div class="row" style="margin-top: 4px;">
    <span>${_val(r.result_status, '-')}</span>
  </div>
</div>
<div class="sig-row" style="margin-top: 24px;">
  <div class="sig-box"><div class="sig-line"></div><div>ผู้ประเมิน / นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }

  function _buildDysphagiaHtml(p, r, therapistLicense) {
    const symList = (prefix) => {
      const syms = [];
      if (r[prefix + '_cough'] == 1) syms.push('ไอ (Cough)');
      if (r[prefix + '_choke'] == 1) syms.push('สำลัก (Choke)');
      if (r[prefix + '_tachypnea'] == 1) syms.push('หายใจเหนื่อย/เร็ว');
      if (r[prefix + '_wetvoice'] == 1) syms.push('เสียงเปลี่ยน (Wet voice)');
      return syms.length > 0 ? syms.join(', ') : 'ไม่มีอาการผิดปกติ';
    };

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dysphagia - ${p.PatientName || ''}</title>
<style>${_CSS_COMMON}</style></head><body><div class="page">
<div class="header-logo">แบบคัดกรองและประเมินภาวะกลืนลำบาก (Dysphagia Screening Form)</div>
<div class="sub-header">คลินิกกายภาพบำบัด สุขกาย</div>
<div class="section">
  <div class="row">
    <div class="field"><span class="label">ชื่อ-สกุล:</span><span class="val long">${_val(p.PatientName)}</span></div>
    <div class="field"><span class="label">HN/CN:</span><span class="val">${_val(p.ClinicNumber)}</span></div>
    <div class="field"><span class="label">อายุ:</span><span class="val">${_val(p.Age)}</span> ปี</div>
    <div class="field"><span class="label">วันที่ประเมิน:</span><span class="val">${_thaiDate(r.VisitDate)}</span></div>
  </div>
</div>
<div class="section">
  <h2>ตอนที่ 1: การประเมินความพร้อมก่อนทดสอบกลืน (Pre-requisite Evaluation)</h2>
  <table>
    <thead><tr><th>รายการประเมิน</th><th style="width:100px">ผล</th></tr></thead>
    <tbody>
      <tr><td>1. ระดับความรู้สึกตัว (Alert & Cooperative ไม่ง่วงซึม ปลุกตื่นง่าย)</td><td style="text-align:center">${r.q1_1 === 'YES' ? 'ผ่าน (YES)' : 'ไม่ผ่าน (NO)'}</td></tr>
      <tr><td>2. การทรงท่า ท่านั่งตั้งตรง 90 องศาได้ หรือศีรษะตั้งตรงมั่นคง</td><td style="text-align:center">${r.q1_2 === 'YES' ? 'ผ่าน (YES)' : 'ไม่ผ่าน (NO)'}</td></tr>
      <tr><td>3. สามารถควบคุมน้ำลายได้เอง ไม่สำลักน้ำลายตนเอง</td><td style="text-align:center">${r.q1_3 === 'YES' ? 'ผ่าน (YES)' : 'ไม่ผ่าน (NO)'}</td></tr>
      <tr style="font-weight:bold; background:#f0f9ff;"><td colspan="2">สรุปผลตอนที่ 1: ${r.result_group1 === 'PASS' ? 'ผ่านเกณฑ์ความพร้อม -> สามารถทดสอบการกลืนน้ำได้' : 'ไม่ผ่านเกณฑ์ความพร้อม (ห้ามทดสอบการกลืนน้ำ / แนะนำใส่สายให้อาหาร)'}</td></tr>
    </tbody>
  </table>
</div>
<div class="section">
  <h2>ตอนที่ 2: การทดสอบการกลืนน้ำ (Water Swallowing Test)</h2>
  <table>
    <thead><tr><th>ระดับการทดสอบ</th><th>ผลการกลืน</th><th>อาการสำลัก / เสียงเปลี่ยน</th></tr></thead>
    <tbody>
      <tr><td>1. จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 1</td><td style="text-align:center">${r.q2_1 === 'YES' ? 'กลืนได้' : (r.q2_1 === 'NO' ? 'กลืนไม่ได้' : '-')}</td><td>${symList('sym2_3')}</td></tr>
      <tr><td>2. จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 2</td><td style="text-align:center">${r.q2_2 === 'YES' ? 'กลืนได้' : (r.q2_2 === 'NO' ? 'กลืนไม่ได้' : '-')}</td><td>${symList('sym2_4')}</td></tr>
      <tr><td>3. จิบน้ำ 1 ช้อนชา (5 ml) ครั้งที่ 3</td><td style="text-align:center">${r.q2_3 === 'YES' ? 'กลืนได้' : (r.q2_3 === 'NO' ? 'กลืนไม่ได้' : '-')}</td><td>${symList('sym2_5')}</td></tr>
      <tr><td>4. ดื่มน้ำ 1 แก้ว (50-90 ml) ต่อเนื่อง</td><td style="text-align:center">${r.q2_6 === 'YES' ? 'ดื่มได้ต่อเนื่อง' : (r.q2_6 === 'NO' ? 'ดื่มสะดุด/สำลัก' : '-')}</td><td>${symList('sym2_6')}</td></tr>
      <tr><td>5. ทดสอบอาหารข้น / Regular diet</td><td style="text-align:center">${r.q2_7 === 'YES' ? 'ผ่าน' : (r.q2_7 === 'NO' ? 'ไม่ผ่าน' : '-')}</td><td>${symList('sym2_7')}</td></tr>
    </tbody>
  </table>
</div>
<div class="section" style="border: 2px solid #333; padding: 10px; border-radius: 6px; margin-top: 10px; background: #fafafa;">
  <div class="row" style="font-size: 14px; font-weight: bold;">
    <span>ระดับภาวะการกลืน (Level / Score):</span>
  </div>
  <div class="row" style="margin-top: 4px;">
    <span>${_val(r.total_score, '-')}</span>
  </div>
  <div class="row" style="font-size: 14px; font-weight: bold; margin-top: 8px;">
    <span>ผลการประเมินและแผนการดูแล (Recommendation):</span>
  </div>
  <div class="row" style="margin-top: 4px;">
    <span>${_val(r.result_status, '-')}</span>
  </div>
</div>
<div class="sig-row" style="margin-top: 24px;">
  <div class="sig-box"><div class="sig-line"></div><div>ผู้ประเมิน / นักกายภาพบำบัด</div><div style="font-size:11px">${_val(therapistLicense)}</div></div>
</div>
</div></body></html>`;
  }


  // -------------------------------------------------------------
  // Bridge runner mimicking google.script.run
  // -------------------------------------------------------------
  function createRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return (fn) => createRunner(fn, failureHandler);
        }
        if (prop === 'withFailureHandler') {
          return (fn) => createRunner(successHandler, fn);
        }
        if (prop === 'withUserObject') {
          return () => createRunner(successHandler, failureHandler);
        }
        if (prop === Symbol.toStringTag) return 'SupabaseRunProxy';

        return async (...args) => {
          try {
            if (typeof backend[prop] === 'function') {
              const res = await backend[prop](...args);
              if (typeof successHandler === 'function') {
                successHandler(res);
              }
              return res;
            } else {
              console.warn(`[SupabaseAdapter] Unimplemented method: ${String(prop)}`);
              const fallback = { status: 'error', message: `Method ${String(prop)} not supported on direct Supabase client.` };
              if (typeof successHandler === 'function') {
                successHandler(fallback);
              }
              return fallback;
            }
          } catch (err) {
            console.error(`[SupabaseAdapter] Error calling ${String(prop)}:`, err);
            if (typeof failureHandler === 'function') {
              failureHandler(err);
            } else if (typeof successHandler === 'function') {
              successHandler({ status: 'error', message: err.message || String(err) });
            }
          }
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner();
  console.log("Supabase direct backend adapter initialized successfully.");
})();
