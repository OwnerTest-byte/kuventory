import { describe, it, expect } from 'vitest';
import { loginSchema } from '../components/LoginForm';

describe('Authentication & Input Validation (Page 1 QA Verification)', () => {
  it('displays "invalid email address" when email is empty', () => {
    const result = loginSchema.safeParse({ email: '', password: 'validpassword123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.format().email?._errors[0];
      expect(emailError).toBe('invalid email address');
    }
  });

  it('displays "invalid email address" when email is malformed', () => {
    const invalidEmails = ['notanemail', 'test@', '@domain.com', 'spaces in@mail.com'];
    for (const email of invalidEmails) {
      const result = loginSchema.safeParse({ email, password: 'validpassword123' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.format().email?._errors[0]).toBe('invalid email address');
      }
    }
  });

  it('displays "password must be at least 6 characters long" when password is empty', () => {
    const result = loginSchema.safeParse({ email: 'user@kuventory.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordError = result.error.format().password?._errors[0];
      expect(passwordError).toBe('password must be at least 6 characters long');
    }
  });

  it('displays "password must be at least 6 characters long" when password has fewer than 6 characters', () => {
    const shortPasswords = ['a', '12', 'abc', '1234', '12345'];
    for (const password of shortPasswords) {
      const result = loginSchema.safeParse({ email: 'user@kuventory.com', password });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.format().password?._errors[0]).toBe('password must be at least 6 characters long');
      }
    }
  });

  it('passes validation when both email and password meet criteria', () => {
    const validInputs = [
      { email: 'staff@kuventory.com', password: 'secretpassword' },
      { email: 'admin@warehouse.ph', password: '123456' },
    ];
    for (const input of validInputs) {
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});
