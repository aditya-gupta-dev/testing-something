const APP_ID = process.env.THREADS_APP_ID || '1011325198442261';
const APP_SECRET = process.env.THREADS_APP_SECRET || '91dd43e37483b54f6fff9d2b4fec9586';
const REDIRECT_URI = process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/integrations/social/threads` : 'http://localhost:3000/integrations/social/threads';
const PORT = process.env.PORT || 3000;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/') {
      const state = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      const authUrl = `https://www.threads.net/oauth/authorize?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
      )}&scope=threads_basic,threads_content_publish&response_type=code&state=${state}`;

      return new Response(`<h2>Authenticate with Threads</h2><a href="${authUrl}">Login with Threads</a>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.pathname === '/integrations/social/threads') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Missing code parameter', { status: 400 });
      }

      try {
        const stream = new ReadableStream({
          async start(controller) {
            const sendHTML = (text: string) => controller.enqueue(new TextEncoder().encode(text));

            sendHTML('<h2>Authenticating...</h2>');

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
              sendHTML(`<p>Error getting token: ${JSON.stringify(tokenData)}</p>`);
              controller.close();
              return;
            }

            const accessToken = tokenData.access_token;
            const userId = tokenData.user_id;

            sendHTML('<p>Authenticated! Access token received.</p>');
            sendHTML('<p>Creating post...</p>');

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
              sendHTML(`<p>Error creating post container: ${JSON.stringify(createData)}</p>`);
              controller.close();
              return;
            }

            const creationId = createData.id;
            sendHTML(`<p>Post container created. ID: ${creationId}. Waiting a moment before publishing...</p>`);

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
              sendHTML(`<p>Error publishing post: ${JSON.stringify(publishData)}</p>`);
              controller.close();
              return;
            }

            sendHTML(`<h3>Success! Post published.</h3><p>Thread ID: ${publishData.id}</p>`);
            controller.close();

            // Exit server on success
            setTimeout(() => {
              console.log('Post successful. Exiting.');
              process.exit(0);
            }, 1000);
          },
        });

        return new Response(stream, { headers: { 'Content-Type': 'text/html' } });
      } catch (e: any) {
        return new Response(`<p>Exception: ${e.message}</p>`, {
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  },
});

console.log(`Bun server is running!`);
console.log(`Please open your browser to: http://localhost:${PORT}`);