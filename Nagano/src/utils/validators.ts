/**
 * Brazilian CPF & CNPJ Validation utilities
 */

export function validateCPF(cpf: string): boolean {
  if (!cpf) return false;
  const digits = cpf.replace(/\D/g, '').split('').map(Number);
  if (digits.length !== 11) return false;
  if (new Set(digits).size === 1) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let rev = 11 - (sum % 11);
  let d1 = rev >= 10 ? 0 : rev;
  if (digits[9] !== d1) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  rev = 11 - (sum % 11);
  let d2 = rev >= 10 ? 0 : rev;
  if (digits[10] !== d2) return false;

  return true;
}

export function validateCNPJ(cnpj: string): boolean {
  if (!cnpj) return false;
  const digits = cnpj.replace(/\D/g, '').split('').map(Number);
  if (digits.length !== 14) return false;
  if (new Set(digits).size === 1) return false;

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * w1[i];
  }
  let rev = 11 - (sum % 11);
  let d1 = rev >= 10 ? 0 : rev;
  if (digits[12] !== d1) return false;

  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += digits[i] * w2[i];
  }
  rev = 11 - (sum % 11);
  let d2 = rev >= 10 ? 0 : rev;
  if (digits[13] !== d2) return false;

  return true;
}

export function validateCpfOrCnpj(value: string): boolean {
  const clean = value.replace(/\D/g, '');
  if (clean.length === 11) return validateCPF(clean);
  if (clean.length === 14) return validateCNPJ(clean);
  return false;
}
