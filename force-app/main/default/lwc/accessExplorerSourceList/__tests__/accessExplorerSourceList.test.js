import { createElement } from "lwc";
import AccessExplorerSourceList from "c/accessExplorerSourceList";
import getAccessSources from "@salesforce/apex/AccessExplorerUserController.getAccessSources";
import { refreshApex } from "@salesforce/apex";

const SOURCES = require("./data/sources.json");

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

const SELECTION = {
  userId: "005000000000001AAA",
  userName: "Alice Adams",
  entityType: "SOBJECT_TYPE",
  entityKey: "Account",
  entityLabel: "Account"
};

function createSourceList(props = SELECTION) {
  const element = createElement("c-access-explorer-source-list", {
    is: AccessExplorerSourceList
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("c-access-explorer-source-list", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows a placeholder until a user and entity are selected", () => {
    const element = createSourceList({ userId: SELECTION.userId });
    expect(element.shadowRoot.querySelector(".placeholder")).not.toBeNull();
    expect(element.shadowRoot.querySelector(".subject")).toBeNull();
    expect(element.shadowRoot.querySelector('[data-id="copy"]').disabled).toBe(
      true
    );
  });

  it("requests sources for the selection and shows a spinner while loading", async () => {
    const element = createSourceList();
    await Promise.resolve();
    expect(getAccessSources.getLastConfig()).toEqual({
      userId: SELECTION.userId,
      entityType: "SOBJECT_TYPE",
      entityKey: "Account"
    });
    expect(element.shadowRoot.querySelector(".subject-user").textContent).toBe(
      "Alice Adams"
    );
    expect(
      element.shadowRoot.querySelector(".subject-entity").textContent
    ).toBe("Object: Account");
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();
  });

  it("renders each source with a type badge, permission badges and a safe link", async () => {
    const element = createSourceList();
    getAccessSources.emit(SOURCES);
    await Promise.resolve();

    const items = element.shadowRoot.querySelectorAll("li.source");
    expect(items).toHaveLength(4);
    expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();

    const profileLink = items[0].querySelector("a.source-link");
    expect(profileLink.getAttribute("href")).toBe(
      "/lightning/setup/EnhancedProfiles/page?address=%2F00e000000000001AAA"
    );
    expect(profileLink.getAttribute("target")).toBe("_blank");
    expect(profileLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(profileLink.querySelector(".slds-assistive-text").textContent).toBe(
      "(opens in a new window)"
    );
    expect(items[0].querySelector(".type-badge").textContent).toBe("Profile");
    expect(
      items[0].querySelector("c-access-explorer-permission-badges").permissions
    ).toEqual(["Read", "Edit"]);
    expect(items[0].querySelector(".details")).toBeNull();

    expect(items[1].querySelector("a.source-link").getAttribute("href")).toBe(
      "/lightning/setup/PermSetGroups/page?address=%2F0PG000000000001AAA"
    );
    expect(items[1].querySelector(".via").textContent).toBe(
      "Via Case Access, Service Basics"
    );

    expect(items[2].querySelector("a.source-link").getAttribute("href")).toBe(
      "/lightning/setup/PermSets/page?address=%2F0PS000000000001AAA"
    );
    expect(items[2].querySelector(".implied").textContent).toBe(
      "Implied by View All Data permission"
    );
    expect(items[2].querySelector(".session-note")).not.toBeNull();

    // Unknown types or malformed ids never become links.
    expect(items[3].querySelector("a")).toBeNull();
    expect(items[3].querySelector(".source-name").textContent).toBe(
      "Mystery Source"
    );
    expect(items[3].querySelector(".type-badge").textContent).toBe("Unknown");
  });

  it("copies a plain-text summary to the clipboard", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });
    const element = createSourceList();
    const toastHandler = jest.fn();
    element.addEventListener("lightning__showtoast", toastHandler);
    getAccessSources.emit(SOURCES);
    await Promise.resolve();

    const copy = element.shadowRoot.querySelector('[data-id="copy"]');
    expect(copy.disabled).toBe(false);
    copy.click();
    await flushPromises();

    expect(writeText.mock.calls[0][0].split("\n")).toEqual([
      "How Alice Adams gets access to Object Account:",
      "- Profile: Standard User — Read, Edit",
      "- Permission Set Group: Support Bundle — Read (via Case Access, Service Basics)",
      "- Permission Set: Sales Extras — Read, View All Records (implied by View All Data) (session-based)",
      "- Unknown: Mystery Source — "
    ]);
    expect(toastHandler.mock.calls[0][0].detail.variant).toBe("success");
  });

  it("reports clipboard failures", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn(() => Promise.reject(new Error("no"))) },
      configurable: true
    });
    const element = createSourceList();
    const toastHandler = jest.fn();
    element.addEventListener("lightning__showtoast", toastHandler);
    getAccessSources.emit(SOURCES);
    await Promise.resolve();

    element.shadowRoot.querySelector('[data-id="copy"]').click();
    await flushPromises();
    expect(toastHandler.mock.calls[0][0].detail.variant).toBe("error");
  });

  it("refreshes the wired sources", async () => {
    const element = createSourceList();
    getAccessSources.emit(SOURCES);
    await Promise.resolve();
    await element.refresh();
    expect(refreshApex).toHaveBeenCalledTimes(1);
    expect(refreshApex.mock.calls[0][0].data).toEqual(SOURCES);
  });

  it("shows an empty message when nothing grants access", async () => {
    const element = createSourceList();
    getAccessSources.emit([]);
    await Promise.resolve();
    expect(element.shadowRoot.querySelector(".empty-message")).not.toBeNull();
  });

  it("shows errors in an alert", async () => {
    const element = createSourceList();
    getAccessSources.error({ message: "Access denied" });
    await Promise.resolve();
    const alert = element.shadowRoot.querySelector(".error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent.trim()).toBe("Access denied");
  });

  it("clears previous results when the selection changes", async () => {
    const element = createSourceList();
    getAccessSources.emit(SOURCES);
    await Promise.resolve();
    expect(element.shadowRoot.querySelectorAll("li.source")).toHaveLength(4);

    element.entityKey = "Contact";
    element.entityLabel = undefined;
    await Promise.resolve();
    expect(element.shadowRoot.querySelectorAll("li.source")).toHaveLength(0);
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".subject-entity").textContent
    ).toBe("Object: Contact");

    element.userId = "005000000000002AAA";
    element.entityType = "FIELD";
    element.userName = undefined;
    await Promise.resolve();
    expect(element.shadowRoot.querySelector(".subject-user").textContent).toBe(
      "this user"
    );
  });
});
