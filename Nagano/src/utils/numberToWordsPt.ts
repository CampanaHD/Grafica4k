/**
 * Portuguese monetary numbers-to-words converter
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete",
  "dezoito", "dezenove"];

const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];

const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos",
  "setecentos", "oitocentos", "novecentos"];

export function numberToWordsPt(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount) || amount === 0) {
    return 'zero reais';
  }

  const val = Math.round(amount * 100) / 100;
  const intPart = Math.floor(val);
  const centsPart = Math.round((val - intPart) * 100);

  function convertGroup(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const parts: string[] = [];
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (c > 0) parts.push(CENTENAS[c]);

    const remainder = n % 100;
    if (remainder > 0) {
      if (remainder < 20) {
        parts.push(UNIDADES[remainder]);
      } else {
        parts.push(DEZENAS[d]);
        if (u > 0) parts.push(UNIDADES[u]);
      }
    }
    return parts.join(" e ");
  }

  const words: string[] = [];

  // Millions
  const millions = Math.floor(intPart / 1000000);
  const remainderMil = intPart % 1000000;

  if (millions > 0) {
    if (millions === 1) {
      words.push("um milhão");
    } else {
      words.push(`${convertGroup(millions)} milhões`);
    }
  }

  // Thousands
  const thousands = Math.floor(remainderMil / 1000);
  const units = remainderMil % 1000;

  if (thousands > 0) {
    if (thousands === 1) {
      words.push("um mil");
    } else {
      words.push(`${convertGroup(thousands)} mil`);
    }
  }

  if (units > 0) {
    words.push(convertGroup(units));
  }

  const realStr = words.length > 0 ? words.join(" e ") : "";
  let currencyStr = "";
  if (intPart === 1) {
    currencyStr = realStr ? `${realStr} real` : "um real";
  } else if (intPart > 1) {
    currencyStr = `${realStr} reais`;
  }

  let centsStr = "";
  if (centsPart > 0) {
    const cText = convertGroup(centsPart);
    if (centsPart === 1) {
      centsStr = `${cText} centavo`;
    } else {
      centsStr = `${cText} centavos`;
    }
  }

  if (currencyStr && centsStr) {
    return `${currencyStr} e ${centsStr}`;
  } else if (currencyStr) {
    return currencyStr;
  } else if (centsStr) {
    return centsStr;
  }

  return "zero reais";
}
