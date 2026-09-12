import { useState } from 'react'
import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import BrandHeader from '../components/BrandHeader'
import { auth, db } from '../firebase'

function loginErrorMessage(error) {
  const knownCodes = [
    'auth/invalid-credential',
    'auth/invalid-email',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/wrong-password',
  ]

  if (knownCodes.includes(error?.code)) {
    return 'E-posta veya şifre hatalı.'
  }

  return error?.message || 'Giriş sırasında bir hata oluştu.'
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await setPersistence(auth, browserSessionPersistence)

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      )
      const adminSnapshot = await getDoc(doc(db, 'admins', credential.user.uid))

      if (!adminSnapshot.exists() || adminSnapshot.data()?.active !== true) {
        await signOut(auth)
        throw new Error('Bu hesap yönetici olarak yetkilendirilmemiş.')
      }
    } catch (loginError) {
      console.error(loginError)
      setError(loginErrorMessage(loginError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <BrandHeader admin />
      <main className="page-shell narrow-shell">
        <section className="card login-card">
          <p className="eyebrow">Sadece Yetkili Kullanıcılar</p>
          <h2>Yönetici girişi</h2>
          <p className="muted">Randevuları görüntülemek ve yönetmek için giriş yap.</p>

          {error && <div className="alert alert-error" role="alert"><span>{error}</span></div>}

          <form onSubmit={handleSubmit}>
            <label>
              <span>E-posta</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label>
              <span>Şifre</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <button className="primary-button submit-button" disabled={loading} type="submit">
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <a className="back-link" href="/">← Randevu sayfasına dön</a>
        </section>
      </main>
    </>
  )
}
