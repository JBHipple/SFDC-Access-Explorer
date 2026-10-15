/**
 * Production implementation of IAccessExplorerSelector. Every query is built with
 * AccessExplorerQueryBuilder (bind variables, validated identifiers, USER_MODE).
 */
public inherited sharing class AccessExplorerSelector implements IAccessExplorerSelector {
  @TestVisible
  private static final Integer MAX_PERMISSION_ROWS = 10000;

  private static final List<String> ASSIGNMENT_FIELDS = new List<String>{
    'Id',
    'AssigneeId',
    'PermissionSetId',
    'PermissionSetGroupId',
    'ExpirationDate',
    'PermissionSet.Name',
    'PermissionSet.Label',
    'PermissionSet.IsOwnedByProfile',
    'PermissionSet.ProfileId',
    'PermissionSet.Profile.Name',
    'PermissionSet.HasActivationRequired',
    'PermissionSetGroup.MasterLabel',
    'PermissionSetGroup.DeveloperName'
  };

  private static final List<String> OBJECT_PERMISSION_FIELDS = new List<String>{
    'Id',
    'ParentId',
    'SobjectType',
    'PermissionsRead',
    'PermissionsCreate',
    'PermissionsEdit',
    'PermissionsDelete',
    'PermissionsViewAllRecords',
    'PermissionsModifyAllRecords',
    'PermissionsViewAllFields'
  };

  public List<PermissionSetAssignment> getAssignmentsForUser(Id userId) {
    return (List<PermissionSetAssignment>) new AccessExplorerQueryBuilder(
        PermissionSetAssignment.SObjectType
      )
      .selectFields(ASSIGNMENT_FIELDS)
      .whereEquals('AssigneeId', userId)
      .whereNullOrGreaterThan('ExpirationDate', Datetime.now())
      .limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<PermissionSetAssignment> getActiveAssignmentsForPermissionSets(
    Set<Id> permissionSetIds,
    String userSearchTerm,
    Integer rowLimit
  ) {
    if (permissionSetIds == null || permissionSetIds.isEmpty()) {
      return new List<PermissionSetAssignment>();
    }
    List<String> fields = new List<String>(ASSIGNMENT_FIELDS);
    fields.addAll(
      new List<String>{
        'Assignee.Name',
        'Assignee.Username',
        'Assignee.IsActive',
        'Assignee.Profile.Name'
      }
    );
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        PermissionSetAssignment.SObjectType
      )
      .selectFields(fields)
      .whereIn('PermissionSetId', permissionSetIds)
      .whereEquals('Assignee.IsActive', true)
      .whereNullOrGreaterThan('ExpirationDate', Datetime.now());
    if (String.isNotBlank(userSearchTerm)) {
      builder.whereAnyContains(
        new List<String>{ 'Assignee.Name', 'Assignee.Username' },
        userSearchTerm
      );
    }
    return (List<PermissionSetAssignment>) builder
      .orderBy('Assignee.Name')
      .limitTo(rowLimit)
      .execute();
  }

  public List<User> searchUsers(String searchTerm, Integer rowLimit) {
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        User.SObjectType
      )
      .selectFields(
        new List<String>{ 'Id', 'Name', 'Username', 'IsActive', 'Profile.Name' }
      )
      .whereEquals('IsActive', true);
    if (String.isNotBlank(searchTerm)) {
      builder.whereAnyContains(
        new List<String>{ 'Name', 'Username', 'Email' },
        searchTerm
      );
    }
    return (List<User>) builder.orderBy('Name').limitTo(rowLimit).execute();
  }

  public List<ObjectPermissions> getObjectPermissions(
    Set<Id> parentIds,
    String sObjectType
  ) {
    if (parentIds != null && parentIds.isEmpty()) {
      return new List<ObjectPermissions>();
    }
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        Schema.SObjectType.ObjectPermissions.getSObjectType()
      )
      .selectFields(OBJECT_PERMISSION_FIELDS)
      .whereEquals('PermissionsRead', true);
    if (parentIds != null) {
      builder.whereIn('ParentId', parentIds);
    }
    if (String.isNotBlank(sObjectType)) {
      builder.whereEquals('SobjectType', sObjectType);
    }
    return (List<ObjectPermissions>) builder.limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<FieldPermissions> getFieldPermissions(
    Set<Id> parentIds,
    String sObjectType,
    String fieldKey
  ) {
    if (parentIds != null && parentIds.isEmpty()) {
      return new List<FieldPermissions>();
    }
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        Schema.SObjectType.FieldPermissions.getSObjectType()
      )
      .selectFields(
        new List<String>{
          'Id',
          'ParentId',
          'SobjectType',
          'Field',
          'PermissionsRead',
          'PermissionsEdit'
        }
      )
      .whereEquals('PermissionsRead', true);
    if (parentIds != null) {
      builder.whereIn('ParentId', parentIds);
    }
    if (String.isNotBlank(sObjectType)) {
      builder.whereEquals('SobjectType', sObjectType);
    }
    if (String.isNotBlank(fieldKey)) {
      builder.whereEquals('Field', fieldKey);
    }
    return (List<FieldPermissions>) builder.limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<SetupEntityAccess> getSetupEntityAccess(
    Set<Id> parentIds,
    Set<String> setupEntityTypes,
    Id setupEntityId
  ) {
    if (parentIds != null && parentIds.isEmpty()) {
      return new List<SetupEntityAccess>();
    }
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        SetupEntityAccess.SObjectType
      )
      .selectFields(
        new List<String>{ 'Id', 'ParentId', 'SetupEntityId', 'SetupEntityType' }
      );
    if (parentIds != null) {
      builder.whereIn('ParentId', parentIds);
    }
    if (setupEntityTypes != null && !setupEntityTypes.isEmpty()) {
      builder.whereIn('SetupEntityType', setupEntityTypes);
    }
    if (setupEntityId != null) {
      builder.whereEquals('SetupEntityId', setupEntityId);
    }
    return (List<SetupEntityAccess>) builder.limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<PermissionSetTabSetting> getTabSettings(
    Set<Id> parentIds,
    String tabName
  ) {
    if (parentIds != null && parentIds.isEmpty()) {
      return new List<PermissionSetTabSetting>();
    }
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        PermissionSetTabSetting.SObjectType
      )
      .selectFields(new List<String>{ 'Id', 'ParentId', 'Name', 'Visibility' });
    if (parentIds != null) {
      builder.whereIn('ParentId', parentIds);
    }
    if (String.isNotBlank(tabName)) {
      builder.whereEquals('Name', tabName);
    }
    return (List<PermissionSetTabSetting>) builder.limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<PermissionSet> getPermissionSetsWithFields(
    Set<Id> permissionSetIds,
    List<String> permissionFields
  ) {
    if (permissionSetIds == null || permissionSetIds.isEmpty()) {
      return new List<PermissionSet>();
    }
    return (List<PermissionSet>) new AccessExplorerQueryBuilder(
        PermissionSet.SObjectType
      )
      .selectField('Id')
      .selectFields(permissionFields)
      .whereIn('Id', permissionSetIds)
      .limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<PermissionSet> getPermissionSetsWithPermissionEnabled(
    String permissionField
  ) {
    return (List<PermissionSet>) new AccessExplorerQueryBuilder(
        PermissionSet.SObjectType
      )
      .selectField('Id')
      .whereEquals(permissionField, true)
      .limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<PermissionSetGroupComponent> getGroupComponents(
    Set<Id> groupIds
  ) {
    if (groupIds == null || groupIds.isEmpty()) {
      return new List<PermissionSetGroupComponent>();
    }
    return (List<PermissionSetGroupComponent>) new AccessExplorerQueryBuilder(
        PermissionSetGroupComponent.SObjectType
      )
      .selectFields(
        new List<String>{
          'Id',
          'PermissionSetGroupId',
          'PermissionSetId',
          'PermissionSet.Label'
        }
      )
      .whereIn('PermissionSetGroupId', groupIds)
      .limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<SObject> getRecordsByKeys(
    Schema.SObjectType objectType,
    String keyField,
    List<String> fields,
    Set<String> keys
  ) {
    if (keys == null || keys.isEmpty()) {
      return new List<SObject>();
    }
    return new AccessExplorerQueryBuilder(objectType)
      .selectFields(fields)
      .whereIn(keyField, keys)
      .limitTo(MAX_PERMISSION_ROWS)
      .execute();
  }

  public List<SObject> searchRecords(
    Schema.SObjectType objectType,
    List<String> fields,
    String labelField,
    Map<String, Object> equalsFilters,
    String searchTerm,
    Integer rowLimit
  ) {
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        objectType
      )
      .selectFields(fields);
    if (equalsFilters != null) {
      for (String field : equalsFilters.keySet()) {
        builder.whereEquals(field, equalsFilters.get(field));
      }
    }
    if (String.isNotBlank(searchTerm)) {
      builder.whereContains(labelField, searchTerm);
    }
    return builder.orderBy(labelField).limitTo(rowLimit).execute();
  }

  public Boolean userHasPermission(Id userId, String permissionField) {
    return !new AccessExplorerQueryBuilder(PermissionSetAssignment.SObjectType)
      .selectField('Id')
      .whereEquals('AssigneeId', userId)
      .whereEquals('PermissionSet.' + permissionField, true)
      .whereNullOrGreaterThan('ExpirationDate', Datetime.now())
      .limitTo(1)
      .execute()
      .isEmpty();
  }
}
