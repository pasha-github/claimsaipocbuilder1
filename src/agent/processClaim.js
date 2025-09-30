import { readJson, updateById } from '../db/fileDb.js';
import { validateClaim } from '../rules/validation.js';
import { fraudScore } from '../rules/fraud.js';
import { decide } from '../rules/status.js';
import { maskClaim } from '../utils/mask.js';
import { notifySlack } from '../notifications/slack.js';
import { notifyTeams } from '../notifications/teams.js';
import { notifyEmail } from '../notifications/email.js';

const DB = {
  claims: 'data/db/claims.json',
  persons: 'data/db/persons.json',
  policies: 'data/db/policies.json'
};

export const processClaim = async (claimId) => {
  const [claims, persons, policies] = await Promise.all([
    readJson(DB.claims, []),
    readJson(DB.persons, []),
    readJson(DB.policies, [])
  ]);
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return null;
  const person = persons.find((p) => p.id === claim.claimantId);
  const policy = policies.find((p) => p.id === claim.policyId);
  const history = claims.filter((c) => c.claimantId === claim.claimantId);

  const validation = validateClaim({ claim, person, policy, history });
  const fraud = fraudScore({ claim, history });
  const decision = decide({ validation, fraud, claim, policy });

  const updated = await updateById(DB.claims, claim.id, (c) => ({
    ...c,
    status: decision.status,
    decision,
    fraud,
    validation,
    updatedAt: new Date().toISOString()
  }));

  const masked = maskClaim(updated, person);
  const subject = `Claim ${updated.id}: ${updated.status}`;
  const text = `Status: ${updated.status}\nReason: ${decision.reason}\nPayout: ${decision.payout}`;

  await Promise.allSettled([
    notifySlack({ text: `${subject} — ${decision.reason}` }),
    notifyTeams({ title: subject, text }),
    notifyEmail({ to: person?.email || process.env.TO_EMAIL, subject, text })
  ]);

  return updated;
};
