import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import SetupRequired from '../components/SetupRequired'
import { auth, db, firebaseReady } from '../firebase'
import AdminDashboardPage from './AdminDashboardPage'
import AdminLoginPage from './AdminLoginPage'

export default function AdminArea() {
  const [checking, setChecking] = useState(true)
  const [adminProfile, setAdminProfile] = useState(null)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    if (!firebaseReady || !auth || !db) {
      setChecking(false)
      return undefined
    }

    return onAuthStateChanged(auth, async (user) => {
      setChecking(true)

      if (!user) {
        setAuthenticated(false)
        setAdminProfile(null)
        setChecking(false)
        return
      }

      try {
        const adminSnapshot = await getDoc(doc(db, 'admins', user.uid))
        if (adminSnapshot.exists() && adminSnapshot.data()?.active === true) {
          setAuthenticated(true)
          setAdminProfile(adminSnapshot.data())
        } else {
          await signOut(auth)
          setAuthenticated(false)
          setAdminProfile(null)
        }
      } catch (error) {
        console.error(error)
        await signOut(auth)
        setAuthenticated(false)
        setAdminProfile(null)
      } finally {
        setChecking(false)
      }
    })
  }, [])

  if (!firebaseReady) return <SetupRequired />

  if (checking) {
    return (
      <main className="page-shell narrow-shell">
        <section className="card setup-card"><p>Oturum kontrol ediliyor...</p></section>
      </main>
    )
  }

  if (!authenticated) return <AdminLoginPage />
  return <AdminDashboardPage adminProfile={adminProfile} />
}
