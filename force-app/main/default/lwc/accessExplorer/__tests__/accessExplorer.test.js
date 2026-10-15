import { createElement } from "lwc";
import AccessExplorer from "c/accessExplorer";

jest.mock(
  "@salesforce/apex/AccessExplorerUserController.searchUsers",
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
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
  "@salesforce/apex/AccessExplorerUserController.getAccessSources",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/AccessExplorerEntityController.searchEntities",
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);

describe("c-access-explorer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders a card with By User and By Entity tabs", () => {
    const element = createElement("c-access-explorer", { is: AccessExplorer });
    document.body.appendChild(element);

    const card = element.shadowRoot.querySelector("lightning-card");
    expect(card.title).toBe("Access Explorer");

    const tabs = [...element.shadowRoot.querySelectorAll("lightning-tab")];
    expect(tabs.map((tab) => tab.label)).toEqual(["By User", "By Entity"]);
    expect(tabs[0].querySelector("c-access-explorer-user-view")).not.toBeNull();
    expect(
      tabs[1].querySelector("c-access-explorer-entity-view")
    ).not.toBeNull();
  });
});
