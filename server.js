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
  <title>Dexcom G7 — Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0a0a0a; color: #fff;
      min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card { background: #1a1a1a; border-radius: 16px; padding: 32px; width: 100%; max-width: 420px; }
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
    .status { margin-top: 16px; font-size: 14px; min-height: 20px; padding: 12px; border-radius: 8px; display:none; }
    .ok  { background: #0d2e1a; color: #4caf50; display:block; }
    .err { background: #2e0d0d; color: #f44336; display:block; }
    .loading { color: #888; display:block; }
    hr { border: none; border-top: 1px solid #333; margin: 24px 0; }
    .note { color: #666; font-size: 13px; text-align: center; line-height: 1.5; }
    .step { background: #222; border-radius: 12px; padding: 16px; margin-top: 16px; display:none; }
    .step h2 { font-size: 16px; margin-bottom: 8px; color: #4caf50; }
    .step p { font-size: 14px; color: #aaa; line-height: 1.6; }
    .step a { color: #4caf50; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🩸</div>
    <h1>Dexcom G7 Glucose</h1>
    <div class="sub">Even G2 App — Setup</div>

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
    <div class="status" id="status"></div>

    <div class="step" id="step2">
      <h2>✓ Connected! Next step:</h2>
      <p>Open the <strong>Even Realities App</strong> on your phone, go to <strong>Even Hub</strong>, and open <strong>Dexcom G7 Glucose</strong>. The app will load your credentials automatically.</p>
    </div>

    <hr/>
    <div class="note">
      Credentials are stored securely on your device.<br/>
      Not affiliated with Dexcom, Inc.
    </div>
  </div>

  <script>
    async function save() {
      const user   = document.getElementById('user').value.trim()
      const pass   = document.getElementById('pass').value
      const server = document.getElementById('server').value
      const status = document.getElementById('status')
      const step2  = document.getElementById('step2')

      if (!user || !pass) {
        status.textContent = 'Please fill in all fields.'
        status.className = 'status err'
        step2.style.display = 'none'
        return
      }

      status.textContent = 'Testing connection...'
      status.className = 'status loading'
      step2.style.display = 'none'

      try {
        const url  = '/glucose?user=' + encodeURIComponent(user) + '&pass=' + encodeURIComponent(pass) + '&server=' + server
        const resp = await fetch(url)
        const data = await resp.json()
        if (data.error) throw new Error(data.error)

        // Store in localStorage so the app can pick it up
        localStorage.setItem('dexcom_user',   user)
        localStorage.setItem('dexcom_pass',   pass)
        localStorage.setItem('dexcom_server', server)

        status.textContent = '✓ ' + data.value + ' mmol/L (' + data.trend + ') — credentials saved!'
        status.className = 'status ok'
        step2.style.display = 'block'
      } catch(err) {
        status.textContent = '✗ ' + err.message
        status.className = 'status err'
      }
    }

    // Pre-fill saved values
    const u = localStorage.getItem('dexcom_user')
    const s = localStorage.getItem('dexcom_server')
    if (u) document.getElementById('user').value = u
    if (s) document.getElementById('server').value = s
  </script>
</body>
</html>`

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.url === '/' || req.url === '/setup') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SETUP_HTML)
    return
  }

  res.setHeader('Content-Type', 'application/json')

  if (req.url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ status: 'ok' })); return
  }

  if (req.url && req.url.startsWith('/glucose')) {
    const url    = new URL(req.url, 'http://localhost:' + PORT)
    const user   = url.searchParams.get('user')
    const pass   = url.searchParams.get('pass')
    const server = url.searchParams.get('server') || 'EU'

    if (!user || !pass) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'user and pass are required' })); return
    }

    const host = server === 'US' ? DEXCOM_BASE_US : DEXCOM_BASE_EU

    try {
      const loginBody = JSON.stringify({ applicationId: APPLICATION_ID, accountName: user, password: pass })
      const loginResp = await dexcomRequest({
        hostname: host,
        path:     '/ShareWebServices/Services/General/LoginPublisherAccountByName',
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) },
      }, loginBody)

      if (loginResp.status !== 200) {
        res.writeHead(loginResp.status); res.end(JSON.stringify({ error: 'Dexcom login failed' })); return
      }

      const token = JSON.parse(loginResp.body)
      if (!token || token === '00000000-0000-0000-0000-000000000000') {
        res.writeHead(401); res.end(JSON.stringify({ error: 'Invalid credentials — check your Dexcom username and password' })); return
      }

      const glucosePath = '/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=' + encodeURIComponent(token) + '&minutes=10&maxCount=1'
      const glucoseResp = await dexcomRequest({
        hostname: host, path: glucosePath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': 0 },
      }, '')

      if (glucoseResp.status !== 200) {
        res.writeHead(glucoseResp.status); res.end(JSON.stringify({ error: 'Failed to fetch glucose data' })); return
      }

      const data = JSON.parse(glucoseResp.body)
      if (!Array.isArray(data) || data.length === 0) {
        res.writeHead(404); res.end(JSON.stringify({ error: 'No glucose data — enable Dexcom Share first' })); return
      }

      const entry = data[0]
      res.writeHead(200)
      res.end(JSON.stringify({
        value: parseFloat((entry.Value / 18.0182).toFixed(1)),
        mgDl:  entry.Value,
        trend: entry.Trend,
      }))
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => console.log('Dexcom proxy running on port ' + PORT))
