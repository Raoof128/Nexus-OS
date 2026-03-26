export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Strip the /api prefix and forward to DigitalOcean backend
    const backendPath = url.pathname.replace(/^\/api/, "") || "/";
    const backendUrl = `${env.BACKEND_ORIGIN}${backendPath}${url.search}`;

    // Only forward an allowlist of safe headers (never forward raw
    // X-Forwarded-For — clients can spoof it to bypass rate limits)
    const ALLOWED_HEADERS = [
      "content-type",
      "cookie",
      "authorization",
      "accept",
      "accept-language",
      "accept-encoding",
    ];
    const headers = new Headers();
    for (const name of ALLOWED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    // Build X-Forwarded-For from CF-Connecting-IP (set by Cloudflare, not spoofable)
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp) headers.set("X-Forwarded-For", clientIp);

    // Override the Host header so the backend accepts the request
    headers.set("Host", new URL(env.BACKEND_ORIGIN).host);

    const proxyRequest = new Request(backendUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });

    const response = await fetch(proxyRequest);

    // Clone response and pass through all headers (including Set-Cookie)
    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    return proxyResponse;
  },
};
