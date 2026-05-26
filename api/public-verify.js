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

function getFirestoreRestUrl(collectionPath, extraParams = "") {
  const baseUrl = getFirestoreUrl();
  let url = `${baseUrl}/${collectionPath}${getApiKeyParam()}`;
  if (extraParams) {
    url += url.includes("?") ? `&${extraParams}` : `?${extraParams}`;
  }
  return url;
}

function toFirestoreJSON(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (typeof val === 'number') fields[key] = { doubleValue: val };
    else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(item => {
            if (typeof item === 'boolean') return { booleanValue: item };
            if (typeof item === 'number') return { doubleValue: item };
            return { stringValue: String(item) };
          })
        }
      };
    } else fields[key] = { stringValue: String(val || '') };
  }
  return { fields };
}

function fromFirestoreJSON(doc) {
  if (!doc || !doc.fields) return null;
  const obj = {};
  for (const [key, vo] of Object.entries(doc.fields)) {
    if (vo.booleanValue !== undefined) obj[key] = vo.booleanValue;
    else if (vo.doubleValue !== undefined) obj[key] = Number(vo.doubleValue);
    else if (vo.integerValue !== undefined) obj[key] = Number(vo.integerValue);
    else if (vo.stringValue !== undefined) obj[key] = vo.stringValue;
    else if (vo.arrayValue && vo.arrayValue.values) obj[key] = vo.arrayValue.values.map(v => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '');
    else obj[key] = JSON.stringify(vo);
  }
  return obj;
}

// ── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { token, email } = req.query;

  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  let hostUrl = `${protocol}://${host}`;
  if (hostUrl.includes("run.app") && !hostUrl.startsWith("https://")) {
    hostUrl = hostUrl.replace("http://", "https://");
  }

  if (!token || !email) {
    return res.redirect(`${hostUrl}/subscribe?verified=invalid`);
  }

  try {
    // 1. Fetch matching subscriber
    const subUrl = getFirestoreRestUrl("subscribers", "pageSize=300");
    const subResp = await axios.get(subUrl);
    const allDocs = subResp.data?.documents || [];
    const subscribers = allDocs.map((d) => {
      const sId = d.name.split("/").pop();
      return { id: sId, ...fromFirestoreJSON(d) };
    });

    const existing = subscribers.find((s) => s.email && s.email.toLowerCase() === email.toLowerCase());
    if (!existing) {
      return res.redirect(`${hostUrl}/subscribe?verified=invalid`);
    }

    // Check status
    if (existing.status === 'active') {
      return res.redirect(`${hostUrl}/subscribe?verified=success&email=${encodeURIComponent(existing.email)}`);
    }

    // Check token matches
    if (existing.verificationToken !== token) {
      return res.redirect(`${hostUrl}/subscribe?verified=invalid`);
    }

    // Check expiration
    if (existing.verificationExpiresAt) {
      const expiresAt = new Date(existing.verificationExpiresAt);
      if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        const deleteUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
        await axios.delete(deleteUrl);
        return res.redirect(`${hostUrl}/subscribe?verified=expired`);
      }
    }

    // Activate subscriber
    const updated = {
      ...existing,
      status: "active",
      verifiedAt: new Date().toISOString()
    };
    delete updated.verificationToken;
    delete updated.verificationExpiresAt;

    const patchUrl = getFirestoreRestUrl(`subscribers/${existing.id}`);
    await axios.patch(patchUrl, toFirestoreJSON(updated));

    console.log(`[PUBLIC SUBSCRIPTION] Verified subscriber: ${email}`);

    // Create real-time dashboard notification
    try {
      const newNotify = {
        title: "Subscriber Verified ✅",
        message: `${email} verified their email and is now an active subscriber!`,
        type: "success",
        read: false,
        createdAt: new Date().toISOString()
      };
      const notifyUrl = getFirestoreRestUrl("notifications");
      await axios.post(notifyUrl, toFirestoreJSON(newNotify));
    } catch (notifyErr) {
      console.warn("Could not post system notification:", notifyErr.message);
    }

    return res.redirect(`${hostUrl}/subscribe?verified=success&email=${encodeURIComponent(existing.email)}`);
  } catch (err) {
    console.error("[PUBLIC VERIFICATION ERR]", err.message);
    return res.redirect(`${hostUrl}/subscribe?verified=invalid`);
  }
}
