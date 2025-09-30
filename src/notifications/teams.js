export const notifyTeams = async ({ title, text }) => {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Missing TEAMS_WEBHOOK_URL' };
  const payload = { title: title || 'Claims Update', text };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok, status: res.status };
};
