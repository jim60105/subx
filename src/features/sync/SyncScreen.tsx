import { SyncWizard } from "./SyncWizard";

/**
 * The Sync feature screen: the four-step wizard built on `WizardShell`.
 *
 * The screen itself is a thin host; all of the flow lives in `SyncWizard` and
 * its `useSyncWizard` state machine.
 */
export function SyncScreen() {
  return <SyncWizard />;
}
