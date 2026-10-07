require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set and be at least 32 characters.");
}

const dbFile = process.env.DB_FILE || "./data/bacdz.sqlite";
fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  branch TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
  avg REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  branch TEXT NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
  if (!exists) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare("INSERT INTO users(name,email,password_hash,branch,role) VALUES(?,?,?,?,?)")
      .run("مدير المنصة", adminEmail, hash, "الإدارة", "admin");
    console.log(`Admin created: ${adminEmail}`);
  }
}

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "100kb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

function signUser(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d", issuer: "bac-dz-pro" }
  );
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { issuer: "bac-dz-pro" });
    next();
  } catch { return res.status(401).json({ error: "جلسة غير صالحة أو منتهية" }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "هذه الصفحة للمدير فقط" });
  next();
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function publicUser(id) {
  return db.prepare("SELECT id,name,email,branch,role,avg,created_at FROM users WHERE id=?").get(id);
}

app.get("/api/health", (req,res)=>res.json({ok:true, service:"BAC DZ PRO", time:new Date().toISOString()}));

app.post("/api/auth/register", authLimiter, (req,res)=>{
  const {name,email,password,branch} = req.body || {};
  if (!name || name.trim().length < 2) return res.status(400).json({error:"الاسم غير صالح"});
  if (!validEmail(email || "")) return res.status(400).json({error:"البريد الإلكتروني غير صالح"});
  if (!password || password.length < 8) return res.status(400).json({error:"كلمة المرور يجب أن تكون 8 أحرف على الأقل"});
  if (!branch) return res.status(400).json({error:"اختر الشعبة"});
  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare("INSERT INTO users(name,email,password_hash,branch) VALUES(?,?,?,?)")
      .run(name.trim(), email.trim().toLowerCase(), hash, branch);
    const user = publicUser(result.lastInsertRowid);
    res.status(201).json({token:signUser(user), user});
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({error:"البريد الإلكتروني مسجل مسبقًا"});
    console.error(e); res.status(500).json({error:"حدث خطأ في الخادم"});
  }
});

app.post("/api/auth/login", authLimiter, (req,res)=>{
  const {email,password} = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get((email||"").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.password_hash))
    return res.status(401).json({error:"البريد الإلكتروني أو كلمة المرور غير صحيحة"});
  res.json({token:signUser(user), user:publicUser(user.id)});
});

app.get("/api/me", apiLimiter, auth, (req,res)=>{
  const user = publicUser(req.user.sub);
  if (!user) return res.status(404).json({error:"المستخدم غير موجود"});
  const attempts = db.prepare("SELECT id,score,total,created_at FROM quiz_attempts WHERE user_id=? ORDER BY id DESC LIMIT 10").all(user.id);
  res.json({user, attempts});
});

app.get("/api/questions", apiLimiter, auth, (req,res)=>{
  const branch = req.query.branch || publicUser(req.user.sub)?.branch;
  const subject = req.query.subject || null;
  let sql = `SELECT id,subject,branch,question,option_a,option_b,option_c,option_d FROM questions WHERE (branch=? OR branch='عام')`;
  const args = [branch];
  if (subject) { sql += " AND subject=?"; args.push(subject); }
  sql += " ORDER BY id DESC LIMIT 50";
  res.json({questions:db.prepare(sql).all(...args)});
});

app.post("/api/quiz/submit", apiLimiter, auth, (req,res)=>{
  const {answers} = req.body || {};
  if (!Array.isArray(answers) || answers.length === 0) return res.status(400).json({error:"لا توجد إجابات"});
  const ids = answers.map(x=>Number(x.id)).filter(Number.isInteger);
  if (!ids.length) return res.status(400).json({error:"إجابات غير صالحة"});
  const placeholders = ids.map(()=>"?").join(",");
  const rows = db.prepare(`SELECT id,correct_index FROM questions WHERE id IN (${placeholders})`).all(...ids);
  const map = new Map(rows.map(r=>[r.id,r.correct_index]));
  let score=0;
  for (const a of answers) if (map.has(Number(a.id)) && Number(a.answer)===map.get(Number(a.id))) score++;
  const total = rows.length;
  db.prepare("INSERT INTO quiz_attempts(user_id,score,total) VALUES(?,?,?)").run(req.user.sub,score,total);
  const avg = total ? Math.round((score/total)*2000)/100 : 0;
  db.prepare("UPDATE users SET avg=? WHERE id=?").run(avg,req.user.sub);
  res.json({score,total,percentage:total?Math.round(score/total*100):0});
});

app.get("/api/admin/stats", apiLimiter, auth, adminOnly, (req,res)=>{
  const students = db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n;
  const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n;
  const questions = db.prepare("SELECT COUNT(*) n FROM questions").get().n;
  const attempts = db.prepare("SELECT COUNT(*) n FROM quiz_attempts").get().n;
  res.json({students,admins,questions,attempts});
});

app.get("/api/admin/users", apiLimiter, auth, adminOnly, (req,res)=>{
  const users = db.prepare("SELECT id,name,email,branch,role,avg,created_at FROM users ORDER BY id DESC LIMIT 500").all();
  res.json({users});
});

app.delete("/api/admin/users/:id", apiLimiter, auth, adminOnly, (req,res)=>{
  const id=Number(req.params.id);
  if (id===req.user.sub) return res.status(400).json({error:"لا يمكنك حذف حسابك الحالي"});
  const result=db.prepare("DELETE FROM users WHERE id=? AND role='student'").run(id);
  if (!result.changes) return res.status(404).json({error:"الطالب غير موجود"});
  res.json({ok:true});
});

app.get("/api/admin/questions", apiLimiter, auth, adminOnly, (req,res)=>{
  res.json({questions:db.prepare("SELECT * FROM questions ORDER BY id DESC LIMIT 500").all()});
});

app.post("/api/admin/questions", apiLimiter, auth, adminOnly, (req,res)=>{
  const {subject,branch,question,options,correctIndex}=req.body||{};
  if (!subject||!branch||!question||!Array.isArray(options)||options.length!==4||![0,1,2,3].includes(Number(correctIndex)))
    return res.status(400).json({error:"بيانات السؤال غير مكتملة"});
  const r=db.prepare(`INSERT INTO questions(subject,branch,question,option_a,option_b,option_c,option_d,correct_index)
    VALUES(?,?,?,?,?,?,?,?)`).run(subject,branch,question,...options.map(String),Number(correctIndex));
  res.status(201).json({id:r.lastInsertRowid});
});

app.delete("/api/admin/questions/:id", apiLimiter, auth, adminOnly, (req,res)=>{
  const r=db.prepare("DELETE FROM questions WHERE id=?").run(Number(req.params.id));
  if(!r.changes) return res.status(404).json({error:"السؤال غير موجود"});
  res.json({ok:true});
});

app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`BAC DZ PRO running on http://localhost:${PORT}`));
