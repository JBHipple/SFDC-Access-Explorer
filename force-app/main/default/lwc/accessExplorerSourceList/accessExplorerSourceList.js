import { api, LightningElement, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getAccessSources from "@salesforce/apex/AccessExplorerUserController.getAccessSources";
import {
  buildSetupUrl,
  errorText,
  getEntityTypeLabel,
  SOURCE_TYPE_LABELS
} from "c/accessExplorerUtils";

/**
 * Lists the profile, permission sets and permission set groups that give a user access
 * to one entity. Each source links to its Setup page in a new window.
 *
 * Slot "actions": extra header actions supplied by the parent (e.g. cross-links).
 */
export default class AccessExplorerSourceList extends LightningElement {
  @api userName;
  @api entityLabel;

  sources;
  error;
  wiredResult;
  _userId;
  _entityType;
  _entityKey;

  @api
  get userId() {
    return this._userId;
  }
  set userId(value) {
    this.updateSelection("_userId", value);
  }

  @api
  get entityType() {
    return this._entityType;
  }
  set entityType(value) {
    this.updateSelection("_entityType", value);
  }

  @api
  get entityKey() {
    return this._entityKey;
  }
  set entityKey(value) {
    this.updateSelection("_entityKey", value);
  }

  /** Re-fetches sources for the current selection, bypassing the client cache. */
  @api
  refresh() {
    return this.wiredResult ? refreshApex(this.wiredResult) : Promise.resolve();
  }

  /** Clears previous results whenever the selection changes so stale data never shows. */
  updateSelection(field, value) {
    if (this[field] !== value) {
      this[field] = value;
      this.sources = undefined;
      this.error = undefined;
    }
  }

  @wire(getAccessSources, {
    userId: "$_userId",
    entityType: "$_entityType",
    entityKey: "$_entityKey"
  })
  wiredSources(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      this.sources = data;
      this.error = undefined;
    } else if (error) {
      this.sources = undefined;
      this.error = errorText(error);
    }
  }

  get hasSelection() {
    return !!(this._userId && this._entityType && this._entityKey);
  }

  get isLoading() {
    return this.hasSelection && !this.sources && !this.error;
  }

  get displayEntity() {
    return this.entityLabel || this._entityKey;
  }

  get displayUser() {
    return this.userName || "this user";
  }

  get entityTypeLabel() {
    return getEntityTypeLabel(this._entityType);
  }

  get hasSources() {
    return (this.sources || []).length > 0;
  }

  get isEmpty() {
    return !!this.sources && this.sources.length === 0;
  }

  get copyDisabled() {
    return !this.hasSources;
  }

  get sourceViews() {
    return (this.sources || []).map((source, index) => {
      const url = buildSetupUrl(source.sourceType, source.recordId);
      const typeLabel =
        SOURCE_TYPE_LABELS[source.sourceType] || source.sourceType;
      const via = source.viaComponents || [];
      return {
        ...source,
        key: `${source.sourceType}-${source.recordId}-${source.impliedBy || "direct"}-${index}`,
        url,
        typeLabel,
        linkTitle: `Open ${typeLabel} ${source.name} in a new window`,
        badgeClass: `type-badge type-badge_${source.sourceType}`,
        hasVia: via.length > 0,
        viaText: via.join(", "),
        isImplied: !!source.impliedBy,
        hasDetails:
          !!source.impliedBy || via.length > 0 || source.isSessionBased
      };
    });
  }

  /** Plain-text summary of the sources, suitable for pasting into a ticket or email. */
  get summaryText() {
    const lines = [
      `How ${this.displayUser} gets access to ${this.entityTypeLabel} ${this.displayEntity}:`
    ];
    this.sourceViews.forEach((source) => {
      let line = `- ${source.typeLabel}: ${source.name} — ${(source.grantedPermissions || []).join(", ")}`;
      if (source.isImplied) {
        line += ` (implied by ${source.impliedBy})`;
      }
      if (source.hasVia) {
        line += ` (via ${source.viaText})`;
      }
      if (source.isSessionBased) {
        line += " (session-based)";
      }
      lines.push(line);
    });
    return lines.join("\n");
  }

  async handleCopy() {
    try {
      await navigator.clipboard.writeText(this.summaryText);
      this.toast(
        "Copied",
        "Access summary copied to the clipboard.",
        "success"
      );
    } catch {
      this.toast(
        "Copy failed",
        "Your browser blocked clipboard access.",
        "error"
      );
    }
  }

  toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
