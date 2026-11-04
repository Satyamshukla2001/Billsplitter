import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { ErrorBox } from '../components/Status'
import { errorMessage } from '../lib/api'

export const Route = createRootRoute({
  component: () => <Outlet />,
  // A crash while rendering shows a message instead of a blank page.
  errorComponent: ({ error }) => (
    <main>
      <ErrorBox message={errorMessage(error)} />
    </main>
  ),
  notFoundComponent: () => (
    <main>
      <p>Page not found.</p>
      <Link to="/">Back to all homes</Link>
    </main>
  ),
})
