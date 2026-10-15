import { LightningElement, api, wire } from "lwc";
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
 */
export default class AccessExplorerSourceList extends LightningElement {
  @api userName;
  @api entityLabel;

  sources;
  error;
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
  wiredSources({ data, error }) {
    if (data) {
      this.sources = data;
      this.error = undefined;
    } else if (error) {
      this.sources = undefined;
      this.error = errorText(error);
    }
  }

  get hasSelection() {
    return !!(this.userId && this.entityType && this.entityKey);
  }

  get isLoading() {
    return this.hasSelection && !this.sources && !this.error;
  }

  get heading() {
    return `How ${this.userName || "this user"} gets access to ${
      this.entityLabel || this.entityKey
    }`;
  }

  get entityTypeLabel() {
    return getEntityTypeLabel(this.entityType);
  }

  get hasSources() {
    return (this.sources || []).length > 0;
  }

  get isEmpty() {
    return !!this.sources && this.sources.length === 0;
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
        badgeClass: `slds-badge source-badge source-badge_${source.sourceType}`,
        grantedText: (source.grantedPermissions || []).join(", "),
        hasVia: via.length > 0,
        viaText: via.join(", "),
        isImplied: !!source.impliedBy
      };
    });
  }
}
