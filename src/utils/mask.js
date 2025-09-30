const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  const maskedUser = user.length <= 2 ? '*'.repeat(user.length) : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
};

const maskPhone = (phone) => {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '*'.repeat(digits.length);
  return phone.replace(/\d(?=\d{4})/g, '*');
};

const maskSSN = (ssn) => {
  if (!ssn) return ssn;
  return ssn.replace(/\d(?=\d{4})/g, '*');
};

const maskName = (name) => {
  if (!name) return name;
  const first = name.first ? name.first[0] + '*'.repeat(Math.max(0, name.first.length - 1)) : undefined;
  const last = name.last ? name.last[0] + '*'.repeat(Math.max(0, name.last.length - 1)) : undefined;
  return { ...name, first, last };
};

const maskAddress = (addr) => {
  if (!addr) return addr;
  return { ...addr, line1: addr.line1 ? addr.line1[0] + '***' : undefined };
};

export const maskClaim = (claim, person) => {
  const maskedPerson = person ? {
    ...person,
    email: maskEmail(person.email),
    phone: maskPhone(person.phone),
    ssn: maskSSN(person.ssn),
    name: maskName(person.name),
    address: maskAddress(person.address)
  } : undefined;
  const masked = { ...claim };
  return { claim: masked, person: maskedPerson };
};
