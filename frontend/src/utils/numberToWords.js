/** Indian number-to-words used for "amount in words" on payslips. */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  if (n % 10 === 0) return TENS[Math.floor(n / 10)];
  return `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`;
}

function threeDigits(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(" ");
}

export function numberToWords(amount) {
  if (!isFinite(amount)) return "";
  const abs = Math.round(Math.abs(amount));
  if (abs === 0) return "Zero";

  const crore = Math.floor(abs / 10000000);
  const lakh = Math.floor((abs % 10000000) / 100000);
  const thousand = Math.floor((abs % 100000) / 1000);
  const hundred = abs % 1000;

  const parts = [];
  if (crore > 0) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${numberToWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${numberToWords(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

export function rupeesInWords(amount) {
  const words = numberToWords(amount);
  if (!words) return "Rupees Zero Only";
  return `Rupees ${words} Only`;
}