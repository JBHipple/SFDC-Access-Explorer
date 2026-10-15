import { createElement } from "lwc";
import AccessExplorerUserView from "c/accessExplorerUserView";
import searchUsers from "@salesforce/apex/AccessExplorerUserController.searchUsers";
import getUserEntities from "@salesforce/apex/AccessExplorerUserController.getUserEntities";

jest.mock(
  "@salesforce/apex/AccessExplorerUserController.searchUsers",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUserEntities",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUserFields",
  () => ({ default: jest.fn() }),
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

const USERS = [
  {
    id: "005000000000001AAA",
    name: "Alice Adams",
    username: "alice@example.com",
    profileName: "Standard User",
    isActive: true
  },
  {
    id: "005000000000002AAA",
    name: "Bob Brown",
    username: "bob@example.com",
    isActive: true
  }
];
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
        hasChildren: true
      }
    ]
  }
];

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createView() {
  const element = createElement("c-access-explorer-user-view", {
    is: AccessExplorerUserView
  });
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function userList(element) {
  return element.shadowRoot.querySelector("c-access-explorer-search-list");
}

async function selectUser(element, id) {
  userList(element).dispatchEvent(
    new CustomEvent("select", { detail: { id } })
  );
  await flushPromises();
}

describe("c-access-explorer-user-view", () => {
  beforeEach(() => {
    searchUsers.mockResolvedValue(USERS);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("loads users on connect and maps them to list items", async () => {
    const element = await createView();

    expect(searchUsers).toHaveBeenCalledWith({ searchTerm: "", limitSize: 50 });
    expect(userList(element).items).toEqual([
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
    expect(userList(element).truncated).toBe(false);
    expect(element.shadowRoot.querySelector("lightning-layout")).toBeNull();
  });

  it("searches users", async () => {
    const element = await createView();
    userList(element).dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "bob" } })
    );
    await flushPromises();
    expect(searchUsers).toHaveBeenLastCalledWith({
      searchTerm: "bob",
      limitSize: 50
    });
  });

  it("flags a full page of users as truncated", async () => {
    searchUsers.mockResolvedValue(
      Array.from({ length: 50 }, (unused, index) => ({
        id: `005${String(index).padStart(15, "0")}`,
        name: `User ${index}`
      }))
    );
    const element = await createView();
    expect(userList(element).truncated).toBe(true);
  });

  it("shows two equal columns with entities and sources after selecting a user", async () => {
    const element = await createView();
    await selectUser(element, "005000000000001AAA");

    expect(
      element.shadowRoot.querySelector(".selected-user-heading").textContent
    ).toContain("Alice Adams");
    const columns = element.shadowRoot.querySelectorAll(
      "lightning-layout-item"
    );
    expect(columns).toHaveLength(2);
    columns.forEach((column) => {
      expect(column.size).toBe("12");
      expect(column.mediumDeviceSize).toBe("6");
    });
    expect(getUserEntities.getLastConfig()).toEqual({
      userId: "005000000000001AAA"
    });
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();

    getUserEntities.emit(GROUPS);
    await flushPromises();
    const entityList = element.shadowRoot.querySelector(
      "c-access-explorer-entity-list"
    );
    expect(entityList.groups).toEqual(GROUPS);
    expect(entityList.userId).toBe("005000000000001AAA");

    entityList.dispatchEvent(
      new CustomEvent("entityselect", {
        detail: { entityType: "SOBJECT_TYPE", key: "Account", label: "Account" }
      })
    );
    await flushPromises();
    const sourceList = element.shadowRoot.querySelector(
      "c-access-explorer-source-list"
    );
    expect(sourceList.userId).toBe("005000000000001AAA");
    expect(sourceList.userName).toBe("Alice Adams");
    expect(sourceList.entityType).toBe("SOBJECT_TYPE");
    expect(sourceList.entityKey).toBe("Account");
    expect(sourceList.entityLabel).toBe("Account");
    expect(entityList.selectedKey).toBe("Account");
  });

  it("resets the entity selection when a different user is chosen", async () => {
    const element = await createView();
    await selectUser(element, "005000000000001AAA");
    getUserEntities.emit(GROUPS);
    await flushPromises();
    element.shadowRoot
      .querySelector("c-access-explorer-entity-list")
      .dispatchEvent(
        new CustomEvent("entityselect", {
          detail: {
            entityType: "SOBJECT_TYPE",
            key: "Account",
            label: "Account"
          }
        })
      );
    await flushPromises();

    // Re-selecting the same user is a no-op.
    await selectUser(element, "005000000000001AAA");
    expect(
      element.shadowRoot.querySelector("c-access-explorer-source-list")
        .entityKey
    ).toBe("Account");

    await selectUser(element, "005000000000002AAA");
    expect(
      element.shadowRoot.querySelector("c-access-explorer-source-list")
        .entityKey
    ).toBeUndefined();
    expect(
      element.shadowRoot.querySelector("c-access-explorer-entity-list")
    ).toBeNull();

    // Unknown ids are ignored.
    await selectUser(element, "missing");
    expect(
      element.shadowRoot.querySelector(".selected-user-heading").textContent
    ).toContain("Bob Brown");
  });

  it("shows entity loading errors", async () => {
    const element = await createView();
    await selectUser(element, "005000000000001AAA");
    getUserEntities.error({ message: "Denied" });
    await flushPromises();
    const alert = element.shadowRoot.querySelector(".entities-error");
    expect(alert.textContent.trim()).toBe("Denied");
    expect(alert.getAttribute("role")).toBe("alert");
  });

  it("shows user search errors", async () => {
    searchUsers.mockRejectedValue({
      body: { message: "You do not have permission to use Access Explorer." }
    });
    const element = await createView();
    expect(
      element.shadowRoot.querySelector(".users-error").textContent.trim()
    ).toBe("You do not have permission to use Access Explorer.");
    expect(userList(element).items).toEqual([]);
    expect(userList(element).loading).toBe(false);
  });

  it("ignores stale search responses", async () => {
    let resolveFirst;
    searchUsers
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce([USERS[1]]);
    const element = createElement("c-access-explorer-user-view", {
      is: AccessExplorerUserView
    });
    document.body.appendChild(element);
    userList(element).dispatchEvent(
      new CustomEvent("search", { detail: { searchTerm: "bob" } })
    );
    await flushPromises();
    resolveFirst(USERS);
    await flushPromises();
    expect(userList(element).items).toHaveLength(1);
    expect(userList(element).items[0].label).toBe("Bob Brown");
  });
});
