import { NextResponse } from 'next/server'
import { Prisma, SessionAction } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(req: Request) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.trim()
  const action = searchParams.get('action')?.trim()
  const { page, limit, skip, take } = pageParams(searchParams)

  const where: Prisma.SessionLogWhereInput = {}
  if (username) where.username = { contains: username, mode: 'insensitive' }
  if (action && action in SessionAction) where.action = action as SessionAction

  const [logs, total] = await Promise.all([
    prisma.sessionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.sessionLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}
