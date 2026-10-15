import { createElement } from "lwc";
import AccessExplorerSearchList from "c/accessExplorerSearchList";
import { SEARCH_DELAY_MS } from "c/accessExplorerUtils";

const ITEMS = [
  { id: "1", label: "Alice Adams", description: "alice@example.com" },
  { id: "2", label: "Bob Brown" },
  { id: "3", label: "Carol Chen", description: "carol@example.com" }
];

function createList(props = {}) {
  const element = createElement("c-access-explorer-search-list", {
    is: AccessExplorerSearchList
  });
  Object.assign(element, { label: "Search users", items: ITEMS }, props);
  document.body.appendChild(element);
  return element;
}

function options(element) {
  return [...element.shadowRoot.querySelectorAll('[role="option"]')];
}

describe("c-access-explorer-search-list", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.useRealTimers();
  });

  it("renders an accessible listbox of options", () => {
    const element = createList({ selectedId: "2" });

    const listbox = element.shadowRoot.querySelector('[role="listbox"]');
    expect(listbox.getAttribute("aria-label")).toBe("Search users");
    expect(listbox.getAttribute("aria-busy")).toBe("false");

    const rendered = options(element);
    expect(rendered).toHaveLength(3);
    expect(
      rendered.map((option) => option.getAttribute("aria-selected"))
    ).toEqual(["false", "true", "false"]);
    // Roving tabindex: only the selected option is in the tab order.
    expect(rendered.map((option) => option.getAttribute("tabindex"))).toEqual([
      "-1",
      "0",
      "-1"
    ]);
    expect(rendered[0].querySelector(".option-description").textContent).toBe(
      "alice@example.com"
    );
    expect(rendered[1].querySelector(".option-description")).toBeNull();
  });

  it("makes the first option tabbable when nothing is selected", () => {
    const element = createList();
    expect(options(element)[0].getAttribute("tabindex")).toBe("0");
  });

  it("fires a debounced search event", () => {
    jest.useFakeTimers();
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("search", handler);

    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "al";
    input.dispatchEvent(new CustomEvent("change"));
    input.value = "ali";
    input.dispatchEvent(new CustomEvent("change"));

    jest.advanceTimersByTime(SEARCH_DELAY_MS - 1);
    expect(handler).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ searchTerm: "ali" });
  });

  it("fires select when an option is clicked", () => {
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("select", handler);

    options(element)[2].click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      id: "3",
      item: ITEMS[2]
    });
  });

  it("supports arrow, Home and End keys and selects with Enter or Space", async () => {
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("select", handler);
    const listbox = element.shadowRoot.querySelector('[role="listbox"]');
    const press = async (key) => {
      listbox.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
      await Promise.resolve();
    };

    options(element)[0].focus();
    await press("ArrowDown");
    expect(element.shadowRoot.activeElement).toBe(options(element)[1]);
    expect(options(element)[1].getAttribute("tabindex")).toBe("0");

    await press("End");
    expect(element.shadowRoot.activeElement).toBe(options(element)[2]);
    await press("ArrowDown");
    expect(element.shadowRoot.activeElement).toBe(options(element)[2]);

    await press("ArrowUp");
    expect(element.shadowRoot.activeElement).toBe(options(element)[1]);
    await press("Home");
    expect(element.shadowRoot.activeElement).toBe(options(element)[0]);
    await press("ArrowUp");
    expect(element.shadowRoot.activeElement).toBe(options(element)[0]);

    await press("Enter");
    expect(handler.mock.calls[0][0].detail.id).toBe("1");
    await press("ArrowDown");
    await press(" ");
    expect(handler.mock.calls[1][0].detail.id).toBe("2");

    await press("a");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores keys when there are no options", () => {
    const element = createList({ items: [] });
    const listbox = element.shadowRoot.querySelector('[role="listbox"]');
    expect(() =>
      listbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }))
    ).not.toThrow();
  });

  it("shows loading, empty and truncated states", async () => {
    const element = createList({ items: [], emptyMessage: "Nobody here." });
    expect(
      element.shadowRoot.querySelector(".empty-message").textContent.trim()
    ).toBe("Nobody here.");
    expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();

    element.loading = true;
    element.truncated = true;
    await Promise.resolve();
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();
    expect(element.shadowRoot.querySelector(".empty-message")).toBeNull();
    expect(
      element.shadowRoot.querySelector(".truncated-message")
    ).not.toBeNull();
    expect(
      element.shadowRoot
        .querySelector('[role="listbox"]')
        .getAttribute("aria-busy")
    ).toBe("true");
  });

  it("clears the search term through its public method", async () => {
    const element = createList();
    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "bob";
    input.dispatchEvent(new CustomEvent("change"));
    await Promise.resolve();
    expect(input.value).toBe("bob");

    element.clearSearch();
    await Promise.resolve();
    expect(input.value).toBe("");
  });

  it("does not fire select for unknown ids", () => {
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("select", handler);
    const option = options(element)[0];
    option.dataset.id = "missing";
    option.click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports fill mode and a visually hidden label", async () => {
    const element = createList();
    const root = element.shadowRoot.querySelector(".search-list");
    const input = element.shadowRoot.querySelector("lightning-input");
    expect(root.classList).not.toContain("search-list_fill");
    expect(input.variant).toBe("standard");

    element.fill = true;
    element.hideLabel = true;
    await Promise.resolve();
    expect(root.classList).toContain("search-list_fill");
    expect(input.variant).toBe("label-hidden");
    expect(input.label).toBe("Search users");
  });
});
