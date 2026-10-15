import { createElement } from "lwc";
import AccessExplorerUserView from "c/accessExplorerUserView";
import getUser from "@salesforce/apex/AccessExplorerUserController.getUser";
import getUserEntities from "@salesforce/apex/AccessExplorerUserController.getUserEntities";
import { refreshApex } from "@salesforce/apex";

function mockWireAdapter() {
  const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
  return { default: createApexTestWireAdapter(jest.fn()) };
}

jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUser",
  () => mockWireAdapter(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUserEntities",
  () => mockWireAdapter(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getAccessSources",
  () => mockWireAdapter(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUserFields",
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex",
  () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

const USER_ID = "005000000000001AAA";
const USER = {
  id: USER_ID,
  name: "Alice Adams",
  username: "alice@example.com",
  profileName: "Standard User",
  isActive: true
};
const GROUPS = [
  {
    entityType: "SOBJECT_TYPE",
    label: "Objects",
    items: [
      {
        entityType: "SOBJECT_TYPE",
        key: "Account",
        label: "Account",
        apiName: "Account",
        summary: "Read, Edit",
        hasChildren: true
      },
      {
        entityType: "SOBJECT_TYPE",
        key: "Invoice__c",
        label: "Invoice",
        apiName: "Invoice__c",
        summary: "Read",
        hasChildren: true
      }
    ]
  },
  {
    entityType: "SYSTEM_PERMISSION",
    label: "System Permissions",
    items: [
      {
        entityType: "SYSTEM_PERMISSION",
        key: "PermissionsApiEnabled",
        label: "API Enabled",
        apiName: "PermissionsApiEnabled",
        summary: "Enabled"
      }
    ]
  },
  { entityType: "APEX_CLASS", label: "Apex Classes", items: [] }
];

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createView(selection) {
  const element = createElement("c-access-explorer-user-view", {
    is: AccessExplorerUserView
  });
  if (selection) {
    element.selection = selection;
  }
  document.body.appendChild(element);
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

async function pickUser(element, recordId = USER_ID) {
  $(element, "lightning-record-picker").dispatchEvent(
    new CustomEvent("change", { detail: { recordId } })
  );
  await flushPromises();
}

async function loadUser(element) {
  await pickUser(element);
  getUser.emit(USER);
  getUserEntities.emit(GROUPS);
  await flushPromises();
}

function navItems(element) {
  return [
    ...element.shadowRoot.querySelectorAll(
      "lightning-vertical-navigation-item-badge"
    )
  ].map((item) => ({ name: item.name, count: item.badgeCount }));
}

describe("c-access-explorer-user-view", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("starts with a user lookup restricted to active users", () => {
    const element = createView();
    const picker = $(element, "lightning-record-picker");
    expect(picker.objectApiName).toBe("User");
    expect(picker.filter.criteria).toEqual([
      { fieldPath: "IsActive", operator: "eq", value: true }
    ]);
    expect(picker.displayInfo.additionalFields).toEqual(["Username"]);
    expect($(element, ".empty-state")).not.toBeNull();
    expect($(element, ".panes")).toBeNull();
    expect($(element, ".cancel-change")).toBeNull();
  });

  it("collapses the lookup into a user header after a pick", async () => {
    const element = createView();
    const handler = jest.fn();
    element.addEventListener("selectionchange", handler);

    await pickUser(element);
    expect(handler.mock.calls[0][0].detail).toEqual({
      userId: USER_ID,
      entityType: undefined,
      entityKey: undefined,
      entityLabel: undefined
    });
    expect(getUser.getLastConfig()).toEqual({ userId: USER_ID });
    expect(getUserEntities.getLastConfig()).toEqual({ userId: USER_ID });
    expect($(element, "lightning-record-picker")).toBeNull();
    expect($(element, ".user-name").textContent).toBe("Loading user…");
    expect($(element, ".loading")).not.toBeNull();

    getUser.emit({ ...USER, isActive: false });
    await flushPromises();
    expect($(element, ".user-name").textContent).toBe("Alice Adams");
    expect($(element, ".user-meta").textContent.trim()).toBe(
      "alice@example.com • Standard User • Inactive"
    );
  });

  it("ignores cleared or repeated picks", async () => {
    const element = createView();
    const handler = jest.fn();
    element.addEventListener("selectionchange", handler);

    await pickUser(element, null);
    expect(handler).not.toHaveBeenCalled();

    await loadUser(element);
    $(element, ".change-user").click();
    await flushPromises();
    await pickUser(element, USER_ID);
    expect(handler).toHaveBeenCalledTimes(1);
    expect($(element, ".change-user")).not.toBeNull();
  });

  it("lets the admin change or keep the current user", async () => {
    const element = createView();
    await loadUser(element);

    $(element, ".change-user").click();
    await flushPromises();
    expect($(element, "lightning-record-picker")).not.toBeNull();
    $(element, ".cancel-change").click();
    await flushPromises();
    expect($(element, "lightning-record-picker")).toBeNull();
    expect($(element, ".panes")).not.toBeNull();

    $(element, ".change-user").click();
    await flushPromises();
    await pickUser(element, "005000000000002AAA");
    expect(getUserEntities.getLastConfig()).toEqual({
      userId: "005000000000002AAA"
    });
  });

  it("shows categories with counts and the items of the selected category", async () => {
    const element = createView();
    await loadUser(element);

    expect(navItems(element)).toEqual([
      { name: "SOBJECT_TYPE", count: 2 },
      { name: "SYSTEM_PERMISSION", count: 1 },
      { name: "APEX_CLASS", count: 0 }
    ]);
    expect($(element, "lightning-vertical-navigation").selectedItem).toBe(
      "SOBJECT_TYPE"
    );
    const list = $(element, "c-access-explorer-entity-list");
    expect(list.items.map((item) => item.key)).toEqual([
      "Account",
      "Invoice__c"
    ]);
    expect(list.userId).toBe(USER_ID);
    expect($(element, ".pane-title").textContent.trim()).toBe("Objects");

    $(element, "lightning-vertical-navigation").dispatchEvent(
      new CustomEvent("select", { detail: { name: "APEX_CLASS" } })
    );
    await flushPromises();
    expect(list.items).toEqual([]);
    expect(list.emptyMessage).toBe("No access in this category.");
    expect($(element, ".export").disabled).toBe(true);
  });

  it("filters across categories and jumps to one with matches", async () => {
    const element = createView();
    await loadUser(element);

    const filter = $(element, "lightning-input.filter");
    filter.value = "api";
    filter.dispatchEvent(new CustomEvent("change"));
    await flushPromises();

    expect(navItems(element)).toEqual([
      { name: "SOBJECT_TYPE", count: 0 },
      { name: "SYSTEM_PERMISSION", count: 1 },
      { name: "APEX_CLASS", count: 0 }
    ]);
    expect($(element, "lightning-vertical-navigation").selectedItem).toBe(
      "SYSTEM_PERMISSION"
    );

    filter.value = "zzz";
    filter.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect($(element, "c-access-explorer-entity-list").emptyMessage).toBe(
      "Nothing in this category matches the filter."
    );

    filter.value = "";
    filter.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect(navItems(element)[0].count).toBe(2);
  });

  it("explains the selected item and links to everyone with that access", async () => {
    const element = createView();
    await loadUser(element);
    const selectionHandler = jest.fn();
    const viewHandler = jest.fn();
    element.addEventListener("selectionchange", selectionHandler);
    element.addEventListener("viewentity", viewHandler);

    expect($(element, ".view-entity").disabled).toBe(true);
    $(element, ".view-entity").click();
    expect(viewHandler).not.toHaveBeenCalled();

    $(element, "c-access-explorer-entity-list").dispatchEvent(
      new CustomEvent("entityselect", {
        detail: { entityType: "SOBJECT_TYPE", key: "Account", label: "Account" }
      })
    );
    await flushPromises();

    expect(selectionHandler.mock.calls[0][0].detail).toEqual({
      userId: USER_ID,
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      entityLabel: "Account"
    });
    const sources = $(element, "c-access-explorer-source-list");
    expect(sources.userId).toBe(USER_ID);
    expect(sources.userName).toBe("Alice Adams");
    expect(sources.entityType).toBe("SOBJECT_TYPE");
    expect(sources.entityKey).toBe("Account");
    expect(sources.entityLabel).toBe("Account");
    expect($(element, "c-access-explorer-entity-list").selectedKey).toBe(
      "Account"
    );

    $(element, ".view-entity").click();
    expect(viewHandler.mock.calls[0][0].detail).toEqual({
      entityType: "SOBJECT_TYPE",
      key: "Account",
      label: "Account"
    });
  });

  it("restores user, entity and category from a selection", async () => {
    const element = createView({
      userId: USER_ID,
      entityType: "SYSTEM_PERMISSION",
      entityKey: "PermissionsApiEnabled",
      entityLabel: "API Enabled"
    });
    getUser.emit(USER);
    getUserEntities.emit(GROUPS);
    await flushPromises();

    expect(element.selection).toEqual({
      userId: USER_ID,
      entityType: "SYSTEM_PERMISSION",
      entityKey: "PermissionsApiEnabled",
      entityLabel: "API Enabled"
    });
    expect($(element, "lightning-vertical-navigation").selectedItem).toBe(
      "SYSTEM_PERMISSION"
    );
    expect($(element, "c-access-explorer-source-list").entityKey).toBe(
      "PermissionsApiEnabled"
    );

    // Fields live under their object.
    element.selection = {
      userId: USER_ID,
      entityType: "FIELD",
      entityKey: "Account.Industry"
    };
    await flushPromises();
    expect($(element, "lightning-vertical-navigation").selectedItem).toBe(
      "SOBJECT_TYPE"
    );
    expect($(element, "c-access-explorer-source-list").entityLabel).toBe(
      "Account.Industry"
    );

    // Reapplying the same selection keeps the loaded data.
    element.selection = { ...element.selection };
    await flushPromises();
    expect($(element, ".user-name").textContent).toBe("Alice Adams");

    // Invalid ids are ignored and clearing the selection resets the view.
    element.selection = { userId: "not-an-id" };
    await flushPromises();
    expect($(element, "lightning-record-picker")).not.toBeNull();
    element.selection = undefined;
    await flushPromises();
    expect($(element, ".panes")).toBeNull();
  });

  it("shows user and entity loading errors", async () => {
    const element = createView();
    await pickUser(element);
    getUser.error({ message: "User not found." });
    getUserEntities.error({ message: "Denied" });
    await flushPromises();

    expect($(element, ".user-error").textContent.trim()).toBe(
      "User not found."
    );
    expect($(element, ".entities-error").textContent.trim()).toBe("Denied");
    expect($(element, ".entities-error").getAttribute("role")).toBe("alert");
    expect($(element, ".user-meta").textContent.trim()).toBe("");
  });

  it("refreshes the user, their entities, fields and sources", async () => {
    const element = createView();
    await element.refresh();
    expect(refreshApex).toHaveBeenCalledTimes(2);

    await loadUser(element);
    refreshApex.mockClear();
    const list = $(element, "c-access-explorer-entity-list");
    const sources = $(element, "c-access-explorer-source-list");
    const listRefresh = jest.spyOn(list, "refresh");
    const sourcesRefresh = jest
      .spyOn(sources, "refresh")
      .mockResolvedValue(undefined);

    await element.refresh();
    expect(refreshApex).toHaveBeenCalledTimes(2);
    expect(listRefresh).toHaveBeenCalled();
    expect(sourcesRefresh).toHaveBeenCalled();
  });

  it("exports the current category to CSV", async () => {
    const element = createView();
    await loadUser(element);
    let csv;
    let fileName;
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function captureLink() {
        fileName = this.download;
        csv = decodeURIComponent(this.href.split(",").slice(1).join(","));
      });

    expect($(element, ".export").disabled).toBe(false);
    $(element, ".export").click();

    expect(fileName).toBe("access_Alice_Adams_Objects.csv");
    expect(csv.split("\r\n")).toEqual([
      "Category,Name,API Name,Access",
      'Objects,Account,Account,"Read, Edit"',
      "Objects,Invoice,Invoice__c,Read"
    ]);
    click.mockRestore();
  });
});
