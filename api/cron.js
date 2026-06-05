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
    } else if (vo.timestampValue !== undefined) {
      obj[key] = vo.timestampValue;
    } else if (vo.arrayValue) {
      obj[key] = vo.arrayValue.values ? vo.arrayValue.values.map((v) => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '') : [];
    } else {
      obj[key] = JSON.stringify(vo);
    }
  }
  return obj;
}

let systemAuthToken = "";
let systemAuthTokenExpiry = 0;
let systemAuthTokenPromise = null;

async function getSystemAuthToken() {
  if (systemAuthToken && Date.now() < systemAuthTokenExpiry - 60000) {
    return systemAuthToken;
  }

  if (systemAuthTokenPromise) {
    return systemAuthTokenPromise;
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error("VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_API_KEY is not configured in Vercel environment.");
  }

  const email = "system-cron@stlaf-newsletter.com";
  const password = "SystemCronSecurePass987#";

  systemAuthTokenPromise = (async () => {
    try {
      const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
      const signInResp = await axios.post(signInUrl, {
        email,
        password,
        returnSecureToken: true
      });
      
      systemAuthToken = signInResp.data.idToken;
      systemAuthTokenExpiry = Date.now() + Number(signInResp.data.expiresIn) * 1000;
      return systemAuthToken;
    } catch (signInErr) {
      const errCode = signInErr.response?.data?.error?.message;
      if (errCode === "EMAIL_NOT_FOUND" || errCode === "USER_NOT_FOUND" || errCode === "INVALID_LOGIN_CREDENTIALS") {
        console.log("[SYSTEM AUTH] System crawler account not found. Self-provisioning system-cron profile in Vercel...");
        try {
          const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
          const signUpResp = await axios.post(signUpUrl, {
            email,
            password,
            returnSecureToken: true
          });
          
          const idToken = signUpResp.data.idToken;
          const uid = signUpResp.data.localId;
          const expiresIn = signUpResp.data.expiresIn;

          const userDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`;
          const userDocData = {
            fields: {
              email: { stringValue: email },
              role: { stringValue: "marketing_supervisor" },
              status: { stringValue: "active" }
            }
          };
          
          await axios.put(userDocUrl, userDocData, {
            headers: { 
              "Content-Type": "application/json",
              "X-Skip-System-Auth": "true",
              "Authorization": `Bearer ${idToken}`
            }
          });
          console.log("[SYSTEM AUTH] Self-provisioning of system profile was fully initialized and activated in Firestore!");

          systemAuthToken = idToken;
          systemAuthTokenExpiry = Date.now() + Number(expiresIn) * 1000;
          return systemAuthToken;
        } catch (signUpErr) {
          console.error("[SYSTEM AUTH ERROR] Failed to perform system self-sign-up workflow in Vercel:", signUpErr.response?.data || signUpErr.message);
          throw new Error(`Self-registration failed: ${signUpErr.message}`);
        }
      } else {
        console.error("[SYSTEM AUTH ERROR] Unexpected credentials rejection in Vercel:", signInErr.response?.data || signInErr.message);
        throw signInErr;
      }
    } finally {
      systemAuthTokenPromise = null;
    }
  })();

  return systemAuthTokenPromise;
}

axios.interceptors.request.use(async (config) => {
  if (config.url && config.url.includes("firestore.googleapis.com") && !config.headers?.["X-Skip-System-Auth"]) {
    try {
      const token = await getSystemAuthToken();
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.error("[AXIOS INTERCEPTOR] Firestore authorization injector bypassed:", e.message);
    }
  }
  if (config.headers && config.headers["X-Skip-System-Auth"]) {
    delete config.headers["X-Skip-System-Auth"];
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Intercept responses to handle 429 and rate/quota limits automatically via exponential backoff retry
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const errorMsg = error.response?.data?.error?.message || error.message || "";
    
    const isRateLimit = status === 429 || errorMsg.includes("Quota exceeded") || errorMsg.includes("RESOURCE_EXHAUSTED");
    
    if (isRateLimit && config) {
      config._retryCount = config._retryCount || 0;
      const maxRetries = 3;
      if (config._retryCount < maxRetries) {
        config._retryCount += 1;
        const delay = Math.pow(2, config._retryCount) * 1000 + Math.floor(Math.random() * 500);
        console.warn(`[AXIOS ERROR 429/QUOTA] Rate limit or quota exceeded for ${config.url}. Retrying in ${delay}ms... (Attempt ${config._retryCount} of ${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return axios(config);
      }
    }
    return Promise.reject(error);
  }
);

let cachedGmailConfig = null;
let lastGmailConfigFetch = 0;
let activeGmailConfigPromise = null;

async function getGmailConfig() {
  if (cachedGmailConfig && Date.now() - lastGmailConfigFetch < 300000) {
    return cachedGmailConfig;
  }
  if (activeGmailConfigPromise) {
    return activeGmailConfigPromise;
  }
  
  const url = `${getFirestoreUrl()}/settings/gmail_config${getApiKeyParam()}`;
  activeGmailConfigPromise = (async () => {
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
    } finally {
      activeGmailConfigPromise = null;
    }
  })();
  
  return activeGmailConfigPromise;
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

async function updateImportedPostStatus(postId, mailStatus) {
  if (!postId) return;
  const baseUrl = getFirestoreUrl();
  const apiKey = getApiKeyParam();
  const url = `${baseUrl}/posts/${postId}${apiKey}`;
  try {
    const currentResp = await axios.get(url);
    const currentData = fromFirestoreJSON(currentResp.data) || {};
    const updatedData = {
      ...currentData,
      mailStatus,
      mailSentTime: new Date().toISOString()
    };
    await axios.patch(url, toFirestoreJSON(updatedData));
    console.log(`[CSR SCHEDULE] Successfully updated handoff post ${postId} mailStatus directly to ${mailStatus}`);
  } catch (err) {
    if (err.response?.status === 404) {
      console.log(`[CSR SCHEDULE] Handoff post ${postId} not found in Firestore (possibly archived).`);
    } else {
      console.error(`[CSR SCHEDULE] Error updating post ${postId}:`, err.response?.data || err.message);
    }
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

// In-memory cache for Firestore collections in serverless API to prevent rate-limiting/429 & quota-exceeded
const firestoreCache = {};
const CACHE_TTL_MS = 180000; // 3 minutes (180,000 ms) to aggressively prevent rate-limits / 429 / quota exceeded

async function fetchFirestoreCollection(collectionPath, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && firestoreCache[collectionPath] && (now - firestoreCache[collectionPath].timestamp < CACHE_TTL_MS)) {
    console.log(`[FIRESTORE CACHE] [API/CRON] Serving cached documents for "${collectionPath}" (age: ${Math.round((now - firestoreCache[collectionPath].timestamp) / 1000)}s)`);
    return firestoreCache[collectionPath].data;
  }

  let allDocuments = [];
  let pageToken = "";
  let loopCount = 0;
  
  do {
    if (loopCount > 0) {
      // Pacing delay to prevent rate limits/429 during pagination loop
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const extraParams = `pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const url = getFirestoreRestUrl(collectionPath, extraParams);
    const resp = await axios.get(url);
    const docs = resp.data?.documents || [];
    allDocuments = [...allDocuments, ...docs];
    pageToken = resp.data?.nextPageToken || "";
    loopCount++;
  } while (pageToken && loopCount < 30);
  
  firestoreCache[collectionPath] = {
    data: allDocuments,
    timestamp: now
  };
  
  return allDocuments;
}

async function fetchScheduledCampaigns() {
  const url = `${getFirestoreUrl()}:runQuery${getApiKeyParam()}`;
  const payload = {
    structuredQuery: {
      from: [{ collectionId: "emailCampaigns" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: "scheduled" }
        }
      }
    }
  };
  try {
    const resp = await axios.post(url, payload);
    const docs = (resp.data || [])
      .map((item) => item.document)
      .filter((doc) => doc && doc.name);
    return docs;
  } catch (err) {
    console.warn("[SCHEDULER] Failed to query scheduled campaigns via runQuery, falling back to full collection scan:", err.message);
    return fetchFirestoreCollection("emailCampaigns");
  }
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

  const debugLogs = [];
  const addLog = (msg) => {
    const timestamp = new Date().toISOString();
    debugLogs.push(`[${timestamp}] ${msg}`);
    console.log(`[VERCEL CRON DEBUG] ${msg}`);
  };

  addLog("Vercel Cron Triggered.");

  const envs = {
    VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ? `${process.env.VITE_FIREBASE_PROJECT_ID.substring(0, 4)}***` : "MISSING",
    VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ? "CONFIGURED (hidden)" : "MISSING",
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ? `${process.env.GMAIL_CLIENT_ID.substring(0, 10)}***` : "MISSING",
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? "CONFIGURED (hidden)" : "MISSING",
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || "MISSING"
  };

  const report = {
    success: false,
    currentTime: new Date().toISOString(),
    currentTimeMs: Date.now(),
    environmentVariables: envs,
    debugLogs,
    gmailConfig: null,
    campaignsChecked: 0,
    triggeredCampaigns: [],
    details: []
  };

  // Validate critical env variables
  if (!process.env.VITE_FIREBASE_PROJECT_ID || !process.env.VITE_FIREBASE_API_KEY) {
    addLog("CRITICAL ERROR: Firebase Config is missing in Vercel Env variables!");
    return res.status(500).json({
      ...report,
      message: "Vercel environment variables VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_API_KEY are not configured in Vercel dashboard."
    });
  }

  try {
    addLog("Fetching Gmail config from Firestore...");
    let config;
    try {
      config = await getGmailConfig();
      addLog(`Gmail info retrieved successfully. Connected status in DB: ${config?.connected}`);
      report.gmailConfig = {
        connected: !!config?.connected,
        authorizedEmail: config?.authorizedEmail || null,
        tokenExpiry: config?.tokenExpiry || null,
        hasRefreshToken: !!config?.refreshToken
      };
    } catch (dbErr) {
      addLog(`Database read for gmail_config failed: ${dbErr.response?.data?.error?.message || dbErr.message}`);
      return res.status(200).json({
        ...report,
        message: `Database error retrieving Gmail settings: ${dbErr.message}. Ensure VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID are correct.`,
        errorDetails: dbErr.response?.data || null
      });
    }

    if (!config || !config.connected) {
      addLog("Gmail is not connected in authorization settings yet.");
      return res.status(200).json({
        ...report,
        message: "Gmail is not connected yet in settings. Access token cannot be acquired."
      });
    }

    const forceCampaignId = req.query?.forceCampaignId;
    const forceRefresh = !!req.query?.force || !!forceCampaignId;

    addLog(`Fetching email campaigns from Firestore (forceRefresh: ${forceRefresh})...`);
    let documents = [];
    try {
      if (forceCampaignId) {
        const docUrl = getFirestoreRestUrl(`emailCampaigns/${forceCampaignId}`);
        const docResp = await axios.get(docUrl);
        documents = [docResp.data];
      } else {
        documents = await fetchScheduledCampaigns();
      }
    } catch (campErr) {
      addLog(`Failed to fetch campaigns: ${campErr.response?.data?.error?.message || campErr.message}`);
      return res.status(500).json({
        ...report,
        message: `Firestore REST API error fetching email campaigns: ${campErr.message}`,
        errorDetails: campErr.response?.data || null
      });
    }
    report.campaignsChecked = documents.length;
    addLog(`Found ${documents.length} campaigns in database.`);

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'stlaf-marketing-newsletter.vercel.app';
    const hostUrl = `${protocol}://${host}`;

    for (const doc of documents) {
      const id = doc.name.split("/").pop();
      if (!id) continue;
      const campaign = fromFirestoreJSON(doc);
      if (!campaign) continue;

      // Skip other campaigns if we are forcing a specific campaign
      if (forceCampaignId && id !== forceCampaignId) {
        continue;
      }

      const campaignInfo = {
        id,
        title: campaign.title,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt || null,
        reason: ""
      };

      const isForced = forceCampaignId && id === forceCampaignId;

      if (campaign.status === "scheduled" || isForced) {
        if (!campaign.scheduledAt && !isForced) {
          campaignInfo.reason = "Ignored: Status is 'scheduled' but scheduledAt timestamp is empty.";
          addLog(`Campaign "${campaign.title}" (${id}) ignored: scheduledAt is empty.`);
        } else {
          const schedTime = new Date(campaign.scheduledAt || "").getTime();
          const nowTime = Date.now();

          if (isNaN(schedTime) && !isForced) {
            campaignInfo.reason = `Ignored: Invalid scheduled date format: "${campaign.scheduledAt}"`;
            addLog(`Campaign "${campaign.title}" (${id}) ignored: invalid scheduled time format.`);
          } else if (schedTime > nowTime && !isForced) {
            const timeDiffSec = Math.round((schedTime - nowTime) / 1000);
            campaignInfo.reason = `Waiting: Scheduled for ${campaign.scheduledAt} (triggers in ${timeDiffSec} seconds).`;
            addLog(`Campaign "${campaign.title}" (${id}) is in the future. Scheduled: ${campaign.scheduledAt}. current: ${report.currentTime}`);
          } else if (activeScheduledSends.has(id)) {
            campaignInfo.reason = "Ignored: Already processing sending lock.";
            addLog(`Campaign "${campaign.title}" (${id}) skipped: sending lock already active.`);
          } else {
            campaignInfo.reason = isForced ? "Triggering forced sending cycle!" : "Triggering sending cycle!";
            addLog(`TRIGGERED${isForced ? ' (FORCED)' : ''}: "${campaign.title}" (${id}) has reached its time or was forced!`);
            activeScheduledSends.add(id);
            report.triggeredCampaigns.push({ id, title: campaign.title });
            
            try {
              // Mark as sending in DB immediately to prevent duplicate runs
              await updateCampaignCount(id, "sending", 0, 0);

              await executeCronSending(id, campaign, config, hostUrl);
              campaignInfo.reason += " Sending cycle finished successfully.";
              addLog(`Sent successfully: "${campaign.title}"`);
            } catch (sendErr) {
              campaignInfo.reason += ` Sending cycle error: ${sendErr.message}`;
              addLog(`Sending failed for "${campaign.title}": ${sendErr.message}`);
            } finally {
              activeScheduledSends.delete(id);
            }
          }
        }
      } else {
        campaignInfo.reason = `Ignored: status is '${campaign.status}' (must be 'scheduled' or forced).`;
      }
      report.details.push(campaignInfo);
    }

    report.success = true;
    return res.status(200).json(report);
  } catch (globalErr) {
    addLog(`Global Cron error: ${globalErr.message}`);
    return res.status(500).json({
      ...report,
      error: globalErr.message
    });
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
    let allDocs = [];
    try {
      allDocs = await fetchFirestoreCollection("subscribers");
    } catch (subErr) {
      addLog(`Failed to fetch subscribers for campaign: ${subErr.message}`);
      throw subErr;
    }
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
      return subTags.some(t => recipientTags.some(rt => rt.trim().toLowerCase() === t.trim().toLowerCase()));
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
    if (campaign && campaign.importedPostId) {
      await updateImportedPostStatus(campaign.importedPostId, 'authorized');
    }
    console.log(`[VERCEL CRON] Completed campaign "${campaign.title}" successfully.`);
  } catch (err) {
    console.error(`[VERCEL CRON ERR] Campaign sending failed:`, err.message);
    await updateCampaignCount(campaignId, 'failed', 0, 0);
  } finally {
    activeScheduledSends.delete(campaignId);
  }
}
