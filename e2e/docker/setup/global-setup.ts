export async function setup() {
  const serverUrl = process.env.SERVER_URL ?? 'http://localhost:6080';

  // Wait for server to be healthy
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${serverUrl}/healthz`);
      if (res.ok) break;
    } catch {
      // Server not ready yet
    }
    if (i === 29) throw new Error(`Server not healthy at ${serverUrl}/healthz after 30s`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('E2E global setup complete — server is healthy');
}

export async function teardown() {
  // Docker containers are ephemeral — nothing to clean up
}
