import { api, LightningElement, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import getUser from "@salesforce/apex/AccessExplorerUserController.getUser";
import getUserEntities from "@salesforce/apex/AccessExplorerUserController.getUserEntities";
import {
  downloadCsv,
  errorText,
  fileNamePart,
  isSalesforceId
} from "c/accessExplorerUtils";

const DEFAULT_CATEGORY = "SOBJECT_TYPE";

/**
 * "By User" view: choose a user, browse what they can access by category, and see
 * which profile / permission sets / groups grant each item.
 *
 * @api selection { userId, entityType, entityKey, entityLabel } lets the parent restore
 * state (deep links, cross-links).
 *
 * Events:
 *  - selectionchange: detail { userId, entityType, entityKey, entityLabel }
 *  - viewentity: detail { entityType, key, label } (see everyone with this access)
 */
export default class AccessExplorerUserView extends LightningElement {
  userId;
  entity;
  category = DEFAULT_CATEGORY;
  filterTerm = "";
  changingUser = false;

  user;
  userError;
  userResult;
  groups;
  entitiesError;
  entitiesResult;

  userFilter = {
    criteria: [{ fieldPath: "IsActive", operator: "eq", value: true }]
  };
  displayInfo = { additionalFields: ["Username"] };
  matchingInfo = {
    primaryField: { fieldPath: "Name" },
    additionalFields: [{ fieldPath: "Username" }]
  };

  @api
  get selection() {
    return this.currentSelection();
  }
  set selection(value) {
    const next = value || {};
    const userId = isSalesforceId(next.userId) ? next.userId : undefined;
    if (userId !== this.userId) {
      this.setUser(userId);
    }
    const sameEntity =
      this.selectedKey === next.entityKey &&
      this.selectedType === next.entityType;
    if (!sameEntity) {
      this.entity =
        next.entityType && next.entityKey
          ? {
              entityType: next.entityType,
              key: next.entityKey,
              label: next.entityLabel || next.entityKey
            }
          : undefined;
      if (this.entity) {
        this.category =
          this.entity.entityType === "FIELD"
            ? DEFAULT_CATEGORY
            : this.entity.entityType;
      }
    }
  }

  /** Re-fetches everything shown for the current user. */
  @api
  refresh() {
    const work = [];
    if (this.entitiesResult) {
      work.push(refreshApex(this.entitiesResult));
    }
    if (this.userResult) {
      work.push(refreshApex(this.userResult));
    }
    const list = this.template.querySelector("c-access-explorer-entity-list");
    if (list) {
      list.refresh();
    }
    const sources = this.template.querySelector(
      "c-access-explorer-source-list"
    );
    if (sources) {
      work.push(sources.refresh());
    }
    return Promise.all(work);
  }

  @wire(getUser, { userId: "$userId" })
  wiredUser(result) {
    this.userResult = result;
    if (result.data) {
      this.user = result.data;
      this.userError = undefined;
    } else if (result.error) {
      this.user = undefined;
      this.userError = errorText(result.error);
    }
  }

  @wire(getUserEntities, { userId: "$userId" })
  wiredEntities(result) {
    this.entitiesResult = result;
    if (result.data) {
      this.groups = result.data;
      this.entitiesError = undefined;
    } else if (result.error) {
      this.groups = undefined;
      this.entitiesError = errorText(result.error);
    }
  }

  // -------------------------------------------------------------------------------
  // View state
  // -------------------------------------------------------------------------------

  get hasUser() {
    return !!this.userId;
  }

  get showPicker() {
    return !this.userId || this.changingUser;
  }

  get userName() {
    return this.user ? this.user.name : "Loading user…";
  }

  get userMeta() {
    if (!this.user) {
      return "";
    }
    const parts = [this.user.username, this.user.profileName];
    if (this.user.isActive === false) {
      parts.push("Inactive");
    }
    return parts.filter((part) => !!part).join(" • ");
  }

  get entitiesLoading() {
    return this.hasUser && !this.groups && !this.entitiesError;
  }

  get normalizedFilter() {
    return this.filterTerm.trim().toLowerCase();
  }

  get filteredGroups() {
    const term = this.normalizedFilter;
    return (this.groups || []).map((group) => ({
      ...group,
      items: (group.items || []).filter(
        (item) =>
          !term ||
          (item.label || "").toLowerCase().includes(term) ||
          (item.apiName || "").toLowerCase().includes(term)
      )
    }));
  }

  get categories() {
    return this.filteredGroups.map((group) => ({
      entityType: group.entityType,
      label: group.label,
      count: group.items.length,
      assistiveText: `${group.items.length} items`
    }));
  }

  get currentGroup() {
    return this.filteredGroups.find(
      (group) => group.entityType === this.category
    );
  }

  get categoryLabel() {
    return this.currentGroup ? this.currentGroup.label : "";
  }

  get categoryItems() {
    return this.currentGroup ? this.currentGroup.items : [];
  }

  get emptyMessage() {
    return this.normalizedFilter
      ? "Nothing in this category matches the filter."
      : "No access in this category.";
  }

  get exportDisabled() {
    return this.categoryItems.length === 0;
  }

  get selectedType() {
    return this.entity ? this.entity.entityType : undefined;
  }

  get selectedKey() {
    return this.entity ? this.entity.key : undefined;
  }

  get selectedLabel() {
    return this.entity ? this.entity.label : undefined;
  }

  get sourceUserName() {
    return this.user ? this.user.name : undefined;
  }

  get viewEntityDisabled() {
    return !this.entity;
  }

  currentSelection() {
    return {
      userId: this.userId,
      entityType: this.selectedType,
      entityKey: this.selectedKey,
      entityLabel: this.selectedLabel
    };
  }

  setUser(userId) {
    this.userId = userId;
    this.user = undefined;
    this.userError = undefined;
    this.groups = undefined;
    this.entitiesError = undefined;
    this.entity = undefined;
    this.changingUser = false;
  }

  notifySelection() {
    this.dispatchEvent(
      new CustomEvent("selectionchange", { detail: this.currentSelection() })
    );
  }

  // -------------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------------

  handleUserPicked(event) {
    const userId = event.detail ? event.detail.recordId : undefined;
    if (!userId) {
      return;
    }
    if (userId !== this.userId) {
      this.setUser(userId);
      this.notifySelection();
    }
    this.changingUser = false;
  }

  handleChangeUser() {
    this.changingUser = true;
  }

  handleCancelChange() {
    this.changingUser = false;
  }

  handleCategorySelect(event) {
    this.category = event.detail.name;
  }

  handleFilterChange(event) {
    this.filterTerm = event.target.value || "";
    // Jump to a category that has matches when the current one has none.
    if (this.categoryItems.length === 0) {
      const withMatches = this.categories.find(
        (category) => category.count > 0
      );
      if (withMatches) {
        this.category = withMatches.entityType;
      }
    }
  }

  handleEntitySelect(event) {
    this.entity = { ...event.detail };
    this.notifySelection();
  }

  handleViewEntity() {
    if (this.entity) {
      this.dispatchEvent(
        new CustomEvent("viewentity", { detail: { ...this.entity } })
      );
    }
  }

  handleExport() {
    const userName = this.user ? this.user.name : this.userId;
    downloadCsv(
      `access_${fileNamePart(userName)}_${fileNamePart(this.categoryLabel)}.csv`,
      ["Category", "Name", "API Name", "Access"],
      this.categoryItems.map((item) => [
        this.categoryLabel,
        item.label,
        item.apiName,
        item.summary
      ])
    );
  }
}
