/**
 * LWC entry points for the "By User" view, plus the shared access-source lookup.
 * User search itself is handled by lightning-record-picker in the UI.
 */
public with sharing class AccessExplorerUserController {
  @AuraEnabled(cacheable=true)
  public static AccessExplorerModels.UserOption getUser(Id userId) {
    try {
      AccessExplorerSecurity.assertCanUse();
      if (userId == null || userId.getSObjectType() != User.SObjectType) {
        throw new IllegalArgumentException('A valid user id is required.');
      }
      List<User> users = new AccessExplorerSelector()
        .getUsers(new Set<Id>{ userId });
      if (users.isEmpty()) {
        throw new IllegalArgumentException('User not found.');
      }
      return new AccessExplorerModels.UserOption(users[0]);
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<AccessExplorerModels.EntityGroup> getUserEntities(
    Id userId
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      return new AccessGrantService().getUserEntities(userId);
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }

  /** Not cacheable so a refresh always returns current permissions. */
  @AuraEnabled
  public static List<AccessExplorerModels.EntityItem> getUserFields(
    Id userId,
    String objectName
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      return new AccessGrantService().getUserFields(userId, objectName);
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<AccessExplorerModels.AccessSource> getAccessSources(
    Id userId,
    String entityType,
    String entityKey
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      return new AccessGrantService()
        .getSourcesForUserEntity(userId, entityType, entityKey);
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }
}
