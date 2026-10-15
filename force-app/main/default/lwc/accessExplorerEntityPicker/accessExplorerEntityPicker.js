import { LightningElement, api } from "lwc";
import searchEntities from "@salesforce/apex/AccessExplorerEntityController.searchEntities";
import {
  ENTITY_TYPES,
  errorText,
  getEntityTypePluralLabel
} from "c/accessExplorerUtils";

const ENTITY_LIMIT = 200;

/**
 * Picks one entity to inspect: an entity type, then a searchable list of entities of
 * that type. Fields are chosen in two steps (object, then field).
 *
 * Events:
 *  - entityselect: detail { entityType, key, label }
 */
export default class AccessExplorerEntityPicker extends LightningElement {
  @api selectedKey;

  entityType = ENTITY_TYPES[0].value;
  fieldObject;
  results = [];
  loading = false;
  error;
  searchRequest = 0;

  connectedCallback() {
    this.loadResults("");
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
    return this.isChoosingObjectForField ? undefined : this.selectedKey;
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
