import { api, LightningElement } from "lwc";
import getUserFields from "@salesforce/apex/AccessExplorerUserController.getUserFields";
import { errorText } from "c/accessExplorerUtils";

/**
 * Flat list of the entities a user can access within one category. Object rows can be
 * expanded to show the object's fields, which are loaded on first expand.
 *
 * Events:
 *  - entityselect: detail { entityType, key, label }
 */
export default class AccessExplorerEntityList extends LightningElement {
  @api items = [];
  @api selectedType;
  @api selectedKey;
  @api emptyMessage = "No access.";

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

  /** Discards cached fields and reloads any expanded objects. */
  @api
  refresh() {
    this.fieldsByObject = {};
    this.expandedObjects.forEach((objectName) => this.loadFields(objectName));
  }

  get hasItems() {
    return (this.items || []).length > 0;
  }

  get itemViews() {
    return (this.items || []).map((item) => this.toItemView(item));
  }

  toItemView(item) {
    const isSelected =
      item.entityType === this.selectedType && item.key === this.selectedKey;
    const isExpandable =
      item.entityType === "SOBJECT_TYPE" && !!item.hasChildren;
    const isExpanded = isExpandable && this.expandedObjects.has(item.key);
    const fieldState = this.fieldsByObject[item.key] || {};
    const showApiName = !!item.apiName && item.apiName !== item.label;
    return {
      ...item,
      isSelected,
      ariaCurrent: isSelected ? "true" : "false",
      rowClass: "row" + (isSelected ? " is-selected" : ""),
      showApiName,
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
      fields: (fieldState.items || []).map((field) => this.toItemView(field))
    };
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
