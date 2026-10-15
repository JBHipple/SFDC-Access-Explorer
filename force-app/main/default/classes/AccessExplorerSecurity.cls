/**
 * Authorization and input hygiene for Access Explorer entry points.
 */
public inherited sharing class AccessExplorerSecurity {
  public static final String CUSTOM_PERMISSION = 'Access_Explorer_User';
  public static final Integer MAX_SEARCH_LENGTH = 80;

  @TestVisible
  private static final String ACCESS_DENIED_MESSAGE = 'You do not have permission to use Access Explorer. Ask your administrator for the Access Explorer User permission set.';
  @TestVisible
  private static final String GENERIC_ERROR_MESSAGE = 'Access information could not be loaded. Try again, or contact your administrator if the problem continues.';

  @TestVisible
  private static Boolean canUseCache;

  public class AccessDeniedException extends Exception {
  }

  private AccessExplorerSecurity() {
  }

  /**
   * The running user needs the Access Explorer custom permission and View Setup and
   * Configuration (required to read permission metadata).
   */
  public static Boolean canUse() {
    if (canUseCache == null) {
      canUseCache =
        FeatureManagement.checkPermission(CUSTOM_PERMISSION) &&
        new AccessExplorerSelector()
          .userHasPermission(
            UserInfo.getUserId(),
            SystemPermissionService.VIEW_SETUP
          );
    }
    return canUseCache;
  }

  public static void assertCanUse() {
    if (!canUse()) {
      throw new AccessDeniedException(ACCESS_DENIED_MESSAGE);
    }
  }

  /**
   * Trims, length-caps and blanks-to-null a free-text search term.
   */
  public static String sanitizeSearchTerm(String searchTerm) {
    if (String.isBlank(searchTerm)) {
      return null;
    }
    return searchTerm.trim().left(MAX_SEARCH_LENGTH);
  }

  /**
   * Converts any exception into an AuraHandledException with a client-safe message.
   * Only messages we author (access denied, invalid input) are passed through.
   */
  public static AuraHandledException toClientException(Exception error) {
    String message = GENERIC_ERROR_MESSAGE;
    if (
      error instanceof AccessDeniedException ||
      error instanceof IllegalArgumentException
    ) {
      message = error.getMessage();
    }
    AuraHandledException clientError = new AuraHandledException(message);
    clientError.setMessage(message);
    return clientError;
  }
}
