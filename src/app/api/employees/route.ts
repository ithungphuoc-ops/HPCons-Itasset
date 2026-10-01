import { NextRequest, NextResponse } from 'next/server'
import { listActiveEmployees, createEmployee, toEmployeeJson } from '@/lib/firestore/employees'
import { requireSession, requireWriteAccess } from '@/lib/session'
import { getSyncMeta, syncIfStale } from '@/lib/firestore/hpcoreSync'

function normalize(s: string) {
  return s.toLowerCase()
}

export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''

    // Đợt 3: danh sách lấy từ App Tổng HPcore — quá 24 giờ chưa đồng bộ thì đồng bộ trước (lỗi không chặn)
    await syncIfStale()
    let employees = await listActiveEmployees()
    if (search) {
      const q = normalize(search)
      employees = employees.filter((e) =>
        normalize(e.fullName).includes(q) ||
        normalize(e.email || '').includes(q) ||
        normalize(e.employeeCode || '').includes(q),
      )
    }

    const data = await Promise.all(employees.map(toEmployeeJson))
    return NextResponse.json({ data, sync: await getSyncMeta() })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const body = await req.json()
    const employee = await createEmployee({
      fullName: body.full_name,
      email: body.email || null,
      phone: body.phone || null,
      departmentId: body.department_id || null,
      employeeCode: body.employee_code || null,
    })
    return NextResponse.json({ data: await toEmployeeJson(employee) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
