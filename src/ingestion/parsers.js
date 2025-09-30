import { parse as parseCsvSync } from 'csv-parse/sync';
import pdf from 'pdf-parse';

export const parseTxtClaim = (content) => {
  const obj = {};
  for (const line of content.split(/\r?\n/)) {
    const [k, ...rest] = line.split(':');
    if (!k) continue;
    obj[k.trim()] = rest.join(':').trim();
  }
  const amount = parseFloat(obj.amount || obj.claimAmount || '0');
  return {
    id: obj.id,
    claimantId: obj.claimantId,
    policyId: obj.policyId,
    incident: {
      date: obj.incidentDate,
      type: obj.incidentType,
      description: obj.description,
      location: { city: obj.city, state: obj.state, country: obj.country || 'US' }
    },
    amount,
    attachments: [],
    channel: 'paper',
    status: 'submitted',
    flags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

export const parseCsvClaims = (content) => {
  const records = parseCsvSync(content, { columns: true, skip_empty_lines: true, trim: true });
  return records.map((r) => ({
    id: r.id,
    claimantId: r.claimantId,
    policyId: r.policyId,
    incident: {
      date: r.incidentDate,
      type: r.incidentType,
      description: r.description,
      location: { city: r.city, state: r.state, country: r.country || 'US' }
    },
    amount: parseFloat(r.amount || r.claimAmount || '0'),
    attachments: [],
    channel: 'paper',
    status: 'submitted',
    flags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
};

export const parseInsuranceDatasetCsv = (content) => {
  const recs = parseCsvSync(content, { columns: true, skip_empty_lines: true, trim: true });
  const claims = [];
  const policies = new Map();
  for (const r of recs) {
    const policyNumber = String(r.policy_number || '').trim();
    const policyId = policyNumber ? `POL-${policyNumber}` : undefined;
    if (policyId && !policies.has(policyId)) {
      policies.set(policyId, {
        id: policyId,
        personId: undefined,
        policyNumber,
        product: 'Auto',
        deductible: Number(r.policy_deductable || 500) || 500,
        coverageLimit: 50000,
        active: true,
        startDate: '2010-01-01',
        endDate: '2030-12-31'
      });
    }

    const city = (r.incident_city || '').trim();
    const state = (r.incident_state || r.policy_state || '').trim();
    const dt = (r.incident_date || '').trim();
    const [d, m, y] = dt.includes('-') ? dt.split('-') : [undefined, undefined, undefined];
    const isoDate = (y && m && d) ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : undefined;

    const descParts = [];
    if (r.collision_type && r.collision_type !== '?') descParts.push(`Collision: ${r.collision_type}`);
    if (r.incident_severity && r.incident_severity !== '?') descParts.push(`Severity: ${r.incident_severity}`);
    if (r.authorities_contacted && r.authorities_contacted !== '?') descParts.push(`Authorities: ${r.authorities_contacted}`);
    const description = descParts.join(' · ');

    const id = `CLM-IM-${Date.now()}-${claims.length + 1}`;
    const amount = Number(r.total_claim_amount || 0) || 0;
    claims.push({
      id,
      claimantId: undefined,
      policyId,
      incident: {
        date: isoDate,
        type: r.incident_type || 'AutoCollision',
        description,
        location: { city, state, country: 'US' }
      },
      amount,
      attachments: [],
      channel: 'portal',
      status: 'submitted',
      flags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return { claims, policies: Array.from(policies.values()) };
};

export const parsePdfClaim = async (buffer) => {
  const data = await pdf(buffer);
  const text = data.text || '';
  const kv = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(id|claimantId|policyId|incidentDate|incidentType|amount|description|city|state|country)\s*[:\-]\s*(.+)$/i);
    if (m) kv[m[1]] = m[2].trim();
  }
  const amount = parseFloat(kv.amount || '0');
  return {
    id: kv.id,
    claimantId: kv.claimantId,
    policyId: kv.policyId,
    incident: {
      date: kv.incidentDate,
      type: kv.incidentType,
      description: kv.description,
      location: { city: kv.city, state: kv.state, country: kv.country || 'US' }
    },
    amount,
    attachments: [],
    channel: 'paper',
    status: 'submitted',
    flags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};
