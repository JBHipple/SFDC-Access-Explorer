import { createElement } from "lwc";
import AccessExplorerPermissionBadges from "c/accessExplorerPermissionBadges";

function createBadges(props) {
  const element = createElement("c-access-explorer-permission-badges", {
    is: AccessExplorerPermissionBadges
  });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function badgeTexts(element) {
  return [...element.shadowRoot.querySelectorAll(".badge")].map(
    (badge) => badge.textContent
  );
}

describe("c-access-explorer-permission-badges", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("abbreviates known object permissions from a list", () => {
    const element = createBadges({
      permissions: [
        "Read",
        "Create",
        "Edit",
        "Delete",
        "View All Records",
        "Modify All Records",
        "View All Fields"
      ]
    });
    expect(badgeTexts(element)).toEqual(["R", "C", "E", "D", "VA", "MA", "VF"]);
    expect(element.shadowRoot.querySelectorAll(".badge_short").length).toBe(7);
    // Full names are available to screen readers and as a tooltip.
    const description =
      "Read, Create, Edit, Delete, View All Records, Modify All Records, View All Fields";
    expect(
      element.shadowRoot.querySelector(".slds-assistive-text").textContent
    ).toBe(description);
    expect(element.shadowRoot.querySelector(".badges").title).toBe(description);
    expect(
      element.shadowRoot.querySelector(".entry").getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("parses summaries and shows other permissions in full", () => {
    const element = createBadges({ summary: "Read, Edit" });
    expect(badgeTexts(element)).toEqual(["R", "E"]);

    const other = createBadges({ summary: "Visible" });
    expect(badgeTexts(other)).toEqual(["Visible"]);
    expect(other.shadowRoot.querySelector(".badge_short")).toBeNull();
  });

  it("shows qualifiers as a via note", () => {
    const element = createBadges({ summary: "Read (View All Fields)" });
    expect(badgeTexts(element)).toEqual(["R"]);
    expect(element.shadowRoot.querySelector(".note").textContent).toBe(
      "via View All Fields"
    );
    expect(
      element.shadowRoot.querySelector(".slds-assistive-text").textContent
    ).toBe("Read via View All Fields");
  });

  it("renders nothing without permissions", () => {
    expect(createBadges({}).shadowRoot.querySelector(".badges")).toBeNull();
    expect(
      createBadges({ summary: " , " }).shadowRoot.querySelector(".badges")
    ).toBeNull();
    expect(
      createBadges({ permissions: [] }).shadowRoot.querySelector(".badges")
    ).toBeNull();
  });
});
