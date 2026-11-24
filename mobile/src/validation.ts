export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export function hasErrors(errors: object) {
  return Object.keys(errors).length > 0;
}

export function validateLogin(email: string, password: string): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@') || trimmed.length > 160) {
    errors.email = 'Enter the email address for your clinic account';
  }
  if (!password) errors.password = 'Enter your password';
  else if (password.length > 200) errors.password = 'That password is too long';
  return errors;
}

export function validateName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length > 120) return 'Use a shorter name';
  return '';
}

export function validatePasswordChange(
  currentPassword: string,
  newPassword: string
): FieldErrors<'currentPassword' | 'newPassword'> {
  const errors: FieldErrors<'currentPassword' | 'newPassword'> = {};
  if (!currentPassword) errors.currentPassword = 'Enter your current password';
  if (newPassword.length < 8 || newPassword.length > 200) {
    errors.newPassword = 'Use a password of at least 8 characters';
  } else if (currentPassword === newPassword) {
    errors.newPassword = 'Choose a different password';
  }
  return errors;
}
