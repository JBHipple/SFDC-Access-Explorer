import { api, LightningElement } from "lwc";
import { PERMISSION_ABBREVIATIONS } from "c/accessExplorerUtils";

const QUALIFIED = /^(.+?) \((.+)\)$/;

/**
 * Compact permission badges (R · C · E · D · VA · MA · VF). Known permissions are
 * abbreviated with the full name in a tooltip and for screen readers; anything else
 * (Enabled, Access, Visible...) is shown in full.
 *
 * Accepts either a list of permission names or a comma-separated summary. A
 * parenthesized qualifier, e.g. "Read (View All Fields)", becomes a "via" note.
 */
export default class AccessExplorerPermissionBadges extends LightningElement {
  @api permissions;
  @api summary;

  get badges() {
    return this.entries().map((entry, index) => {
      const abbreviation = PERMISSION_ABBREVIATIONS[entry.name];
      return {
        key: `${index}-${entry.name}`,
        text: abbreviation || entry.name,
        title: entry.name,
        isAbbreviated: !!abbreviation,
        note: entry.note,
        className: abbreviation ? "badge badge_short" : "badge"
      };
    });
  }

  get hasBadges() {
    return this.entries().length > 0;
  }

  get description() {
    return this.entries()
      .map((entry) => {
        return entry.note ? `${entry.name} via ${entry.note}` : entry.name;
      })
      .join(", ");
  }

  entries() {
    let names = [];
    if (Array.isArray(this.permissions)) {
      names = this.permissions;
    } else if (typeof this.summary === "string") {
      names = this.summary.split(",");
    }
    return names
      .map((name) => String(name).trim())
      .filter((name) => !!name)
      .map((name) => {
        const match = QUALIFIED.exec(name);
        return match ? { name: match[1], note: match[2] } : { name };
      });
  }
}
