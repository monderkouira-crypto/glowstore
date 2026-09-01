# GlowStore DZ — التعديل والنشر على Google Cloud

هذه الحزمة أصبحت قابلة للعمل كموقع مستقل في خدمة واحدة:

- واجهة المتجر React/Vite
- API للمنتجات والطلبات
- PostgreSQL لحفظ المنتجات والطلبات
- Google Cloud Storage لحفظ صور المنتجات
- Dockerfile جاهز لـ Google Cloud Run

## التشغيل المحلي على Windows

افتح PowerShell داخل مجلد المشروع، ثم شغّل:

```powershell
corepack enable
pnpm install
pnpm dev
```

يمكنك أيضاً تشغيل نفس الأمر عبر:

```powershell
npm run dev
```

سيشغّل الأمر الواجهة على `http://localhost:19800` والـ API على `http://localhost:8080`، مع تمرير طلبات `/api` تلقائياً إلى الخادم. إذا كانت قاعدة البيانات خارجية، عرّف `DATABASE_URL` في PowerShell قبل التشغيل:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/glowstore"
pnpm dev
```

لا تحتاج إلى أوامر `sh` أو `bash` أو متغيرات بصيغة Linux. المشروع يثبت تلقائياً نسخ `esbuild` و`rollup` و`lightningcss` المناسبة لـ Windows وLinux وmacOS.

## فتح المشروع في Visual Studio Code

1. فك الضغط عن الملف `glowstore-dz-google-cloud.zip`.
2. افتح المجلد المفكوك في Visual Studio Code.
3. ثبّت Node.js 22 أو أحدث.
4. افتح الطرفية داخل المجلد وشغّل:

```bash
corepack enable
pnpm install
```

للتعديل:

- الواجهة والوظائف الرئيسية: `artifacts/glowstore-dz/src/App.tsx`
- تصميم الموقع: `artifacts/glowstore-dz/src/index.css`
- API المنتجات والطلبات: `artifacts/api-server/src/routes/`
- مخطط قاعدة البيانات: `lib/db/src/schema/`

## تشغيله محلياً

شغّل خادمين في طرفيتين منفصلتين:

```bash
pnpm --filter @workspace/api-server run dev
```

```bash
PORT=19800 BASE_PATH=/ pnpm --filter @workspace/glowstore-dz run dev
```

يحتاج الخادم إلى `DATABASE_URL` ومتغيرات التخزين الموجودة في ملف `.env` المحلي. لا تضع كلمات المرور أو المفاتيح داخل ملفات المشروع.

## النشر المستقل على Google Cloud Run

Cloud Run هو الخيار المناسب لهذا المشروع لأنه يشغّل الواجهة وAPI معاً داخل نفس الموقع.

### 1. تجهيز Google Cloud

ثبّت Google Cloud CLI، ثم سجّل الدخول واختر المشروع:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com storage.googleapis.com sqladmin.googleapis.com
```

أنشئ bucket لصور المنتجات:

```bash
gcloud storage buckets create gs://YOUR_BUCKET_NAME \
  --location=YOUR_REGION \
  --uniform-bucket-level-access
```

أنشئ PostgreSQL على Cloud SQL أو استخدم PostgreSQL مُداراً من مزود موثوق. أنشئ قاعدة باسم `glowstore`، ثم جهّز قيمة `DATABASE_URL`.

### 2. تجهيز قاعدة البيانات

من جهازك أو Cloud Shell، اضبط رابط قاعدة البيانات مؤقتاً ثم ادفع الجداول:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/glowstore'
pnpm --filter @workspace/db run push
```

لا تحفظ هذا الرابط في Git أو داخل ملف ZIP عام. في Cloud Run استخدم Secret Manager.

### 3. إعطاء Cloud Run صلاحية التخزين

بعد أول نشر، خذ حساب الخدمة المستخدم من Cloud Run وأعطه صلاحية إدارة كائنات bucket:

```bash
gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET_NAME \
  --member='serviceAccount:YOUR_CLOUD_RUN_SERVICE_ACCOUNT' \
  --role='roles/storage.objectAdmin'
```

### 4. النشر

نفّذ الأمر من جذر المشروع:

```bash
gcloud run deploy glowstore-dz \
  --source . \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --set-env-vars OBJECT_STORAGE_PROVIDER=google,PRIVATE_OBJECT_DIR=/YOUR_BUCKET_NAME/glowstore-private \
  --set-secrets DATABASE_URL=glowstore-database-url:latest
```

إذا كانت قاعدة Cloud SQL، أضف اتصال Cloud SQL إلى أمر النشر:

```bash
--add-cloudsql-instances=YOUR_PROJECT_ID:YOUR_REGION:YOUR_SQL_INSTANCE
```

بعد اكتمال النشر، سيعطيك Google رابطاً مستقلاً بصيغة `https://...run.app`.

## ملاحظات مهمة

- لا ترفع ملف `.env` أو كلمات مرور قاعدة البيانات إلى GitHub أو داخل ZIP عام.
- استخدم Secret Manager لقيمة `DATABASE_URL`.
- استخدم bucket خاصاً، فالموقع يمرر صور المنتجات عبر API.
- Dockerfile يضبط `OBJECT_STORAGE_PROVIDER=google` حتى لا يعتمد النشر على Replit.
- عند إضافة أعمدة جديدة إلى قاعدة البيانات، شغّل `pnpm --filter @workspace/db run push` على قاعدة الإنتاج بعد مراجعة التغيير.