import { LightningElement, wire } from "lwc";
import { CurrentPageReference, NavigationMixin } from "lightning/navigation";

const TAB_USER = "user";
const TAB_ENTITY = "entity";

/**
 * Explorer state and the URL parameters that hold it. Custom URL state on Lightning
 * pages must use the c__ prefix.
 */
const STATE_PARAMS = {
  tab: "c__tab",
  userId: "c__user",
  userEntityType: "c__uType",
  userEntityKey: "c__uKey",
  userEntityLabel: "c__uLabel",
  entityType: "c__eType",
  entityKey: "c__eKey",
  entityLabel: "c__eLabel",
  entityUserId: "c__eUser"
};

/** Page types where writing state to the URL is safe (Lightning tabs). */
const URL_SYNC_PAGE_TYPES = ["standard__navItemPage"];

/**
 * Access Explorer entry point: "By User" and "By Entity" tabs.
 *
 * The current tab and selections live in the URL, so views can be bookmarked,
 * shared, and navigated with the browser's Back button. Each view reports changes
 * through "selectionchange"; cross-links ("viewuser" / "viewentity") switch tabs.
 */
export default class AccessExplorer extends NavigationMixin(LightningElement) {
  pageRef;
  state = {};
  refreshing = false;

  @wire(CurrentPageReference)
  wiredPageRef(pageRef) {
    this.pageRef = pageRef;
    const urlState = (pageRef && pageRef.state) || {};
    const next = {};
    Object.entries(STATE_PARAMS).forEach(([key, param]) => {
      if (urlState[param]) {
        next[key] = urlState[param];
      }
    });
    this.state = next;
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
    // "By User" is the default tab; keep it out of the URL.
    if (next.tab === TAB_USER) {
      delete next.tab;
    }
    if (JSON.stringify(next) === JSON.stringify(this.state)) {
      return;
    }
    this.state = next;
    if (this.pageRef && URL_SYNC_PAGE_TYPES.includes(this.pageRef.type)) {
      const urlState = { ...(this.pageRef.state || {}) };
      Object.entries(STATE_PARAMS).forEach(([key, param]) => {
        if (next[key]) {
          urlState[param] = next[key];
        } else {
          delete urlState[param];
        }
      });
      this[NavigationMixin.Navigate]({ ...this.pageRef, state: urlState });
    }
  }
}
