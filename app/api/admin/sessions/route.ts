import { NextResponse } from 'next/server'
import { Prisma, SessionAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')?.trim()
  const action = searchParams.get('action')?.trim()

  const where: Prisma.SessionLogWhereInput = {}
  if (username) where.username = { contains: username, mode: 'insensitive' }
  if (action && action in SessionAction) where.action = action as SessionAction

  const logs = await prisma.sessionLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json(logs)
}
