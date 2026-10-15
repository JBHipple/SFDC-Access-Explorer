/**
 * Resolves keys of setup entities (Apex classes, pages, custom permissions, apps,
 * connected apps, flows, custom metadata/settings and tabs) to display labels, and
 * provides searchable option lists for each type.
 */
public inherited sharing class SetupEntityNameResolver {
  private static final String CUSTOM_METADATA_SUFFIX = '__mdt';
  private static final String STANDARD_TAB_PREFIX = 'standard-';
  private static final Pattern ID_18_PATTERN = Pattern.compile(
    '^[a-zA-Z0-9]{18}$'
  );
  private static final Pattern ID_15_PATTERN = Pattern.compile(
    '^[a-zA-Z0-9]{15}$'
  );

  /**
   * Lookup objects whose describe lists NamespacePrefix even though SOQL rejects it.
   * TabDefinition names already include the namespace.
   */
  private static final Set<Schema.SObjectType> NO_NAMESPACE_COLUMN = new Set<Schema.SObjectType>{
    TabDefinition.SObjectType
  };

  /**
   * Types whose unresolvable keys are left out of resolve() results. Every profile
   * carries access rows for internal Salesforce apps that no API names and no user can
   * open; AppMenuItem lists every app in the org, so an app missing from it is unusable.
   */
  private static final Set<AccessExplorerModels.EntityType> OMIT_UNRESOLVED_TYPES = new Set<AccessExplorerModels.EntityType>{
    AccessExplorerModels.EntityType.APP
  };

  private final IAccessExplorerSelector selector;

  /** Describes how one entity type maps onto its lookup object. */
  private class LookupConfig {
    final Schema.SObjectType objectType;
    final String keyField;
    final String labelField;
    final String apiNameField;
    final Map<String, Object> filters;

    LookupConfig(
      Schema.SObjectType objectType,
      String keyField,
      String labelField,
      String apiNameField,
      Map<String, Object> filters
    ) {
      this.objectType = objectType;
      this.keyField = keyField;
      this.labelField = labelField;
      this.apiNameField = apiNameField;
      this.filters = filters;
    }

    List<String> fields() {
      List<String> result = new List<String>{
        keyField,
        labelField,
        apiNameField
      };
      if (
        !NO_NAMESPACE_COLUMN.contains(objectType) &&
        AccessExplorerSchemaUtil.getFieldMap(objectType)
          .containsKey('namespaceprefix')
      ) {
        result.add('NamespacePrefix');
      }
      return result;
    }
  }

  private static final Map<AccessExplorerModels.EntityType, LookupConfig> CONFIGS = new Map<AccessExplorerModels.EntityType, LookupConfig>{
    AccessExplorerModels.EntityType.APEX_CLASS => new LookupConfig(
      ApexClass.SObjectType,
      'Id',
      'Name',
      'Name',
      null
    ),
    AccessExplorerModels.EntityType.APEX_PAGE => new LookupConfig(
      ApexPage.SObjectType,
      'Id',
      'MasterLabel',
      'Name',
      null
    ),
    AccessExplorerModels.EntityType.CUSTOM_PERMISSION => new LookupConfig(
      CustomPermission.SObjectType,
      'Id',
      'MasterLabel',
      'DeveloperName',
      null
    ),
    AccessExplorerModels.EntityType.APP => new LookupConfig(
      AppMenuItem.SObjectType,
      'ApplicationId',
      'Label',
      'Name',
      new Map<String, Object>{ 'Type' => 'TabSet' }
    ),
    AccessExplorerModels.EntityType.CONNECTED_APP => new LookupConfig(
      ConnectedApplication.SObjectType,
      'Id',
      'Name',
      'Name',
      null
    ),
    AccessExplorerModels.EntityType.FLOW => new LookupConfig(
      FlowDefinitionView.SObjectType,
      'DurableId',
      'Label',
      'ApiName',
      null
    ),
    AccessExplorerModels.EntityType.CUSTOM_METADATA => new LookupConfig(
      EntityDefinition.SObjectType,
      'DurableId',
      'Label',
      'QualifiedApiName',
      null
    ),
    AccessExplorerModels.EntityType.TAB => new LookupConfig(
      TabDefinition.SObjectType,
      'Name',
      'Label',
      'Name',
      null
    )
  };

  public SetupEntityNameResolver() {
    this(new AccessExplorerSelector());
  }

  public SetupEntityNameResolver(IAccessExplorerSelector selector) {
    this.selector = selector;
  }

  public static Boolean supports(AccessExplorerModels.EntityType entityType) {
    return CONFIGS.containsKey(entityType);
  }

  /**
   * @return entity items keyed by the requested key. Keys that cannot be resolved
   *         (e.g. deleted or hidden metadata) fall back to the key as the label,
   *         except unusable apps, which are omitted (see OMIT_UNRESOLVED_TYPES).
   */
  public Map<String, AccessExplorerModels.EntityItem> resolve(
    AccessExplorerModels.EntityType entityType,
    Set<String> keys
  ) {
    Map<String, AccessExplorerModels.EntityItem> result = new Map<String, AccessExplorerModels.EntityItem>();
    LookupConfig config = getConfig(entityType);
    List<SObject> records = new List<SObject>();
    Boolean lookupSucceeded = true;
    try {
      records = selector.getRecordsByKeys(
        config.objectType,
        config.keyField,
        config.fields(),
        keys
      );
    } catch (QueryException e) {
      // Some lookup objects are unavailable in certain editions or to some users;
      // fall back to showing raw keys rather than failing the whole request.
      records = new List<SObject>();
      lookupSucceeded = false;
    }
    for (SObject record : records) {
      AccessExplorerModels.EntityItem item = toItem(entityType, config, record);
      result.put(normalizeKey(item.key), item);
    }
    Map<String, AccessExplorerModels.EntityItem> byRequestedKey = new Map<String, AccessExplorerModels.EntityItem>();
    for (String key : keys) {
      AccessExplorerModels.EntityItem item = result.get(normalizeKey(key));
      if (
        item == null &&
        lookupSucceeded &&
        OMIT_UNRESOLVED_TYPES.contains(entityType)
      ) {
        continue;
      }
      byRequestedKey.put(
        key,
        item != null
          ? item
          : new AccessExplorerModels.EntityItem(
              entityType,
              key,
              fallbackLabel(entityType, key),
              key
            )
      );
    }
    return byRequestedKey;
  }

  /**
   * Label for a key the lookup object does not return. Standard tabs for features that
   * are not fully enabled are missing from TabDefinition but have readable names
   * ("standard-AIPredictionScore"), so those get a derived label.
   */
  @TestVisible
  private static String fallbackLabel(
    AccessExplorerModels.EntityType entityType,
    String key
  ) {
    if (
      entityType == AccessExplorerModels.EntityType.TAB &&
      key.startsWith(STANDARD_TAB_PREFIX) &&
      key.length() > STANDARD_TAB_PREFIX.length()
    ) {
      String objectName = key.substringAfter(STANDARD_TAB_PREFIX);
      Schema.DescribeSObjectResult describe = AccessExplorerSchemaUtil.describeObject(
        objectName
      );
      return describe != null
        ? describe.getLabelPlural()
        : splitCamelCase(objectName);
    }
    return key;
  }

  /** "AIPredictionScore" becomes "AI Prediction Score". */
  private static String splitCamelCase(String value) {
    return value.replaceAll('([A-Z]+)([A-Z][a-z])', '$1 $2')
      .replaceAll('([a-z0-9])([A-Z])', '$1 $2');
  }

  public List<AccessExplorerModels.EntityItem> search(
    AccessExplorerModels.EntityType entityType,
    String searchTerm,
    Integer rowLimit
  ) {
    LookupConfig config = getConfig(entityType);
    List<SObject> records;
    if (entityType == AccessExplorerModels.EntityType.CUSTOM_METADATA) {
      records = searchCustomMetadataAndSettings(config, searchTerm, rowLimit);
    } else {
      records = selector.searchRecords(
        config.objectType,
        config.fields(),
        config.labelField,
        config.filters,
        searchTerm,
        rowLimit
      );
    }
    List<AccessExplorerModels.EntityItem> items = new List<AccessExplorerModels.EntityItem>();
    for (SObject record : records) {
      items.add(toItem(entityType, config, record));
    }
    items.sort();
    return items;
  }

  private List<SObject> searchCustomMetadataAndSettings(
    LookupConfig config,
    String searchTerm,
    Integer rowLimit
  ) {
    List<SObject> records = new List<SObject>(
      selector.searchRecords(
        config.objectType,
        config.fields(),
        config.labelField,
        new Map<String, Object>{ 'IsCustomSetting' => true },
        searchTerm,
        rowLimit
      )
    );
    Set<String> metadataTypeNames = new Set<String>();
    for (
      String objectName : AccessExplorerSchemaUtil.getGlobalDescribe().keySet()
    ) {
      if (
        objectName.endsWith(CUSTOM_METADATA_SUFFIX) &&
        (String.isBlank(searchTerm) ||
        objectName.containsIgnoreCase(searchTerm))
      ) {
        metadataTypeNames.add(objectName);
      }
    }
    records.addAll(
      selector.getRecordsByKeys(
        config.objectType,
        'QualifiedApiName',
        config.fields(),
        metadataTypeNames
      )
    );
    return records;
  }

  private static AccessExplorerModels.EntityItem toItem(
    AccessExplorerModels.EntityType entityType,
    LookupConfig config,
    SObject record
  ) {
    String apiName = (String) record.get(config.apiNameField);
    if (config.fields().contains('NamespacePrefix')) {
      String namespace = (String) record.get('NamespacePrefix');
      if (String.isNotBlank(namespace) && !apiName.contains('__')) {
        apiName = namespace + '__' + apiName;
      }
    }
    return new AccessExplorerModels.EntityItem(
      entityType,
      String.valueOf(record.get(config.keyField)),
      (String) record.get(config.labelField),
      apiName
    );
  }

  private static LookupConfig getConfig(
    AccessExplorerModels.EntityType entityType
  ) {
    LookupConfig config = CONFIGS.get(entityType);
    if (config == null) {
      throw new IllegalArgumentException('Entity type is not a setup entity.');
    }
    return config;
  }

  /** Ids may arrive in 15 or 18 character form; compare on the 15 character prefix. */
  @TestVisible
  private static String normalizeKey(String key) {
    if (key == null) {
      return null;
    }
    if (ID_18_PATTERN.matcher(key).matches()) {
      return key.left(15);
    }
    return ID_15_PATTERN.matcher(key).matches() ? key : key.toLowerCase();
  }
}
