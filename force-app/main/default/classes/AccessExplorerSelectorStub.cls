/**
 * In-memory IAccessExplorerSelector used to unit test services without DML. It applies
 * the same filters as the real selector to the records it is seeded with.
 */
@IsTest
public class AccessExplorerSelectorStub implements IAccessExplorerSelector {
  public List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
  public List<User> users = new List<User>();
  public List<ObjectPermissions> objectPermissions = new List<ObjectPermissions>();
  public List<FieldPermissions> fieldPermissions = new List<FieldPermissions>();
  public List<SetupEntityAccess> setupEntityAccess = new List<SetupEntityAccess>();
  public List<PermissionSetTabSetting> tabSettings = new List<PermissionSetTabSetting>();
  public List<PermissionSet> permissionSets = new List<PermissionSet>();
  public List<PermissionSetGroupComponent> groupComponents = new List<PermissionSetGroupComponent>();
  public Map<Schema.SObjectType, List<SObject>> lookupRecords = new Map<Schema.SObjectType, List<SObject>>();
  public Boolean hasPermission = true;
  /** When set, lookup queries throw this exception (simulates unavailable objects). */
  public Exception lookupError;
  /** Arguments of the most recent searchRecords call, for assertions. */
  public Map<String, Object> lastSearchFilters;

  public List<PermissionSetAssignment> getAssignmentsForUser(Id userId) {
    List<PermissionSetAssignment> result = new List<PermissionSetAssignment>();
    for (PermissionSetAssignment assignment : assignments) {
      if (assignment.AssigneeId == userId) {
        result.add(assignment);
      }
    }
    return result;
  }

  public List<PermissionSetAssignment> getActiveAssignmentsForPermissionSets(
    Set<Id> permissionSetIds,
    String userSearchTerm,
    Integer rowLimit
  ) {
    List<PermissionSetAssignment> result = new List<PermissionSetAssignment>();
    for (PermissionSetAssignment assignment : assignments) {
      if (
        result.size() < rowLimit &&
        permissionSetIds.contains(assignment.PermissionSetId) &&
        (String.isBlank(userSearchTerm) ||
        assignment.Assignee?.Name?.containsIgnoreCase(userSearchTerm) == true)
      ) {
        result.add(assignment);
      }
    }
    return result;
  }

  public List<User> getUsers(Set<Id> userIds) {
    List<User> result = new List<User>();
    for (User record : users) {
      if (userIds.contains(record.Id)) {
        result.add(record);
      }
    }
    return result;
  }

  public List<ObjectPermissions> getObjectPermissions(
    Set<Id> parentIds,
    String sObjectType
  ) {
    List<ObjectPermissions> result = new List<ObjectPermissions>();
    for (ObjectPermissions permission : objectPermissions) {
      if (
        matchesParent(parentIds, permission.ParentId) &&
        (String.isBlank(sObjectType) ||
        permission.SobjectType.equalsIgnoreCase(sObjectType))
      ) {
        result.add(permission);
      }
    }
    return result;
  }

  public List<FieldPermissions> getFieldPermissions(
    Set<Id> parentIds,
    String sObjectType,
    String fieldKey
  ) {
    List<FieldPermissions> result = new List<FieldPermissions>();
    for (FieldPermissions permission : fieldPermissions) {
      if (
        matchesParent(parentIds, permission.ParentId) &&
        (String.isBlank(sObjectType) ||
        permission.SobjectType.equalsIgnoreCase(sObjectType)) &&
        (String.isBlank(fieldKey) ||
        permission.Field.equalsIgnoreCase(fieldKey))
      ) {
        result.add(permission);
      }
    }
    return result;
  }

  public List<SetupEntityAccess> getSetupEntityAccess(
    Set<Id> parentIds,
    Set<String> setupEntityTypes,
    Id setupEntityId
  ) {
    List<SetupEntityAccess> result = new List<SetupEntityAccess>();
    for (SetupEntityAccess access : setupEntityAccess) {
      if (
        matchesParent(parentIds, access.ParentId) &&
        (setupEntityTypes == null ||
        setupEntityTypes.contains(access.SetupEntityType)) &&
        (setupEntityId == null ||
        access.SetupEntityId == setupEntityId)
      ) {
        result.add(access);
      }
    }
    return result;
  }

  public List<PermissionSetTabSetting> getTabSettings(
    Set<Id> parentIds,
    String tabName
  ) {
    List<PermissionSetTabSetting> result = new List<PermissionSetTabSetting>();
    for (PermissionSetTabSetting setting : tabSettings) {
      if (
        matchesParent(parentIds, setting.ParentId) &&
        (String.isBlank(tabName) || setting.Name == tabName)
      ) {
        result.add(setting);
      }
    }
    return result;
  }

  public List<PermissionSet> getPermissionSetsWithFields(
    Set<Id> permissionSetIds,
    List<String> permissionFields
  ) {
    List<PermissionSet> result = new List<PermissionSet>();
    for (PermissionSet permissionSet : permissionSets) {
      if (permissionSetIds.contains(permissionSet.Id)) {
        result.add(permissionSet);
      }
    }
    return result;
  }

  public List<PermissionSet> getPermissionSetsWithPermissionEnabled(
    String permissionField
  ) {
    List<PermissionSet> result = new List<PermissionSet>();
    for (PermissionSet permissionSet : permissionSets) {
      if (permissionSet.get(permissionField) == true) {
        result.add(permissionSet);
      }
    }
    return result;
  }

  public List<PermissionSetGroupComponent> getGroupComponents(
    Set<Id> groupIds
  ) {
    List<PermissionSetGroupComponent> result = new List<PermissionSetGroupComponent>();
    for (PermissionSetGroupComponent component : groupComponents) {
      if (groupIds.contains(component.PermissionSetGroupId)) {
        result.add(component);
      }
    }
    return result;
  }

  public List<SObject> getRecordsByKeys(
    Schema.SObjectType objectType,
    String keyField,
    List<String> fields,
    Set<String> keys
  ) {
    if (lookupError != null) {
      throw lookupError;
    }
    Set<String> normalizedKeys = new Set<String>();
    for (String key : keys) {
      normalizedKeys.add(key.toLowerCase());
    }
    List<SObject> result = new List<SObject>();
    for (SObject record : getLookupRecords(objectType)) {
      Object value = record.get(keyField);
      if (
        value != null &&
        normalizedKeys.contains(String.valueOf(value).toLowerCase())
      ) {
        result.add(record);
      }
    }
    return result;
  }

  public List<SObject> searchRecords(
    Schema.SObjectType objectType,
    List<String> fields,
    String labelField,
    Map<String, Object> equalsFilters,
    String searchTerm,
    Integer rowLimit
  ) {
    if (lookupError != null) {
      throw lookupError;
    }
    lastSearchFilters = equalsFilters;
    List<SObject> result = new List<SObject>();
    for (SObject record : getLookupRecords(objectType)) {
      if (result.size() >= rowLimit) {
        break;
      }
      Boolean matches = true;
      if (equalsFilters != null) {
        for (String field : equalsFilters.keySet()) {
          matches = matches && record.get(field) == equalsFilters.get(field);
        }
      }
      String label = (String) record.get(labelField);
      if (
        matches &&
        (String.isBlank(searchTerm) ||
        (label != null && label.containsIgnoreCase(searchTerm)))
      ) {
        result.add(record);
      }
    }
    return result;
  }

  public Boolean userHasPermission(Id userId, String permissionField) {
    return hasPermission;
  }

  private List<SObject> getLookupRecords(Schema.SObjectType objectType) {
    return lookupRecords.containsKey(objectType)
      ? lookupRecords.get(objectType)
      : new List<SObject>();
  }

  private static Boolean matchesParent(Set<Id> parentIds, Id parentId) {
    return parentIds == null || parentIds.contains(parentId);
  }
}
