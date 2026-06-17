/**
 * CubeTrack — Google Apps Script Backend v14 + Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this in each CUSTOMER's Google Sheet → Apps Script → Code.gs
 *
 * DEPLOY STEPS:
 *   1. Open customer's Google Sheet → Extensions → Apps Script
 *   2. Paste this entire file
 *   3. Set MASTER_REGISTRY_URL below to your MasterRegistry deployment URL
 *   4. Deploy → New Deployment → Web App (Execute as: Me, Access: Anyone)
 *   5. Copy the deployment URL → add this institute in your SuperAdmin dashboard
 */

const SHEET_NAME          = "InstituteData";
const DATA_CELL           = "A1";

// ─── YOUR master registry URL (from MasterRegistry.gs deployment) ────────────
// Set this once — same value goes in every customer's Code.gs
const MASTER_REGISTRY_URL = "https://script.google.com/macros/s/YOUR_MASTER_REGISTRY_ID/exec";

// ── Entry points ──────────────────────────────────────────────────────────────
function doGet(e) {
  const p      = (e && e.parameter) ? e.parameter : {};
  const action = p.action || "";

  if (action === "ping")  return jsonResp({ ok: true, ts: new Date().toISOString() });
  if (action === "pull")  return jsonResp(handlePull());
  if (action === "push") {
    if (!p.data) return jsonResp({ ok: false, error: "No data param" });
    try {
      return jsonResp(handlePush(JSON.parse(decodeURIComponent(p.data))));
    } catch (err) {
      return jsonResp({ ok: false, error: "Parse error: " + err.message });
    }
  }

  const GITHUB_PAGES_URL = "https://pavanakula02-lab.github.io/Cubeguru/";
  return HtmlService
    .createHtmlOutput(`<meta http-equiv="refresh" content="0; url=${GITHUB_PAGES_URL}">`)
    .setTitle("CubeTrack — Redirecting…");
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents)
      return jsonResp({ ok: false, error: "Empty body" });
    const body = JSON.parse(e.postData.contents);
    return jsonResp(
      body.action === "push"
        ? handlePush(body)
        : { ok: false, error: "Unknown action" }
    );
  } catch (err) {
    return jsonResp({ ok: false, error: err.message });
  }
}

// ── Core data handlers ────────────────────────────────────────────────────────
function handlePush(data) {
  try {
    const sheet = getOrCreateSheet();
    const toStore = {
      ts:              data.ts              || new Date().toISOString(),
      trainers:        data.trainers        || [],
      students:        data.students        || [],
      attendance:      data.attendance      || {},
      feePayments:     data.feePayments     || {},
      adminpwd:        data.adminpwd        || "",
      puzzleTypes:     data.puzzleTypes     || [],
      studentProgress: data.studentProgress || {},
      instSettings:    data.instSettings    || {}
    };
    sheet.getRange(DATA_CELL).setValue(JSON.stringify(toStore));
    writeReadableTabs(data);

    // ── Ping master registry with usage stats (async, non-blocking) ──────────
    pingMasterRegistry(data);

    return { ok: true, ts: toStore.ts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function handlePull() {
  try {
    const sheet = getOrCreateSheet();
    const raw   = sheet.getRange(DATA_CELL).getValue();
    if (!raw) return { ok: true, data: null };

    const data = JSON.parse(raw);

    // ── Check licence on every pull ───────────────────────────────────────────
    // Returns licence info so the frontend can show expiry warnings
    const licence = checkLicence();
    return { ok: true, data, licence };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Licence check — calls master registry ─────────────────────────────────────
function checkLicence() {
  if (!MASTER_REGISTRY_URL || MASTER_REGISTRY_URL.includes("YOUR_MASTER")) {
    return { valid: true, plan: "unlimited", daysLeft: 9999 }; // not configured yet
  }
  try {
    const deployUrl = ScriptApp.getService().getUrl();
    const url = MASTER_REGISTRY_URL
      + "?action=check&deployUrl=" + encodeURIComponent(deployUrl);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return JSON.parse(resp.getContentText());
  } catch (e) {
    // If master is unreachable, fail open (don't lock out customer)
    return { valid: true, plan: "unknown", daysLeft: 9999, offline: true };
  }
}

// ── Ping master registry with usage data ──────────────────────────────────────
function pingMasterRegistry(data) {
  if (!MASTER_REGISTRY_URL || MASTER_REGISTRY_URL.includes("YOUR_MASTER")) return;
  try {
    const deployUrl    = ScriptApp.getService().getUrl();
    const studentCount = (data.students || []).length;
    const trainerCount = (data.trainers || []).length;
    const totalRevenue = Object.values(data.feePayments || {})
      .flat().reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const instName     = (data.instSettings || {}).name || "";

    const url = MASTER_REGISTRY_URL
      + "?action=activity"
      + "&deployUrl="    + encodeURIComponent(deployUrl)
      + "&studentCount=" + studentCount
      + "&trainerCount=" + trainerCount
      + "&totalRevenue=" + totalRevenue
      + "&instituteName="+ encodeURIComponent(instName);

    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    // Non-critical — never break the push because of a ping failure
  }
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function writeReadableTabs(data) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const inst   = data.instSettings || {};
  const tLabel = inst.trainersLabel || "Trainers";
  const sLabel = inst.studentsLabel || "Students";

  writeTab(ss, tLabel,
    ["ID","Name","Username","Specialization","Phone","Color"],
    (data.trainers || []).map(t => [
      t.id, t.name, t.username, t.spec || "", t.phone || "", t.color || ""
    ])
  );

  writeTab(ss, sLabel,
    ["ID","Name","Roll","Phone","Parent Name","Parent Phone","Fee/Cycle","Trainer ID","Days","Start","End","Status","Join Date"],
    (data.students || []).map(s => [
      s.id, s.name, s.roll, s.phone || "",
      s.parentName || "", s.parentPhone || "",
      s.fee, s.trainerId || "",
      (s.days || []).join(","), s.start || "", s.end || "",
      s.status || "active", s.joinDate || ""
    ])
  );

  const attRows = [];
  Object.entries(data.attendance || {}).forEach(([d, r]) =>
    Object.entries(r).forEach(([sid, st]) => attRows.push([d, sid, st]))
  );
  attRows.sort((a, b) => b[0].localeCompare(a[0]));
  writeTab(ss, "Attendance", ["Date","Student ID","Status"], attRows);

  const feeRows = [];
  Object.entries(data.feePayments || {}).forEach(([sid, pmts]) =>
    (pmts || []).forEach(p => feeRows.push([
      sid, p.cycle, p.amount, p.mode || "", p.date || "", p.note || ""
    ]))
  );
  feeRows.sort((a, b) => (b[4] || "").localeCompare(a[4] || ""));
  writeTab(ss, "FeePayments", ["Student ID","Cycle","Amount","Mode","Date","Note"], feeRows);

  const progRows = [];
  (data.puzzleTypes || []).forEach(pt => {
    (data.students || []).forEach(s => {
      const pp = ((data.studentProgress || {})[s.id] || {})[pt.id] || {};
      pt.levels.forEach((lv, i) => {
        const st = pp[lv.id]?.status || "notstarted";
        progRows.push([s.name, s.roll, pt.name, "L"+(i+1)+": "+lv.name, st, pp[lv.id]?.date || ""]);
      });
    });
  });
  if (progRows.length)
    writeTab(ss, "Progress", ["Student","Roll","Skill","Level","Status","Date"], progRows);
}

function writeTab(ss, name, headers, rows) {
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const all = [headers, ...rows];
  if (all.length) sh.getRange(1, 1, all.length, headers.length).setValues(all);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
