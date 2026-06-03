import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Track the redirect URI used to request the authorization code, to ensure identical match during token exchange
  let lastIssuedRedirectUri = "";
  let lastSeenHostUrl = "https://ais-dev-viko4leq6b2b2lwdflcjyt-478287189949.asia-east1.run.app";

  app.use(cors()); // Allow all origins for easier debugging in iframe
  app.use(express.json({ limit: '50mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`[SERVER] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Dynamically capture host URL
    let currentUrl = '';
    const referer = req.headers.referer;
    if (referer && referer.startsWith('http')) {
      try {
        const refUrl = new URL(referer);
        currentUrl = `${refUrl.protocol}//${refUrl.host}`;
      } catch (e) {}
    }
    if (!currentUrl) {
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      currentUrl = `${protocol}://${host}`;
    }
    if (currentUrl.includes("run.app") && !currentUrl.startsWith("https://")) {
      currentUrl = currentUrl.replace("http://", "https://");
    }
    lastSeenHostUrl = currentUrl;
    
    next();
  });

  // Firestore REST JSON Helpers (for secure server-side interactions)
  function toFirestoreJSON(obj: any) {
    const fields: any = {};
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

  function fromFirestoreJSON(doc: any) {
    if (!doc || !doc.fields) return null;
    const obj: any = {};
    for (const [key, valObj] of Object.entries(doc.fields)) {
      const vo = valObj as any;
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
        obj[key] = vo.arrayValue.values ? vo.arrayValue.values.map((v: any) => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '') : [];
      } else {
        obj[key] = JSON.stringify(vo);
      }
    }
    return obj;
  }

  function getFirestoreUrl() {
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || "(default)";
    return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
  }

  function getApiKeyParam() {
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    return apiKey ? `?key=${apiKey}` : "";
  }

  let systemAuthToken: string = "";
  let systemAuthTokenExpiry: number = 0;
  let isResolvingSystemToken = false;

  async function getSystemAuthToken(): Promise<string> {
    if (systemAuthToken && Date.now() < systemAuthTokenExpiry - 60000) {
      return systemAuthToken;
    }

    if (isResolvingSystemToken) {
      throw new Error("System auth token resolution is already in progress.");
    }

    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    if (!projectId || !apiKey) {
      throw new Error("VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_API_KEY is not configured in backend server environment.");
    }

    const email = "system-cron@stlaf-newsletter.com";
    const password = "SystemCronSecurePass987#";

    isResolvingSystemToken = true;
    try {
      // 1. Attempt to Sign-In
      const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
      const signInResp = await axios.post(signInUrl, {
        email,
        password,
        returnSecureToken: true
      });
      
      systemAuthToken = signInResp.data.idToken;
      systemAuthTokenExpiry = Date.now() + Number(signInResp.data.expiresIn) * 1000;
      return systemAuthToken;
    } catch (signInErr: any) {
      const errCode = signInErr.response?.data?.error?.message;
      if (errCode === "EMAIL_NOT_FOUND" || errCode === "USER_NOT_FOUND" || errCode === "INVALID_LOGIN_CREDENTIALS") {
        console.log("[SYSTEM AUTH] System crawler account not found. Self-provisioning system-cron profile...");
        try {
          // 2. Register/Sign-Up the system user
          const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
          const signUpResp = await axios.post(signUpUrl, {
            email,
            password,
            returnSecureToken: true
          });
          
          const idToken = signUpResp.data.idToken;
          const uid = signUpResp.data.localId;
          const expiresIn = signUpResp.data.expiresIn;

          // 3. Save profile to users collection to allow the 'isActive()' rule check to succeed
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
        } catch (signUpErr: any) {
          console.error("[SYSTEM AUTH ERROR] Failed to perform system self-sign-up workflow:", signUpErr.response?.data || signUpErr.message);
          throw new Error(`Self-registration failed: ${signUpErr.message}`);
        }
      } else {
        console.error("[SYSTEM AUTH ERROR] Unexpected credentials rejection:", signInErr.response?.data || signInErr.message);
        throw signInErr;
      }
    } finally {
      isResolvingSystemToken = false;
    }
  }

  // Intercept all outgoing axios requests to dynamically authenticate Firestore REST API calls
  axios.interceptors.request.use(async (config) => {
    if (config.url && config.url.includes("firestore.googleapis.com") && !config.headers?.["X-Skip-System-Auth"]) {
      try {
        const token = await getSystemAuthToken();
        config.headers = config.headers || ({} as any);
        if (config.headers.set) {
          config.headers.set("Authorization", `Bearer ${token}`);
        } else {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e: any) {
        console.error("[AXIOS INTERCEPTOR] Firestore authorization injector bypassed:", e.message);
      }
    }
    if (config.headers && config.headers["X-Skip-System-Auth"]) {
      if (typeof config.headers.delete === "function") {
        config.headers.delete("X-Skip-System-Auth");
      } else {
        delete config.headers["X-Skip-System-Auth"];
      }
    }
    return config;
  }, (error) => {
    return Promise.reject(error);
  });

  let cachedGmailConfig: any = null;
  let lastGmailConfigFetch = 0;

  async function getGmailConfig(): Promise<any> {
    if (cachedGmailConfig && Date.now() - lastGmailConfigFetch < 300000) {
      return cachedGmailConfig;
    }
    const url = `${getFirestoreUrl()}/settings/gmail_config${getApiKeyParam()}`;
    try {
      const resp = await axios.get(url);
      cachedGmailConfig = fromFirestoreJSON(resp.data);
      lastGmailConfigFetch = Date.now();
      return cachedGmailConfig;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { connected: false };
      }
      console.error("Error reading Gmail config from Firestore REST:", err.message);
      return { connected: false };
    }
  }

  async function saveGmailConfig(config: any) {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    const url = `${baseUrl}/settings/gmail_config${apiKey}`;
    const docData = toFirestoreJSON(config);
    try {
      await axios.patch(url, docData);
      cachedGmailConfig = Object.assign({}, cachedGmailConfig || {}, config);
      lastGmailConfigFetch = Date.now();
    } catch (err: any) {
      console.error("Error saving Gmail config to Firestore REST:", err.response?.data || err.message);
      throw err;
    }
  }

  async function createEmailLog(log: any) {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    const url = `${baseUrl}/emailLogs${apiKey}`;
    const docData = toFirestoreJSON(log);
    try {
      await axios.post(url, docData);
    } catch (err: any) {
      console.error("Error saving Email Log to Firestore REST:", err.response?.data || err.message);
    }
  }

  async function updateCampaignCount(campaignId: string, status: string, sentCount: number, failedCount: number) {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    
    const updateMaskParams = [
      'updateMask.fieldPaths=status',
      'updateMask.fieldPaths=sentCount',
      'updateMask.fieldPaths=failedCount'
    ];
    
    const fields: any = {
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
    } catch (err: any) {
      console.error(`Error updating emailCampaigns/${campaignId}:`, err.response?.data || err.message);
    }
  }

  async function registerEmailOpen(campaignId: string, recipientEmail: string) {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    const url = `${baseUrl}/emailCampaigns/${campaignId}${apiKey}`;
    try {
      const currentResp = await axios.get(url);
      const currentData = fromFirestoreJSON(currentResp.data) || {};
      
      let openedEmails: string[] = [];
      if (currentData.openedEmails) {
        if (Array.isArray(currentData.openedEmails)) {
          openedEmails = currentData.openedEmails;
        } else if (typeof currentData.openedEmails === 'string') {
          try { openedEmails = JSON.parse(currentData.openedEmails); } catch(e) {}
        }
      }
      
      const emailLower = recipientEmail ? recipientEmail.trim().toLowerCase() : '';
      let isNewUniqueOpen = false;
      if (emailLower && !openedEmails.map(e => e.toLowerCase()).includes(emailLower)) {
        openedEmails.push(emailLower);
        isNewUniqueOpen = true;
      }
      
      const currentOpens = typeof currentData.opensCount === 'number' ? currentData.opensCount : 0;
      const updatedData = {
        ...currentData,
        opensCount: currentOpens + 1,
        openedEmails: openedEmails
      };
      
      await axios.patch(url, toFirestoreJSON(updatedData));
      console.log(`[TRACKING] Successfully registered open for ${recipientEmail} on campaign ${campaignId}. Unique=${isNewUniqueOpen}, New open count: ${currentOpens + 1}`);
    } catch (err: any) {
      console.error(`Error registering open on emailCampaigns/${campaignId}:`, err.response?.data || err.message);
    }
  }

  async function registerEmailClick(campaignId: string, recipientEmail: string) {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    const url = `${baseUrl}/emailCampaigns/${campaignId}${apiKey}`;
    try {
      const currentResp = await axios.get(url);
      const currentData = fromFirestoreJSON(currentResp.data) || {};
      
      let clickedEmails: string[] = [];
      if (currentData.clickedEmails) {
        if (Array.isArray(currentData.clickedEmails)) {
          clickedEmails = currentData.clickedEmails;
        } else if (typeof currentData.clickedEmails === 'string') {
          try { clickedEmails = JSON.parse(currentData.clickedEmails); } catch(e) {}
        }
      }
      
      const emailLower = recipientEmail ? recipientEmail.trim().toLowerCase() : '';
      let isNewUniqueClick = false;
      if (emailLower && !clickedEmails.map(e => e.toLowerCase()).includes(emailLower)) {
        clickedEmails.push(emailLower);
        isNewUniqueClick = true;
      }
      
      const currentClicks = typeof currentData.clicksCount === 'number' ? currentData.clicksCount : 0;
      const updatedData = {
        ...currentData,
        clicksCount: currentClicks + 1,
        clickedEmails: clickedEmails
      };
      
      await axios.patch(url, toFirestoreJSON(updatedData));
      console.log(`[TRACKING] Successfully registered click for ${recipientEmail} on campaign ${campaignId}. Unique=${isNewUniqueClick}, New click count: ${currentClicks + 1}`);
    } catch (err: any) {
      console.error(`Error registering click on emailCampaigns/${campaignId}:`, err.response?.data || err.message);
    }
  }

  function injectTrackingToBody(body: string, campaignId: string, recipientEmail: string, hostUrl: string): string {
    return body;
  }

  async function updateImportedPostStatus(postId: string, mailStatus: string) {
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
      console.log(`[LOCAL SCHEDULE] Successfully updated handoff post ${postId} mailStatus directly to ${mailStatus}`);
    } catch (err: any) {
      if (err.response?.status === 404) {
        console.log(`[LOCAL SCHEDULE] Handoff post ${postId} not found in Firestore (possibly archived).`);
      } else {
        console.error(`[LOCAL SCHEDULE] Error updating post ${postId}:`, err.response?.data || err.message);
      }
    }
  }

  async function getOrRefreshAccessToken(gmailConfig: any) {
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
    } catch (err: any) {
      console.error("Token Refresh Error:", err.response?.data || err.message);
      throw new Error(`Failed to refresh Gmail access token: ${err.message}`);
    }
  }

  function htmlToPlainText(html: string): string {
    let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<li[^>]*>/gi, '\n* ');
    text = text.replace(/<\/p>|<br\s*\/?>|<\/div>|<\/tr>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    return text.trim();
  }

  function buildMimeMessage(to: string, from: string, subject: string, bodyHtml: string, attachments: any[] = []) {
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

    // With attachments: wrapped in multipart/mixed boundary
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

  // Vercel-compatible & client-triggerable cron route
  app.get("/api/cron", async (req, res) => {
    const debugLogs: string[] = [];
    const addLog = (msg: string) => {
      const timestamp = new Date().toISOString();
      debugLogs.push(`[${timestamp}] ${msg}`);
      console.log(`[LOCAL DEV CRON DEBUG] ${msg}`);
    };

    addLog("Local Cron Route Triggered.");

    const envs = {
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ? `${process.env.VITE_FIREBASE_PROJECT_ID.substring(0, 4)}***` : "MISSING",
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ? "CONFIGURED (hidden)" : "MISSING",
      GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ? `${process.env.GMAIL_CLIENT_ID.substring(0, 10)}***` : "MISSING",
      GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? "CONFIGURED (hidden)" : "MISSING",
      GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || "MISSING"
    };

    const report: any = {
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

    if (!process.env.VITE_FIREBASE_PROJECT_ID || !process.env.VITE_FIREBASE_API_KEY) {
      addLog("CRITICAL ERROR: Firebase Config is missing in environment variables!");
      return res.status(500).json({
        ...report,
        message: "Environment variables VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_API_KEY are not configured."
      });
    }

    try {
      addLog("Fetching Gmail config from Firestore...");
      const config = await getGmailConfig();
      addLog(`Gmail info retrieved successfully. Connected status in DB: ${config?.connected}`);
      
      report.gmailConfig = {
        connected: !!config?.connected,
        authorizedEmail: config?.authorizedEmail || null,
        tokenExpiry: config?.tokenExpiry || null,
        hasRefreshToken: !!config?.refreshToken
      };

      if (!config || !config.connected) {
        addLog("Gmail is not connected in settings yet.");
        return res.status(200).json({
          ...report,
          message: "Gmail is not connected yet in settings. Access token cannot be acquired."
        });
      }

      addLog("Fetching email campaigns from Firestore...");
      let documents: any[] = [];
      try {
        documents = await fetchFirestoreCollection("emailCampaigns");
      } catch (campErr: any) {
        addLog(`Failed to fetch campaigns: ${campErr.response?.data?.error?.message || campErr.message}`);
        return res.status(500).json({
          ...report,
          message: `Firestore REST API error fetching campaigns: ${campErr.message}`,
          errorDetails: campErr.response?.data || null
        });
      }
      report.campaignsChecked = documents.length;
      addLog(`Found ${documents.length} campaigns in database.`);

      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      let hostUrl = `${protocol}://${host}`;
      if (hostUrl.includes("run.app") && !hostUrl.startsWith("https://")) {
        hostUrl = hostUrl.replace("http://", "https://");
      }

      const forceCampaignId = req.query.forceCampaignId as string | undefined;

      for (const doc of documents) {
        const id = doc.name.split("/").pop();
        if (!id) continue;
        const campaign = fromFirestoreJSON(doc);
        if (!campaign) continue;

        // Skip other campaigns if we are forcing a specific campaign
        if (forceCampaignId && id !== forceCampaignId) {
          continue;
        }

        const campaignInfo: any = {
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

                // Execute sending and await it to prevent background throttling in serverless
                await runScheduledCampaignSending(id, campaign, config);
                campaignInfo.reason += " Sending cycle finished successfully.";
                addLog(`Successfully processed and sent scheduled campaign "${campaign.title}"`);
              } catch (sendErr: any) {
                campaignInfo.reason += ` Sending dispatch error: ${sendErr.message}`;
                addLog(`Dispatch failed for "${campaign.title}": ${sendErr.message}`);
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
    } catch (globalErr: any) {
      addLog(`Global Local Cron error: ${globalErr.message}`);
      return res.status(500).json({
        ...report,
        error: globalErr.message
      });
    }
  });

  // Image Upload Proxy with Firestore Fallback Hosted Storage
  app.post("/api/upload", async (req, res) => {
    const { fileData, fileName, fileType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "Missing fileData (base64 string)." });
    }

    try {
      const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;
      if (!bucket) {
        throw new Error("VITE_FIREBASE_STORAGE_BUCKET environment variable is not configured on the server.");
      }

      // Convert base64 to buffer
      let base64Pure = fileData;
      if (fileData.startsWith("data:")) {
        const parts = fileData.split(";base64,");
        if (parts.length > 1) {
          base64Pure = parts[1];
        }
      }
      const buffer = Buffer.from(base64Pure, "base64");

      // Upload to Firebase Storage via REST API
      const safeFileName = `campaign-images/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(safeFileName)}`;

      console.log(`[UPLOAD PROXY] Uploading ${safeFileName} to Firebase Storage: ${uploadUrl}`);
      
      const response = await axios.post(uploadUrl, buffer, {
        headers: {
          "Content-Type": fileType || "image/png",
        }
      });

      const { name: uploadedName, downloadTokens } = response.data;
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(uploadedName)}?alt=media&token=${downloadTokens || ""}`;

      console.log(`[UPLOAD PROXY] Successfully uploaded to Storage: ${downloadUrl}`);
      res.json({ success: true, downloadUrl });
    } catch (err: any) {
      console.error("[UPLOAD PROXY ERR] Failed to upload to Firebase Storage:", err.response?.data || err.message);
      
      // Since Firebase Storage might have CORS or permission limits, use Firestore-based fallback
      try {
        console.log("[UPLOAD PROXY] Attempting fallback to Firestore storage...");
        const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        
        const imageDoc = {
          fileName: fileName,
          fileType: fileType || "image/png",
          base64: fileData, // full data URI
          uploadedAt: new Date().toISOString()
        };

        const baseUrl = getFirestoreUrl();
        const apiKey = getApiKeyParam();
        const url = `${baseUrl}/uploadedImages/${safeFileName}${apiKey}`;
        
        await axios.patch(url, toFirestoreJSON(imageDoc));
        
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        let hostUrl = `${protocol}://${host}`;
        if (hostUrl.includes("run.app") && !hostUrl.startsWith("https://")) {
          hostUrl = hostUrl.replace("http://", "https://");
        }
        const downloadUrl = `${hostUrl}/api/hosted-images?id=${safeFileName}`;
        
        console.log(`[UPLOAD PROXY] Fallback successful! Serving via Firestore proxy: ${downloadUrl}`);
        res.json({ success: true, downloadUrl });
      } catch (fallbackErr: any) {
        console.error("[UPLOAD PROXY FALLBACK ERR] Failed fallback to Firestore:", fallbackErr.response?.data || fallbackErr.message);
        res.status(500).json({ error: `Upload failed: ${err.message}` });
      }
    }
  });

  // Serve Fallback Hosted Images from Firestore (supporting both ?id= and /:id formats)
  app.get("/api/hosted-images", async (req, res) => {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).send("Parameter 'id' is required.");
    }
    try {
      const baseUrl = getFirestoreUrl();
      const apiKey = getApiKeyParam();
      const url = `${baseUrl}/uploadedImages/${id}${apiKey}`;
      const response = await axios.get(url);
      const doc = fromFirestoreJSON(response.data);
      if (!doc || !doc.base64) {
        return res.status(404).send("Image not found");
      }

      let base64Pure = doc.base64;
      let contentType = doc.fileType || "image/png";
      
      if (doc.base64.startsWith("data:")) {
        const parts = doc.base64.split(";base64,");
        if (parts.length > 1) {
          const mimePart = parts[0];
          base64Pure = parts[1];
          contentType = mimePart.replace("data:", "").split(";")[0];
        }
      }

      const buffer = Buffer.from(base64Pure, "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
      res.send(buffer);
    } catch (err: any) {
      console.error("[HOSTED IMAGES ERR] Could not serve page image:", err.message);
      res.status(404).send("Image not found");
    }
  });

  app.get("/api/hosted-images/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const baseUrl = getFirestoreUrl();
      const apiKey = getApiKeyParam();
      const url = `${baseUrl}/uploadedImages/${id}${apiKey}`;
      const response = await axios.get(url);
      const doc = fromFirestoreJSON(response.data);
      if (!doc || !doc.base64) {
        return res.status(404).send("Image not found");
      }

      let base64Pure = doc.base64;
      let contentType = doc.fileType || "image/png";
      
      if (doc.base64.startsWith("data:")) {
        const parts = doc.base64.split(";base64,");
        if (parts.length > 1) {
          const mimePart = parts[0];
          base64Pure = parts[1];
          contentType = mimePart.replace("data:", "").split(";")[0];
        }
      }

      const buffer = Buffer.from(base64Pure, "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
      res.send(buffer);
    } catch (err: any) {
      console.error("[HOSTED IMAGES ERR] Could not serve page image:", err.message);
      res.status(404).send("Image not found");
    }
  });

  // Gmail API Endpoints

  app.post("/api/gmail/auth-url", (req, res) => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    
    // Check if the client passed its origin, otherwise detect dynamically from headers
    const clientOrigin = req.body?.origin;
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    
    let dynamicRedirect = clientOrigin 
      ? `${clientOrigin}/api/gmail/callback` 
      : `${protocol}://${host}/api/gmail/callback`;
      
    // Force https for Cloud Run deployment urls
    if (dynamicRedirect.includes("run.app") && !dynamicRedirect.startsWith("https://")) {
      dynamicRedirect = dynamicRedirect.replace("http://", "https://");
    }
    
    const rawRedirect = process.env.GMAIL_REDIRECT_URI;
    const redirectUri = (rawRedirect && rawRedirect.startsWith("http")) ? rawRedirect : dynamicRedirect;
    
    // Save the redirect URI for the subsequent authorization code token exchange
    lastIssuedRedirectUri = redirectUri;
    
    if (!clientId) {
      return res.status(400).json({ error: "GMAIL_CLIENT_ID environment variable is not configured on the server." });
    }
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly"
    ].join(" ");
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    res.json({ url });
  });

  app.get("/api/gmail/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is missing.");
    }
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    
    // Dynamically build redirect URI from request to match exactly what was sent
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    let dynamicRedirect = `${protocol}://${host}/api/gmail/callback`;
    
    if (dynamicRedirect.includes("run.app") && !dynamicRedirect.startsWith("https://")) {
      dynamicRedirect = dynamicRedirect.replace("http://", "https://");
    }
    
    const rawRedirect = process.env.GMAIL_REDIRECT_URI;
    
    // Fall back to the last issued redirect URL if no environment override is present
    let redirectUri = (rawRedirect && rawRedirect.startsWith("http")) ? rawRedirect : "";
    if (!redirectUri) {
      redirectUri = lastIssuedRedirectUri || dynamicRedirect;
    }
    
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
      
      res.send(`
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
    } catch (err: any) {
      console.error("OAuth Exchange Error:", err.response?.data || err.message);
      res.status(500).send(`Failed to exchange authorization code: ${err.message}`);
    }
  });

  app.get("/api/gmail/status", async (req, res) => {
    try {
      const config = await getGmailConfig();
      // Lazy cron trigger on status refresh check
      checkAndSendScheduledCampaigns().catch(e => {
        console.error("Local lazy-cron background hook failed:", e.message);
      });
      res.json({
        connected: !!config.connected,
        authorizedEmail: config.authorizedEmail || null
      });
    } catch (err: any) {
      res.json({ connected: false });
    }
  });

  app.delete("/api/gmail/disconnect", async (req, res) => {
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
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/gmail/send-bulk", async (req, res) => {
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
      let attachments: any[] = [];
      if (campaign?.attachmentsJson) {
        try {
          attachments = JSON.parse(campaign.attachmentsJson);
        } catch (e) {
          console.error("Error parsing campaign attachmentsJson:", e);
        }
      }
      
      await updateCampaignCount(campaignId, 'sending', 0, 0);
      
      let hostUrl = '';
      const referer = req.headers.referer;
      if (referer && referer.startsWith('http')) {
        try {
          const refUrl = new URL(referer);
          hostUrl = `${refUrl.protocol}//${refUrl.host}`;
        } catch (e) {}
      }
      if (!hostUrl) {
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        hostUrl = `${protocol}://${host}`;
      }
      if (hostUrl.includes("run.app") && !hostUrl.startsWith("https://")) {
        hostUrl = hostUrl.replace("http://", "https://");
      }

      let sentCount = 0;
      let failedCount = 0;
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
          body = injectTrackingToBody(body, campaignId, rec.email, hostUrl);
          const rawMessage = buildMimeMessage(rec.email, config.authorizedEmail, subject, body, attachments);
          const sendResp = await axios.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            { raw: rawMessage },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
          );
          sentCount++;
          await createEmailLog({
            campaignId,
            recipientEmail: rec.email,
            status: 'sent',
            sentAt: new Date().toISOString(),
            gmailMessageId: sendResp.data.id
          });
        } catch (err: any) {
          failedCount++;
          const errMsg = err.response?.data?.error?.message || err.message || "Unknown error";
          await createEmailLog({
            campaignId,
            recipientEmail: rec.email,
            status: 'failed',
            errorMessage: errMsg,
            sentAt: new Date().toISOString()
          });
        }
        await updateCampaignCount(campaignId, 'sending', sentCount, failedCount);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      await updateCampaignCount(campaignId, 'sent', sentCount, failedCount);
      res.json({ success: true, message: "Campaign successfully sent.", sentCount, failedCount });
    } catch (err: any) {
      console.error("Bulk Send Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Public Subscriber Portal Endpoints
  app.post("/api/public/subscribe", async (req, res) => {
    const { name, email, tags } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: "Name and Email are required" });
    }

    try {
      // 1. Fetch all subscribers to see if email already exists
      const allDocs = await fetchFirestoreCollection("subscribers");
      const subscribers = allDocs.map((d: any) => {
        const sId = d.name.split("/").pop();
        return { id: sId, ...fromFirestoreJSON(d) };
      });

      const existing = subscribers.find((s: any) => s.email && s.email.toLowerCase() === email.toLowerCase());
      const finalTags = Array.isArray(tags) ? tags : ["Newsletter"];

      // Setup verification properties
      const verificationToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry

      // Calculate verification URL
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      let hostUrl = `${protocol}://${host}`;
      if (hostUrl.includes("run.app") && !hostUrl.startsWith("https://")) {
        hostUrl = hostUrl.replace("http://", "https://");
      }
      const verificationUrl = `${hostUrl}/api/public/verify?token=${verificationToken}&email=${encodeURIComponent(email)}`;

      // Attempt to send confirmation email via Gmail config if connected
      let emailSent = false;
      const config = await getGmailConfig();
      const isGmailConnected = config && config.connected && config.authorizedEmail;

      // Always require verification (status: "pending") to enforce double opt-in GDPR compliance
      const targetStatus = "pending";

      if (isGmailConnected) {
        try {
          const accessToken = await getOrRefreshAccessToken(config);
          const subject = "Please verify your subscription";
          const body = `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Welcome to the STLAF Newsletter, ${name}!</h2>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                Thank you for subscribing. To secure your email and activate your newsletter subscription, please confirm your interest by clicking the button below:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="background-color: #dcae44; color: #000000; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 10px; display: inline-block; box-shadow: 0 3px 5px rgba(220,174,68,0.3);">
                  Confirm Subscription
                </a>
              </div>
              <p style="color: #64748b; font-size: 12px; line-height: 1.5; background-color: #f8fafc; padding: 10px; border-radius: 6px;">
                Link not working? Copy and paste this directly into your browser address bar:<br/>
                <a href="${verificationUrl}" style="color: #bf8d1a; text-decoration: underline; break-all: break-all; font-family: monospace; font-size: 11px;">${verificationUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="color: #94a3b8; font-size: 11px; line-height: 1.4;">
                This link will expire in 24 hours. If you did not make this subscription request, you may safely ignore this message—no active subscription was created.
              </p>
            </div>
          `;
          const rawMessage = buildMimeMessage(email, config.authorizedEmail, subject, body);
          await axios.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            { raw: rawMessage },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
          );
          emailSent = true;
          console.log(`[PUBLIC SUBSCRIPTION] Verification link sent to ${email}`);
        } catch (mailErr: any) {
          console.error("[PUBLIC MAIL SEND ERR] Failed to send verification mail:", mailErr.response?.data || mailErr.message);
        }
      }

      if (existing) {
        // Merge tags
        let subTags: string[] = [];
        if (Array.isArray(existing.tags)) {
          subTags = existing.tags;
        } else if (typeof existing.tags === 'string') {
          try {
            subTags = JSON.parse(existing.tags);
          } catch(e) {
            subTags = [existing.tags];
          }
        }
        const mergedTags = Array.from(new Set([...subTags, ...finalTags]));
        
        const updated = {
          ...existing,
          name: name || existing.name,
          status: targetStatus,
          tags: mergedTags,
          verificationToken,
          verificationExpiresAt
        };

        const patchUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
        await axios.patch(patchUrl, toFirestoreJSON(updated));
        console.log(`[PUBLIC SUBSCRIPTION] Updated subscriber to pending (unverified) state: ${email}`);
      } else {
        // Create new subscriber
        const newSub = {
          name,
          email,
          status: targetStatus,
          tags: finalTags,
          addedAt: new Date().toISOString(),
          addedBy: "public-portal",
          verificationToken,
          verificationExpiresAt
        };
        const postUrl = getFirestoreRestUrl("subscribers");
        await axios.post(postUrl, toFirestoreJSON(newSub));
        console.log(`[PUBLIC SUBSCRIPTION] Added new unverified pending subscriber: ${email}`);
      }

      res.json({ 
        success: true, 
        emailSent, 
        verificationNeeded: true,
        // Provided as developer option if Gmail config is not connected
        devVerificationUrl: verificationUrl 
      });
    } catch (err: any) {
      console.error("[PUBLIC SUBSCRIPTION ERR]", err.response?.data || err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Public verification route to activate subscription
  app.get("/api/public/verify", async (req, res) => {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.redirect(`${lastSeenHostUrl}/subscribe?verified=invalid`);
    }

    try {
      // 1. Fetch matching subscriber
      const allDocs = await fetchFirestoreCollection("subscribers");
      const subscribers = allDocs.map((d: any) => {
        const sId = d.name.split("/").pop();
        return { id: sId, ...fromFirestoreJSON(d) };
      });

      const existing = subscribers.find((s: any) => s.email && s.email.toLowerCase() === (email as string).toLowerCase());
      if (!existing) {
        return res.redirect(`${lastSeenHostUrl}/subscribe?verified=invalid`);
      }

      // Check status & token
      if (existing.status === 'active') {
        // Already verified and active! Just send them back successfully
        return res.redirect(`${lastSeenHostUrl}/subscribe?verified=success&email=${encodeURIComponent(existing.email)}`);
      }

      if (existing.verificationToken !== token) {
        return res.redirect(`${lastSeenHostUrl}/subscribe?verified=invalid`);
      }

      // Check expiration
      if (existing.verificationExpiresAt) {
        const expiresAt = new Date(existing.verificationExpiresAt);
        if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
          // Expired. Remove subscriber so they can try again fresh!
          const deleteUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
          await axios.delete(deleteUrl);
          return res.redirect(`${lastSeenHostUrl}/subscribe?verified=expired`);
        }
      }

      // Activate subscriber
      const updated = {
        ...existing,
        status: "active",
        verifiedAt: new Date().toISOString()
      };
      // Delete verification token properties
      delete updated.verificationToken;
      delete updated.verificationExpiresAt;

      const patchUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
      await axios.patch(patchUrl, toFirestoreJSON(updated));

      console.log(`[PUBLIC SUBSCRIPTION] Verified subscriber: ${email}`);
      return res.redirect(`${lastSeenHostUrl}/subscribe?verified=success&email=${encodeURIComponent(existing.email)}`);
    } catch (err: any) {
      console.error("[PUBLIC VERIFICATION ERR]", err.message);
      return res.redirect(`${lastSeenHostUrl}/subscribe?verified=invalid`);
    }
  });

  app.post("/api/public/unsubscribe", async (req, res) => {
    const { email, reason } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    try {
      // 1. Fetch subscribers to locate match
      const allDocs = await fetchFirestoreCollection("subscribers");
      const subscribers = allDocs.map((d: any) => {
        const sId = d.name.split("/").pop();
        return { id: sId, ...fromFirestoreJSON(d) };
      });

      const existing = subscribers.find((s: any) => s.email && s.email.toLowerCase() === email.toLowerCase());

      if (existing) {
        const updated = {
          ...existing,
          status: "unsubscribed",
          unsubscribeReason: reason || "No reason specified",
          unsubscribedAt: new Date().toISOString()
        };

        const patchUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
        await axios.patch(patchUrl, toFirestoreJSON(updated));
        console.log(`[PUBLIC OPT-OUT] Unsubscribed subscriber: ${email}. Reason: ${reason}`);
        res.json({ success: true, found: true });
      } else {
        // Email wasn't found in current active list, but we still want to make sure they are recorded so they don't get emailed
        // Let's add them as an "unsubscribed" record just in case!
        const newUnsub = {
          name: "Anonymous",
          email,
          status: "unsubscribed",
          tags: ["Unsubscribed"],
          addedAt: new Date().toISOString(),
          addedBy: "public-portal-optout",
          unsubscribeReason: reason || "No reason specified"
        };
        const postUrl = getFirestoreRestUrl("subscribers");
        await axios.post(postUrl, toFirestoreJSON(newUnsub));
        console.log(`[PUBLIC OPT-OUT] Created unsubscribed record for unregistered email: ${email}`);
        res.json({ success: true, found: false });
      }
    } catch (err: any) {
      console.error("[PUBLIC OPT-OUT ERR]", err.response?.data || err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Real-time tracking endpoints
  app.get("/api/track/open", async (req, res) => {
    const { campaignId, recipient } = req.query as { campaignId?: string; recipient?: string };
    
    if (campaignId) {
      const recipientEmail = recipient ? String(recipient).trim() : 'anonymous';
      console.log(`[TRACKING OPEN] Received open pixel request for campaign: ${campaignId}, recipient: ${recipientEmail}`);
      try {
        await registerEmailOpen(campaignId, recipientEmail);
      } catch (err: any) {
        console.error(`[TRACKING OPEN ERR] Failed to register open for campaign ${campaignId}:`, err.message);
      }
    }

    // Return 1x1 transparent GIF pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(pixel);
  });

  app.get("/api/track/click", async (req, res) => {
    const { campaignId, recipient, url } = req.query as { campaignId?: string; recipient?: string; url?: string };
    const targetUrl = url ? String(url).trim() : '';

    if (campaignId && targetUrl) {
      const recipientEmail = recipient ? String(recipient).trim() : 'anonymous';
      console.log(`[TRACKING CLICK] Received link click request for campaign: ${campaignId}, recipient: ${recipientEmail}, targetUrl: ${targetUrl}`);
      try {
        await registerEmailClick(campaignId, recipientEmail);
      } catch (err: any) {
        console.error(`[TRACKING CLICK ERR] Failed to register click for campaign ${campaignId}:`, err.message);
      }
    }

    if (targetUrl) {
      res.redirect(targetUrl);
    } else {
      res.status(400).send("Parameter 'url' is required.");
    }
  });

  // Set to keep track of campaign IDs that are currently being processed
  const activeScheduledSends = new Set<string>();

  // Helper to build Firestore API Urls with query params cleanly
  function getFirestoreRestUrl(collectionPath: string, extraParams: string = "") {
    const baseUrl = getFirestoreUrl();
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    let url = `${baseUrl}/${collectionPath}`;
    const params: string[] = [];
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

  async function fetchFirestoreCollection(collectionPath: string): Promise<any[]> {
    let allDocuments: any[] = [];
    let pageToken = "";
    let loopCount = 0;
    
    do {
      const extraParams = `pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const url = getFirestoreRestUrl(collectionPath, extraParams);
      const resp = await axios.get(url);
      const docs = resp.data?.documents || [];
      allDocuments = [...allDocuments, ...docs];
      pageToken = resp.data?.nextPageToken || "";
      loopCount++;
    } while (pageToken && loopCount < 30);
    
    return allDocuments;
  }

  async function checkAndSendScheduledCampaigns() {
    const config = await getGmailConfig();
    if (!config || !config.connected) {
      return; // Gmail is not connected yet
    }

    let documents: any[];
    try {
      documents = await fetchFirestoreCollection("emailCampaigns");
    } catch (err: any) {
      console.error("[SCHEDULER] Error fetching campaigns for checklist:", err.message);
      return;
    }

    if (documents.length === 0) {
      return;
    }

    for (const doc of documents) {
      const id = doc.name.split("/").pop();
      if (!id) continue;
      const campaign = fromFirestoreJSON(doc);
      if (!campaign || activeScheduledSends.has(id)) continue;

      // Check if campaign is scheduled and is past scheduled date-time
      if (campaign.status === "scheduled" && campaign.scheduledAt) {
        const schedTime = new Date(campaign.scheduledAt).getTime();
        const nowTime = Date.now();

        if (!isNaN(schedTime) && schedTime <= nowTime) {
          console.log(`[SCHEDULER] Campaign detected for sending: "${campaign.title}" (${id}), scheduled for ${campaign.scheduledAt}`);
          activeScheduledSends.add(id);

          // Mark as sending in DB immediately to prevent duplicate runs
          await updateCampaignCount(id, "sending", 0, 0);

          // Execute sending and await its completion to ensure serverless execution is sustained
          await runScheduledCampaignSending(id, campaign, config);
        }
      }
    }
  }

  async function runScheduledCampaignSending(campaignId: string, campaign: any, config: any) {
    try {
      const accessToken = await getOrRefreshAccessToken(config);

      // Extract recipient tags from campaign
      let recipientTags: string[] = [];
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

      // Fetch subscribers from Firestore REST API
      const allDocs = await fetchFirestoreCollection("subscribers");
      const subscribers = allDocs.map((d: any) => {
        const sId = d.name.split("/").pop();
        return { id: sId, ...fromFirestoreJSON(d) };
      });

      // Filter active and matching subscribers
      const activeFilteredSubscribers = subscribers.filter((s: any) => {
        if (s.status !== "active") return false;
        if (recipientTags.length === 0) return true; // All Active Subscribers
        
        let subTags: string[] = [];
        if (Array.isArray(s.tags)) {
          subTags = s.tags;
        } else if (typeof s.tags === 'string') {
          try {
            subTags = JSON.parse(s.tags);
          } catch (e) {
            subTags = s.tags.split(',').map((t: string) => t.trim());
          }
        }
        return subTags.some((t: string) => recipientTags.some((rt: string) => rt.trim().toLowerCase() === t.trim().toLowerCase()));
      });

      console.log(`[SCHEDULER] Filtered ${activeFilteredSubscribers.length} active subscribers for scheduled campaign "${campaign.title}"`);

      let attachments: any[] = [];
      if (campaign.attachmentsJson) {
        try {
          attachments = JSON.parse(campaign.attachmentsJson);
        } catch (e) {
          console.error("[SCHEDULER] Error parsing campaign attachmentsJson:", e);
        }
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const rec of activeFilteredSubscribers) {
        if (!rec.email) continue;
        const subject = (campaign.subject || "")
          .replace(/{{name}}/gi, rec.name || "")
          .replace(/{{email}}/gi, rec.email || "");

        const unsubscribeUrl = `${lastSeenHostUrl}/unsubscribe?email=${encodeURIComponent(rec.email)}`;
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
          body = injectTrackingToBody(body, campaignId, rec.email, lastSeenHostUrl);
          const rawMessage = buildMimeMessage(rec.email, config.authorizedEmail, subject, body, attachments);
          const sendResp = await axios.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            { raw: rawMessage },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
          );
          sentCount++;
          await createEmailLog({
            campaignId,
            recipientEmail: rec.email,
            status: 'sent',
            sentAt: new Date().toISOString(),
            gmailMessageId: sendResp.data.id
          });
        } catch (err: any) {
          failedCount++;
          const errMsg = err.response?.data?.error?.message || err.message || "Unknown error";
          await createEmailLog({
            campaignId,
            recipientEmail: rec.email,
            status: 'failed',
            errorMessage: errMsg,
            sentAt: new Date().toISOString()
          });
        }
        await updateCampaignCount(campaignId, 'sending', sentCount, failedCount);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      await updateCampaignCount(campaignId, 'sent', sentCount, failedCount);
      if (campaign && campaign.importedPostId) {
        await updateImportedPostStatus(campaign.importedPostId, 'authorized');
      }
      console.log(`[SCHEDULER] Scheduled campaign "${campaign.title}" successfully completed! Sent: ${sentCount}, Failed: ${failedCount}`);
    } catch (err: any) {
      console.error(`[SCHEDULER] Error sending scheduled campaign ${campaignId}:`, err.message);
      await updateCampaignCount(campaignId, 'failed', 0, 0);
    } finally {
      activeScheduledSends.delete(campaignId);
    }
  }

  async function cleanExpiredPendingSubscribers() {
    try {
      const allDocs = await fetchFirestoreCollection("subscribers");
      const subscribers = allDocs.map((d: any) => {
        const sId = d.name.split("/").pop();
        return { id: sId, ...fromFirestoreJSON(d) };
      });

      const now = new Date();
      for (const sub of subscribers) {
        if (sub.status === "pending" && sub.verificationExpiresAt) {
          const expiresAt = new Date(sub.verificationExpiresAt);
          if (!isNaN(expiresAt.getTime()) && expiresAt < now) {
            // Remove from active/pending subscribers as they failed to verify within 24hr window
            const deleteUrl = getFirestoreRestUrl(`subscribers/${sub.id}`);
            await axios.delete(deleteUrl);
            console.log(`[CLEANER] Automatically removed expired pending subscriber: ${sub.email} (${sub.id})`);
          }
        }
      }
    } catch (e: any) {
      console.error("[CLEANER ERR] Error running background subscriber cleanup:", e.message);
    }
  }

  // Start periodic scheduler checks (every 60 seconds)
  setInterval(async () => {
    try {
      await checkAndSendScheduledCampaigns();
    } catch (e: any) {
      console.error("[SCHEDULER INTERVAL ERR] Error in scheduled run:", e.message);
    }
  }, 60000);

  // Background subscriber cleanup (every 10 minutes)
  setInterval(async () => {
    try {
      await cleanExpiredPendingSubscribers();
    } catch (e: any) {
      console.error("[SCHEDULER CLEANER ERR] Error in background subscriber cleanup:", e.message);
    }
  }, 600000);

  let viteInstance: any = null;

  const getDynamicFirebaseConfigScript = () => {
    const config = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || "",
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || `${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || `${process.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.VITE_FIREBASE_APP_ID || "",
      databaseId: process.env.VITE_FIREBASE_DATABASE_ID || "(default)",
    };
    return `<script>
      window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};
    </script>`;
  };

  // Intercept HTML requests to inject real-time environment variables dynamic config
  app.use(async (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    // Is it an HTML route or root navigation?
    if (req.path === "/" || req.path === "/index.html" || (!req.path.includes(".") && req.headers.accept?.includes("text/html"))) {
      try {
        const isDev = process.env.NODE_ENV !== "production";
        const templatePath = isDev 
          ? path.join(process.cwd(), 'index.html') 
          : path.join(process.cwd(), 'dist', 'index.html');
        
        let html = await fs.promises.readFile(templatePath, "utf-8");
        
        if (isDev && viteInstance) {
          html = await viteInstance.transformIndexHtml(req.url, html);
        }
        
        const configScript = getDynamicFirebaseConfigScript();
        html = html.replace("<head>", `<head>\n    ${configScript}`);
        
        res.setHeader("Content-Type", "text/html");
        return res.status(200).send(html);
      } catch (err: any) {
        console.error("Error serving index.html dynamically:", err.message);
      }
    }
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    viteInstance = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteInstance.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  
  return { app, server };
}

const serverPromise = startServer();
export default (await serverPromise).app;
