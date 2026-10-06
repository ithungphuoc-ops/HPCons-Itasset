'use client'
// Tờ phiếu in (A4) + lớp xem trước có nút In — theo mẫu Phiếu xuất kho HP Cons Sếp gửi 30/09/2026,
// đã biến tấu: bỏ Nợ/Có, Đơn giá, Thành tiền, Số HĐ, Số chứng từ gốc; GIỮ "Theo: Đề nghị số … ngày …".
// Render qua portal ra thẳng <body> để khi in không bị khung cuộn của layout cắt mất trang.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { MOVE_DEFS, fmtDate, type MoveType } from '@/lib/kho/config'
import type { PrintCfg } from '@/lib/kho/settings'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'

export interface PrintableMove {
  type: MoveType
  so: string | null
  date: string
  info: Partial<Record<'ncc' | 'mst' | 'nguoi' | 'pb' | 'nguoi2' | 'pb2' | 'lydo' | 'dien', string>>
  dnSo: string | null
  dnDate: string | null
  lines: { assetCode: string; name: string; serial: string | null; qty: number; condition: string; note: string | null }[]
}

function Info({ k, v }: { k: string; v?: string }) {
  return <div style={{ flex: 1 }}>{k}: {v ? v : <span className="dotted" />}</div>
}

// cfg = mẫu phiếu ("Sửa giao diện → Mẫu phiếu in"); trang sửa mẫu truyền bản đang sửa để xem trước
export function PhieuSheet({ move, draft, cfg }: { move: PrintableMove; draft?: boolean; cfg: PrintCfg }) {
  const def = MOVE_DEFS[move.type]
  const P = cfg
  const T = cfg.types[move.type] || { title: def.title, sign: def.sign, foot: '' }
  const i = move.info
  const [y, m, d] = (move.date || '').split('-')
  const [dy, dm, dd] = (move.dnDate || '').split('-')
  const total = move.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const kho = <Info k={def.kho} v={P.khoName} />
  const dnLine = P.showDN ? (
    <div style={{ display: 'flex', margin: '3px 0' }}>
      <div>Theo: Đề nghị số {move.dnSo ? move.dnSo : <span className="dotted" style={{ minWidth: 110 }} />} ngày {dd || '……'} tháng {dm || '……'} năm {dy || '………'}</div>
    </div>
  ) : null
  // Các dòng thông tin đầu phiếu theo từng loại (dòng "Theo đề nghị" chèn ngay sau dòng đầu, như mẫu)
  const rows: React.ReactNode[][] =
    move.type === 'NK' ? [[<Info key="a" k="Nhà cung cấp" v={i.ncc} />, <Info key="m" k="Mã số thuế" v={i.mst} />], [<Info key="b" k="Người nhập" v={i.nguoi} />, <span key="c" style={{ flex: 1 }}>{kho}</span>], [<Info key="d" k="Diễn giải" v={i.dien} />]]
    : move.type === 'LC' ? [[<Info key="a" k="Người chuyển" v={i.nguoi} />, <Info key="b" k="Phòng ban chuyển" v={i.pb} />], [<Info key="c" k="Người nhận" v={i.nguoi2} />, <Info key="d" k="Phòng ban nhận" v={i.pb2} />], [<Info key="e" k="Lý do chuyển" v={i.lydo} />, <span key="f" style={{ flex: 1 }}>{kho}</span>]]
    : [[<Info key="a" k={move.type === 'XK' ? 'Họ và tên người nhận' : 'Họ và tên người giao trả'} v={i.nguoi} />], [<Info key="b" k="Phòng ban" v={i.pb} />, <span key="c" style={{ flex: 1 }}>{kho}</span>], [<Info key="d" k={move.type === 'XK' ? 'Lý do cấp phát' : 'Lý do thu hồi'} v={i.lydo} />]]

  return (
    <div className="phieu-sheet">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={P.logo || '/logo-company.png'} alt="HP Cons" style={{ width: 96, height: 'auto', flex: 'none' }} />
        <div>
          <b style={{ fontSize: '13.5pt', textTransform: 'uppercase' }}>{P.coName}</b>
          <div style={{ fontSize: '11.5pt' }}>{P.coAddr}</div>
          <div style={{ fontSize: '11.5pt' }}>{P.coTax}</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: '21pt', fontWeight: 700, margin: '16px 0 4px', textTransform: 'uppercase' }}>{T.title}</div>
      <div style={{ textAlign: 'center', fontSize: '12pt' }}>
        <i style={{ display: 'block' }}>Ngày: {fmtDate(move.date)}</i>
        Số: {draft ? <i>(bản in thử — chưa lưu)</i> : move.so || <i>(dữ liệu cũ)</i>}
      </div>
      <div style={{ margin: '14px 0 10px', fontSize: '12.5pt' }}>
        {rows.map((r, ri) => (
          <div key={ri}>
            {ri === 1 && dnLine}
            <div style={{ display: 'flex', gap: 16, margin: '3px 0' }}>{r}</div>
          </div>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>STT</th><th>Mã tài sản</th>
            <th>Tên thiết bị<br /><span style={{ fontWeight: 400, fontSize: '10.5pt' }}>(Loại · Hãng · Model)</span></th>
            <th>Số Seri</th><th style={{ width: 62 }}>Số lượng</th><th>Tình trạng</th><th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {P.showLetter && (
            <tr style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 700, fontSize: '11pt' }}>
              {['A', 'B', 'C', 'D', '1', 'E', 'F'].map((x) => <td key={x} style={{ padding: 3 }}>{x}</td>)}
            </tr>
          )}
          {move.lines.map((l, k) => (
            <tr key={k}>
              <td style={{ textAlign: 'center' }}>{k + 1}</td><td>{l.assetCode}</td><td>{l.name}</td><td>{l.serial || ''}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td><td>{l.condition}</td><td>{l.note || ''}</td>
            </tr>
          ))}
          <tr><td /><td colSpan={3} style={{ textAlign: 'center' }}><b>Cộng</b></td><td style={{ textAlign: 'right' }}><b>{total}</b></td><td /><td /></tr>
        </tbody>
      </table>
      {T.foot && <div style={{ marginTop: 8, fontSize: '12pt', whiteSpace: 'pre-line' }}>{T.foot}</div>}
      <div style={{ textAlign: 'right', fontStyle: 'italic', margin: '16px 0 4px', fontSize: '12pt' }}>Ngày {d || '…'} tháng {m || '…'} năm {y || '……'}</div>
      <div style={{ display: 'flex', textAlign: 'center', fontSize: '12pt' }}>
        {T.sign.map((s) => (
          <div key={s} style={{ flex: 1, padding: '0 4px' }}>
            <b style={{ display: 'block' }}>{s}</b><i style={{ fontSize: '11pt' }}>(Ký, họ tên)</i>
            <div style={{ height: 70 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PrintPreview({ move, draft, onClose }: { move: PrintableMove; draft?: boolean; onClose: () => void }) {
  const { settings } = useKhoSettings()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-center gap-3 bg-gray-950/95 border-b border-gray-800 px-4 py-3 print:hidden">
        <b className="text-sm text-white">Xem trước phiếu in</b><span className="text-xs text-gray-500">khổ A4</span>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Printer size={15} /> In ngay
        </button>
        <button onClick={onClose} className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-500 text-gray-300 px-4 py-2 rounded-lg text-sm">
          <X size={15} /> Đóng
        </button>
      </div>
      <div id="print-area" className="py-5">
        <div className="shadow-2xl mx-auto" style={{ width: '210mm', maxWidth: '100%' }}><PhieuSheet move={move} draft={draft} cfg={settings.print} /></div>
      </div>
    </div>,
    document.body,
  )
}
