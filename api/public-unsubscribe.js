import axios from "axios";

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
    else if (vo.arrayValue) obj[key] = vo.arrayValue.values ? vo.arrayValue.values.map(v => v.booleanValue ?? v.doubleValue ?? v.integerValue ?? v.stringValue ?? '') : [];
    else obj[key] = JSON.stringify(vo);
  }
  return obj;
}

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
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, reason } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  try {
    const subUrl = getFirestoreRestUrl("subscribers", "pageSize=300");
    const subResp = await axios.get(subUrl);
    const allDocs = subResp.data?.documents || [];
    const subscribers = allDocs.map((d) => {
      const sId = d.name.split("/").pop();
      return { id: sId, ...fromFirestoreJSON(d) };
    });

    const existing = subscribers.find((s) => s.email && s.email.toLowerCase() === email.toLowerCase());

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
      return res.status(200).json({ success: true, found: true });
    } else {
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
      return res.status(200).json({ success: true, found: false });
    }
  } catch (err) {
    console.error("[PUBLIC OPT-OUT ERR]", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
