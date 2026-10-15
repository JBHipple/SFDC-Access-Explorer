/**
 * LWC entry points for the "By User" view, plus the shared access-source lookup.
 */
public with sharing class AccessExplorerUserController {
  @TestVisible
  private static final Integer DEFAULT_USER_LIMIT = 50;
  @TestVisible
  private static final Integer MAX_USER_LIMIT = 200;

  @AuraEnabled(cacheable=true)
  public static List<AccessExplorerModels.UserOption> searchUsers(
    String searchTerm,
    Integer limitSize
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      Integer rowLimit = limitSize == null ||
        limitSize < 1
        ? DEFAULT_USER_LIMIT
        : Math.min(limitSize, MAX_USER_LIMIT);
      List<AccessExplorerModels.UserOption> options = new List<AccessExplorerModels.UserOption>();
      for (
        User record : new AccessExplorerSelector()
          .searchUsers(
            AccessExplorerSecurity.sanitizeSearchTerm(searchTerm),
            rowLimit
          )
      ) {
        options.add(new AccessExplorerModels.UserOption(record));
      }
      return options;
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

  @AuraEnabled(cacheable=true)
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
