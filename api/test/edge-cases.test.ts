import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { splitCents } from '../src/lib/split'
import { type Balance, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key: string) {
  return call<Share | { error: string }>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

async function setup(total = 1000) {
  const { homeId, members } = await createHome(['Asha', 'Ben'])
  const bill = await createBill(homeId, total)
  const share = bill.body.shares[0]
  if (!share) throw new Error('no share')
  return { homeId, members, billId: bill.body.id, share }
}

describe('splitCents', () => {
  it.each([
    [1000, 3, [334, 333, 333]],
    [1, 3, [1, 0, 0]],
    [2, 3, [1, 1, 0]],
    [100, 1, [100]],
  ])('splits %i between %i', (total, count, expected) => {
    expect(splitCents(total, count)).toEqual(expected)
  })

  it('always adds up to the total', () => {
    for (let count = 1; count <= 25; count++) {
      for (const total of [1, 7, 99, 100, 101, 99999, 1_000_003]) {
        expect(splitCents(total, count).reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
})

describe('concurrent payments', () => {
  it('lets only one of many racing requests with different keys win', async () => {
    const { billId, share } = await setup()

    const results = await Promise.all(
      Array.from({ length: 32 }, () => pay(billId, share.id, crypto.randomUUID())),
    )

    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(31)
  })

  it('answers 200 with the same result to racing requests that share a key', async () => {
    const { homeId, billId, share } = await setup()
    const key = crypto.randomUUID()

    const results = await Promise.all(Array.from({ length: 6 }, () => pay(billId, share.id, key)))

    expect(results.every((r) => r.status === 200)).toBe(true)
    const paidAts = new Set(results.map((r) => (r.body as Share).paidAt))
    expect(paidAts.size).toBe(1)
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((b) => b.outstandingByCurrency)).toEqual([[], []])
  })
})

describe('error shape and input safety', () => {
  it('returns { error } JSON for every failure', async () => {
    const missingHome = await call<{ error: string }>('GET', '/api/homes/nope/balances')
    const unknownRoute = await call<{ error: string }>('GET', '/api/nope')
    expect(missingHome.body.error).toEqual(expect.any(String))
    expect(unknownRoute.status).toBe(404)
    expect(unknownRoute.body.error).toEqual(expect.any(String))
  })

  it('rejects a payment for a share that belongs to another bill', async () => {
    const { homeId, share } = await setup()
    const other = await createBill(homeId, 200)

    const paid = await pay(other.body.id, share.id, crypto.randomUUID())

    expect(paid.status).toBe(404)
  })

  it('rejects an empty Idempotency-Key', async () => {
    const { billId, share } = await setup()
    const paid = await pay(billId, share.id, '   ')
    expect(paid.status).toBe(400)
  })

  it('rejects bad names and bad JSON without a 500', async () => {
    const blank = await call('POST', '/api/homes', { body: { name: '   ' } })
    const wrongType = await call('POST', '/api/homes', { body: { name: 5 } })
    const badJson = await exports.default.fetch(
      new Request('http://localhost/api/homes', { method: 'POST', body: '{not json' }),
    )
    expect(blank.status).toBe(422)
    expect(wrongType.status).toBe(422)
    expect(badJson.status).toBe(400)
    expect(await badJson.json()).toEqual({ error: expect.any(String) })
  })

  it('rejects JSON arrays and null as request objects', async () => {
    for (const body of ['[]', 'null']) {
      const response = await exports.default.fetch(
        new Request('http://localhost/api/homes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expect.any(String) })
    }
  })

  it('accepts maximum-length names and titles but rejects longer values', async () => {
    const home = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: 'h'.repeat(100) },
    })
    expect(home.status).toBe(201)

    const tooLongHome = await call('POST', '/api/homes', {
      body: { name: 'h'.repeat(101) },
    })
    expect(tooLongHome.status).toBe(422)

    const member = await call('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'm'.repeat(101) },
    })
    expect(member.status).toBe(422)

    const memberAtLimit = await call<{ id: string }>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'm'.repeat(100) },
    })
    expect(memberAtLimit.status).toBe(201)

    const bill = await call('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Electricity', totalCents: 1, memberId: memberAtLimit.body.id },
    })
    expect(bill.status).toBe(201)
  })

  it('assigns a one-cent bill to only its selected member', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben', 'Chitra', 'Dev'])
    const bill = await createBill(homeId, 1, members[2]?.id)

    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((share) => share.memberId)).toEqual([members[2]?.id])
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual([1])
    expect(bill.body.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(1)
  })

  it('accepts the largest safe integer total and rejects the first unsafe integer', async () => {
    const { homeId } = await createHome(['Asha'])
    const safeTotal = await createBill(homeId, Number.MAX_SAFE_INTEGER)

    expect(safeTotal.status).toBe(201)
    expect(safeTotal.body.totalCents).toBe(Number.MAX_SAFE_INTEGER)
    expect(safeTotal.body.shares[0]?.amountCents).toBe(Number.MAX_SAFE_INTEGER)

    const unsafeTotal = await createBill(homeId, Number.MAX_SAFE_INTEGER + 1)
    expect(unsafeTotal.status).toBe(422)
  })

  it('rejects an oversized Idempotency-Key', async () => {
    const { billId, share } = await setup()
    const paid = await pay(billId, share.id, 'k'.repeat(256))

    expect(paid.status).toBe(400)
    expect(paid.body).toMatchObject({ error: expect.any(String) })
  })

  it('rejects a huge or unsafe total', async () => {
    const { homeId } = await createHome(['Asha'])
    const bill = await createBill(homeId, 1e21)
    expect(bill.status).toBe(422)
  })
})

describe('database constraints', () => {
  it('refuses a negative total even if the API check were bypassed', async () => {
    const { homeId } = await createHome(['Asha'])
    await expect(
      env.DB.prepare('INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)')
        .bind('b1', homeId, 'x', -5)
        .run(),
    ).rejects.toThrow()
  })

  it('refuses a member for a home that does not exist', async () => {
    await expect(
      env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
        .bind('m1', 'no-such-home', 'Ghost')
        .run(),
    ).rejects.toThrow()
  })

  it('refuses a share whose member belongs to a different home', async () => {
    const a = await createHome(['Asha'])
    const b = await createHome(['Ben'])
    const bill = await createBill(a.homeId, 100)
    await expect(
      env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, home_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
      )
        .bind('s1', bill.body.id, b.members[0]?.id, a.homeId, 10)
        .run(),
    ).rejects.toThrow()
  })

  it('refuses a paid share without a payment key', async () => {
    const { share } = await setup()
    await expect(
      env.DB.prepare('UPDATE shares SET paid_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), share.id)
        .run(),
    ).rejects.toThrow()
  })
})
