export default function SetupRequired() {
  return (
    <main className="page-shell narrow-shell">
      <section className="card setup-card">
        <div className="brand-mark" aria-hidden="true">OS</div>
        <h1>Firebase bağlantısı bekleniyor</h1>
        <p>
          Projenin arayüzü hazır. Firebase Console üzerinden oluşturacağın web uygulamasının
          yapılandırma değerlerini <code>.env.local</code> dosyasına eklemen gerekiyor.
        </p>
        <p className="muted">
          Ayrıntılı adımlar proje ile birlikte verilen README ve Word rehberinde bulunuyor.
        </p>
      </section>
    </main>
  )
}
