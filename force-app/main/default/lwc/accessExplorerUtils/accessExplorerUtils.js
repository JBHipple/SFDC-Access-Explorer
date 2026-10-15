/**
 * Shared constants and helpers for Access Explorer components.
 */

/** Delay before a search box notifies its parent, in milliseconds. */
export const SEARCH_DELAY_MS = 300;

/** Entity types selectable in the "By Entity" view, in display order. */
export const ENTITY_TYPES = [
  { value: "SOBJECT_TYPE", label: "Object", pluralLabel: "Objects" },
  { value: "FIELD", label: "Field", pluralLabel: "Fields" },
  {
    value: "SYSTEM_PERMISSION",
    label: "System Permission",
    pluralLabel: "System Permissions"
  },
  { value: "APEX_CLASS", label: "Apex Class", pluralLabel: "Apex Classes" },
  {
    value: "APEX_PAGE",
    label: "Visualforce Page",
    pluralLabel: "Visualforce Pages"
  },
  {
    value: "CUSTOM_PERMISSION",
    label: "Custom Permission",
    pluralLabel: "Custom Permissions"
  },
  { value: "TAB", label: "Tab", pluralLabel: "Tabs" },
  { value: "APP", label: "App", pluralLabel: "Apps" },
  {
    value: "CONNECTED_APP",
    label: "Connected App",
    pluralLabel: "Connected Apps"
  },
  { value: "FLOW", label: "Flow", pluralLabel: "Flows" },
  {
    value: "CUSTOM_METADATA",
    label: "Custom Metadata Type / Setting",
    pluralLabel: "Custom Metadata Types / Settings"
  }
];

export const SOURCE_TYPE_LABELS = {
  Profile: "Profile",
  PermissionSet: "Permission Set",
  PermissionSetGroup: "Permission Set Group"
};

const SETUP_PAGES = {
  Profile: "EnhancedProfiles",
  PermissionSet: "PermSets",
  PermissionSetGroup: "PermSetGroups"
};

const SALESFORCE_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

/** Short forms used by permission badges; anything else is shown in full. */
export const PERMISSION_ABBREVIATIONS = {
  Read: "R",
  Create: "C",
  Edit: "E",
  Delete: "D",
  "View All Records": "VA",
  "Modify All Records": "MA",
  "View All Fields": "VF"
};

export function isSalesforceId(value) {
  return typeof value === "string" && SALESFORCE_ID.test(value);
}

export function getEntityTypeLabel(entityType) {
  const match = ENTITY_TYPES.find((type) => type.value === entityType);
  return match ? match.label : entityType;
}

export function getEntityTypePluralLabel(entityType) {
  const match = ENTITY_TYPES.find((type) => type.value === entityType);
  return match ? match.pluralLabel : entityType;
}

/**
 * Builds a relative Lightning Setup URL for a profile, permission set or group.
 * Returns null unless the source type is known and the id is a well-formed
 * Salesforce id, so no free text can ever reach an href.
 */
export function buildSetupUrl(sourceType, recordId) {
  const page = SETUP_PAGES[sourceType];
  if (!page || !isSalesforceId(recordId)) {
    return null;
  }
  return `/lightning/setup/${page}/page?address=${encodeURIComponent(
    "/" + recordId
  )}`;
}

/**
 * Returns a debounced version of fn that runs after `wait` ms of inactivity.
 */
export function debounce(fn, wait) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Reduces one or more LDS / Apex errors into a list of readable messages.
 */
export function reduceErrors(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  return list
    .filter((error) => !!error)
    .map((error) => {
      if (Array.isArray(error.body)) {
        return error.body.map((entry) => entry.message);
      }
      if (error.body && typeof error.body.message === "string") {
        return error.body.message;
      }
      if (typeof error.message === "string") {
        return error.message;
      }
      return error.statusText;
    })
    .flat()
    .filter((message) => !!message);
}

/** Joins reduced error messages for display. */
export function errorText(errors) {
  const messages = reduceErrors(errors);
  return messages.length ? messages.join(" ") : "An unexpected error occurred.";
}

/**
 * Serializes rows to CSV. Cells that a spreadsheet would treat as a formula are
 * prefixed with an apostrophe to prevent CSV/formula injection.
 */
export function toCsv(headers, rows) {
  const escapeCell = (value) => {
    let text = value === undefined || value === null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

/** Triggers a browser download of the given rows as a CSV file. */
export function downloadCsv(fileName, headers, rows) {
  const link = document.createElement("a");
  link.href =
    "data:text/csv;charset=utf-8," + encodeURIComponent(toCsv(headers, rows));
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Builds a safe file name fragment from free text. */
export function fileNamePart(value) {
  return (
    String(value || "export")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "export"
  );
}
