import { LightningElement, api } from "lwc";
import { debounce, SEARCH_DELAY_MS } from "c/accessExplorerUtils";

/**
 * Searchable, scrollable single-select list (ARIA listbox). Presentational only: the
 * parent supplies items and reacts to "search" and "select" events.
 *
 * Items: [{ id, label, description? }]
 * Events:
 *  - search: detail { searchTerm } (debounced)
 *  - select: detail { id, item }
 */
export default class AccessExplorerSearchList extends LightningElement {
  @api label = "Search";
  @api placeholder = "";
  @api items = [];
  @api selectedId;
  @api loading = false;
  @api emptyMessage = "No results found.";
  @api truncated = false;
  /** Stretch to fill the parent's height instead of using a fixed-height list. */
  @api fill = false;
  /** Hide the visible search label (it remains available to assistive technology). */
  @api hideLabel = false;
  @api truncatedMessage =
    "Only the first results are shown. Refine your search to narrow the list.";

  searchTerm = "";
  focusedIndex = -1;

  connectedCallback() {
    this.notifySearch = debounce((searchTerm) => {
      this.dispatchEvent(new CustomEvent("search", { detail: { searchTerm } }));
    }, SEARCH_DELAY_MS);
  }

  /** Clears the search box without notifying the parent (used when the list's context changes). */
  @api
  clearSearch() {
    this.searchTerm = "";
    this.focusedIndex = -1;
  }

  get viewItems() {
    const items = this.items || [];
    const activeIndex = this.getActiveIndex(items);
    return items.map((item, index) => {
      const selected = item.id === this.selectedId;
      return {
        ...item,
        index,
        ariaSelected: selected ? "true" : "false",
        tabIndex: index === activeIndex ? "0" : "-1",
        className:
          "slds-listbox__item option" + (selected ? " is-selected" : "")
      };
    });
  }

  get rootClass() {
    return this.fill ? "search-list search-list_fill" : "search-list";
  }

  get inputVariant() {
    return this.hideLabel ? "label-hidden" : "standard";
  }

  get showEmpty() {
    return !this.loading && (!this.items || this.items.length === 0);
  }

  get ariaBusy() {
    return this.loading ? "true" : "false";
  }

  getActiveIndex(items) {
    if (this.focusedIndex >= 0 && this.focusedIndex < items.length) {
      return this.focusedIndex;
    }
    const selectedIndex = items.findIndex(
      (item) => item.id === this.selectedId
    );
    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  handleSearchChange(event) {
    this.searchTerm = event.target.value;
    this.focusedIndex = -1;
    this.notifySearch(this.searchTerm);
  }

  handleItemClick(event) {
    this.focusedIndex = Number(event.currentTarget.dataset.index);
    this.select(event.currentTarget.dataset.id);
  }

  handleKeyDown(event) {
    const options = [...this.template.querySelectorAll('[role="option"]')];
    if (!options.length) {
      return;
    }
    const current = Math.max(0, options.indexOf(this.template.activeElement));
    let next;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(current + 1, options.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(current - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        this.select(options[current].dataset.id);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.focusedIndex = next;
    options[next].focus();
  }

  select(id) {
    const item = (this.items || []).find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }
    this.dispatchEvent(new CustomEvent("select", { detail: { id, item } }));
  }
}
