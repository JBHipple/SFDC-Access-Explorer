import { LightningElement } from "lwc";
import getUsersWithAccess from "@salesforce/apex/AccessExplorerEntityController.getUsersWithAccess";
import { errorText, getEntityTypeLabel } from "c/accessExplorerUtils";

/**
 * "By Entity" view: pick an entity, list the users who can access it, and see which
 * profile / permission sets / groups grant a selected user that access.
 */
export default class AccessExplorerEntityView extends LightningElement {
  selectedEntity;
  users = [];
  usersTruncated = false;
  usersLoading = false;
  usersError;
  selectedUser;
  searchRequest = 0;

  get hasEntity() {
    return !!this.selectedEntity;
  }

  get entityHeading() {
    if (!this.selectedEntity) {
      return "";
    }
    return `Users with access to ${getEntityTypeLabel(
      this.selectedEntity.entityType
    ).toLowerCase()} ${this.selectedEntity.label}`;
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

  get selectedUserId() {
    return this.selectedUser ? this.selectedUser.id : undefined;
  }

  get selectedUserName() {
    return this.selectedUser ? this.selectedUser.name : undefined;
  }

  get selectedEntityType() {
    return this.selectedEntity ? this.selectedEntity.entityType : undefined;
  }

  get selectedEntityKey() {
    return this.selectedEntity ? this.selectedEntity.key : undefined;
  }

  get selectedEntityLabel() {
    return this.selectedEntity ? this.selectedEntity.label : undefined;
  }

  async loadUsers(searchTerm) {
    const request = ++this.searchRequest;
    const { entityType, key } = this.selectedEntity;
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
    this.selectedEntity = { ...event.detail };
    this.selectedUser = undefined;
    this.users = [];
    const userList = this.template.querySelector(
      "c-access-explorer-search-list"
    );
    if (userList) {
      userList.clearSearch();
    }
    this.loadUsers("");
  }

  handleUserSearch(event) {
    this.loadUsers(event.detail.searchTerm);
  }

  handleUserSelect(event) {
    const user = this.users.find(
      (candidate) => candidate.id === event.detail.id
    );
    if (user) {
      this.selectedUser = user;
    }
  }
}
