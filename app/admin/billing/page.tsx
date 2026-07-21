'use client'

import AdminShell from '@/app/admin/AdminShell'

export default function AdminBillingPage() {
  return (
    <AdminShell>
      <div className="bg-surface rounded-lg border border-border py-16 text-center">
        <div className="text-4xl mb-3">💳</div>
        <h2 className="text-lg font-semibold text-text">Billing coming soon</h2>
        <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">
          Claims, charge capture, and payer reconciliation will live here in a future update.
        </p>
      </div>
    </AdminShell>
  )
}
