import { api, LightningElement } from "lwc";
import searchEntities from "@salesforce/apex/AccessExplorerEntityController.searchEntities";
import {
  ENTITY_TYPES,
  errorText,
  getEntityTypePluralLabel
} from "c/accessExplorerUtils";

const ENTITY_LIMIT = 200;
const DEFAULT_TYPE = ENTITY_TYPES[0].value;

/**
 * Picks one entity to inspect: an entity type, then a searchable list of entities of
 * that type. Fields are chosen in two steps (object, then field).
 *
 * The parent can drive the picker by setting selectedType / selectedKey (e.g. from a
 * deep link or a cross-link); the picker then switches type and reloads.
 *
 * Events:
 *  - entityselect: detail { entityType, key, label }
 */
export default class AccessExplorerEntityPicker extends LightningElement {
  entityType = DEFAULT_TYPE;
  fieldObject;
  results = [];
  loading = false;
  error;
  searchRequest = 0;
  connected = false;
  reloadScheduled = false;
  _selectedKey;

  @api
  get selectedType() {
    return this.entityType;
  }
  set selectedType(value) {
    const type = ENTITY_TYPES.some((option) => option.value === value)
      ? value
      : DEFAULT_TYPE;
    if (type !== this.entityType) {
      this.entityType = type;
      this.fieldObject = undefined;
      this.syncFieldObject();
      this.scheduleReload();
    }
  }

  @api
  get selectedKey() {
    return this._selectedKey;
  }
  set selectedKey(value) {
    this._selectedKey = value;
    if (this.syncFieldObject()) {
      this.scheduleReload();
    }
  }

  connectedCallback() {
    this.connected = true;
    this.loadResults("");
  }

  disconnectedCallback() {
    this.connected = false;
  }

  /**
   * For a selected field key ("Account.Industry"), make sure the field list is scoped
   * to its object. Returns true when the object changed.
   */
  syncFieldObject() {
    const key = this._selectedKey;
    if (
      this.entityType !== "FIELD" ||
      typeof key !== "string" ||
      !key.includes(".")
    ) {
      return false;
    }
    const objectName = key.split(".")[0];
    if (this.fieldObject && this.fieldObject.key === objectName) {
      return false;
    }
    this.fieldObject = { key: objectName, label: objectName };
    return true;
  }

  /** Batches setter-driven reloads so selectedType and selectedKey apply together. */
  scheduleReload() {
    if (!this.connected || this.reloadScheduled) {
      return;
    }
    this.reloadScheduled = true;
    Promise.resolve().then(() => {
      this.reloadScheduled = false;
      this.restartSearch();
    });
  }

  get typeOptions() {
    return ENTITY_TYPES.map(({ value, label }) => ({ value, label }));
  }

  get isChoosingObjectForField() {
    return this.entityType === "FIELD" && !this.fieldObject;
  }

  get showFieldObject() {
    return this.entityType === "FIELD" && !!this.fieldObject;
  }

  get fieldObjectLabel() {
    return this.fieldObject ? `Object: ${this.fieldObject.label}` : "";
  }

  get searchLabel() {
    if (this.isChoosingObjectForField) {
      return "Search Objects (then choose a field)";
    }
    return `Search ${getEntityTypePluralLabel(this.entityType)}`;
  }

  get resultItems() {
    return this.results.map((entity) => ({
      id: entity.key,
      label: entity.label,
      description:
        entity.apiName && entity.apiName !== entity.label
          ? entity.apiName
          : undefined
    }));
  }

  get listSelectedId() {
    return this.isChoosingObjectForField ? undefined : this._selectedKey;
  }

  get truncated() {
    return this.results.length >= ENTITY_LIMIT;
  }

  async loadResults(searchTerm) {
    const request = ++this.searchRequest;
    const choosingObject = this.isChoosingObjectForField;
    this.loading = true;
    try {
      const results = await searchEntities({
        entityType: choosingObject ? "SOBJECT_TYPE" : this.entityType,
        searchTerm,
        objectName: this.fieldObject ? this.fieldObject.key : null
      });
      if (request === this.searchRequest) {
        this.results = results;
        this.error = undefined;
      }
    } catch (error) {
      if (request === this.searchRequest) {
        this.results = [];
        this.error = errorText(error);
      }
    } finally {
      if (request === this.searchRequest) {
        this.loading = false;
      }
    }
  }

  handleTypeChange(event) {
    this.entityType = event.detail.value;
    this.fieldObject = undefined;
    this.restartSearch();
  }

  handleSearch(event) {
    this.loadResults(event.detail.searchTerm);
  }

  handleSelect(event) {
    const entity = this.results.find(
      (candidate) => candidate.key === event.detail.id
    );
    if (!entity) {
      return;
    }
    if (this.isChoosingObjectForField) {
      this.fieldObject = entity;
      this.restartSearch();
      return;
    }
    this.dispatchEvent(
      new CustomEvent("entityselect", {
        detail: {
          entityType: this.entityType,
          key: entity.key,
          label: entity.label
        }
      })
    );
  }

  handleClearObject() {
    this.fieldObject = undefined;
    this.restartSearch();
  }

  restartSearch() {
    this.results = [];
    const list = this.template.querySelector("c-access-explorer-search-list");
    if (list) {
      list.clearSearch();
    }
    this.loadResults("");
  }
}
