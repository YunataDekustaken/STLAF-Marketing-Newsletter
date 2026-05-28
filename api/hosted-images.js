import axios from 'axios';

function getFirestoreUrl() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || "(default)";
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
}

function getApiKeyParam() {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  return apiKey ? `?key=${apiKey}` : "";
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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get the segment ID from query 'id'
  const id = req.query.id;
  if (!id) {
    return res.status(400).send("Parameter 'id' is required.");
  }

  try {
    const baseUrl = getFirestoreUrl();
    const apiKey = getApiKeyParam();
    const url = `${baseUrl}/uploadedImages/${id}${apiKey}`;

    console.log(`[VERCEL HOSTED IMAGE] Retrieving document ${id}`);
    const response = await axios.get(url);
    const doc = fromFirestoreJSON(response.data);

    if (!doc || !doc.base64) {
      return res.status(404).send("Image document contains no data.");
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
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // Cache aggressively for 1 year
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[VERCEL HOSTED IMAGE ERR] Could not fetch/serve image:", err.message);
    return res.status(404).send("Image not found");
  }
}
