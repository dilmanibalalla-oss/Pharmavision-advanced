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

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatWhen(value) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function medicineLabel(medicine) {
  return [medicine.name, medicine.strength, medicine.form].filter(Boolean).join(' · ');
}

export function treatmentLabel(treatment) {
  return [treatment.medicineName, treatment.strength, treatment.form].filter(Boolean).join(' · ');
}

export function treatmentLines(patient) {
  const lines = [];
  for (let index = patient.visits.length - 1; index >= 0; index -= 1) {
    for (const treatment of patient.visits[index].treatments) {
      lines.push([treatment.medicineName, treatment.strength].filter(Boolean).join(' '));
    }
  }
  return lines;
}
