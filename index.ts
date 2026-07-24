const APP_ID = process.env.THREADS_APP_ID || '1011325198442261';
const APP_SECRET = process.env.THREADS_APP_SECRET || '91dd43e37483b54f6fff9d2b4fec9586';

const baseURL = process.env.RENDER_EXTERNAL_URL 
  ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '') 
  : 'http://localhost:3000';
  
const REDIRECT_URI = `${baseURL}/integrations/social/threads`;
const PORT = process.env.PORT || 3000;

// Cache the responses so if the browser double-requests the URL, you see the actual output of the first run.
const responseCache = new Map();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/') {
      const state = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      const authUrl = `https://www.threads.net/oauth/authorize?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
      )}&scope=threads_basic,threads_content_publish&response_type=code&state=${state}`;

      return new Response(`
        <div style="font-family: sans-serif; padding: 2rem;">
          <h2>Authenticate with Threads</h2>
          <a href="${authUrl}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Login with Threads</a>
        </div>
      `, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.pathname === '/integrations/social/threads') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing code parameter', { status: 400 });
      }

      // If the browser already hit this in the background, return the saved response.
      if (responseCache.has(code)) {
        const cachedHtml = responseCache.get(code);
        return new Response(cachedHtml, { headers: { 'Content-Type': 'text/html' } });
      }
      
      // Mark as currently processing
      responseCache.set(code, '<h2>Processing... please wait or refresh in 30 seconds.</h2>');

      try {
        console.log("Exchanging code for token...");
        
        // 1. Exchange code for token (Standard OAuth application/x-www-form-urlencoded)
        const tokenParams = new URLSearchParams({
          client_id: APP_ID,
          client_secret: APP_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code: code,
        });

        const tokenResponse = await fetch('https://graph.threads.net/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
           console.error("Token Error:", tokenData);
           const errorHtml = `<h2>Error getting token</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre><a href="/">Try again</a>`;
           responseCache.set(code, errorHtml);
           return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        const accessToken = tokenData.access_token;
        
        // IMPORTANT: The user_id returned by the token endpoint is NOT the Threads User ID!
        // We MUST fetch the actual Threads User ID from the /me endpoint just like Postiz does.
        const meResponse = await fetch(`https://graph.threads.net/v1.0/me?access_token=${accessToken}`);
        const meData = await meResponse.json();
        
        if (meData.error) {
           console.error("Me Error:", meData);
           const errorHtml = `<h2>Error fetching user info</h2><pre>${JSON.stringify(meData, null, 2)}</pre><a href="/">Try again</a>`;
           responseCache.set(code, errorHtml);
           return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }
        
        const threadsUserId = meData.id;
        console.log(`Got correct Threads User ID: ${threadsUserId}. Creating text container...`);

        // 2. Create Threads Text Container
        const createParams = new URLSearchParams({
          media_type: 'TEXT',
          text: 'Done My Boi',
          access_token: accessToken,
        });

        const createResponse = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: createParams.toString(),
        });
        
        const createData = await createResponse.json();

        if (createData.error) {
           console.error("Container Error:", createData);
           const errorHtml = `<h2>Error creating post container</h2><pre>${JSON.stringify(createData, null, 2)}</pre><a href="/">Try again</a>`;
           responseCache.set(code, errorHtml);
           return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        const creationId = createData.id;
        console.log(`Container created: ${creationId}. Waiting 15 seconds to ensure processing...`);

        // Wait for Threads to process the container.
        await Bun.sleep(15000);

        console.log(`Publishing container ${creationId}...`);

        // 3. Publish the Thread
        const publishParams = new URLSearchParams({
          creation_id: creationId,
          access_token: accessToken,
        });
        
        const publishResponse = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: publishParams.toString(),
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
           console.error("Publish Error:", publishData);
           const errorHtml = `<h2>Error publishing post</h2><pre>${JSON.stringify(publishData, null, 2)}</pre><a href="/">Try again</a>`;
           responseCache.set(code, errorHtml);
           return new Response(errorHtml, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        console.log(`Success! Post ID: ${publishData.id}`);

        // Return the final success screen
        const successHtml = `
          <div style="font-family: sans-serif; padding: 2rem;">
            <h2>Success! Post published.</h2>
            <p>Thread ID: ${publishData.id}</p>
            <p>Check your Threads account to see the post!</p>
            <a href="/">Post another one</a>
          </div>
        `;
        responseCache.set(code, successHtml);
        return new Response(successHtml, { headers: { 'Content-Type': 'text/html' } });

      } catch (e: any) {
        console.error("Exception:", e);
        const errorHtml = `<h2>Exception Occurred</h2><pre>${e.message}</pre><a href="/">Try again</a>`;
        responseCache.set(code, errorHtml);
        return new Response(errorHtml, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Bun server is running on port ${PORT}!`);