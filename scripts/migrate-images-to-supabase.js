#!/usr/bin/env node
/**
 * Migration Script: Migrate images from Google Drive to Supabase Storage
 * Usage:
 *   node scripts/migrate-images-to-supabase.js [--dry-run] [--key=YOUR_SERVICE_OR_ANON_KEY]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://jvfivixnmcwsruaktirr.supabase.co";
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2Zml2aXhubWN3c3J1YWt0aXJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDkwOTMsImV4cCI6MjEwNDgyNTA5M30.Gml6dYxIp1s_TsBGfP7BWD_w6vH1uU5yXrTT4UcwbX0";

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const keyArg = args.find(a => a.startsWith('--key='));
if (keyArg) {
  SUPABASE_KEY = keyArg.split('=')[1].trim();
}

console.log('====================================================');
console.log('  Google Drive -> Supabase Storage Image Migration  ');
console.log(`  Target Supabase: ${SUPABASE_URL}`);
console.log(`  Mode: ${isDryRun ? 'DRY-RUN (Simulate only)' : 'LIVE MIGRATION'}`);
console.log('====================================================\n');

function extractDriveId(url) {
  if (!url) return null;
  const str = String(url).trim();
  if (!str.includes('drive.google.com')) return null;
  const m = str.match(/id=([a-zA-Z0-9_-]+)/) || str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/png'
      }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function supabaseRest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/rest/v1/${endpoint}`, SUPABASE_URL);
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed?.message || `Supabase REST error: ${res.statusCode} ${data}`));
          }
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function uploadToStorage(bucket, pathName, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/storage/v1/object/${bucket}/${encodeURIComponent(pathName).replace(/%2F/g, '/')}`, SUPABASE_URL);
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': contentType || 'image/png',
      'x-upsert': 'true'
    };

    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${pathName}`;
          resolve(publicUrl);
        } else {
          reject(new Error(`Storage upload error (${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function migrateImage(driveUrl, bucket, fileName) {
  const fileId = extractDriveId(driveUrl);
  if (!fileId) return null;

  const downloadUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
  try {
    const { buffer, contentType } = await fetchBuffer(downloadUrl);
    if (!buffer || buffer.length === 0) {
      console.warn(`  [!] Warning: Empty image buffer for ${fileId}`);
      return null;
    }

    if (isDryRun) {
      console.log(`  [Dry-Run] Downloaded ${fileId} (${buffer.length} bytes), target: ${bucket}/${fileName}`);
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
    }

    const publicUrl = await uploadToStorage(bucket, fileName, buffer, contentType);
    return publicUrl;
  } catch (err) {
    console.warn(`  [X] Failed downloading/uploading ${fileId}: ${err.message}`);
    return null;
  }
}

async function migrateTable(tableName, idCol, imageColumns) {
  console.log(`\n--- Scanning Table: ${tableName} ---`);
  let rows = [];
  try {
    rows = await supabaseRest(`${tableName}?select=*`);
  } catch (e) {
    console.error(`  Error querying table ${tableName}: ${e.message}`);
    return { scanned: 0, updated: 0 };
  }

  if (!Array.isArray(rows)) {
    console.log(`  No array returned for ${tableName}`);
    return { scanned: 0, updated: 0 };
  }

  console.log(`  Found ${rows.length} total rows in ${tableName}`);
  let scannedCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const idVal = row[idCol];
    const updateObj = {};
    let hasChanges = false;

    for (const { col, bucket, prefix } of imageColumns) {
      const val = row[col];
      const driveId = extractDriveId(val);
      if (driveId) {
        scannedCount++;
        const ext = 'png';
        const safeId = String(idVal).replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${prefix}_${safeId}_${driveId}.${ext}`;
        process.stdout.write(`  Migrating ${tableName}[${idVal}].${col} (Drive ID: ${driveId})... `);
        
        const newUrl = await migrateImage(val, bucket, fileName);
        if (newUrl) {
          updateObj[col] = newUrl;
          hasChanges = true;
          console.log(`OK -> ${newUrl}`);
        } else {
          console.log(`FAILED`);
        }
      }
    }

    if (hasChanges && !isDryRun) {
      try {
        await supabaseRest(`${tableName}?${idCol}=eq.${encodeURIComponent(idVal)}`, 'PATCH', updateObj);
        updatedCount++;
      } catch (err) {
        console.error(`  [!] Failed updating row ${idVal}: ${err.message}`);
      }
    } else if (hasChanges && isDryRun) {
      updatedCount++;
    }
  }

  return { scanned: scannedCount, updated: updatedCount };
}

async function main() {
  const stats = {
    Patients: await migrateTable('Patients', 'PatientID', [
      { col: 'PatientPhotoURL', bucket: 'patient-photos', prefix: 'photo' }
    ]),
    OPDRecords: await migrateTable('OPDRecords', 'RecordID', [
      { col: 'BodyChartDrawingUrl', bucket: 'body-charts', prefix: 'bodychart' },
      { col: 'TherapistSignatureUrl', bucket: 'signatures', prefix: 'sig_opd_therapist' },
      { col: 'PatientSignatureUrl', bucket: 'signatures', prefix: 'sig_opd_patient' }
    ]),
    SOAPNotes: await migrateTable('SOAPNotes', 'SOAPNoteID', [
      { col: 'TherapistSignatureUrl', bucket: 'signatures', prefix: 'sig_soap_therapist' },
      { col: 'PatientSignatureUrl', bucket: 'signatures', prefix: 'sig_soap_patient' }
    ]),
    Consents: await migrateTable('Consents', 'ConsentID', [
      { col: 'ConsenterSignatureUrl', bucket: 'signatures', prefix: 'sig_consenter' },
      { col: 'WitnessSignatureUrl', bucket: 'signatures', prefix: 'sig_witness' }
    ])
  };

  console.log('\n====================================================');
  console.log('                 MIGRATION SUMMARY                  ');
  console.log('====================================================');
  let totalFound = 0;
  let totalUpdated = 0;
  for (const [table, res] of Object.entries(stats)) {
    console.log(`  - ${table.padEnd(15)}: Drive Images: ${res.scanned}, Updated Rows: ${res.updated}`);
    totalFound += res.scanned;
    totalUpdated += res.updated;
  }
  console.log(`\n  Total Images Processed : ${totalFound}`);
  console.log(`  Total Records Updated  : ${totalUpdated}`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
