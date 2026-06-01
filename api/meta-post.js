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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, mediaUrl, scheduleTime, mediaUrls, platforms } = req.body;
  const targetPlatforms = Array.isArray(platforms) ? platforms : ['facebook'];

  if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
    return res.status(500).json({
      success: false,
      error: 'Facebook credentials (FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID) are not configured.',
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

    let igUserId = null;
    if (targetPlatforms.includes('instagram')) {
      const pageInfoResponse = await axios.get(
        `https://graph.facebook.com/v19.0/${PAGE}`,
        {
          params: {
            fields: 'instagram_business_account',
            access_token: PAGE_TOKEN,
          },
        }
      );
      if (pageInfoResponse.data.instagram_business_account) {
        igUserId = pageInfoResponse.data.instagram_business_account.id;
      } else {
        return res.status(400).json({
          success: false,
          error: 'No Instagram Business Account linked to this Facebook Page.',
        });
      }
    }

    const results = {};

    // Upload photos as unpublished to get IDs + public URLs
    const uploadedMedia = await Promise.all(
      allMedia.map(async (url, idx) => {
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
          const fbPhotoId = response.data.id;

          const photoDetails = await axios.get(
            `https://graph.facebook.com/v19.0/${fbPhotoId}`,
            { params: { fields: 'images', access_token: PAGE_TOKEN } }
          );
          const publicUrl = photoDetails.data.images?.[0]?.source;
          return { fbPhotoId, publicUrl };
        } else {
          const params = new URLSearchParams();
          params.append('access_token', PAGE_TOKEN);
          params.append('url', url);
          params.append('published', 'false');

          const response = await axios.post(photoEndpoint, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
          const fbPhotoId = response.data.id;

          const photoDetails = await axios.get(
            `https://graph.facebook.com/v19.0/${fbPhotoId}`,
            { params: { fields: 'images', access_token: PAGE_TOKEN } }
          );
          const publicUrl = photoDetails.data.images?.[0]?.source;
          return { fbPhotoId, publicUrl };
        }
      })
    );

    // Post to Facebook
    if (targetPlatforms.includes('facebook')) {
      const feedEndpoint = `https://graph.facebook.com/v19.0/${PAGE}/feed`;
      const params = new URLSearchParams();
      params.append('access_token', PAGE_TOKEN);
      params.append('message', message || '');

      if (uploadedMedia.length > 0) {
        params.append(
          'attached_media',
          JSON.stringify(
            uploadedMedia.map((m) => ({ media_fbid: m.fbPhotoId }))
          )
        );
      }

      const unixTime = getUnixTimestampInSeconds(scheduleTime);
      if (unixTime) {
        params.append('published', 'false');
        params.append('scheduled_publish_time', unixTime.toString());
      }

      const response = await axios.post(feedEndpoint, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      results.facebook = response.data.id || response.data.post_id;
    }

    // Post to Instagram
    if (targetPlatforms.includes('instagram') && igUserId) {
      if (scheduleTime) {
        throw new Error(
          'Instagram scheduling is not supported via this endpoint. Use Post Now instead.'
        );
      }
      if (uploadedMedia.length === 0) {
        throw new Error('Instagram requires at least one image.');
      }

      if (uploadedMedia.length === 1) {
        const creationRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          null,
          {
            params: {
              image_url: uploadedMedia[0].publicUrl,
              caption: message || '',
              access_token: PAGE_TOKEN,
            },
          }
        );

        // Wait for processing
        await new Promise((r) => setTimeout(r, 5000));

        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          null,
          {
            params: {
              creation_id: creationRes.data.id,
              access_token: PAGE_TOKEN,
            },
          }
        );
        results.instagram = publishRes.data.id;
      } else {
        const itemIds = await Promise.all(
          uploadedMedia.map(async (media) => {
            const r = await axios.post(
              `https://graph.facebook.com/v19.0/${igUserId}/media`,
              null,
              {
                params: {
                  image_url: media.publicUrl,
                  is_carousel_item: 'true',
                  access_token: PAGE_TOKEN,
                },
              }
            );
            return r.data.id;
          })
        );

        const carouselRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igUserId}/media`,
          null,
          {
            params: {
              media_type: 'CAROUSEL',
              children: itemIds.join(','),
              caption: message || '',
              access_token: PAGE_TOKEN,
            },
          }
        );

        await new Promise((r) => setTimeout(r, 5000));

        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          null,
          {
            params: {
              creation_id: carouselRes.data.id,
              access_token: PAGE_TOKEN,
            },
          }
        );
        results.instagram = publishRes.data.id;
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    const errorData = error.response?.data?.error || {};
    console.error('Meta POST Error:', JSON.stringify(errorData, null, 2));

    let friendlyMessage = 'Failed to post to Meta properties';
    if (errorData.type === 'OAuthException') {
      friendlyMessage = `Meta Auth Error: ${errorData.message || 'Invalid or expired token'}`;
    } else if (errorData.message) {
      friendlyMessage = errorData.message;
    } else if (error.message) {
      friendlyMessage = error.message;
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      error: friendlyMessage,
      fbError: errorData,
    });
  }
}