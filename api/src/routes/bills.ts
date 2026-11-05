import { Hono } from 'hono'
import {
  type AppEnv,
  fail,
  readJsonObject,
  requireIdempotencyKey,
  requireTitle,
  requireTotalCents,
} from '../lib/http'

type ShareRow = { id: string; memberId: string; amountCents: number; paidAt: string | null }
type BillRow = { id: string; homeId: string; title: string; totalCents: number }
type ShareWithBill = ShareRow & { billId: string }

export const bills = new Hono<AppEnv>()

async function homeExists(db: D1Database, homeId: string, ownerEmail: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM homes WHERE id = ? AND owner_email = ?')
    .bind(homeId, ownerEmail)
    .first()
  return row !== null
}

/** Create a bill and one share per member. */
bills.post('/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  if (!(await homeExists(db, homeId, c.get('userEmail')))) return fail(404, 'Home not found')

  const body = await readJsonObject(c)
  const title = requireTitle(body.title)
  const totalCents = requireTotalCents(body.totalCents)
  if (typeof body.memberId !== 'string' || body.memberId.length === 0) {
    return fail(422, 'Choose a member from this home')
  }
  const member = await db
    .prepare('SELECT id FROM members WHERE id = ? AND home_id = ?')
    .bind(body.memberId, homeId)
    .first<{ id: string }>()
  if (!member) return fail(422, 'Choose a member from this home')

  const billId = crypto.randomUUID()
  const shares: ShareRow[] = [
    {
      id: crypto.randomUUID(),
      memberId: member.id,
      amountCents: totalCents,
      paidAt: null,
    },
  ]

  // One batch = one transaction: either the bill and all its shares exist, or nothing does.
  await db.batch([
    db
      .prepare('INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)')
      .bind(billId, homeId, title, totalCents),
    ...shares.map((share) =>
      db
        .prepare(
          'INSERT INTO shares (id, bill_id, member_id, home_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(share.id, billId, share.memberId, homeId, share.amountCents),
    ),
  ])

  return c.json({ id: billId, homeId, title, totalCents, shares }, 201)
})

/** List the bills of a home (newest first), each with its shares in member order. */
bills.get('/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  if (!(await homeExists(db, homeId, c.get('userEmail')))) return fail(404, 'Home not found')

  const [billRows, shareRows] = await db.batch<BillRow | ShareWithBill>([
    db
      .prepare(
        `SELECT b.id, b.home_id AS homeId, b.title,
                SUM(s.amount_cents) AS totalCents
           FROM bills b
           JOIN shares s ON s.bill_id = b.id AND s.home_id = b.home_id
          WHERE b.home_id = ?
          GROUP BY b.id
          ORDER BY b.created_at DESC, b.rowid DESC`,
      )
      .bind(homeId),
    db
      .prepare(
        `SELECT s.id, s.bill_id AS billId, s.member_id AS memberId,
                s.amount_cents AS amountCents, s.paid_at AS paidAt
           FROM shares s JOIN members m ON m.id = s.member_id
          WHERE s.home_id = ? ORDER BY m.position`,
      )
      .bind(homeId),
  ])

  const sharesByBill = new Map<string, ShareRow[]>()
  for (const row of (shareRows?.results ?? []) as ShareWithBill[]) {
    const { billId, ...share } = row
    sharesByBill.set(billId, [...(sharesByBill.get(billId) ?? []), share])
  }
  const list = ((billRows?.results ?? []) as BillRow[]).map((bill) => ({
    ...bill,
    shares: sharesByBill.get(bill.id) ?? [],
  }))
  return c.json({ bills: list })
})

/**
 * Pay one share.
 *
 * The whole "who wins" decision is a single conditional UPDATE (`paid_at IS NULL`).
 * SQLite runs it atomically, so when two requests race for the same share exactly one
 * UPDATE changes a row. The other one then reads the share back and decides:
 * same key -> it is a retry, return the same result (200); different key -> 409.
 */
bills.post('/bills/:billId/shares/:shareId/pay', async (c) => {
  const db = c.env.DB
  const key = requireIdempotencyKey(c)
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const paid = await db
    .prepare(
      `UPDATE shares SET paid_at = ?, payment_key = ?
        WHERE id = ? AND bill_id = ? AND paid_at IS NULL
          AND EXISTS (
            SELECT 1 FROM homes
             WHERE homes.id = shares.home_id AND homes.owner_email = ?
          )
        RETURNING id, member_id AS memberId, amount_cents AS amountCents, paid_at AS paidAt`,
    )
    .bind(new Date().toISOString(), key, shareId, billId, c.get('userEmail'))
    .first<ShareRow>()
  if (paid) return c.json(paid, 200)

  const existing = await db
    .prepare(
      `SELECT id, member_id AS memberId, amount_cents AS amountCents,
              paid_at AS paidAt, payment_key AS paymentKey
         FROM shares
        WHERE id = ? AND bill_id = ?
          AND EXISTS (
            SELECT 1 FROM homes
             WHERE homes.id = shares.home_id AND homes.owner_email = ?
          )`,
    )
    .bind(shareId, billId, c.get('userEmail'))
    .first<ShareRow & { paymentKey: string | null }>()
  if (!existing) return fail(404, 'Bill or share not found')
  if (existing.paymentKey !== key) return fail(409, 'Share is already paid')

  const { paymentKey: _paymentKey, ...result } = existing
  return c.json(result, 200)
})
