import mongoose from 'mongoose';

export const USER_ROLES = ['admin', 'doctor', 'pharmacist', 'receptionist'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: USER_ROLES },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export default mongoose.models.User || mongoose.model('User', userSchema);
