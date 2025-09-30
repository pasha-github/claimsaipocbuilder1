export const decide = ({ validation, fraud, claim, policy }) => {
  const hasErrors = validation.some((v) => v.severity === 'error');
  if (hasErrors) {
    return { status: 'rejected', reason: 'Validation errors', payout: 0 };
  }

  const deductible = typeof policy?.deductible === 'number' ? policy.deductible : 0;
  const base = Math.max(0, claim.amount - deductible);
  const payout = Math.min(base, policy?.coverageLimit ?? base);

  if (fraud.risk === 'low' && claim.amount <= 1000) {
    return { status: 'settled', reason: 'Auto-approved: low risk, low amount', payout };
  }

  if (fraud.risk === 'high') {
    return { status: 'rejected', reason: 'High fraud risk', payout: 0 };
  }

  return { status: 'processing', reason: 'Queued for adjuster review', payout };
};
