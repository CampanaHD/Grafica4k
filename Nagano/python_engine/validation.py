"""
Validation utilities for Brazilian identifiers (CPF, CNPJ, Phone, CEP).
"""

import re

def validate_cpf(cpf: str) -> bool:
    """Validate a Brazilian CPF number."""
    if not cpf:
        return False
    digits = [int(d) for d in re.sub(r'\D', '', str(cpf))]
    if len(digits) != 11:
        return False
    if len(set(digits)) == 1:
        return False
    
    # First digit
    s = sum(digits[i] * (10 - i) for i in range(9))
    rev = 11 - (s % 11)
    d1 = 0 if rev >= 10 else rev
    if digits[9] != d1:
        return False
    
    # Second digit
    s = sum(digits[i] * (11 - i) for i in range(10))
    rev = 11 - (s % 11)
    d2 = 0 if rev >= 10 else rev
    if digits[10] != d2:
        return False
    
    return True

def validate_cnpj(cnpj: str) -> bool:
    """Validate a Brazilian CNPJ number."""
    if not cnpj:
        return False
    digits = [int(d) for d in re.sub(r'\D', '', str(cnpj))]
    if len(digits) != 14:
        return False
    if len(set(digits)) == 1:
        return False
    
    # First digit
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    s1 = sum(digits[i] * weights1[i] for i in range(12))
    rev1 = 11 - (s1 % 11)
    d1 = 0 if rev1 >= 10 else rev1
    if digits[12] != d1:
        return False
    
    # Second digit
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    s2 = sum(digits[i] * weights2[i] for i in range(13))
    rev2 = 11 - (s2 % 11)
    d2 = 0 if rev2 >= 10 else rev2
    if digits[13] != d2:
        return False
    
    return True

def format_cpf_cnpj(value: str) -> str:
    """Format string as CPF or CNPJ."""
    digits = re.sub(r'\D', '', str(value or ''))
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    elif len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return value

def format_phone(value: str) -> str:
    """Format Brazilian phone number (DDD + 8 or 9 digits)."""
    digits = re.sub(r'\D', '', str(value or ''))
    if len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    elif len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    return value
