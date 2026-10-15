# Access Explorer

An installable Salesforce package that shows admins **who can access what, and why**. Access comes from a user's profile, permission sets and permission set groups. Access Explorer reads those grants (`PermissionSetAssignment`, `ObjectPermissions`, `FieldPermissions`, `SetupEntityAccess`, `PermissionSetTabSetting` and the system permission fields on `PermissionSet`) and presents them in two tabs:

- **By User**: look up a user, then browse what they can access by category: objects (expand an object to see its fields), system permissions, Apex classes, Visualforce pages, custom permissions, tabs, apps, connected apps, flows, and custom metadata types and settings. Select an item to see which profile, permission sets or groups grant it.
- **By Entity**: pick an object, field, permission or setup entity to see every active user with access. Select a user to see where their access comes from.

Each tab is a three-pane layout sized to the window, with each pane scrolling on its own:

| Tab       | Left                   | Middle                                   | Right                |
| --------- | ---------------------- | ---------------------------------------- | -------------------- |
| By User   | Categories with counts | Items in the category, with a filter box | How the user gets it |
| By Entity | Entity type and search | Users with access                        | How the user gets it |

Each granting source links to its Setup page, which opens in a new window. Permission set groups list the component permission sets that contribute to the access. Access implied by broader permissions (View All Data, Modify All Data, View All Fields) is called out separately. Permissions appear as compact badges: R, C, E and D for Read, Create, Edit and Delete; VA for View All Records; MA for Modify All Records; VF for View All Fields. Hovering a badge shows the full name, and screen readers announce it.

Other features:

- **Cross-links:** go from an item to everyone who has it, or from a user in the By Entity tab to all of their access.
- **Fresh on reload:** the tab and selections are held in memory only, so reloading the page starts with nothing selected. Cross-links between tabs carry the current selection across.
- **Refresh:** the refresh button in the header reloads data after you change permissions in Setup.
- **Export and copy:** lists export to CSV, and the access sources can be copied as plain text for a ticket or email.

## Using it

1. Deploy the source and assign the **Access Explorer User** permission set. It grants the custom permission, View Setup and Configuration, Apex class access, and the app and tab.
2. Open the **Access Explorer** app or tab. The `accessExplorer` component can also be added to any App or Home page in Lightning App Builder.

## Architecture

| Layer                              | Classes                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Controllers (`with sharing`, thin) | `AccessExplorerUserController`, `AccessExplorerEntityController`                              |
| Services                           | `AccessGrantService` (core grant logic), `SystemPermissionService`, `SetupEntityNameResolver` |
| Data access                        | `IAccessExplorerSelector` / `AccessExplorerSelector`                                          |
| Query building                     | `AccessExplorerQueryBuilder`                                                                  |
| Support                            | `AccessExplorerSecurity`, `AccessExplorerModels`, `AccessExplorerSchemaUtil`                  |

Services take an `IAccessExplorerSelector` through their constructor. Unit tests inject `AccessExplorerSelectorStub`, and integration tests use the real selector.

LWC components: `accessExplorer` (the exposed container) → `accessExplorerUserView` / `accessExplorerEntityView`. These are built from `accessExplorerSearchList` (a reusable listbox), `accessExplorerEntityList`, `accessExplorerEntityPicker` and `accessExplorerSourceList`. Shared helpers live in `accessExplorerUtils`.

## Security model (AppExchange review)

- There are no SOQL string literals in production code. Every query goes through `AccessExplorerQueryBuilder`:
  - Object and field names, including relationship paths, are validated against the schema describe.
  - Every value is passed as a bind variable to `Database.queryWithBinds`.
  - Queries run in `AccessLevel.USER_MODE`.
  - A capped `LIMIT` is always applied.
- Every `@AuraEnabled` method checks `AccessExplorerSecurity.assertCanUse()` first. It requires the `Access_Explorer_User` custom permission and View Setup.
- Client input is validated against allow-lists: entity types against the enum, system permission names against the describe, and object and field names against the schema. Search terms are trimmed and capped in length.
- Errors reach the client as `AuraHandledException` with safe messages only. Internal details are never passed through.
- Classes declare their sharing, and there is no `without sharing` and no `global`. The UI builds links only from validated Salesforce Ids and never uses `innerHTML`.
- CSV exports neutralize spreadsheet formulas, guarding against CSV injection.

## Development

```bash
npm install
npm run lint                 # ESLint (LWC)
npm run test:unit:coverage   # Jest
npm run scan                 # Salesforce Code Analyzer (AppExchange + Recommended rules)
sf project deploy start -o <org>
sf apex run test -o <org> -l RunLocalTests --code-coverage -r human -w 20
```

### Packaging

`sfdx-project.json` already declares the `AccessExplorer` package directory. To build a managed 2GP:

1. Register a namespace and link it to your Dev Hub.
2. Set `namespace` in `sfdx-project.json`.
3. Run `sf package create --name AccessExplorer --package-type Managed --path force-app`.

The code doesn't hard-code a namespace anywhere.

### Known limitations

- Flows granted through `SetupEntityAccess` are referenced by FlowDefinition Ids (`300…`), which only the Tooling API can resolve. Flows whose name can't be resolved are listed by their Id. The same applies to any app missing from `AppMenuItem`.
- Each "By Entity" user list shows at most 500 active users. A notice appears when the list is truncated, and the search box narrows it.
