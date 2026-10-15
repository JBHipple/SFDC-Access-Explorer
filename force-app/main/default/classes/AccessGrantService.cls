/**
 * Core Access Explorer logic. Answers two questions in both directions:
 *  - What can a user access, and which profile / permission sets / groups grant it?
 *  - Which users can access an entity, and through what?
 *
 * Every assignment points at a PermissionSet record: profiles own one, and permission
 * set groups have an aggregate one (whose permission rows already account for muting).
 * Those PermissionSet ids are the "containers" all permission rows are matched against.
 */
public inherited sharing class AccessGrantService {
  public static final Integer DEFAULT_USER_LIMIT = 500;
  public static final Integer MAX_USER_LIMIT = 2000;

  private static final Integer MAX_ASSIGNMENT_ROWS = 10000;
  private static final String PERM_READ = 'Read';
  private static final String PERM_EDIT = 'Edit';
  private static final String PERM_ACCESS = 'Access';
  private static final String PERM_ENABLED = 'Enabled';
  private static final String VIEW_ALL_FIELDS_LABEL = 'View All Fields';

  /** ObjectPermissions fields in display order, with their labels. */
  private static final List<List<String>> OBJECT_PERMISSIONS = new List<List<String>>{
    new List<String>{ 'PermissionsRead', PERM_READ },
    new List<String>{ 'PermissionsCreate', 'Create' },
    new List<String>{ 'PermissionsEdit', PERM_EDIT },
    new List<String>{ 'PermissionsDelete', 'Delete' },
    new List<String>{ 'PermissionsViewAllRecords', 'View All Records' },
    new List<String>{ 'PermissionsModifyAllRecords', 'Modify All Records' },
    new List<String>{ 'PermissionsViewAllFields', VIEW_ALL_FIELDS_LABEL }
  };

  private static final Map<String, String> TAB_VISIBILITY_LABELS = new Map<String, String>{
    'DefaultOn' => 'Visible',
    'DefaultOff' => 'Available'
  };

  /** Object name suffixes that never carry their own object permissions. */
  private static final List<String> NON_PERMISSIONABLE_SUFFIXES = new List<String>{
    'share',
    'history',
    'feed',
    'changeevent',
    '__mdt',
    '__e',
    '__tag'
  };

  private final IAccessExplorerSelector selector;
  private final SystemPermissionService systemPermissions;
  private final SetupEntityNameResolver nameResolver;

  public AccessGrantService() {
    this(new AccessExplorerSelector());
  }

  @TestVisible
  private AccessGrantService(IAccessExplorerSelector selector) {
    this.selector = selector;
    this.systemPermissions = new SystemPermissionService(selector);
    this.nameResolver = new SetupEntityNameResolver(selector);
  }

  // ---------------------------------------------------------------------------------
  // By user
  // ---------------------------------------------------------------------------------

  /**
   * @return every entity the user can access, grouped by entity type in display order.
   */
  public List<AccessExplorerModels.EntityGroup> getUserEntities(Id userId) {
    Set<Id> permissionSetIds = getContainers(userId).keySet();
    List<AccessExplorerModels.EntityGroup> groups = new List<AccessExplorerModels.EntityGroup>{
      new AccessExplorerModels.EntityGroup(
        AccessExplorerModels.EntityType.SOBJECT_TYPE,
        getUserObjects(permissionSetIds)
      ),
      new AccessExplorerModels.EntityGroup(
        AccessExplorerModels.EntityType.SYSTEM_PERMISSION,
        getUserSystemPermissions(permissionSetIds)
      )
    };
    groups.addAll(getUserSetupEntities(permissionSetIds));
    groups.add(
      new AccessExplorerModels.EntityGroup(
        AccessExplorerModels.EntityType.TAB,
        getUserTabs(permissionSetIds)
      )
    );
    return groups;
  }

  /**
   * @return the fields of one object the user can read, with Read/Edit summaries.
   *         Includes fields readable only through the View All Fields object permission.
   */
  public List<AccessExplorerModels.EntityItem> getUserFields(
    Id userId,
    String objectName
  ) {
    String canonicalObject = validateObjectName(objectName);
    Set<Id> permissionSetIds = getContainers(userId).keySet();

    Map<String, Boolean> editableByField = new Map<String, Boolean>();
    for (
      FieldPermissions permission : selector.getFieldPermissions(
        permissionSetIds,
        canonicalObject,
        null
      )
    ) {
      String fieldKey = permission.Field;
      editableByField.put(
        fieldKey,
        editableByField.get(fieldKey) == true || permission.PermissionsEdit
      );
    }

    Boolean viewAllFields = false;
    for (
      ObjectPermissions permission : selector.getObjectPermissions(
        permissionSetIds,
        canonicalObject
      )
    ) {
      viewAllFields = viewAllFields || permission.PermissionsViewAllFields;
    }

    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    Set<String> seen = new Set<String>();
    for (String fieldKey : editableByField.keySet()) {
      AccessExplorerModels.EntityItem item = toFieldItem(fieldKey);
      item.summary = editableByField.get(fieldKey)
        ? PERM_READ + ', ' + PERM_EDIT
        : PERM_READ;
      items.add(item);
      seen.add(fieldKey.toLowerCase());
    }
    if (viewAllFields) {
      for (
        Schema.DescribeFieldResult field : getPermissionableFields(
          canonicalObject
        )
      ) {
        String fieldKey = canonicalObject + '.' + field.getName();
        if (!seen.contains(fieldKey.toLowerCase())) {
          AccessExplorerModels.EntityItem item = toFieldItem(fieldKey);
          item.summary = PERM_READ + ' (' + VIEW_ALL_FIELDS_LABEL + ')';
          items.add(item);
        }
      }
    }
    items.sort();
    return items;
  }

  /**
   * @return the profile, permission sets and groups that give the user access to the
   *         entity, including access implied by broader permissions.
   */
  public List<AccessExplorerModels.AccessSource> getSourcesForUserEntity(
    Id userId,
    String entityTypeName,
    String entityKey
  ) {
    AccessExplorerModels.EntityType entityType = AccessExplorerModels.parseEntityType(
      entityTypeName
    );
    Map<Id, AccessExplorerModels.AccessSource> containers = getContainers(
      userId
    );

    // Component permission sets of assigned groups, so we can say which ones
    // contribute the access ("via ...").
    Map<Id, Id> groupByAggregate = new Map<Id, Id>();
    for (Id permissionSetId : containers.keySet()) {
      AccessExplorerModels.AccessSource source = containers.get(
        permissionSetId
      );
      if (
        source.sourceType == AccessExplorerModels.SOURCE_PERMISSION_SET_GROUP
      ) {
        groupByAggregate.put(permissionSetId, source.recordId);
      }
    }
    Map<Id, List<PermissionSetGroupComponent>> componentsByGroup = getGroupComponents(
      new Set<Id>(groupByAggregate.values())
    );

    Set<Id> evaluateIds = new Set<Id>(containers.keySet());
    for (
      List<PermissionSetGroupComponent> components : componentsByGroup.values()
    ) {
      for (PermissionSetGroupComponent component : components) {
        evaluateIds.add(component.PermissionSetId);
      }
    }

    Map<Id, List<String>> grants = evaluateGrants(
      entityType,
      entityKey,
      evaluateIds
    );

    List<AccessExplorerModels.AccessSource> sources = new List<AccessExplorerModels.AccessSource>();
    for (Id permissionSetId : containers.keySet()) {
      if (!grants.containsKey(permissionSetId)) {
        continue;
      }
      AccessExplorerModels.AccessSource source = containers.get(permissionSetId)
        .copy();
      source.grantedPermissions = grants.get(permissionSetId);
      Id groupId = groupByAggregate.get(permissionSetId);
      if (groupId != null && componentsByGroup.containsKey(groupId)) {
        for (
          PermissionSetGroupComponent component : componentsByGroup.get(groupId)
        ) {
          if (grants.containsKey(component.PermissionSetId)) {
            source.viaComponents.add(component.PermissionSet.Label);
          }
        }
        source.viaComponents.sort();
      }
      sources.add(source);
    }
    sources.addAll(getImpliedSources(entityType, entityKey, containers));
    sources.sort();
    return sources;
  }

  // ---------------------------------------------------------------------------------
  // By entity
  // ---------------------------------------------------------------------------------

  /**
   * @return active users who can access the entity, optionally filtered by name.
   */
  public AccessExplorerModels.UserListResult getUsersWithAccess(
    String entityTypeName,
    String entityKey,
    String userSearchTerm,
    Integer userLimit
  ) {
    AccessExplorerModels.EntityType entityType = AccessExplorerModels.parseEntityType(
      entityTypeName
    );
    Integer maxUsers = normalizeUserLimit(userLimit);

    Set<Id> grantingIds = new Set<Id>(
      evaluateGrants(entityType, entityKey, null).keySet()
    );
    grantingIds.addAll(getImpliedGrantingIds(entityType, entityKey));

    AccessExplorerModels.UserListResult result = new AccessExplorerModels.UserListResult();
    if (grantingIds.isEmpty()) {
      return result;
    }
    List<PermissionSetAssignment> assignments = selector.getActiveAssignmentsForPermissionSets(
      grantingIds,
      userSearchTerm,
      MAX_ASSIGNMENT_ROWS
    );
    Set<Id> seenUsers = new Set<Id>();
    for (PermissionSetAssignment assignment : assignments) {
      if (!seenUsers.add(assignment.AssigneeId)) {
        continue;
      }
      if (result.users.size() == maxUsers) {
        result.truncated = true;
        break;
      }
      result.users.add(
        new AccessExplorerModels.UserOption(assignment.Assignee)
      );
    }
    if (assignments.size() >= MAX_ASSIGNMENT_ROWS) {
      result.truncated = true;
    }
    return result;
  }

  /**
   * @return selectable entities of one type, for the "By Entity" picker. Fields
   *         require the parent object name.
   */
  public List<AccessExplorerModels.EntityItem> searchEntities(
    String entityTypeName,
    String searchTerm,
    String objectName,
    Integer rowLimit
  ) {
    AccessExplorerModels.EntityType entityType = AccessExplorerModels.parseEntityType(
      entityTypeName
    );
    switch on entityType {
      when SOBJECT_TYPE {
        return searchObjects(searchTerm, rowLimit);
      }
      when FIELD {
        return searchFields(objectName, searchTerm, rowLimit);
      }
      when SYSTEM_PERMISSION {
        return truncate(
          systemPermissions.getPermissionItems(searchTerm),
          rowLimit
        );
      }
      when else {
        return nameResolver.search(entityType, searchTerm, rowLimit);
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // Grant evaluation
  // ---------------------------------------------------------------------------------

  /**
   * Evaluates direct grants of one entity.
   * @param permissionSetIds the permission sets to check, or null for org-wide.
   * @return map of granting permission set id to the permissions it grants.
   */
  @TestVisible
  private Map<Id, List<String>> evaluateGrants(
    AccessExplorerModels.EntityType entityType,
    String entityKey,
    Set<Id> permissionSetIds
  ) {
    Map<Id, List<String>> grants = new Map<Id, List<String>>();
    switch on entityType {
      when SOBJECT_TYPE {
        for (
          ObjectPermissions permission : selector.getObjectPermissions(
            permissionSetIds,
            validateObjectName(entityKey)
          )
        ) {
          grants.put(
            permission.ParentId,
            getObjectPermissionLabels(permission)
          );
        }
      }
      when FIELD {
        String fieldKey = validateFieldKey(entityKey);
        for (
          FieldPermissions permission : selector.getFieldPermissions(
            permissionSetIds,
            fieldKey.substringBefore('.'),
            fieldKey
          )
        ) {
          grants.put(
            permission.ParentId,
            permission.PermissionsEdit
              ? new List<String>{ PERM_READ, PERM_EDIT }
              : new List<String>{ PERM_READ }
          );
        }
      }
      when SYSTEM_PERMISSION {
        String permissionName = systemPermissions.validatePermissionName(
          entityKey
        );
        Set<Id> enabledIds = new Set<Id>();
        if (permissionSetIds == null) {
          enabledIds = systemPermissions.getPermissionSetIdsWithPermission(
            permissionName
          );
        } else {
          Map<String, Set<Id>> enabled = systemPermissions.getEnabledPermissions(
            permissionSetIds,
            new List<String>{ permissionName }
          );
          if (enabled.containsKey(permissionName)) {
            enabledIds = enabled.get(permissionName);
          }
        }
        for (Id permissionSetId : enabledIds) {
          grants.put(permissionSetId, new List<String>{ PERM_ENABLED });
        }
      }
      when TAB {
        for (
          PermissionSetTabSetting setting : selector.getTabSettings(
            permissionSetIds,
            requireKey(entityKey)
          )
        ) {
          String label = TAB_VISIBILITY_LABELS.get(setting.Visibility);
          grants.put(
            setting.ParentId,
            new List<String>{ label == null ? setting.Visibility : label }
          );
        }
      }
      when else {
        Id setupEntityId = toIdOrNull(entityKey);
        if (setupEntityId == null) {
          return grants;
        }
        for (
          SetupEntityAccess access : selector.getSetupEntityAccess(
            permissionSetIds,
            new Set<String>{
              AccessExplorerModels.SETUP_ENTITY_TYPES.get(entityType)
            },
            setupEntityId
          )
        ) {
          grants.put(access.ParentId, new List<String>{ PERM_ACCESS });
        }
      }
    }
    return grants;
  }

  /**
   * Sources whose access is implied by broader permissions rather than granted
   * directly: View/Modify All Data for objects, View All Fields for fields.
   */
  private List<AccessExplorerModels.AccessSource> getImpliedSources(
    AccessExplorerModels.EntityType entityType,
    String entityKey,
    Map<Id, AccessExplorerModels.AccessSource> containers
  ) {
    List<AccessExplorerModels.AccessSource> sources = new List<AccessExplorerModels.AccessSource>();
    if (entityType == AccessExplorerModels.EntityType.SOBJECT_TYPE) {
      Map<String, Set<Id>> enabled = systemPermissions.getEnabledPermissions(
        containers.keySet(),
        new List<String>{
          SystemPermissionService.VIEW_ALL_DATA,
          SystemPermissionService.MODIFY_ALL_DATA
        }
      );
      for (String permissionName : enabled.keySet()) {
        List<String> granted = permissionName ==
          SystemPermissionService.MODIFY_ALL_DATA
          ? new List<String>{
              PERM_READ,
              'Create',
              PERM_EDIT,
              'Delete',
              'View All Records',
              'Modify All Records'
            }
          : new List<String>{ PERM_READ, 'View All Records' };
        for (Id permissionSetId : enabled.get(permissionName)) {
          sources.add(
            impliedSource(
              containers.get(permissionSetId),
              systemPermissions.getLabel(permissionName),
              granted
            )
          );
        }
      }
    } else if (entityType == AccessExplorerModels.EntityType.FIELD) {
      for (
        ObjectPermissions permission : selector.getObjectPermissions(
          containers.keySet(),
          validateFieldKey(entityKey).substringBefore('.')
        )
      ) {
        if (permission.PermissionsViewAllFields) {
          sources.add(
            impliedSource(
              containers.get(permission.ParentId),
              VIEW_ALL_FIELDS_LABEL,
              new List<String>{ PERM_READ }
            )
          );
        }
      }
    }
    return sources;
  }

  private Set<Id> getImpliedGrantingIds(
    AccessExplorerModels.EntityType entityType,
    String entityKey
  ) {
    Set<Id> result = new Set<Id>();
    if (entityType == AccessExplorerModels.EntityType.SOBJECT_TYPE) {
      result.addAll(
        systemPermissions.getPermissionSetIdsWithPermission(
          SystemPermissionService.VIEW_ALL_DATA
        )
      );
      result.addAll(
        systemPermissions.getPermissionSetIdsWithPermission(
          SystemPermissionService.MODIFY_ALL_DATA
        )
      );
    } else if (entityType == AccessExplorerModels.EntityType.FIELD) {
      for (
        ObjectPermissions permission : selector.getObjectPermissions(
          null,
          validateFieldKey(entityKey).substringBefore('.')
        )
      ) {
        if (permission.PermissionsViewAllFields) {
          result.add(permission.ParentId);
        }
      }
    }
    return result;
  }

  private static AccessExplorerModels.AccessSource impliedSource(
    AccessExplorerModels.AccessSource container,
    String impliedBy,
    List<String> granted
  ) {
    AccessExplorerModels.AccessSource source = container.copy();
    source.impliedBy = impliedBy;
    source.grantedPermissions = granted;
    return source;
  }

  // ---------------------------------------------------------------------------------
  // User entity helpers
  // ---------------------------------------------------------------------------------

  private List<AccessExplorerModels.EntityItem> getUserObjects(
    Set<Id> permissionSetIds
  ) {
    Map<String, Set<String>> grantedByObject = new Map<String, Set<String>>();
    for (
      ObjectPermissions permission : selector.getObjectPermissions(
        permissionSetIds,
        null
      )
    ) {
      if (!grantedByObject.containsKey(permission.SobjectType)) {
        grantedByObject.put(permission.SobjectType, new Set<String>());
      }
      grantedByObject.get(permission.SobjectType)
        .addAll(getObjectPermissionLabels(permission));
    }
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    for (String objectName : grantedByObject.keySet()) {
      AccessExplorerModels.EntityItem item = new AccessExplorerModels.EntityItem(
        AccessExplorerModels.EntityType.SOBJECT_TYPE,
        objectName,
        AccessExplorerSchemaUtil.getObjectLabel(objectName),
        objectName
      );
      item.summary = String.join(
        orderObjectPermissionLabels(grantedByObject.get(objectName)),
        ', '
      );
      item.hasChildren = true;
      items.add(item);
    }
    return items;
  }

  private List<AccessExplorerModels.EntityItem> getUserSystemPermissions(
    Set<Id> permissionSetIds
  ) {
    Map<String, String> labels = systemPermissions.getPermissionLabels();
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    for (
      String permissionName : systemPermissions.getEnabledPermissions(
          permissionSetIds
        )
        .keySet()
    ) {
      AccessExplorerModels.EntityItem item = new AccessExplorerModels.EntityItem(
        AccessExplorerModels.EntityType.SYSTEM_PERMISSION,
        permissionName,
        labels.get(permissionName),
        permissionName
      );
      item.summary = PERM_ENABLED;
      items.add(item);
    }
    return items;
  }

  private List<AccessExplorerModels.EntityGroup> getUserSetupEntities(
    Set<Id> permissionSetIds
  ) {
    Map<String, AccessExplorerModels.EntityType> typeBySetupType = new Map<String, AccessExplorerModels.EntityType>();
    Map<AccessExplorerModels.EntityType, Set<String>> keysByType = new Map<AccessExplorerModels.EntityType, Set<String>>();
    for (
      AccessExplorerModels.EntityType entityType : AccessExplorerModels.SETUP_ENTITY_TYPES.keySet()
    ) {
      typeBySetupType.put(
        AccessExplorerModels.SETUP_ENTITY_TYPES.get(entityType),
        entityType
      );
      keysByType.put(entityType, new Set<String>());
    }
    for (
      SetupEntityAccess access : selector.getSetupEntityAccess(
        permissionSetIds,
        typeBySetupType.keySet(),
        null
      )
    ) {
      AccessExplorerModels.EntityType entityType = typeBySetupType.get(
        access.SetupEntityType
      );
      if (entityType != null) {
        keysByType.get(entityType).add(access.SetupEntityId);
      }
    }

    List<AccessExplorerModels.EntityGroup> groups = new List<AccessExplorerModels.EntityGroup>();
    for (
      AccessExplorerModels.EntityType entityType : AccessExplorerModels.EntityType.values()
    ) {
      if (!keysByType.containsKey(entityType)) {
        continue;
      }
      Set<String> keys = keysByType.get(entityType);
      List<AccessExplorerModels.EntityItem> items = keys.isEmpty()
        ? new List<AccessExplorerModels.EntityItem>()
        : nameResolver.resolve(entityType, keys).values();
      for (AccessExplorerModels.EntityItem item : items) {
        item.summary = PERM_ACCESS;
      }
      groups.add(new AccessExplorerModels.EntityGroup(entityType, items));
    }
    return groups;
  }

  private List<AccessExplorerModels.EntityItem> getUserTabs(
    Set<Id> permissionSetIds
  ) {
    Map<String, String> visibilityByTab = new Map<String, String>();
    for (
      PermissionSetTabSetting setting : selector.getTabSettings(
        permissionSetIds,
        null
      )
    ) {
      // "Visible" (DefaultOn) wins over "Available" (DefaultOff).
      if (visibilityByTab.get(setting.Name) != 'DefaultOn') {
        visibilityByTab.put(setting.Name, setting.Visibility);
      }
    }
    if (visibilityByTab.isEmpty()) {
      return new List<AccessExplorerModels.EntityItem>();
    }
    Map<String, AccessExplorerModels.EntityItem> resolved = nameResolver.resolve(
      AccessExplorerModels.EntityType.TAB,
      visibilityByTab.keySet()
    );
    for (String tabName : resolved.keySet()) {
      String visibility = visibilityByTab.get(tabName);
      resolved.get(tabName).summary = TAB_VISIBILITY_LABELS.containsKey(
          visibility
        )
        ? TAB_VISIBILITY_LABELS.get(visibility)
        : visibility;
    }
    return resolved.values();
  }

  // ---------------------------------------------------------------------------------
  // Entity search helpers
  // ---------------------------------------------------------------------------------

  private List<AccessExplorerModels.EntityItem> searchObjects(
    String searchTerm,
    Integer rowLimit
  ) {
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    for (
      SObject record : selector.searchRecords(
        EntityDefinition.SObjectType,
        new List<String>{ 'QualifiedApiName', 'Label' },
        'Label',
        new Map<String, Object>{
          'IsQueryable' => true,
          'IsCustomSetting' => false
        },
        searchTerm,
        rowLimit
      )
    ) {
      String apiName = (String) record.get('QualifiedApiName');
      if (isPermissionableObjectName(apiName)) {
        AccessExplorerModels.EntityItem item = new AccessExplorerModels.EntityItem(
          AccessExplorerModels.EntityType.SOBJECT_TYPE,
          apiName,
          (String) record.get('Label'),
          apiName
        );
        item.hasChildren = true;
        items.add(item);
      }
    }
    return items;
  }

  private List<AccessExplorerModels.EntityItem> searchFields(
    String objectName,
    String searchTerm,
    Integer rowLimit
  ) {
    String canonicalObject = validateObjectName(objectName);
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    for (
      Schema.DescribeFieldResult field : getPermissionableFields(
        canonicalObject
      )
    ) {
      if (
        String.isBlank(searchTerm) ||
        field.getLabel().containsIgnoreCase(searchTerm) ||
        field.getName().containsIgnoreCase(searchTerm)
      ) {
        items.add(
          new AccessExplorerModels.EntityItem(
            AccessExplorerModels.EntityType.FIELD,
            canonicalObject + '.' + field.getName(),
            field.getLabel(),
            field.getName()
          )
        );
      }
    }
    items.sort();
    return truncate(items, rowLimit);
  }

  @TestVisible
  private static Boolean isPermissionableObjectName(String apiName) {
    if (String.isBlank(apiName)) {
      return false;
    }
    String lower = apiName.toLowerCase();
    for (String suffix : NON_PERMISSIONABLE_SUFFIXES) {
      if (lower.endsWith(suffix)) {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------------

  /**
   * @return the user's current assignments as sources, keyed by the PermissionSet id
   *         that permission rows reference.
   */
  @TestVisible
  private Map<Id, AccessExplorerModels.AccessSource> getContainers(Id userId) {
    if (userId == null || userId.getSObjectType() != User.SObjectType) {
      throw new IllegalArgumentException('A valid user id is required.');
    }
    Map<Id, AccessExplorerModels.AccessSource> containers = new Map<Id, AccessExplorerModels.AccessSource>();
    for (
      PermissionSetAssignment assignment : selector.getAssignmentsForUser(
        userId
      )
    ) {
      containers.put(assignment.PermissionSetId, toSource(assignment));
    }
    return containers;
  }

  @TestVisible
  private static AccessExplorerModels.AccessSource toSource(
    PermissionSetAssignment assignment
  ) {
    PermissionSet permissionSet = assignment.PermissionSet;
    if (permissionSet != null && permissionSet.IsOwnedByProfile) {
      return new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PROFILE,
        permissionSet.ProfileId,
        permissionSet.Profile?.Name
      );
    }
    if (assignment.PermissionSetGroupId != null) {
      return new AccessExplorerModels.AccessSource(
        AccessExplorerModels.SOURCE_PERMISSION_SET_GROUP,
        assignment.PermissionSetGroupId,
        assignment.PermissionSetGroup?.MasterLabel
      );
    }
    AccessExplorerModels.AccessSource source = new AccessExplorerModels.AccessSource(
      AccessExplorerModels.SOURCE_PERMISSION_SET,
      assignment.PermissionSetId,
      permissionSet?.Label
    );
    source.isSessionBased = permissionSet?.HasActivationRequired == true;
    return source;
  }

  private Map<Id, List<PermissionSetGroupComponent>> getGroupComponents(
    Set<Id> groupIds
  ) {
    Map<Id, List<PermissionSetGroupComponent>> result = new Map<Id, List<PermissionSetGroupComponent>>();
    for (
      PermissionSetGroupComponent component : selector.getGroupComponents(
        groupIds
      )
    ) {
      // Muting permission sets also appear as components; they never grant access.
      if (
        component.PermissionSetId == null ||
        component.PermissionSetId.getSObjectType() != PermissionSet.SObjectType
      ) {
        continue;
      }
      if (!result.containsKey(component.PermissionSetGroupId)) {
        result.put(
          component.PermissionSetGroupId,
          new List<PermissionSetGroupComponent>()
        );
      }
      result.get(component.PermissionSetGroupId).add(component);
    }
    return result;
  }

  private static List<String> getObjectPermissionLabels(
    ObjectPermissions permission
  ) {
    List<String> labels = new List<String>();
    for (List<String> entry : OBJECT_PERMISSIONS) {
      if (permission.get(entry[0]) == true) {
        labels.add(entry[1]);
      }
    }
    return labels;
  }

  private static List<String> orderObjectPermissionLabels(Set<String> granted) {
    List<String> ordered = new List<String>();
    for (List<String> entry : OBJECT_PERMISSIONS) {
      if (granted.contains(entry[1])) {
        ordered.add(entry[1]);
      }
    }
    return ordered;
  }

  private static List<Schema.DescribeFieldResult> getPermissionableFields(
    String objectName
  ) {
    List<Schema.DescribeFieldResult> fields = new List<Schema.DescribeFieldResult>();
    for (
      Schema.SObjectField field : AccessExplorerSchemaUtil.getFieldMap(
          AccessExplorerSchemaUtil.getSObjectType(objectName)
        )
        .values()
    ) {
      Schema.DescribeFieldResult describe = field.getDescribe();
      if (describe.isPermissionable()) {
        fields.add(describe);
      }
    }
    return fields;
  }

  private static AccessExplorerModels.EntityItem toFieldItem(String fieldKey) {
    Schema.DescribeFieldResult describe = AccessExplorerSchemaUtil.describeField(
      fieldKey
    );
    String fieldName = fieldKey.substringAfter('.');
    return new AccessExplorerModels.EntityItem(
      AccessExplorerModels.EntityType.FIELD,
      fieldKey,
      describe == null ? fieldName : describe.getLabel(),
      describe == null ? fieldName : describe.getName()
    );
  }

  private static String validateObjectName(String objectName) {
    Schema.DescribeSObjectResult describe = AccessExplorerSchemaUtil.describeObject(
      objectName
    );
    if (describe == null) {
      throw new IllegalArgumentException('Unknown object.');
    }
    return describe.getName();
  }

  private static String validateFieldKey(String fieldKey) {
    Schema.DescribeFieldResult describe = AccessExplorerSchemaUtil.describeField(
      fieldKey
    );
    if (describe == null) {
      throw new IllegalArgumentException('Unknown field.');
    }
    return validateObjectName(fieldKey.substringBefore('.')) +
      '.' +
      describe.getName();
  }

  private static String requireKey(String key) {
    if (String.isBlank(key)) {
      throw new IllegalArgumentException('An entity key is required.');
    }
    return key.trim();
  }

  private static Id toIdOrNull(String value) {
    try {
      return String.isBlank(value) ? null : Id.valueOf(value.trim());
    } catch (StringException e) {
      return null;
    }
  }

  private static Integer normalizeUserLimit(Integer userLimit) {
    if (userLimit == null || userLimit < 1) {
      return DEFAULT_USER_LIMIT;
    }
    return Math.min(userLimit, MAX_USER_LIMIT);
  }

  private static List<AccessExplorerModels.EntityItem> truncate(
    List<AccessExplorerModels.EntityItem> items,
    Integer rowLimit
  ) {
    if (rowLimit == null || items.size() <= rowLimit) {
      return items;
    }
    List<AccessExplorerModels.EntityItem> result = new List<AccessExplorerModels.EntityItem>();
    for (Integer i = 0; i < rowLimit; i++) {
      result.add(items[i]);
    }
    return result;
  }
}
