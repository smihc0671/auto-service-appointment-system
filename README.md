# Oto Servis Randevu - MVP

Bu paket, mevcut Vite + React projesine kopyalanmak üzere hazırlanmıştır.
Müşteriler giriş yapmadan randevu oluşturur; yalnız yetkili iki yönetici randevuları görebilir.

## 1. Dosyaları projeye kopyala

Bu paketteki `src`, `public`, `index.html`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` ve `.env.example` dosyalarını mevcut `oto-randevu` proje klasörüne kopyala.

## 2. Firebase paketini kur

PowerShell:

```powershell
npm.cmd install firebase
```

## 3. Firebase projesi oluştur

Firebase Console'da yeni proje oluştur ve Web App ekle. Sana verilen `firebaseConfig` değerlerini kullan.

Proje kökünde `.env.local` oluştur:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Not: Firebase web yapılandırması tarayıcıda bulunabilir; veri güvenliği Firestore Rules ve yönetici yetkilendirmesiyle sağlanır. `.env.local` yine de Git'e eklenmemelidir.

## 4. Firestore oluştur

Firebase Console -> Firestore Database -> Create database.

Ardından Rules sekmesine bu projedeki `firestore.rules` içeriğini yapıştır ve Publish de.

## 5. Yönetici hesaplarını oluştur

Firebase Console -> Authentication -> Sign-in method -> Email/Password yöntemini aç.

Authentication -> Users bölümünden yalnız kullanacağınız hesapları oluştur.

Her kullanıcı için UID'yi kopyala.

Firestore'da `admins` koleksiyonu oluştur. Belge ID'si kullanıcının UID'si olmalı.

Örnek:

```text
admins
  └── FIREBASE_UID
       ├── active: true
       └── name: "Semih"
```

Baban için de ikinci UID ile aynı şekilde belge oluştur.

## 6. Dükkan bilgilerini düzenle

`src/config/shopConfig.js` dosyasını aç.

Buradan:
- Dükkan adı
- Açıklama
- Telefon
- Adres
- Çalışma günleri
- Çalışma saatleri
- Randevu aralığı
- Hizmet listesi

değiştirilebilir.

## 7. Local çalıştır

```powershell
npm.cmd run dev
```

Müşteri ekranı:

```text
http://localhost:5173/
```

Yönetim ekranı:

```text
http://localhost:5173/yonetim
```

## 8. Üretim build'i

```powershell
npm.cmd run build
```

Başarılı olursa `dist` klasörü oluşur.

## 9. Firebase Hosting'e yayınlama

Firebase CLI kur:

```powershell
npm.cmd install -g firebase-tools
firebase.cmd login
firebase.cmd use --add
firebase.cmd deploy
```

PowerShell execution policy nedeniyle `firebase` çalışmazsa `firebase.cmd` kullan.

## Sistem davranışı

### Müşteri
- Üye olmaz.
- Ad, telefon, araç, plaka, işlem, tarih ve saat seçer.
- Dolu saatleri seçemez.
- Aynı saate iki kişinin aynı anda kayıt yapması Firestore slot belgesi ile engellenir.
- Başarılı kayıttan sonra kısa randevu kodu görür.

### Yönetici
- E-posta + şifre ile giriş yapar.
- Ayrıca UID'sinin Firestore `admins` koleksiyonunda `active: true` olması gerekir.
- Tarihe göre randevuları görür.
- Bekliyor / Onaylandı / Tamamlandı / İptal Edildi durumlarını yönetir.
- İptal edilen randevunun saati yeniden müşterilere açılır.
- Randevuyu kalıcı olarak silebilir.
- Müşteri sayfasının linkini kopyalayabilir.

## Güvenlik özeti

- `appointments` koleksiyonunu müşteriler okuyamaz.
- Müşteri yalnız yeni randevu oluşturabilir.
- `slots` koleksiyonunda kişisel veri tutulmaz ve yalnız dolu saat bilgisini sağlar.
- Yönetim erişimi sadece Auth hesabı + `admins/{uid}` belgesi bulunan kullanıcıya verilir.
- Yönetici kaydı istemci tarafından oluşturulamaz veya değiştirilemez.

## İlk test listesi

1. Müşteri sayfası açılıyor mu?
2. Kapalı gün seçildiğinde saatler kapanıyor mu?
3. Randevu oluşturuluyor mu?
4. Aynı saat ikinci kez alınamıyor mu?
5. Yönetici olmayan hesap `/yonetim` verilerini göremiyor mu?
6. Yönetici randevuyu görebiliyor mu?
7. Randevu iptal edilince saat yeniden açılıyor mu?
8. Randevu silinince ilgili slot da siliniyor mu?
9. Telefon ekranında sayfa düzgün görünüyor mu?
10. `npm.cmd run build` hatasız tamamlanıyor mu?
