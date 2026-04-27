
const https = require('https')
const http  = require('http')

const PORT           = process.env.PORT || 3000
const DEXCOM_BASE_EU = 'shareous1.dexcom.com'
const DEXCOM_BASE_US = 'share2.dexcom.com'
const APPLICATION_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db'

function dexcomRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const server = http.createServer(async (req, res) => {
  // CORS headers — allow Even Hub app to call this server
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200)
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // GET /glucose?user=USERNAME&pass=PASSWORD&server=EU
  if (req.url && req.url.startsWith('/glucose')) {
    const url    = new URL(req.url, `http://localhost:${PORT}`)
    const user   = url.searchParams.get('user')
    const pass   = url.searchParams.get('pass')
    const server = url.searchParams.get('server') || 'EU'

    if (!user || !pass) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'user en pass zijn verplicht' }))
      return
    }

    const host = server === 'US' ? DEXCOM_BASE_US : DEXCOM_BASE_EU

    try {
      // Stap 1: authenticeer
      const loginBody = JSON.stringify({
        applicationId: APPLICATION_ID,
        accountName:   user,
        password:      pass,
      })

      const loginResp = await dexcomRequest({
        hostname: host,
        path:     '/ShareWebServices/Services/General/LoginPublisherAccountByName',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Content-Length': Buffer.byteLength(loginBody),
        },
      }, loginBody)

      if (loginResp.status !== 200) {
        res.writeHead(loginResp.status)
        res.end(JSON.stringify({ error: 'Dexcom login mislukt', status: loginResp.status }))
        return
      }

      const token = JSON.parse(loginResp.body)
      if (!token || token === '00000000-0000-0000-0000-000000000000') {
        res.writeHead(401)
        res.end(JSON.stringify({ error: 'Ongeldige credentials' }))
        return
      }

      // Stap 2: haal glucose op
      const glucosePath =
        `/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues` +
        `?sessionId=${encodeURIComponent(token)}&minutes=10&maxCount=1`

      const glucoseResp = await dexcomRequest({
        hostname: host,
        path:     glucosePath,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Content-Length': 0,
        },
      }, '')

      if (glucoseResp.status !== 200) {
        res.writeHead(glucoseResp.status)
        res.end(JSON.stringify({ error: 'Glucose ophalen mislukt' }))
        return
      }

      const data = JSON.parse(glucoseResp.body)
      if (!Array.isArray(data) || data.length === 0) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Geen glucose data beschikbaar' }))
        return
      }

      const entry = data[0]
      const mgDl  = entry.Value
      const mmolL = parseFloat((mgDl / 18.0182).toFixed(1))

      res.writeHead(200)
      res.end(JSON.stringify({
        value: mmolL,
        mgDl,
        trend: entry.Trend,
      }))

    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Niet gevonden' }))
})

server.listen(PORT, () => {
  console.log(`Dexcom proxy draait op poort ${PORT}`)
})
