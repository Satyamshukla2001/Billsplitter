import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { AddForm } from '../components/AddForm'
import { DeleteButton } from '../components/DeleteButton'
import { Async, Empty, ErrorBox } from '../components/Status'
import { api } from '../lib/api'
import { aggregateMoney, formatCents } from '../lib/money'
import { useResource } from '../lib/useResource'

export const Route = createFileRoute('/')({
  component: HomesPage,
})

function HomesPage() {
  const navigate = useNavigate()
  const load = useCallback(api.listHomes, [])
  const loadExchangeRates = useCallback((signal: AbortSignal) => api.getExchangeRates(signal), [])
  const { state, reload } = useResource(load)
  const exchangeRates = useResource(loadExchangeRates)
  const ratesState = exchangeRates.state

  return (
    <main>
      <h1>Bill Splitter</h1>
      <section>
        <h2>Create a home</h2>
        <AddForm
          fields={[{ name: 'name', label: 'Home name', placeholder: 'Flat 4B' }]}
          submitLabel="Create home"
          onSubmit={async ({ name }) => {
            const home = await api.createHome(name ?? '')
            await navigate({
              to: '/homes/$homeId',
              params: { homeId: home.id },
            })
          }}
        />
      </section>
      <section>
        <h2>Your homes</h2>
        <Async resource={state} loadingLabel="Loading homes…" onRetry={reload}>
          {(homes) =>
            homes.length === 0 ? (
              <Empty>No homes yet. Create one above.</Empty>
            ) : (
              <ul className="list">
                {homes.map((home) => {
                  const total = aggregateMoney(
                    home.totalsByCurrency,
                    ratesState.status === 'success' ? ratesState.data.rates : undefined,
                  )
                  return (
                    <li key={home.id} className="row home-row">
                      <button
                        type="button"
                        className="home-tab"
                        onClick={() =>
                          navigate({
                            to: '/homes/$homeId',
                            params: { homeId: home.id },
                          })
                        }
                      >
                        {home.name}
                      </button>
                      <strong className="home-total">
                        {total ? (
                          <>Total: {formatCents(total.amountCents, total.currencyCode)}</>
                        ) : ratesState.status === 'error' ? (
                          <ErrorBox
                            message="Mixed-currency total unavailable."
                            onRetry={exchangeRates.reload}
                          />
                        ) : (
                          'Calculating total…'
                        )}
                      </strong>
                      <DeleteButton
                        label="Delete"
                        confirmation={`Delete home "${home.name}" and everything in it?`}
                        onDelete={async () => {
                          await api.deleteHome(home.id)
                          reload()
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            )
          }
        </Async>
      </section>
    </main>
  )
}
