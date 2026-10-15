import { createElement } from "lwc";
import AccessExplorer from "c/accessExplorer";

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

const USER_ID = "005000000000001AAA";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createExplorer() {
  const element = createElement("c-access-explorer", { is: AccessExplorer });
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
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

  it("starts with nothing selected", async () => {
    const element = await createExplorer();
    expect($(element, "c-access-explorer-user-view").selection).toEqual({
      userId: undefined,
      entityType: undefined,
      entityKey: undefined,
      entityLabel: undefined
    });
    expect($(element, "c-access-explorer-entity-view").selection).toEqual({
      entityType: undefined,
      entityKey: undefined,
      entityLabel: undefined,
      userId: undefined
    });
  });

  it("passes view selections back down and switches to the reporting tab", async () => {
    const element = await createExplorer();

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
    expect($(element, "c-access-explorer-user-view").selection).toEqual({
      userId: USER_ID,
      entityType: "SOBJECT_TYPE",
      entityKey: "Account",
      entityLabel: "Account"
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
    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
    expect($(element, "c-access-explorer-entity-view").selection).toEqual({
      entityType: "TAB",
      entityKey: "standard-Account",
      entityLabel: "Accounts",
      userId: undefined
    });
  });

  it("switches tabs from cross-links, carrying the selection across", async () => {
    const element = await createExplorer();
    $(element, "c-access-explorer-user-view").dispatchEvent(
      new CustomEvent("selectionchange", { detail: { userId: USER_ID } })
    );
    await flushPromises();

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

  it("tracks tab switches", async () => {
    const element = await createExplorer();
    const tabs = element.shadowRoot.querySelectorAll("lightning-tab");

    tabs[0].dispatchEvent(new CustomEvent("active"));
    await flushPromises();
    expect($(element, "lightning-tabset").activeTabValue).toBe("user");

    tabs[1].dispatchEvent(new CustomEvent("active"));
    await flushPromises();
    expect($(element, "lightning-tabset").activeTabValue).toBe("entity");
  });

  describe("viewport fitting", () => {
    let observed;
    let disconnect;
    let wide;

    beforeEach(() => {
      observed = [];
      disconnect = jest.fn();
      wide = true;
      window.ResizeObserver = jest.fn((callback) => ({
        observe: (target) => observed.push({ target, callback }),
        disconnect
      }));
      window.matchMedia = jest.fn(() => ({ matches: wide }));
      Object.defineProperty(window, "innerHeight", {
        value: 900,
        configurable: true
      });
    });

    afterEach(() => {
      delete window.ResizeObserver;
      delete window.matchMedia;
    });

    function paneHeight(element) {
      return element.style.getPropertyValue("--ae-pane-height");
    }

    function mockCardBottom(element, bottom) {
      element.getBoundingClientRect = () => ({ height: 500, bottom });
    }

    it("starts from an estimate and shrinks the panes when the card overshoots", async () => {
      const element = await createExplorer();
      expect(paneHeight(element)).toBe("724px");

      mockCardBottom(element, 1000);
      observed[0].callback();
      // Card must end at 900 - 12; it overshoots by 112.
      expect(paneHeight(element)).toBe("612px");
      expect(observed[0].target).toBe(element);
    });

    it("grows the panes when the card stops short and never goes below the minimum", async () => {
      const element = await createExplorer();
      mockCardBottom(element, 788);
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("824px");

      mockCardBottom(element, 5000);
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("416px");
    });

    it("leaves the height alone when hidden, stacked, or already fitted", async () => {
      const element = await createExplorer();
      element.getBoundingClientRect = () => ({ height: 0, bottom: 0 });
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("724px");

      wide = false;
      mockCardBottom(element, 2000);
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("724px");

      wide = true;
      mockCardBottom(element, 888);
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("724px");
    });

    it("stops listening when removed", async () => {
      const element = await createExplorer();
      document.body.removeChild(element);
      expect(disconnect).toHaveBeenCalled();
      mockCardBottom(element, 1000);
      window.dispatchEvent(new CustomEvent("resize"));
      expect(paneHeight(element)).toBe("724px");
    });
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
