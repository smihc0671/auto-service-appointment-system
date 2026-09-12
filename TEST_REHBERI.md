# SAYGILI FORD — v8 Tam Otomasyon / Temiz Test Paketi

Bu paket test verisini gerçek müşteri verisinden ayırmak için oluşturduğu tüm
canlı randevuların adını `E2E TEST ...`, notunu `[E2E] ...` ile işaretler.

Test öncesinde eski E2E kalıntıları temizlenir.
Her canlı test kendi `finally` bloğunda temizlenir.
Playwright global teardown sonunda tekrar temizler.
`TEST_TAM_TEMIZ.cmd` test komutu FAIL olsa bile son kez ayrıca cleanup çalıştırır.

Yani normal test akışında **kalıntı bırakmamak için dört kat temizlik** vardır.

## 1. Kurulum

ZIP içeriğini mevcut `oto-randevu` proje klasörünün üzerine kopyalayın.

Yeni / değişen test dosyaları:
- `playwright.config.js`
- `tests/e2e/...`
- `tests/security/...`
- `.env.e2e.example`
- `TEST_TAM_TEMIZ.cmd`
- `SADECE_TEMIZLE.cmd`
- `TEST_GUVENLIK.cmd`

Uygulama kaynak kodu değiştirilmez.

Playwright zaten kuruluysa ekstra paket gerekmez.
Değilse:

```powershell
npm.cmd install -D @playwright/test
npx.cmd playwright install chromium
```

## 2. Canlı testi aç

Proje kökünde `.env.e2e.local` oluştur:

```env
E2E_LIVE=1
E2E_ADMIN_EMAIL=ADMIN_MAILIN
E2E_ADMIN_PASSWORD=ADMIN_SIFREN
```

`.env.local` içindeki mevcut Firebase VITE_* değerleri aynen kalmalıdır.

Admin şifresi test koduna yazılmaz.

## 3. Tek komutla tam test

PowerShell:

```powershell
.\TEST_TAM_TEMIZ.cmd
```

veya:

```powershell
npx.cmd playwright test --project=chromium --workers=1
node tests\e2e\cleanup-e2e.mjs
```

## 4. Test edilen başlıklar

### Müşteri formu
- telefon formatı
- plaka normalizasyonu
- model yılı temizliği
- kilometre temizliği
- 500 karakter açıklama sınırı
- boş model yılı
- 1950 öncesi yıl
- boş kilometre
- yakıt seçimi
- `Randevuyu Onayla` metni
- marka/model input hizası

### Ağ / tarih davranışı
- offline uyarısı
- offline iken kayıt butonunun devre dışı olması
- tarih inputunda geçmiş gün engeli
- kapalı gün mesajı

### Responsive / görsel altyapı
- 375px, 390px, 412px mobil
- tablet
- laptop
- 1920 desktop
- yatay overflow kontrolü
- mobil hero yüksekliği
- Street View görselinin gerçekten yüklenmesi
- Google Maps yol tarifi linki

### Planlama motoru
- 30 dk slot
- 60 / 90 / 120 / 180 / 480 dk işlemler
- slot yuvarlama
- iki lift
- tek lift
- üç lift
- çakışan iş
- kapanış saatini aşmama
- çalışma dışı gün
- tek lift doluyken diğer liftin kullanılabilmesi

### Fiyat motoru
- taban fiyat
- marka kuralı
- yakıt kuralı
- model kuralı
- yıl min/max sınırı
- en spesifik kural önceliği
- fiyat yayını kapalı
- hizmet fiyatı pasif
- sıfır/negatif fiyat reddi

### Firestore read-cache
- TTL cache
- aynı anda gelen isteklerin tek Firestore isteğine dönüşmesi
- `force` yenileme
- prefix invalidation

### Admin ayar ekranı
- toplu Tüm İşlemleri Göster / Gizle
- hizmetlerde tek genel kaydetme
- Saat + Ek dakika süre yönetimi
- ayrı Fiyat Ayarlarını Kaydet

### Admin
- yanlış login reddi
- doğru admin login
- canlı randevuyu aramada bulma
- `Planlandı -> Araç Geldi -> İşlemde -> Tamamlandı`
- randevu silme

### Canlı 2-lift / kapasite
Test gerçek Firestore'a test randevuları yazar ama E2E olarak işaretler:
- mevcut ayarlardaki gerçek `resourceCount` okunur
- tüm liftleri boş bir gelecek slot seçilir
- kapasite kadar randevu aynı saate alınır
- kapasite dolunca saat müşteriden kaybolur
- bir randevu iptal edilir
- saat tekrar açılır

### Gerçek yarış koşulu
Aynı slotu `resourceCount + 1` ayrı browser context aynı anda almaya çalışır.

Örneğin 2 lift ise:
- 3 tarayıcı aynı anda `Randevuyu Onayla`
- tam 2 kayıt başarılı olmalı
- 1 kayıt engellenmeli
- Firestore'da tam 2 appointment kalmalı
- resource numaraları farklı olmalı

Bu test transaction / çift-randevu korumasının en önemli testidir.

### Firestore Security Rules
`TEST_GUVENLIK.cmd`:
- public services okuma
- public shopSettings okuma
- public reservations okuma
- publicPricing okuma
- appointments anonim okuma RED
- pricingConfig anonim okuma RED
- admins anonim okuma RED
- services anonim yazma RED
- shopSettings anonim update RED
- pricingConfig anonim yazma RED
- admin appointments okuma
- admin pricingConfig okuma

## 5. Kalıntı kalırsa

Herhangi bir nedenle bilgisayar kapanır / test terminali öldürülürse:

```powershell
.\SADECE_TEMIZLE.cmd
```

veya:

```powershell
node tests\e2e\cleanup-e2e.mjs
```

Bu script **yalnız**:
- adı `E2E TEST` ile başlayan
- veya notunda `[E2E]` bulunan

randevuları ve onlara bağlı `reservations` kayıtlarını siler.

Normal müşteri kayıtlarına dokunmaz.

## 6. Rapor

Testten sonra:

```powershell
npx.cmd playwright show-report
```

PowerShell policy nedeniyle `npx` yerine özellikle `npx.cmd` kullanın.

FAIL olursa Playwright:
- screenshot
- trace
- video

saklar.
