/**
 * Discovers system (user) permissions from the PermissionSet schema and evaluates which
 * permission sets enable them. The describe-derived list doubles as the allow-list used
 * to validate any permission name supplied by the client.
 */
public inherited sharing class SystemPermissionService {
  public static final String VIEW_ALL_DATA = 'PermissionsViewAllData';
  public static final String MODIFY_ALL_DATA = 'PermissionsModifyAllData';
  public static final String VIEW_SETUP = 'PermissionsViewSetup';

  private static final String PERMISSION_PREFIX = 'permissions';
  private static Map<String, String> permissionLabelCache;
  private static Map<String, String> canonicalNameCache;

  private final IAccessExplorerSelector selector;

  public SystemPermissionService() {
    this(new AccessExplorerSelector());
  }

  public SystemPermissionService(IAccessExplorerSelector selector) {
    this.selector = selector;
  }

  /**
   * @return map of permission field API name to its label, for every boolean
   *         Permissions* field on PermissionSet.
   */
  public Map<String, String> getPermissionLabels() {
    if (permissionLabelCache == null) {
      permissionLabelCache = new Map<String, String>();
      for (
        Schema.SObjectField field : AccessExplorerSchemaUtil.getFieldMap(
            PermissionSet.SObjectType
          )
          .values()
      ) {
        Schema.DescribeFieldResult describe = field.getDescribe();
        if (
          describe.getName().toLowerCase().startsWith(PERMISSION_PREFIX) &&
          describe.getType() == Schema.DisplayType.BOOLEAN
        ) {
          permissionLabelCache.put(describe.getName(), describe.getLabel());
        }
      }
    }
    return permissionLabelCache;
  }

  /**
   * Validates a permission name against the describe allow-list.
   * @return the canonical field name.
   * @throws IllegalArgumentException when the name is not a system permission.
   */
  public String validatePermissionName(String permissionName) {
    if (canonicalNameCache == null) {
      canonicalNameCache = new Map<String, String>();
      for (String candidate : getPermissionLabels().keySet()) {
        canonicalNameCache.put(candidate.toLowerCase(), candidate);
      }
    }
    String canonical = String.isBlank(permissionName)
      ? null
      : canonicalNameCache.get(permissionName.trim().toLowerCase());
    if (canonical == null) {
      throw new IllegalArgumentException('Unknown system permission.');
    }
    return canonical;
  }

  public String getLabel(String permissionName) {
    return getPermissionLabels().get(validatePermissionName(permissionName));
  }

  /**
   * @return map of permission field name to the ids of the given permission sets that
   *         enable it. Only enabled permissions are included.
   */
  public Map<String, Set<Id>> getEnabledPermissions(Set<Id> permissionSetIds) {
    return getEnabledPermissions(
      permissionSetIds,
      new List<String>(getPermissionLabels().keySet())
    );
  }

  public Map<String, Set<Id>> getEnabledPermissions(
    Set<Id> permissionSetIds,
    List<String> permissionNames
  ) {
    List<String> validated = new List<String>();
    for (String permissionName : permissionNames) {
      validated.add(validatePermissionName(permissionName));
    }
    Map<String, Set<Id>> result = new Map<String, Set<Id>>();
    for (
      PermissionSet permissionSet : selector.getPermissionSetsWithFields(
        permissionSetIds,
        validated
      )
    ) {
      for (String permissionName : validated) {
        if (permissionSet.get(permissionName) == true) {
          if (!result.containsKey(permissionName)) {
            result.put(permissionName, new Set<Id>());
          }
          result.get(permissionName).add(permissionSet.Id);
        }
      }
    }
    return result;
  }

  /**
   * @return ids of every permission set (profiles and groups included) that enables
   *         the permission, org-wide.
   */
  public Set<Id> getPermissionSetIdsWithPermission(String permissionName) {
    Set<Id> result = new Set<Id>();
    for (
      PermissionSet permissionSet : selector.getPermissionSetsWithPermissionEnabled(
        validatePermissionName(permissionName)
      )
    ) {
      result.add(permissionSet.Id);
    }
    return result;
  }

  /**
   * @return all system permissions as entity items, optionally filtered by label.
   */
  public List<AccessExplorerModels.EntityItem> getPermissionItems(
    String searchTerm
  ) {
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    Map<String, String> labels = getPermissionLabels();
    for (String permissionName : labels.keySet()) {
      String label = labels.get(permissionName);
      if (
        String.isBlank(searchTerm) ||
        label.containsIgnoreCase(searchTerm) ||
        permissionName.containsIgnoreCase(searchTerm)
      ) {
        items.add(
          new AccessExplorerModels.EntityItem(
            AccessExplorerModels.EntityType.SYSTEM_PERMISSION,
            permissionName,
            label,
            permissionName
          )
        );
      }
    }
    items.sort();
    return items;
  }
}
