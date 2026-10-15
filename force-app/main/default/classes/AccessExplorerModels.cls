/**
 * Data transfer objects and constants shared by Access Explorer services and controllers.
 */
public inherited sharing class AccessExplorerModels {
  private AccessExplorerModels() {
  }

  public enum EntityType {
    SOBJECT_TYPE,
    FIELD,
    SYSTEM_PERMISSION,
    APEX_CLASS,
    APEX_PAGE,
    CUSTOM_PERMISSION,
    TAB,
    APP,
    CONNECTED_APP,
    FLOW,
    CUSTOM_METADATA
  }

  public static final String SOURCE_PROFILE = 'Profile';
  public static final String SOURCE_PERMISSION_SET = 'PermissionSet';
  public static final String SOURCE_PERMISSION_SET_GROUP = 'PermissionSetGroup';

  /** SetupEntityAccess.SetupEntityType value for each setup-entity based type. */
  public static final Map<EntityType, String> SETUP_ENTITY_TYPES = new Map<EntityType, String>{
    EntityType.APEX_CLASS => 'ApexClass',
    EntityType.APEX_PAGE => 'ApexPage',
    EntityType.CUSTOM_PERMISSION => 'CustomPermission',
    EntityType.APP => 'TabSet',
    EntityType.CONNECTED_APP => 'ConnectedApplication',
    EntityType.FLOW => 'FlowDefinition',
    EntityType.CUSTOM_METADATA => 'CustomEntityDefinition'
  };

  /** Display order and labels of entity groups. */
  public static final Map<EntityType, String> ENTITY_TYPE_LABELS = new Map<EntityType, String>{
    EntityType.SOBJECT_TYPE => 'Objects',
    EntityType.FIELD => 'Fields',
    EntityType.SYSTEM_PERMISSION => 'System Permissions',
    EntityType.APEX_CLASS => 'Apex Classes',
    EntityType.APEX_PAGE => 'Visualforce Pages',
    EntityType.CUSTOM_PERMISSION => 'Custom Permissions',
    EntityType.TAB => 'Tabs',
    EntityType.APP => 'Apps',
    EntityType.CONNECTED_APP => 'Connected Apps',
    EntityType.FLOW => 'Flows',
    EntityType.CUSTOM_METADATA => 'Custom Metadata & Settings'
  };

  /**
   * Parses an entity type name from the client against the enum allow-list.
   * @throws IllegalArgumentException when the name is not a known entity type.
   */
  public static EntityType parseEntityType(String value) {
    if (String.isNotBlank(value)) {
      for (EntityType candidate : EntityType.values()) {
        if (candidate.name() == value.trim().toUpperCase()) {
          return candidate;
        }
      }
    }
    throw new IllegalArgumentException('Unknown entity type.');
  }

  public class UserOption {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String username;
    @AuraEnabled
    public String profileName;
    @AuraEnabled
    public Boolean isActive;

    public UserOption(User record) {
      this.id = record.Id;
      this.name = record.Name;
      this.username = record.Username;
      this.profileName = record.Profile?.Name;
      this.isActive = record.IsActive;
    }
  }

  public class UserListResult {
    @AuraEnabled
    public List<UserOption> users = new List<UserOption>();
    @AuraEnabled
    public Boolean truncated = false;
  }

  public class EntityItem implements Comparable {
    @AuraEnabled
    public String entityType;
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String apiName;
    @AuraEnabled
    public String summary;
    @AuraEnabled
    public Boolean hasChildren = false;

    public EntityItem(
      EntityType entityType,
      String key,
      String label,
      String apiName
    ) {
      this.entityType = entityType.name();
      this.key = key;
      this.label = String.isBlank(label) ? apiName : label.trim();
      this.apiName = apiName;
    }

    public Integer compareTo(Object other) {
      String otherLabel = ((EntityItem) other).label;
      return (label == null ? '' : label.toLowerCase())
        .compareTo(otherLabel == null ? '' : otherLabel.toLowerCase());
    }
  }

  public class EntityGroup {
    @AuraEnabled
    public String entityType;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public List<EntityItem> items;

    public EntityGroup(EntityType entityType, List<EntityItem> items) {
      this.entityType = entityType.name();
      this.label = ENTITY_TYPE_LABELS.get(entityType);
      items.sort();
      this.items = items;
    }
  }

  public class AccessSource implements Comparable {
    @AuraEnabled
    public String sourceType;
    @AuraEnabled
    public Id recordId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public List<String> grantedPermissions = new List<String>();
    @AuraEnabled
    public List<String> viaComponents = new List<String>();
    @AuraEnabled
    public Boolean isSessionBased = false;
    /** Label of the permission that implies this access, when it is not granted directly. */
    @AuraEnabled
    public String impliedBy;

    public AccessSource(String sourceType, Id recordId, String name) {
      this.sourceType = sourceType;
      this.recordId = recordId;
      this.name = name;
    }

    public AccessSource copy() {
      AccessSource result = new AccessSource(sourceType, recordId, name);
      result.isSessionBased = isSessionBased;
      return result;
    }

    public Integer compareTo(Object other) {
      AccessSource that = (AccessSource) other;
      Integer typeOrder = typeRank(sourceType) - typeRank(that.sourceType);
      if (typeOrder != 0) {
        return typeOrder;
      }
      return (name == null ? '' : name.toLowerCase())
        .compareTo(that.name == null ? '' : that.name.toLowerCase());
    }

    private Integer typeRank(String type) {
      if (type == SOURCE_PROFILE) {
        return 0;
      }
      return type == SOURCE_PERMISSION_SET_GROUP ? 1 : 2;
    }
  }
}
