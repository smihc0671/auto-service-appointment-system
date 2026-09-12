export const SERVICE_DEFINITIONS = [
  {
    id: 'bakim',
    name: 'Periyodik Bakım',
    category: 'Bakım',
    description: 'Yağ ve filtre bakımı ile temel periyodik kontroller.',
    sortOrder: 10,
  },
  {
    id: 'disk-balata',
    name: 'Disk + Balata',
    category: 'Fren',
    description: 'Fren diski ve/veya balata değişimi.',
    sortOrder: 20,
  },
  {
    id: 'triger',
    name: 'Triger',
    category: 'Motor',
    description: 'Triger seti / zamanlama sistemi işlemleri.',
    sortOrder: 30,
  },
  {
    id: 'baski-balata',
    name: 'Baskı Balata',
    category: 'Debriyaj',
    description: 'Debriyaj baskı-balata değişimi.',
    sortOrder: 40,
  },
  {
    id: 'on-takim',
    name: 'Ön Takım',
    category: 'Yürüyen Aksam',
    description: 'Ön takım kontrolü ve mekanik parça değişimleri.',
    sortOrder: 50,
  },
  {
    id: 'diger',
    name: 'Diğer / Arıza Tespiti',
    category: 'Diğer',
    description: 'Listede olmayan mekanik şikâyetlerin ilk tespiti. Büyük onarım kararı araç görüldükten sonra verilir.',
    sortOrder: 60,
  },
]

const PROFILES = {
  car: {
    bakim: 75,
    'disk-balata': 90,
    triger: 180,
    'baski-balata': 240,
    'on-takim': 120,
    diger: 60,
  },
  mpv: {
    bakim: 90,
    'disk-balata': 105,
    triger: 210,
    'baski-balata': 270,
    'on-takim': 150,
    diger: 75,
  },
  suv: {
    bakim: 90,
    'disk-balata': 105,
    triger: 210,
    'baski-balata': 270,
    'on-takim': 150,
    diger: 75,
  },
  commercial: {
    bakim: 90,
    'disk-balata': 120,
    triger: 240,
    'baski-balata': 300,
    'on-takim': 180,
    diger: 90,
  },
  pickup: {
    bakim: 90,
    'disk-balata': 120,
    triger: 240,
    'baski-balata': 300,
    'on-takim': 180,
    diger: 90,
  },
  classic: {
    bakim: 75,
    'disk-balata': 90,
    triger: 180,
    'baski-balata': 240,
    'on-takim': 120,
    diger: 90,
  },
}

// Saygılı Ford'un müşteri ve yönetici tarafında kullandığı TEK model kataloğu.
// Başka marka veya "listede yok" seçeneği bilinçli olarak bulunmaz.
export const FORD_MODEL_CATALOG = [
  { id: 'focus', name: 'Focus', group: 'Binek', profile: 'car', aliases: ['focus'] },
  { id: 'fiesta', name: 'Fiesta', group: 'Binek', profile: 'car', aliases: ['fiesta'] },
  { id: 'mondeo', name: 'Mondeo', group: 'Binek', profile: 'car', aliases: ['mondeo'] },
  { id: 'fusion', name: 'Fusion', group: 'Binek', profile: 'car', aliases: ['fusion'] },
  { id: 'b-max', name: 'B-Max', group: 'MPV / Aile', profile: 'mpv', aliases: ['b-max', 'b max', 'bmax'] },
  { id: 'c-max', name: 'C-Max', group: 'MPV / Aile', profile: 'mpv', aliases: ['c-max', 'c max', 'cmax'] },
  { id: 'ecosport', name: 'EcoSport', group: 'SUV', profile: 'suv', aliases: ['ecosport', 'eco sport'] },
  { id: 'kuga', name: 'Kuga', group: 'SUV', profile: 'suv', aliases: ['kuga'] },
  { id: 'puma', name: 'Puma', group: 'SUV', profile: 'suv', aliases: ['puma'] },
  { id: 'ranger', name: 'Ranger', group: 'Ticari / Pickup', profile: 'pickup', aliases: ['ranger'] },
  { id: 'tourneo-courier', name: 'Tourneo Courier', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['tourneo courier'] },
  { id: 'transit-courier', name: 'Transit Courier', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['transit courier'] },
  { id: 'tourneo-connect', name: 'Tourneo Connect', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['tourneo connect'] },
  { id: 'transit-connect', name: 'Transit Connect', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['transit connect'] },
  { id: 'tourneo-custom', name: 'Tourneo Custom', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['tourneo custom'] },
  { id: 'transit-custom', name: 'Transit Custom', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['transit custom'] },
  { id: 'transit', name: 'Transit (Genel)', group: 'Ticari / Pickup', profile: 'commercial', aliases: ['ford transit', 'transit'] },
  { id: 'escort', name: 'Escort', group: 'Eski Ford', profile: 'classic', aliases: ['escort'] },
]

export const MODEL_GROUP_ORDER = [
  'Binek',
  'MPV / Aile',
  'SUV',
  'Ticari / Pickup',
  'Eski Ford',
]

function normalizeKey(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isFordBrand(value) {
  return normalizeKey(value) === 'ford'
}

export function normalizePlanningDuration(value, fallback = 60) {
  const numeric = Number(value)
  const safe = Number.isFinite(numeric) ? numeric : fallback
  const clamped = Math.min(720, Math.max(15, safe))
  return Math.round(clamped / 5) * 5
}

function defaultServicesForProfile(profileName) {
  const profile = PROFILES[profileName] || PROFILES.car
  return Object.fromEntries(SERVICE_DEFINITIONS.map((service) => {
    const duration = profile[service.id]
    return [service.id, {
      active: duration != null,
      durationMinutes: normalizePlanningDuration(duration ?? 60),
    }]
  }))
}

function defaultModelConfig(model) {
  return {
    id: model.id,
    name: model.name,
    group: model.group,
    active: true,
    services: defaultServicesForProfile(model.profile),
  }
}

export function normalizeServicePlanning(data = {}) {
  const storedModels = data && typeof data.models === 'object' && data.models ? data.models : {}
  const models = {}

  FORD_MODEL_CATALOG.forEach((catalogModel) => {
    const fallback = defaultModelConfig(catalogModel)
    const stored = storedModels[catalogModel.id] || {}
    const storedServices = stored && typeof stored.services === 'object' && stored.services ? stored.services : {}

    models[catalogModel.id] = {
      ...fallback,
      // v8.15.1: katalogdaki 18 Ford modeli her zaman müşteriye açıktır.
      // Eski Firestore belgelerinde model seviyesinde active=false kalmış olsa
      // bile bu değer artık modeli müşteri listesinden gizleyemez.
      active: true,
      services: Object.fromEntries(SERVICE_DEFINITIONS.map((service) => {
        const serviceFallback = fallback.services[service.id]
        const saved = storedServices[service.id] || {}
        return [service.id, {
          active: saved.active === undefined ? serviceFallback.active : saved.active === true,
          durationMinutes: normalizePlanningDuration(saved.durationMinutes, serviceFallback.durationMinutes),
        }]
      })),
    }
  })

  return {
    version: 2,
    serviceDefinitions: Object.fromEntries(SERVICE_DEFINITIONS.map((service) => [service.id, service])),
    models,
  }
}

export function resolveVehicleModelId(brand, modelText, planning) {
  if (!isFordBrand(brand)) return ''

  const normalizedPlanning = normalizeServicePlanning(planning)
  const modelKey = normalizeKey(modelText)
  if (!modelKey) return ''

  const candidates = FORD_MODEL_CATALOG
    .flatMap((item) => {
      const aliases = [item.name, ...(item.aliases || [])]
      return aliases.map((alias) => ({ id: item.id, alias: normalizeKey(alias) }))
    })
    .filter((item) => item.alias)
    .sort((a, b) => b.alias.length - a.alias.length)

  const match = candidates.find((item) => (
    modelKey === item.alias
    || modelKey.startsWith(`${item.alias} `)
    || modelKey.includes(` ${item.alias} `)
  ))

  if (match && normalizedPlanning.models[match.id]) return match.id
  return ''
}

export function getCatalogModel(modelId) {
  return FORD_MODEL_CATALOG.find((model) => model.id === modelId) || null
}

export function getModelServiceConfig(planning, modelId, serviceId) {
  const normalized = normalizeServicePlanning(planning)
  const model = normalized.models[modelId]
  const definition = normalized.serviceDefinitions[serviceId]
  const config = model?.services?.[serviceId]
  if (!model || !definition || !config) return null

  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    active: config.active === true,
    durationMinutes: normalizePlanningDuration(config.durationMinutes),
  }
}

export function getServiceOptionsForVehicle(planning, brand, modelText) {
  const normalized = normalizeServicePlanning(planning)
  const modelId = resolveVehicleModelId(brand, modelText, normalized)
  const model = normalized.models[modelId]
  if (!model) return []

  return SERVICE_DEFINITIONS
    .map((definition) => getModelServiceConfig(normalized, modelId, definition.id))
    .filter((item) => item?.active)
}

export function getActiveServiceDurations(planning) {
  const normalized = normalizeServicePlanning(planning)
  const durations = new Set()

  Object.values(normalized.models).forEach((model) => {
    Object.values(model.services || {}).forEach((service) => {
      if (service.active === true) durations.add(normalizePlanningDuration(service.durationMinutes))
    })
  })

  return [...durations].sort((a, b) => a - b)
}

export function planningModelGroups(planning) {
  const normalized = normalizeServicePlanning(planning)
  return MODEL_GROUP_ORDER.map((group) => ({
    group,
    models: FORD_MODEL_CATALOG
      .filter((model) => model.group === group)
      .map((model) => normalized.models[model.id]),
  })).filter((item) => item.models.length > 0)
}
