/**
 * CubeTrack — Google Apps Script Backend v14
 * ─────────────────────────────────────────────────────────────────────────────
 * This file runs entirely inside Google Apps Script.
 * The frontend (index.html) is hosted on GitHub Pages.
 *
 * HOW IT WORKS:
 *   GitHub Pages  ──(fetch)──►  This script  ──(read/write)──►  Google Sheet
 *
 * DEPLOY STEPS:
 *   1. Open your Google Sheet → Extensions → Apps Script
 *   2. Paste this entire file into Code.gs
 *   3. Click Deploy → New Deployment → Web App
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   4. Copy the deployment URL
 *   5. Open index.html, find the DEPLOY_URL constant near the bottom (in init())
 *      and replace it with your copied URL.
 *   6. Push index.html to GitHub — done!
 *
 * Default login: admin / admin123  (forced to change on first login)
 */

const SHEET_NAME = "InstituteData";
const DATA_CELL  = "A1";

// ── Entry points ──────────────────────────────────────────────────────────────
function doGet(e) {
  const p      = (e && e.parameter) ? e.parameter : {};
  const action = p.action || "";

  if (action === "ping") return jsonResp({ ok: true, ts: new Date().toISOString() });
  if (action === "pull") return jsonResp(handlePull());
  if (action === "push") {
    if (!p.data) return jsonResp({ ok: false, error: "No data param" });
    try {
      return jsonResp(handlePush(JSON.parse(decodeURIComponent(p.data))));
    } catch (err) {
      return jsonResp({ ok: false, error: "Parse error: " + err.message });
    }
  }

  // Direct browser visit → redirect to GitHub Pages frontend.
  // Replace the URL below with your actual GitHub Pages URL after deploying.
  const GITHUB_PAGES_URL = "https://YOUR-USERNAME.github.io/CubeTrack/";
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
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.message };
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
    ["ID","Name","Roll","Phone","Parent Name","Parent Phone","Fee/Cycle","Trainer ID","Days","Start","End"],
    (data.students || []).map(s => [
      s.id, s.name, s.roll, s.phone || "",
      s.parentName || "", s.parentPhone || "",
      s.fee, s.trainerId || "",
      (s.days || []).join(","), s.start || "", s.end || ""
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
    (pmts || []).forEach(p => feeRows.push([sid, p.cycle, p.amount, p.mode || "", p.date || ""]))
  );
  feeRows.sort((a, b) => (b[4] || "").localeCompare(a[4] || ""));
  writeTab(ss, "FeePayments", ["Student ID","Cycle","Amount","Mode","Date"], feeRows);

  const progRows = [];
  (data.puzzleTypes || []).forEach(pt => {
    (data.students || []).forEach(s => {
      const pp = ((data.studentProgress || {})[s.id] || {})[pt.id] || {};
      pt.levels.forEach((lv, i) => {
        const st = pp[lv.id]?.status || "notstarted";
        progRows.push([s.name, s.roll, pt.name, "L" + (i+1) + ": " + lv.name, st, pp[lv.id]?.date || ""]);
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
