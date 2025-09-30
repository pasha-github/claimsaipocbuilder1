export const validateClaim = ({ claim, person, policy, history }) => {
  const issues = [];

  if (!claim.id) issues.push({ code: 'MISSING_ID', severity: 'error', message: 'Claim ID is missing' });
  if (!claim.claimantId) issues.push({ code: 'MISSING_CLAIMANT', severity: 'error', message: 'Claimant missing' });
  if (!claim.policyId) issues.push({ code: 'MISSING_POLICY', severity: 'error', message: 'Policy missing' });
  if (!claim.incident || !claim.incident.date || !claim.incident.type) {
    issues.push({ code: 'MISSING_INCIDENT', severity: 'error', message: 'Incident details incomplete' });
  }
  if (typeof claim.amount !== 'number' || Number.isNaN(claim.amount) || claim.amount <= 0) {
    issues.push({ code: 'INVALID_AMOUNT', severity: 'error', message: 'Claim amount must be positive number' });
  }

  if (!policy || !policy.active) {
    issues.push({ code: 'POLICY_INACTIVE', severity: 'error', message: 'Policy inactive or not found' });
  }

  const incDate = claim.incident?.date ? new Date(claim.incident.date) : null;
  const start = policy?.startDate ? new Date(policy.startDate) : null;
  const end = policy?.endDate ? new Date(policy.endDate) : null;
  if (incDate && start && end && (incDate < start || incDate > end)) {
    issues.push({ code: 'OUT_OF_COVERAGE_PERIOD', severity: 'error', message: 'Incident outside policy coverage period' });
  }

  if (policy && typeof policy.coverageLimit === 'number' && claim.amount > policy.coverageLimit) {
    issues.push({ code: 'OVER_LIMIT', severity: 'error', message: 'Requested amount exceeds policy limit' });
  }

  const windowMs = 30 * 24 * 60 * 60 * 1000;
  const dup = (history || []).find((c) => c.claimantId === claim.claimantId && c.policyId === claim.policyId && c.incident?.type === claim.incident?.type && Math.abs(new Date(c.incident?.date) - new Date(claim.incident?.date)) <= windowMs && c.id !== claim.id);
  if (dup) {
    issues.push({ code: 'POTENTIAL_DUPLICATE', severity: 'warning', message: `Similar claim detected: ${dup.id}` });
  }

  return issues;
};
