/**
 * ইউনিয়ন পরিষদ ডিজিটাল সেবা পোর্টাল
 * Backend: Pure Node.js HTTP Server (No npm dependencies)
 * Architecture: REST API + Session-based Auth
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// ─── Ensure data directory & files ───────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

['users.json', 'admins.json', 'applications.json', 'audit_log.json', 'sessions.json', 'otps.json'].forEach(f => {
  const fp = path.join(DATA_DIR, f);
  if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]');
});

// ─── DB helpers (flat JSON file "database") ───────────────────────────────────
const DB = {
  read: (file) => {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
    catch (e) { return []; }
  },
  write: (file, data) => {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
  }
};

// ─── Seed dummy data on first run ────────────────────────────────────────────
function seedData() {
  // শুধুমাত্র অ্যাডমিন লগইনের জন্য ডেটা থাকবে
  let admins = DB.read('admins.json');
  if (admins.length === 0) {
    admins = [
      { id: 'ADM001', govId: 'GOV-1234-ABCD', name: 'মোঃ আবুল কাশেম চৌধুরী', nameEn: 'Md. Abul Kashem Chowdhury', role: 'chairman', union: 'উত্তর শাহবাজপুর ইউনিয়ন', passwordHash: hashPassword('admin123'), createdAt: new Date().toISOString(), active: true },
      { id: 'ADM002', govId: 'GOV-5678-EFGH', name: 'মোঃ রফিকুল ইসলাম', nameEn: 'Md. Rafiqul Islam', role: 'secretary', union: 'উত্তর শাহবাজপুর ইউনিয়ন', passwordHash: hashPassword('sec123'), createdAt: new Date().toISOString(), active: true },
      { id: 'ADM003', govId: 'GOV-9999-ZZZZ', name: 'সরকারি পর্যবেক্ষক', nameEn: 'Govt Monitor Officer', role: 'monitor', union: 'সকল ইউনিয়ন', passwordHash: hashPassword('mon123'), createdAt: new Date().toISOString(), active: true },
    ];
    DB.write('admins.json', admins);
    console.log('✅ Seeded admins for login');
  }
  // Demo citizen users seed করা হচ্ছে (login page-এর demo buttons-এর জন্য)
  let users = DB.read('users.json');
  if (users.length === 0) {
    users = [
      {
        id: 'USR001',
        nameBn: 'মোঃ রহিম উদ্দিন',
        nameEn: 'Md. Rahim Uddin',
        fatherBn: 'মোঃ করিম উদ্দিন',
        fatherEn: 'Md. Karim Uddin',
        motherBn: 'মোছাঃ আনোয়ারা বেগম',
        motherEn: 'Mst. Anowara Begum',
        dob: '1985-06-15',
        gender: 'male',
        nid: '1234567890',
        mobile: '01712345678',
        addressBn: 'গ্রাম: উত্তর পাড়া, পোস্ট: শাহবাজপুর',
        union: 'উত্তর শাহবাজপুর',
        passwordHash: hashPassword('user123'),
        verified: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'USR002',
        nameBn: 'ফাতেমা বেগম',
        nameEn: 'Fatema Begum',
        fatherBn: 'মোঃ আলী হোসেন',
        fatherEn: 'Md. Ali Hossain',
        motherBn: 'মোছাঃ রহিমা বেগম',
        motherEn: 'Mst. Rahima Begum',
        dob: '1990-03-22',
        gender: 'female',
        nid: '9876543210',
        mobile: '01812345678',
        addressBn: 'গ্রাম: দক্ষিণ পাড়া, পোস্ট: শাহবাজপুর',
        union: 'উত্তর শাহবাজপুর',
        passwordHash: hashPassword('user123'),
        verified: true,
        createdAt: new Date().toISOString()
      }
    ];
    DB.write('users.json', users);
    console.log('✅ Seeded demo citizen users for login');
  }
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'UP_SALT_2024').digest('hex');
}
function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 24 * 3600 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'UP_JWT_SECRET_2024').update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', 'UP_JWT_SECRET_2024').update(`${header}.${body}`).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}
function generateId(prefix) {
  return prefix + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ─── Sessions store ───────────────────────────────────────────────────────────
const sessions = {};
function createSession(userId, role) {
  const sid = crypto.randomBytes(32).toString('hex');
  sessions[sid] = { userId, role, createdAt: Date.now(), lastActive: Date.now() };
  return sid;
}
function getSession(sid) {
  if (!sid || !sessions[sid]) return null;
  if (Date.now() - sessions[sid].createdAt > 24 * 3600 * 1000) { delete sessions[sid]; return null; }
  sessions[sid].lastActive = Date.now();
  return sessions[sid];
}
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

// ─── OTP store ────────────────────────────────────────────────────────────────
const otpStore = {};
function createOTP(mobile) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[mobile] = { otp, createdAt: Date.now(), expires: Date.now() + 5 * 60 * 1000 };
  console.log(`📱 OTP for ${mobile}: ${otp}`); // In production: send via SMS
  return otp;
}
function verifyOTP(mobile, otp) {
  const stored = otpStore[mobile];
  if (!stored) return false;
  if (Date.now() > stored.expires) { delete otpStore[mobile]; return false; }
  if (stored.otp !== otp) return false;
  delete otpStore[mobile];
  return true;
}

// ─── Audit logging ────────────────────────────────────────────────────────────
function addAuditLog(action, by, role, type = 'info', meta = {}) {
  const log = DB.read('audit_log.json');
  log.unshift({ id: generateId('LOG'), time: new Date().toISOString(), action, by, role, type, meta });
  if (log.length > 500) log.splice(500);
  DB.write('audit_log.json', log);
}

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, type = 'user') {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies['up_session'];
  const session = getSession(sid);
  if (!session) return null;
  if (type === 'admin' && !['chairman', 'secretary', 'monitor'].includes(session.role)) return null;
  if (type === 'user' && !['user'].includes(session.role)) return null;
  return session;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// AUTH ROUTES
async function handleAuth(req, res, method, segments) {
  const action = segments[2];

  if (action === 'register' && method === 'POST') {
    const body = await parseBody(req);
    const users = DB.read('users.json');
    if (users.find(u => u.mobile === body.mobile)) return sendJSON(res, 400, { error: 'এই মোবাইল নম্বর ইতিমধ্যে নিবন্ধিত' });
    if (users.find(u => u.nid === body.nid)) return sendJSON(res, 400, { error: 'এই NID নম্বর ইতিমধ্যে ব্যবহৃত' });
    const otp = createOTP(body.mobile);
    return sendJSON(res, 200, { success: true, message: 'OTP পাঠানো হয়েছে', otp_demo: otp });
  }

  if (action === 'verify-otp' && method === 'POST') {
    const body = await parseBody(req);
    if (!verifyOTP(body.mobile, body.otp)) return sendJSON(res, 400, { error: 'ভুল বা মেয়াদ উত্তীর্ণ OTP' });
    const users = DB.read('users.json');
    const newUser = {
      id: 'USR' + String(users.length + 1).padStart(3, '0'),
      nameBn: body.nameBn, nameEn: body.nameEn,
      fatherBn: body.fatherBn, fatherEn: body.fatherEn,
      motherBn: body.motherBn, motherEn: body.motherEn,
      dob: body.dob, gender: body.gender,
      nid: body.nid, mobile: body.mobile,
      addressBn: body.addressBn, union: body.union,
      passwordHash: hashPassword(body.password),
      verified: true, createdAt: new Date().toISOString()
    };
    users.push(newUser);
    DB.write('users.json', users);
    addAuditLog(`নতুন নিবন্ধন: ${newUser.nameBn} (${newUser.mobile})`, newUser.nameBn, 'user', 'info');
    return sendJSON(res, 201, { success: true, message: 'নিবন্ধন সফল! লগইন করুন।' });
  }

  if (action === 'login' && method === 'POST') {
    const body = await parseBody(req);
    const users = DB.read('users.json');
    const user = users.find(u => u.mobile === body.mobile && u.passwordHash === hashPassword(body.password));
    if (!user) return sendJSON(res, 401, { error: 'ভুল মোবাইল নম্বর বা পাসওয়ার্ড' });
    const sid = createSession(user.id, 'user');
    addAuditLog(`ব্যবহারকারী লগইন: ${user.nameBn}`, user.nameBn, 'user', 'info');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `up_session=${sid}; HttpOnly; Path=/; Max-Age=86400`,
    });
    const { passwordHash, ...safeUser } = user;
    return res.end(JSON.stringify({ success: true, user: safeUser }));
  }

  if (action === 'admin-login' && method === 'POST') {
    const body = await parseBody(req);
    const admins = DB.read('admins.json');
    const admin = admins.find(a => a.govId === body.govId && a.role === body.role && a.passwordHash === hashPassword(body.password));
    if (!admin) return sendJSON(res, 401, { error: 'ভুল তথ্য বা অননুমোদিত প্রবেশ' });
    const sid = createSession(admin.id, admin.role);
    addAuditLog(`অ্যাডমিন লগইন: ${admin.name} (${admin.role})`, admin.name, admin.role, 'admin');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `up_session=${sid}; HttpOnly; Path=/; Max-Age=86400`,
    });
    const { passwordHash, ...safeAdmin } = admin;
    return res.end(JSON.stringify({ success: true, admin: safeAdmin }));
  }

  if (action === 'logout' && method === 'POST') {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.up_session) delete sessions[cookies.up_session];
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'up_session=; HttpOnly; Path=/; Max-Age=0',
    });
    return res.end(JSON.stringify({ success: true }));
  }

  if (action === 'me' && method === 'GET') {
    const cookies = parseCookies(req.headers.cookie);
    const session = getSession(cookies.up_session);
    if (!session) return sendJSON(res, 401, { error: 'অনুমোদিত নন' });
    if (['chairman', 'secretary', 'monitor'].includes(session.role)) {
      const admins = DB.read('admins.json');
      const admin = admins.find(a => a.id === session.userId);
      if (!admin) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
      const { passwordHash, ...safe } = admin;
      return sendJSON(res, 200, { ...safe, sessionRole: session.role });
    } else {
      const users = DB.read('users.json');
      const user = users.find(u => u.id === session.userId);
      if (!user) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
      const { passwordHash, ...safe } = user;
      return sendJSON(res, 200, { ...safe, sessionRole: 'user' });
    }
  }

  sendJSON(res, 404, { error: 'Route not found' });
}

// USER ROUTES
async function handleUser(req, res, method, segments) {
  const session = requireAuth(req, 'user');
  if (!session) return sendJSON(res, 401, { error: 'লগইন প্রয়োজন' });
  const action = segments[2];

  if (action === 'profile' && method === 'GET') {
    const users = DB.read('users.json');
    const user = users.find(u => u.id === session.userId);
    if (!user) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
    const { passwordHash, ...safe } = user;
    return sendJSON(res, 200, safe);
  }

  if (action === 'profile' && method === 'PUT') {
    const body = await parseBody(req);
    const users = DB.read('users.json');
    const idx = users.findIndex(u => u.id === session.userId);
    if (idx < 0) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
    ['nameBn', 'nameEn', 'fatherBn', 'fatherEn', 'motherBn', 'motherEn', 'addressBn'].forEach(f => {
      if (body[f] !== undefined) users[idx][f] = body[f];
    });
    users[idx].updatedAt = new Date().toISOString();
    DB.write('users.json', users);
    addAuditLog(`প্রোফাইল আপডেট: ${users[idx].nameBn}`, users[idx].nameBn, 'user', 'info');
    const { passwordHash, ...safe } = users[idx];
    return sendJSON(res, 200, { success: true, user: safe });
  }

  if (action === 'applications' && method === 'GET') {
    const apps = DB.read('applications.json');
    return sendJSON(res, 200, apps.filter(a => a.userId === session.userId));
  }

  if (action === 'apply' && method === 'POST') {
    const body = await parseBody(req);
    const users = DB.read('users.json');
    const user = users.find(u => u.id === session.userId);
    const apps = DB.read('applications.json');
    const newApp = {
      id: 'APP-' + (100000 + apps.length + 1),
      userId: session.userId,
      type: body.type, typeName: body.typeName, typeIcon: body.typeIcon,
      userName: user.nameBn, userNameEn: user.nameEn,
      userNID: user.nid, userMobile: user.mobile,
      userFather: user.fatherBn, userMother: user.motherBn,
      userAddress: user.addressBn, userUnion: user.union,
      purpose: body.purpose, note: body.note || '',
      status: 'pending',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extraData: body.extraData || {},
      adminComment: '',
      timeline: [{ time: new Date().toISOString(), action: 'আবেদন জমা দেওয়া হয়েছে', by: user.nameBn }]
    };
    apps.unshift(newApp);
    DB.write('applications.json', apps);
    addAuditLog(`নতুন আবেদন: ${newApp.id} (${newApp.typeName}) - ${user.nameBn}`, user.nameBn, 'user', 'apply');
    return sendJSON(res, 201, { success: true, application: newApp });
  }

  sendJSON(res, 404, { error: 'Not found' });
}

// ADMIN ROUTES
async function handleAdmin(req, res, method, segments) {
  const session = requireAuth(req, 'admin');
  if (!session) return sendJSON(res, 401, { error: 'অ্যাডমিন অ্যাক্সেস প্রয়োজন' });
  const action = segments[2];

  if (action === 'dashboard' && method === 'GET') {
    const apps = DB.read('applications.json');
    const users = DB.read('users.json');
    return sendJSON(res, 200, {
      totalApps: apps.length,
      pending: apps.filter(a => a.status === 'pending').length,
      processing: apps.filter(a => a.status === 'processing').length,
      approved: apps.filter(a => a.status === 'approved').length,
      rejected: apps.filter(a => a.status === 'rejected').length,
      totalUsers: users.length,
      verifiedUsers: users.filter(u => u.verified).length,
      recentApps: apps.slice(0, 10),
    });
  }

  if (action === 'applications' && method === 'GET') {
    const parsedUrl = url.parse(req.url, true);
    const { status, type, userId } = parsedUrl.query;
    let apps = DB.read('applications.json');
    if (status) apps = apps.filter(a => a.status === status);
    if (type) apps = apps.filter(a => a.type === type);
    if (userId) apps = apps.filter(a => a.userId === userId);
    return sendJSON(res, 200, apps);
  }

  if (action === 'application' && method === 'GET') {
    const appId = segments[3];
    const apps = DB.read('applications.json');
    const app = apps.find(a => a.id === appId);
    if (!app) return sendJSON(res, 404, { error: 'আবেদন পাওয়া যায়নি' });
    return sendJSON(res, 200, app);
  }

  if (action === 'approve' && method === 'POST') {
    const body = await parseBody(req);
    const appId = body.appId;
    const apps = DB.read('applications.json');
    const admins = DB.read('admins.json');
    const admin = admins.find(a => a.id === session.userId);
    const idx = apps.findIndex(a => a.id === appId);
    if (idx < 0) return sendJSON(res, 404, { error: 'আবেদন পাওয়া যায়নি' });
    apps[idx].status = 'approved';
    apps[idx].approvedBy = admin?.name || 'অ্যাডমিন';
    apps[idx].approvedAt = new Date().toISOString();
    apps[idx].updatedAt = new Date().toISOString();
    apps[idx].adminComment = body.comment || '';
    if (body.editedName) apps[idx].userName = body.editedName;
    if (body.editedNameEn) apps[idx].userNameEn = body.editedNameEn;
    apps[idx].timeline.push({ time: new Date().toISOString(), action: `✅ অনুমোদিত${body.comment ? ' - ' + body.comment : ''}`, by: `${admin?.name} (${admin?.role === 'chairman' ? 'চেয়ারম্যান' : 'সচিব'})` });
    DB.write('applications.json', apps);
    addAuditLog(`আবেদন অনুমোদন: ${appId} - ${apps[idx].userName}`, admin?.name, session.role, 'approve', { appId });
    return sendJSON(res, 200, { success: true, application: apps[idx] });
  }

  if (action === 'reject' && method === 'POST') {
    const body = await parseBody(req);
    const apps = DB.read('applications.json');
    const admins = DB.read('admins.json');
    const admin = admins.find(a => a.id === session.userId);
    const idx = apps.findIndex(a => a.id === body.appId);
    if (idx < 0) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
    apps[idx].status = 'rejected';
    apps[idx].updatedAt = new Date().toISOString();
    apps[idx].adminComment = body.comment || 'বাতিল করা হয়েছে';
    apps[idx].timeline.push({ time: new Date().toISOString(), action: `❌ বাতিল - ${body.comment || 'কারণ উল্লেখ নেই'}`, by: admin?.name });
    DB.write('applications.json', apps);
    addAuditLog(`আবেদন বাতিল: ${body.appId}`, admin?.name, session.role, 'reject', { appId: body.appId });
    return sendJSON(res, 200, { success: true });
  }

  if (action === 'users' && method === 'GET') {
    const users = DB.read('users.json');
    return sendJSON(res, 200, users.map(u => { const { passwordHash, ...s } = u; return s; }));
  }

  if (action === 'user' && method === 'GET') {
    const userId = segments[3];
    const users = DB.read('users.json');
    const user = users.find(u => u.id === userId);
    if (!user) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
    const { passwordHash, ...safe } = user;
    const apps = DB.read('applications.json');
    return sendJSON(res, 200, { ...safe, applications: apps.filter(a => a.userId === userId) });
  }

  if (action === 'edit-user' && method === 'PUT') {
    const body = await parseBody(req);
    const users = DB.read('users.json');
    const admins = DB.read('admins.json');
    const admin = admins.find(a => a.id === session.userId);
    const idx = users.findIndex(u => u.id === body.userId);
    if (idx < 0) return sendJSON(res, 404, { error: 'পাওয়া যায়নি' });
    ['nameBn', 'nameEn', 'fatherBn', 'fatherEn', 'motherBn', 'motherEn', 'addressBn', 'dob', 'gender'].forEach(f => {
      if (body[f] !== undefined) users[idx][f] = body[f];
    });
    users[idx].updatedAt = new Date().toISOString();
    DB.write('users.json', users);
    addAuditLog(`অ্যাডমিন কর্তৃক ব্যবহারকারী আপডেট: ${users[idx].nameBn}`, admin?.name, session.role, 'edit');
    return sendJSON(res, 200, { success: true });
  }

  if (action === 'audit-log' && method === 'GET') {
    return sendJSON(res, 200, DB.read('audit_log.json'));
  }

  if (action === 'stats' && method === 'GET') {
    const apps = DB.read('applications.json');
    const users = DB.read('users.json');
    const typeCounts = {};
    apps.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; });
    return sendJSON(res, 200, { typeCounts, totalApps: apps.length, totalUsers: users.length, approved: apps.filter(a => a.status === 'approved').length, pending: apps.filter(a => a.status === 'pending').length });
  }

  sendJSON(res, 404, { error: 'Not found' });
}

// ─── Static file server ───────────────────────────────────────────────────────
function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ─── Main router ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();
  const segments = pathname.split('/').filter(Boolean);

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    return res.end();
  }

  if (segments[0] === 'api') {
    if (segments[1] === 'auth') return handleAuth(req, res, method, segments);
    if (segments[1] === 'user') return handleUser(req, res, method, segments);
    if (segments[1] === 'admin') return handleAdmin(req, res, method, segments);
    return sendJSON(res, 404, { error: 'API route not found' });
  }

  if (pathname === '/' || pathname === '/login') return serveStatic(req, res, path.join(__dirname, 'public', 'login.html'));
  if (pathname === '/register') return serveStatic(req, res, path.join(__dirname, 'public', 'register.html'));
  if (pathname === '/dashboard') return serveStatic(req, res, path.join(__dirname, 'public', 'dashboard.html'));
  if (pathname === '/admin') return serveStatic(req, res, path.join(__dirname, 'public', 'admin.html'));
  if (pathname === '/certificate') return serveStatic(req, res, path.join(__dirname, 'public', 'certificate.html'));

  const staticPath = path.join(__dirname, 'public', pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    return serveStatic(req, res, staticPath);
  }

  res.writeHead(302, { Location: '/' });
  res.end();
});

// ─── Start ────────────────────────────────────────────────────────────────────
seedData();
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   🇧🇩 ইউনিয়ন পরিষদ ডিজিটাল সেবা পোর্টাল     ║
║   Server running at http://localhost:${PORT}       ║
╠════════════════════════════════════════════════╣
║  📌 Pages:                                     ║
║   /login      → নাগরিক লগইন                   ║
║   /register   → নিবন্ধন                        ║
║   /dashboard  → ব্যবহারকারী ড্যাশবোর্ড         ║
║   /admin      → অ্যাডমিন প্যানেল               ║
╠════════════════════════════════════════════════╣
║  👮 Demo Admins (govId / role / pass):         ║
║   GOV-1234-ABCD / chairman / admin123          ║
║   GOV-5678-EFGH / secretary / sec123           ║
╚════════════════════════════════════════════════╝
  `);
});
