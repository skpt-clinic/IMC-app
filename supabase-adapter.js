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

  async function uploadPatientPhoto(patientId, photoData) {
    if (!photoData || !photoData.startsWith('data:image/')) return photoData;
    try {
      const blob = base64ToBlob(photoData);
      const ext = blob.type.split('/')[1] || 'jpg';
      const fileName = `${patientId}_${Date.now()}.${ext}`;
      const { data, error } = await client.storage
        .from('patient-photos')
        .upload(fileName, blob, {
          contentType: blob.type,
          upsert: true
        });
      if (error) {
        console.warn("Storage upload error, falling back to base64:", error);
        return photoData;
      }
      const { data: pubData } = client.storage
        .from('patient-photos')
        .getPublicUrl(fileName);
      return pubData?.publicUrl || photoData;
    } catch (e) {
      console.warn("Photo upload exception:", e);
      return photoData;
    }
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
      clone.DayEnd = clone.DueDate ? new Date(clone.DueDate).toISOString() : null;

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
          client.from('BIAssessments').select('PatientID, TotalScore, AssessmentDate, impairment_swallowing, impairment_communicate, impairment_mobility, impairment_cognitive, impairment_bowel, fx_bathroom, fx_bed, fx_movement, fx_stairs, BI_impairment_swallowing, BI_impairment_communicate, BI_impairment_mobility, BI_impairment_cognitive, BI_impairment_bowel, BI_fx_bathroom, BI_fx_bed, BI_fx_movement, BI_fx_stairs'),
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
        const therapistList = dropdowns.map(r => r.Therapists).filter(Boolean);
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

        return {
          status: 'success',
          user: {
            fullName: res.fullName || res.username,
            username: res.username,
            email: res.email,
            role: userRole
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
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData?.user?.email) {
          return { status: 'error', message: 'ไม่พบเซสชันผู้ใช้ กรุณาเข้าสู่ระบบใหม่' };
        }
        // Verify old password
        const { error: verifyError } = await client.auth.signInWithPassword({
          email: userData.user.email,
          password: oldPassword
        });
        if (verifyError) {
          return { status: 'error', message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
        }
        // Update password
        const { error: updateError } = await client.auth.updateUser({ password: newPassword });
        if (updateError) {
          return { status: 'error', message: updateError.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้' };
        }
        return { status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async adminListUsers() {
      try {
        const { data: users, error } = await client
          .from('Users')
          .select('"UserID", "FullName", "Email", "Username", "CreatedAt", "auth_user_id"')
          .order('CreatedAt', { ascending: false });
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
        const { fullName, email, username, password, role } = userInfo;
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

    async adminToggleRole(username, newRole) {
      try {
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
        const [consentRes, biRes, opdRes, soapRes] = await Promise.all([
          client.from('Consents').select('*').eq('PatientID', pid).order('ConsentDate', { ascending: false }),
          client.from('BIAssessments').select('*').eq('PatientID', pid).order('AssessmentDate', { ascending: false }),
          client.from('OPDRecords').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false }),
          client.from('SOAPNotes').select('*').eq('PatientID', pid).order('VisitDate', { ascending: false })
        ]);

        return {
          status: 'success',
          records: {
            consents: consentRes.data || [],
            biAssessments: biRes.data || [],
            opdRecords: opdRes.data || [],
            soapNotes: soapRes.data || []
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
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveOpdRecord(data) {
      try {
        const record = { ...data };
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
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveSOAPNote(data) {
      try {
        const record = { ...data };
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
        return { status: 'success', record: data };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },

    async saveConsent(data) {
      try {
        const record = { ...data };
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
    }
  };

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
