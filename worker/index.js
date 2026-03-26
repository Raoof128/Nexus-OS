export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Strip the /api prefix and forward to DigitalOcean backend
    const backendPath = url.pathname.replace(/^\/api/, "") || "/";
    const backendUrl = `${env.BACKEND_ORIGIN}${backendPath}${url.search}`;

    // Clone the request with the new URL
    const proxyRequest = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    // Override the Host header so the backend accepts the request
    proxyRequest.headers.set("Host", new URL(env.BACKEND_ORIGIN).host);

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
