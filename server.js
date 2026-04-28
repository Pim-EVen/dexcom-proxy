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

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Dexcom G7 Glucose — Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0a; color: #fff;
      min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #1a1a1a; border-radius: 16px;
      padding: 32px; width: 100%; max-width: 420px;
    }
    .logo { font-size: 32px; margin-bottom: 8px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: #888; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; margin-top: 16px; }
    input, select {
      width: 100%; background: #2a2a2a; border: 1px solid #333;
      border-radius: 8px; color: #fff; font-size: 16px;
      padding: 12px 14px; outline: none;
    }
    input:focus, select:focus { border-color: #1B7F4E; }
    select option { background: #2a2a2a; }
    button {
      width: 100%; background: #1B7F4E; color: #fff; border: none;
      border-radius: 8px; font-size: 16px; font-weight: 600;
      padding: 14px; cursor: pointer; margin-top: 24px;
    }
    button:active { background: #145f3a; }
    .status { margin-top: 16px; text-align: center; font-size: 14px; min-height: 20px; padding: 10px; border-radius: 8px; }
    .ok  { background: #0d2e1a; color: #4caf50; }
    .err { background: #2e0d0d; color: #f44336; }
    .loading { color: #888; }
    .divider { border: none; border-top: 1px solid #333; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🩸</div>
    <h1>Dexcom G7 Glucose</h1>
    <div class="sub">Even G2 App — Credential Setup</div>

    <label>Dexcom Username</label>
    <input id="user" type="text" placeholder="e.g. johnsmith" autocomplete="username"/>

    <label>Dexcom Password</label>
    <input id="pass" type="password" placeholder="your Dexcom password" autocomplete="current-password"/>

    <label>Server Region</label>
    <select id="server">
      <option value="EU">Europe (EU)</option>
      <option value="US">United States (US)</option>
    </select>

    <button onclick="save()">Save & Test Connection</button>
    <div class="status" id="status" style="display:none"></div>

    <hr class="divider"/>
    <div style="color:#666; font-size:13px; text-align:center; line-height:1.5;">
      Credentials are saved on your device only.<br/>
      Not affiliated with Dexcom, Inc.
    </div>
  </div>

  <script>
    const saved = localStorage.getItem('dexcom_config')
    if (saved) {
      try {
        const cfg = JSON.parse(saved)
        document.getElementById('user').value   = cfg.accountName || ''
        document.getElementById('server').value = cfg.server || 'EU'
      } catch(e) {}
    }

    async function save() {
      const user   = document.getElementById('user').value.trim()
      const pass   = document.getElementById('pass').value
      const server = document.getElementById('server').value
      const status = document.getElementById('status')

      if (!user || !pass) {
        status.textContent = 'Please fill in all fields.'
        status.className = 'status err'
        status.style.display = 'block'
        return
      }

      status.textContent = 'Testing connection...'
      status.className = 'status loading'
      status.style.display = 'block'

      try {
        const url  = '/glucose?user=' + encodeURIComponent(user) + '&pass=' + encodeURIComponent(pass) + '&server=' + server
        const resp = await fetch(url)
        const data = await resp.json()
        if (data.error) throw new Error(data.error)
        localStorage.setItem('dexcom_config', JSON.stringify({ accountName: user, password: pass, server }))
        status.textContent = '✓ Connected! Current glucose: ' + data.value + ' mmol/L (' + data.trend + '). Credentials saved.'
        status.className = 'status ok'
      } catch(err) {
        status.textContent = '✗ ' + err.message
        status.className = 'status err'
      }
    }
  </script>
</body>
</html>`

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Setup page
  if (req.url === '/' || req.url === '/setup') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SETUP_HTML)
    return
  }

  res.setHeader('Content-Type', 'application/json')

  // Health check
  if (req.url === '/health') {
    res.writeHead(200)
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // GET /glucose?user=USERNAME&pass=PASSWORD&server=EU
  if (req.url && req.url.startsWith('/glucose')) {
    const url    = new URL(req.url, 'http://localhost:' + PORT)
    const user   = url.searchParams.get('user')
    const pass   = url.searchParams.get('pass')
    const server = url.searchParams.get('server') || 'EU'

    if (!user || !pass) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'user and pass are required' }))
      return
    }

    const host = server === 'US' ? DEXCOM_BASE_US : DEXCOM_BASE_EU

    try {
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
        res.end(JSON.stringify({ error: 'Dexcom login failed', status: loginResp.status }))
        return
      }

      const token = JSON.parse(loginResp.body)
      if (!token || token === '00000000-0000-0000-0000-000000000000') {
        res.writeHead(401)
        res.end(JSON.stringify({ error: 'Invalid credentials — check your Dexcom username and password' }))
        return
      }

      const glucosePath =
        '/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues' +
        '?sessionId=' + encodeURIComponent(token) + '&minutes=10&maxCount=1'

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
        res.end(JSON.stringify({ error: 'Failed to fetch glucose data' }))
        return
      }

      const data = JSON.parse(glucoseResp.body)
      if (!Array.isArray(data) || data.length === 0) {
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'No glucose data available — make sure Dexcom Share is enabled' }))
        return
      }

      const entry = data[0]
      const mgDl  = entry.Value
      const mmolL = parseFloat((mgDl / 18.0182).toFixed(1))

      res.writeHead(200)
      res.end(JSON.stringify({ value: mmolL, mgDl, trend: entry.Trend }))

    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log('Dexcom proxy running on port ' + PORT)
})
