const http = require('http');
const crypto = require('crypto');
const querystring = require('querystring');

const APP_ID = '1011325198442261';
const APP_SECRET = '91dd43e37483b54f6fff9d2b4fec9586';
const REDIRECT_URI = 'http://localhost:3000/integrations/social/threads';
const PORT = 3000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (url.pathname === '/') {
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = `https://www.threads.net/oauth/authorize?` + querystring.stringify({
      client_id: APP_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'threads_basic,threads_content_publish',
      response_type: 'code',
      state: state
    });
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authenticate with Threads</h2><a href="${authUrl}">Login with Threads</a>`);
    return;
  }

  if (url.pathname === '/integrations/social/threads') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code parameter');
      return;
    }

    try {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<h2>Authenticating...</h2>');
      
      // 1. Exchange code for short-lived token
      const tokenResponse = await fetch('https://graph.threads.net/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: querystring.stringify({
          client_id: APP_ID,
          client_secret: APP_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code: code
        })
      });
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
         res.write(`<p>Error getting token: ${JSON.stringify(tokenData)}</p>`);
         res.end();
         return;
      }
      
      const accessToken = tokenData.access_token;
      const userId = tokenData.user_id;

      res.write('<p>Authenticated! Access token received.</p>');
      res.write('<p>Creating post...</p>');

      // 2. Create Threads Text Container
      const createResponse = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: querystring.stringify({
          media_type: 'TEXT',
          text: 'Done My Boi',
          access_token: accessToken
        })
      });
      const createData = await createResponse.json();
      
      if (createData.error) {
         res.write(`<p>Error creating post container: ${JSON.stringify(createData)}</p>`);
         res.end();
         return;
      }
      
      const creationId = createData.id;
      res.write(`<p>Post container created. ID: ${creationId}. Waiting a moment before publishing...</p>`);
      
      // Give it a moment to process (usually instant for text)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. Publish the Thread
      const publishResponse = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: querystring.stringify({
          creation_id: creationId,
          access_token: accessToken
        })
      });
      const publishData = await publishResponse.json();
      
      if (publishData.error) {
         res.write(`<p>Error publishing post: ${JSON.stringify(publishData)}</p>`);
         res.end();
         return;
      }

      res.write(`<h3>Success! Post published.</h3><p>Thread ID: ${publishData.id}</p>`);
      res.end();
      
      // Clean up server after success
      setTimeout(() => {
        console.log('Post successful. Exiting.');
        process.exit(0);
      }, 1000);

    } catch (e) {
      res.write(`<p>Exception: ${e.message}</p>`);
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server is running!`);
  console.log(`Please open your browser to: http://localhost:${PORT}`);
});
