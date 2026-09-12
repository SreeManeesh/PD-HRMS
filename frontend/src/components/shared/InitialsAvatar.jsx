/**
 * InitialsAvatar — shows the first letters of an employee's first and last
 * name in a coloured circle instead of a profile photo.
 */

const PALETTE = ["#0f766e", "#7c3aed", "#0284c7", "#d97706", "#dc2626", "#16a34a", "#db2777", "#ea580c", "#0ea5e9"];

const hashName = (seed) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash;
};

export default function InitialsAvatar({ firstName = "", lastName = "", size = 34, borderWidth = 2, style = {} }) {
  const first = String(firstName || "").trim().charAt(0).toUpperCase();
  const last = String(lastName || "").trim().charAt(0).toUpperCase();
  const text = `${first}${last}` || "—";
  const color = PALETTE[hashName(`${firstName} ${lastName}`) % PALETTE.length];

  return (
    <div
      aria-label={`${firstName} ${lastName}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        background: color,
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.36)),
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        border: `${borderWidth}px solid var(--border)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
}