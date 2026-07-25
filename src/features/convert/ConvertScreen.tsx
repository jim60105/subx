import { ConvertWizard } from "./ConvertWizard";

/**
 * The Convert feature screen: the three-step wizard built on `WizardShell`.
 *
 * The screen itself is a thin host; all of the flow lives in `ConvertWizard`
 * and its `useConvertWizard` state machine.
 */
export function ConvertScreen() {
  return <ConvertWizard />;
}
