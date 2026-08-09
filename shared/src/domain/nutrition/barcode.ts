/**
 * GS1 check-digit validation for retail barcodes: EAN-8 (8 digits),
 * UPC-A (12) and EAN-13 (13) — the same formats BarcodeScannerSheet decodes.
 *
 * Counting from the right (check digit = position 0), digits at odd positions
 * weigh ×3, even positions ×1; a valid code's weighted sum is divisible by 10.
 * Used to spot a barcode typed into the food search box so it can be routed
 * through the barcode lookup instead of a text search.
 */
export function isEanUpc(s: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    const fromRight = s.length - 1 - i
    sum += Number(s[i]) * (fromRight % 2 === 1 ? 3 : 1)
  }
  return sum % 10 === 0
}
