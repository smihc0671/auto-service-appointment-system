import { SHOP_CONFIG } from '../config/shopConfig'

export default function BrandHeader({ admin = false }) {
  return (
    <header className="brand-header">
      <div className="brand-wrap">
        {SHOP_CONFIG.logoPath ? (
          <img className="brand-logo" src={SHOP_CONFIG.logoPath} alt={`${SHOP_CONFIG.shortName} logosu`} />
        ) : (
          <div className="brand-mark" aria-hidden="true">SF</div>
        )}
        <div className="brand-text">
          <p className="eyebrow">{admin ? 'SERVİS YÖNETİM PANELİ' : 'ONLİNE SERVİS RANDEVUSU'}</p>
          <h1>{SHOP_CONFIG.name}</h1>
          {!admin && <p className="brand-subtitle">{SHOP_CONFIG.description}</p>}
        </div>
      </div>
    </header>
  )
}
