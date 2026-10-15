/**
 * LWC entry points for the "By Entity" view.
 */
public with sharing class AccessExplorerEntityController {
  @TestVisible
  private static final Integer ENTITY_OPTION_LIMIT = 200;

  @AuraEnabled(cacheable=true)
  public static List<AccessExplorerModels.EntityItem> searchEntities(
    String entityType,
    String searchTerm,
    String objectName
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      return new AccessGrantService()
        .searchEntities(
          entityType,
          AccessExplorerSecurity.sanitizeSearchTerm(searchTerm),
          objectName,
          ENTITY_OPTION_LIMIT
        );
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }

  /** Not cacheable so a refresh always returns current assignments. */
  @AuraEnabled
  public static AccessExplorerModels.UserListResult getUsersWithAccess(
    String entityType,
    String entityKey,
    String searchTerm
  ) {
    try {
      AccessExplorerSecurity.assertCanUse();
      return new AccessGrantService()
        .getUsersWithAccess(
          entityType,
          entityKey,
          AccessExplorerSecurity.sanitizeSearchTerm(searchTerm),
          AccessGrantService.DEFAULT_USER_LIMIT
        );
    } catch (Exception e) {
      throw AccessExplorerSecurity.toClientException(e);
    }
  }
}
