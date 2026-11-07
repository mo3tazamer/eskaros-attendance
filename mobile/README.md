# تطبيق Android (APK) — بوابة الموظفين

غلاف **Capacitor** يفتح نفس تطبيق الويب المنشور (`https://YOUR-SERVER...`) داخل إطار
أصلي، فيظهر على الهاتف كتطبيق مثبت بأيقونة. **لا يوجد كود مكرر** — كل تحديث على
السيرفر يظهر فورًا في الـ APK بدون إعادة بناء.

## المتطلبات (للبناء فقط — ليست مطلوبة للتشغيل)

- Node.js 20+.
- **Java 17+** و **Android Studio / Android SDK** لاستخراج ملف APK.
- رابط السيرفر المنشور **HTTPS** (ضروري لـ Android + PWA).

> إذا لم يتوفر Android Studio على جهازك، استخدم **PWABuilder**
> (<https://www.pwabuilder.com>) — رفع رابط الـ HTTPS المنشور وإنتاج APK
> (TWA) بدون تثبيت أي SDK. راجع «المسار B» بالأسفل.

---

## الخطوات (المسار A — Capacitor محليًا)

1. **نشر السيرفر أولًا** (Render / Railway) والحصول على رابط HTTPS — راجع
   `../README.md` قسم «النشر السحابي».

2. عدّل `capacitor.config.json` واستبدل `YOUR-SERVER.onrender.com` برابطك:

   ```json
   "server": {
     "url": "https://eskaros-attendance.onrender.com",
     "cleartext": false,
     "allowNavigation": ["eskaros-attendance.onrender.com"]
   }
   ```

   > `cleartext: false` مهم — يمنع أي اتصال غير مشفر.
   > لا تستخرج APK إلا بعد التأكد أن الرابط HTTPS يعمل في Chrome.

3. من داخل مجلد `mobile`:

   ```
   npm install
   npx cap add android
   npx cap sync
   ```

4. افتح المشروع:

   ```
   npx cap open android
   ```

5. من Android Studio: **Build → Generate Signed Bundle / APK** (أو من سطر الأوامر):

   ```
   cd android
   gradlew assembleDebug
   ```

   يخرج الملف: `android/app/build/outputs/apk/debug/app-debug.apk`

6. انسخ الـ APK على الهواتف وثبّته (اسمح بـ «تثبيت من مصادر غير معروفة» عند الحاجة).

## المسار B — PWABuilder (بدون تثبيت)

1. في Chrome على الهاتف افتح رابط الـ HTTPS.
2. افتح <https://www.pwabuilder.com> وأدخل الرابط → **Build APK** (أو من المتصفح:
   قائمة Chrome ← «تثبيت التطبيق»).
3. نزّل ملف APK وثبّته.

هذا يعطيك نفس التجربة (أيقونة + شاشة كاملة) بدون Java/Android Studio.

---

## ملاحظات مهمة

- الـ APK **غلاف** — لا يعمل بدون إنترنت ولا يحفظ البيانات على الهاتف.
  البيانات على السيرفر المنشور، والجلسة عبر كوكيز آمنة (`HttpOnly` + `Secure`).
- لو غيّرت رابط السيرفر، حدّث `capacitor.config.json` وأعد البناء.
- شارك رابط التحديث مع الموظفين عند أي تغيير كبير في الواجهة؛ التحديث على
  السيرفر يكفي — الـ APK يبقى كما هو.
