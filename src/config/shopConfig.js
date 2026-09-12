import { SERVICE_DEFINITIONS } from './servicePlanning'

export const SHOP_CONFIG = {
  name: 'SAYGILI FORD',
  shortName: 'Saygılı Ford',
  description: 'Ford binek ve ticari araçlar için bakım, onarım ve mekanik servis hizmetleri.',
  specialization: 'Ford binek ve ticari araçlar konusunda uzman mekanik servis',
  phone: '',
  address: '',
  logoPath: '',
  maxAdvanceDays: 45,
}

export const DEFAULT_SHOP_SETTINGS = {
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: {
    start: '08:30',
    end: '18:00',
  },
  // Müşteri artık 30 dakikalık sabit slot görmez. Bu 5 dakika yalnızca
  // çakışmayı atomik biçimde kilitlemek için kullanılan iç planlama birimidir.
  slotMinutes: 5,
  resourceCount: 2,
  resourceLabel: 'Lift',
  maxAdvanceDays: 45,
  contactPhone: '',
  whatsappPhone: '',
  address: '',
}

// Eski importları kırmamak için sabit altı ana işlem bu isimle de export edilir.
// Gerçek süre model bazlı servicePlanning/main belgesinden gelir.
export const DEFAULT_SERVICES = SERVICE_DEFINITIONS.map((service, index) => ({
  ...service,
  durationMinutes: [75, 90, 180, 240, 120, 60][index],
  active: true,
  sortOrder: service.sortOrder,
}))

export const FUEL_TYPES = [
  { value: 'gasoline', label: 'Benzin' },
  { value: 'lpg', label: 'Benzin + LPG' },
  { value: 'diesel', label: 'Dizel' },
]

export const APPOINTMENT_STATUSES = [
  { value: 'confirmed', label: 'Planlandı' },
  { value: 'arrived', label: 'Araç Geldi' },
  { value: 'in_progress', label: 'İşlemde' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
]
