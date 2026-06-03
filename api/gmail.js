import axios from "axios";

// ── FIRESTORE REST HELPERS ───────────────────────────────────────────────────

function getFirestoreUrl() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || "(default)";
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

function getApiKeyParam() {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  return apiKey ? `?key=${apiKey}` : "";
}

function toFirestoreJSON(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (typeof val === 'number') {
      fields[key] = { doubleValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(item => {
            if (typeof item === 'boolean') return { booleanValue: item };
            if (typeof item === 'number') return { doubleValue: item };
            return { stringValue: String(item) };
          })
        }
      };
    } else {
      fields[key] = { stringValue: String(val || '') };
    }
  }
  return { fields };
}

function fromFirestoreJSON(doc) {
  if (!doc || !doc.fields) return null;
  const obj = {};
  for (const [key, valObj] of Object.entries(doc.fields)) {
    const vo = valObj;
    if (vo.booleanValue !== undefined) {
      obj[key] = vo.booleanValue;
    } else if (vo.doubleValue !== undefined) {
      obj[key] = Number(vo.doubleValue);
    } else if (vo.integerValue !== undefined) {
      obj[key] = Number(vo.integerValue);
    } else if (vo.stringValue !== undefined) {
      obj[key] = vo.stringValue;
    } else if (vo.arrayValue) {
      obj[key] = vo.arrayValue.values ? vo.arrayValue.values.map((v) => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '') : [];
    } else {
      obj[key] = JSON.stringify(vo);
    }
  }
  return obj;
}

let cachedGmailConfig = null;
let lastGmailConfigFetch = 0;

async function getGmailConfig() {
  if (cachedGmailConfig && Date.now() - lastGmailConfigFetch < 300000) {
    return cachedGmailConfig;
  }
  const url = `${getFirestoreUrl()}/settings/gmail_config${getApiKeyParam()}`;
  try {
    const resp = await axios.get(url);
    cachedGmailConfig = fromFirestoreJSON(resp.data);
    lastGmailConfigFetch = Date.now();
    return cachedGmailConfig;
  } catch (err) {
    if (err.response?.status === 404) {
      return { connected: false };
    }
    console.error("Error reading Gmail config from Firestore REST:", err.message);
    return { connected: false };
  }
}

async function saveGmailConfig(config) {
  const baseUrl = getFirestoreUrl();
  const apiKey = getApiKeyParam();
  const url = `${baseUrl}/settings/gmail_config${apiKey}`;
  const docData = toFirestoreJSON(config);
  try {
    await axios.patch(url, docData);
    cachedGmailConfig = Object.assign({}, cachedGmailConfig || {}, config);
    lastGmailConfigFetch = Date.now();
  } catch (err) {
    console.error("Error saving Gmail config to Firestore REST:", err.response?.data || err.message);
    throw err;
  }
}

async function createEmailLog(campaignId, recipientEmail, details) {
  const baseUrl = getFirestoreUrl();
  const apiKey = getApiKeyParam();
  const url = `${baseUrl}/emailLogs${apiKey}`;
  const logData = {
    campaignId,
    recipientEmail,
    ...details
  };
  const docData = toFirestoreJSON(logData);
  try {
    await axios.post(url, docData);
  } catch (err) {
    console.error("Error saving Email Log to Firestore REST:", err.response?.data || err.message);
  }
}

async function updateCampaignCount(campaignId, status, sentCount, failedCount) {
  const baseUrl = getFirestoreUrl();
  const apiKey = getApiKeyParam();
  
  const updateMaskParams = [
    'updateMask.fieldPaths=status',
    'updateMask.fieldPaths=sentCount',
    'updateMask.fieldPaths=failedCount'
  ];
  
  const fields = {
    status: { stringValue: status },
    sentCount: { doubleValue: Number(sentCount) },
    failedCount: { doubleValue: Number(failedCount) }
  };

  if (status === 'sent') {
    updateMaskParams.push('updateMask.fieldPaths=sentAt');
    fields.sentAt = { stringValue: new Date().toISOString() };
  }

  const keyParam = apiKey ? apiKey.replace('?', '') + '&' : '';
  const url = `${baseUrl}/emailCampaigns/${campaignId}?${keyParam}${updateMaskParams.join('&')}`;
  const docData = { fields };

  try {
    await axios.patch(url, docData);
  } catch (err) {
    console.error(`Error updating emailCampaigns/${campaignId}:`, err.response?.data || err.message);
  }
}

async function getOrRefreshAccessToken(gmailConfig) {
  if (!gmailConfig || !gmailConfig.connected) {
    throw new Error("Gmail is not connected.");
  }
  if (gmailConfig.accessToken && gmailConfig.tokenExpiry && Date.now() < gmailConfig.tokenExpiry - 60000) {
    return gmailConfig.accessToken;
  }
  if (!gmailConfig.refreshToken) {
    throw new Error("Refresh token is missing.");
  }
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET is not configured.");
  }
  try {
    const resp = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: gmailConfig.refreshToken,
      grant_type: "refresh_token"
    });
    const { access_token, expires_in } = resp.data;
    const tokenExpiry = Date.now() + expires_in * 1000;
    
    const newConfig = {
      ...gmailConfig,
      accessToken: access_token,
      tokenExpiry
    };
    await saveGmailConfig(newConfig);
    return access_token;
  } catch (err) {
    console.error("Token Refresh Error:", err.response?.data || err.message);
    throw new Error(`Failed to refresh Gmail access token: ${err.message}`);
  }
}

function htmlToPlainText(html) {
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<li[^>]*>/gi, '\n* ');
  text = text.replace(/<\/p>|<br\s*\/?>|<\/div>|<\/tr>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"');
  return text.trim();
}

function buildMimeMessage(to, from, subject, bodyHtml, attachments = []) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const altBoundary = `----=_Part_Alt_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
  const plainText = htmlToPlainText(bodyHtml);

  // Build the alternative parts (plain and HTML versions)
  const alternativeParts = [
    `--${altBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    plainText,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    bodyHtml,
    ``,
    `--${altBoundary}--`
  ].join('\r\n');

  if (!attachments || attachments.length === 0) {
    const headerParts = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      ``
    ].join('\r\n');

    const fullMessage = headerParts + alternativeParts;

    return Buffer.from(fullMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  const mixedBoundary = `----=_Part_Mixed_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

  const headerParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``
  ].join('\r\n');

  const alternativePartBlock = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    alternativeParts,
    ``
  ].join('\r\n');

  const attachmentParts = attachments.map(att => {
    let base64Data = att.content || "";
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      if (parts.length > 1) {
        base64Data = parts[1];
      }
    }
    
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${att.type || 'application/octet-stream'}; name="${att.name}"`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64Data.replace(/(.{76})/g, '$1\r\n'),
      ``
    ].join('\r\n');
  }).join('');

  const footer = `--${mixedBoundary}--`;

  const fullMessage = [
    headerParts,
    alternativePartBlock,
    attachmentParts,
    footer
  ].join('\r\n');

  return Buffer.from(fullMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── MAIN SERVERLESS FUNCTION HANDLER ─────────────────────────────────────────

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract route from query parameter (populated by vercel.json rewrite)
  const route = req.query.route || req.url.split('/api/gmail/')[1]?.split('?')[0];

  if (!route) {
    return res.status(400).json({ error: "Missing Gmail route segment." });
  }

  // 1. GET /api/gmail/status
  if (route === 'status' && req.method === 'GET') {
    try {
      const config = await getGmailConfig();
      
      // Trigger lazy-cron checks asynchronously (non-blocking)
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      if (host) {
        axios.get(`${protocol}://${host}/api/cron`).catch(e => {
          console.error("Lazy-cron trigger failed:", e.message);
        });
      }

      return res.status(200).json({
        connected: !!config.connected,
        authorizedEmail: config.authorizedEmail || null
      });
    } catch (err) {
      return res.status(200).json({ connected: false });
    }
  }

  // 2. POST /api/gmail/auth-url
  if (route === 'auth-url' && req.method === 'POST') {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientOrigin = req.body?.origin;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost:3000';
    
    let dynamicRedirect = clientOrigin 
      ? `${clientOrigin}/api/gmail/callback` 
      : `${protocol}://${host}/api/gmail/callback`;
      
    const rawRedirect = process.env.GMAIL_REDIRECT_URI;
    const redirectUri = (rawRedirect && rawRedirect.startsWith("http")) ? rawRedirect : dynamicRedirect;
    
    if (!clientId) {
      return res.status(400).json({ error: "GMAIL_CLIENT_ID environment variable is not configured." });
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly"
    ].join(" ");
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    return res.status(200).json({ url });
  }

  // 3. GET /api/gmail/callback
  if (route === 'callback' && req.method === 'GET') {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is missing.");
    }
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const dynamicRedirect = `${protocol}://${host}/api/gmail/callback`;
    
    const rawRedirect = process.env.GMAIL_REDIRECT_URI;
    const redirectUri = (rawRedirect && rawRedirect.startsWith("http")) ? rawRedirect : dynamicRedirect;
    
    if (!clientId || !clientSecret) {
      return res.status(500).send("Gmail OAuth credentials are not fully configured on the server.");
    }
    try {
      const resp = await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      });
      const { access_token, refresh_token, expires_in } = resp.data;
      const tokenExpiry = Date.now() + expires_in * 1000;
      
      const profileResp = await axios.get("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const authorizedEmail = profileResp.data.emailAddress;
      
      await saveGmailConfig({
        connected: true,
        authorizedEmail,
        accessToken: access_token,
        refreshToken: refresh_token || "",
        tokenExpiry
      });
      
      return res.status(200).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f8fafc; color: #1e293b;">
            <div style="max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 8px; background: white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <h1 style="color: #c9a84c;">Gmail Connected!</h1>
              <p>You have successfully authorized the portal to send emails.</p>
              <p>You can now close this window and return to the application.</p>
              <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background-color: #c9a84c; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">Close Tab</button>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      console.error("OAuth Exchange Error:", err.response?.data || err.message);
      return res.status(500).send(`Failed to exchange authorization code: ${err.message}`);
    }
  }

  // 4. DELETE /api/gmail/disconnect
  if (route === 'disconnect' && req.method === 'DELETE') {
    try {
      const config = await getGmailConfig();
      if (config.accessToken) {
        try {
          await axios.get(`https://oauth2.googleapis.com/revoke?token=${config.accessToken}`);
        } catch (e) {
          // ignore
        }
      }
      await saveGmailConfig({ connected: false });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 5. POST /api/gmail/send-bulk
  if (route === 'send-bulk' && req.method === 'POST') {
    const { campaignId, recipients } = req.body;
    if (!campaignId || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Missing campaignId or recipients list." });
    }
    try {
      const config = await getGmailConfig();
      if (!config.connected) {
        return res.status(400).json({ error: "Gmail is not connected. Connect Gmail first." });
      }
      const accessToken = await getOrRefreshAccessToken(config);
      
      const campaignUrl = `${getFirestoreUrl()}/emailCampaigns/${campaignId}${getApiKeyParam()}`;
      const campaignResp = await axios.get(campaignUrl);
      const campaign = fromFirestoreJSON(campaignResp.data);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found." });
      }

      // Parse campaign-level attachments
      let attachments = [];
      if (campaign?.attachmentsJson) {
        try {
          attachments = JSON.parse(campaign.attachmentsJson);
        } catch (e) {
          console.error("Error parsing campaign attachmentsJson:", e);
        }
      }
      
      await updateCampaignCount(campaignId, 'sending', 0, 0);

      // On Vercel, background tasks might be suspended immediately after response ends.
      // Therefore, we process the mail loop synchronously and respond once completed, 
      // or we can use Vercel waitUntil if supported, but simple synchronous list process 
      // is extremely robust for small to medium lists.
      let sentCount = 0;
      let failedCount = 0;
      
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const hostUrl = `${protocol}://${host}`;

      for (const rec of recipients) {
        const subject = (campaign.subject || "")
          .replace(/{{name}}/gi, rec.name || "")
          .replace(/{{email}}/gi, rec.email || "");

        const unsubscribeUrl = `${hostUrl}/unsubscribe?email=${encodeURIComponent(rec.email)}`;
        let body = (campaign.body || "")
          .replace(/{{name}}/gi, rec.name || "")
          .replace(/{{email}}/gi, rec.email || "");

        if (/{{unsubscribe}}/i.test(body)) {
          body = body.replace(/{{unsubscribe}}/gi, unsubscribeUrl);
        } else {
          const footerHtml = `
            <br/><br/>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
            <p style="font-size:12px;color:#64748b;font-family:sans-serif;text-align:center;line-height:1.5;">
              You are receiving this email because you subscribed to our list.<br/>
              If you no longer wish to receive these emails, you can 
              <a href="${unsubscribeUrl}" style="color:#c9a84c;text-decoration:underline;font-weight:600;">unsubscribe instantly here</a>.
            </p>
          `;
          if (body.includes("</body>")) {
            body = body.replace("</body>", `${footerHtml}</body>`);
          } else if (body.includes("</html>")) {
            body = body.replace("</html>", `${footerHtml}</html>`);
          } else {
            body += footerHtml;
          }
        }

        try {
          const rawMessage = buildMimeMessage(rec.email, config.authorizedEmail, subject, body, attachments);
          const sendResp = await axios.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            { raw: rawMessage },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
          );
          sentCount++;
          await createEmailLog(campaignId, rec.email, {
            status: 'sent',
            sentAt: new Date().toISOString(),
            gmailMessageId: sendResp.data.id
          });
        } catch (err) {
          failedCount++;
          const errMsg = err.response?.data?.error?.message || err.message || "Unknown error";
          await createEmailLog(campaignId, rec.email, {
            status: 'failed',
            errorMessage: errMsg,
            sentAt: new Date().toISOString()
          });
        }
        await updateCampaignCount(campaignId, 'sending', sentCount, failedCount);
      }
      
      await updateCampaignCount(campaignId, 'sent', sentCount, failedCount);
      return res.status(200).json({ success: true, message: "Campaign successfully sent to recipients." });
    } catch (err) {
      console.error("Bulk Send Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
