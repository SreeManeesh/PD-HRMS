/** Indian rupee formatting (en-IN grouping). */
export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

/** Plain en-IN number (no currency symbol). */
export const num = (n) => new Intl.NumberFormat("en-IN").format(n || 0);