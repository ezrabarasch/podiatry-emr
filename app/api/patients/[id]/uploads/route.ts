import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? '/opt/podiatry-emr/uploads'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const uploads = await prisma.patientUpload.findMany({
    where: { patientId: id },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(uploads)
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id } = await context.params
  if (!(await prisma.patient.findUnique({ where: { id }, select: { id: true } })))
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 413 })

  const label = (form.get('label') as string | null)?.trim() || null
  const uploadId = randomUUID()
  const ext = path.extname(file.name)
  const storageKey = `patients/${id}/${uploadId}${ext}`
  const absPath = path.join(UPLOADS_ROOT, storageKey)

  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, Buffer.from(await file.arrayBuffer()))

  const upload = await prisma.patientUpload.create({
    data: {
      id: uploadId,
      patientId: id,
      uploadedById: user.id,
      fileName: file.name,
      fileLabel: label,
      mimeType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
      storageKey,
    },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
  })

  return NextResponse.json(upload)
}
