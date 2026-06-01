import axios from 'axios';
import FormData from 'form-data';

function getUnixTimestampInSeconds(scheduleTime) {
  if (!scheduleTime) return null;
  if (typeof scheduleTime === 'string') {
    const parsedNum = Number(scheduleTime);
    if (!isNaN(parsedNum)) {
      scheduleTime = parsedNum;
    }
  }
  if (typeof scheduleTime === 'number') {
    if (scheduleTime > 9999999999) {
      return Math.floor(scheduleTime / 1000);
    }
    return scheduleTime;
  }
  const parsedDate = new Date(scheduleTime);
  if (!isNaN(parsedDate.getTime())) {
    return Math.floor(parsedDate.getTime() / 1000);
  }
  return null;
}

export default async function handler(req, res) {
  const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

  // ── DELETE /api/facebook-post/:postId ──────────────────────────────────────
  if (req.method === 'DELETE') {
    // Vercel passes dynamic segments via req.query when the file is named
    // [postId].js, but since this file is facebook-post.js we use the 
    // query param populated by our vercel.json rewrite or fallback to req.url parsing.
    const postId = req.query.postId || req.url.split('/api/facebook-post/')[1]?.split('?')[0];

    if (!postId) {
      return res.status(400).json({ success: false, error: 'Missing postId in URL.' });
    }

    if (!PAGE_ACCESS_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'Facebook credentials (FACEBOOK_PAGE_ACCESS_TOKEN) are not configured.',
      });
    }

    try {
      await axios.delete(`https://graph.facebook.com/v19.0/${postId}`, {
        params: { access_token: PAGE_ACCESS_TOKEN.trim() },
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      const errorData = error.response?.data?.error || { message: error.message };
      console.error('Facebook DELETE Error:', JSON.stringify(errorData, null, 2));
      return res.status(error.response?.status || 500).json({
        success: false,
        error: errorData.message || 'Failed to delete post from Facebook',
        fbError: errorData,
      });
    }
  }

  // ── POST /api/facebook-post ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { message, mediaUrl, scheduleTime, mediaUrls } = req.body;

    if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
      return res.status(500).json({
        success: false,
        error: 'Facebook credentials not configured.',
      });
    }

    try {
      const PAGE_TOKEN = PAGE_ACCESS_TOKEN.trim();
      const PAGE = PAGE_ID.trim();

      const allMedia =
        Array.isArray(mediaUrls) && mediaUrls.length > 0
          ? mediaUrls
          : mediaUrl
          ? [mediaUrl]
          : [];

      // ── Upload each image as an unpublished photo ──────────────────────────
      const uploadPhoto = async (url, idx) => {
        const photoEndpoint = `https://graph.facebook.com/v19.0/${PAGE}/photos`;

        if (url.startsWith('data:')) {
          const [header, base64Data] = url.split(',');
          const buffer = Buffer.from(base64Data, 'base64');
          const mimeType = header.split(';')[0].split(':')[1] || 'image/jpeg';

          const form = new FormData();
          form.append('access_token', PAGE_TOKEN);
          form.append('source', buffer, {
            filename: `image_${idx}.jpg`,
            contentType: mimeType,
          });
          form.append('published', 'false');

          const response = await axios.post(photoEndpoint, form, {
            headers: form.getHeaders(),
          });
          return response.data.id;
        } else {
          const params = new URLSearchParams();
          params.append('access_token', PAGE_TOKEN);
          params.append('url', url);
          params.append('published', 'false');

          const response = await axios.post(photoEndpoint, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
          return response.data.id;
        }
      };

      // ── Build final post ───────────────────────────────────────────────────
      const feedEndpoint = `https://graph.facebook.com/v19.0/${PAGE}/feed`;
      const finalParams = new URLSearchParams();
      finalParams.append('access_token', PAGE_TOKEN);
      finalParams.append('message', message || '');

      if (allMedia.length > 0) {
        const mediaIds = await Promise.all(allMedia.map(uploadPhoto));
        finalParams.append(
          'attached_media',
          JSON.stringify(mediaIds.map((id) => ({ media_fbid: id })))
        );
      }

      const unixTime = getUnixTimestampInSeconds(scheduleTime);
      if (unixTime) {
        finalParams.append('published', 'false');
        finalParams.append('scheduled_publish_time', unixTime.toString());
      }

      const response = await axios.post(feedEndpoint, finalParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      return res.status(200).json({ success: true, postId: response.data.id });
    } catch (error) {
      const errorData = error.response?.data?.error || { message: error.message };
      console.error('Facebook POST Error:', JSON.stringify(errorData, null, 2));
      return res.status(error.response?.status || 500).json({
        success: false,
        error: errorData.message || 'Failed to post to Facebook',
        fbError: errorData,
      });
    }
  }

  // ── Anything else ──────────────────────────────────────────────────────────
  return res.status(405).json({ error: 'Method not allowed' });
}