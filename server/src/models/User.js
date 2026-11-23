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
  },
  { timestamps: true }
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

export default mongoose.models.User || mongoose.model('User', userSchema);
