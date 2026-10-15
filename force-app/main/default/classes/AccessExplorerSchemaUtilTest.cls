@IsTest
private class AccessExplorerSchemaUtilTest {
  @IsTest
  static void describesKnownObjectsAndFields() {
    Assert.isTrue(AccessExplorerSchemaUtil.isValidObject(' account '));
    Assert.areEqual(
      Account.SObjectType,
      AccessExplorerSchemaUtil.getSObjectType('Account')
    );
    Assert.areEqual(
      Schema.SObjectType.Account.getLabel(),
      AccessExplorerSchemaUtil.getObjectLabel('account')
    );
    // Second call is served from the cache.
    Assert.areEqual(
      AccessExplorerSchemaUtil.describeObject('Account'),
      AccessExplorerSchemaUtil.describeObject('Account')
    );
    Assert.areEqual(
      'Industry',
      AccessExplorerSchemaUtil.describeField('Account.industry').getName()
    );
  }

  @IsTest
  static void handlesUnknownNames() {
    Assert.isFalse(AccessExplorerSchemaUtil.isValidObject(null));
    Assert.isFalse(AccessExplorerSchemaUtil.isValidObject('Nope__x'));
    Assert.isNull(AccessExplorerSchemaUtil.describeObject('Nope__x'));
    Assert.areEqual(
      'Nope__x',
      AccessExplorerSchemaUtil.getObjectLabel('Nope__x')
    );
    Assert.isNull(AccessExplorerSchemaUtil.describeField(null));
    Assert.isNull(AccessExplorerSchemaUtil.describeField('Account'));
    Assert.isNull(AccessExplorerSchemaUtil.describeField('Nope__x.Name'));
    Assert.isNull(AccessExplorerSchemaUtil.describeField('Account.Nope__c'));
  }
}
