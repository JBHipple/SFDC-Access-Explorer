import { LightningElement } from "lwc";

const TAB_USER = "user";
const TAB_ENTITY = "entity";

/** CSS variable the views use for the height of their three panes. */
const PANE_HEIGHT_VAR = "--ae-pane-height";
const MIN_PANE_HEIGHT_PX = 416;
/** Space left between the card and the bottom of the viewport. */
const BOTTOM_GAP_PX = 12;
/** First guess at the height above and below the panes, before measuring. */
const INITIAL_CHROME_PX = 176;
/** Matches the views' breakpoint; below it the panes stack and size to content. */
const SIDE_BY_SIDE_QUERY = "(min-width: 64em)";

/**
 * Access Explorer entry point: "By User" and "By Entity" tabs.
 *
 * The current tab and selections are held in memory only, so reloading the page
 * starts fresh. Each view reports changes through "selectionchange"; cross-links
 * ("viewuser" / "viewentity") switch tabs and carry the selection across.
 *
 * The panes are sized so the card ends at the bottom of the viewport: after each
 * layout change the card's overshoot (or shortfall) is taken off (or added to) the
 * pane height.
 */
export default class AccessExplorer extends LightningElement {
  state = {};
  refreshing = false;
  paneHeight;
  resizeObserver;
  boundFit = () => this.fitToViewport();

  connectedCallback() {
    this.setPaneHeight(
      Math.max(MIN_PANE_HEIGHT_PX, window.innerHeight - INITIAL_CHROME_PX)
    );
    window.addEventListener("resize", this.boundFit);
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(this.boundFit);
      this.resizeObserver.observe(this.template.host);
    }
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.boundFit);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  renderedCallback() {
    this.fitToViewport();
  }

  fitToViewport() {
    const rect = this.template.host.getBoundingClientRect();
    const sideBySide =
      !window.matchMedia || window.matchMedia(SIDE_BY_SIDE_QUERY).matches;
    if (!rect.height || !sideBySide) {
      return;
    }
    // Document-relative, so the result is the same however far the page is scrolled.
    const cardBottom = rect.bottom + window.scrollY;
    const overshoot = cardBottom - (window.innerHeight - BOTTOM_GAP_PX);
    const next = Math.max(
      MIN_PANE_HEIGHT_PX,
      Math.floor(this.paneHeight - overshoot)
    );
    if (Math.abs(next - this.paneHeight) >= 1) {
      this.setPaneHeight(next);
    }
  }

  setPaneHeight(px) {
    this.paneHeight = px;
    this.template.host.style.setProperty(PANE_HEIGHT_VAR, `${px}px`);
  }

  get activeTab() {
    return this.state.tab === TAB_ENTITY ? TAB_ENTITY : TAB_USER;
  }

  get userSelection() {
    return {
      userId: this.state.userId,
      entityType: this.state.userEntityType,
      entityKey: this.state.userEntityKey,
      entityLabel: this.state.userEntityLabel
    };
  }

  get entitySelection() {
    return {
      entityType: this.state.entityType,
      entityKey: this.state.entityKey,
      entityLabel: this.state.entityLabel,
      userId: this.state.entityUserId
    };
  }

  handleTabActive(event) {
    const tab = event.target.value;
    if (tab !== this.activeTab) {
      this.updateState({ tab });
    }
  }

  handleUserSelection(event) {
    const { userId, entityType, entityKey, entityLabel } = event.detail;
    this.updateState({
      tab: TAB_USER,
      userId,
      userEntityType: entityType,
      userEntityKey: entityKey,
      userEntityLabel: entityLabel
    });
  }

  handleEntitySelection(event) {
    const { entityType, entityKey, entityLabel, userId } = event.detail;
    this.updateState({
      tab: TAB_ENTITY,
      entityType,
      entityKey,
      entityLabel,
      entityUserId: userId
    });
  }

  /** From "By User": see everyone who has the selected access. */
  handleViewEntity(event) {
    const { entityType, key, label } = event.detail;
    this.updateState({
      tab: TAB_ENTITY,
      entityType,
      entityKey: key,
      entityLabel: label,
      entityUserId: this.state.userId
    });
  }

  /** From "By Entity": see everything the selected user can access. */
  handleViewUser(event) {
    this.updateState({
      tab: TAB_USER,
      userId: event.detail.userId,
      userEntityType: this.state.entityType,
      userEntityKey: this.state.entityKey,
      userEntityLabel: this.state.entityLabel
    });
  }

  async handleRefresh() {
    const view = this.template.querySelector(
      this.activeTab === TAB_ENTITY
        ? "c-access-explorer-entity-view"
        : "c-access-explorer-user-view"
    );
    if (!view) {
      return;
    }
    this.refreshing = true;
    try {
      await view.refresh();
    } finally {
      this.refreshing = false;
    }
  }

  updateState(changes) {
    const next = {};
    Object.entries({ ...this.state, ...changes }).forEach(([key, value]) => {
      if (value) {
        next[key] = value;
      }
    });
    this.state = next;
  }
}
