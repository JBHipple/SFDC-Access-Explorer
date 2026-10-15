@IsTest
private class AccessExplorerModelsTest {
  @IsTest
  static void parsesEntityTypesAgainstAllowList() {
    Assert.areEqual(
      AccessExplorerModels.EntityType.APEX_CLASS,
      AccessExplorerModels.parseEntityType(' apex_class ')
    );
    for (String invalid : new List<String>{ null, '', 'DROP TABLE' }) {
      try {
        AccessExplorerModels.parseEntityType(invalid);
        Assert.fail('Expected rejection of ' + invalid);
      } catch (IllegalArgumentException e) {
        Assert.areEqual('Unknown entity type.', e.getMessage());
      }
    }
  }

  @IsTest
  static void everyEntityTypeHasALabel() {
    for (
      AccessExplorerModels.EntityType entityType : AccessExplorerModels.EntityType.values()
    ) {
      Assert.isTrue(
        AccessExplorerModels.ENTITY_TYPE_LABELS.containsKey(entityType),
        entityType.name()
      );
    }
  }

  @IsTest
  static void entityItemsSortByLabelAndFallBackToApiName() {
    AccessExplorerModels.EntityItem beta = new AccessExplorerModels.EntityItem(
      AccessExplorerModels.EntityType.APEX_CLASS,
      'k1',
      ' beta ',
      'Beta'
    );
    AccessExplorerModels.EntityItem alpha = new AccessExplorerModels.EntityItem(
      AccessExplorerModels.EntityType.APEX_CLASS,
      'k2',
      null,
      'Alpha'
    );
    AccessExplorerModels.EntityGroup entityGroup = new AccessExplorerModels.EntityGroup(
      AccessExplorerModels.EntityType.APEX_CLASS,
      new List<AccessExplorerModels.EntityItem>{ beta, alpha }
    );
    Assert.areEqual('Apex Classes', entityGroup.label);
    Assert.areEqual('Alpha', entityGroup.items[0].label);
    Assert.areEqual('beta', entityGroup.items[1].label);
  }

  @IsTest
  static void accessSourcesSortProfileThenGroupThenPermissionSet() {
    List<AccessExplorerModels.AccessSource> sources = new List<AccessExplorerModels.AccessSource>{
      new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PERMISSION_SET,
        null,
        'b'
      ),
      new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PERMISSION_SET,
        null,
        'A'
      ),
      new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PERMISSION_SET_GROUP,
        null,
        'z'
      ),
      new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PROFILE,
        null,
        null
      )
    };
    sources.sort();
    Assert.areEqual(AccessExplorerModels.SOURCE_PROFILE, sources[0].sourceType);
    Assert.areEqual('z', sources[1].name);
    Assert.areEqual('A', sources[2].name);
    Assert.areEqual('b', sources[3].name);
  }

  @IsTest
  static void copiesSourceIdentityOnly() {
    AccessExplorerModels.AccessSource source = new AccessExplorerModels.AccessSource(
      AccessExplorerModels.SOURCE_PERMISSION_SET,
      UserInfo.getUserId(),
      'Name'
    );
    source.isSessionBased = true;
    source.grantedPermissions.add('Read');
    AccessExplorerModels.AccessSource copy = source.copy();
    Assert.areEqual('Name', copy.name);
    Assert.isTrue(copy.isSessionBased);
    Assert.isTrue(copy.grantedPermissions.isEmpty());
  }
}
