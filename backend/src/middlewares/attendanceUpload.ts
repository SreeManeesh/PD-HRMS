import multer from "multer";

/** Spreadsheet + text formats accepted by the attendance importer. */
const ALLOWED_EXTENSIONS = [
  // Core modern (XML-based) — Excel 2007+
  ".xlsx", ".xlsm", ".xltx", ".xltm", ".xlam",
  // Binary & legacy — Excel 97–2003 / binary
  ".xlsb", ".xls", ".xlt", ".xla", ".xlw",
  // Text & data interchange
  ".csv", ".tsv", ".txt", ".prn", ".dif", ".slk", ".xml",
];

const ALLOWED_MIMES = [
  "text/csv",
  "text/plain",
  "text/comma-separated-values",
  "text/tab-separated-values",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmacroEnabled.main+xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.macroenabled.main+xml",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.ms-excel.addin.macroenabled.12",
  "application/vnd.ms-excel.template.macroenabled.12",
  "application/octet-stream",
];

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const name = file.originalname.toLowerCase();
  const ok =
    ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    ALLOWED_MIMES.includes(file.mimetype);
  if (!ok) {
    cb(new Error("Unsupported file type. Supported formats: .xlsx, .xlsm, .xltx, .xltm, .xlam, .xlsb, .xls, .xlt, .xla, .xlw, .csv, .tsv, .txt, .prn, .dif, .slk, .xml"));
    return;
  }
  cb(null, true);
};

export const attendanceUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});