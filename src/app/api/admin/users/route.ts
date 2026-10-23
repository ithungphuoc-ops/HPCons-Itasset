import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { requireAdmin } from '@/lib/session'
import { getHpcoreDb } from '@/lib/hpcore'
import { hpcoreAccess } from '@/lib/appAccess'
import type { UserRole } from '@/lib/firestore/types'

const DASHBOARD_ROLES: UserRole[] = ['admin', 'it_staff', 'viewer']

// Tầng 1 của từng người (23/10/2026): HPcore đã cấp dùng app IT chưa — tìm tài khoản HPcore theo email
async function hpcoreOf(email: string): Promise<'owner' | 'granted' | 'none' | 'error' | 'no_account'> {
  try {
    const snap = await getHpcoreDb().collection('users').where('email', '==', email).limit(1).get()
    if (snap.empty) return 'no_account'
    return await hpcoreAccess(snap.docs[0].id)
  } catch {
    return 'error'
  }
}

// Danh sách người có quyền dashboard (profiles khoá theo email) — đây là TẦNG 2: vai trò trong app IT.
// Tài khoản đăng nhập + quyền vào app (tầng 1) do app tổng HPcore quản.
export async function GET() {
  try {
    await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  const snap = await adminDb.collection('profiles').get()
  const base = snap.docs
    .filter((d) => d.id.includes('@'))
    .map((d) => ({ email: d.id, role: d.data().role as UserRole, name: d.data().fullName ?? '' }))
    .sort((a, b) => a.email.localeCompare(b.email))
  const list = await Promise.all(base.map(async (u) => ({ ...u, hpcore: await hpcoreOf(u.email) })))
  return NextResponse.json({ data: list })
}

// Cấp / cập nhật vai trò dashboard cho 1 email
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  const { email, role, name } = await req.json()
  const em = String(email || '').trim().toLowerCase()
  if (!em || !em.includes('@')) return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 })
  if (!DASHBOARD_ROLES.includes(role)) return NextResponse.json({ error: 'Vai trò không hợp lệ' }, { status: 400 })

  await adminDb.collection('profiles').doc(em).set(
    { email: em, role, fullName: name || '', createdAt: new Date().toISOString() },
    { merge: true },
  )
  return NextResponse.json({ data: { email: em, role, name: name || '' } })
}
