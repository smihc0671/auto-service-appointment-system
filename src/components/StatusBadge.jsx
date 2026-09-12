import { APPOINTMENT_STATUSES } from '../config/shopConfig'

export function normalizedAppointmentStatus(status) {
  // v3/v4'te oluşturulmuş "pending" kayıtlar yeni akışta Planlandı kabul edilir.
  return status === 'pending' ? 'confirmed' : status
}

export default function StatusBadge({ status }) {
  const normalized = normalizedAppointmentStatus(status)
  const item = APPOINTMENT_STATUSES.find((entry) => entry.value === normalized)
  const label = item?.label ?? normalized ?? '-'
  return <span className={`status-badge status-${normalized}`}>{label}</span>
}
