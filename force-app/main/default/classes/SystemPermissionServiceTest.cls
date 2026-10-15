@IsTest
private class SystemPermissionServiceTest {
  @IsTest
  static void discoversPermissionsFromSchema() {
    SystemPermissionService service = new SystemPermissionService(
      new AccessExplorerSelectorStub()
    );
    Map<String, String> labels = service.getPermissionLabels();
    Assert.isTrue(labels.containsKey(SystemPermissionService.MODIFY_ALL_DATA));
    Assert.isTrue(labels.containsKey(SystemPermissionService.VIEW_SETUP));
    for (String name : labels.keySet()) {
      Assert.isTrue(name.startsWith('Permissions'), name);
    }
    Assert.areEqual(
      SystemPermissionService.MODIFY_ALL_DATA,
      service.validatePermissionName(' permissionsmodifyalldata ')
    );
    Assert.areEqual(
      labels.get(SystemPermissionService.VIEW_ALL_DATA),
      service.getLabel(SystemPermissionService.VIEW_ALL_DATA)
    );
  }

  @IsTest
  static void rejectsNamesOutsideAllowList() {
    SystemPermissionService service = new SystemPermissionService();
    for (
      String invalid : new List<String>{
        null,
        'Name',
        'PermissionsModifyAllData = true OR Id != null'
      }
    ) {
      try {
        service.validatePermissionName(invalid);
        Assert.fail('Expected rejection of ' + invalid);
      } catch (IllegalArgumentException e) {
        Assert.areEqual('Unknown system permission.', e.getMessage());
      }
    }
  }

  @IsTest
  static void evaluatesEnabledPermissions() {
    AccessExplorerSelectorStub stub = new AccessExplorerSelectorStub();
    Id adminSet = AccessExplorerTestDataFactory.fakeId(
      PermissionSet.SObjectType
    );
    Id apiSet = AccessExplorerTestDataFactory.fakeId(PermissionSet.SObjectType);
    stub.permissionSets.add(
      new PermissionSet(
        Id = adminSet,
        PermissionsModifyAllData = true,
        PermissionsApiEnabled = true
      )
    );
    stub.permissionSets.add(
      new PermissionSet(Id = apiSet, PermissionsApiEnabled = true)
    );
    SystemPermissionService service = new SystemPermissionService(stub);

    Map<String, Set<Id>> enabled = service.getEnabledPermissions(
      new Set<Id>{ adminSet, apiSet }
    );
    Assert.areEqual(
      new Set<Id>{ adminSet },
      enabled.get(SystemPermissionService.MODIFY_ALL_DATA)
    );
    Assert.areEqual(
      new Set<Id>{ adminSet, apiSet },
      enabled.get('PermissionsApiEnabled')
    );
    Assert.isFalse(enabled.containsKey(SystemPermissionService.VIEW_SETUP));

    Assert.areEqual(
      new Set<Id>{ adminSet, apiSet },
      service.getPermissionSetIdsWithPermission('permissionsapienabled')
    );
  }

  @IsTest
  static void searchesPermissionItems() {
    SystemPermissionService service = new SystemPermissionService(
      new AccessExplorerSelectorStub()
    );
    List<AccessExplorerModels.EntityItem> all = service.getPermissionItems(
      null
    );
    Assert.areEqual(service.getPermissionLabels().size(), all.size());

    List<AccessExplorerModels.EntityItem> filtered = service.getPermissionItems(
      'Modify All Data'
    );
    Boolean found = false;
    for (AccessExplorerModels.EntityItem item : filtered) {
      found = found || item.key == SystemPermissionService.MODIFY_ALL_DATA;
      Assert.areEqual('SYSTEM_PERMISSION', item.entityType);
    }
    Assert.isTrue(found);
    Assert.isTrue(filtered.size() < all.size());
  }
}
