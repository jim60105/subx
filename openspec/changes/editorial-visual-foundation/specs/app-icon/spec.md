# app-icon Delta

## ADDED Requirements

### Requirement: The mark's colours are brand constants declared in its source

The icon's colours SHALL be brand constants declared in its committed vector sources, not values derived from the UI theme tokens. The backplate SHALL be one two-stop brand gradient, identical in every source that draws a plate, and the foreground SHALL be pure white. The white foreground SHALL meet WCAG AA on every point of the plate, and the tile's edge SHALL stay distinguishable from the application's window backgrounds and the darkest chrome it ships against.

#### Scenario: Every icon source declares the same brand gradient

- **WHEN** the backplate gradient stops of the master source and of every other icon source that draws a plate are read from the files
- **THEN** each declares the same two opaque colour values in the same order, so re-tinting one source and forgetting another fails the test suite and names the drift

#### Scenario: The foreground clears WCAG AA against every point of the plate

- **WHEN** the contrast ratio between the icon's foreground colour and each of the backplate's gradient stops is computed from the source file
- **THEN** every ratio is at least 4.5:1

#### Scenario: The tile is distinguishable from the surfaces it sits on

- **WHEN** the contrast between the icon's outermost edge and the window background of each application theme, as declared in the token file, is computed
- **THEN** each is at least 3:1

#### Scenario: The tile edge survives the darkest chrome it ships against

- **WHEN** the icon's outermost edge is composited and measured against the darkest desktop chrome the icon is documented to land on, which is darker than either application base
- **THEN** the result is at least 3:1 — a bar the backplate colour alone does not clear, so the light inset rim that carries it cannot be thinned or deleted without failing the test suite

## REMOVED Requirements

### Requirement: The mark stays inside the product's declared brand palette

**Reason**: It tied the backplate to the `--accent-gradient-strong` theme token, which the editorial token set deletes (gradients are no longer part of the UI palette). Its scenario "The backplate gradient is the token gradient" cannot survive the token's removal, and a MODIFIED block cannot drop a scenario.

**Migration**: Superseded by "The mark's colours are brand constants declared in its source". The icon artwork is unchanged; its gradient becomes a brand constant checked for drift between sources, and the three contrast scenarios carry over with the window backgrounds read from the token file. Tests re-point their `@covers` annotations to the new requirement's IDs when the delta is synced.
