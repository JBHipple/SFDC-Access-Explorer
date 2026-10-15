/**
 * Fluent, parameterized SOQL builder.
 *
 * Security guarantees:
 *  - Object and field identifiers (including relationship paths) are validated against
 *    the schema before they are written into the query. Unknown identifiers throw.
 *  - Values are never concatenated into the query; every value is passed as a bind
 *    variable through Database.queryWithBinds.
 *  - Queries always run in AccessLevel.USER_MODE so the platform enforces CRUD/FLS.
 *  - A LIMIT is always applied and capped at MAX_LIMIT.
 */
public inherited sharing class AccessExplorerQueryBuilder {
  @TestVisible
  private static final Integer MAX_LIMIT = 10000;
  @TestVisible
  private static final Integer DEFAULT_LIMIT = 200;
  private static final Integer MAX_RELATIONSHIP_DEPTH = 3;
  private static final Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>> RELATIONSHIP_CACHE = new Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>>();

  private final Schema.SObjectType objectType;
  private final List<String> selectFields = new List<String>();
  private final Set<String> selectFieldKeys = new Set<String>();
  private final List<String> conditions = new List<String>();
  private final Map<String, Object> binds = new Map<String, Object>();
  private final List<String> orderings = new List<String>();
  private Integer rowLimit = DEFAULT_LIMIT;

  public class QueryBuilderException extends Exception {
  }

  public AccessExplorerQueryBuilder(Schema.SObjectType objectType) {
    if (objectType == null) {
      throw new QueryBuilderException('An object type is required.');
    }
    this.objectType = objectType;
  }

  public AccessExplorerQueryBuilder selectField(String fieldPath) {
    String validated = validateFieldPath(fieldPath);
    if (selectFieldKeys.add(validated.toLowerCase())) {
      selectFields.add(validated);
    }
    return this;
  }

  public AccessExplorerQueryBuilder selectFields(List<String> fieldPaths) {
    for (String fieldPath : fieldPaths) {
      selectField(fieldPath);
    }
    return this;
  }

  public AccessExplorerQueryBuilder whereEquals(
    String fieldPath,
    Object value
  ) {
    return addComparison(fieldPath, '=', value);
  }

  public AccessExplorerQueryBuilder whereNotEquals(
    String fieldPath,
    Object value
  ) {
    return addComparison(fieldPath, '!=', value);
  }

  public AccessExplorerQueryBuilder whereGreaterThan(
    String fieldPath,
    Object value
  ) {
    return addComparison(fieldPath, '>', value);
  }

  /**
   * Adds "(field = null OR field > :value)". Useful for optional expiration dates.
   */
  public AccessExplorerQueryBuilder whereNullOrGreaterThan(
    String fieldPath,
    Object value
  ) {
    String field = validateFieldPath(fieldPath);
    conditions.add(
      '(' + field + ' = null OR ' + field + ' > :' + addBind(value) + ')'
    );
    return this;
  }

  /**
   * Adds "field IN :values". Accepts any Set or List supported by SOQL binding.
   */
  public AccessExplorerQueryBuilder whereIn(String fieldPath, Object values) {
    if (values == null) {
      throw new QueryBuilderException('IN values cannot be null.');
    }
    conditions.add(validateFieldPath(fieldPath) + ' IN :' + addBind(values));
    return this;
  }

  /**
   * Adds a "contains" LIKE filter. SOQL wildcard characters in the search term are
   * escaped so they are matched literally.
   */
  public AccessExplorerQueryBuilder whereContains(
    String fieldPath,
    String searchTerm
  ) {
    return whereAnyContains(new List<String>{ fieldPath }, searchTerm);
  }

  /**
   * Adds "(f1 LIKE :term OR f2 LIKE :term ...)" sharing a single bind variable.
   */
  public AccessExplorerQueryBuilder whereAnyContains(
    List<String> fieldPaths,
    String searchTerm
  ) {
    if (fieldPaths == null || fieldPaths.isEmpty()) {
      throw new QueryBuilderException('At least one field is required.');
    }
    String bindName = addBind('%' + escapeLike(searchTerm) + '%');
    List<String> parts = new List<String>();
    for (String fieldPath : fieldPaths) {
      parts.add(validateFieldPath(fieldPath) + ' LIKE :' + bindName);
    }
    conditions.add('(' + String.join(parts, ' OR ') + ')');
    return this;
  }

  public AccessExplorerQueryBuilder orderBy(String fieldPath) {
    orderings.add(validateFieldPath(fieldPath) + ' ASC NULLS LAST');
    return this;
  }

  public AccessExplorerQueryBuilder orderByDescending(String fieldPath) {
    orderings.add(validateFieldPath(fieldPath) + ' DESC NULLS LAST');
    return this;
  }

  public AccessExplorerQueryBuilder limitTo(Integer value) {
    if (value == null || value < 1) {
      throw new QueryBuilderException('Limit must be a positive number.');
    }
    rowLimit = Math.min(value, MAX_LIMIT);
    return this;
  }

  public String toSoql() {
    if (selectFields.isEmpty()) {
      selectField('Id');
    }
    String soql =
      'SELECT ' +
      String.join(selectFields, ', ') +
      ' FROM ' +
      objectType.getDescribe(SObjectDescribeOptions.DEFERRED).getName();
    if (!conditions.isEmpty()) {
      soql += ' WHERE ' + String.join(conditions, ' AND ');
    }
    if (!orderings.isEmpty()) {
      soql += ' ORDER BY ' + String.join(orderings, ', ');
    }
    return soql + ' LIMIT ' + rowLimit;
  }

  public Map<String, Object> getBinds() {
    return binds.clone();
  }

  public List<SObject> execute() {
    return Database.queryWithBinds(toSoql(), binds, AccessLevel.USER_MODE);
  }

  @TestVisible
  private static String escapeLike(String value) {
    if (value == null) {
      return '';
    }
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_');
  }

  private AccessExplorerQueryBuilder addComparison(
    String fieldPath,
    String operator,
    Object value
  ) {
    conditions.add(
      validateFieldPath(fieldPath) + ' ' + operator + ' :' + addBind(value)
    );
    return this;
  }

  private String addBind(Object value) {
    String bindName = 'bind' + binds.size();
    binds.put(bindName, value);
    return bindName;
  }

  /**
   * Validates a field or relationship path (e.g. "PermissionSet.Profile.Name") against
   * the schema and returns it in canonical form.
   */
  @TestVisible
  private String validateFieldPath(String fieldPath) {
    if (String.isBlank(fieldPath)) {
      throw new QueryBuilderException('A field name is required.');
    }
    List<String> segments = fieldPath.trim().split('\\.');
    if (segments.size() > MAX_RELATIONSHIP_DEPTH + 1) {
      throw new QueryBuilderException(
        'Relationship path is too deep: ' + fieldPath
      );
    }
    Schema.SObjectType currentType = objectType;
    List<String> canonical = new List<String>();
    for (Integer i = 0; i < segments.size(); i++) {
      Boolean isLast = i == segments.size() - 1;
      if (isLast) {
        Schema.SObjectField field = AccessExplorerSchemaUtil.getFieldMap(
            currentType
          )
          .get(segments[i].toLowerCase());
        if (field == null) {
          throw new QueryBuilderException('Unknown field: ' + fieldPath);
        }
        canonical.add(field.getDescribe().getName());
      } else {
        Schema.DescribeFieldResult relationship = findRelationship(
          currentType,
          segments[i]
        );
        if (relationship == null) {
          throw new QueryBuilderException('Unknown relationship: ' + fieldPath);
        }
        canonical.add(relationship.getRelationshipName());
        currentType = relationship.getReferenceTo()[0];
      }
    }
    return String.join(canonical, '.');
  }

  private static Schema.DescribeFieldResult findRelationship(
    Schema.SObjectType sObjectType,
    String relationshipName
  ) {
    if (!RELATIONSHIP_CACHE.containsKey(sObjectType)) {
      Map<String, Schema.DescribeFieldResult> relationships = new Map<String, Schema.DescribeFieldResult>();
      for (
        Schema.SObjectField field : AccessExplorerSchemaUtil.getFieldMap(
            sObjectType
          )
          .values()
      ) {
        Schema.DescribeFieldResult describe = field.getDescribe();
        if (
          describe.getRelationshipName() != null &&
          !describe.getReferenceTo().isEmpty()
        ) {
          relationships.put(
            describe.getRelationshipName().toLowerCase(),
            describe
          );
        }
      }
      RELATIONSHIP_CACHE.put(sObjectType, relationships);
    }
    return RELATIONSHIP_CACHE.get(sObjectType)
      .get(relationshipName.toLowerCase());
  }
}
