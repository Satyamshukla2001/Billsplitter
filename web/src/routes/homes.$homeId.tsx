import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { AddForm } from '../components/AddForm'
import { DeleteButton } from '../components/DeleteButton'
import { ShareRow } from '../components/ShareRow'
import { Async, Empty, ErrorBox } from '../components/Status'
import { api, type Balance, type Bill, type CurrencyCode, type Member } from '../lib/api'
import {
  aggregateMoney,
  CURRENCIES,
  formatCents,
  isCurrencyCode,
  parseAmountToCents,
} from '../lib/money'
import { useResource } from '../lib/useResource'

export const Route = createFileRoute('/homes/$homeId')({
  component: HomePage,
})

function isLettersOnlyMemberName(name: string): boolean {
  return /^(?:\p{L}\p{M}*)+(?:\s+(?:\p{L}\p{M}*)+)*$/u.test(name.trim())
}

function HomePage() {
  const { homeId } = Route.useParams()
  const navigate = useNavigate()
  const [currency, setCurrency] = useState<CurrencyCode>('INR')

  const loadHome = useCallback((signal: AbortSignal) => api.getHome(homeId, signal), [homeId])
  const loadBills = useCallback((signal: AbortSignal) => api.listBills(homeId, signal), [homeId])
  const loadBalances = useCallback(
    (signal: AbortSignal) => api.getBalances(homeId, signal),
    [homeId],
  )
  const loadExchangeRates = useCallback((signal: AbortSignal) => api.getExchangeRates(signal), [])
  const home = useResource(loadHome)
  const bills = useResource(loadBills)
  const balances = useResource(loadBalances)
  const exchangeRates = useResource(loadExchangeRates)

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
            <BalancesSection balances={balances} />
            <BillsSection
              members={detail.members}
              bills={bills}
              currency={currency}
              onCurrencyChange={(value) => {
                if (isCurrencyCode(value)) setCurrency(value)
              }}
              onCreate={async (title, totalCents, memberId, currencyCode) => {
                await api.createBill(homeId, title, totalCents, memberId, currencyCode)
                refreshMoney()
                exchangeRates.reload()
              }}
              onPaid={refreshMoney}
              exchangeRates={exchangeRates}
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
        onSubmit={({ name }) => {
          const memberName = name ?? ''
          if (!isLettersOnlyMemberName(memberName)) {
            throw new Error('Member names can contain letters and spaces only.')
          }
          return onAdd(memberName)
        }}
      />
    </section>
  )
}

function BalancesSection({ balances }: { balances: ReturnType<typeof useResource<Balance[]>> }) {
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
                  <span className="amount">
                    {row.outstandingByCurrency.length === 0
                      ? formatCents(0, 'INR')
                      : row.outstandingByCurrency
                          .map(({ currencyCode, amountCents }) =>
                            formatCents(amountCents, currencyCode),
                          )
                          .join(' · ')}
                  </span>
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
  exchangeRates,
}: {
  members: Member[]
  bills: ReturnType<typeof useResource<Bill[]>>
  currency: CurrencyCode
  onCurrencyChange: (currency: string) => void
  onCreate: (
    title: string,
    totalCents: number,
    memberId: string,
    currencyCode: CurrencyCode,
  ) => Promise<void>
  onPaid: () => void
  exchangeRates: ReturnType<typeof useResource<Awaited<ReturnType<typeof api.getExchangeRates>>>>
}) {
  const names = new Map(members.map((member) => [member.id, member.name]))
  const ratesState = exchangeRates.state

  return (
    <section>
      <h2>Bills</h2>
      {members.length === 0 ? null : (
        <AddForm
          key={members.map((member) => member.id).join(':')}
          fields={[
            {
              name: 'memberId',
              label: 'Person',
              options: members.map((member) => ({ value: member.id, label: member.name })),
              defaultValue: members[0]?.id,
            },
            {
              name: 'title',
              label: 'Title',
              options: ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries', 'Gas'].map(
                (title) => ({ value: title, label: title }),
              ),
              defaultValue: 'Rent',
            },
            {
              name: 'amount',
              label: 'Total amount',
              placeholder: '45.50',
              inputMode: 'decimal',
              trailingSelect: {
                name: 'currency',
                label: 'Bill currency',
                options: CURRENCIES.map(({ code }) => ({ value: code, label: code })),
                defaultValue: currency,
              },
            },
          ]}
          submitLabel="Add bill"
          onValueChange={(name, value) => {
            if (name === 'currency') onCurrencyChange(value)
          }}
          onSubmit={async ({ title, amount, memberId, currency: currencyValue }) => {
            const selectedCurrency = currencyValue ?? currency
            const billCurrency = isCurrencyCode(selectedCurrency) ? selectedCurrency : currency
            const cents = parseAmountToCents(amount ?? '', billCurrency)
            if (cents === null) {
              throw new Error(
                `Enter a positive ${billCurrency} amount with the correct number of decimal places.`,
              )
            }
            if (!memberId) throw new Error('Choose a person for this bill.')
            await onCreate(title ?? '', cents, memberId, billCurrency)
          }}
        />
      )}
      {members.length === 0 ? null : (
        <p className="muted">
          Each bill is assigned to the selected person and keeps its selected currency. Mixed
          currencies are converted to INR using the latest available exchange rates.
        </p>
      )}
      <Async resource={bills.state} loadingLabel="Loading bills…" onRetry={bills.reload}>
        {(list) =>
          list.length === 0 ? (
            <Empty>No bills yet.</Empty>
          ) : (
            <>
              <ul className="bills">
                {list.map((bill) => (
                  <li key={bill.id} className="bill">
                    <header>
                      <strong>{bill.title}</strong>
                      <span className="amount">
                        {formatCents(bill.totalCents, bill.currencyCode)}
                      </span>
                    </header>
                    <ul className="shares">
                      {bill.shares.map((share) => (
                        <ShareRow
                          key={share.id}
                          billId={bill.id}
                          share={share}
                          memberName={names.get(share.memberId) ?? 'Unknown member'}
                          currency={bill.currencyCode}
                          onPaid={onPaid}
                        />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {(() => {
                const total = aggregateMoney(
                  list.map((bill) => ({
                    currencyCode: bill.currencyCode,
                    amountCents: bill.totalCents,
                  })),
                  ratesState.status === 'success' ? ratesState.data.rates : undefined,
                )
                if (!total && ratesState.status === 'error') {
                  return (
                    <ErrorBox
                      message="Cannot calculate a mixed-currency total because exchange rates are unavailable."
                      onRetry={exchangeRates.reload}
                    />
                  )
                }
                if (!total) {
                  return (
                    <p className="muted" role="status">
                      Loading exchange rates to calculate total in INR…
                    </p>
                  )
                }

                const hasMixedCurrencies = new Set(list.map((bill) => bill.currencyCode)).size > 1
                return (
                  <>
                    <footer className="row bills-total">
                      <strong>{hasMixedCurrencies ? 'Total (INR)' : 'Total'}</strong>
                      <strong className="amount">
                        {formatCents(total.amountCents, total.currencyCode)}
                      </strong>
                    </footer>
                    {hasMixedCurrencies && ratesState.status === 'success' ? (
                      <p className="muted">
                        Mixed-currency total uses exchange rates updated {ratesState.data.updatedAt}
                        .
                      </p>
                    ) : null}
                  </>
                )
              })()}
            </>
          )
        }
      </Async>
    </section>
  )
}
