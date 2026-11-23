function contact(value) {
  return {
    name: value?.name || '',
    phone: value?.phone || '',
    relationship: value?.relationship || '',
  };
}

function lineFrom(visit, treatment) {
  return {
    _id: treatment._id,
    consultationId: visit._id,
    medicineName: treatment.medicineName,
    strength: treatment.strength || '',
    form: treatment.form || '',
    notes: treatment.notes || '',
    medicine: treatment.medicine || null,
    quantity: Number.isInteger(treatment.quantity) ? treatment.quantity : null,
    recordedAt: treatment.recordedAt,
    visitedAt: visit.visitedAt,
  };
}

export function presentPatient(patient, clinical) {
  const view = {
    _id: patient._id,
    patientCode: patient.patientCode || '',
    name: patient.name,
    dateOfBirth: patient.dateOfBirth || null,
    age: patient.age,
    gender: patient.gender || '',
    phone: patient.phone || '',
    email: patient.email || '',
    address: patient.address || '',
    emergencyContact: contact(patient.emergencyContact),
    registeredAt: patient.registeredAt || patient.createdAt || null,
    active: patient.active !== false,
    visitCount: patient.visitCount || 0,
  };
  if (!clinical) return view;

  const clinicalView = {
    ...view,
    bloodGroup: patient.bloodGroup || '',
    allergies: Array.isArray(patient.allergies) ? [...patient.allergies] : [],
    conditions: Array.isArray(patient.conditions) ? [...patient.conditions] : [],
  };
  if (!Array.isArray(patient.visits)) return clinicalView;

  const consultations = [];
  const treatments = [];
  for (const visit of patient.visits || []) {
    const items = visit.treatments || [];
    consultations.push({
      _id: visit._id,
      visitedAt: visit.visitedAt,
      treatmentCount: items.length,
    });
    for (const treatment of items) treatments.push(lineFrom(visit, treatment));
  }

  return {
    ...clinicalView,
    consultations,
    treatments,
    prescriptions: treatments.map((item) => ({ ...item })),
  };
}
