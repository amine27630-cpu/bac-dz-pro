# BAC DZ PRO v3 — Backend حقيقي

## ماذا يحتوي؟
- Node.js + Express
- SQLite قاعدة بيانات دائمة
- bcrypt لتشفير كلمات المرور
- JWT لتسجيل الدخول والجلسات
- صلاحيات `student` و `admin`
- لوحة Admin
- إدارة الطلاب
- إضافة وحذف أسئلة QCM
- تسجيل محاولات الاختبار والنتائج
- حماية Helmet + Rate Limiting + CORS
- واجهة RTL متجاوبة

## المتطلبات
Node.js 20 أو أحدث.

## التشغيل المحلي
1. انسخ `.env.example` إلى `.env`.
2. غيّر `JWT_SECRET` إلى قيمة عشوائية طويلة (32 حرفًا أو أكثر).
3. ضع بريد وكلمة مرور المدير في `ADMIN_EMAIL` و `ADMIN_PASSWORD`.
4. نفّذ:
   `npm install`
5. ثم:
   `npm start`
6. افتح:
   `http://localhost:3000`

## مهم
- لا ترفع ملف `.env` إلى GitHub.
- قاعدة البيانات تُنشأ تلقائيًا في `data/bacdz.sqlite`.
- في الإنتاج استخدم HTTPS، قيمة JWT سرية قوية، وكلمة مرور Admin قوية.
- SQLite مناسب كبداية ومشروع صغير/متوسط. عند نمو المنصة يمكن نقل قاعدة البيانات إلى PostgreSQL بدون تغيير فكرة الـ API.

## الحساب الإداري
يُنشأ تلقائيًا في أول تشغيل إذا كانت `ADMIN_EMAIL` و`ADMIN_PASSWORD` موجودتين ولم يكن الحساب موجودًا.

## API الأساسي
- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/me`
- GET `/api/questions`
- POST `/api/quiz/submit`
- GET `/api/admin/stats`
- GET `/api/admin/users`
- DELETE `/api/admin/users/:id`
- GET `/api/admin/questions`
- POST `/api/admin/questions`
- DELETE `/api/admin/questions/:id`
