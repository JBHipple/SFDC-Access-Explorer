/**
 * Cached schema describe helpers. Centralizes describe calls so identifiers can be
 * validated before they are used in dynamic queries.
 */
public inherited sharing class AccessExplorerSchemaUtil {
  private static Map<String, Schema.SObjectType> globalDescribeCache;
  private static final Map<String, Schema.DescribeSObjectResult> OBJECT_DESCRIBE_CACHE = new Map<String, Schema.DescribeSObjectResult>();
  private static final Map<Schema.SObjectType, Map<String, Schema.SObjectField>> FIELD_MAP_CACHE = new Map<Schema.SObjectType, Map<String, Schema.SObjectField>>();

  private AccessExplorerSchemaUtil() {
  }

  public static Map<String, Schema.SObjectType> getGlobalDescribe() {
    if (globalDescribeCache == null) {
      globalDescribeCache = Schema.getGlobalDescribe();
    }
    return globalDescribeCache;
  }

  /**
   * @return the SObjectType for an API name, or null when the object does not exist.
   */
  public static Schema.SObjectType getSObjectType(String objectApiName) {
    if (String.isBlank(objectApiName)) {
      return null;
    }
    return getGlobalDescribe().get(objectApiName.trim().toLowerCase());
  }

  public static Boolean isValidObject(String objectApiName) {
    return getSObjectType(objectApiName) != null;
  }

  public static Schema.DescribeSObjectResult describeObject(
    String objectApiName
  ) {
    Schema.SObjectType objectType = getSObjectType(objectApiName);
    if (objectType == null) {
      return null;
    }
    String cacheKey = objectApiName.trim().toLowerCase();
    if (!OBJECT_DESCRIBE_CACHE.containsKey(cacheKey)) {
      OBJECT_DESCRIBE_CACHE.put(
        cacheKey,
        objectType.getDescribe(SObjectDescribeOptions.DEFERRED)
      );
    }
    return OBJECT_DESCRIBE_CACHE.get(cacheKey);
  }

  public static Map<String, Schema.SObjectField> getFieldMap(
    Schema.SObjectType objectType
  ) {
    if (!FIELD_MAP_CACHE.containsKey(objectType)) {
      FIELD_MAP_CACHE.put(
        objectType,
        objectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap()
      );
    }
    return FIELD_MAP_CACHE.get(objectType);
  }

  /**
   * @return the object label, or the API name when it cannot be described.
   */
  public static String getObjectLabel(String objectApiName) {
    Schema.DescribeSObjectResult describe = describeObject(objectApiName);
    return describe == null ? objectApiName : describe.getLabel();
  }

  /**
   * @return the field describe for a fully qualified field key (Object.Field), or null.
   */
  public static Schema.DescribeFieldResult describeField(String fieldKey) {
    if (String.isBlank(fieldKey) || !fieldKey.contains('.')) {
      return null;
    }
    Schema.SObjectType objectType = getSObjectType(
      fieldKey.substringBefore('.')
    );
    if (objectType == null) {
      return null;
    }
    Schema.SObjectField field = getFieldMap(objectType)
      .get(fieldKey.substringAfter('.').toLowerCase());
    return field == null ? null : field.getDescribe();
  }
}
