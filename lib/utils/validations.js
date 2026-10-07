/**
 * Input validation utilities for registration and onboarding
 */

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(trimmed);
}

export function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6;
}

export function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  // Alphanumeric, underscores, dots, 3 to 20 chars
  const usernameRegex = /^[a-zA-Z0-9_.-]{3,20}$/;
  return usernameRegex.test(trimmed);
}

export function isValidFullName(name) {
  if (!name || typeof name !== 'string') return false;
  return name.trim().length >= 2 && name.trim().length <= 50;
}
