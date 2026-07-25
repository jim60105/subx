## MODIFIED Requirements

### Requirement: Dual light/dark themes with neon-gradient identity

The application SHALL provide a dark theme and a light theme sharing the official Rust programming language brand identity: Rust orange `#e05d26` → terracotta `#b7410e` gradient accents. The dark theme SHALL use the mdBook deep charcoal base `#141518` with glassmorphism-styled panels. All theme values SHALL be exposed as CSS custom properties so components never hard-code colors.

#### Scenario: Both themes render every shell screen

- **WHEN** the user views the home hub or any shell component in either theme
- **THEN** all text meets readable contrast against its background and accent elements use the shared gradient in both themes
