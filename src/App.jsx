import AdminArea from './pages/AdminArea'
import BookingPage from './pages/BookingPage'

export default function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'

  if (normalizedPath === '/yonetim' || normalizedPath.startsWith('/yonetim/')) {
    return <AdminArea />
  }

  return <BookingPage />
}
