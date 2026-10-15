/**
 * Test data helpers. In-memory builders support unit tests that use
 * AccessExplorerSelectorStub; the create* methods insert real setup data for
 * integration tests.
 */
@IsTest
public class AccessExplorerTestDataFactory {
  private static Integer uniqueCounter = 0;

  // ---------------------------------------------------------------------------------
  // In-memory builders
  // ---------------------------------------------------------------------------------

  /** A syntactically valid, non-persisted record id for the given object. */
  public static Id fakeId(Schema.SObjectType objectType) {
    return fakeId(objectType.getDescribe().getKeyPrefix());
  }

  /** A fake id for a key prefix that has no SObjectType token (e.g. 02u apps). */
  public static Id fakeId(String keyPrefix) {
    uniqueCounter++;
    String suffix = String.valueOf(uniqueCounter);
    return Id.valueOf(keyPrefix + '0'.repeat(12 - suffix.length()) + suffix);
  }

  /**
   * Builds an in-memory record, including read-only and relationship fields, by
   * round-tripping through JSON. Nested maps become parent relationships.
   */
  public static SObject build(
    Schema.SObjectType objectType,
    Map<String, Object> fields
  ) {
    return (SObject) JSON.deserialize(
      JSON.serialize(withAttributes(objectType, fields)),
      Type.forName('Schema.' + objectType.getDescribe().getName())
    );
  }

  public static Map<String, Object> withAttributes(
    Schema.SObjectType objectType,
    Map<String, Object> fields
  ) {
    Map<String, Object> result = new Map<String, Object>(fields);
    result.put(
      'attributes',
      new Map<String, Object>{ 'type' => objectType.getDescribe().getName() }
    );
    return result;
  }

  public static PermissionSetAssignment profileAssignment(
    Id userId,
    Id permissionSetId,
    Id profileId,
    String profileName
  ) {
    return (PermissionSetAssignment) build(
      PermissionSetAssignment.SObjectType,
      new Map<String, Object>{
        'AssigneeId' => userId,
        'PermissionSetId' => permissionSetId,
        'PermissionSet' => withAttributes(
          PermissionSet.SObjectType,
          new Map<String, Object>{
            'Id' => permissionSetId,
            'IsOwnedByProfile' => true,
            'ProfileId' => profileId,
            'Profile' => withAttributes(
              Profile.SObjectType,
              new Map<String, Object>{
                'Id' => profileId,
                'Name' => profileName
              }
            )
          }
        )
      }
    );
  }

  public static PermissionSetAssignment permissionSetAssignment(
    Id userId,
    Id permissionSetId,
    String label,
    Boolean sessionBased
  ) {
    return (PermissionSetAssignment) build(
      PermissionSetAssignment.SObjectType,
      new Map<String, Object>{
        'AssigneeId' => userId,
        'PermissionSetId' => permissionSetId,
        'PermissionSet' => withAttributes(
          PermissionSet.SObjectType,
          new Map<String, Object>{
            'Id' => permissionSetId,
            'Label' => label,
            'IsOwnedByProfile' => false,
            'HasActivationRequired' => sessionBased
          }
        )
      }
    );
  }

  public static PermissionSetAssignment groupAssignment(
    Id userId,
    Id aggregatePermissionSetId,
    Id groupId,
    String groupLabel
  ) {
    return (PermissionSetAssignment) build(
      PermissionSetAssignment.SObjectType,
      new Map<String, Object>{
        'AssigneeId' => userId,
        'PermissionSetId' => aggregatePermissionSetId,
        'PermissionSetGroupId' => groupId,
        'PermissionSet' => withAttributes(
          PermissionSet.SObjectType,
          new Map<String, Object>{
            'Id' => aggregatePermissionSetId,
            'IsOwnedByProfile' => false
          }
        ),
        'PermissionSetGroup' => withAttributes(
          PermissionSetGroup.SObjectType,
          new Map<String, Object>{
            'Id' => groupId,
            'MasterLabel' => groupLabel
          }
        )
      }
    );
  }

  /** An assignment carrying assignee details, as returned for the "By Entity" view. */
  public static PermissionSetAssignment assigneeAssignment(
    Id userId,
    String userName,
    Id permissionSetId
  ) {
    return (PermissionSetAssignment) build(
      PermissionSetAssignment.SObjectType,
      new Map<String, Object>{
        'AssigneeId' => userId,
        'PermissionSetId' => permissionSetId,
        'Assignee' => withAttributes(
          User.SObjectType,
          new Map<String, Object>{
            'Id' => userId,
            'Name' => userName,
            'Username' => userName.replace(' ', '.') + '@example.com',
            'IsActive' => true,
            'Profile' => withAttributes(
              Profile.SObjectType,
              new Map<String, Object>{ 'Name' => 'Standard User' }
            )
          }
        )
      }
    );
  }

  public static ObjectPermissions objectPermission(
    Id parentId,
    String objectName,
    Boolean canEdit,
    Boolean viewAllFields
  ) {
    return new ObjectPermissions(
      ParentId = parentId,
      SobjectType = objectName,
      PermissionsRead = true,
      PermissionsEdit = canEdit,
      PermissionsViewAllFields = viewAllFields
    );
  }

  public static FieldPermissions fieldPermission(
    Id parentId,
    String fieldKey,
    Boolean canEdit
  ) {
    return new FieldPermissions(
      ParentId = parentId,
      SobjectType = fieldKey.substringBefore('.'),
      Field = fieldKey,
      PermissionsRead = true,
      PermissionsEdit = canEdit
    );
  }

  public static SetupEntityAccess setupEntityAccess(
    Id parentId,
    Id setupEntityId,
    String setupEntityType
  ) {
    return (SetupEntityAccess) build(
      SetupEntityAccess.SObjectType,
      new Map<String, Object>{
        'ParentId' => parentId,
        'SetupEntityId' => setupEntityId,
        'SetupEntityType' => setupEntityType
      }
    );
  }

  public static PermissionSetGroupComponent groupComponent(
    Id groupId,
    Id permissionSetId,
    String permissionSetLabel
  ) {
    return (PermissionSetGroupComponent) build(
      PermissionSetGroupComponent.SObjectType,
      new Map<String, Object>{
        'PermissionSetGroupId' => groupId,
        'PermissionSetId' => permissionSetId,
        'PermissionSet' => withAttributes(
          PermissionSet.SObjectType,
          new Map<String, Object>{
            'Id' => permissionSetId,
            'Label' => permissionSetLabel
          }
        )
      }
    );
  }

  // ---------------------------------------------------------------------------------
  // Persisted data for integration tests
  // ---------------------------------------------------------------------------------

  public static Id getStandardProfileId() {
    return getProfileId(false);
  }

  public static Id getAdminProfileId() {
    return getProfileId(true);
  }

  private static Id getProfileId(Boolean modifyAllData) {
    return new AccessExplorerQueryBuilder(Profile.SObjectType)
        .selectField('Id')
        .whereEquals('UserLicense.Name', 'Salesforce')
        .whereEquals('PermissionsModifyAllData', modifyAllData)
        .orderBy('CreatedDate')
        .limitTo(1)
        .execute()[0]
      .Id;
  }

  public static User createUser(String lastName, Id profileId) {
    uniqueCounter++;
    String unique =
      String.valueOf(Crypto.getRandomInteger()).replace('-', '') +
      uniqueCounter;
    User record = new User(
      LastName = lastName,
      FirstName = 'Test',
      Alias = ('ae' + unique).left(8),
      Email = 'ae' + unique + '@example.com',
      Username = 'access.explorer.' + unique + '@example.com',
      ProfileId = profileId,
      TimeZoneSidKey = 'America/Los_Angeles',
      LocaleSidKey = 'en_US',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    insert record;
    return record;
  }

  /** A user who satisfies the Access Explorer authorization checks. */
  public static User createExplorerUser() {
    User record = createUser('Explorer', getAdminProfileId());
    assign(record.Id, getExplorerPermissionSetId());
    return record;
  }

  public static Id getExplorerPermissionSetId() {
    return new AccessExplorerQueryBuilder(PermissionSet.SObjectType)
        .selectField('Id')
        .whereEquals('Name', 'Access_Explorer_User')
        .limitTo(1)
        .execute()[0]
      .Id;
  }

  public static PermissionSet createPermissionSet(String name) {
    PermissionSet record = new PermissionSet(Name = name, Label = name);
    insert record;
    return record;
  }

  public static PermissionSetAssignment assign(Id userId, Id permissionSetId) {
    PermissionSetAssignment record = new PermissionSetAssignment(
      AssigneeId = userId,
      PermissionSetId = permissionSetId
    );
    insert record;
    return record;
  }

  public static Id getApexClassId(String className) {
    return new AccessExplorerQueryBuilder(ApexClass.SObjectType)
        .selectField('Id')
        .whereEquals('Name', className)
        .limitTo(1)
        .execute()[0]
      .Id;
  }
}
