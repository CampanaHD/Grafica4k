"""
Convert monetary decimal values to Brazilian Portuguese words.
Example: 1500.50 -> "um mil e quinhentos reais e cinquenta centavos"
"""

UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
            "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete",
            "dezoito", "dezenove"]

DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]

CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
            "setecentos", "oitocentos", "novecentos"]

def number_to_words_pt(number: float) -> str:
    """Convert float/decimal amount in BRL to written Portuguese text."""
    if number is None:
        return ""
    val = round(float(number), 2)
    if val == 0:
        return "zero reais"
    
    int_part = int(val)
    cents_part = int(round((val - int_part) * 100))
    
    def _convert_group(n: int) -> str:
        if n == 0:
            return ""
        if n == 100:
            return "cem"
        parts = []
        c = n // 100
        d = (n % 100) // 10
        u = n % 10
        
        if c > 0:
            parts.append(CENTENAS[c])
        
        remainder = n % 100
        if remainder > 0:
            if remainder < 20:
                parts.append(UNIDADES[remainder])
            else:
                parts.append(DEZENAS[d])
                if u > 0:
                    parts.append(UNIDADES[u])
        return " e ".join(parts)

    words = []
    
    # Millions
    millions = int_part // 1000000
    remainder_mil = int_part % 1000000
    
    if millions > 0:
        if millions == 1:
            words.append("um milhão")
        else:
            words.append(f"{_convert_group(millions)} milhões")
            
    # Thousands
    thousands = remainder_mil // 1000
    units = remainder_mil % 1000
    
    if thousands > 0:
        if thousands == 1:
            words.append("um mil")
        else:
            words.append(f"{_convert_group(thousands)} mil")
            
    if units > 0:
        words.append(_convert_group(units))
        
    real_str = " e ".join(words) if words else ""
    if int_part == 1:
        currency_str = f"{real_str} real" if real_str else "um real"
    elif int_part > 1:
        currency_str = f"{real_str} reais"
    else:
        currency_str = ""
        
    cents_str = ""
    if cents_part > 0:
        c_text = _convert_group(cents_part)
        if cents_part == 1:
            cents_str = f"{c_text} centavo"
        else:
            cents_str = f"{c_text} centavos"
            
    if currency_str and cents_str:
        return f"{currency_str} e {cents_str}"
    elif currency_str:
        return currency_str
    elif cents_str:
        return cents_str
    return "zero reais"
