import { LightningElement } from "lwc";

const TAB_USER = "user";
const TAB_ENTITY = "entity";

/**
 * Access Explorer entry point: "By User" and "By Entity" tabs.
 *
 * The current tab and selections are held in memory only, so reloading the page
 * starts fresh. Each view reports changes through "selectionchange"; cross-links
 * ("viewuser" / "viewentity") switch tabs and carry the selection across.
 */
export default class AccessExplorer extends LightningElement {
  state = {};
  refreshing = false;

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
