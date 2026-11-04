import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { AppEnv } from './http'

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function isValidTeamDomain(domain: string): boolean {
  try {
    const url = new URL(`https://${domain}`)
    return (
      url.protocol === 'https:' &&
      url.hostname === domain &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.port
    )
  } catch {
    return false
  }
}

function keySetFor(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  let keySet = keySets.get(teamDomain)
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    keySets.set(teamDomain, keySet)
  }
  return keySet
}

export const requireAccessIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const hostname = new URL(c.req.url).hostname
  if (localHosts.has(hostname)) {
    c.set('userEmail', 'local@localhost')
    await next()
    return
  }

  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN.trim().toLowerCase()
  const audience = c.env.CF_ACCESS_AUD.trim()
  if (!teamDomain || !audience || !isValidTeamDomain(teamDomain)) {
    return c.json({ error: 'API access is not configured' }, 503)
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  if (!token) return c.json({ error: 'Authentication required' }, 401)

  const issuer = `https://${teamDomain}`
  try {
    const { payload } = await jwtVerify(token, keySetFor(teamDomain), {
      issuer,
      audience,
    })
    if (typeof payload.email !== 'string' || payload.email.trim().length === 0) {
      return c.json({ error: 'Access identity is missing an email address' }, 401)
    }
    c.set('userEmail', payload.email.trim().toLowerCase())
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return c.json({ error: 'Invalid authentication token' }, 401)
    }
    console.error('Cloudflare Access token verification failed', error)
    return c.json({ error: 'Unable to verify identity' }, 503)
  }

  await next()
}
