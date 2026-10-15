@IsTest
private class SetupEntityNameResolverTest {
  @IsTest
  static void resolvesKeysAndFallsBackForUnknownOnes() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    Id classId = AccessExplorerTestDataFactory.fakeId(ApexClass.SObjectType);
    Id missingId = AccessExplorerTestDataFactory.fakeId(ApexClass.SObjectType);
    stub.lookupRecords.put(
      ApexClass.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          ApexClass.SObjectType,
          new Map<String, Object>{
            'Id' => classId,
            'Name' => 'MyController',
            'NamespacePrefix' => 'ns'
          }
        )
      }
    );
    SetupEntityNameResolver resolver = new SetupEntityNameResolver(stub);

    Map<String, AccessExplorerModels.EntityItem> resolved = resolver.resolve(
      AccessExplorerModels.EntityType.APEX_CLASS,
      new Set<String>{ classId, missingId }
    );

    Assert.areEqual('MyController', resolved.get(classId).label);
    Assert.areEqual('ns__MyController', resolved.get(classId).apiName);
    Assert.areEqual(missingId, resolved.get(missingId).label);
  }

  @IsTest
  static void fallsBackWhenLookupObjectIsUnavailable() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    stub.lookupError = new QueryException('not supported');
    SetupEntityNameResolver resolver = new SetupEntityNameResolver(stub);

    Map<String, AccessExplorerModels.EntityItem> resolved = resolver.resolve(
      AccessExplorerModels.EntityType.FLOW,
      new Set<String>{ 'My_Flow' }
    );
    Assert.areEqual('My_Flow', resolved.get('My_Flow').apiName);
  }

  @IsTest
  static void searchesWithTypeSpecificFilters() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    Id appId = AccessExplorerTestDataFactory.fakeId('02u');
    stub.lookupRecords.put(
      AppMenuItem.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          AppMenuItem.SObjectType,
          new Map<String, Object>{
            'ApplicationId' => appId,
            'Label' => 'Sales',
            'Name' => 'Sales',
            'Type' => 'TabSet'
          }
        )
      }
    );
    SetupEntityNameResolver resolver = new SetupEntityNameResolver(stub);

    List<AccessExplorerModels.EntityItem> items = resolver.search(
      AccessExplorerModels.EntityType.APP,
      'sal',
      10
    );
    Assert.areEqual(1, items.size());
    Assert.areEqual(String.valueOf(appId), items[0].key);
    Assert.areEqual('TabSet', stub.lastSearchFilters.get('Type'));
    Assert.isTrue(
      SetupEntityNameResolver.supports(AccessExplorerModels.EntityType.APP)
    );
    Assert.isFalse(
      SetupEntityNameResolver.supports(AccessExplorerModels.EntityType.FIELD)
    );
  }

  @IsTest
  static void searchesCustomSettingsAndMetadataTypes() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    stub.lookupRecords.put(
      EntityDefinition.SObjectType,
      new List<SObject>{
        AccessExplorerTestDataFactory.build(
          EntityDefinition.SObjectType,
          new Map<String, Object>{
            'DurableId' => AccessExplorerTestDataFactory.fakeId('01I'),
            'Label' => 'Feature Settings',
            'QualifiedApiName' => 'Feature_Settings__c',
            'IsCustomSetting' => true
          }
        )
      }
    );
    SetupEntityNameResolver resolver = new SetupEntityNameResolver(stub);

    List<AccessExplorerModels.EntityItem> items = resolver.search(
      AccessExplorerModels.EntityType.CUSTOM_METADATA,
      null,
      10
    );
    Assert.areEqual(1, items.size());
    Assert.areEqual('Feature Settings', items[0].label);
    Assert.areEqual(true, stub.lastSearchFilters.get('IsCustomSetting'));
  }

  @IsTest
  static void rejectsNonSetupEntityTypes() {
    try {
      new SetupEntityNameResolver()
        .search(AccessExplorerModels.EntityType.FIELD, null, 10);
      Assert.fail('Expected rejection');
    } catch (IllegalArgumentException e) {
      Assert.isNotNull(e.getMessage());
    }
  }

  @IsTest
  static void normalizesIdKeys() {
    Id classId = AccessExplorerTestDataFactory.fakeId(ApexClass.SObjectType);
    String id18 = String.valueOf(classId);
    Assert.areEqual(id18.left(15), SetupEntityNameResolver.normalizeKey(id18));
    Assert.areEqual(
      id18.left(15),
      SetupEntityNameResolver.normalizeKey(id18.left(15))
    );
    Assert.areEqual(
      'standard-account',
      SetupEntityNameResolver.normalizeKey('standard-Account')
    );
    Assert.isNull(SetupEntityNameResolver.normalizeKey(null));
  }

  @IsTest
  static void resolvesRealApexClassesEndToEnd() {
    Id classId = AccessExplorerTestDataFactory.getApexClassId(
      'AccessGrantService'
    );
    Map<String, AccessExplorerModels.EntityItem> resolved = new SetupEntityNameResolver()
      .resolve(
        AccessExplorerModels.EntityType.APEX_CLASS,
        new Set<String>{ classId }
      );
    Assert.areEqual('AccessGrantService', resolved.get(classId).label);

    List<AccessExplorerModels.EntityItem> found = new SetupEntityNameResolver()
      .search(AccessExplorerModels.EntityType.APEX_CLASS, 'AccessGrantServ', 5);
    Assert.isFalse(found.isEmpty());
  }

  @IsTest
  static void resolvesRealTabsEndToEnd() {
    Map<String, AccessExplorerModels.EntityItem> resolved = new SetupEntityNameResolver()
      .resolve(
        AccessExplorerModels.EntityType.TAB,
        new Set<String>{ 'standard-Account' }
      );
    String label = resolved.get('standard-Account').label;
    Assert.isFalse(
      label == 'standard-Account',
      'Tab label should resolve, got: ' + label
    );
  }

  @IsTest
  static void derivesLabelsForStandardTabsMissingFromTabDefinition() {
    AccessExplorerModels.EntityType tab = AccessExplorerModels.EntityType.TAB;
    Assert.areEqual(
      Schema.SObjectType.Account.getLabelPlural(),
      SetupEntityNameResolver.fallbackLabel(tab, 'standard-Account')
    );
    Assert.areEqual(
      'AI Prediction Score',
      SetupEntityNameResolver.fallbackLabel(tab, 'standard-AIPredictionScore')
    );
    Assert.areEqual(
      'standard-',
      SetupEntityNameResolver.fallbackLabel(tab, 'standard-')
    );
    Assert.areEqual(
      'Custom_Tab',
      SetupEntityNameResolver.fallbackLabel(tab, 'Custom_Tab')
    );
    Assert.areEqual(
      'standard-Account',
      SetupEntityNameResolver.fallbackLabel(
        AccessExplorerModels.EntityType.APP,
        'standard-Account'
      )
    );
  }

  @IsTest
  static void lookupQueriesAreValidForEverySetupEntityType() {
    // Runs each type's real lookup query so a field SOQL rejects fails here instead
    // of silently degrading to unresolved keys.
    SetupEntityNameResolver resolver = new SetupEntityNameResolver();
    for (
      AccessExplorerModels.EntityType entityType : AccessExplorerModels.EntityType.values()
    ) {
      if (SetupEntityNameResolver.supports(entityType)) {
        try {
          resolver.search(entityType, null, 1);
        } catch (QueryException e) {
          Assert.fail(entityType + ' lookup query failed: ' + e.getMessage());
        }
      }
    }
  }
}
