@IsTest
private class AccessExplorerQueryBuilderTest {
  @IsTest
  static void buildsParameterizedQueryWithBinds() {
    Set<Id> ids = new Set<Id>{ UserInfo.getUserId() };

    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        PermissionSetAssignment.SObjectType
      )
      .selectFields(
        new List<String>{ 'id', 'AssigneeId', 'permissionset.profile.name' }
      )
      .selectField('Id')
      .whereIn('AssigneeId', ids)
      .whereEquals('PermissionSet.IsOwnedByProfile', true)
      .whereNotEquals('PermissionSetId', null)
      .whereGreaterThan('SystemModstamp', Datetime.newInstance(2000, 1, 1))
      .whereNullOrGreaterThan('ExpirationDate', Datetime.now())
      .orderBy('Assignee.Name')
      .orderByDescending('SystemModstamp')
      .limitTo(5);

    String soql = builder.toSoql();
    Assert.areEqual(
      'SELECT Id, AssigneeId, PermissionSet.Profile.Name FROM PermissionSetAssignment' +
        ' WHERE AssigneeId IN :bind0 AND PermissionSet.IsOwnedByProfile = :bind1' +
        ' AND PermissionSetId != :bind2 AND SystemModstamp > :bind3' +
        ' AND (ExpirationDate = null OR ExpirationDate > :bind4)' +
        ' ORDER BY Assignee.Name ASC NULLS LAST, SystemModstamp DESC NULLS LAST LIMIT 5',
      soql,
      'Identifiers should be canonicalized, values bound and duplicates removed'
    );
    Map<String, Object> binds = builder.getBinds();
    Assert.areEqual(5, binds.size());
    Assert.areEqual(ids, binds.get('bind0'));
    Assert.areEqual(true, binds.get('bind1'));

    List<SObject> rows = builder.execute();
    Assert.areEqual(
      1,
      rows.size(),
      'Running user has exactly one profile assignment'
    );
  }

  @IsTest
  static void defaultsToIdAndDefaultLimit() {
    String soql = new AccessExplorerQueryBuilder(User.SObjectType).toSoql();
    Assert.areEqual(
      'SELECT Id FROM User LIMIT ' + AccessExplorerQueryBuilder.DEFAULT_LIMIT,
      soql
    );
  }

  @IsTest
  static void capsLimit() {
    String soql = new AccessExplorerQueryBuilder(User.SObjectType)
      .limitTo(AccessExplorerQueryBuilder.MAX_LIMIT + 1)
      .toSoql();
    Assert.isTrue(
      soql.endsWith('LIMIT ' + AccessExplorerQueryBuilder.MAX_LIMIT),
      soql
    );
  }

  @IsTest
  static void containsSearchEscapesWildcardsAndSharesBind() {
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
        User.SObjectType
      )
      .whereAnyContains(new List<String>{ 'Name', 'Username' }, '50%_off\\')
      .whereContains('Email', 'x');

    Assert.areEqual(
      'SELECT Id FROM User WHERE (Name LIKE :bind0 OR Username LIKE :bind0)' +
        ' AND (Email LIKE :bind1) LIMIT ' +
        AccessExplorerQueryBuilder.DEFAULT_LIMIT,
      builder.toSoql()
    );
    Assert.areEqual('%50\\%\\_off\\\\%', builder.getBinds().get('bind0'));
    Assert.areEqual(
      '%%',
      '%' + AccessExplorerQueryBuilder.escapeLike(null) + '%'
    );
  }

  @IsTest
  static void injectionAttemptsInValuesAreInert() {
    String malicious = '\' OR Name != \'';
    List<SObject> rows = new AccessExplorerQueryBuilder(User.SObjectType)
      .whereEquals('Name', malicious)
      .execute();
    Assert.isTrue(rows.isEmpty(), 'Value must be bound, not concatenated');
  }

  @IsTest
  static void rejectsInvalidIdentifiers() {
    List<String> invalidPaths = new List<String>{
      null,
      ' ',
      'Name FROM User WHERE Id != null --',
      'NotAField__x',
      'Profile.NotAField__x',
      'NotARelationship.Name',
      'Name.Foo',
      'Profile.CreatedBy.Profile.CreatedBy.Name'
    };
    for (String path : invalidPaths) {
      try {
        new AccessExplorerQueryBuilder(User.SObjectType).selectField(path);
        Assert.fail('Expected rejection of: ' + path);
      } catch (AccessExplorerQueryBuilder.QueryBuilderException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
  }

  @IsTest
  static void rejectsInvalidArguments() {
    AccessExplorerQueryBuilder builder = new AccessExplorerQueryBuilder(
      User.SObjectType
    );
    List<String> failures = new List<String>();
    try {
      new AccessExplorerQueryBuilder(null);
    } catch (AccessExplorerQueryBuilder.QueryBuilderException e) {
      failures.add('type');
    }
    try {
      builder.whereIn('Id', null);
    } catch (AccessExplorerQueryBuilder.QueryBuilderException e) {
      failures.add('in');
    }
    try {
      builder.whereAnyContains(new List<String>(), 'x');
    } catch (AccessExplorerQueryBuilder.QueryBuilderException e) {
      failures.add('contains');
    }
    try {
      builder.limitTo(0);
    } catch (AccessExplorerQueryBuilder.QueryBuilderException e) {
      failures.add('limit');
    }
    Assert.areEqual(
      new List<String>{ 'type', 'in', 'contains', 'limit' },
      failures
    );
  }
}
