# CubeTrack — Rubik's Class Manager

A free, self-hosted class management system for Rubik's cube institutes.  
Runs on **GitHub Pages** (frontend) + **Google Sheets** (backend/database) — no server needed.

---

## Features

- 👤 Admin, Trainer & Parent portal logins
- 📅 Attendance tracking with WhatsApp alerts
- 💳 Fee management (per-cycle, auto-calculated)
- 📈 Student progress by puzzle type & level
- 🗓 Weekly schedule view
- 📊 Reports by trainer & student
- 🏫 Fully customisable (institute name, colors, labels, currency)
- 📱 Mobile-friendly with bottom navigation

---

## Setup — 5 Steps

### Step 1 — Fork this repo
Click **Fork** on GitHub. Your fork will be at:
`https://github.com/YOUR-USERNAME/CubeTrack`

### Step 2 — Enable GitHub Pages
1. Go to your fork → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `(root)`
4. Click **Save**

Your app will be live at:
`https://YOUR-USERNAME.github.io/CubeTrack/`

### Step 3 — Create your Google Sheet & Apps Script
1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank sheet
2. Click **Extensions → Apps Script**
3. Delete all existing code in `Code.gs`
4. Paste the entire contents of **`Code.gs`** from this repo
5. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** and **copy the Web App URL**
   - It looks like: `https://script.google.com/macros/s/AKfyc.../exec`

### Step 4 — Connect frontend to your Sheet
Open `index.html` in your fork and find this line near the very bottom (inside the `init()` function):

```js
const DEPLOY_URL = "https://script.google.com/macros/s/AKfycbydmFm12_.../exec";
```

Replace it with your own URL from Step 3, then commit the change.

### Step 5 — Open your app
Visit `https://YOUR-USERNAME.github.io/CubeTrack/`

**Default login:** `admin` / `admin123`  
You will be forced to change the password on first login.

---

## Selling to multiple institutes

Each institute needs their own Google Sheet + Apps Script deployment.  
They all share the same GitHub Pages frontend URL — they just enter their own deployment URL in **⚙ Sync Settings** inside the app.

---

## Updating the app

Any change you push to `main` on GitHub goes live automatically via GitHub Pages within ~1 minute.

---

## File structure

```
CubeTrack/
├── index.html   ← Full frontend (HTML + CSS + JS in one file)
├── Code.gs      ← Google Apps Script backend (copy into Apps Script)
└── README.md    ← This file
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages (free) |
| Database | Google Sheets |
| Backend API | Google Apps Script |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Fonts | Google Fonts (Nunito, Space Mono, DM Sans) |

---

## License

MIT — free to use, modify, and sell.
