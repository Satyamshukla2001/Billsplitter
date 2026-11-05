import { Hono } from 'hono'
import type { CurrencyCode } from '../lib/currency'
import { type AppEnv, fail, readJsonObject, requireMemberName, requireName } from '../lib/http'

type MemberRow = { id: string; homeId: string; name: string }
type HomeTotalRow = {
  id: string
  name: string
  currencyCode: CurrencyCode
  amountCents: number
}
type BalanceCurrencyRow = {
  memberId: string
  name: string
  currencyCode: CurrencyCode
  outstandingCents: number
}

export const homes = new Hono<AppEnv>()

async function homeExists(db: D1Database, homeId: string, ownerEmail: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM homes WHERE id = ? AND owner_email = ?')
    .bind(homeId, ownerEmail)
    .first()
  return row !== null
}

homes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT h.id, h.name,
            COALESCE(b.currency_code, 'INR') AS currencyCode,
            COALESCE(SUM(s.amount_cents), 0) AS amountCents
       FROM homes h
       LEFT JOIN shares s ON s.home_id = h.id
       LEFT JOIN bills b ON b.id = s.bill_id
      WHERE h.owner_email = ?
      GROUP BY h.id, b.currency_code
      ORDER BY h.created_at DESC, h.rowid DESC, currencyCode`,
  )
    .bind(c.get('userEmail'))
    .all<HomeTotalRow>()
  const homesById = new Map<
    string,
    {
      id: string
      name: string
      totalsByCurrency: { currencyCode: CurrencyCode; amountCents: number }[]
    }
  >()
  for (const row of results) {
    const home = homesById.get(row.id) ?? {
      id: row.id,
      name: row.name,
      totalsByCurrency: [],
    }
    home.totalsByCurrency.push({
      currencyCode: row.currencyCode,
      amountCents: row.amountCents,
    })
    homesById.set(row.id, home)
  }
  return c.json({ homes: [...homesById.values()] })
})

homes.post('/', async (c) => {
  const body = await readJsonObject(c)
  const name = requireName(body.name)
  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO homes (id, name, owner_email) VALUES (?, ?, ?)')
    .bind(id, name, c.get('userEmail'))
    .run()
  return c.json({ id, name }, 201)
})

homes.get('/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ? AND owner_email = ?')
    .bind(homeId, c.get('userEmail'))
    .first<{ id: string; name: string }>()
  if (!home) return fail(404, 'Home not found')
  const { results } = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY position',
  )
    .bind(homeId)
    .all<MemberRow>()
  return c.json({ ...home, members: results })
})

homes.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  if (!(await homeExists(c.env.DB, homeId, c.get('userEmail')))) {
    return fail(404, 'Home not found')
  }
  const body = await readJsonObject(c)
  const name = requireMemberName(body.name)
  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()
  return c.json({ id, homeId, name }, 201)
})

homes.delete('/:homeId/members/:memberId', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  const memberId = c.req.param('memberId')
  if (!(await homeExists(db, homeId, c.get('userEmail')))) return fail(404, 'Home not found')
  const member = await db
    .prepare('SELECT id FROM members WHERE id = ? AND home_id = ?')
    .bind(memberId, homeId)
    .first()
  if (!member) return fail(404, 'Member not found')

  const { results: exclusivelyAssignedBills } = await db
    .prepare(
      `SELECT b.id
         FROM bills b
        WHERE b.home_id = ?
          AND EXISTS (
            SELECT 1 FROM shares
             WHERE shares.bill_id = b.id
               AND shares.member_id = ?
               AND shares.home_id = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM shares
             WHERE shares.bill_id = b.id
               AND shares.member_id != ?
               AND shares.home_id = ?
          )`,
    )
    .bind(homeId, memberId, homeId, memberId, homeId)
    .all<{ id: string }>()

  await db.batch([
    ...exclusivelyAssignedBills.flatMap(({ id }) => [
      db
        .prepare('DELETE FROM shares WHERE bill_id = ? AND member_id = ? AND home_id = ?')
        .bind(id, memberId, homeId),
      db
        .prepare(
          `DELETE FROM bills
            WHERE id = ? AND home_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM shares WHERE shares.bill_id = bills.id
              )`,
        )
        .bind(id, homeId),
    ]),
    db.prepare('DELETE FROM shares WHERE member_id = ? AND home_id = ?').bind(memberId, homeId),
    db.prepare('DELETE FROM members WHERE id = ? AND home_id = ?').bind(memberId, homeId),
  ])
  return c.json({ deleted: true, id: memberId, homeId }, 200)
})

homes.delete('/:homeId', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  if (!(await homeExists(db, homeId, c.get('userEmail')))) return fail(404, 'Home not found')
  const home = await db
    .prepare('SELECT id, name FROM homes WHERE id = ? AND owner_email = ?')
    .bind(homeId, c.get('userEmail'))
    .first<{ id: string; name: string }>()
  if (!home) return fail(404, 'Home not found')

  await db.batch([
    db.prepare('DELETE FROM shares WHERE home_id = ?').bind(homeId),
    db.prepare('DELETE FROM bills WHERE home_id = ?').bind(homeId),
    db.prepare('DELETE FROM members WHERE home_id = ?').bind(homeId),
    db
      .prepare('DELETE FROM homes WHERE id = ? AND owner_email = ?')
      .bind(homeId, c.get('userEmail')),
  ])

  return c.json({ deleted: true, id: home.id, name: home.name }, 200)
})

homes.get('/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  if (!(await homeExists(c.env.DB, homeId, c.get('userEmail')))) {
    return fail(404, 'Home not found')
  }
  const { results } = await c.env.DB.prepare(
    `SELECT m.id AS memberId, m.name,
            COALESCE(b.currency_code, 'INR') AS currencyCode,
            COALESCE(SUM(s.amount_cents), 0) AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id AND s.paid_at IS NULL
       LEFT JOIN bills b ON b.id = s.bill_id
      WHERE m.home_id = ?
      GROUP BY m.id, b.currency_code
      ORDER BY m.position, currencyCode`,
  )
    .bind(homeId)
    .all<BalanceCurrencyRow>()
  const balancesByMember = new Map<
    string,
    {
      memberId: string
      name: string
      outstandingByCurrency: { currencyCode: CurrencyCode; amountCents: number }[]
    }
  >()
  for (const row of results) {
    const balance = balancesByMember.get(row.memberId) ?? {
      memberId: row.memberId,
      name: row.name,
      outstandingByCurrency: [],
    }
    if (row.outstandingCents > 0) {
      balance.outstandingByCurrency.push({
        currencyCode: row.currencyCode,
        amountCents: row.outstandingCents,
      })
    }
    balancesByMember.set(row.memberId, balance)
  }
  return c.json({ balances: [...balancesByMember.values()] })
})
