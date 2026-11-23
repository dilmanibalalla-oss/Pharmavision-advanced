export function cleanText(value, max = 200) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function parseAge(value) {
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  return age;
}

export function parseAllergies(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const seen = new Set();
  const allergies = [];
  for (const item of source) {
    const allergy = String(item).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!allergy) continue;
    const key = allergy.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    allergies.push(allergy);
    if (allergies.length === 30) break;
  }
  return allergies;
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
