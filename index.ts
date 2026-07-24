const APP_ID = process.env.THREADS_APP_ID || '1011325198442261';
const APP_SECRET = process.env.THREADS_APP_SECRET || '91dd43e37483b54f6fff9d2b4fec9586';

// Clean up RENDER_EXTERNAL_URL in case it has a trailing slash
const baseURL = process.env.RENDER_EXTERNAL_URL 
  ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '') 
  : 'http://localhost:3000';
  
const REDIRECT_URI = `${baseURL}/integrations/social/threads`;
const PORT = process.env.PORT || 3000;

// Keep track of used codes in memory so a page refresh doesn't trigger a failure
const usedCodes = new Set();

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

      if (usedCodes.has(code)) {
        return new Response(`
          <div style="font-family: sans-serif; padding: 2rem;">
            <h2>Already Processed!</h2>
            <p>This code was already used. Please check your Threads account, the post should already be there!</p>
            <a href="/">Go back</a>
          </div>
        `, { headers: { 'Content-Type': 'text/html' } });
      }
      
      usedCodes.add(code);

      try {
        // 1. Exchange code for short-lived token
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
           return new Response(`Error getting token: ${JSON.stringify(tokenData)}`, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        const accessToken = tokenData.access_token;
        const userId = tokenData.user_id;

        // 2. Create Threads Text Container
        const createParams = new URLSearchParams({
          media_type: 'TEXT',
          text: 'Done My Boi',
          access_token: accessToken,
        });

        const createResponse = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: createParams.toString(),
        });
        const createData = await createResponse.json();

        if (createData.error) {
           return new Response(`Error creating post container: ${JSON.stringify(createData)}`, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        const creationId = createData.id;

        // Wait for Threads to process the container
        await Bun.sleep(2000);

        // 3. Publish the Thread
        const publishParams = new URLSearchParams({
          creation_id: creationId,
          access_token: accessToken,
        });

        const publishResponse = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: publishParams.toString(),
        });
        const publishData = await publishResponse.json();

        if (publishData.error) {
           return new Response(`Error publishing post: ${JSON.stringify(publishData)}`, { status: 400, headers: { 'Content-Type': 'text/html' } });
        }

        // Return the final success screen!
        return new Response(`
          <div style="font-family: sans-serif; padding: 2rem;">
            <h2>Success! Post published.</h2>
            <p>Thread ID: ${publishData.id}</p>
            <p>Check your Threads account to see the post!</p>
            <a href="/">Post another one</a>
          </div>
        `, { headers: { 'Content-Type': 'text/html' } });

      } catch (e: any) {
        return new Response(`<p>Exception: ${e.message}</p>`, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Bun server is running on port ${PORT}!`);