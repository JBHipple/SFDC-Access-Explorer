/**
 * End-to-end tests of both controllers: authorization, wiring through the services to
 * real permission data, and client-safe error handling.
 */
@IsTest
private class AccessExplorerControllerTest {
  private static final String SET_NAME = 'AE_Ctrl_Test_Set';

  @TestSetup
  static void setup() {
    AccessExplorerTestDataFactory.createExplorerUser();
    User target = AccessExplorerTestDataFactory.createUser(
      'Target',
      AccessExplorerTestDataFactory.getStandardProfileId()
    );
    PermissionSet permissionSet = AccessExplorerTestDataFactory.createPermissionSet(
      SET_NAME
    );
    insert new List<SObject>{
      new ObjectPermissions(
        ParentId = permissionSet.Id,
        SobjectType = 'Account',
        PermissionsRead = true,
        PermissionsViewAllFields = true
      ),
      new FieldPermissions(
        ParentId = permissionSet.Id,
        SobjectType = 'Account',
        Field = 'Account.Industry',
        PermissionsRead = true,
        PermissionsEdit = true
      ),
      new SetupEntityAccess(
        ParentId = permissionSet.Id,
        SetupEntityId = AccessExplorerTestDataFactory.getApexClassId(
          'AccessGrantService'
        )
      )
    };
    AccessExplorerTestDataFactory.assign(target.Id, permissionSet.Id);
  }

  private static User getUser(String lastName) {
    return (User) new AccessExplorerQueryBuilder(User.SObjectType)
      .selectFields(new List<String>{ 'Id', 'Name' })
      .whereEquals('LastName', lastName)
      .whereContains('Username', 'access.explorer.')
      .limitTo(1)
      .execute()[0];
  }

  @IsTest
  static void byUserFlowExplainsAccess() {
    User target = getUser('Target');
    System.runAs(getUser('Explorer')) {
      Test.startTest();
      List<AccessExplorerModels.UserOption> users = AccessExplorerUserController.searchUsers(
        'Test Target',
        null
      );
      List<AccessExplorerModels.EntityGroup> groups = AccessExplorerUserController.getUserEntities(
        target.Id
      );
      List<AccessExplorerModels.EntityItem> fields = AccessExplorerUserController.getUserFields(
        target.Id,
        'Account'
      );
      List<AccessExplorerModels.AccessSource> sources = AccessExplorerUserController.getAccessSources(
        target.Id,
        'FIELD',
        'Account.Industry'
      );
      Test.stopTest();

      Assert.areEqual(1, users.size());
      Assert.areEqual(target.Id, users[0].id);

      Boolean hasAccount = false;
      for (AccessExplorerModels.EntityItem item : groups[0].items) {
        hasAccount = hasAccount || item.key == 'Account';
      }
      Assert.isTrue(hasAccount);

      Boolean industryEditable = false;
      for (AccessExplorerModels.EntityItem item : fields) {
        if (item.key == 'Account.Industry') {
          industryEditable = item.summary == 'Read, Edit';
        }
      }
      Assert.isTrue(industryEditable);

      Boolean explicitGrant = false;
      Boolean impliedGrant = false;
      for (AccessExplorerModels.AccessSource source : sources) {
        if (source.name == SET_NAME) {
          explicitGrant = explicitGrant || source.impliedBy == null;
          impliedGrant = impliedGrant || source.impliedBy == 'View All Fields';
        }
      }
      Assert.isTrue(explicitGrant, 'Field permission is reported');
      Assert.isTrue(
        impliedGrant,
        'View All Fields is reported as implied access'
      );
    }
  }

  @IsTest
  static void byEntityFlowFindsUsers() {
    User target = getUser('Target');
    Id classId = AccessExplorerTestDataFactory.getApexClassId(
      'AccessGrantService'
    );
    System.runAs(getUser('Explorer')) {
      Test.startTest();
      List<AccessExplorerModels.EntityItem> classes = AccessExplorerEntityController.searchEntities(
        'APEX_CLASS',
        'AccessGrantService',
        null
      );
      List<AccessExplorerModels.EntityItem> fields = AccessExplorerEntityController.searchEntities(
        'FIELD',
        'Industry',
        'Account'
      );
      AccessExplorerModels.UserListResult users = AccessExplorerEntityController.getUsersWithAccess(
        'APEX_CLASS',
        classId,
        'Test Target'
      );
      Test.stopTest();

      Assert.isFalse(classes.isEmpty());
      Assert.areEqual('Account.Industry', fields[0].key);
      Assert.areEqual(1, users.users.size());
      Assert.areEqual(target.Id, users.users[0].id);
    }
  }

  @IsTest
  static void deniesUsersWithoutPermission() {
    Integer denied = 0;
    System.runAs(getUser('Target')) {
      List<String> messages = new List<String>();
      try {
        AccessExplorerUserController.searchUsers(null, 10);
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      try {
        AccessExplorerUserController.getUserEntities(UserInfo.getUserId());
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      try {
        AccessExplorerUserController.getUserFields(
          UserInfo.getUserId(),
          'Account'
        );
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      try {
        AccessExplorerUserController.getAccessSources(
          UserInfo.getUserId(),
          'SOBJECT_TYPE',
          'Account'
        );
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      try {
        AccessExplorerEntityController.searchEntities(
          'SOBJECT_TYPE',
          null,
          null
        );
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      try {
        AccessExplorerEntityController.getUsersWithAccess(
          'SOBJECT_TYPE',
          'Account',
          null
        );
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
      for (String message : messages) {
        Assert.areEqual(AccessExplorerSecurity.ACCESS_DENIED_MESSAGE, message);
        denied++;
      }
    }
    Assert.areEqual(6, denied, 'Every entry point enforces authorization');
  }

  @IsTest
  static void returnsValidationMessagesForBadInput() {
    System.runAs(getUser('Explorer')) {
      try {
        AccessExplorerEntityController.searchEntities('NOT_A_TYPE', null, null);
        Assert.fail('Expected an error');
      } catch (AuraHandledException e) {
        Assert.areEqual('Unknown entity type.', e.getMessage());
      }
      try {
        AccessExplorerUserController.getUserFields(
          UserInfo.getUserId(),
          'Nope__x'
        );
        Assert.fail('Expected an error');
      } catch (AuraHandledException e) {
        Assert.areEqual('Unknown object.', e.getMessage());
      }
    }
  }

  @IsTest
  static void capsUserSearchLimit() {
    System.runAs(getUser('Explorer')) {
      List<AccessExplorerModels.UserOption> users = AccessExplorerUserController.searchUsers(
        null,
        1
      );
      Assert.areEqual(1, users.size());
      Assert.isFalse(
        AccessExplorerUserController.searchUsers(null, 100000).isEmpty()
      );
    }
  }
}
