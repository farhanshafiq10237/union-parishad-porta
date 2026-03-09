# 🇧🇩 ইউনিয়ন পরিষদ ডিজিটাল সেবা পোর্টাল

## Railway-তে Deploy করার গাইড

---

## ধাপ ১: GitHub-এ Repository তৈরি করুন

1. **github.com** → Login করুন (account না থাকলে free signup)
2. উপরে ডানে **"+"** বাটন → **"New repository"**
3. Repository name: `union-parishad-portal`
4. **Private** রাখুন (recommended)
5. **"Create repository"** click করুন

---

## ধাপ ২: Files Upload করুন

GitHub repository-তে গিয়ে:

1. **"uploading an existing file"** link-এ click করুন
2. এই ZIP-এর সব files drag করে দিন:
   - `server.js`
   - `package.json`
   - `railway.toml`
   - `.gitignore`
   - `public/` folder (সব HTML files)
   - `data/` folder (সব JSON files)
3. **"Commit changes"** click করুন

---

## ধাপ ৩: Railway-তে Deploy করুন

1. **railway.app** → **"Start a New Project"**
2. **"Deploy from GitHub repo"** select করুন
3. GitHub account connect করুন (প্রথমবার)
4. আপনার **`union-parishad-portal`** repo select করুন
5. Railway নিজেই সব detect করবে
6. **"Deploy"** click করুন
7. ২-৩ মিনিট অপেক্ষা করুন ⏳

---

## ধাপ ৪: Public URL নিন

Deploy হলে:
1. Railway dashboard-এ project-এ click করুন
2. **"Settings"** → **"Domains"**
3. **"Generate Domain"** click করুন
4. আপনার URL পাবেন: `https://union-parishad-portal-xxxx.up.railway.app`

✅ **এটাই আপনার live website!**

---

## Demo Credentials

### 🛡️ Admin Login (`/admin`)
| পদবী | Gov ID | Password |
|------|--------|----------|
| চেয়ারম্যান | `GOV-1234-ABCD` | `admin123` |
| সচিব | `GOV-5678-EFGH` | `sec123` |
| মনিটর | `GOV-9999-ZZZZ` | `mon123` |

### 👤 Citizen Login (`/login`)
প্রথমে `/register` থেকে নিবন্ধন করুন।

---

## ⚠️ গুরুত্বপূর্ণ নোট

**Data persistence:** Railway-তে JSON file database ব্যবহার হচ্ছে।
- Server restart হলে registered users ও applications মুছে যাবে
- Admin data (seeded) সবসময় থাকবে
- Production use-এর জন্য MongoDB Atlas লাগবে

**Free tier limits:**
- ৫০০ hours/month (সারাদিন চললেও যথেষ্ট)
- ১ GB RAM
- Shared CPU

---

## Project Structure

```
union-parishad-portal/
├── server.js          ← Main backend server
├── package.json       ← Node.js config
├── railway.toml       ← Railway config
├── .gitignore
├── data/              ← JSON database files
│   ├── users.json
│   ├── admins.json
│   ├── applications.json
│   ├── audit_log.json
│   ├── sessions.json
│   └── otps.json
└── public/            ← Frontend HTML files
    ├── login.html
    ├── register.html
    ├── dashboard.html
    ├── admin.html
    └── certificate.html
```
