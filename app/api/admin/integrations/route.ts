import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

export async function GET() {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const sources = await prisma.integrationSource.findMany({
    include: { configs: { orderBy: { resourceName: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(sources)
}
