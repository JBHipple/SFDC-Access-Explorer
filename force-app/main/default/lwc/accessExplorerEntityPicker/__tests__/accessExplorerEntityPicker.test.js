import { createElement } from "lwc";
import AccessExplorerEntityPicker from "c/accessExplorerEntityPicker";
import searchEntities from "@salesforce/apex/AccessExplorerEntityController.searchEntities";

jest.mock(
  "@salesforce/apex/AccessExplorerEntityController.searchEntities",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const OBJECTS = [
  {
    entityType: "SOBJECT_TYPE",
    key: "Account",
    label: "Account",
    apiName: "Account"
  },
  {
    entityType: "SOBJECT_TYPE",
    key: "Invoice__c",
    label: "Invoice",
    apiName: "Invoice__c"
  }
];
const FIELDS = [
  {
    entityType: "FIELD",
    key: "Account.Industry",
    label: "Industry",
    apiName: "Industry"
  }
];
const CLASSES = [
  {
    entityType: "APEX_CLASS",
    key: "01p000000000001AAA",
    label: "MyController",
    apiName: "MyController"
  }
];

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createPicker() {
  const element = createElement("c-access-explorer-entity-picker", {
    is: AccessExplorerEntityPicker
  });
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function searchList(element) {
  return element.shadowRoot.querySelector("c-access-explorer-search-list");
}

async function changeType(element, value) {
  element.shadowRoot
    .querySelector("lightning-combobox")
    .dispatchEvent(new CustomEvent("change", { detail: { value } }));
  await flushPromises();
}

async function selectItem(element, id) {
  searchList(element).dispatchEvent(
    new CustomEvent("select", { detail: { id } })
  );
  await flushPromises();
}

describe("c-access-explorer-entity-picker", () => {
  beforeEach(() => {
    searchEntities.mockImplementation(({ entityType }) => {
      if (entityType === "FIELD") {
        return Promise.resolve(FIELDS);
      }
      return Promise.resolve(entityType === "APEX_CLASS" ? CLASSES : OBJECTS);
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("loads objects by default and maps them to list items", async () => {
    const element = await createPicker();

    expect(searchEntities).toHaveBeenCalledWith({
      entityType: "SOBJECT_TYPE",
      searchTerm: "",
      objectName: null
    });
    const list = searchList(element);
    expect(list.label).toBe("Search Objects");
    expect(list.items).toEqual([
      { id: "Account", label: "Account", description: undefined },
      { id: "Invoice__c", label: "Invoice", description: "Invoice__c" }
    ]);
    expect(list.loading).toBe(false);
    expect(list.truncated).toBe(false);
    expect(
      element.shadowRoot.querySelector("lightning-combobox").options.length
    ).toBe(11);
  });

  it("selects an object entity directly", async () => {
    const element = await createPicker();
    const handler = jest.fn();
    element.addEventListener("entityselect", handler);

    await selectItem(element, "Invoice__c");

    expect(handler.mock.calls[0][0].detail).toEqual({
      entityType: "SOBJECT_TYPE",
      key: "Invoice__c",
      label: "Invoice"
    });
  });

  it("re-searches when the search term changes", async () => {
    const element = await createPicker();
    searchList(element).dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "inv" } })
    );
    await flushPromises();
    expect(searchEntities).toHaveBeenLastCalledWith({
      entityType: "SOBJECT_TYPE",
      searchTerm: "inv",
      objectName: null
    });
  });

  it("chooses fields in two steps: object, then field", async () => {
    const element = await createPicker();
    const handler = jest.fn();
    element.addEventListener("entityselect", handler);

    await changeType(element, "FIELD");
    expect(searchList(element).label).toBe(
      "Search Objects (then choose a field)"
    );
    expect(searchEntities).toHaveBeenLastCalledWith({
      entityType: "SOBJECT_TYPE",
      searchTerm: "",
      objectName: null
    });

    await selectItem(element, "Account");
    expect(handler).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector("lightning-pill").label).toBe(
      "Object: Account"
    );
    expect(searchList(element).label).toBe("Search Fields");
    expect(searchEntities).toHaveBeenLastCalledWith({
      entityType: "FIELD",
      searchTerm: "",
      objectName: "Account"
    });

    await selectItem(element, "Account.Industry");
    expect(handler.mock.calls[0][0].detail).toEqual({
      entityType: "FIELD",
      key: "Account.Industry",
      label: "Industry"
    });

    element.shadowRoot
      .querySelector("lightning-pill")
      .dispatchEvent(new CustomEvent("remove"));
    await flushPromises();
    expect(element.shadowRoot.querySelector("lightning-pill")).toBeNull();
    expect(searchList(element).label).toBe(
      "Search Objects (then choose a field)"
    );
  });

  it("passes the selected key through except while choosing an object", async () => {
    const element = await createPicker();
    element.selectedKey = "Account";
    await flushPromises();
    expect(searchList(element).selectedId).toBe("Account");

    await changeType(element, "FIELD");
    expect(searchList(element).selectedId).toBeUndefined();
  });

  it("searches other entity types", async () => {
    const element = await createPicker();
    await changeType(element, "APEX_CLASS");
    expect(searchList(element).label).toBe("Search Apex Classes");
    expect(searchList(element).items[0].label).toBe("MyController");
  });

  it("flags truncated results", async () => {
    searchEntities.mockResolvedValue(
      Array.from({ length: 200 }, (unused, index) => ({
        key: `k${index}`,
        label: `Item ${index}`
      }))
    );
    const element = await createPicker();
    expect(searchList(element).truncated).toBe(true);
  });

  it("ignores selections of unknown ids", async () => {
    const element = await createPicker();
    const handler = jest.fn();
    element.addEventListener("entityselect", handler);
    await selectItem(element, "Missing");
    expect(handler).not.toHaveBeenCalled();
  });

  it("shows errors from the server", async () => {
    searchEntities.mockRejectedValue({
      body: { message: "Unknown entity type." }
    });
    const element = await createPicker();
    const alert = element.shadowRoot.querySelector(".error");
    expect(alert.textContent.trim()).toBe("Unknown entity type.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(searchList(element).items).toEqual([]);
  });

  it("ignores stale responses", async () => {
    let resolveFirst;
    searchEntities
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce(CLASSES);
    const element = createElement("c-access-explorer-entity-picker", {
      is: AccessExplorerEntityPicker
    });
    document.body.appendChild(element);
    await changeType(element, "APEX_CLASS");
    resolveFirst(OBJECTS);
    await flushPromises();
    expect(searchList(element).items[0].label).toBe("MyController");
  });
});
