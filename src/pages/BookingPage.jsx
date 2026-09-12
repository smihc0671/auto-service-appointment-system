import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BrandHeader from '../components/BrandHeader'
import SetupRequired from '../components/SetupRequired'
import { FUEL_TYPES, SHOP_CONFIG } from '../config/shopConfig'
import {
  FORD_MODEL_CATALOG,
  getServiceOptionsForVehicle,
  resolveVehicleModelId,
} from '../config/servicePlanning'
import { firebaseReady } from '../firebase'
import {
  createAppointment,
  findFirstAvailableDate,
  getAvailabilityForDate,
  getBookingBootstrap,
} from '../services/appointments'
import {
  addDays,
  dateFromInput,
  formatDateTR,
  getDateBounds,
  isWorkingDay,
  isValidPlate,
  normalizeMileage,
  normalizePhone,
  normalizePlainText,
  normalizePlate,
  normalizeVehicleYear,
  phoneDigits,
  phoneForWhatsApp,
  toDateInputValue,
} from '../utils/dateTime'
import { customerToShopWhatsAppUrl, createWhatsAppUrl } from '../utils/whatsapp'

const EMPTY_FORM = {
  fullName: '',
  phone: '',
  vehicleBrand: 'Ford',
  vehicleModel: '',
  vehicleYear: '',
  mileage: '',
  plate: '',
  fuelType: '',
  serviceId: '',
  note: '',
}

function formatDuration(minutes) {
  const value = Number(minutes) || 0
  const hours = Math.floor(value / 60)
  const remaining = value % 60

  if (hours <= 0) return `${remaining} dakika`
  if (remaining === 0) return `${hours} saat`
  return `${hours} saat ${remaining} dakika`
}

function googleMapsDestination(address) {
  const cleanAddress = String(address || '').trim()
  if (!cleanAddress && !SHOP_CONFIG.mapsPlaceId) return ''
  return cleanAddress ? `${SHOP_CONFIG.shortName}, ${cleanAddress}` : SHOP_CONFIG.shortName
}

function googleMapsDirectionsUrl(address) {
  const destination = googleMapsDestination(address)
  if (!destination) return ''

  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'driving',
    dir_action: 'navigate',
  })
  if (SHOP_CONFIG.mapsPlaceId) params.set('destination_place_id', SHOP_CONFIG.mapsPlaceId)

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function friendlyBookingError(error) {
  if (
    error?.code === 'slot-taken' ||
    error?.code === 'permission-denied' ||
    error?.code === 'failed-precondition'
  ) {
    return 'Bu başlangıç saati az önce başka bir randevu tarafından alınmış olabilir. Lütfen başka bir saat seçiniz.'
  }
  if (error?.code === 'unavailable') {
    return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyiniz.'
  }
  return error?.message || 'Randevu oluşturulurken beklenmeyen bir hata oluştu.'
}

export default function BookingPage() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [settings, setSettings] = useState(null)
  const [servicePlanning, setServicePlanning] = useState(null)
  const [date, setDate] = useState('')
  const dateSelectionVersionRef = useRef(0)
  const [time, setTime] = useState('')
  const [availability, setAvailability] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [successDetails, setSuccessDetails] = useState(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!firebaseReady) return
    let cancelled = false

    ;(async () => {
      setInitialLoading(true)
      try {
        const bootstrap = await getBookingBootstrap()
        if (cancelled) return
        setSettings(bootstrap.settings)
        setServicePlanning(bootstrap.servicePlanning)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setMessage({
            type: 'error',
            text: 'Randevu sistemi şu anda yüklenemedi. Lütfen daha sonra tekrar deneyiniz.',
          })
        }
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const resolvedModelId = useMemo(
    () => servicePlanning
      ? resolveVehicleModelId(form.vehicleBrand, form.vehicleModel, servicePlanning)
      : '',
    [form.vehicleBrand, form.vehicleModel, servicePlanning],
  )

  const services = useMemo(
    () => servicePlanning
      ? getServiceOptionsForVehicle(servicePlanning, form.vehicleBrand, form.vehicleModel)
      : [],
    [servicePlanning, form.vehicleBrand, form.vehicleModel],
  )

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.serviceId) || null,
    [services, form.serviceId],
  )

  const dateBounds = useMemo(
    () => (settings ? getDateBounds(settings) : { min: '', max: '' }),
    [settings],
  )

  const availableSlots = useMemo(
    () => availability.filter((slot) => slot.available),
    [availability],
  )

  const refreshAvailability = useCallback(async (targetDate = date) => {
    if (!settings || !selectedService || !targetDate || !isWorkingDay(targetDate, settings)) {
      setAvailability([])
      return
    }

    setSlotsLoading(true)
    try {
      const result = await getAvailabilityForDate(
        targetDate,
        selectedService.durationMinutes,
        settings,
        servicePlanning,
      )
      setAvailability(result)
      setTime((current) => (result.some((slot) => slot.time === current) ? current : (result[0]?.time || '')))
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Uygun saatler yüklenemedi. Lütfen tekrar deneyiniz.' })
      setAvailability([])
    } finally {
      setSlotsLoading(false)
    }
  }, [date, selectedService, settings, servicePlanning])

  useEffect(() => {
    if (!selectedService || !settings) {
      setDate('')
      setTime('')
      setAvailability([])
      return
    }

    let cancelled = false
    const selectionVersionAtStart = dateSelectionVersionRef.current

    ;(async () => {
      setSlotsLoading(true)
      setTime('')
      try {
        const firstDate = await findFirstAvailableDate(selectedService.durationMinutes, settings, servicePlanning)
        if (
          cancelled ||
          dateSelectionVersionRef.current !== selectionVersionAtStart
        ) {
          return
        }

        if (!firstDate) {
          setDate('')
          setAvailability([])
          setMessage({
            type: 'error',
            text: `Önümüzdeki ${settings.maxAdvanceDays ?? 45} gün içinde bu işlem için uygun randevu bulunamadı.`,
          })
          return
        }

        setDate(firstDate)
      } catch (error) {
        console.error(error)
        if (
          !cancelled &&
          dateSelectionVersionRef.current === selectionVersionAtStart
        ) {
          setMessage({ type: 'error', text: 'İlk uygun gün bulunamadı.' })
        }
      } finally {
        if (
          !cancelled &&
          dateSelectionVersionRef.current === selectionVersionAtStart
        ) {
          setSlotsLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [selectedService?.id, selectedService?.durationMinutes, resolvedModelId, settings, servicePlanning])

  useEffect(() => {
    setTime('')
    if (date && selectedService && settings) refreshAvailability(date)
  }, [date, selectedService?.id, settings, refreshAvailability])

  if (!firebaseReady) return <SetupRequired />

  const updateField = (field, value) => {
    setMessage(null)
    setSuccessDetails(null)
    const vehicleChanged = field === 'vehicleBrand' || field === 'vehicleModel'
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(vehicleChanged ? { serviceId: '' } : {}),
    }))
    if (vehicleChanged) {
      dateSelectionVersionRef.current += 1
      setDate('')
      setTime('')
      setAvailability([])
    }
  }

  const validate = () => {
    if (!isOnline) return 'İnternet bağlantısı olmadan randevu oluşturulamaz.'
    if (form.fullName.trim().length < 2) return 'Ad soyad alanını kontrol ediniz.'
    if (phoneDigits(form.phone).length !== 11 || !phoneDigits(form.phone).startsWith('0')) {
      return 'Telefon numarasını 05xx xxx xx xx biçiminde giriniz.'
    }
    if (form.vehicleBrand !== 'Ford') return 'Online randevu yalnız Ford marka araçlar içindir.'
    if (!resolvedModelId) return 'Lütfen listeden geçerli bir Ford modeli seçiniz.'
    if (form.vehicleYear.length !== 4) return 'Model yılı zorunludur ve 4 haneli olmalıdır.'
    const vehicleYear = Number(form.vehicleYear)
    const maximumVehicleYear = new Date().getFullYear() + 1
    if (vehicleYear < 1950 || vehicleYear > maximumVehicleYear) {
      return `Model yılı 1950 ile ${maximumVehicleYear} arasında olmalıdır.`
    }
    if (!String(form.mileage).trim()) return 'Kilometre bilgisini giriniz.'
    const mileage = Number(form.mileage)
    if (!Number.isInteger(mileage) || mileage < 0 || mileage > 999999) {
      return 'Kilometre bilgisini 0 ile 999999 arasında giriniz.'
    }
    if (!isValidPlate(form.plate)) return 'Plakayı 06 ABC 123 biçiminde giriniz.'
    if (!form.fuelType) return 'Yakıt türünü seçiniz.'
    if (!selectedService) return 'Yapılacak işlemi seçiniz.'
    if (!date || !isWorkingDay(date, settings)) return 'Geçerli bir randevu günü seçiniz.'
    if (!time) return 'Uygun başlangıç saatlerinden birini seçiniz.'
    const chosen = availability.find((slot) => slot.time === time)
    if (!chosen?.available) return 'Seçtiğiniz saat artık uygun değil. Başka bir saat seçiniz.'
    if (form.note.length > 500) return 'Açıklama en fazla 500 karakter olabilir.'
    return null
  }

  const findNextDay = async () => {
    if (!selectedService || !settings || !date) return
    setSlotsLoading(true)
    setMessage(null)
    try {
      const startDate = toDateInputValue(addDays(dateFromInput(date), 1))
      const nextDate = await findFirstAvailableDate(
        selectedService.durationMinutes,
        settings,
        servicePlanning,
        startDate,
      )
      if (nextDate) {
        setDate(nextDate)
      } else {
        setMessage({ type: 'error', text: 'İleri tarihlerde de uygun saat bulunamadı.' })
      }
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: 'Sonraki uygun gün bulunamadı.' })
    } finally {
      setSlotsLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setMessage(null)
    setSuccessDetails(null)

    const validationError = validate()
    if (validationError) {
      setMessage({ type: 'error', text: validationError })
      return
    }

    const snapshot = {
      fullName: form.fullName.trim(),
      phone: form.phone,
      vehicle: [form.vehicleBrand, form.vehicleModel, form.vehicleYear].filter(Boolean).join(' '),
      plate: form.plate,
      serviceName: selectedService.name,
      duration: formatDuration(selectedService.durationMinutes),
      date,
      time,
    }

    setSubmitting(true)
    try {
      const appointmentId = await createAppointment({ ...form, vehicleModelId: resolvedModelId, date, time })
      setSuccessDetails({
        ...snapshot,
        code: appointmentId.slice(0, 8).toUpperCase(),
      })
      setMessage({
        type: 'success',
        text: 'Randevunuz oluşturuldu ve servis takvimine eklendi. Ek bir onay beklemeniz gerekmez.',
      })
      setForm(EMPTY_FORM)
      setDate('')
      setTime('')
      setAvailability([])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: friendlyBookingError(error) })
      await refreshAvailability(date)
    } finally {
      setSubmitting(false)
    }
  }

  const formReviewReady = Boolean(selectedService && date && time)
  const contactPhone = settings?.contactPhone || SHOP_CONFIG.phone || ''
  const whatsappPhone = settings?.whatsappPhone || ''
  const whatsappTarget = phoneForWhatsApp(whatsappPhone)
  const generalWhatsAppUrl = createWhatsAppUrl(whatsappPhone, 'Merhaba, SAYGILI FORD ile iletişime geçmek istiyorum.')
  const successWhatsAppUrl = successDetails ? customerToShopWhatsAppUrl(whatsappPhone, successDetails) : ''
  const contactAddress = settings?.address || SHOP_CONFIG.address || ''
  const staffContacts = (Array.isArray(settings?.staffContacts) ? settings.staffContacts : [])
    .filter((contact) => contact?.name || contact?.phone)
  const mapsDirectionsUrl = googleMapsDirectionsUrl(contactAddress)

  const heroStaffContacts = staffContacts.slice(0, 2)

  const renderHeroContactDock = () => (
    <div className="hero-contact-dock" aria-label="Saygılı Ford iletişim bilgileri">
      <div className="hero-contact-intro">
        <span>İletişim</span>
        <strong>Bize ulaşın</strong>
      </div>

      {contactPhone && (
        <a className="hero-contact-item hero-contact-phone" href={`tel:${contactPhone}`}>
          <span>Dükkan telefonu</span>
          <strong>{contactPhone}</strong>
          <small>Ara</small>
        </a>
      )}

      {heroStaffContacts.map((contact, index) => (
        <a
          className="hero-contact-item hero-contact-person"
          key={`${contact.name || 'usta'}-${index}`}
          href={contact.phone ? `tel:${contact.phone}` : undefined}
          aria-disabled={!contact.phone}
        >
          <span>Usta / Yetkili</span>
          <strong>{contact.name || `Yetkili ${index + 1}`}</strong>
          {contact.phone && (
            <>
              <small>{contact.phone}</small>
              <span className="hero-contact-mini-call">Ara</span>
            </>
          )}
        </a>
      ))}

      <div className="hero-contact-item hero-contact-metric">
        <span>Çalışma saatleri</span>
        <strong>{settings?.workingHours?.start || '08:30'} – {settings?.workingHours?.end || '18:00'}</strong>
      </div>

      <div className="hero-contact-item hero-contact-metric">
        <span>Servis kapasitesi</span>
        <strong>{settings?.resourceCount || 2} lift</strong>
      </div>

      {contactAddress && (
        <div className="hero-contact-item hero-contact-address">
          <span>Adres</span>
          <strong>{contactAddress}</strong>
        </div>
      )}

      <div className="hero-contact-actions">
        {contactPhone && (
          <a className="hero-contact-action hero-contact-call" href={`tel:${contactPhone}`}>
            Servisi Ara
          </a>
        )}

        {whatsappTarget && (
          <a
            className="hero-contact-action"
            href={generalWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}

        {mapsDirectionsUrl && (
          <a
            className="hero-contact-action"
            href={mapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Yol Tarifi
          </a>
        )}
      </div>
    </div>
  )

  const renderMobileHeroContact = () => (
    <details className="hero-mobile-contact">
      <summary>
        <div className="hero-mobile-contact-summary-copy">
          <span>İletişim</span>
          <strong>Saygılı Ford'a ulaşın</strong>
          {contactPhone && <small>{contactPhone}</small>}
        </div>

        <div className="hero-mobile-contact-summary-action">
          <span>Detaylar</span>
          <b aria-hidden="true">⌄</b>
        </div>
      </summary>

      <div className="hero-mobile-contact-details">
        <div className="hero-mobile-metrics">
          <div>
            <span>Çalışma saatleri</span>
            <strong>{settings?.workingHours?.start || '08:30'} – {settings?.workingHours?.end || '18:00'}</strong>
          </div>
          <div>
            <span>Servis kapasitesi</span>
            <strong>{settings?.resourceCount || 2} lift</strong>
          </div>
        </div>

        {heroStaffContacts.length > 0 && (
          <div className="hero-mobile-staff-grid">
            {heroStaffContacts.map((contact, index) => (
              <a
                className="hero-mobile-staff-card"
                key={`mobile-${contact.name || 'usta'}-${index}`}
                href={contact.phone ? `tel:${contact.phone}` : undefined}
                aria-disabled={!contact.phone}
              >
                <span>Usta / Yetkili</span>
                <strong>{contact.name || `Yetkili ${index + 1}`}</strong>
                {contact.phone && <small>{contact.phone}</small>}
                {contact.phone && <em>Ara</em>}
              </a>
            ))}
          </div>
        )}

        {contactAddress && (
          <div className="hero-mobile-address">
            <span>Adres</span>
            <strong>{contactAddress}</strong>
          </div>
        )}
      </div>

      <div className="hero-mobile-quick-actions">
        {contactPhone && (
          <a className="hero-mobile-action hero-mobile-action-primary" href={`tel:${contactPhone}`}>
            Servisi Ara
          </a>
        )}

        {whatsappTarget && (
          <a
            className="hero-mobile-action"
            href={generalWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        )}

        {mapsDirectionsUrl && (
          <a
            className="hero-mobile-action"
            href={mapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Yol Tarifi
          </a>
        )}
      </div>
    </details>
  )

  return (
    <div className="booking-page">
      <BrandHeader />

      <section
        className="street-hero"
        aria-label="Saygılı Ford servis dükkanı ve randevu bilgileri"
      >
        <picture className="street-hero-media" aria-hidden="true">
          <source
            media="(max-width: 760px)"
            srcSet="/saygili-ford-streetview-mobile.webp"
          />
          <img
            src="/saygili-ford-streetview.webp"
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </picture>

        <div className="street-hero-overlay" aria-hidden="true" />

        <div className="street-hero-content street-hero-contact-layout">
          {settings && renderHeroContactDock()}
          {settings && renderMobileHeroContact()}
        </div>
      </section>

      <main className="page-shell booking-layout">
        <section id="randevu-formu" className="card booking-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Randevu Bilgileri</p>
              <h2>Servis randevusu oluşturun</h2>
            </div>
            </div>

          {!isOnline && (
            <div className="alert alert-error" role="alert">
              <strong>İnternet bağlantısı yok</strong>
              <span>Randevu saatlerini görüntüleyebilir ancak bağlantı gelmeden kayıt oluşturamazsınız.</span>
            </div>
          )}

          {message && (
            <div className={`alert alert-${message.type}`} role="alert">
              <strong>{message.type === 'success' ? 'Randevunuz hazır' : 'Kontrol ediniz'}</strong>
              <span>{message.text}</span>
            </div>
          )}

          {successDetails && (
            <section className="success-receipt" aria-label="Randevu özeti">
              <div className="success-check" aria-hidden="true">✓</div>
              <div>
                <p className="eyebrow">Randevu Referansı</p>
                <h3>{successDetails.code}</h3>
                <p><strong>{formatDateTR(successDetails.date)} · {successDetails.time}</strong></p>
                <p>{successDetails.serviceName}</p>
                <p>{successDetails.vehicle} · {successDetails.plate}</p>
                <small>Değişiklik veya iptal gerekirse bu kodu saklayınız ve servis ile iletişime geçiniz.</small>
                {(contactPhone || whatsappTarget || mapsDirectionsUrl) && (
                  <div className="success-contact-actions">
                    {contactPhone && <a className="secondary-button link-button" href={`tel:${contactPhone}`}>Servisi Ara</a>}
                    {whatsappTarget && (
                      <a className="secondary-button link-button whatsapp-button" href={successWhatsAppUrl} target="_blank" rel="noreferrer">WhatsApp'tan İlet</a>
                    )}
                    {mapsDirectionsUrl && (
                      <a className="secondary-button link-button directions-button" href={mapsDirectionsUrl} target="_blank" rel="noopener noreferrer">Yol Tarifi Al</a>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {initialLoading ? (
            <div className="loading-stack" aria-label="Randevu sistemi yükleniyor">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-box" />
              <div className="skeleton skeleton-box" />
            </div>
          ) : !servicePlanning ? (
            <div className="alert alert-error">
              <strong>Model ve işlem süreleri henüz hazır değil.</strong>
              <span>Yönetici hesabıyla /yonetim adresine girip servis planını bir kez kaydediniz.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-section-title">
                <span>1</span>
                <div><strong>İletişim ve araç bilgileri</strong><small>Size ulaşabilmemiz ve doğru servis kaydını oluşturabilmemiz için.</small></div>
              </div>

              <div className="form-grid two-column">
                <label>
                  <span>Ad Soyad *</span>
                  <input
                    data-testid="full-name"
                    autoComplete="name"
                    maxLength={80}
                    value={form.fullName}
                    onChange={(e) => updateField('fullName', normalizePlainText(e.target.value, 80))}
                    placeholder="Örn. Ahmet Yılmaz"
                  />
                </label>

                <label>
                  <span>Telefon *</span>
                  <input
                    data-testid="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={14}
                    value={form.phone}
                    onChange={(e) => updateField('phone', normalizePhone(e.target.value))}
                    placeholder="05xx xxx xx xx"
                  />
                </label>

                <label>
                  <span>Araç Markası *</span>
                  <input
                    data-testid="vehicle-brand"
                    className="ford-only-field"
                    value="Ford"
                    readOnly
                    aria-readonly="true"
                  />
                  <small className="field-hint left-hint">Online randevu yalnız Ford marka araçlar için kullanılabilir.</small>
                </label>

                <label>
                  <span>Araç Modeli *</span>
                  <select
                    data-testid="vehicle-model"
                    value={form.vehicleModel}
                    onChange={(e) => updateField('vehicleModel', e.target.value)}
                  >
                    <option value="">Ford modelini seçiniz</option>
                    {FORD_MODEL_CATALOG.map((model) => <option key={model.id} value={model.name}>{model.name}</option>)}
                  </select>
                  <small className="field-hint left-hint">Model seçimi işlem süresini ve önerilen saatleri otomatik belirler.</small>
                </label>

                <label>
                  <span>Model Yılı *</span>
                  <input
                    data-testid="vehicle-year"
                    inputMode="numeric"
                    required
                    value={form.vehicleYear}
                    onChange={(e) => updateField('vehicleYear', normalizeVehicleYear(e.target.value))}
                    placeholder="Örn. 2019"
                  />
                </label>

                <label>
                  <span>Kilometre *</span>
                  <div className="input-with-suffix">
                    <input
                      data-testid="mileage"
                      inputMode="numeric"
                      required
                      value={form.mileage}
                      onChange={(e) => updateField('mileage', normalizeMileage(e.target.value))}
                      placeholder="Örn. 125000"
                    />
                    <span>km</span>
                  </div>
                </label>

                <label>
                  <span>Plaka *</span>
                  <input
                    data-testid="plate"
                    maxLength={11}
                    inputMode="text"
                    autoCapitalize="characters"
                    value={form.plate}
                    onChange={(e) => updateField('plate', normalizePlate(e.target.value))}
                    placeholder="06 ABC 123"
                  />
                </label>

                <label>
                  <span>Yakıt Türü *</span>
                  <select data-testid="fuel-type" value={form.fuelType} onChange={(e) => updateField('fuelType', e.target.value)}>
                    <option value="">Seçiniz</option>
                    {FUEL_TYPES.map((fuel) => <option key={fuel.value} value={fuel.value}>{fuel.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="form-section-title">
                <span>2</span>
                <div><strong>Yapılacak işlem</strong><small>Tahmini süre seçilen işleme göre otomatik hesaplanır.</small></div>
              </div>

              <label>
                <span>Yapılacak İşlem *</span>
                <select data-testid="service" value={form.serviceId} onChange={(e) => updateField('serviceId', e.target.value)} disabled={!form.vehicleModel.trim()}>
                  <option value="">{form.vehicleModel.trim() ? 'Seçiniz' : 'Önce Ford modelini seçiniz'}</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </label>

              {selectedService && (
                <div className="service-summary">
                  <div>
                    <strong>{selectedService.name}</strong>
                    <span>{form.vehicleModel} için servis planına göre hazırlanır.</span>
                  </div>
                  {selectedService.description && <p>{selectedService.description}</p>}
                  <small>Süre hesabı yönetici tarafında tutulur; size yalnız servis planına uygun geliş saatleri gösterilir.</small>
                </div>
              )}

              <div className="form-section-title">
                <span>3</span>
                <div><strong>Gün ve önerilen saat</strong><small>Sistem işlem süresine ve lift planına göre en uygun saatleri otomatik önerir.</small></div>
              </div>

              {!selectedService ? (
                <div className="empty-state">Önce yapılacak işlemi seçiniz.</div>
              ) : (
                <>
                  <label>
                    <span>Tarih *</span>
                    <input
                      data-testid="booking-date"
                      type="date"
                      min={dateBounds.min}
                      max={dateBounds.max}
                      value={date}
                      onChange={(e) => {
                        dateSelectionVersionRef.current += 1
                        setDate(e.target.value)
                      }}
                    />
                  </label>

                  {!date ? (
                    <div className="empty-state">İlk uygun gün aranıyor...</div>
                  ) : !isWorkingDay(date, settings) ? (
                    <div className="empty-state">Seçtiğiniz gün servis kapalı. Lütfen başka bir gün seçiniz.</div>
                  ) : slotsLoading ? (
                    <div className="loading-stack compact-loading">
                      <div className="skeleton skeleton-line" />
                      <div className="skeleton skeleton-box short" />
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="empty-state action-empty-state">
                      <strong>Bu gün için uygun saat kalmadı.</strong>
                      <span>İsterseniz bir sonraki uygun güne geçebilirsiniz.</span>
                      <button className="secondary-button" type="button" onClick={findNextDay}>Sonraki uygun günü bul</button>
                    </div>
                  ) : (
                    <>
                      <div className="availability-intro">
                        <strong>Size önerilen saatler</strong>
                        <span>İlk seçenek servis planını en verimli dolduran öneridir; isterseniz alternatiflerden birini seçebilirsiniz.</span>
                      </div>

                      <div className="time-grid available-only-grid" aria-label="Uygun randevu başlangıç saatleri">
                        {availableSlots.map((slot) => {
                          const selected = time === slot.time
                          return (
                            <button
                              key={slot.time}
                              data-testid={`time-${slot.time}`}
                              type="button"
                              className={`time-button ${selected ? 'selected' : ''}`}
                              onClick={() => setTime(slot.time)}
                              aria-pressed={selected}
                            >
                              <span>{slot.time}</span>
                              {slot.recommended && <small>Önerilen</small>}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              <label>
                <span>Şikâyet / Açıklama</span>
                <textarea
                  data-testid="note"
                  rows={4}
                  maxLength={500}
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value.slice(0, 500))}
                  placeholder="Varsa araçtaki şikâyeti veya eklemek istediğiniz notu yazabilirsiniz."
                />
                <small className="field-hint">{form.note.length}/500</small>
              </label>

              {formReviewReady && (
                <section className="booking-review" aria-label="Randevu son kontrol">
                  <div className="booking-review-heading">
                    <div><p className="eyebrow">Son Kontrol</p><h3>Randevu özeti</h3></div>
                    <span className="secure-note">Saatınız kayıt sırasında tekrar doğrulanır.</span>
                  </div>
                  <div className="review-grid">
                    <div><span>Tarih / Saat</span><strong>{formatDateTR(date)} · {time}</strong></div>
                    <div><span>İşlem</span><strong>{selectedService.name}</strong></div>
                    <div><span>Araç</span><strong>{['Ford', form.vehicleModel, form.vehicleYear].filter(Boolean).join(' ') || '-'}</strong></div>
                    <div><span>Kilometre</span><strong>{form.mileage ? `${Number(form.mileage).toLocaleString('tr-TR')} km` : '-'}</strong></div>
                  </div>
                </section>
              )}

              <button
                data-testid="submit-booking"
                className="primary-button submit-button"
                type="submit"
                disabled={submitting || !selectedService || !time || !isOnline}
              >
                {submitting ? 'Randevu onaylanıyor...' : 'Randevuyu Onayla'}
              </button>
              <p className="submit-help">Bu butona bastığınızda uygun saat servis takviminde doğrudan sizin adınıza ayrılır.</p>
            </form>
          )}
        </section>

        <aside className="card info-card">
          <p className="eyebrow">Servis Bilgisi</p>
          <h2>{SHOP_CONFIG.shortName}</h2>
          <p>{SHOP_CONFIG.description}</p>
          <div className="specialization-note">{SHOP_CONFIG.specialization}</div>

          <div className="privacy-note">
            <strong>Randevu nasıl çalışır?</strong>
            <p>Uygun bir saat seçip kaydı tamamladığınızda randevunuz doğrudan servis takvimine eklenir. Ayrıca yönetici onayı beklemeniz gerekmez.</p>
          </div>
          <div className="privacy-note subtle-note">
            <strong>Gizlilik</strong>
            <p>İletişim ve araç bilgileriniz herkese açık değildir; yalnızca yetkili servis kullanıcıları tarafından görüntülenebilir.</p>
          </div>
        </aside>
      </main>
    </div>
  )
}
