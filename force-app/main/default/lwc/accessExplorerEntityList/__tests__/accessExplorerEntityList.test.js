import { createElement } from "lwc";
import AccessExplorerEntityList from "c/accessExplorerEntityList";
import getUserFields from "@salesforce/apex/AccessExplorerUserController.getUserFields";

const ENTITY_GROUPS = require("./data/entityGroups.json");
const ACCOUNT_FIELDS = require("./data/accountFields.json");

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
  Object.assign(element, { groups: ENTITY_GROUPS, userId: USER_ID }, props);
  document.body.appendChild(element);
  return element;
}

function groupToggle(element, entityType) {
  return element.shadowRoot.querySelector(
    `button.group-toggle[data-type="${entityType}"]`
  );
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

  it("renders groups with counts, objects expanded by default", () => {
    const element = createList();

    const objects = groupToggle(element, "SOBJECT_TYPE");
    expect(objects.getAttribute("aria-expanded")).toBe("true");
    expect(objects.querySelector(".group-count").textContent).toBe("2");
    expect(
      groupToggle(element, "SYSTEM_PERMISSION").getAttribute("aria-expanded")
    ).toBe("false");
    expect(entityButton(element, "Account").textContent).toContain(
      "Read, Edit"
    );
    expect(entityButton(element, "PermissionsApiEnabled")).toBeNull();
  });

  it("toggles groups open and closed", async () => {
    const element = createList();
    const toggle = groupToggle(element, "SYSTEM_PERMISSION");

    toggle.click();
    await Promise.resolve();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(entityButton(element, "PermissionsApiEnabled")).not.toBeNull();

    toggle.click();
    await Promise.resolve();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows an empty message for groups without access", async () => {
    const element = createList();
    groupToggle(element, "APEX_CLASS").click();
    await Promise.resolve();
    const section = element.shadowRoot.querySelector(
      'section[data-type="APEX_CLASS"]'
    );
    expect(section.querySelector(".empty-group")).not.toBeNull();
  });

  it("filters items across groups and opens matching groups", async () => {
    const element = createList();
    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "  api  ";
    input.dispatchEvent(new CustomEvent("change"));
    await Promise.resolve();

    expect(entityButton(element, "Account")).toBeNull();
    expect(entityButton(element, "PermissionsApiEnabled")).not.toBeNull();
    expect(
      groupToggle(element, "SOBJECT_TYPE").querySelector(".group-count")
        .textContent
    ).toBe("0");

    input.value = "permissionsapi";
    input.dispatchEvent(new CustomEvent("change"));
    await Promise.resolve();
    expect(entityButton(element, "PermissionsApiEnabled")).not.toBeNull();
  });

  it("fires entityselect and marks the selected item", async () => {
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
    expect(entityButton(element, "Account").getAttribute("aria-current")).toBe(
      "true"
    );
    expect(entityButton(element, "Account").classList).toContain("is-selected");
    expect(entityButton(element, "Contact").getAttribute("aria-current")).toBe(
      "false"
    );
  });

  it("lazy-loads fields once when an object is expanded", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    const toggle = objectToggle(element, "Account");
    expect(toggle.getAttribute("aria-label")).toBe("Show fields for Account");

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
    expect(entityButton(element, "Account.Industry").textContent).toContain(
      "Read, Edit"
    );
    expect(toggle.getAttribute("aria-label")).toBe("Hide fields for Account");

    // Collapse and expand again: served from memory.
    toggle.click();
    await Promise.resolve();
    expect(entityButton(element, "Account.Industry")).toBeNull();
    toggle.click();
    await flushPromises();
    expect(getUserFields).toHaveBeenCalledTimes(1);
    expect(entityButton(element, "Account.Industry")).not.toBeNull();
  });

  it("fires entityselect for fields", async () => {
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
  });

  it("shows field errors and empty field lists", async () => {
    getUserFields
      .mockRejectedValueOnce({ body: { message: "Fields failed" } })
      .mockResolvedValueOnce([]);
    const element = createList();

    objectToggle(element, "Account").click();
    objectToggle(element, "Contact").click();
    await flushPromises();

    const error = element.shadowRoot.querySelector(".fields-error");
    expect(error.textContent.trim()).toBe("Fields failed");
    expect(error.getAttribute("role")).toBe("alert");
    expect(element.shadowRoot.querySelector(".fields-empty")).not.toBeNull();
  });

  it("resets loaded fields when the user changes", async () => {
    getUserFields.mockResolvedValue(ACCOUNT_FIELDS);
    const element = createList();
    objectToggle(element, "Account").click();
    await flushPromises();
    expect(entityButton(element, "Account.Industry")).not.toBeNull();

    element.userId = "005000000000002AAA";
    await Promise.resolve();
    expect(entityButton(element, "Account.Industry")).toBeNull();
    expect(objectToggle(element, "Account").getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("discards field responses that arrive after the user changed", async () => {
    let resolveFields;
    getUserFields.mockReturnValue(
      new Promise((resolve) => {
        resolveFields = resolve;
      })
    );
    const element = createList();
    objectToggle(element, "Account").click();
    element.userId = "005000000000002AAA";
    resolveFields(ACCOUNT_FIELDS);
    await flushPromises();

    objectToggle(element, "Account").click();
    await Promise.resolve();
    expect(entityButton(element, "Account.Industry")).toBeNull();
  });

  it("shows a message when there are no groups", () => {
    const element = createList({ groups: [] });
    expect(element.shadowRoot.querySelector(".no-groups")).not.toBeNull();
  });
});
