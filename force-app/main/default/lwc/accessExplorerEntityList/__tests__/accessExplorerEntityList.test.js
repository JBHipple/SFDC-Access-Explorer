import { createElement } from "lwc";
import AccessExplorerEntityList from "c/accessExplorerEntityList";
import getUserFields from "@salesforce/apex/AccessExplorerUserController.getUserFields";

const OBJECT_ITEMS = require("./data/objectItems.json");
const ACCOUNT_FIELDS = require("./data/accountFields.json");
const PERMISSION_ITEMS = [
  {
    entityType: "SYSTEM_PERMISSION",
    key: "PermissionsApiEnabled",
    label: "API Enabled",
    apiName: "PermissionsApiEnabled",
    summary: "Enabled",
    hasChildren: false
  }
];

jest.mock(
  "@salesforce/apex/AccessExplorerUserController.getUserFields",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const USER_ID = "005000000000001AAA";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createList(props = {}) {
  const element = createElement("c-access-explorer-entity-list", {
    is: AccessExplorerEntityList
  });
  Object.assign(element, { items: OBJECT_ITEMS, userId: USER_ID }, props);
  document.body.appendChild(element);
  return element;
}

function objectToggle(element, key) {
  return element.shadowRoot.querySelector(
    `button.object-toggle[data-key="${key}"]`
  );
}

function entityButton(element, key) {
  return element.shadowRoot.querySelector(
    `button.entity-button[data-key="${key}"]`
  );
}

describe("c-access-explorer-entity-list", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders rows with labels, API names and permission badges", () => {
    const element = createList();

    const invoice = entityButton(element, "Invoice__c");
    expect(invoice.querySelector(".entity-label").textContent).toBe("Invoice");
    expect(invoice.querySelector(".entity-api-name").textContent).toBe(
      "Invoice__c"
    );
    expect(
      invoice.querySelector("c-access-explorer-permission-badges").summary
    ).toBe("Read");
    // API name is hidden when it equals the label.
    expect(
      entityButton(element, "Account").querySelector(".entity-api-name")
    ).toBeNull();
    expect(objectToggle(element, "Account").getAttribute("aria-label")).toBe(
      "Show fields for Account"
    );
  });

  it("does not offer field expansion for non-object items", () => {
    const element = createList({ items: PERMISSION_ITEMS });
    expect(element.shadowRoot.querySelector(".object-toggle")).toBeNull();
    expect(element.shadowRoot.querySelector(".toggle-spacer")).not.toBeNull();
  });

  it("shows the empty message when there are no items", () => {
    const element = createList({ items: [], emptyMessage: "Nothing here." });
    expect(
      element.shadowRoot.querySelector(".empty-message").textContent.trim()
    ).toBe("Nothing here.");
  });

  it("fires entityselect and marks the selected row", async () => {
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("entityselect", handler);

    entityButton(element, "Account").click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      entityType: "SOBJECT_TYPE",
      key: "Account",
      label: "Account"
    });

    element.selectedType = "SOBJECT_TYPE";
    element.selectedKey = "Account";
    await Promise.resolve();
    const button = entityButton(element, "Account");
    expect(button.getAttribute("aria-current")).toBe("true");
    expect(button.closest(".row").classList).toContain("is-selected");
    expect(
      entityButton(element, "Invoice__c").getAttribute("aria-current")
    ).toBe("false");
  });

  it("lazy-loads fields once when an object is expanded", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    const toggle = objectToggle(element, "Account");

    toggle.click();
    await Promise.resolve();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      element.shadowRoot.querySelector("lightning-spinner")
    ).not.toBeNull();

    await flushPromises();
    expect(getUserFields).toHaveBeenCalledWith({
      userId: USER_ID,
      objectName: "Account"
    });
    expect(
      entityButton(element, "Account.Industry").querySelector(
        "c-access-explorer-permission-badges"
      ).summary
    ).toBe("Read, Edit");
    expect(toggle.getAttribute("aria-label")).toBe("Hide fields for Account");

    toggle.click();
    await Promise.resolve();
    expect(entityButton(element, "Account.Industry")).toBeNull();
    toggle.click();
    await flushPromises();
    expect(getUserFields).toHaveBeenCalledTimes(1);
    expect(entityButton(element, "Account.Industry")).not.toBeNull();
  });

  it("fires entityselect for fields and highlights the selected field", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    const handler = jest.fn();
    element.addEventListener("entityselect", handler);

    objectToggle(element, "Account").click();
    await flushPromises();
    entityButton(element, "Account.Rating").click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      entityType: "FIELD",
      key: "Account.Rating",
      label: "Rating"
    });

    element.selectedType = "FIELD";
    element.selectedKey = "Account.Rating";
    await Promise.resolve();
    expect(
      entityButton(element, "Account.Rating").getAttribute("aria-current")
    ).toBe("true");
  });

  it("shows field errors and empty field lists", async () => {
    getUserFields
      .mockRejectedValueOnce({ body: { message: "Fields failed" } })
      .mockResolvedValueOnce([]);
    const element = createList();

    objectToggle(element, "Account").click();
    objectToggle(element, "Invoice__c").click();
    await flushPromises();

    const error = element.shadowRoot.querySelector(".fields-error");
    expect(error.textContent.trim()).toBe("Fields failed");
    expect(error.getAttribute("role")).toBe("alert");
    expect(element.shadowRoot.querySelector(".fields-empty")).not.toBeNull();
  });

  it("reloads expanded objects on refresh", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    objectToggle(element, "Account").click();
    await flushPromises();

    element.refresh();
    await flushPromises();
    expect(getUserFields).toHaveBeenCalledTimes(2);
    expect(entityButton(element, "Account.Industry")).not.toBeNull();
  });

  it("resets loaded fields when the user changes", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    objectToggle(element, "Account").click();
    await flushPromises();

    element.userId = "005000000000002AAA";
    await Promise.resolve();
    expect(entityButton(element, "Account.Industry")).toBeNull();
    expect(objectToggle(element, "Account").getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("discards field responses that arrive after the user changed", async () => {
    let resolveFields;
    let rejectFields;
    getUserFields
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFields = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve, reject) => {
          rejectFields = reject;
        })
      );
    const element = createList();
    objectToggle(element, "Account").click();
    objectToggle(element, "Invoice__c").click();
    element.userId = "005000000000002AAA";
    resolveFields(ACCOUNT_FIELDS);
    rejectFields({ body: { message: "late" } });
    await flushPromises();

    expect(element.shadowRoot.querySelector(".fields")).toBeNull();
  });
});
