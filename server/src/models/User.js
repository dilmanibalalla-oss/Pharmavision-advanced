import mongoose from 'mongoose';
import { USER_ROLES, canonicalRole } from '../access.js';

const storedRoles = [...USER_ROLES, 'admin', 'doctor', 'pharmacist', 'receptionist'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: storedRoles },
    active: { type: Boolean, default: true },
    refreshTokenHash: { type: String, select: false },
    refreshTokenExpiresAt: { type: Date, select: false },
    specialization: { type: String, trim: true, default: '', maxlength: 80 },
    qualifications: [{ type: String, trim: true, maxlength: 120 }],
    registrationNumber: { type: String, trim: true, default: '', maxlength: 40 },
    registrationBody: { type: String, trim: true, default: '', maxlength: 120 },
    phone: { type: String, trim: true, default: '', maxlength: 30 },
    address: { type: String, trim: true, default: '', maxlength: 300 },
    schedule: [
      {
        day: {
          type: String,
          required: true,
          enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
        start: { type: String, required: true },
        end: { type: String, required: true },
        location: { type: String, trim: true, default: '', maxlength: 80 },
      },
    ],
  },
  { timestamps: true }
);

userSchema.index({ role: 1, active: 1, name: 1 });
userSchema.index({ specialization: 1 });
userSchema.index(
  { registrationNumber: 1 },
  { unique: true, partialFilterExpression: { registrationNumber: { $gt: '' } } }
);

export function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: canonicalRole(user.role),
    active: user.active,
  };
}

export function doctorView(user) {
  const schedule = Array.isArray(user.schedule) ? user.schedule : [];
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: canonicalRole(user.role),
    active: user.active !== false,
    specialization: user.specialization || '',
    qualifications: Array.isArray(user.qualifications) ? [...user.qualifications] : [],
    registrationNumber: user.registrationNumber || '',
    registrationBody: user.registrationBody || '',
    phone: user.phone || '',
    address: user.address || '',
    schedule: schedule.map((slot) => ({
      day: slot.day,
      start: slot.start,
      end: slot.end,
      location: slot.location || '',
    })),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export default mongoose.models.User || mongoose.model('User', userSchema);
