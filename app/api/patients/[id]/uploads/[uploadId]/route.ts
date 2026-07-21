import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? '/opt/podiatry-emr/uploads'

// Download the file.
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; uploadId: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, uploadId } = await context.params
  const upload = await prisma.patientUpload.findFirst({ where: { id: uploadId, patientId: id } })
  if (!upload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let data: Buffer
  try {
    data = await fs.readFile(path.join(UPLOADS_ROOT, upload.storageKey))
  } catch {
    return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Disposition': `attachment; filename="${upload.fileName.replace(/"/g, '')}"`,
    },
  })
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; uploadId: string }> }
) {
  const { error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id, uploadId } = await context.params
  const upload = await prisma.patientUpload.findFirst({ where: { id: uploadId, patientId: id } })
  if (!upload) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await fs.rm(path.join(UPLOADS_ROOT, upload.storageKey), { force: true })
  await prisma.patientUpload.delete({ where: { id: uploadId } })

  return NextResponse.json({ ok: true })
}
