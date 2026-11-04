import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAccessIdentity } from './lib/access'
import type { AppEnv } from './lib/http'
import { bills } from './routes/bills'
import { homes } from './routes/homes'

const app = new Hono<AppEnv>()

app.use('/api/*', requireAccessIdentity)
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/homes', homes)
app.route('/api', bills)

// Every error is JSON: { "error": "message" }
app.notFound((c) => c.json({ error: 'Not found' }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }
  // Never leak internals (SQL, stack traces) to the client.
  console.error('Unhandled error', error)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
