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
