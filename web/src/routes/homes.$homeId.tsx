import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AddForm } from '../components/AddForm'
import { DeleteButton } from '../components/DeleteButton'
import { ShareRow } from '../components/ShareRow'
import { Async, Empty } from '../components/Status'
import { api, type Balance, type Bill, type Member } from '../lib/api'
import {
  CURRENCIES,
  type CurrencyCode,
  formatCents,
  isCurrencyCode,
  parseAmountToCents,
} from '../lib/money'
import { useResource } from '../lib/useResource'

export const Route = createFileRoute('/homes/$homeId')({
  component: HomePage,
})

function HomePage() {
  const { homeId } = Route.useParams()
  const navigate = useNavigate()
  const [currency, setCurrency] = useState<CurrencyCode>('USD')

  const loadHome = useCallback((signal: AbortSignal) => api.getHome(homeId, signal), [homeId])
  const loadBills = useCallback((signal: AbortSignal) => api.listBills(homeId, signal), [homeId])
  const loadBalances = useCallback(
    (signal: AbortSignal) => api.getBalances(homeId, signal),
    [homeId],
  )
  const home = useResource(loadHome)
  const bills = useResource(loadBills)
  const balances = useResource(loadBalances)

  const refreshMoney = useCallback(() => {
    bills.reload()
    balances.reload()
  }, [bills.reload, balances.reload])

  return (
    <main>
      <p className="row">
        <Link to="/">← All homes</Link>
        <DeleteButton
          label="Delete home"
          confirmation="Delete this home and everything in it?"
          onDelete={async () => {
            await api.deleteHome(homeId)
            await navigate({ to: '/' })
          }}
        />
      </p>
      <Async resource={home.state} loadingLabel="Loading home…" onRetry={home.reload}>
        {(detail) => (
          <>
            <h1>{detail.name}</h1>
            <MembersSection
              members={detail.members}
              onAdd={async (name) => {
                await api.addMember(homeId, name)
                home.reload()
                balances.reload()
              }}
              onRemove={async (memberId) => {
                await api.deleteMember(homeId, memberId)
                home.reload()
                bills.reload()
                balances.reload()
              }}
            />
            <BalancesSection balances={balances} currency={currency} />
            <BillsSection
              members={detail.members}
              bills={bills}
              currency={currency}
              onCurrencyChange={(value) => {
                if (isCurrencyCode(value)) setCurrency(value)
              }}
              onCreate={async (title, totalCents) => {
                await api.createBill(homeId, title, totalCents)
                refreshMoney()
              }}
              onPaid={refreshMoney}
            />
          </>
        )}
      </Async>
    </main>
  )
}

function MembersSection({
  members,
  onAdd,
  onRemove,
}: {
  members: Member[]
  onAdd: (name: string) => Promise<void>
  onRemove: (memberId: string) => Promise<void>
}) {
  return (
    <section>
      <h2>Members</h2>
      {members.length === 0 ? (
        <Empty>No members yet. Add at least one before creating a bill.</Empty>
      ) : (
        <ul className="list">
          {members.map((member) => (
            <li key={member.id} className="row member-row">
              <span>{member.name}</span>
              <DeleteButton
                label="Delete member"
                confirmation={`Delete ${member.name} and their shares and payment history?`}
                onDelete={() => onRemove(member.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <AddForm
        fields={[{ name: 'name', label: 'Member name', placeholder: 'Asha' }]}
        submitLabel="Add member"
        onSubmit={({ name }) => onAdd(name ?? '')}
      />
    </section>
  )
}

function BalancesSection({
  balances,
  currency,
}: {
  balances: ReturnType<typeof useResource<Balance[]>>
  currency: CurrencyCode
}) {
  return (
    <section>
      <h2>Who owes what</h2>
      <Async resource={balances.state} loadingLabel="Loading balances…" onRetry={balances.reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Nobody to show yet.</Empty>
          ) : (
            <ul className="list">
              {rows.map((row) => (
                <li key={row.memberId} className="row">
                  <span>{row.name}</span>
                  <span className="amount">{formatCents(row.outstandingCents, currency)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </section>
  )
}

function BillsSection({
  members,
  bills,
  currency,
  onCurrencyChange,
  onCreate,
  onPaid,
}: {
  members: Member[]
  bills: ReturnType<typeof useResource<Bill[]>>
  currency: CurrencyCode
  onCurrencyChange: (currency: string) => void
  onCreate: (title: string, totalCents: number) => Promise<void>
  onPaid: () => void
}) {
  const names = new Map(members.map((member) => [member.id, member.name]))

  return (
    <section>
      <h2>Bills</h2>
      {members.length === 0 ? null : (
        <AddForm
          fields={[
            {
              name: 'title',
              label: 'Title',
              placeholder: 'Electricity',
              suggestions: ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries', 'Gas'],
            },
            {
              name: 'amount',
              label: 'Total amount',
              placeholder: '45.50',
              inputMode: 'decimal',
              trailingSelect: {
                name: 'currency',
                label: 'Display currency',
                options: CURRENCIES.map(({ code }) => ({ value: code, label: code })),
                defaultValue: currency,
              },
            },
          ]}
          submitLabel="Add bill"
          onValueChange={(name, value) => {
            if (name === 'currency') onCurrencyChange(value)
          }}
          onSubmit={async ({ title, amount }) => {
            const cents = parseAmountToCents(amount ?? '')
            if (cents === null) {
              throw new Error('Enter a positive amount with at most two decimals, like 45.50.')
            }
            await onCreate(title ?? '', cents)
          }}
        />
      )}
      {members.length === 0 ? null : (
        <p className="muted">Currency changes the symbol only; amounts are not converted.</p>
      )}
      <Async resource={bills.state} loadingLabel="Loading bills…" onRetry={bills.reload}>
        {(list) =>
          list.length === 0 ? (
            <Empty>No bills yet.</Empty>
          ) : (
            <ul className="bills">
              {list.map((bill) => (
                <li key={bill.id} className="bill">
                  <header>
                    <strong>{bill.title}</strong>
                    <span className="amount">{formatCents(bill.totalCents, currency)}</span>
                  </header>
                  <ul className="shares">
                    {bill.shares.map((share) => (
                      <ShareRow
                        key={share.id}
                        billId={bill.id}
                        share={share}
                        memberName={names.get(share.memberId) ?? 'Unknown member'}
                        currency={currency}
                        onPaid={onPaid}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </section>
  )
}
