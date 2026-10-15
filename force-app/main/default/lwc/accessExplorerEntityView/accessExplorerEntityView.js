import { api, LightningElement } from "lwc";
import getUsersWithAccess from "@salesforce/apex/AccessExplorerEntityController.getUsersWithAccess";
import {
  downloadCsv,
  errorText,
  fileNamePart,
  getEntityTypeLabel,
  isSalesforceId
} from "c/accessExplorerUtils";

/**
 * "By Entity" view: pick an entity, list the users who can access it, and see which
 * profile / permission sets / groups grant a selected user that access.
 *
 * @api selection { entityType, entityKey, entityLabel, userId } lets the parent restore
 * state (deep links, cross-links).
 *
 * Events:
 *  - selectionchange: detail { entityType, entityKey, entityLabel, userId }
 *  - viewuser: detail { userId } (see everything this user can access)
 */
export default class AccessExplorerEntityView extends LightningElement {
  entity;
  selectedUserId;
  users = [];
  usersTruncated = false;
  usersLoading = false;
  usersError;
  searchTerm = "";
  searchRequest = 0;

  @api
  get selection() {
    return this.currentSelection();
  }
  set selection(value) {
    const next = value || {};
    const sameEntity =
      this.selectedKey === next.entityKey &&
      this.selectedType === next.entityType;
    if (!sameEntity) {
      this.entity =
        next.entityType && next.entityKey
          ? {
              entityType: next.entityType,
              key: next.entityKey,
              label: next.entityLabel || next.entityKey
            }
          : undefined;
      this.resetUsers();
    }
    this.selectedUserId = isSalesforceId(next.userId) ? next.userId : undefined;
  }

  /** Re-fetches the user list and the selected user's sources. */
  @api
  refresh() {
    const work = [];
    if (this.entity) {
      work.push(this.loadUsers(this.searchTerm));
    }
    const sources = this.template.querySelector(
      "c-access-explorer-source-list"
    );
    if (sources) {
      work.push(sources.refresh());
    }
    return Promise.all(work);
  }

  get hasEntity() {
    return !!this.entity;
  }

  get selectedType() {
    return this.entity ? this.entity.entityType : undefined;
  }

  get selectedKey() {
    return this.entity ? this.entity.key : undefined;
  }

  get selectedLabel() {
    return this.entity ? this.entity.label : undefined;
  }

  get entityTypeLabel() {
    return this.entity ? getEntityTypeLabel(this.entity.entityType) : "";
  }

  get usersHeading() {
    if (this.usersLoading || this.usersError) {
      return "Users with access";
    }
    return `Users with access (${this.users.length}${this.usersTruncated ? "+" : ""})`;
  }

  get userItems() {
    return this.users.map((user) => ({
      id: user.id,
      label: user.name,
      description: [user.username, user.profileName]
        .filter((part) => !!part)
        .join(" • ")
    }));
  }

  get selectedUserName() {
    const user = this.users.find(
      (candidate) => candidate.id === this.selectedUserId
    );
    return user ? user.name : undefined;
  }

  get exportDisabled() {
    return this.users.length === 0;
  }

  get viewUserDisabled() {
    return !this.selectedUserId;
  }

  currentSelection() {
    return {
      entityType: this.selectedType,
      entityKey: this.selectedKey,
      entityLabel: this.selectedLabel,
      userId: this.selectedUserId
    };
  }

  notifySelection() {
    this.dispatchEvent(
      new CustomEvent("selectionchange", { detail: this.currentSelection() })
    );
  }

  resetUsers() {
    this.users = [];
    this.usersTruncated = false;
    this.usersError = undefined;
    this.searchTerm = "";
    const userList = this.template.querySelector(".user-list");
    if (userList) {
      userList.clearSearch();
    }
    if (this.entity) {
      this.loadUsers("");
    }
  }

  async loadUsers(searchTerm) {
    const request = ++this.searchRequest;
    const { entityType, key } = this.entity;
    this.searchTerm = searchTerm;
    this.usersLoading = true;
    try {
      const result = await getUsersWithAccess({
        entityType,
        entityKey: key,
        searchTerm
      });
      if (request === this.searchRequest) {
        this.users = result.users || [];
        this.usersTruncated = !!result.truncated;
        this.usersError = undefined;
      }
    } catch (error) {
      if (request === this.searchRequest) {
        this.users = [];
        this.usersTruncated = false;
        this.usersError = errorText(error);
      }
    } finally {
      if (request === this.searchRequest) {
        this.usersLoading = false;
      }
    }
  }

  handleEntitySelect(event) {
    this.entity = { ...event.detail };
    this.selectedUserId = undefined;
    this.resetUsers();
    this.notifySelection();
  }

  handleUserSearch(event) {
    this.loadUsers(event.detail.searchTerm);
  }

  handleUserSelect(event) {
    const user = this.users.find(
      (candidate) => candidate.id === event.detail.id
    );
    if (user) {
      this.selectedUserId = user.id;
      this.notifySelection();
    }
  }

  handleViewUser() {
    if (this.selectedUserId) {
      this.dispatchEvent(
        new CustomEvent("viewuser", {
          detail: { userId: this.selectedUserId }
        })
      );
    }
  }

  handleExport() {
    downloadCsv(
      `users_with_access_${fileNamePart(this.selectedLabel)}.csv`,
      ["Name", "Username", "Profile", `${this.entityTypeLabel}`],
      this.users.map((user) => [
        user.name,
        user.username,
        user.profileName,
        this.selectedLabel
      ])
    );
  }
}
