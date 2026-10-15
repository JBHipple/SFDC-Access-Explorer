@IsTest
private class AccessExplorerSecurityTest {
  @IsTest
  static void grantsAccessWithPermissionSet() {
    User explorer = AccessExplorerTestDataFactory.createExplorerUser();
    System.runAs(explorer) {
      Assert.isTrue(AccessExplorerSecurity.canUse());
      AccessExplorerSecurity.assertCanUse();
    }
  }

  @IsTest
  static void deniesAccessWithoutPermissionSet() {
    User standard = AccessExplorerTestDataFactory.createUser(
      'Standard',
      AccessExplorerTestDataFactory.getStandardProfileId()
    );
    System.runAs(standard) {
      Assert.isFalse(AccessExplorerSecurity.canUse());
      try {
        AccessExplorerSecurity.assertCanUse();
        Assert.fail('Expected access to be denied');
      } catch (AccessExplorerSecurity.AccessDeniedException e) {
        Assert.areEqual(
          AccessExplorerSecurity.ACCESS_DENIED_MESSAGE,
          e.getMessage()
        );
      }
    }
  }

  @IsTest
  static void cachesResultPerTransaction() {
    AccessExplorerSecurity.canUseCache = false;
    Assert.isFalse(AccessExplorerSecurity.canUse());
    AccessExplorerSecurity.canUseCache = true;
    Assert.isTrue(AccessExplorerSecurity.canUse());
  }

  @IsTest
  static void sanitizesSearchTerms() {
    Assert.isNull(AccessExplorerSecurity.sanitizeSearchTerm(null));
    Assert.isNull(AccessExplorerSecurity.sanitizeSearchTerm('   '));
    Assert.areEqual('abc', AccessExplorerSecurity.sanitizeSearchTerm(' abc '));
    Assert.areEqual(
      AccessExplorerSecurity.MAX_SEARCH_LENGTH,
      AccessExplorerSecurity.sanitizeSearchTerm('x'.repeat(500)).length()
    );
  }

  @IsTest
  static void exposesOnlySafeMessagesToClients() {
    Assert.areEqual(
      'Unknown object.',
      AccessExplorerSecurity.toClientException(
          new IllegalArgumentException('Unknown object.')
        )
        .getMessage()
    );
    Assert.areEqual(
      'denied',
      AccessExplorerSecurity.toClientException(
          new AccessExplorerSecurity.AccessDeniedException('denied')
        )
        .getMessage()
    );
    Assert.areEqual(
      AccessExplorerSecurity.GENERIC_ERROR_MESSAGE,
      AccessExplorerSecurity.toClientException(
          new QueryException('internal detail: SELECT ...')
        )
        .getMessage()
    );
  }
}
