import { LightningElement, api } from "lwc";
import getUserFields from "@salesforce/apex/AccessExplorerUserController.getUserFields";
import { errorText } from "c/accessExplorerUtils";

const GROUP_ICONS = {
  SOBJECT_TYPE: "utility:database",
  SYSTEM_PERMISSION: "utility:shield",
  APEX_CLASS: "utility:apex",
  APEX_PAGE: "utility:page",
  CUSTOM_PERMISSION: "utility:lock",
  TAB: "utility:tabset",
  APP: "utility:apps",
  CONNECTED_APP: "utility:connected_apps",
  FLOW: "utility:flow",
  CUSTOM_METADATA: "utility:settings"
};

/**
 * Grouped, filterable list of everything a user can access. Groups and objects are
 * collapsible; an object's fields are loaded on first expand.
 *
 * Events:
 *  - entityselect: detail { entityType, key, label }
 */
export default class AccessExplorerEntityList extends LightningElement {
  @api groups = [];
  @api selectedType;
  @api selectedKey;

  filterTerm = "";
  expandedGroups = new Set(["SOBJECT_TYPE"]);
  expandedObjects = new Set();
  fieldsByObject = {};
  _userId;

  @api
  get userId() {
    return this._userId;
  }
  set userId(value) {
    if (value !== this._userId) {
      this.expandedObjects = new Set();
      this.fieldsByObject = {};
    }
    this._userId = value;
  }

  get isFiltering() {
    return this.filterTerm.length > 0;
  }

  get hasGroups() {
    return (this.groups || []).length > 0;
  }

  get groupsView() {
    const term = this.filterTerm.toLowerCase();
    return (this.groups || []).map((group) => {
      const items = (group.items || [])
        .filter((item) => this.matches(item, term))
        .map((item) => this.toItemView(group.entityType, item));
      // While filtering, open every group so matches are visible.
      const isExpanded =
        this.isFiltering || this.expandedGroups.has(group.entityType);
      return {
        entityType: group.entityType,
        label: group.label,
        count: items.length,
        iconName: GROUP_ICONS[group.entityType] || "utility:list",
        isExpanded,
        ariaExpanded: String(isExpanded),
        chevron: isExpanded ? "utility:chevrondown" : "utility:chevronright",
        contentId: `group-${group.entityType}`,
        isEmpty: items.length === 0,
        items
      };
    });
  }

  matches(item, term) {
    if (!term) {
      return true;
    }
    return (
      (item.label || "").toLowerCase().includes(term) ||
      (item.apiName || "").toLowerCase().includes(term)
    );
  }

  toItemView(entityType, item) {
    const isSelected =
      entityType === this.selectedType && item.key === this.selectedKey;
    const isExpandable = entityType === "SOBJECT_TYPE" && item.hasChildren;
    const isExpanded = isExpandable && this.expandedObjects.has(item.key);
    const fieldState = this.fieldsByObject[item.key] || {};
    return {
      ...item,
      entityType,
      isSelected,
      ariaCurrent: isSelected ? "true" : "false",
      buttonClass:
        "slds-button entity-button" + (isSelected ? " is-selected" : ""),
      isExpandable,
      isExpanded,
      ariaExpanded: String(isExpanded),
      toggleLabel: `${isExpanded ? "Hide" : "Show"} fields for ${item.label}`,
      chevron: isExpanded ? "utility:chevrondown" : "utility:chevronright",
      fieldsId: `fields-${item.key}`,
      fieldsLoading: !!fieldState.loading,
      fieldsError: fieldState.error,
      fieldsEmpty:
        !fieldState.loading &&
        !fieldState.error &&
        (fieldState.items || []).length === 0,
      fields: (fieldState.items || []).map((field) =>
        this.toItemView("FIELD", field)
      )
    };
  }

  handleFilterChange(event) {
    this.filterTerm = (event.target.value || "").trim();
  }

  handleGroupToggle(event) {
    const entityType = event.currentTarget.dataset.type;
    const expanded = new Set(this.expandedGroups);
    if (expanded.has(entityType)) {
      expanded.delete(entityType);
    } else {
      expanded.add(entityType);
    }
    this.expandedGroups = expanded;
  }

  handleObjectToggle(event) {
    const objectName = event.currentTarget.dataset.key;
    const expanded = new Set(this.expandedObjects);
    if (expanded.has(objectName)) {
      expanded.delete(objectName);
    } else {
      expanded.add(objectName);
      if (!this.fieldsByObject[objectName]) {
        this.loadFields(objectName);
      }
    }
    this.expandedObjects = expanded;
  }

  async loadFields(objectName) {
    const userId = this._userId;
    this.setFieldState(objectName, { loading: true });
    try {
      const items = await getUserFields({ userId, objectName });
      if (userId === this._userId) {
        this.setFieldState(objectName, { items });
      }
    } catch (error) {
      if (userId === this._userId) {
        this.setFieldState(objectName, { error: errorText(error) });
      }
    }
  }

  setFieldState(objectName, state) {
    this.fieldsByObject = { ...this.fieldsByObject, [objectName]: state };
  }

  handleSelect(event) {
    const { type, key, label } = event.currentTarget.dataset;
    this.dispatchEvent(
      new CustomEvent("entityselect", {
        detail: { entityType: type, key, label }
      })
    );
  }
}
