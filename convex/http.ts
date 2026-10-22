import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

const http = httpRouter();

// The room server (Cloudflare) asks here whether a world code is real.
http.route({
  path: '/world',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const code = new URL(request.url).searchParams.get('code') ?? '';
    const exists = await ctx.runQuery(internal.worlds.exists, { code });
    return new Response(JSON.stringify({ exists }), {
      status: exists ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
});

export default http;
