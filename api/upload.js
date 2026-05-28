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

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileData, fileName, fileType } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: "Missing fileData (base64 string)." });
  }

  try {
    const bucket = process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      throw new Error("VITE_FIREBASE_STORAGE_BUCKET is not set.");
    }

    // Isolate pure base64 data
    let base64Pure = fileData;
    if (fileData.startsWith("data:")) {
      const parts = fileData.split(";base64,");
      if (parts.length > 1) {
        base64Pure = parts[1];
      }
    }
    const buffer = Buffer.from(base64Pure, "base64");

    const safeFileName = `campaign-images/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(safeFileName)}`;

    console.log(`[VERCEL UPLOAD] Attempting Firebase Storage Upload: ${uploadUrl}`);
    
    const response = await axios.post(uploadUrl, buffer, {
      headers: {
        "Content-Type": fileType || "image/png",
      }
    });

    const { name: uploadedName, downloadTokens } = response.data;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(uploadedName)}?alt=media&token=${downloadTokens || ""}`;

    console.log(`[VERCEL UPLOAD] Firebase Storage uploads succeeded: ${downloadUrl}`);
    return res.status(200).json({ success: true, downloadUrl });
  } catch (err) {
    console.error("[VERCEL UPLOAD ERR] Storage upload failed, utilizing Firestore fallback:", err.message);

    try {
      const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      
      const imageDoc = {
        fileName,
        fileType: fileType || "image/png",
        base64: fileData, 
        uploadedAt: new Date().toISOString()
      };

      const baseUrl = getFirestoreUrl();
      const apiKey = getApiKeyParam();
      const url = `${baseUrl}/uploadedImages/${safeFileName}${apiKey}`;
      
      await axios.patch(url, toFirestoreJSON(imageDoc));
      
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'stlaf-marketing-newsletter.vercel.app';
      let hostUrl = `${protocol}://${host}`;
      if (hostUrl.includes("vercel.app") && !hostUrl.startsWith("https://")) {
        hostUrl = hostUrl.replace("http://", "https://");
      }

      // Generate query parameter fallback url
      const downloadUrl = `${hostUrl}/api/hosted-images?id=${safeFileName}`;
      
      console.log(`[VERCEL UPLOAD] Fallback successful: ${downloadUrl}`);
      return res.status(200).json({ success: true, downloadUrl });
    } catch (fallbackErr) {
      console.error("[VERCEL UPLOAD FALLBACK ERR] Firestore fallback failure:", fallbackErr.message);
      return res.status(500).json({ error: `Upload failed. Storage error: ${err.message}. Fallback error: ${fallbackErr.message}` });
    }
  }
}
