export function cleanText(value, max = 200) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function parseAge(value) {
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  return age;
}

export function parseList(value, max = 30, length = 80) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  const items = [];
  for (const item of source) {
    const text = String(item).trim().replace(/\s+/g, ' ').slice(0, length);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length === max) break;
  }
  return items;
}

export function parseAllergies(value) {
  return parseList(value);
}

export const GENDERS = ['Female', 'Male', 'Other'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function ageOn(date, today = new Date()) {
  let age = today.getFullYear() - date.getFullYear();
  const month = today.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < date.getDate())) age -= 1;
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  return age;
}

export function parseDateOfBirth(value) {
  if (value == null || String(value).trim() === '') return { dateOfBirth: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return { error: 'Date of birth is not a valid date' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: 'Date of birth is not a valid date' };
  }
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12));
  if (date > todayUtc) return { error: 'Date of birth cannot be in the future' };
  const age = ageOn(date, todayUtc);
  if (age == null) return { error: 'Date of birth must be within the last 120 years' };
  return { dateOfBirth: date, age };
}

export function parseChoice(value, allowed, label) {
  const choice = cleanText(value, 20);
  if (!choice) return { value: '' };
  if (!allowed.includes(choice)) return { error: `${label} is not one of the listed values` };
  return { value: choice };
}

export function parseConsultedAt(value) {
  if (value == null || String(value).trim() === '') {
    return { error: 'Consultation date and time are required' };
  }
  const consultedAt = new Date(value);
  if (Number.isNaN(consultedAt.getTime())) return { error: 'Consultation date and time are required' };
  if (consultedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { error: 'Consultation time cannot be more than a day ahead' };
  }
  if (consultedAt.getTime() < Date.UTC(1990, 0, 1)) {
    return { error: 'Consultation date is too far in the past' };
  }
  return { consultedAt };
}

export function parseVitals(value) {
  const source = value && typeof value === 'object' ? value : {};
  const vitals = {};
  const fields = [
    ['systolic', 40, 300, 'Systolic pressure'],
    ['diastolic', 20, 200, 'Diastolic pressure'],
    ['pulse', 0, 300, 'Pulse'],
    ['temperature', 30, 45, 'Temperature'],
    ['respiratoryRate', 0, 80, 'Respiratory rate'],
    ['oxygenSaturation', 0, 100, 'Oxygen saturation'],
    ['weightKg', 0, 500, 'Weight'],
    ['heightCm', 0, 300, 'Height'],
  ];
  for (const [key, min, max, label] of fields) {
    if (source[key] == null || source[key] === '') continue;
    const number = Number(source[key]);
    if (!Number.isFinite(number) || number < min || number > max) {
      return { error: `${label} is out of range` };
    }
    vitals[key] = Math.round(number * 10) / 10;
  }
  if (vitals.systolic != null && vitals.diastolic != null && vitals.diastolic >= vitals.systolic) {
    return { error: 'Diastolic pressure must be lower than systolic pressure' };
  }
  return { vitals };
}

export function parseEmergencyContact(value) {
  if (value == null) return { contact: { name: '', phone: '', relationship: '' } };
  const name = cleanText(value.name, 120);
  const relationship = cleanText(value.relationship, 80);
  const phone = parsePhone(value.phone);
  if (phone.error) return { error: `Emergency contact: ${phone.error}` };
  if ((name && !phone.phone) || (!name && phone.phone)) {
    return { error: 'Emergency contact needs both a name and a phone number' };
  }
  return { contact: { name, phone: phone.phone, relationship } };
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function parseEmail(value) {
  const email = cleanText(value, 160).toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[1].includes(' ') || !parts[1].includes('.')) {
    return '';
  }
  return email;
}

export function parsePhone(value) {
  if (value == null || String(value).trim() === '') return { phone: '' };
  const phone = cleanText(value, 30);
  if (!/^[0-9+().\-\s]{6,30}$/.test(phone)) {
    return { error: 'Enter a phone number using digits and the usual separators' };
  }
  return { phone };
}

export function parseRegistrationNumber(value) {
  if (value == null || String(value).trim() === '') return { registrationNumber: '' };
  const registrationNumber = cleanText(value, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/-]{2,39}$/.test(registrationNumber)) {
    return { error: 'Registration number should be 3 to 40 letters, digits, or hyphens' };
  }
  return { registrationNumber };
}

export function parseQualifications(value) {
  if (value == null || value === '') return { items: [] };
  if (!Array.isArray(value) && typeof value !== 'string') {
    return { error: 'Qualifications must be a list' };
  }
  const source = Array.isArray(value) ? value : String(value).split(',');
  const seen = new Set();
  const items = [];
  for (const item of source) {
    const qualification = cleanText(item, 120);
    if (!qualification) continue;
    const key = qualification.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(qualification);
  }
  if (items.length > 12) return { error: 'Keep qualifications to 12 entries' };
  return { items };
}

export function parseSchedule(value) {
  if (value == null) return { slots: [] };
  if (!Array.isArray(value)) return { error: 'Schedule must be a list of sessions' };
  if (value.length > 21) return { error: 'Keep the schedule to 21 sessions or fewer' };
  const slots = [];
  for (const item of value) {
    const day = WEEKDAYS.includes(item?.day) ? item.day : '';
    const start = String(item?.start ?? '');
    const end = String(item?.end ?? '');
    const location = cleanText(item?.location, 80);
    if (!day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) {
      return { error: 'Each session needs a weekday and an end time after the start' };
    }
    const overlaps = slots.some((slot) => slot.day === day && start < slot.end && end > slot.start);
    if (overlaps) return { error: 'Sessions on the same day cannot overlap' };
    slots.push({ day, start, end, location });
  }
  const order = Object.fromEntries(WEEKDAYS.map((day, index) => [day, index]));
  slots.sort((left, right) => order[left.day] - order[right.day] || left.start.localeCompare(right.start));
  return { slots };
}

export const MEDICINE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Suspension',
  'Injection',
  'Inhaler',
  'Drops',
  'Cream',
  'Sachet',
];
