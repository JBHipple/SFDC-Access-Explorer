/**
 * Unit tests for AccessGrantService using an in-memory selector.
 *
 * Scenario for the user under test:
 *  - Profile "Standard User": Account read/edit, Account.Industry read, API Enabled,
 *    Account tab visible.
 *  - Permission set "Sales Extras" (session-based): Account read + View All Fields,
 *    Opportunity read, Account.Industry edit, one Apex class, Account tab available.
 *  - Permission set group "Support Bundle": Case read and Modify All Data. Components are
 *    "Case Access" (grants Case) and a muting permission set (must be ignored).
 */
@IsTest
private class AccessGrantServiceTest {
  private static final Id USER_ID = AccessExplorerTestDataFactory.fakeId(
    User.SObjectType
  );
  private static final Id PROFILE_ID = AccessExplorerTestDataFactory.fakeId(
    Profile.SObjectType
  );
  private static final Id PROFILE_SET = AccessExplorerTestDataFactory.fakeId(
    PermissionSet.SObjectType
  );
  private static final Id SALES_SET = AccessExplorerTestDataFactory.fakeId(
    PermissionSet.SObjectType
  );
  private static final Id GROUP_ID = AccessExplorerTestDataFactory.fakeId(
    PermissionSetGroup.SObjectType
  );
  private static final Id GROUP_AGGREGATE_SET = AccessExplorerTestDataFactory.fakeId(
    PermissionSet.SObjectType
  );
  private static final Id CASE_COMPONENT_SET = AccessExplorerTestDataFactory.fakeId(
    PermissionSet.SObjectType
  );
  private static final Id MUTING_SET = AccessExplorerTestDataFactory.fakeId(
    MutingPermissionSet.SObjectType
  );
  private static final Id APEX_CLASS_ID = AccessExplorerTestDataFactory.fakeId(
    ApexClass.SObjectType
  );

  private static AccessExplorerSelectorStub buildUserScenario() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    stub.assignments.add(
      AccessExplorerTestDataFactory.profileAssignment(
        USER_ID,
        PROFILE_SET,
        PROFILE_ID,
        'Standard User'
      )
    );
    stub.assignments.add(
      AccessExplorerTestDataFactory.permissionSetAssignment(
        USER_ID,
        SALES_SET,
        'Sales Extras',
        true
      )
    );
    stub.assignments.add(
      AccessExplorerTestDataFactory.groupAssignment(
        USER_ID,
        GROUP_AGGREGATE_SET,
        GROUP_ID,
        'Support Bundle'
      )
    );

    stub.objectPermissions.addAll(
      new List<ObjectPermissions>{
        AccessExplorerTestDataFactory.objectPermission(
          PROFILE_SET,
          'Account',
          true,
          false
        ),
        AccessExplorerTestDataFactory.objectPermission(
          SALES_SET,
          'Account',
          false,
          true
        ),
        AccessExplorerTestDataFactory.objectPermission(
          SALES_SET,
          'Opportunity',
          false,
          false
        ),
        AccessExplorerTestDataFactory.objectPermission(
          GROUP_AGGREGATE_SET,
          'Case',
          false,
          false
        ),
        AccessExplorerTestDataFactory.objectPermission(
          CASE_COMPONENT_SET,
          'Case',
          false,
          false
        )
      }
    );
    stub.fieldPermissions.addAll(
      new List<FieldPermissions>{
        AccessExplorerTestDataFactory.fieldPermission(
          PROFILE_SET,
          'Account.Industry',
          false
        ),
        AccessExplorerTestDataFactory.fieldPermission(
          SALES_SET,
          'Account.Industry',
          true
        )
      }
    );
    stub.setupEntityAccess.add(
      AccessExplorerTestDataFactory.setupEntityAccess(
        SALES_SET,
        APEX_CLASS_ID,
        'ApexClass'
      )
    );
    stub.tabSettings.addAll(
      new List<PermissionSetTabSetting>{
        new PermissionSetTabSetting(
          ParentId = SALES_SET,
          Name = 'standard-Account',
          Visibility = 'DefaultOff'
        ),
        new PermissionSetTabSetting(
          ParentId = PROFILE_SET,
          Name = 'standard-Account',
          Visibility = 'DefaultOn'
        )
      }
    );
    stub.permissionSets.addAll(
      new List<PermissionSet>{
        new PermissionSet(Id = PROFILE_SET, PermissionsApiEnabled = true),
        new PermissionSet(Id = SALES_SET),
        new PermissionSet(
          Id = GROUP_AGGREGATE_SET,
          PermissionsModifyAllData = true
        )
      }
    );
    stub.groupComponents.addAll(
      new List<PermissionSetGroupComponent>{
        AccessExplorerTestDataFactory.groupComponent(
          GROUP_ID,
          CASE_COMPONENT_SET,
          'Case Access'
        ),
        AccessExplorerTestDataFactory.groupComponent(GROUP_ID, MUTING_SET, null)
      }
    );
    stub.lookupRecords.put(
      ApexClass.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          ApexClass.SObjectType,
          new Map<String, Object>{
            'Id' => APEX_CLASS_ID,
            'Name' => 'SalesController'
          }
        )
      }
    );
    stub.lookupRecords.put(
      TabDefinition.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          TabDefinition.SObjectType,
          new Map<String, Object>{
            'Name' => 'standard-Account',
            'Label' => 'Accounts'
          }
        )
      }
    );
    return stub;
  }

  private static Map<String, AccessExplorerModels.EntityGroup> groupsByType(
    List<AccessExplorerModels.EntityGroup> groups
  ) {
    Map<String, AccessExplorerModels.EntityGroup> result = new Map<String, AccessExplorerModels.EntityGroup>();
    for (AccessExplorerModels.EntityGroup entityGroup : groups) {
      result.put(entityGroup.entityType, entityGroup);
    }
    return result;
  }

  private static Map<String, AccessExplorerModels.EntityItem> itemsByKey(
    List<AccessExplorerModels.EntityItem> items
  ) {
    Map<String, AccessExplorerModels.EntityItem> result = new Map<String, AccessExplorerModels.EntityItem>();
    for (AccessExplorerModels.EntityItem item : items) {
      result.put(item.key, item);
    }
    return result;
  }

  // ---------------------------------------------------------------------------------
  // By user
  // ---------------------------------------------------------------------------------

  @IsTest
  static void listsUserEntitiesGroupedByType() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    List<AccessExplorerModels.EntityGroup> groups = service.getUserEntities(
      USER_ID
    );

    Assert.areEqual('SOBJECT_TYPE', groups[0].entityType, 'Objects come first');
    Assert.areEqual(
      'TAB',
      groups[groups.size() - 1].entityType,
      'Tabs come last'
    );
    Map<String, AccessExplorerModels.EntityGroup> byType = groupsByType(groups);
    Assert.areEqual(
      AccessExplorerModels.ENTITY_TYPE_LABELS.size() - 1,
      groups.size(),
      'One group per entity type except fields, which hang off objects'
    );

    Map<String, AccessExplorerModels.EntityItem> objects = itemsByKey(
      byType.get('SOBJECT_TYPE').items
    );
    Assert.areEqual(
      new Set<String>{ 'Account', 'Opportunity', 'Case' },
      objects.keySet()
    );
    Assert.areEqual(
      'Read, Edit, View All Fields',
      objects.get('Account').summary
    );
    Assert.isTrue(objects.get('Account').hasChildren);

    Map<String, AccessExplorerModels.EntityItem> systemPermissions = itemsByKey(
      byType.get('SYSTEM_PERMISSION').items
    );
    Assert.areEqual(
      new Set<String>{
        'PermissionsApiEnabled',
        SystemPermissionService.MODIFY_ALL_DATA
      },
      systemPermissions.keySet()
    );
    Assert.areEqual(
      'Enabled',
      systemPermissions.get('PermissionsApiEnabled').summary
    );

    List<AccessExplorerModels.EntityItem> classes = byType.get('APEX_CLASS')
      .items;
    Assert.areEqual(1, classes.size());
    Assert.areEqual('SalesController', classes[0].label);
    Assert.areEqual('Access', classes[0].summary);
    Assert.isTrue(byType.get('APEX_PAGE').items.isEmpty());

    List<AccessExplorerModels.EntityItem> tabs = byType.get('TAB').items;
    Assert.areEqual('Accounts', tabs[0].label);
    Assert.areEqual('Visible', tabs[0].summary, 'Visible wins over Available');
  }

  @IsTest
  static void listsFieldsIncludingViewAllFields() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    Map<String, AccessExplorerModels.EntityItem> fields = itemsByKey(
      service.getUserFields(USER_ID, 'account')
    );

    Assert.areEqual('Read, Edit', fields.get('Account.Industry').summary);
    Assert.areEqual(
      Schema.SObjectType.Account.fields.Industry.getLabel(),
      fields.get('Account.Industry').label
    );
    Assert.areEqual(
      'Read (View All Fields)',
      fields.get('Account.Description').summary,
      'View All Fields on the object makes every permissionable field readable'
    );
  }

  @IsTest
  static void listsOnlyExplicitFieldsWithoutViewAllFields() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());
    Assert.isTrue(service.getUserFields(USER_ID, 'Opportunity').isEmpty());
  }

  @IsTest
  static void explainsObjectAccessIncludingImpliedSources() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    List<AccessExplorerModels.AccessSource> sources = service.getSourcesForUserEntity(
      USER_ID,
      'SOBJECT_TYPE',
      'Account'
    );

    Assert.areEqual(3, sources.size());
    Assert.areEqual(AccessExplorerModels.SOURCE_PROFILE, sources[0].sourceType);
    Assert.areEqual(PROFILE_ID, sources[0].recordId);
    Assert.areEqual('Standard User', sources[0].name);
    Assert.areEqual(
      new List<String>{ 'Read', 'Edit' },
      sources[0].grantedPermissions
    );

    Assert.areEqual(
      AccessExplorerModels.SOURCE_PERMISSION_SET_GROUP,
      sources[1].sourceType
    );
    Assert.areEqual(GROUP_ID, sources[1].recordId);
    Assert.areEqual('Modify All Data', sources[1].impliedBy);
    Assert.isTrue(sources[1].grantedPermissions.contains('Modify All Records'));

    Assert.areEqual(
      AccessExplorerModels.SOURCE_PERMISSION_SET,
      sources[2].sourceType
    );
    Assert.areEqual(SALES_SET, sources[2].recordId);
    Assert.isTrue(sources[2].isSessionBased);
    Assert.areEqual(
      new List<String>{ 'Read', 'View All Fields' },
      sources[2].grantedPermissions
    );
  }

  @IsTest
  static void explainsAccessToObjectsHiddenFromDescribe() {
    // Objects such as UserExternalCredential have object permissions but are not in
    // Apex describe; they must still be explainable.
    String hiddenObject = 'HiddenFromDescribe';
    Assert.isFalse(AccessExplorerSchemaUtil.isValidObject(hiddenObject));
    AccessExplorerSelectorStub stub = buildUserScenario();
    stub.objectPermissions.add(
      AccessExplorerTestDataFactory.objectPermission(
        SALES_SET,
        hiddenObject,
        true,
        true
      )
    );
    stub.fieldPermissions.add(
      AccessExplorerTestDataFactory.fieldPermission(
        SALES_SET,
        hiddenObject + '.Secret__c',
        false
      )
    );
    AccessGrantService service = new AccessGrantService(stub);

    List<AccessExplorerModels.AccessSource> objectSources = service.getSourcesForUserEntity(
      USER_ID,
      'SOBJECT_TYPE',
      hiddenObject
    );
    Assert.areEqual(
      SALES_SET,
      objectSources[objectSources.size() - 1].recordId
    );

    List<AccessExplorerModels.EntityItem> fields = service.getUserFields(
      USER_ID,
      hiddenObject
    );
    Assert.areEqual(1, fields.size(), 'Only explicit field permissions apply');
    Assert.areEqual('Secret__c', fields[0].label);

    List<AccessExplorerModels.AccessSource> fieldSources = service.getSourcesForUserEntity(
      USER_ID,
      'FIELD',
      hiddenObject + '.Secret__c'
    );
    Assert.areEqual(2, fieldSources.size(), 'Explicit plus View All Fields');
    for (AccessExplorerModels.AccessSource source : fieldSources) {
      Assert.areEqual(SALES_SET, source.recordId);
    }
  }

  @IsTest
  static void attributesGroupAccessToContributingComponents() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    List<AccessExplorerModels.AccessSource> sources = service.getSourcesForUserEntity(
      USER_ID,
      'SOBJECT_TYPE',
      'Case'
    );

    AccessExplorerModels.AccessSource direct;
    for (AccessExplorerModels.AccessSource source : sources) {
      if (source.impliedBy == null) {
        direct = source;
      }
    }
    Assert.areEqual('Support Bundle', direct.name);
    Assert.areEqual(
      new List<String>{ 'Case Access' },
      direct.viaComponents,
      'Muting permission sets are never listed as contributors'
    );
  }

  @IsTest
  static void explainsFieldAccessIncludingViewAllFields() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    List<AccessExplorerModels.AccessSource> sources = service.getSourcesForUserEntity(
      USER_ID,
      'FIELD',
      'account.industry'
    );

    Assert.areEqual(3, sources.size());
    Assert.areEqual(new List<String>{ 'Read' }, sources[0].grantedPermissions);
    Integer implied = 0;
    for (AccessExplorerModels.AccessSource source : sources) {
      if (source.impliedBy == 'View All Fields') {
        implied++;
        Assert.areEqual(SALES_SET, source.recordId);
      } else if (source.recordId == SALES_SET) {
        Assert.areEqual(
          new List<String>{ 'Read', 'Edit' },
          source.grantedPermissions
        );
      }
    }
    Assert.areEqual(1, implied);
  }

  @IsTest
  static void explainsSystemPermissionSetupEntityAndTabAccess() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());

    List<AccessExplorerModels.AccessSource> systemSources = service.getSourcesForUserEntity(
      USER_ID,
      'SYSTEM_PERMISSION',
      'PermissionsApiEnabled'
    );
    Assert.areEqual(1, systemSources.size());
    Assert.areEqual(
      new List<String>{ 'Enabled' },
      systemSources[0].grantedPermissions
    );

    List<AccessExplorerModels.AccessSource> classSources = service.getSourcesForUserEntity(
      USER_ID,
      'APEX_CLASS',
      APEX_CLASS_ID
    );
    Assert.areEqual(1, classSources.size());
    Assert.areEqual('Sales Extras', classSources[0].name);
    Assert.areEqual(
      new List<String>{ 'Access' },
      classSources[0].grantedPermissions
    );

    List<AccessExplorerModels.AccessSource> tabSources = service.getSourcesForUserEntity(
      USER_ID,
      'TAB',
      'standard-Account'
    );
    Assert.areEqual(2, tabSources.size());
    Assert.areEqual(
      new List<String>{ 'Visible' },
      tabSources[0].grantedPermissions
    );
    Assert.areEqual(
      new List<String>{ 'Available' },
      tabSources[1].grantedPermissions
    );

    Assert.isTrue(
      service.getSourcesForUserEntity(USER_ID, 'APEX_PAGE', 'not-an-id')
        .isEmpty(),
      'Malformed setup entity ids match nothing'
    );
    Assert.isTrue(
      service.getSourcesForUserEntity(
          USER_ID,
          'SYSTEM_PERMISSION',
          'PermissionsViewSetup'
        )
        .isEmpty()
    );
  }

  @IsTest
  static void rejectsInvalidInput() {
    AccessGrantService service = new AccessGrantService(buildUserScenario());
    Id accountId = AccessExplorerTestDataFactory.fakeId(Account.SObjectType);
    List<String> messages = new List<String>();
    try {
      service.getUserEntities(accountId);
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    try {
      service.getUserFields(USER_ID, 'Account\' OR Name != \'');
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    try {
      service.getSourcesForUserEntity(USER_ID, 'FIELD', 'Account.Nope__c');
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    try {
      service.getSourcesForUserEntity(USER_ID, 'FIELD', 'Hidden.Bad Field');
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    try {
      service.getSourcesForUserEntity(USER_ID, 'TAB', ' ');
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    try {
      service.getSourcesForUserEntity(USER_ID, 'BOGUS', 'x');
    } catch (IllegalArgumentException e) {
      messages.add(e.getMessage());
    }
    Assert.areEqual(
      new List<String>{
        'A valid user id is required.',
        'Unknown object.',
        'Unknown field.',
        'Unknown field.',
        'An entity key is required.',
        'Unknown entity type.'
      },
      messages
    );
  }

  // ---------------------------------------------------------------------------------
  // By entity
  // ---------------------------------------------------------------------------------

  @IsTest
  static void findsUsersIncludingImpliedAccessAndDeduplicates() {
    AccessExplorerSelectorStub stub = buildUserScenario();
    stub.assignments.clear();
    Id alice = AccessExplorerTestDataFactory.fakeId(User.SObjectType);
    Id bob = AccessExplorerTestDataFactory.fakeId(User.SObjectType);
    Id carol = AccessExplorerTestDataFactory.fakeId(User.SObjectType);
    stub.assignments.addAll(
      new List<PermissionSetAssignment>{
        AccessExplorerTestDataFactory.assigneeAssignment(
          alice,
          'Alice Adams',
          PROFILE_SET
        ),
        AccessExplorerTestDataFactory.assigneeAssignment(
          alice,
          'Alice Adams',
          SALES_SET
        ),
        AccessExplorerTestDataFactory.assigneeAssignment(
          bob,
          'Bob Brown',
          GROUP_AGGREGATE_SET
        ),
        AccessExplorerTestDataFactory.assigneeAssignment(
          carol,
          'Carol Chen',
          CASE_COMPONENT_SET
        )
      }
    );
    AccessGrantService service = new AccessGrantService(stub);

    AccessExplorerModels.UserListResult result = service.getUsersWithAccess(
      'SOBJECT_TYPE',
      'Account',
      null,
      null
    );

    Assert.areEqual(
      2,
      result.users.size(),
      'Alice once; Bob via Modify All Data; not Carol'
    );
    Assert.areEqual(alice, result.users[0].id);
    Assert.areEqual('Standard User', result.users[0].profileName);
    Assert.areEqual(bob, result.users[1].id);
    Assert.isFalse(result.truncated);

    AccessExplorerModels.UserListResult filtered = service.getUsersWithAccess(
      'SOBJECT_TYPE',
      'Account',
      'bob',
      10
    );
    Assert.areEqual(1, filtered.users.size());
    Assert.areEqual(bob, filtered.users[0].id);

    AccessExplorerModels.UserListResult truncated = service.getUsersWithAccess(
      'SOBJECT_TYPE',
      'Account',
      null,
      1
    );
    Assert.areEqual(1, truncated.users.size());
    Assert.isTrue(truncated.truncated);
  }

  @IsTest
  static void findsUsersForEveryEntityKind() {
    AccessExplorerSelectorStub stub = buildUserScenario();
    stub.assignments.clear();
    Id alice = AccessExplorerTestDataFactory.fakeId(User.SObjectType);
    stub.assignments.add(
      AccessExplorerTestDataFactory.assigneeAssignment(
        alice,
        'Alice Adams',
        SALES_SET
      )
    );
    AccessGrantService service = new AccessGrantService(stub);

    Assert.areEqual(
      1,
      service.getUsersWithAccess('FIELD', 'Account.Industry', null, 10)
        .users.size()
    );
    Assert.areEqual(
      1,
      service.getUsersWithAccess('APEX_CLASS', APEX_CLASS_ID, null, 10)
        .users.size()
    );
    Assert.areEqual(
      1,
      service.getUsersWithAccess('TAB', 'standard-Account', null, 10)
        .users.size()
    );
    Assert.areEqual(
      0,
      service.getUsersWithAccess(
          'SYSTEM_PERMISSION',
          'PermissionsApiEnabled',
          null,
          10
        )
        .users.size()
    );
    Assert.areEqual(
      0,
      service.getUsersWithAccess('CUSTOM_PERMISSION', 'not-an-id', null, 10)
        .users.size()
    );
  }

  @IsTest
  static void searchesEntitiesByType() {
    AccessExplorerSelectorStub stub = buildUserScenario();
    stub.lookupRecords.put(
      EntityDefinition.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          EntityDefinition.SObjectType,
          new Map<String, Object>{
            'QualifiedApiName' => 'Account',
            'Label' => 'Account',
            'IsQueryable' => true,
            'IsCustomSetting' => false
          }
        ),
        AccessExplorerTestDataFactory.build(
          EntityDefinition.SObjectType,
          new Map<String, Object>{
            'QualifiedApiName' => 'AccountShare',
            'Label' => 'Account Share',
            'IsQueryable' => true,
            'IsCustomSetting' => false
          }
        )
      }
    );
    AccessGrantService service = new AccessGrantService(stub);

    List<AccessExplorerModels.EntityItem> objects = service.searchEntities(
      'SOBJECT_TYPE',
      'acc',
      null,
      50
    );
    Assert.areEqual(1, objects.size(), 'Share objects are filtered out');
    Assert.areEqual('Account', objects[0].key);
    Assert.isTrue(objects[0].hasChildren);

    List<AccessExplorerModels.EntityItem> fields = service.searchEntities(
      'FIELD',
      'industry',
      'Account',
      50
    );
    Assert.areEqual('Account.Industry', fields[0].key);
    Assert.areEqual(
      5,
      service.searchEntities('FIELD', null, 'Account', 5).size()
    );

    Assert.areEqual(
      3,
      service.searchEntities('SYSTEM_PERMISSION', null, null, 3).size()
    );
    Assert.areEqual(
      1,
      service.searchEntities('APEX_CLASS', 'sales', null, 10).size()
    );
  }

  @IsTest
  static void recognizesPermissionableObjectNames() {
    Assert.isTrue(AccessGrantService.isPermissionableObjectName('Account'));
    Assert.isTrue(AccessGrantService.isPermissionableObjectName('Invoice__c'));
    Assert.isFalse(AccessGrantService.isPermissionableObjectName(null));
    Assert.isFalse(
      AccessGrantService.isPermissionableObjectName('AccountHistory')
    );
    Assert.isFalse(
      AccessGrantService.isPermissionableObjectName('Invoice__Share')
    );
    Assert.isFalse(
      AccessGrantService.isPermissionableObjectName('Setting__mdt')
    );
    Assert.isFalse(
      AccessGrantService.isPermissionableObjectName('Order_Event__e')
    );
  }
}
