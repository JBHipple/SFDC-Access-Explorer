import { createElement } from "lwc";
import AccessExplorerEntityView from "c/accessExplorerEntityView";
import getUsersWithAccess from "@salesforce/apex/AccessExplorerEntityController.getUsersWithAccess";

jest.mock(
  "@salesforce/apex/AccessExplorerEntityController.getUsersWithAccess",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerEntityController.searchEntities",
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getAccessSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex",
  () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

const ALICE = "005000000000001AAA";
const BOB = "005000000000002AAA";
const USERS_RESULT = {
  users: [
    {
      id: ALICE,
      name: "Alice Adams",
      username: "alice@example.com",
      profileName: "Standard User"
    },
    { id: BOB, name: "Bob Brown", username: "bob@example.com" }
  ],
  truncated: true
};
const ENTITY = {
  entityType: "FIELD",
  key: "Account.Industry",
  label: "Industry"
};

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createView(selection) {
  const element = createElement("c-access-explorer-entity-view", {
    is: AccessExplorerEntityView
  });
  if (selection) {
    element.selection = selection;
  }
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

async function selectEntity(element, entity = ENTITY) {
  $(element, "c-access-explorer-entity-picker").dispatchEvent(
    new CustomEvent("entityselect", { detail: entity })
  );
  await flushPromises();
}

async function selectUser(element, id) {
  $(element, ".user-list").dispatchEvent(
    new CustomEvent("select", { detail: { id } })
  );
  await flushPromises();
}

describe("c-access-explorer-entity-view", () => {
  beforeEach(() => {
    getUsersWithAccess.mockResolvedValue(USERS_RESULT);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows three panes with placeholders until an entity is chosen", async () => {
    const element = await createView();
    expect(element.shadowRoot.querySelectorAll(".pane")).toHaveLength(3);
    expect($(element, ".placeholder")).not.toBeNull();
    expect($(element, ".user-list")).toBeNull();
    expect(getUsersWithAccess).not.toHaveBeenCalled();
  });

  it("lists users with access and reports the selection", async () => {
    const element = await createView();
    const handler = jest.fn();
    element.addEventListener("selectionchange", handler);

    await selectEntity(element);

    expect(getUsersWithAccess).toHaveBeenCalledWith({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      searchTerm: ""
    });
    expect(handler.mock.calls[0][0].detail).toEqual({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      entityLabel: "Industry",
      userId: undefined
    });
    expect($(element, ".users-heading").textContent.trim()).toBe(
      "Users with access (2+)"
    );
    expect($(element, ".entity-subject").textContent.trim()).toBe(
      "Field: Industry"
    );
    const list = $(element, ".user-list");
    expect(list.fill).toBe(true);
    expect(list.hideLabel).toBe(true);
    expect(list.truncated).toBe(true);
    expect(list.items).toEqual([
      {
        id: ALICE,
        label: "Alice Adams",
        description: "alice@example.com • Standard User"
      },
      { id: BOB, label: "Bob Brown", description: "bob@example.com" }
    ]);
    const picker = $(element, "c-access-explorer-entity-picker");
    expect(picker.selectedType).toBe("FIELD");
    expect(picker.selectedKey).toBe("Account.Industry");
  });

  it("explains a selected user's access and links to all of their access", async () => {
    const element = await createView();
    await selectEntity(element);
    const selectionHandler = jest.fn();
    const viewHandler = jest.fn();
    element.addEventListener("selectionchange", selectionHandler);
    element.addEventListener("viewuser", viewHandler);

    expect($(element, ".view-user").disabled).toBe(true);
    $(element, ".view-user").click();
    expect(viewHandler).not.toHaveBeenCalled();

    await selectUser(element, BOB);
    expect(selectionHandler.mock.calls[0][0].detail.userId).toBe(BOB);
    const sources = $(element, "c-access-explorer-source-list");
    expect(sources.userId).toBe(BOB);
    expect(sources.userName).toBe("Bob Brown");
    expect(sources.entityType).toBe("FIELD");
    expect(sources.entityKey).toBe("Account.Industry");
    expect(sources.entityLabel).toBe("Industry");
    expect($(element, ".user-list").selectedId).toBe(BOB);

    $(element, ".view-user").click();
    expect(viewHandler.mock.calls[0][0].detail).toEqual({ userId: BOB });

    await selectUser(element, "missing");
    expect(selectionHandler).toHaveBeenCalledTimes(1);
  });

  it("filters users by search term", async () => {
    const element = await createView();
    await selectEntity(element);
    $(element, ".user-list").dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "ali" } })
    );
    await flushPromises();
    expect(getUsersWithAccess).toHaveBeenLastCalledWith({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      searchTerm: "ali"
    });
  });

  it("restores the entity and user from a selection", async () => {
    const element = await createView({
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      userId: ALICE
    });
    await flushPromises();

    expect(getUsersWithAccess).toHaveBeenCalledWith({
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      searchTerm: ""
    });
    expect(element.selection).toEqual({
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      entityLabel: "Account",
      userId: ALICE
    });
    expect($(element, "c-access-explorer-source-list").userName).toBe(
      "Alice Adams"
    );

    // Same entity, different user: no reload of the user list.
    element.selection = {
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      userId: BOB
    };
    await flushPromises();
    expect(getUsersWithAccess).toHaveBeenCalledTimes(1);
    expect($(element, "c-access-explorer-source-list").userId).toBe(BOB);

    element.selection = { userId: "bad" };
    await flushPromises();
    expect($(element, ".user-list")).toBeNull();
    expect($(element, "c-access-explorer-source-list").userId).toBeUndefined();
  });

  it("resets the user selection when the entity changes", async () => {
    const element = await createView();
    await selectEntity(element);
    await selectUser(element, ALICE);

    await selectEntity(element, {
      entityType: "SOBJECT_TYPE",
      key: "Account",
      label: "Account"
    });
    const sources = $(element, "c-access-explorer-source-list");
    expect(sources.userId).toBeUndefined();
    expect(sources.entityKey).toBe("Account");
    expect($(element, ".entity-subject").textContent.trim()).toBe(
      "Object: Account"
    );
  });

  it("refreshes the user list and sources", async () => {
    const element = await createView();
    await element.refresh();
    expect(getUsersWithAccess).not.toHaveBeenCalled();

    await selectEntity(element);
    $(element, ".user-list").dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "bo" } })
    );
    await flushPromises();
    const sourcesRefresh = jest
      .spyOn($(element, "c-access-explorer-source-list"), "refresh")
      .mockResolvedValue(undefined);

    await element.refresh();
    expect(getUsersWithAccess).toHaveBeenLastCalledWith({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      searchTerm: "bo"
    });
    expect(sourcesRefresh).toHaveBeenCalled();
  });

  it("exports users with access to CSV", async () => {
    const element = await createView();
    await selectEntity(element);
    let csv;
    let fileName;
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function captureLink() {
        fileName = this.download;
        csv = decodeURIComponent(this.href.split(",").slice(1).join(","));
      });

    $(element, ".export").click();

    expect(fileName).toBe("users_with_access_Industry.csv");
    expect(csv.split("\r\n")).toEqual([
      "Name,Username,Profile,Field",
      "Alice Adams,alice@example.com,Standard User,Industry",
      "Bob Brown,bob@example.com,,Industry"
    ]);
    click.mockRestore();
  });

  it("shows errors loading users", async () => {
    getUsersWithAccess.mockRejectedValue({
      body: { message: "Unknown field." }
    });
    const element = await createView();
    await selectEntity(element);
    const alert = $(element, ".users-error");
    expect(alert.textContent.trim()).toBe("Unknown field.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect($(element, ".user-list").items).toEqual([]);
    expect($(element, ".users-heading").textContent.trim()).toBe(
      "Users with access"
    );
    expect($(element, ".export").disabled).toBe(true);
  });

  it("handles results without a users list and ignores stale responses", async () => {
    let resolveFirst;
    getUsersWithAccess
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce({ truncated: false });
    const element = await createView();
    await selectEntity(element);
    $(element, ".user-list").dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "nobody" } })
    );
    await flushPromises();
    resolveFirst(USERS_RESULT);
    await flushPromises();
    expect($(element, ".user-list").items).toEqual([]);
    expect($(element, ".user-list").loading).toBe(false);
    expect($(element, ".users-heading").textContent.trim()).toBe(
      "Users with access (0)"
    );
  });
});
