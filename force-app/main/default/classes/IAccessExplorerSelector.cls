/**
 * Data access boundary for Access Explorer. Services depend on this interface so the
 * query layer can be replaced with a test double in unit tests.
 *
 * Unless noted otherwise, a null parentIds argument means "do not filter by parent"
 * (org-wide), while an empty set returns no rows.
 */
public interface IAccessExplorerSelector {
  /** All current (non-expired) permission set assignments for a user, including the profile. */
  List<PermissionSetAssignment> getAssignmentsForUser(Id userId);

  /** Current assignments of active users to any of the given permission sets. */
  List<PermissionSetAssignment> getActiveAssignmentsForPermissionSets(
    Set<Id> permissionSetIds,
    String userSearchTerm,
    Integer rowLimit
  );

  /** Users (active or not) by id, with profile name. */
  List<User> getUsers(Set<Id> userIds);

  List<ObjectPermissions> getObjectPermissions(
    Set<Id> parentIds,
    String sObjectType
  );

  List<FieldPermissions> getFieldPermissions(
    Set<Id> parentIds,
    String sObjectType,
    String fieldKey
  );

  List<SetupEntityAccess> getSetupEntityAccess(
    Set<Id> parentIds,
    Set<String> setupEntityTypes,
    Id setupEntityId
  );

  List<PermissionSetTabSetting> getTabSettings(
    Set<Id> parentIds,
    String tabName
  );

  /** Permission sets with the given (already validated) boolean permission fields selected. */
  List<PermissionSet> getPermissionSetsWithFields(
    Set<Id> permissionSetIds,
    List<String> permissionFields
  );

  /** Ids of permission sets (any type) where the given permission field is enabled. */
  List<PermissionSet> getPermissionSetsWithPermissionEnabled(
    String permissionField
  );

  List<PermissionSetGroupComponent> getGroupComponents(Set<Id> groupIds);

  /** Records of a lookup object (ApexClass, TabDefinition...) whose key field is in keys. */
  List<SObject> getRecordsByKeys(
    Schema.SObjectType objectType,
    String keyField,
    List<String> fields,
    Set<String> keys
  );

  /** Searchable list of a lookup object ordered by its label field. */
  List<SObject> searchRecords(
    Schema.SObjectType objectType,
    List<String> fields,
    String labelField,
    Map<String, Object> equalsFilters,
    String searchTerm,
    Integer rowLimit
  );

  Boolean userHasPermission(Id userId, String permissionField);
}
