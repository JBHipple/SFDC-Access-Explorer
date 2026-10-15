import { LightningElement, wire } from "lwc";
import searchUsers from "@salesforce/apex/AccessExplorerUserController.searchUsers";
import getUserEntities from "@salesforce/apex/AccessExplorerUserController.getUserEntities";
import { errorText } from "c/accessExplorerUtils";

const USER_PAGE_SIZE = 50;

/**
 * "By User" view: pick a user, browse everything they can access, and see which
 * profile / permission sets / groups grant each item.
 */
export default class AccessExplorerUserView extends LightningElement {
  users = [];
  usersLoading = false;
  usersError;
  selectedUser;
  entityGroups;
  entitiesError;
  selectedEntity;
  searchRequest = 0;

  connectedCallback() {
    this.loadUsers("");
  }

  @wire(getUserEntities, { userId: "$selectedUserId" })
  wiredEntities({ data, error }) {
    if (data) {
      this.entityGroups = data;
      this.entitiesError = undefined;
    } else if (error) {
      this.entityGroups = undefined;
      this.entitiesError = errorText(error);
    }
  }

  get selectedUserId() {
    return this.selectedUser ? this.selectedUser.id : undefined;
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

  get entitiesLoading() {
    return !!this.selectedUser && !this.entityGroups && !this.entitiesError;
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

  get selectedUserName() {
    return this.selectedUser ? this.selectedUser.name : undefined;
  }

  get usersTruncated() {
    return this.users.length >= USER_PAGE_SIZE;
  }

  async loadUsers(searchTerm) {
    const request = ++this.searchRequest;
    this.usersLoading = true;
    try {
      const users = await searchUsers({
        searchTerm,
        limitSize: USER_PAGE_SIZE
      });
      if (request === this.searchRequest) {
        this.users = users;
        this.usersError = undefined;
      }
    } catch (error) {
      if (request === this.searchRequest) {
        this.users = [];
        this.usersError = errorText(error);
      }
    } finally {
      if (request === this.searchRequest) {
        this.usersLoading = false;
      }
    }
  }

  handleUserSearch(event) {
    this.loadUsers(event.detail.searchTerm);
  }

  handleUserSelect(event) {
    const user = this.users.find(
      (candidate) => candidate.id === event.detail.id
    );
    if (!user || user.id === this.selectedUserId) {
      return;
    }
    this.selectedUser = user;
    this.selectedEntity = undefined;
    this.entityGroups = undefined;
    this.entitiesError = undefined;
  }

  handleEntitySelect(event) {
    this.selectedEntity = { ...event.detail };
  }
}
