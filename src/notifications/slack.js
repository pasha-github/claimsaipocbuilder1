export const notifySlack = async ({ text, blocks }) => {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'Missing SLACK_WEBHOOK_URL' };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, blocks })
  });
  return { ok: res.ok, status: res.status };
};
