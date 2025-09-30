const words = ['cash', 'urgent', 'lost', 'no receipts', 'stolen yesterday', 'unattended'];

export const fraudScore = ({ claim, history }) => {
  let score = 0;
  const reasons = [];

  if (claim.amount >= 20000) { score += 35; reasons.push('High claimed amount'); }
  if (claim.channel === 'paper') { score += 10; reasons.push('Paper-based submission'); }
  if (claim.attachments?.length === 0) { score += 5; reasons.push('No supporting attachments'); }

  const recentCount = (history || []).filter((c) => c.claimantId === claim.claimantId && Math.abs(new Date(c.createdAt) - new Date(claim.createdAt)) < 180 * 24 * 60 * 60 * 1000).length;
  if (recentCount >= 3) { score += 25; reasons.push('Multiple claims in 6 months'); }

  const desc = (claim.incident?.description || '').toLowerCase();
  if (words.some((w) => desc.includes(w))) { score += 10; reasons.push('Suspicious wording'); }

  const risk = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { score, risk, reasons };
};
