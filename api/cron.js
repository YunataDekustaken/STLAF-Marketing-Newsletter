import axios from 'axios';

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
    } else if (vo.arrayValue && vo.arrayValue.values) {
      obj[key] = vo.arrayValue.values.map((v) => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '');
    } else {
      obj[key] = JSON.stringify(vo);
    }
  }
  return obj;
}

let cachedGmailConfig = null;
let lastGmailConfigFetch = 0;

async function getGmailConfig() {
  if (cachedGmailConfig && Date.now() - lastGmailConfigFetch < 60000) {
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
  const url = `${baseUrl}/emailCampaigns/${campaignId}${apiKey}`;
  try {
    const currentResp = await axios.get(url);
    const currentData = fromFirestoreJSON(currentResp.data) || {};
    const updatedData = {
      ...currentData,
      status,
      sentCount,
      failedCount,
      sentAt: status === 'sent' ? new Date().toISOString() : (currentData.sentAt || '')
    };
    await axios.patch(url, toFirestoreJSON(updatedData));
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

    return Buffer.from(headerParts + alternativeParts).toString("base64")
             .replace(/\+/g, '-')
             .replace(/\//g, '_')
             .replace(/=+$/, '');
  }

  const mixBoundary = `----=_Part_Mix_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
  const mixedParts = [
    `--${mixBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    alternativeParts,
    ``
  ];

  for (const att of attachments) {
    let base64Pure = att.base64Data || "";
    if (base64Pure.includes(";base64,")) {
      base64Pure = base64Pure.split(";base64,")[1];
    }
    mixedParts.push(`--${mixBoundary}`);
    mixedParts.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.fileName}"`);
    mixedParts.push(`Content-Disposition: attachment; filename="${att.fileName}"`);
    mixedParts.push(`Content-Transfer-Encoding: base64`);
    mixedParts.push(``);
    mixedParts.push(base64Pure);
    mixedParts.push(``);
  }

  mixedParts.push(`--${mixBoundary}--`);

  const headerParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixBoundary}"`,
    ``
  ].join('\r\n');

  const fullMessage = headerParts + mixedParts.join('\r\n');
  return Buffer.from(fullMessage).toString("base64")
           .replace(/\+/g, '-')
           .replace(/\//g, '_')
           .replace(/=+$/, '');
}

function getFirestoreRestUrl(collectionPath, extraParams = "") {
  const baseUrl = getFirestoreUrl();
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  let url = `${baseUrl}/${collectionPath}`;
  const params = [];
  if (apiKey) {
    params.push(`key=${apiKey}`);
  }
  if (extraParams) {
    params.push(extraParams);
  }
  if (params.length > 0) {
    url += `?${params.join("&")}`;
  }
  return url;
}

// ── SCHEDULER LOGIC ──────────────────────────────────────────────────────────

const activeScheduledSends = new Set();

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const config = await getGmailConfig();
    if (!config || !config.connected) {
      return res.status(200).json({ success: false, message: "Gmail is not connected yet." });
    }

    const campaignsUrl = getFirestoreRestUrl("emailCampaigns", "pageSize=300");
    const campaignsResp = await axios.get(campaignsUrl);
    const documents = campaignsResp.data?.documents || [];

    const triggered = [];

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'stlaf-marketing-newsletter.vercel.app';
    const hostUrl = `${protocol}://${host}`;

    for (const doc of documents) {
      const id = doc.name.split("/").pop();
      if (!id) continue;
      const campaign = fromFirestoreJSON(doc);
      if (!campaign || activeScheduledSends.has(id)) continue;

      if (campaign.status === "scheduled" && campaign.scheduledAt) {
        // Parse time representing ISO string
        const schedTime = new Date(campaign.scheduledAt).getTime();
        const nowTime = Date.now();

        if (!isNaN(schedTime) && schedTime <= nowTime) {
          console.log(`[VERCEL CRON] Triggering scheduled campaign: "${campaign.title}" (${id})`);
          activeScheduledSends.add(id);
          triggered.push({ id, title: campaign.title });

          // Non-blocking loop for Vercel context: executed in-handler
          await executeCronSending(id, campaign, config, hostUrl);
        }
      }
    }

    return res.status(200).json({
      success: true,
      processedCount: triggered.length,
      runs: triggered
    });
  } catch (err) {
    console.error("[VERCEL CRON ERR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function executeCronSending(campaignId, campaign, config, hostUrl) {
  try {
    const accessToken = await getOrRefreshAccessToken(config);

    // Extract tags
    let recipientTags = [];
    if (campaign.recipientTags) {
      if (Array.isArray(campaign.recipientTags)) {
        recipientTags = campaign.recipientTags;
      } else if (typeof campaign.recipientTags === 'string') {
        try {
          recipientTags = JSON.parse(campaign.recipientTags);
        } catch (e) {
          recipientTags = [];
        }
      }
    }

    // Get subscribers
    const subUrl = getFirestoreRestUrl("subscribers", "pageSize=300");
    const subResp = await axios.get(subUrl);
    const allDocs = subResp.data?.documents || [];
    const subscribers = allDocs.map(d => {
      const sId = d.name.split("/").pop();
      return { id: sId, ...fromFirestoreJSON(d) };
    });

    const activeFilteredSubscribers = subscribers.filter(s => {
      if (s.status !== "active") return false;
      if (recipientTags.length === 0) return true;
      
      let subTags = [];
      if (Array.isArray(s.tags)) {
        subTags = s.tags;
      } else if (typeof s.tags === 'string') {
        try {
          subTags = JSON.parse(s.tags);
        } catch (e) {
          subTags = s.tags.split(',').map(t => t.trim());
        }
      }
      return subTags.some(t => recipientTags.includes(t));
    });

    console.log(`[VERCEL CRON] Sending to ${activeFilteredSubscribers.length} recipients for campaign: "${campaign.title}"`);
    await updateCampaignCount(campaignId, 'sending', 0, 0);

    let attachments = [];
    if (campaign.attachmentsJson) {
      try {
        attachments = JSON.parse(campaign.attachmentsJson);
      } catch (e) {}
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const rec of activeFilteredSubscribers) {
      if (!rec.email) continue;
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
    console.log(`[VERCEL CRON] Completed campaign "${campaign.title}" successfully.`);
  } catch (err) {
    console.error(`[VERCEL CRON ERR] Campaign sending failed:`, err.message);
    await updateCampaignCount(campaignId, 'failed', 0, 0);
  } finally {
    activeScheduledSends.delete(campaignId);
  }
}
