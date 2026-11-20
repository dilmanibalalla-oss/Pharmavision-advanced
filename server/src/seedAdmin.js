import bcrypt from 'bcryptjs';
import User from './models/User.js';

export async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Clinic admin').trim().slice(0, 120) || 'Clinic admin';
  if (!email || !email.includes('@') || !password) return;

  const count = await User.countDocuments();
  if (count > 0) return;

  try {
    await User.create({
      name,
      email: email.slice(0, 160),
      passwordHash: await bcrypt.hash(password, 10),
      role: 'admin',
      active: true,
    });
  } catch (error) {
    if (error.code === 11000) return;
    throw error;
  }
}
