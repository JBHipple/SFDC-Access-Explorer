import { createElement } from "lwc";
import AccessExplorer from "c/accessExplorer";
import { CurrentPageReference } from "lightning/navigation";

const mockNavigate = jest.fn();

jest.mock(
  "lightning/navigation",
  () => {
    const {
      createTestWireAdapter
    } = require("@salesforce/wire-service-jest-util");
    const Navigate = Symbol("Navigate");
    const NavigationMixin = (Base) =>
      class extends Base {
        [Navigate](...args) {
          mockNavigate(...args);
        }
      };
    NavigationMixin.Navigate = Navigate;
    return {
      CurrentPageReference: createTestWireAdapter(jest.fn()),
      NavigationMixin
    };
  },
  { virtual: true }
);

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
  "@salesforce/apex/AccessExplorerEntityController.searchEntities",
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerEntityController.getUsersWithAccess",
  () => ({ default: jest.fn(() => Promise.resolve({ users: [] })) }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex",
  () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

const TAB_PAGE = {
  type: "standard__navItemPage",
  attributes: { apiName: "Access_Explorer" },
  state: {}
};
const USER_ID = "005000000000001AAA";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createExplorer(pageRef = TAB_PAGE) {
  const element = createElement("c-access-explorer", { is: AccessExplorer });
  document.body.appendChild(element);
  if (pageRef) {
    CurrentPageReference.emit(pageRef);
  }
  await flushPromises();
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function lastNavigationState() {
  return mockNavigate.mock.calls[mockNavigate.mock.calls.length - 1][0].state;
}

describe("c-access-explorer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders a card with a refresh action and By User / By Entity tabs", async () => {
    const element = await createExplorer();

    expect($(element, "lightning-card").title).toBe("Access Explorer");
    expect($(element, ".refresh").alternativeText).toBe("Refresh access data");
    const tabs = [...element.shadowRoot.querySelectorAll("lightning-tab")];
    expect(tabs.map((tab) => tab.label)).toEqual(["By User", "By Entity"]);
    expect($(element, "lightning-tabset").activeTabValue).toBe("user");
    expect(tabs[0].querySelector("c-access-explorer-user-view")).not.toBeNull();
    expect(
      tabs[1].querySelector("c-access-explorer-entity-view")
    ).not.toBeNull();
  });

  it("restores tabs and selections from the URL", async () => {
    const element = await createExplorer({
      ...TAB_PAGE,
      state: {
        c__tab: "entity",
        c__user: USER_ID,
        c__uType: "APEX_CLASS",
        c__uKey: "01p000000000001AAA",
        c__uLabel: "MyController",
        c__eType: "FIELD",
        c__eKey: "Account.Industry",
        c__eLabel: "Industry",
        c__eUser: USER_ID
      }
    });

    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
    expect($(element, "c-access-explorer-user-view").selection).toEqual({
      userId: USER_ID,
      entityType: "APEX_CLASS",
      entityKey: "01p000000000001AAA",
      entityLabel: "MyController"
    });
    expect($(element, "c-access-explorer-entity-view").selection).toEqual({
      entityType: "FIELD",
      entityKey: "Account.Industry",
      entityLabel: "Industry",
      userId: USER_ID
    });
  });

  it("writes view selections to the URL", async () => {
    const element = await createExplorer({
      ...TAB_PAGE,
      state: { other: "kept" }
    });

    $(element, "c-access-explorer-user-view").dispatchEvent(
      new CustomEvent("selectionchange", {
        detail: {
          userId: USER_ID,
          entityType: "SOBJECT_TYPE",
          entityKey: "Account",
          entityLabel: "Account"
        }
      })
    );
    await flushPromises();
    expect(mockNavigate.mock.calls[0][0].type).toBe("standard__navItemPage");
    expect(lastNavigationState()).toEqual({
      other: "kept",
      c__user: USER_ID,
      c__uType: "SOBJECT_TYPE",
      c__uKey: "Account",
      c__uLabel: "Account"
    });

    $(element, "c-access-explorer-entity-view").dispatchEvent(
      new CustomEvent("selectionchange", {
        detail: {
          entityType: "TAB",
          entityKey: "standard-Account",
          entityLabel: "Accounts"
        }
      })
    );
    await flushPromises();
    expect(lastNavigationState()).toMatchObject({
      c__tab: "entity",
      c__eType: "TAB",
      c__eKey: "standard-Account",
      c__eLabel: "Accounts"
    });
    expect(lastNavigationState().c__eUser).toBeUndefined();
    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
  });

  it("does not navigate when nothing changed", async () => {
    const element = await createExplorer();
    $(element, "c-access-explorer-user-view").dispatchEvent(
      new CustomEvent("selectionchange", { detail: {} })
    );
    await flushPromises();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("switches tabs from cross-links, carrying the selection across", async () => {
    const element = await createExplorer({
      ...TAB_PAGE,
      state: { c__user: USER_ID }
    });

    $(element, "c-access-explorer-user-view").dispatchEvent(
      new CustomEvent("viewentity", {
        detail: { entityType: "SOBJECT_TYPE", key: "Account", label: "Account" }
      })
    );
    await flushPromises();
    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
    expect($(element, "c-access-explorer-entity-view").selection).toEqual({
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      entityLabel: "Account",
      userId: USER_ID
    });

    $(element, "c-access-explorer-entity-view").dispatchEvent(
      new CustomEvent("viewuser", {
        detail: { userId: "005000000000002AAA" }
      })
    );
    await flushPromises();
    expect($(element, "lightning-tabset").activeTabValue).toBe("user");
    expect($(element, "c-access-explorer-user-view").selection).toEqual({
      userId: "005000000000002AAA",
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      entityLabel: "Account"
    });
  });

  it("records tab switches", async () => {
    const element = await createExplorer();
    const tabs = element.shadowRoot.querySelectorAll("lightning-tab");

    tabs[0].dispatchEvent(new CustomEvent("active"));
    await flushPromises();
    expect(mockNavigate).not.toHaveBeenCalled();

    tabs[1].dispatchEvent(new CustomEvent("active"));
    await flushPromises();
    expect(lastNavigationState()).toEqual({ c__tab: "entity" });
  });

  it("keeps state locally on pages that do not support URL state", async () => {
    const element = await createExplorer({
      type: "standard__namedPage",
      attributes: { pageName: "home" },
      state: {}
    });
    $(element, "c-access-explorer-user-view").dispatchEvent(
      new CustomEvent("viewentity", {
        detail: { entityType: "APP", key: "02u000000000001AAA", label: "Sales" }
      })
    );
    await flushPromises();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
  });

  it("refreshes the active view", async () => {
    const element = await createExplorer();
    const userView = $(element, "c-access-explorer-user-view");
    const entityView = $(element, "c-access-explorer-entity-view");
    const userRefresh = jest
      .spyOn(userView, "refresh")
      .mockResolvedValue(undefined);
    const entityRefresh = jest
      .spyOn(entityView, "refresh")
      .mockResolvedValue(undefined);

    $(element, ".refresh").click();
    await flushPromises();
    expect(userRefresh).toHaveBeenCalledTimes(1);
    expect(entityRefresh).not.toHaveBeenCalled();
    expect($(element, ".refresh").disabled).toBe(false);

    element.shadowRoot
      .querySelectorAll("lightning-tab")[1]
      .dispatchEvent(new CustomEvent("active"));
    await flushPromises();
    $(element, ".refresh").click();
    await flushPromises();
    expect(entityRefresh).toHaveBeenCalledTimes(1);
  });
});
