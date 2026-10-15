/**
 * Integration tests for AccessExplorerSelector against real permission metadata.
 */
@IsTest
private class AccessExplorerSelectorTest {
  private static final String SET_NAME = 'AE_Test_Sales';
  private static final String COMPONENT_SET_NAME = 'AE_Test_Component';
  private static final String GROUP_NAME = 'AE_Test_Group';

  @TestSetup
  static void setup() {
    User target = AccessExplorerTestDataFactory.createUser(
      'Target',
      AccessExplorerTestDataFactory.getStandardProfileId()
    );
    User inactive = AccessExplorerTestDataFactory.createUser(
      'Inactive',
      AccessExplorerTestDataFactory.getStandardProfileId()
    );

    PermissionSet sales = new PermissionSet(
      Name = SET_NAME,
      Label = SET_NAME,
      PermissionsApiEnabled = true
    );
    PermissionSet component = new PermissionSet(
      Name = COMPONENT_SET_NAME,
      Label = COMPONENT_SET_NAME
    );
    insert new List<PermissionSet>{ sales, component };

    insert new List<SObject>{
      new ObjectPermissions(
        ParentId = sales.Id,
        SobjectType = 'Account',
        PermissionsRead = true,
        PermissionsEdit = true
      ),
      new FieldPermissions(
        ParentId = sales.Id,
        SobjectType = 'Account',
        Field = 'Account.Industry',
        PermissionsRead = true,
        PermissionsEdit = false
      ),
      new SetupEntityAccess(
        ParentId = sales.Id,
        SetupEntityId = AccessExplorerTestDataFactory.getApexClassId(
          'AccessGrantService'
        )
      ),
      new PermissionSetTabSetting(
        ParentId = sales.Id,
        Name = 'standard-Account',
        Visibility = 'DefaultOn'
      )
    };

    PermissionSetGroup permissionGroup = new PermissionSetGroup(
      DeveloperName = GROUP_NAME,
      MasterLabel = GROUP_NAME
    );
    insert permissionGroup;
    insert new PermissionSetGroupComponent(
      PermissionSetGroupId = permissionGroup.Id,
      PermissionSetId = component.Id
    );

    insert new List<PermissionSetAssignment>{
      new PermissionSetAssignment(
        AssigneeId = target.Id,
        PermissionSetId = sales.Id,
        ExpirationDate = Datetime.now().addDays(30)
      ),
      new PermissionSetAssignment(
        AssigneeId = inactive.Id,
        PermissionSetId = sales.Id
      )
    };
    inactive.IsActive = false;
    update inactive;
  }

  private static User getUser(String lastName) {
    return (User) new AccessExplorerQueryBuilder(User.SObjectType)
      .selectFields(new List<String>{ 'Id', 'Name' })
      .whereEquals('LastName', lastName)
      .whereContains('Username', 'access.explorer.')
      .limitTo(1)
      .execute()[0];
  }

  private static Id getPermissionSetId(String name) {
    return new AccessExplorerQueryBuilder(PermissionSet.SObjectType)
        .whereEquals('Name', name)
        .limitTo(1)
        .execute()[0]
      .Id;
  }

  @IsTest
  static void readsUserAssignmentsIncludingProfileAndExpiringSets() {
    List<PermissionSetAssignment> assignments = new AccessExplorerSelector()
      .getAssignmentsForUser(getUser('Target').Id);

    Boolean hasProfile = false;
    Boolean hasSales = false;
    for (PermissionSetAssignment assignment : assignments) {
      hasProfile = hasProfile || assignment.PermissionSet.IsOwnedByProfile;
      hasSales = hasSales || assignment.PermissionSet.Name == SET_NAME;
    }
    Assert.isTrue(hasProfile, 'Profile appears as an assignment');
    Assert.isTrue(
      hasSales,
      'Assignments that expire in the future are current'
    );
  }

  @IsTest
  static void excludesInactiveUsersAndFiltersByName() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    Set<Id> salesSet = new Set<Id>{ getPermissionSetId(SET_NAME) };

    List<PermissionSetAssignment> assignments = selector.getActiveAssignmentsForPermissionSets(
      salesSet,
      null,
      100
    );
    Assert.areEqual(1, assignments.size());
    Assert.areEqual(getUser('Target').Id, assignments[0].AssigneeId);
    Assert.isNotNull(assignments[0].Assignee.Name);

    Assert.isTrue(
      selector.getActiveAssignmentsForPermissionSets(
          salesSet,
          'zzz-nobody',
          100
        )
        .isEmpty()
    );
    Assert.isTrue(
      selector.getActiveAssignmentsForPermissionSets(new Set<Id>(), null, 100)
        .isEmpty()
    );
  }

  @IsTest
  static void readsUsersById() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    User target = getUser('Target');
    User inactive = getUser('Inactive');

    List<User> found = selector.getUsers(new Set<Id>{ target.Id, inactive.Id });
    Assert.areEqual(2, found.size(), 'Inactive users can still be inspected');
    Assert.isNotNull(found[0].Profile.Name);
    Assert.isTrue(selector.getUsers(new Set<Id>()).isEmpty());
    Assert.isTrue(selector.getUsers(null).isEmpty());
  }

  @IsTest
  static void readsPermissionRowsWithFilters() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    Set<Id> salesSet = new Set<Id>{ getPermissionSetId(SET_NAME) };

    Assert.areEqual(
      1,
      selector.getObjectPermissions(salesSet, 'Account').size()
    );
    Assert.isTrue(selector.getObjectPermissions(salesSet, 'Contact').isEmpty());
    Assert.isFalse(selector.getObjectPermissions(null, 'Account').isEmpty());
    Assert.isTrue(selector.getObjectPermissions(new Set<Id>(), null).isEmpty());

    Assert.areEqual(
      1,
      selector.getFieldPermissions(salesSet, 'Account', 'Account.Industry')
        .size()
    );
    Assert.isTrue(
      selector.getFieldPermissions(new Set<Id>(), null, null).isEmpty()
    );
    Assert.isFalse(
      selector.getFieldPermissions(null, 'Account', null).isEmpty()
    );

    Id classId = AccessExplorerTestDataFactory.getApexClassId(
      'AccessGrantService'
    );
    Assert.areEqual(
      1,
      selector.getSetupEntityAccess(
          salesSet,
          new Set<String>{ 'ApexClass' },
          classId
        )
        .size()
    );
    Set<Id> orgWideParents = new Set<Id>();
    for (
      SetupEntityAccess access : selector.getSetupEntityAccess(
        null,
        null,
        classId
      )
    ) {
      orgWideParents.add(access.ParentId);
    }
    Assert.isTrue(
      orgWideParents.containsAll(salesSet),
      'Org-wide lookup includes the test set'
    );
    Assert.isTrue(
      selector.getSetupEntityAccess(new Set<Id>(), null, null).isEmpty()
    );

    Assert.areEqual(
      1,
      selector.getTabSettings(salesSet, 'standard-Account').size()
    );
    Assert.isFalse(selector.getTabSettings(null, 'standard-Account').isEmpty());
    Assert.isTrue(selector.getTabSettings(new Set<Id>(), null).isEmpty());
  }

  @IsTest
  static void readsSystemPermissions() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    Id salesSet = getPermissionSetId(SET_NAME);

    List<PermissionSet> sets = selector.getPermissionSetsWithFields(
      new Set<Id>{ salesSet },
      new List<String>{ 'PermissionsApiEnabled' }
    );
    Assert.areEqual(true, sets[0].PermissionsApiEnabled);
    Assert.isTrue(
      selector.getPermissionSetsWithFields(new Set<Id>(), new List<String>())
        .isEmpty()
    );

    Set<Id> enabled = new Map<Id, PermissionSet>(
        selector.getPermissionSetsWithPermissionEnabled('PermissionsApiEnabled')
      )
      .keySet();
    Assert.isTrue(enabled.contains(salesSet));

    Assert.isTrue(
      selector.userHasPermission(UserInfo.getUserId(), 'PermissionsViewSetup'),
      'The running admin can view setup'
    );
    Assert.isFalse(
      selector.userHasPermission(
        getUser('Target').Id,
        'PermissionsModifyAllData'
      )
    );
  }

  @IsTest
  static void readsGroupComponents() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    Id groupId = new AccessExplorerQueryBuilder(PermissionSetGroup.SObjectType)
        .whereEquals('DeveloperName', GROUP_NAME)
        .execute()[0]
      .Id;

    List<PermissionSetGroupComponent> components = selector.getGroupComponents(
      new Set<Id>{ groupId }
    );
    Assert.areEqual(1, components.size());
    Assert.areEqual(COMPONENT_SET_NAME, components[0].PermissionSet.Label);
    Assert.isTrue(selector.getGroupComponents(null).isEmpty());
  }

  @IsTest
  static void readsLookupRecords() {
    AccessExplorerSelector selector = new AccessExplorerSelector();
    Id classId = AccessExplorerTestDataFactory.getApexClassId(
      'AccessGrantService'
    );

    List<SObject> byKey = selector.getRecordsByKeys(
      ApexClass.SObjectType,
      'Id',
      new List<String>{ 'Id', 'Name' },
      new Set<String>{ classId }
    );
    Assert.areEqual('AccessGrantService', byKey[0].get('Name'));
    Assert.isTrue(
      selector.getRecordsByKeys(
          ApexClass.SObjectType,
          'Id',
          new List<String>{ 'Id' },
          null
        )
        .isEmpty()
    );

    List<SObject> searched = selector.searchRecords(
      TabDefinition.SObjectType,
      new List<String>{ 'Name', 'Label' },
      'Label',
      new Map<String, Object>{ 'Name' => 'standard-Account' },
      'Acc',
      5
    );
    Assert.areEqual(1, searched.size());
  }
}
