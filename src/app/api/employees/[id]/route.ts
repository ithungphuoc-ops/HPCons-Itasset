import { NextRequest, NextResponse } from 'next/server'
import { getEmployeeById, updateEmployee, deactivateEmployee, toEmployeeJson } from '@/lib/firestore/employees'
import { personHoldings } from '@/lib/firestore/moves'
import { toDeviceJson } from '@/lib/firestore/devices'
import { requireSession, requireWriteAccess } from '@/lib/session'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession()
    const { id } = await params
    const employee = await getEmployeeById(id)
    if (!employee) return NextResponse.json({ error: 'Không tìm thấy nhân viên' }, { status: 404 })

    // Kho Tổng (30/09/2026): thiết bị đang giữ tính từ phiếu có tên người này (giữ shape
    // "assignments" cũ cho trang nhân viên: đang giữ = is_active, từng giữ = lịch sử)
    const { holdings, moves } = await personHoldings(employee.fullName)
    const heldIds = new Set(holdings.map((h) => h.device.id))
    const active = holdings.map((h) => ({ id: h.device.id, assigned_date: h.since, is_active: true, quantity: h.qty, device: toDeviceJson(h.device) }))
    const pastIds = new Map<string, { date: string; line: (typeof moves)[number]['lines'][number] }>()
    for (const m of moves) if (m.type !== 'NK') for (const l of m.lines) if (!heldIds.has(l.deviceId) && !pastIds.has(l.deviceId)) pastIds.set(l.deviceId, { date: m.date, line: l })
    const history = [...pastIds.entries()].map(([deviceId, { date, line }]) => ({
      id: deviceId, assigned_date: date, is_active: false,
      device: { id: deviceId, asset_code: line.assetCode, brand: line.name, model: '', category: 'other', status: '' },
    }))
    return NextResponse.json({ data: await toEmployeeJson(employee), assignments: [...active, ...history] })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    await updateEmployee(id, {
      fullName: body.full_name,
      email: body.email,
      phone: body.phone,
      departmentId: body.department_id,
      employeeCode: body.employee_code,
    })
    const employee = await getEmployeeById(id)
    return NextResponse.json({ data: employee ? await toEmployeeJson(employee) : null })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    await deactivateEmployee(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
