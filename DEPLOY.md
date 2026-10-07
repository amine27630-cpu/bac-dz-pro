# نشر BAC DZ PRO على سيرفر

## 1) المتطلبات
- سيرفر Linux أو خدمة استضافة تدعم Docker.
- دومين مثل bacdzpro.com.
- فتح المنفذ 80 و443 إذا كنت ستستخدم HTTPS عبر reverse proxy.

## 2) إعداد البيئة
انسخ `.env.production.example` إلى `.env`، ثم غيّر:
- JWT_SECRET
- ADMIN_EMAIL
- ADMIN_PASSWORD
- CORS_ORIGIN

لا تشارك ملف `.env`.

## 3) التشغيل
```bash
docker compose up -d --build
```

اختبر:
```bash
curl http://localhost:3000/api/health
```

يجب أن ترى JSON فيه `"ok": true`.

## 4) البيانات
قاعدة SQLite محفوظة في Docker volume باسم `bacdz_data`، لذلك إعادة تشغيل الحاوية لا تحذف بيانات الطلاب.

## 5) HTTPS
لا تعرض المنصة مباشرة على الإنترنت بدون HTTPS.
ضع أمامها reverse proxy مثل Caddy أو Nginx واربط الدومين بالسيرفر.

مثال Caddy:
```text
yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 6) قبل الإطلاق
- غيّر كلمة مرور Admin.
- استخدم JWT_SECRET عشوائي طويل.
- فعّل HTTPS.
- اعمل نسخًا احتياطية دورية.
- لا تضع الأسرار في GitHub.

## ملاحظة
SQLite مناسب كبداية لمنصة صغيرة/متوسطة. عند ارتفاع عدد المستخدمين والاختبارات، يمكن نقل قاعدة البيانات إلى PostgreSQL مع الحفاظ على API والواجهة.
