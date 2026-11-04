import { Hono } from 'hono'
import { type AppEnv, fail, readJsonObject, requireName } from '../lib/http'

type MemberRow = { id: string; homeId: string; name: string }

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
    'SELECT id, name FROM homes WHERE owner_email = ? ORDER BY created_at DESC, rowid DESC',
  )
    .bind(c.get('userEmail'))
    .all<{ id: string; name: string }>()
  return c.json({ homes: results })
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
  const name = requireName(body.name)
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

  await db.batch([
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
    `SELECT m.id AS memberId,
            m.name AS name,
            COALESCE(SUM(CASE WHEN s.paid_at IS NULL THEN s.amount_cents END), 0) AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id
      WHERE m.home_id = ?
      GROUP BY m.id
      ORDER BY m.position`,
  )
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()
  return c.json({ balances: results })
})
