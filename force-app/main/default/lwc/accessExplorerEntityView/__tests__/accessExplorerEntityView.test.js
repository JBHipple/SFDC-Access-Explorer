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

const USERS_RESULT = {
  users: [
    {
      id: "005000000000001AAA",
      name: "Alice Adams",
      username: "alice@example.com",
      profileName: "Standard User"
    },
    { id: "005000000000002AAA", name: "Bob Brown", username: "bob@example.com" }
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

async function createView() {
  const element = createElement("c-access-explorer-entity-view", {
    is: AccessExplorerEntityView
  });
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

async function selectEntity(element, entity = ENTITY) {
  element.shadowRoot
    .querySelector("c-access-explorer-entity-picker")
    .dispatchEvent(new CustomEvent("entityselect", { detail: entity }));
  await flushPromises();
}

function userList(element) {
  return element.shadowRoot.querySelector("c-access-explorer-search-list");
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

  it("shows only the picker until an entity is chosen", async () => {
    const element = await createView();
    expect(
      element.shadowRoot.querySelector("c-access-explorer-entity-picker")
    ).not.toBeNull();
    expect(element.shadowRoot.querySelector("lightning-layout")).toBeNull();
    expect(getUsersWithAccess).not.toHaveBeenCalled();
  });

  it("lists users with access in the left column", async () => {
    const element = await createView();
    await selectEntity(element);

    expect(getUsersWithAccess).toHaveBeenCalledWith({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      searchTerm: ""
    });
    expect(
      element.shadowRoot.querySelector(".entity-heading").textContent.trim()
    ).toBe("Users with access to field Industry");
    const columns = element.shadowRoot.querySelectorAll(
      "lightning-layout-item"
    );
    expect(columns).toHaveLength(2);
    columns.forEach((column) => expect(column.mediumDeviceSize).toBe("6"));

    const list = userList(element);
    expect(list.items).toEqual([
      {
        id: "005000000000001AAA",
        label: "Alice Adams",
        description: "alice@example.com • Standard User"
      },
      {
        id: "005000000000002AAA",
        label: "Bob Brown",
        description: "bob@example.com"
      }
    ]);
    expect(list.truncated).toBe(true);
    expect(
      element.shadowRoot.querySelector("c-access-explorer-entity-picker")
        .selectedKey
    ).toBe("Account.Industry");
  });

  it("passes the selected user and entity to the source list", async () => {
    const element = await createView();
    await selectEntity(element);

    userList(element).dispatchEvent(
      new CustomEvent("select", { detail: { id: "005000000000002AAA" } })
    );
    await flushPromises();

    const sources = element.shadowRoot.querySelector(
      "c-access-explorer-source-list"
    );
    expect(sources.userId).toBe("005000000000002AAA");
    expect(sources.userName).toBe("Bob Brown");
    expect(sources.entityType).toBe("FIELD");
    expect(sources.entityKey).toBe("Account.Industry");
    expect(sources.entityLabel).toBe("Industry");
    expect(userList(element).selectedId).toBe("005000000000002AAA");

    userList(element).dispatchEvent(
      new CustomEvent("select", { detail: { id: "missing" } })
    );
    await flushPromises();
    expect(sources.userId).toBe("005000000000002AAA");
  });

  it("filters users by search term", async () => {
    const element = await createView();
    await selectEntity(element);
    userList(element).dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "ali" } })
    );
    await flushPromises();
    expect(getUsersWithAccess).toHaveBeenLastCalledWith({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      searchTerm: "ali"
    });
  });

  it("resets the user selection when the entity changes", async () => {
    const element = await createView();
    await selectEntity(element);
    userList(element).dispatchEvent(
      new CustomEvent("select", { detail: { id: "005000000000001AAA" } })
    );
    await flushPromises();

    await selectEntity(element, {
      entityType: "SOBJECT_TYPE",
      key: "Account",
      label: "Account"
    });
    const sources = element.shadowRoot.querySelector(
      "c-access-explorer-source-list"
    );
    expect(sources.userId).toBeUndefined();
    expect(sources.entityKey).toBe("Account");
    expect(
      element.shadowRoot.querySelector(".entity-heading").textContent.trim()
    ).toBe("Users with access to object Account");
  });

  it("shows errors loading users", async () => {
    getUsersWithAccess.mockRejectedValue({
      body: { message: "Unknown field." }
    });
    const element = await createView();
    await selectEntity(element);
    const alert = element.shadowRoot.querySelector(".users-error");
    expect(alert.textContent.trim()).toBe("Unknown field.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(userList(element).items).toEqual([]);
    expect(userList(element).truncated).toBe(false);
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
    userList(element).dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "nobody" } })
    );
    await flushPromises();
    resolveFirst(USERS_RESULT);
    await flushPromises();
    expect(userList(element).items).toEqual([]);
    expect(userList(element).loading).toBe(false);
  });
});
