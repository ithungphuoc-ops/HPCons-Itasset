import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireSession } from '@/lib/session'
import { getKhoSettings } from '@/lib/firestore/settings'
import { buildTemplateSheets } from '@/lib/kho/importExcel'

// GET /api/devices/import-template — file mẫu nhập thiết bị cũ (23/10/2026): sheet Hướng dẫn + mỗi Loại
// 1 sheet, cột thông số theo Sửa giao diện hiện tại (đổi trường xong tải lại là có cột mới).
export async function GET() {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  const S = await getKhoSettings()
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) // giờ Việt Nam
  const [y, m, d] = today.split('-')
  const wb = XLSX.utils.book_new()
  for (const sh of buildTemplateSheets(S, `${d}/${m}/${y}`)) {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa)
    ws['!cols'] = sh.name === 'Hướng dẫn' ? [{ wch: 150 }]
      : (sh.aoa[2] as string[]).map((h) => ({ wch: h === 'STT' ? 5 : h === 'Người sở hữu' ? 22 : 16 }))
    XLSX.utils.book_append_sheet(wb, ws, sh.name)
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Mau_nhap_thiet_bi_KhoIT.xlsx"`,
    },
  })
}
